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

/**
 * Cada corrida es un snapshot completo (mismo criterio que catastro-forestal):
 * sin esto, una corrida que falla a mitad de camino deja datos incompletos
 * que una corrida posterior solo duplicaría en vez de completar, porque
 * estas tablas no tienen `ON CONFLICT` ni clave natural.
 */
async function clearTable(table: string): Promise<void> {
  await pool.query(`DELETE FROM ${table}`);
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
 * Un `INSERT` multi-fila (una sola sentencia con N `VALUES`) por lote, en vez
 * de N sentencias de una fila cada una. El insert fila-por-fila original
 * tardaba ~130ms por fila (un round-trip de red completo contra el host
 * directo de Neon por cada fila) -- confirmado en vivo 2026-10-01: a ese
 * ritmo, los ~68,391 registros de tráfico hubieran tardado más de 2 horas y
 * el proceso terminó interrumpido dos veces antes de completar. Un INSERT
 * multi-fila de 500 registros es una sola sentencia, así que el número de
 * round-trips baja ~500x.
 */
function buildMultiRowInsert(table: string, columns: string[], rows: unknown[][]): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const groups = rows.map((vals) => {
    const placeholders = vals.map((v) => {
      params.push(v);
      return `$${params.length}`;
    });
    return `(${placeholders.join(",")})`;
  });
  return {
    sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${groups.join(", ")}`,
    params,
  };
}

const MAX_REINTENTOS = 4;

/**
 * Todos los lotes de una tabla en UNA sola transacción (no un commit por
 * lote de 500): con el insert fila-por-fila original, un commit por lote
 * era la única forma de no perder TODO el progreso si una conexión
 * sostenida por horas se caía a mitad de camino -- pero eso dejaba, cuando
 * un lote tardío fallaba tras agotar reintentos, todos los lotes previos ya
 * confirmados en la tabla con un `record_count` que seguía afirmando el
 * total completo (hallazgo P1 de CodeRabbit en PR #223, confirmado en vivo:
 * exactamente eso pasó, trafico/recaudacion quedaron truncados a 55,000/
 * 68,391 y 54,500/59,820 sin que el batch lo reflejara). Con el insert
 * multi-fila (~500x menos round-trips, tabla completa en segundos) ya no
 * hace falta ese compromiso: si algo falla, se reintenta la transacción
 * completa desde cero -- o todas las filas quedan, o ninguna.
 */
async function insertTodoConReintento(table: string, columns: string[], rows: unknown[][]): Promise<number> {
  let ultimoError: unknown;
  for (let intento = 1; intento <= MAX_REINTENTOS; intento++) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const slice = rows.slice(i, i + BATCH_SIZE);
        const { sql, params } = buildMultiRowInsert(table, columns, slice);
        await client.query(sql, params);
      }
      await client.query("COMMIT");
      return rows.length;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      ultimoError = error;
      const esErrorDeConexion = /ECONNRESET|Connection terminated/i.test(String((error as Error).message));
      if (!esErrorDeConexion || intento === MAX_REINTENTOS) throw error;
      console.error(`  [reintento ${intento}/${MAX_REINTENTOS}] transacción falló por error de conexión, reintentando en ${intento * 2}s...`);
      await new Promise((r) => setTimeout(r, intento * 2000));
    } finally {
      client.release();
    }
  }
  throw ultimoError;
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
  await clearTable("reclamos_carreteras");
  const batchId = await saveBatch("reclamos_carreteras", RECLAMOS_URL, text, rows.length);
  const values = rows.map((r) => [
    Number(r[0]), Number(r[1]), r[2], r[3], r[4], r[5], r[6] || null, r[7] || null, r[8], Number(r[9]) || 0, batchId,
  ]);
  const inserted = await insertTodoConReintento(
    "reclamos_carreteras",
    [
      "anio", "mes", "entidad_prestadora", "concesion", "siglas_concesion", "medio_presentacion",
      "motivo_reclamo", "materia_reclamo", "estado_reclamo", "cantidad_reclamos", "source_batch_id",
    ],
    values
  );
  return { batchId, filasInsertadas: inserted };
}

async function ingestTrafico(): Promise<{ batchId: number; filasInsertadas: number }> {
  const text = await fetchText(TRAFICO_URL);
  const rows = parseStandardCsv(text).filter((r) => r.length >= 12);
  await clearTable("trafico_vehicular_carreteras");
  const batchId = await saveBatch("trafico_vehicular_carreteras", TRAFICO_URL, text, rows.length);
  const values = rows.map((r) => [
    Number(r[0]), Number(r[1]), r[2], r[3], r[4], r[5] || null, r[6] || null, r[7] || null,
    r[8] || null, r[9] || null, r[10] || null, Number(r[11]?.replace(/,/g, "")) || 0, batchId,
  ]);
  const inserted = await insertTodoConReintento(
    "trafico_vehicular_carreteras",
    [
      "anio", "mes", "entidad_prestadora", "concesion", "siglas_concesion", "peaje", "clase_vehiculo",
      "tipo_tarifa", "tipo_vehiculo", "tipo_eje_veh", "nro_ejes", "cantidad_vehiculos", "source_batch_id",
    ],
    values
  );
  return { batchId, filasInsertadas: inserted };
}

async function ingestRecaudacion(): Promise<{ batchId: number; filasInsertadas: number }> {
  const text = await fetchText(RECAUDACION_URL);
  const rows = parseStandardCsv(text).filter((r) => r.length >= 12);
  await clearTable("recaudacion_carreteras");
  const batchId = await saveBatch("recaudacion_carreteras", RECAUDACION_URL, text, rows.length);
  const values = rows.map((r) => [
    Number(r[0]), Number(r[1]), r[2], r[3], r[4], r[5] || null, r[6] || null, r[7] || null,
    r[8] || null, r[9] || null, r[10] || null, Number(r[11]?.replace(/,/g, "")) || 0, batchId,
  ]);
  const inserted = await insertTodoConReintento(
    "recaudacion_carreteras",
    [
      "anio", "mes", "entidad_prestadora", "concesion", "siglas_concesion", "peaje", "tipo_recaudacion",
      "tipo_tarifa", "tipo_vehiculo", "tipo_eje_veh", "nro_ejes", "importe_soles", "source_batch_id",
    ],
    values
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
  // Secuencial, no Promise.all: el comentario de arriba documenta que
  // sostener varios flujos de ingesta concurrentes contra el mismo host
  // es precisamente el escenario que causó ECONNRESET en vivo -- correr
  // las 3 fases en paralelo aquí contradecía esa misma nota (hallazgo de
  // CodeRabbit en PR #223, confirmado).
  const run = fn
    ? fn().then((r) => ({ [fase as string]: r }))
    : (async () => {
        const reclamos = await ingestReclamos();
        const trafico = await ingestTrafico();
        const recaudacion = await ingestRecaudacion();
        return { reclamos, trafico, recaudacion };
      })();

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
