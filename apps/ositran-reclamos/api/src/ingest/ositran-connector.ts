import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const RECLAMOS_URL = "https://www.datosabiertos.gob.pe/sites/default/files/202603-PDE-REP-00203.csv";
const TRAFICO_URL = "https://www.datosabiertos.gob.pe/sites/default/files/202603-PDE-REP-00201.csv";
const RECAUDACION_URL = "https://www.datosabiertos.gob.pe/sites/default/files/202603-PDE-REP-00202.csv";
const BATCH_SIZE = 500;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`OSITRAN devolvió ${res.status} al descargar ${url}`);
  return res.text();
}

async function saveBatch(dataset: string, url: string, text: string, count: number): Promise<number> {
  const checksum = createHash("sha256").update(text).digest("hex");
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO raw_ositran_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
      [dataset, url, checksum, count]
    );
    return rows[0].id;
  } finally {
    client.release();
  }
}

/**
 * Inserta fila por fila, pero committeando cada BATCH_SIZE filas con su
 * propia conexión -- una sola conexión Postgres sostenida por decenas de
 * minutos de inserts terminó en "Connection terminated unexpectedly" en
 * vivo (confirmado 2026-10-01, mismo patrón en ONPE/OSITRAN/RENAMU).
 */
const MAX_REINTENTOS_POR_LOTE = 4;

/**
 * Un lote individual puede fallar por `ECONNRESET`/"Connection terminated
 * unexpectedly" de forma intermitente (confirmado en vivo 2026-10-01, no
 * depende del tamaño del lote -- pasó incluso con lotes ya cortos de 500).
 * Reintenta el mismo lote con backoff antes de propagar el error.
 */
async function insertOneBatchConReintento<T>(
  slice: T[],
  insertOne: (client: import("pg").PoolClient, row: T) => Promise<unknown>
): Promise<void> {
  let ultimoError: unknown;
  for (let intento = 1; intento <= MAX_REINTENTOS_POR_LOTE; intento++) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const row of slice) {
        await insertOne(client, row);
      }
      await client.query("COMMIT");
      return;
    } catch (error) {
      ultimoError = error;
      await client.query("ROLLBACK").catch(() => {});
      const esErrorDeConexion = /ECONNRESET|Connection terminated/i.test(String((error as Error).message));
      if (!esErrorDeConexion || intento === MAX_REINTENTOS_POR_LOTE) throw error;
      console.error(`  [reintento ${intento}/${MAX_REINTENTOS_POR_LOTE}] lote falló por error de conexión, reintentando en ${intento * 2}s...`);
      await new Promise((r) => setTimeout(r, intento * 2000));
    } finally {
      client.release();
    }
  }
  throw ultimoError;
}

async function insertInBatches<T>(rows: T[], insertOne: (client: import("pg").PoolClient, row: T) => Promise<unknown>): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    await insertOneBatchConReintento(slice, insertOne);
    inserted += slice.length;
  }
  return inserted;
}

/**
 * `reclamos` viene con un formato de comillas distinto al resto de series
 * OSITRAN: toda la línea envuelta en comillas con "" como separador de campo
 * doblemente escapado (confirmado en vivo 2026-09-30). `trafico`/`recaudacion`
 * usan comillas estándar por campo.
 */
function parseReclamosCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.slice(1).map((line) => line.replace(/"/g, "").split(";").map((f) => f.trim()));
}

function parseStandardCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.slice(1).map((line) => line.split(";").map((f) => f.replace(/^"|"$/g, "").trim()));
}

async function ingestReclamos(): Promise<{ batchId: number; filasInsertadas: number }> {
  const text = await fetchText(RECLAMOS_URL);
  const rows = parseReclamosCsv(text).filter((r) => r.length >= 10);
  const batchId = await saveBatch("reclamos_carreteras", RECLAMOS_URL, text, rows.length);
  const inserted = await insertInBatches(rows, (client, r) =>
    client.query(
      `INSERT INTO reclamos_carreteras
         (anio, mes, entidad_prestadora, concesion, siglas_concesion, medio_presentacion,
          motivo_reclamo, materia_reclamo, estado_reclamo, cantidad_reclamos, source_batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [Number(r[0]), Number(r[1]), r[2], r[3], r[4], r[5], r[6] || null, r[7] || null, r[8], Number(r[9]) || 0, batchId]
    )
  );
  return { batchId, filasInsertadas: inserted };
}

async function ingestTrafico(): Promise<{ batchId: number; filasInsertadas: number }> {
  const text = await fetchText(TRAFICO_URL);
  const rows = parseStandardCsv(text).filter((r) => r.length >= 11);
  const batchId = await saveBatch("trafico_vehicular_carreteras", TRAFICO_URL, text, rows.length);
  const inserted = await insertInBatches(rows, (client, r) =>
    client.query(
      `INSERT INTO trafico_vehicular_carreteras
         (anio, mes, entidad_prestadora, concesion, siglas_concesion, peaje, clase_vehiculo,
          tipo_tarifa, tipo_vehiculo, tipo_eje_veh, nro_ejes, cantidad_vehiculos, source_batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        Number(r[0]), Number(r[1]), r[2], r[3], r[4], r[5] || null, r[6] || null, r[7] || null,
        r[8] || null, r[9] || null, r[10] || null, Number(r[11]?.replace(/,/g, "")) || 0, batchId,
      ]
    )
  );
  return { batchId, filasInsertadas: inserted };
}

async function ingestRecaudacion(): Promise<{ batchId: number; filasInsertadas: number }> {
  const text = await fetchText(RECAUDACION_URL);
  const rows = parseStandardCsv(text).filter((r) => r.length >= 11);
  const batchId = await saveBatch("recaudacion_carreteras", RECAUDACION_URL, text, rows.length);
  const inserted = await insertInBatches(rows, (client, r) =>
    client.query(
      `INSERT INTO recaudacion_carreteras
         (anio, mes, entidad_prestadora, concesion, siglas_concesion, peaje, tipo_recaudacion,
          tipo_tarifa, tipo_vehiculo, tipo_eje_veh, nro_ejes, importe_soles, source_batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        Number(r[0]), Number(r[1]), r[2], r[3], r[4], r[5] || null, r[6] || null, r[7] || null,
        r[8] || null, r[9] || null, r[10] || null, Number(r[11]?.replace(/,/g, "")) || 0, batchId,
      ]
    )
  );
  return { batchId, filasInsertadas: inserted };
}

export { ingestReclamos, ingestTrafico, ingestRecaudacion };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Cada fase se puede correr como proceso separado (`node ... reclamos|trafico|recaudacion`)
  // -- un proceso largo corriendo las 3 fases seguidas terminó en ECONNRESET
  // en vivo (confirmado 2026-10-01) incluso con commits por lote. Procesos
  // más cortos y aislados por fase son más resilientes. Sin argumento, corre
  // las 3 en secuencia (comportamiento original).
  const fase = process.argv[2];
  const fn = fase === "reclamos" ? ingestReclamos : fase === "trafico" ? ingestTrafico : fase === "recaudacion" ? ingestRecaudacion : null;
  const run = fn
    ? fn().then((r) => ({ [fase as string]: r }))
    : Promise.all([ingestReclamos(), ingestTrafico(), ingestRecaudacion()]).then(([reclamos, trafico, recaudacion]) => ({ reclamos, trafico, recaudacion }));

  run
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
