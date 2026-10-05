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
import { normalizeInfobrasRows, type CanonicalPublicWorkRow, type RejectedPublicWork } from "./normalize.js";

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

/**
 * Insertaba una fila por `await client.query(...)` — contra Postgres local
 * (latencia ~0) tardaba segundos; contra Neon por red, cada fila paga una
 * ida y vuelta completa: 9,476 filas (4 departamentos chicos) tardaron más
 * de una hora sin terminar, verificado en vivo 2026-10-05. El ingest
 * nacional completo (191,180 filas) a ese ritmo son horas con una
 * transacción abierta todo ese tiempo — frágil contra una conexión remota.
 *
 * `UPSERT_CHUNK_SIZE` filas por INSERT multi-fila en vez de una por una:
 * 30 columnas × 500 filas = 15,000 parámetros, bajo el límite de 65,535 de
 * Postgres. Reduce ~191,180 round-trips a ~383.
 */
const UPSERT_CHUNK_SIZE = 500;

export const PUBLIC_WORKS_COLUMNS = [
  "codigo_infobras", "codigo_entidad", "entidad_nombre", "nombre_obra", "modalidad_ejecucion",
  "naturaleza_obra", "estado_ejecucion", "nivel_gobierno", "sector_entidad", "cui", "codigo_snip",
  "nombre_inversion", "monto_viable", "costo_actualizado", "departamento", "provincia", "distrito",
  "distrito_sospechoso", "costo_expediente_tecnico", "avance_fisico_prog_pct",
  "avance_fisico_real_pct", "valorizacion_prog", "valorizacion_ejecutada",
  "ejecucion_financiera_pct", "existe_paralizacion", "causal_paralizacion",
  "fecha_paralizacion", "dias_paralizado", "monto_devengado_total", "source_batch_id",
] as const;

const PUBLIC_WORKS_UPDATE_SET = PUBLIC_WORKS_COLUMNS
  .filter((column) => column !== "codigo_infobras")
  .map((column) => `${column} = EXCLUDED.${column}`)
  .join(",\n       ");

export function publicWorksRowValues(row: CanonicalPublicWorkRow, batchId: number): unknown[] {
  return [
    row.codigoInfobras, row.codigoEntidad, row.entidadNombre, row.nombreObra, row.modalidadEjecucion,
    row.naturalezaObra, row.estadoEjecucion, row.nivelGobierno, row.sectorEntidad, row.cui, row.codigoSnip,
    row.nombreInversion, row.montoViable, row.costoActualizado, row.departamento, row.provincia, row.distrito,
    row.distritoSospechoso, row.costoExpedienteTecnico, row.avanceFisicoProgPct,
    row.avanceFisicoRealPct, row.valorizacionProg, row.valorizacionEjecutada,
    row.ejecucionFinancieraPct, row.existeParalizacion, row.causalParalizacion,
    row.fechaParalizacion, row.diasParalizado, row.montoDevengadoTotal, batchId,
  ];
}

/** `($1,$2,...,$N),($N+1,...)` — un grupo de placeholders por fila del chunk. */
export function valuesPlaceholders(rowCount: number, colCount: number): string {
  const groups: string[] = [];
  for (let r = 0; r < rowCount; r++) {
    const base = r * colCount;
    const cols: string[] = [];
    for (let c = 0; c < colCount; c++) cols.push(`$${base + c + 1}`);
    groups.push(`(${cols.join(",")})`);
  }
  return groups.join(",\n       ");
}

/**
 * Un `codigo_infobras` repetido dentro del mismo chunk hacía que Postgres
 * rechazara el INSERT multi-fila completo: `ON CONFLICT DO UPDATE` no puede
 * afectar la misma fila dos veces en una sola instrucción (SQLSTATE 21000).
 * El loop anterior, fila por fila, toleraba duplicados sin problema (ganaba
 * la última) — hallazgo de code review (Copilot en PR #239). Se deduplica
 * aquí, no en el llamador, para que la garantía viva donde está el riesgo
 * real (el límite es por INSERT, no por chunk en abstracto). Conserva la
 * última aparición, igual que el loop secuencial que reemplaza.
 */
function dedupeByCodigoInfobras(chunk: readonly CanonicalPublicWorkRow[]): CanonicalPublicWorkRow[] {
  const porCodigo = new Map<string, CanonicalPublicWorkRow>();
  for (const row of chunk) porCodigo.set(row.codigoInfobras, row);
  return [...porCodigo.values()];
}

export async function upsertPublicWorksChunk(
  client: PoolClient,
  chunk: readonly CanonicalPublicWorkRow[],
  batchId: number
): Promise<void> {
  if (chunk.length === 0) return;
  const filas = dedupeByCodigoInfobras(chunk);
  const params = filas.flatMap((row) => publicWorksRowValues(row, batchId));
  await client.query(
    `INSERT INTO public_works (${PUBLIC_WORKS_COLUMNS.join(", ")})
     VALUES ${valuesPlaceholders(filas.length, PUBLIC_WORKS_COLUMNS.length)}
     ON CONFLICT (codigo_infobras) DO UPDATE SET
       ${PUBLIC_WORKS_UPDATE_SET}`,
    params
  );
}

export async function insertRejectedChunk(
  client: PoolClient,
  chunk: readonly RejectedPublicWork[],
  batchId: number
): Promise<void> {
  if (chunk.length === 0) return;
  const params = chunk.flatMap((bad) => [batchId, JSON.stringify(bad.raw), bad.reason]);
  await client.query(
    `INSERT INTO public_works_rejected (source_batch_id, raw_row, reason)
     VALUES ${valuesPlaceholders(chunk.length, 3)}`,
    params
  );
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

/**
 * El XLSX nacional de INFOBRAS etiqueta la provincia constitucional del
 * Callao como "P C DEL CALLAO" (confirmado en vivo, 2026-09-08, CT-06) en
 * vez del nombre canónico "CALLAO" del catálogo territorial. Sin este alias,
 * sus 1,471 obras caían en "otro departamento" y el corte nacional nunca
 * podía cerrar como completo. Se normaliza una sola vez, en el punto donde
 * se lee la columna, para que el filtro de scope, el normalizador y el
 * conteo de cobertura vean siempre el nombre canónico.
 */
const DEPARTAMENTO_ALIASES_FUENTE: Record<string, string> = {
  "P C DEL CALLAO": "CALLAO",
};

export function canonicalizarDepartamentoFuente(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().toUpperCase();
  return DEPARTAMENTO_ALIASES_FUENTE[trimmed] ?? trimmed;
}

/**
 * Provincias reales de ICA que la fuente etiqueta con `departamento =
 * "HUANCAVELICA"` — DQ-19, verificado en vivo 2026-10-05: 889 obras (NASCA/NAZCA
 * 330, CHINCHA 324, PISCO 208, PALPA 27) cuyo `nombre_obra` confirma Ica sin
 * ambigüedad (ej. "...EL INGENIO NASCA", "CENTRAL EÓLICA PARQUE NAZCA 126 MW").
 * A diferencia del alias de Callao arriba, esto no es un nombre no canónico de
 * un departamento real: la columna `departamento` del XLSX está directamente
 * mal para estas filas. "NAZCA" se normaliza a "NASCA" (grafía oficial INEI,
 * la misma que usa el catálogo territorial de `ceplan-geo`).
 */
const PROVINCIAS_ICA_ETIQUETADAS_COMO_HUANCAVELICA = new Set(["NAZCA", "NASCA", "CHINCHA", "PISCO", "PALPA"]);

/**
 * `provincia = "ANDAHUAYLAS"` (provincia real, pero de Apurímac) bajo
 * `departamento = "ANCASH"` — verificado en vivo 2026-10-05: 113 obras cuyos
 * distritos (PUEBLO LIBRE, CARAZ, PAMPAROMAS, HUALLANCA, MATO, SANTO TORIBIO,
 * SANTA CRUZ, YURACMARCA, HUATA, HUAYLAS) son exactamente los 10 distritos
 * reales de la provincia HUAYLAS de Áncash — incluida la única fila cuyo
 * propio `distrito` repite el mismo valor corrupto, cuyo `nombre_obra` dice
 * explícitamente "...DISTRITO DE HUAYLAS HUAYLAS ANCASH". El `departamento`
 * está bien; solo la `provincia` vino corrupta de la fuente.
 */
const PROVINCIA_HUAYLAS_CORROMPIDA = "ANDAHUAYLAS";

/**
 * Corrige errores de geografía de la fuente verificados 1:1 contra
 * `nombre_obra` y el catálogo territorial — no una heurística: cada caso es
 * un patrón 100% consistente, confirmado en la ingesta real completa (ver
 * docs/TICKETS_Calidad_Datos_Auditoria_La_Libertad_v1.md, DQ-19/DQ-20).
 * Devuelve `null` si la fila no matchea ningún caso conocido.
 *
 * Recibe `distrito` además de `provincia`: la única fila cuyo propio
 * `distrito` repite el mismo valor corrupto ("ANDAHUAYLAS") también debe
 * corregirse a "HUAYLAS" — dejarla con un distrito que ya sabemos que está
 * mal (aunque quede marcado `distrito_sospechoso`) deja la corrección a
 * medias (hallazgo de code review, Copilot en PR #237).
 */
export function corregirGeografiaFuente(
  departamento: string,
  provincia: string,
  distrito: string
): { departamento: string; provincia: string; distrito: string } | null {
  if (departamento === "HUANCAVELICA" && PROVINCIAS_ICA_ETIQUETADAS_COMO_HUANCAVELICA.has(provincia)) {
    return { departamento: "ICA", provincia: provincia === "NAZCA" ? "NASCA" : provincia, distrito };
  }
  if (departamento === "ANCASH" && provincia === PROVINCIA_HUAYLAS_CORROMPIDA) {
    return {
      departamento,
      provincia: "HUAYLAS",
      distrito: distrito === PROVINCIA_HUAYLAS_CORROMPIDA ? "HUAYLAS" : distrito,
    };
  }
  return null;
}

/**
 * Aplica el alias de Callao y `corregirGeografiaFuente` a cada fila cruda,
 * en ese orden — extraído a función propia (hallazgo de code review,
 * CodeRabbit + Copilot en PR #237) para poder probar el pipeline real
 * (corrección → filtro de scope → normalización) sin mockear I/O de archivo
 * ni de base de datos, en vez de solo `corregirGeografiaFuente` aislada.
 */
export function construirFilasCanonicas(rawRows: string[][]): string[][] {
  return rawRows.map((row) => {
    const canonical = [...row];
    canonical[29] = canonicalizarDepartamentoFuente(row[29]);
    const corregido = corregirGeografiaFuente(
      canonical[29],
      (row[30] ?? "").trim().toUpperCase(),
      (row[31] ?? "").trim().toUpperCase()
    );
    if (corregido) {
      canonical[29] = corregido.departamento;
      canonical[30] = corregido.provincia;
      canonical[31] = corregido.distrito;
    }
    return canonical;
  });
}

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
    const [checksum, rawRows] = await Promise.all([checksumOf(filePath), readInfobrasRows(filePath)]);
    // Alias de Callao + corrección de geografía (DQ-19/DQ-20): debe ocurrir
    // antes del filtro de scope por departamento, para que una fila de Ica
    // mal etiquetada como Huancavelica cuente para el departamento real, no
    // para el declarado.
    const allRows = construirFilasCanonicas(rawRows);

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

      for (let i = 0; i < rows.length; i += UPSERT_CHUNK_SIZE) {
        await upsertPublicWorksChunk(client, rows.slice(i, i + UPSERT_CHUNK_SIZE), batchId);
      }

      for (let i = 0; i < rejected.length; i += UPSERT_CHUNK_SIZE) {
        await insertRejectedChunk(client, rejected.slice(i, i + UPSERT_CHUNK_SIZE), batchId);
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

  const filePath = process.env.INFOBRAS_XLSX_PATH?.trim() || undefined;
  if (filePath) {
    console.log(`Usando XLSX local: ${filePath}`);
  }

  ingestInfobrasPublicWorks({ departamentos, filePath })
    .then((summary) => {
      console.log("Ingesta de INFOBRAS completada:", summary);
      return Promise.all([pool.end(), ejecucionPool.end()]);
    })
    .catch((err) => {
      console.error("Ingesta falló:", err);
      process.exit(1);
    });
}
