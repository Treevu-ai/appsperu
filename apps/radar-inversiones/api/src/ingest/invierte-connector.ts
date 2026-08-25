import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { ejecucionPool } from "../db/ejecucion-pool.js";
import { normalizeInvestmentRows, type CanonicalInvestmentRow, type RejectedInvestment } from "./normalize.js";

const FILE_URL = "https://fs.datosabiertos.mef.gob.pe/datastorefiles/DETALLE_INVERSIONES.csv";

/**
 * El archivo completo pesa ~246MB (confirmado en vivo el 2026-08-17) — mucho
 * menor que el CSV de presupuesto (6-10GB), pero igual se corta por defecto
 * vía Range para no arriesgar cargarlo entero en memoria sin necesidad.
 */
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;
const INSERT_BATCH_SIZE = 500;

async function fetchRange(start: number, end: number): Promise<string> {
  const res = await fetch(FILE_URL, { headers: { Range: `bytes=${start}-${end}` } });
  if (!res.ok && res.status !== 206) {
    throw new Error(`MEF devolvió ${res.status} al pedir bytes=${start}-${end}`);
  }
  return res.text();
}

/**
 * Descarga un prefijo del CSV de inversiones vía HTTP Range. Mismo patrón
 * que `mef-connector.ts` de radar-ejecucion: cuando `startByte` > 0, el
 * header se pide aparte y se antepone; la primera/última línea del rango de
 * datos se descartan por si quedaron cortadas a la mitad.
 */
export async function fetchInvestmentsCsv(
  maxBytes: number = DEFAULT_MAX_BYTES,
  startByte = 0
): Promise<{ rows: Record<string, unknown>[]; rawText: string }> {
  let headerLine = "";
  if (startByte > 0) {
    const headerChunk = await fetchRange(0, 4095);
    headerLine = headerChunk.slice(0, headerChunk.indexOf("\n"));
  }

  let text = await fetchRange(startByte, startByte + maxBytes - 1);

  const lastNewline = text.lastIndexOf("\n");
  if (lastNewline > 0) text = text.slice(0, lastNewline);

  if (startByte > 0) {
    const firstNewline = text.indexOf("\n");
    if (firstNewline > 0) text = text.slice(firstNewline + 1);
    text = `${headerLine}\n${text}`;
  }

  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, unknown>[];

  return { rows, rawText: text };
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function saveRawBatch(client: PoolClient, query: string, rawText: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_investment_batches (query, checksum, record_count, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [query, checksumOf(rawText), recordCount, JSON.stringify({ csv: rawText })]
  );
  return result.rows[0].id;
}

export interface IngestOptions {
  maxBytes?: number;
  startByte?: number;
  /** @deprecated Usa `departamentos` cuando el corte incluye más de una región. */
  departamento?: string;
  departamentos?: readonly string[];
}

async function persistInvestmentRows(client: PoolClient, rows: readonly CanonicalInvestmentRow[], batchId: number): Promise<void> {
  for (let start = 0; start < rows.length; start += INSERT_BATCH_SIZE) {
    const payload = rows.slice(start, start + INSERT_BATCH_SIZE).map((row) => ({
      cui: row.cui, codigo_snip: row.codigoSnip, nombre: row.nombre, sec_ejec: row.secEjec,
      nombre_uep: row.nombreUep, entidad: row.entidad, sector: row.sector, nivel: row.nivel,
      estado: row.estado, situacion: row.situacion, ubigeo: row.ubigeo, departamento: row.departamento,
      provincia: row.provincia, distrito: row.distrito, monto_viable: row.montoViable,
      costo_actualizado: row.costoActualizado, funcion: row.funcion, tipo_inversion: row.tipoInversion,
      fecha_registro: row.fechaRegistro, fecha_viabilidad: row.fechaViabilidad,
    }));
    await client.query(
      `INSERT INTO investments
         (cui,codigo_snip,nombre,sec_ejec,nombre_uep,entidad,sector,nivel,estado,situacion,ubigeo,departamento,provincia,distrito,monto_viable,costo_actualizado,funcion,tipo_inversion,fecha_registro,fecha_viabilidad,source_batch_id)
       SELECT x.cui,x.codigo_snip,x.nombre,x.sec_ejec,x.nombre_uep,x.entidad,x.sector,x.nivel,x.estado,x.situacion,x.ubigeo,x.departamento,x.provincia,x.distrito,x.monto_viable,x.costo_actualizado,x.funcion,x.tipo_inversion,
              CASE WHEN x.fecha_registro ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN x.fecha_registro::date ELSE NULL END,
              CASE WHEN x.fecha_viabilidad ~ '^\\d{4}-\\d{2}-\\d{2}$' THEN x.fecha_viabilidad::date ELSE NULL END,
              $2
       FROM jsonb_to_recordset($1::jsonb) AS x(
         cui text,codigo_snip text,nombre text,sec_ejec text,nombre_uep text,entidad text,sector text,nivel text,estado text,situacion text,ubigeo text,departamento text,provincia text,distrito text,monto_viable numeric,costo_actualizado numeric,funcion text,tipo_inversion text,fecha_registro text,fecha_viabilidad text)
       ON CONFLICT (cui) DO UPDATE SET estado=EXCLUDED.estado,situacion=EXCLUDED.situacion,monto_viable=EXCLUDED.monto_viable,costo_actualizado=EXCLUDED.costo_actualizado,source_batch_id=EXCLUDED.source_batch_id`,
      [JSON.stringify(payload), batchId]
    );
  }
}

async function persistRejectedRows(client: PoolClient, rejected: readonly RejectedInvestment[], batchId: number): Promise<void> {
  for (let start = 0; start < rejected.length; start += INSERT_BATCH_SIZE) {
    const payload = rejected.slice(start, start + INSERT_BATCH_SIZE).map((bad) => ({ raw_row: bad.raw, reason: bad.reason }));
    await client.query(
      `INSERT INTO investments_rejected (source_batch_id,raw_row,reason)
       SELECT $2,x.raw_row,x.reason FROM jsonb_to_recordset($1::jsonb) AS x(raw_row jsonb,reason text)`,
      [JSON.stringify(payload), batchId]
    );
  }
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
  fetched: Record<string, unknown>[];
  normalized: Array<{ departamento: string | null }>;
  rejected: Array<{ raw: unknown }>;
  batchId: number;
  completeFile: boolean;
}): Promise<void> {
  for (const departamento of input.departamentos) {
    const sourceRecords = input.fetched.filter((row) => String(row.DEPARTAMENTO ?? "").toUpperCase().trim() === departamento).length;
    const normalizedRecords = input.normalized.filter((row) => row.departamento?.toUpperCase() === departamento).length;
    const rejectedRecords = input.rejected.filter((row) => !Array.isArray(row.raw) && String((row.raw as Record<string, unknown>).DEPARTAMENTO ?? "").toUpperCase().trim() === departamento).length;
    await ejecucionPool.query(
      `INSERT INTO territorial_coverage
        (app_name,source_name,jurisdiction_code,requested,source_records,normalized_records,persisted_records,rejected_records,completeness,source_batch_ref,cutoff_at,restriction,dependencies)
       SELECT 'radar-inversiones','INVIERTE_DETALLE_INVERSIONES',code,true,$2,$3,$3,$4,
              CASE WHEN $5 AND $2=0 THEN 'SIN_DATOS_EN_FUENTE'
                   WHEN $5 THEN 'COMPLETA_VERIFICADA'
                   ELSE 'PARCIAL' END,
              $6,now(),$7,'[]'::jsonb
       FROM territorial_jurisdictions WHERE name=$1`,
      [departamento, sourceRecords, normalizedRecords, rejectedRecords, input.completeFile, `invierte:${input.batchId}`,
        'La cobertura es parcial mientras los rangos no demuestren continuidad hasta el Content-Length del archivo publicado.']
    );
  }
}

export interface IngestSummary {
  batchId: number;
  totalFetched: number;
  accepted: number;
  skippedOtherDepartamento: number;
  rejected: number;
  isPartial: boolean;
}

export async function ingestInvestments(options: IngestOptions = {}): Promise<IngestSummary> {
  const { maxBytes = DEFAULT_MAX_BYTES, startByte = 0, departamento, departamentos } = options;
  const wantedDepartamentos = new Set(normalizeDepartamentoScope(departamento, departamentos));

  const { rows: fetchedRecords, rawText } = await fetchInvestmentsCsv(maxBytes, startByte);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, `range:${startByte}-${startByte + maxBytes}`, rawText, fetchedRecords.length);

    const records = wantedDepartamentos.size > 0
      ? fetchedRecords.filter((r) => wantedDepartamentos.has(String(r["DEPARTAMENTO"] ?? "").toUpperCase().trim()))
      : fetchedRecords;
    const skippedOtherDepartamento = fetchedRecords.length - records.length;

    const { rows, rejected } = normalizeInvestmentRows(records);

    await persistInvestmentRows(client, rows, batchId);
    await persistRejectedRows(client, rejected, batchId);

    await client.query("COMMIT");

    if (wantedDepartamentos.size > 0) {
      await recordTerritorialCoverage({
        departamentos: [...wantedDepartamentos], fetched: fetchedRecords, normalized: rows, rejected, batchId, completeFile: false,
      });
    }

    return {
      batchId,
      totalFetched: fetchedRecords.length,
      accepted: rows.length,
      skippedOtherDepartamento,
      rejected: rejected.length,
      isPartial: true,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const maxBytes = process.env.INVIERTE_MAX_BYTES ? Number(process.env.INVIERTE_MAX_BYTES) : undefined;
  const startByte = process.env.INVIERTE_START_BYTE ? Number(process.env.INVIERTE_START_BYTE) : undefined;
  const departamentos = process.env.INVIERTE_DEPARTAMENTOS
    ? parseDepartamentoScope(process.env.INVIERTE_DEPARTAMENTOS)
    : process.env.INVIERTE_DEPARTAMENTO
      ? normalizeDepartamentoScope(process.env.INVIERTE_DEPARTAMENTO)
      : parseDepartamentoScope();

  ingestInvestments({ maxBytes, startByte, departamentos })
    .then((summary) => {
      console.log("Ingesta completada:", summary);
      console.warn(
        "AVISO: esta es una ingesta PARCIAL (rango de bytes acotado). No cubre el archivo completo de inversiones."
      );
      return Promise.all([pool.end(), ejecucionPool.end()]);
    })
    .catch((err) => {
      console.error("Ingesta falló:", err);
      process.exit(1);
    });
}
