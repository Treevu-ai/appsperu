import { createHash } from "node:crypto";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Seven from "node-7z";
import sevenBin from "7zip-bin";
import ExcelJS from "exceljs";
import { pool } from "../db/pool.js";
import {
  confirmSheetYear,
  extract7zUrlFromLandingPage,
  extractDistritoRows,
  extractYearLinksFromListing,
  findHeaderRow,
  pickLatestYearLink,
  sheetNameForYear,
} from "./mtpe-distrital-parse.js";

/**
 * Mismo WAF (CloudWAF) que datosabiertos.gob.pe — gob.pe también devuelve
 * HTTP 418 al user-agent por defecto de fetch (confirmado en vivo con
 * WebFetch durante la investigación de ADR-0021 addendum).
 */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const LISTING_URL = "https://www2.trabajo.gob.pe/estadisticas/ind-lab-a-nivel-distrital/";

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MTPE devolvió ${res.status} al pedir ${url}`);
  }
  return res.text();
}

async function resolveLatestResource(): Promise<{ year: number; url7z: string }> {
  const listingHtml = await fetchText(LISTING_URL);
  const latest = pickLatestYearLink(extractYearLinksFromListing(listingHtml));

  const landingHtml = await fetchText(latest.url);
  const url7z = extract7zUrlFromLandingPage(landingHtml);
  if (!url7z) {
    throw new Error(`No se encontró un enlace .7z en la publicación de MTPE: ${latest.url}`);
  }

  return { year: latest.year, url7z };
}

function checksumOf(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export interface MtpeDistritalIngestSummary {
  resourceUrl: string;
  anio: number;
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasSinUbigeo: number;
}

export async function ingestMtpeDistrital(): Promise<MtpeDistritalIngestSummary> {
  const { year, url7z } = await resolveLatestResource();

  const res = await fetch(url7z, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MTPE devolvió ${res.status} al descargar ${url7z}`);
  }
  const archiveBuffer = Buffer.from(await res.arrayBuffer());

  const workDir = await mkdtemp(path.join(tmpdir(), "mtpe-distrital-"));
  try {
    const archivePath = path.join(workDir, "indicadores.7z");
    await writeFile(archivePath, archiveBuffer);

    const extractDir = path.join(workDir, "extracted");
    await new Promise<void>((resolve, reject) => {
      const stream = Seven.extractFull(archivePath, extractDir, { $bin: sevenBin.path7za });
      stream.on("end", () => resolve());
      stream.on("error", (err: unknown) => reject(err instanceof Error ? err : new Error(String(err))));
    });

    const extractedFiles = await readdir(extractDir);
    const xlsxFile = extractedFiles.find((f) => f.toLowerCase().endsWith(".xlsx"));
    if (!xlsxFile) {
      throw new Error(`El archivo .7z de MTPE no contenía ningún .xlsx. Archivos encontrados: ${extractedFiles.join(", ") || "(ninguno)"}`);
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(path.join(extractDir, xlsxFile));

    const sheetName = sheetNameForYear(year);
    const worksheet = workbook.getWorksheet(sheetName);
    if (!worksheet) {
      throw new Error(
        `No se encontró la hoja "${sheetName}" en el archivo. Hojas disponibles: ${workbook.worksheets.map((w) => w.name).join(", ")}`
      );
    }

    if (!confirmSheetYear(worksheet, year)) {
      throw new Error(`La hoja "${sheetName}" no menciona el año ${year} en sus primeras filas — no se confía en el nombre de la hoja solo.`);
    }

    const headerRowIndex = findHeaderRow(worksheet);
    const distritoRows = extractDistritoRows(worksheet, headerRowIndex);

    const checksum = checksumOf(archiveBuffer);
    const metaClient = await pool.connect();
    let batchId: number;
    try {
      const batchResult = await metaClient.query<{ id: number }>(
        `INSERT INTO raw_mtpe_batches (resource_url, checksum, record_count)
         VALUES ($1, $2, $3)
         ON CONFLICT (resource_url, checksum) DO UPDATE SET fetched_at = now()
         RETURNING id`,
        [url7z, checksum, distritoRows.length]
      );
      batchId = batchResult.rows[0].id;
    } finally {
      metaClient.release();
    }

    // Commits por lote de distritos (no una transacción única para hasta
    // 18,120 filas = 1,510 distritos x 12 meses) -- una sola conexión
    // Postgres sostenida por un insert fila-por-fila así de largo terminó en
    // "Connection terminated unexpectedly" en vivo (confirmado 2026-10-01,
    // mismo patrón visto en ONPE/OSITRAN/RENAMU).
    const DISTRITOS_POR_LOTE = 100;
    let inserted = 0;
    let sinUbigeo = 0;
    for (let i = 0; i < distritoRows.length; i += DISTRITOS_POR_LOTE) {
        const slice = distritoRows.slice(i, i + DISTRITOS_POR_LOTE);
        const client = await pool.connect();
        try {
          await client.query("BEGIN");
          for (const row of slice) {
            if (!row.ubigeo) {
              sinUbigeo += 1;
              continue;
            }
            for (let mesIdx = 0; mesIdx < 12; mesIdx += 1) {
              const mes = mesIdx + 1;
              const numeroEmpresas = row.valoresPorMes[mesIdx];
              await client.query(
                `INSERT INTO empresas_privadas_distrito (ubigeo, anio, mes, distrito, numero_empresas, source_batch_id, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6, now())
                 ON CONFLICT (ubigeo, anio, mes) DO UPDATE SET
                   distrito = EXCLUDED.distrito,
                   numero_empresas = EXCLUDED.numero_empresas,
                   source_batch_id = EXCLUDED.source_batch_id,
                   updated_at = now()`,
                [row.ubigeo, year, mes, row.distrito, numeroEmpresas, batchId]
              );
            }
            inserted += 1;
          }
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        } finally {
          client.release();
        }
      }
      return {
        resourceUrl: url7z,
        anio: year,
        batchId,
        filasOrigen: distritoRows.length,
        filasInsertadas: inserted,
        filasSinUbigeo: sinUbigeo,
      };
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestMtpeDistrital()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
