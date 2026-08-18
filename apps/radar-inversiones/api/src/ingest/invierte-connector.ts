import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeInvestmentRows } from "./normalize.js";

const FILE_URL = "https://fs.datosabiertos.mef.gob.pe/datastorefiles/DETALLE_INVERSIONES.csv";

/**
 * El archivo completo pesa ~246MB (confirmado en vivo el 2026-08-17) — mucho
 * menor que el CSV de presupuesto (6-10GB), pero igual se corta por defecto
 * vía Range para no arriesgar cargarlo entero en memoria sin necesidad.
 */
const DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

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
  departamento?: string;
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
  const { maxBytes = DEFAULT_MAX_BYTES, startByte = 0, departamento } = options;
  const wantedDepartamento = departamento?.toUpperCase().trim();

  const { rows: fetchedRecords, rawText } = await fetchInvestmentsCsv(maxBytes, startByte);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, `range:${startByte}-${startByte + maxBytes}`, rawText, fetchedRecords.length);

    const records = wantedDepartamento
      ? fetchedRecords.filter(
          (r) => String(r["DEPARTAMENTO"] ?? "").toUpperCase().trim() === wantedDepartamento
        )
      : fetchedRecords;
    const skippedOtherDepartamento = fetchedRecords.length - records.length;

    const { rows, rejected } = normalizeInvestmentRows(records);

    for (const row of rows) {
      await client.query(
        `INSERT INTO investments
           (cui, codigo_snip, nombre, sec_ejec, nombre_uep, entidad, sector, nivel, estado,
            situacion, ubigeo, departamento, provincia, distrito, monto_viable,
            costo_actualizado, funcion, tipo_inversion, fecha_registro, fecha_viabilidad,
            source_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
         ON CONFLICT (cui) DO UPDATE
           SET estado = EXCLUDED.estado,
               situacion = EXCLUDED.situacion,
               monto_viable = EXCLUDED.monto_viable,
               costo_actualizado = EXCLUDED.costo_actualizado,
               source_batch_id = EXCLUDED.source_batch_id`,
        [
          row.cui,
          row.codigoSnip,
          row.nombre,
          row.secEjec,
          row.nombreUep,
          row.entidad,
          row.sector,
          row.nivel,
          row.estado,
          row.situacion,
          row.ubigeo,
          row.departamento,
          row.provincia,
          row.distrito,
          row.montoViable,
          row.costoActualizado,
          row.funcion,
          row.tipoInversion,
          row.fechaRegistro,
          row.fechaViabilidad,
          batchId,
        ]
      );
    }

    for (const bad of rejected) {
      await client.query(
        `INSERT INTO investments_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
        [batchId, JSON.stringify(bad.raw), bad.reason]
      );
    }

    await client.query("COMMIT");

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
  const departamento = process.env.INVIERTE_DEPARTAMENTO;

  ingestInvestments({ maxBytes, startByte, departamento })
    .then((summary) => {
      console.log("Ingesta completada:", summary);
      console.warn(
        "AVISO: esta es una ingesta PARCIAL (rango de bytes acotado). No cubre el archivo completo de inversiones."
      );
      return pool.end();
    })
    .catch((err) => {
      console.error("Ingesta falló:", err);
      process.exit(1);
    });
}
