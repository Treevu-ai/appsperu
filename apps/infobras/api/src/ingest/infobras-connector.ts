import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import unzipper from "unzipper";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { TITLE_ROWS, HEADER_ROWS } from "./columns.js";
import { normalizeInfobrasRows } from "./normalize.js";

const DATASETS_URL = "https://infobras.contraloria.gob.pe/InfobrasWeb/DataSets";
const DOWNLOAD_HREF_RE = /href=["']([^"']*\/Archivo\/DownloadFile\?[^"']*filename=DataSet-Obras-Publicas(?:%20|\s)[^"']*)["']/i;

const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 3000;
const FETCH_TIMEOUT_MS = 120_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function downloadWithCurl(url: string, destPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      "curl",
      ["-sL", "--connect-timeout", "60", "--max-time", "600", "-o", destPath, url],
      { stdio: "ignore" }
    );
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`curl devolvió código ${code ?? "desconocido"}`));
    });
  });
}

/**
 * INFOBRAS cambia diariamente el nombre de su export (por ejemplo,
 * `DataSet-Obras-Publicas 24-08-2026`). El endpoint sin fecha devuelve 200
 * con JSON { error: "No existe el archivo" }, que antes terminaba siendo un
 * `FILE_ENDED` poco explicativo al intentar abrirlo como XLSX.
 */
async function fetchDatasetsHtml(): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      if (attempt <= 3) {
        const page = await fetch(DATASETS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!page.ok) throw new Error(`INFOBRAS devolvió ${page.status} al consultar Datos Abiertos`);
        return await page.text();
      }
      const tmpPage = `${tmpdir()}/infobras-datasets-${Date.now()}.html`;
      await downloadWithCurl(DATASETS_URL, tmpPage);
      const { readFile } = await import("node:fs/promises");
      const html = await readFile(tmpPage, "utf8");
      await rm(tmpPage, { force: true });
      return html;
    } catch (err) {
      lastError = err;
      if (attempt < MAX_ATTEMPTS) await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
    }
  }
  throw new Error(
    `No se pudo leer página de INFOBRAS tras ${MAX_ATTEMPTS} intentos: ${
      lastError instanceof Error ? lastError.message : lastError
    }`
  );
}

async function currentDownloadUrl(): Promise<string> {
  const html = await fetchDatasetsHtml();
  const match = DOWNLOAD_HREF_RE.exec(html);
  if (!match) throw new Error("INFOBRAS no publicó un enlace vigente para el dataset de Obras Públicas");
  return new URL(match[1].replaceAll("&amp;", "&"), DATASETS_URL).toString();
}

/**
 * Descarga el XLSX de INFOBRAS a un archivo temporal (no en memoria — el
 * archivo pesa ~57MB y hay que leerlo en streaming después). Confirmado en
 * vivo que el servidor puede responder 503 a mitad de transferencia bajo
 * archivos grandes — no es un error definitivo, se reintenta con backoff.
 */
export async function downloadInfobrasXlsx(destPath: string): Promise<void> {
  let lastError: unknown;
  const url = await currentDownloadUrl();

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      if (attempt <= 3) {
        const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if (!res.ok || !res.body) {
          throw new Error(`INFOBRAS devolvió ${res.status} al descargar el dataset`);
        }
        const contentType = res.headers.get("content-type")?.toLowerCase() ?? "";
        if (contentType.includes("application/json") || contentType.includes("text/html")) {
          const detail = (await res.text()).slice(0, 240);
          throw new Error(`INFOBRAS no entregó un XLSX (${contentType}): ${detail}`);
        }
        const fileStream = createWriteStream(destPath);
        await new Promise<void>((resolve, reject) => {
          const nodeStream = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
          nodeStream.pipe(fileStream);
          nodeStream.on("error", reject);
          fileStream.on("finish", resolve);
          fileStream.on("error", reject);
        });
      } else {
        await downloadWithCurl(url, destPath);
      }
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
  /** @deprecated Usa `departamentos` cuando el corte incluye más de una región. */
  departamento?: string;
  departamentos?: readonly string[];
  filePath?: string; // para tests / reingesta sin volver a descargar
}

export const PERU_DEPARTAMENTOS = ["AMAZONAS", "ANCASH", "APURIMAC", "AREQUIPA", "AYACUCHO", "CAJAMARCA", "CALLAO", "CUSCO", "HUANCAVELICA", "HUANUCO", "ICA", "JUNIN", "LA LIBERTAD", "LAMBAYEQUE", "LIMA", "LORETO", "MADRE DE DIOS", "MOQUEGUA", "PASCO", "PIURA", "PUNO", "SAN MARTIN", "TACNA", "TUMBES", "UCAYALI"] as const;
export const DEFAULT_TERRITORIAL_SCOPE = PERU_DEPARTAMENTOS;

export function normalizeDepartamentoScope(
  departamento?: string,
  departamentos?: readonly string[]
): string[] {
  const values = departamentos ?? (departamento ? [departamento] : []);
  const normalized = [...new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean))];
  const unsupported = normalized.filter((value) => !PERU_DEPARTAMENTOS.includes(value as typeof PERU_DEPARTAMENTOS[number]));
  if (unsupported.length) throw new Error(`Departamento(s) fuera del catálogo territorial peruano: ${unsupported.join(", ")}`);
  return normalized;
}

export function parseDepartamentoScope(raw?: string): string[] {
  return raw
    ? normalizeDepartamentoScope(undefined, raw.split(","))
    : [...DEFAULT_TERRITORIAL_SCOPE];
}

async function recordTerritorialCoverage(input: {
  departamentos: readonly string[];
  allRows: string[][];
  normalized: Array<{ departamento: string }>;
  rejected: Array<{ raw: unknown }>;
  batchId: number;
}): Promise<void> {
  for (const departamento of input.departamentos) {
    const sourceRecords = input.allRows.filter((row) => (row[29] ?? "").toUpperCase().trim() === departamento).length;
    const normalizedRecords = input.normalized.filter((row) => row.departamento.toUpperCase() === departamento).length;
    const rejectedRecords = input.rejected.filter((row) => Array.isArray(row.raw) && String(row.raw[29] ?? "").toUpperCase().trim() === departamento).length;
    await ejecucionPool.query(
      `INSERT INTO territorial_coverage
        (app_name,source_name,jurisdiction_code,requested,source_records,normalized_records,persisted_records,rejected_records,completeness,source_batch_ref,cutoff_at,restriction,dependencies)
       SELECT 'infobras','INFOBRAS_OBRAS_PUBLICAS',code,true,$2,$3,$3,$4,
              CASE WHEN $2=0 THEN 'SIN_DATOS_EN_FUENTE' ELSE 'COMPLETA_VERIFICADA' END,
              $5,now(),$6,'[]'::jsonb
       FROM territorial_jurisdictions WHERE name=$1`,
      [departamento, sourceRecords, normalizedRecords, rejectedRecords, `infobras:${input.batchId}`,
        'El corte describe el XLSX público recorrido; no certifica el universo externo fuera de la fuente expuesta.']
    );
  }
}

export async function ingestInfobrasPublicWorks(options: IngestOptions = {}): Promise<IngestSummary> {
  const { departamento, departamentos } = options;

  let tempDir: string | undefined;
  let filePath = options.filePath;
  if (!filePath) {
    tempDir = await mkdtemp(path.join(tmpdir(), "infobras-"));
    filePath = path.join(tempDir, "DataSet-Obras-Publicas.xlsx");
    await downloadInfobrasXlsx(filePath);
  }

  try {
    const [checksum, allRows] = await Promise.all([checksumOf(filePath), readInfobrasRows(filePath)]);

    const wantedDepartamentos = new Set(normalizeDepartamentoScope(departamento, departamentos));
    const filteredRows = wantedDepartamentos.size > 0
      ? allRows.filter((r) => wantedDepartamentos.has((r[29] ?? "").toUpperCase().trim()))
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

      if (wantedDepartamentos.size > 0) {
        await recordTerritorialCoverage({
          departamentos: [...wantedDepartamentos], allRows, normalized: rows, rejected, batchId,
        });
      }

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
  const departamentos = process.env.INFOBRAS_DEPARTAMENTOS
    ? parseDepartamentoScope(process.env.INFOBRAS_DEPARTAMENTOS)
    : process.env.INFOBRAS_DEPARTAMENTO
      ? normalizeDepartamentoScope(process.env.INFOBRAS_DEPARTAMENTO)
      : parseDepartamentoScope();

  ingestInfobrasPublicWorks({ departamentos })
    .then((summary) => {
      console.log("Ingesta de INFOBRAS completada:", summary);
      return Promise.all([pool.end(), ejecucionPool.end()]);
    })
    .catch((err) => {
      console.error("Ingesta falló:", err);
      process.exit(1);
    });
}
