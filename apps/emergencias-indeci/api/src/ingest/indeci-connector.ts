import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeEmergencias, type CanonicalEmergencia, type RejectedRow } from "./normalize-indeci.js";

const CSV_URL = "https://www.datosabiertos.gob.pe/sites/default/files/BD_2003-2025_EMERGENCIAS.csv";
const INSERT_BATCH_SIZE = 1000;

/**
 * Confirmado en vivo 2026-09-22 (ADS-05): el archivo real está codificado en **ISO-8859-1
 * (Latin-1), no UTF-8** ("AÑO" llega como bytes que decodificados como UTF-8 se ven como
 * "A�O") -- se decodifica explícitamente como `latin1`, no se asume UTF-8 por defecto.
 * El archivo no contiene ninguna comilla (`"`) en sus 142,139 filas reales -- un split manual
 * por `;` es seguro aquí; no hace falta un parser CSV completo con manejo de comillas/escapes.
 */
async function fetchEmergenciasCsv(): Promise<string[][]> {
  const res = await fetch(CSV_URL, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    throw new Error(`INDECI devolvió ${res.status} al descargar el CSV`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const text = buffer.toString("latin1");
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    throw new Error("INDECI devolvió un CSV vacío (sin encabezado ni filas)");
  }
  // La primera línea es el encabezado -- se descarta, el schema es fijo y ya está documentado
  // en normalize-indeci.ts (HEADERS), no se re-deriva de la respuesta.
  return lines.slice(1).map((line) => line.split(";"));
}

async function saveRawBatch(client: PoolClient): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_indeci_batches (source_url, record_count) VALUES ($1, 0) RETURNING id`,
    [CSV_URL]
  );
  return result.rows[0].id;
}

const INSERT_COLUMNS = [
  "sinpad_id", "fecha_emergencia", "anio", "mes", "cod_distrito", "departamento", "provincia",
  "distrito", "peligro", "tipo_peligro", "region_natural", "fallecidos", "desaparecidos",
  "lesionados", "damnificados", "afectados", "viviendas_destruidas", "viviendas_afectadas",
  "peso_ayuda", "costo_ayuda", "detalle_edan", "source_batch_id",
] as const;

async function insertBatch(client: PoolClient, batchId: number, rows: readonly CanonicalEmergencia[]): Promise<void> {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * INSERT_COLUMNS.length;
    tuples.push(`(${INSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.sinpadId, row.fechaEmergencia, row.anio, row.mes, row.codDistrito, row.departamento,
      row.provincia, row.distrito, row.peligro, row.tipoPeligro, row.regionNatural, row.fallecidos,
      row.desaparecidos, row.lesionados, row.damnificados, row.afectados, row.viviendasDestruidas,
      row.viviendasAfectadas, row.pesoAyuda, row.costoAyuda,
      row.detalleEdan ? JSON.stringify(row.detalleEdan) : null, batchId
    );
  });

  await client.query(`INSERT INTO indeci_emergencias (${INSERT_COLUMNS.join(",")}) VALUES ${tuples.join(",")}`, values);
}

async function insertRejectedBatch(client: PoolClient, batchId: number, rejected: readonly RejectedRow[]): Promise<void> {
  for (const bad of rejected) {
    await client.query(
      `INSERT INTO indeci_emergencias_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
      [batchId, JSON.stringify(bad.raw), bad.reason]
    );
  }
}

export interface IngestSummary {
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

/**
 * `CODIGO DE EMERGENCIA-SINPAD` **no es una clave única** pese a que el propio diccionario de
 * datos de la fuente lo documenta como "clave primaria transaccional" -- verificado en vivo: 7
 * códigos se repiten entre eventos genuinamente distintos (fechas y distritos diferentes,
 * confirmado no es error de parseo). Este es un archivo histórico completo republicado
 * periódicamente (no una API incremental) -- cada ingesta reemplaza el snapshot completo (DELETE
 * + INSERT en una sola transacción, con advisory lock), mismo criterio que las capas de
 * `areas-protegidas`/`catastro-forestal` sin clave estable.
 */
export async function ingestIndeci(): Promise<IngestSummary> {
  const rawRows = await fetchEmergenciasCsv();
  const { rows, rejected } = normalizeEmergencias(rawRows);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('indeci_emergencias_ingest'))");
    const batchId = await saveRawBatch(client);

    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      await insertBatch(client, batchId, rows.slice(i, i + INSERT_BATCH_SIZE));
    }
    for (let i = 0; i < rejected.length; i += INSERT_BATCH_SIZE) {
      await insertRejectedBatch(client, batchId, rejected.slice(i, i + INSERT_BATCH_SIZE));
    }

    await client.query("DELETE FROM indeci_emergencias WHERE source_batch_id <> $1", [batchId]);
    await client.query("UPDATE raw_indeci_batches SET record_count = $1 WHERE id = $2", [rawRows.length, batchId]);

    await client.query("COMMIT");
    return { batchId, filasOrigen: rawRows.length, filasInsertadas: rows.length, filasRechazadas: rejected.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestIndeci()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
