import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import unzipper from "unzipper";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { TITLE_ROWS, HEADER_ROWS } from "./columns.js";
import { normalizeInfobrasRows } from "./normalize.js";

const DOWNLOAD_URL =
  "https://infobras.contraloria.gob.pe/InfobrasWeb/Archivo/DownloadFile" +
  "?filename=DataSet-Obras-Publicas&name=DataSet-Obras-Publicas" +
  "&contentType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet&extension=.xlsx";

const MAX_ATTEMPTS = 4;
const BASE_BACKOFF_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Descarga el XLSX de INFOBRAS a un archivo temporal (no en memoria — el
 * archivo pesa ~57MB y hay que leerlo en streaming después). Confirmado en
 * vivo que el servidor puede responder 503 a mitad de transferencia bajo
 * archivos grandes — no es un error definitivo, se reintenta con backoff.
 */
export async function downloadInfobrasXlsx(destPath: string): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(DOWNLOAD_URL);
      if (!res.ok || !res.body) {
        throw new Error(`INFOBRAS devolvió ${res.status} al descargar el dataset`);
      }
      const fileStream = createWriteStream(destPath);
      await new Promise<void>((resolve, reject) => {
        const nodeStream = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
        nodeStream.pipe(fileStream);
        nodeStream.on("error", reject);
        fileStream.on("finish", resolve);
        fileStream.on("error", reject);
      });
      return;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
      }
    }
  }

  throw new Error(
    `Descarga de INFOBRAS falló tras ${MAX_ATTEMPTS} intentos: ${lastError instanceof Error ? lastError.message : lastError}`
  );
}

const ROW_RE = /<x:row>(.*?)<\/x:row>/gs;
const CELL_RE = /<x:v>(.*?)<\/x:v>/gs;
const SKIP_ROWS = TITLE_ROWS + HEADER_ROWS;

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

/**
 * Parsea el sheet en streaming, por regex sobre el XML crudo, en vez de un
 * parser XLSX estándar (ExcelJS, `xlsx`). Confirmado en vivo: el sheet real
 * de INFOBRAS usa el prefijo de namespace `x:` en cada etiqueta
 * (`<x:row>`, `<x:c>`, `<x:v>`) en vez del namespace por defecto sin
 * prefijo — ExcelJS's WorkbookReader busca `row`/`c` sin prefijo y no
 * reconoce ninguna fila contra este archivo real (probado: 0 filas leídas).
 * El archivo descomprime a ~726MB de XML — cargarlo completo en memoria
 * cuelga el proceso, así que se procesa en streaming por xl/worksheets
 * directamente desde el zip, sin escribirlo a disco aparte.
 */
export async function readInfobrasRows(filePath: string): Promise<string[][]> {
  const directory = await unzipper.Open.file(filePath);
  const sheetEntry = directory.files.find((f) => f.path === "xl/worksheets/sheet1.xml");
  if (!sheetEntry) {
    throw new Error("El archivo XLSX de INFOBRAS no tiene xl/worksheets/sheet1.xml — formato inesperado.");
  }

  const rows: string[][] = [];
  let leftover = "";
  let rowIndex = 0;

  for await (const chunk of sheetEntry.stream()) {
    const text = leftover + (chunk as Buffer).toString("utf-8");
    let lastEnd = 0;
    ROW_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ROW_RE.exec(text)) !== null) {
      rowIndex += 1;
      lastEnd = ROW_RE.lastIndex;
      if (rowIndex <= SKIP_ROWS) continue;

      const cells: string[] = [];
      CELL_RE.lastIndex = 0;
      let cellMatch: RegExpExecArray | null;
      while ((cellMatch = CELL_RE.exec(match[1])) !== null) {
        cells.push(decodeXmlEntities(cellMatch[1]));
      }
      rows.push(cells);
    }
    leftover = text.slice(lastEnd);
  }

  return rows;
}

function checksumOf(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk: string | Buffer) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

async function saveRawBatch(client: PoolClient, checksum: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_infobras_batches (filename, checksum, record_count)
     VALUES ($1, $2, $3)
     RETURNING id`,
    ["DataSet-Obras-Publicas.xlsx", checksum, recordCount]
  );
  return result.rows[0].id;
}

export interface IngestSummary {
  batchId: number;
  totalFetched: number;
  accepted: number;
  skippedOtherDepartamento: number;
  rejected: number;
  isPartial: boolean;
}

export interface IngestOptions {
  departamento?: string;
  filePath?: string; // para tests / reingesta sin volver a descargar
}

export async function ingestInfobrasPublicWorks(options: IngestOptions = {}): Promise<IngestSummary> {
  const { departamento } = options;

  let tempDir: string | undefined;
  let filePath = options.filePath;
  if (!filePath) {
    tempDir = await mkdtemp(path.join(tmpdir(), "infobras-"));
    filePath = path.join(tempDir, "DataSet-Obras-Publicas.xlsx");
    await downloadInfobrasXlsx(filePath);
  }

  try {
    const [checksum, allRows] = await Promise.all([checksumOf(filePath), readInfobrasRows(filePath)]);

    const wantedDepartamento = departamento?.toUpperCase().trim();
    const filteredRows = wantedDepartamento
      ? allRows.filter((r) => (r[29] ?? "").toUpperCase().trim() === wantedDepartamento)
      : allRows;
    const skippedOtherDepartamento = allRows.length - filteredRows.length;

    const { rows, rejected } = normalizeInfobrasRows(filteredRows);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const batchId = await saveRawBatch(client, checksum, allRows.length);

      for (const row of rows) {
        await client.query(
          `INSERT INTO public_works
             (codigo_infobras, codigo_entidad, entidad_nombre, nombre_obra, modalidad_ejecucion,
              naturaleza_obra, estado_ejecucion, nivel_gobierno, sector_entidad, cui, codigo_snip,
              nombre_inversion, monto_viable, costo_actualizado, departamento, provincia, distrito,
              costo_expediente_tecnico, avance_fisico_prog_pct, avance_fisico_real_pct,
              valorizacion_prog, valorizacion_ejecutada, ejecucion_financiera_pct,
              existe_paralizacion, causal_paralizacion, fecha_paralizacion, dias_paralizado,
              monto_devengado_total, source_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
           ON CONFLICT (codigo_infobras) DO UPDATE SET
             codigo_entidad = EXCLUDED.codigo_entidad,
             entidad_nombre = EXCLUDED.entidad_nombre,
             nombre_obra = EXCLUDED.nombre_obra,
             modalidad_ejecucion = EXCLUDED.modalidad_ejecucion,
             naturaleza_obra = EXCLUDED.naturaleza_obra,
             estado_ejecucion = EXCLUDED.estado_ejecucion,
             nivel_gobierno = EXCLUDED.nivel_gobierno,
             sector_entidad = EXCLUDED.sector_entidad,
             cui = EXCLUDED.cui,
             codigo_snip = EXCLUDED.codigo_snip,
             nombre_inversion = EXCLUDED.nombre_inversion,
             monto_viable = EXCLUDED.monto_viable,
             costo_actualizado = EXCLUDED.costo_actualizado,
             departamento = EXCLUDED.departamento,
             provincia = EXCLUDED.provincia,
             distrito = EXCLUDED.distrito,
             costo_expediente_tecnico = EXCLUDED.costo_expediente_tecnico,
             avance_fisico_prog_pct = EXCLUDED.avance_fisico_prog_pct,
             avance_fisico_real_pct = EXCLUDED.avance_fisico_real_pct,
             valorizacion_prog = EXCLUDED.valorizacion_prog,
             valorizacion_ejecutada = EXCLUDED.valorizacion_ejecutada,
             ejecucion_financiera_pct = EXCLUDED.ejecucion_financiera_pct,
             existe_paralizacion = EXCLUDED.existe_paralizacion,
             causal_paralizacion = EXCLUDED.causal_paralizacion,
             fecha_paralizacion = EXCLUDED.fecha_paralizacion,
             dias_paralizado = EXCLUDED.dias_paralizado,
             monto_devengado_total = EXCLUDED.monto_devengado_total,
             source_batch_id = EXCLUDED.source_batch_id`,
          [
            row.codigoInfobras,
            row.codigoEntidad,
            row.entidadNombre,
            row.nombreObra,
            row.modalidadEjecucion,
            row.naturalezaObra,
            row.estadoEjecucion,
            row.nivelGobierno,
            row.sectorEntidad,
            row.cui,
            row.codigoSnip,
            row.nombreInversion,
            row.montoViable,
            row.costoActualizado,
            row.departamento,
            row.provincia,
            row.distrito,
            row.costoExpedienteTecnico,
            row.avanceFisicoProgPct,
            row.avanceFisicoRealPct,
            row.valorizacionProg,
            row.valorizacionEjecutada,
            row.ejecucionFinancieraPct,
            row.existeParalizacion,
            row.causalParalizacion,
            row.fechaParalizacion,
            row.diasParalizado,
            row.montoDevengadoTotal,
            batchId,
          ]
        );
      }

      for (const bad of rejected) {
        await client.query(
          `INSERT INTO public_works_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
          [batchId, JSON.stringify(bad.raw), bad.reason]
        );
      }

      await client.query("COMMIT");

      return {
        batchId,
        totalFetched: allRows.length,
        accepted: rows.length,
        skippedOtherDepartamento,
        rejected: rejected.length,
        isPartial: false,
      };
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } finally {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const departamento = process.env.INFOBRAS_DEPARTAMENTO;

  ingestInfobrasPublicWorks({ departamento })
    .then((summary) => {
      console.log("Ingesta de INFOBRAS completada:", summary);
      return pool.end();
    })
    .catch((err) => {
      console.error("Ingesta falló:", err);
      process.exit(1);
    });
}
