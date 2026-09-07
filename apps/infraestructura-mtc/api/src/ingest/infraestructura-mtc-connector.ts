import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import {
  normalizeTerminalesPortuarios,
  normalizeAerodromos,
  normalizePeajes,
  type CanonicalTerminalPortuario,
  type CanonicalAerodromo,
  type CanonicalPeaje,
  type PeajeFeature,
  type RejectedRow,
} from "./normalize.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// Los slugs de estos datasets cambian de versión en versión sin que la versión vieja
// desaparezca del buscador (confirmado en vivo 2026-09-06: reconstruir la URL a mano a partir
// de un título de búsqueda dio el shell genérico del portal dos veces). La única forma
// confiable de encontrar la URL vigente es listar el grupo del publicador en
// datosabiertos.gob.pe y tomar el href real. Ver docs/data-contracts/mtc-infraestructura-puntual.md.
const PUERTOS_URL = "https://www.datosabiertos.gob.pe/sites/default/files/Infraestructura_portuaria_terminales_embarcaderos_2022-2025.csv";
const AERODROMOS_URL = "https://www.datosabiertos.gob.pe/sites/default/files/Infraestructura_aeroportuaria_aerodromos_2022-2025.csv";
const PEAJES_URL = "https://www.datosabiertos.gob.pe/sites/default/files/unidades_peaje_2024-2025.geojson";

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function saveRawBatch(client: PoolClient, dataset: string, sourceUrl: string, checksum: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_infraestructura_mtc_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
    [dataset, sourceUrl, checksum, recordCount]
  );
  return result.rows[0].id;
}

async function insertRejectedBatch(client: PoolClient, table: string, batchId: number, rejected: readonly RejectedRow[]): Promise<void> {
  for (const bad of rejected) {
    await client.query(`INSERT INTO ${table} (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`, [
      batchId,
      JSON.stringify(bad.raw),
      bad.reason,
    ]);
  }
}

export interface IngestSummary {
  dataset: string;
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

async function fetchText(url: string, encoding: "utf-8" | "latin1"): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MTC/PNDA devolvió ${res.status} al descargar ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.toString(encoding);
}

// ---------- Terminales portuarios ----------

const TERMINALES_COLUMNS = [
  "codigo_puerto", "id_departamento", "id_provincia", "id_distrito", "localidad",
  "nombre_terminal", "label_terminal", "ambito", "tipo_terminal", "alcance", "uso", "trafico",
  "actividad", "subactividad", "estado", "estado_conservacion", "titularidad", "administrador",
  "es_concesionado", "latitud", "longitud", "fecha_corte", "source_batch_id",
] as const;

async function insertTerminalesBatch(client: PoolClient, batchId: number, rows: readonly CanonicalTerminalPortuario[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * TERMINALES_COLUMNS.length;
    tuples.push(`(${TERMINALES_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.codigoPuerto, row.idDepartamento, row.idProvincia, row.idDistrito, row.localidad,
      row.nombreTerminal, row.labelTerminal, row.ambito, row.tipoTerminal, row.alcance, row.uso,
      row.trafico, row.actividad, row.subactividad, row.estado, row.estadoConservacion,
      row.titularidad, row.administrador, row.esConcesionado, row.latitud, row.longitud,
      row.fechaCorte, batchId
    );
  });

  await client.query(
    `INSERT INTO terminales_portuarios (${TERMINALES_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (codigo_puerto, fecha_corte) DO UPDATE SET
       id_departamento = EXCLUDED.id_departamento, id_provincia = EXCLUDED.id_provincia,
       id_distrito = EXCLUDED.id_distrito, localidad = EXCLUDED.localidad,
       nombre_terminal = EXCLUDED.nombre_terminal, label_terminal = EXCLUDED.label_terminal,
       ambito = EXCLUDED.ambito, tipo_terminal = EXCLUDED.tipo_terminal,
       alcance = EXCLUDED.alcance, uso = EXCLUDED.uso, trafico = EXCLUDED.trafico,
       actividad = EXCLUDED.actividad, subactividad = EXCLUDED.subactividad,
       estado = EXCLUDED.estado, estado_conservacion = EXCLUDED.estado_conservacion,
       titularidad = EXCLUDED.titularidad, administrador = EXCLUDED.administrador,
       es_concesionado = EXCLUDED.es_concesionado, latitud = EXCLUDED.latitud,
       longitud = EXCLUDED.longitud, source_batch_id = EXCLUDED.source_batch_id`,
    values
  );
}

export async function ingestPuertos(): Promise<IngestSummary> {
  const csvText = await fetchText(PUERTOS_URL, "latin1");
  const rawRows = parse(csvText, {
    columns: true, delimiter: ";", bom: true, trim: true, skip_empty_lines: true, relax_column_count: true,
  }) as Record<string, unknown>[];
  const { rows, rejected } = normalizeTerminalesPortuarios(rawRows);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, "puertos", PUERTOS_URL, checksumOf(csvText), rawRows.length);
    await insertTerminalesBatch(client, batchId, rows);
    await insertRejectedBatch(client, "terminales_portuarios_rejected", batchId, rejected);
    await client.query("COMMIT");
    return { dataset: "puertos", batchId, filasOrigen: rawRows.length, filasInsertadas: rows.length, filasRechazadas: rejected.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ---------- Aeródromos ----------

const AERODROMOS_COLUMNS = [
  "codigo_aerodromo", "id_departamento", "id_provincia", "id_distrito", "departamento",
  "provincia", "distrito", "nombre", "label", "tipo_aerodromo", "codigo_oaci", "escala",
  "estado", "administrador", "jerarquia", "titularidad", "latitud", "longitud",
  "es_concesionado", "fecha_corte", "source_batch_id",
] as const;

async function insertAerodromosBatch(client: PoolClient, batchId: number, rows: readonly CanonicalAerodromo[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * AERODROMOS_COLUMNS.length;
    tuples.push(`(${AERODROMOS_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.codigoAerodromo, row.idDepartamento, row.idProvincia, row.idDistrito, row.departamento,
      row.provincia, row.distrito, row.nombre, row.label, row.tipoAerodromo, row.codigoOaci,
      row.escala, row.estado, row.administrador, row.jerarquia, row.titularidad, row.latitud,
      row.longitud, row.esConcesionado, row.fechaCorte, batchId
    );
  });

  await client.query(
    `INSERT INTO aerodromos (${AERODROMOS_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (codigo_aerodromo, fecha_corte) DO UPDATE SET
       id_departamento = EXCLUDED.id_departamento, id_provincia = EXCLUDED.id_provincia,
       id_distrito = EXCLUDED.id_distrito, departamento = EXCLUDED.departamento,
       provincia = EXCLUDED.provincia, distrito = EXCLUDED.distrito, nombre = EXCLUDED.nombre,
       label = EXCLUDED.label, tipo_aerodromo = EXCLUDED.tipo_aerodromo,
       codigo_oaci = EXCLUDED.codigo_oaci, escala = EXCLUDED.escala, estado = EXCLUDED.estado,
       administrador = EXCLUDED.administrador, jerarquia = EXCLUDED.jerarquia,
       titularidad = EXCLUDED.titularidad, latitud = EXCLUDED.latitud,
       longitud = EXCLUDED.longitud, es_concesionado = EXCLUDED.es_concesionado,
       source_batch_id = EXCLUDED.source_batch_id`,
    values
  );
}

export async function ingestAerodromosData(): Promise<IngestSummary> {
  const csvText = await fetchText(AERODROMOS_URL, "latin1");
  const rawRows = parse(csvText, {
    columns: true, delimiter: ";", bom: true, trim: true, skip_empty_lines: true, relax_column_count: true,
  }) as Record<string, unknown>[];
  const { rows, rejected } = normalizeAerodromos(rawRows);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, "aerodromos", AERODROMOS_URL, checksumOf(csvText), rawRows.length);
    await insertAerodromosBatch(client, batchId, rows);
    await insertRejectedBatch(client, "aerodromos_rejected", batchId, rejected);
    await client.query("COMMIT");
    return { dataset: "aerodromos", batchId, filasOrigen: rawRows.length, filasInsertadas: rows.length, filasRechazadas: rejected.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// ---------- Peajes ----------

const PEAJES_COLUMNS = [
  "codigo_peaje", "nombre", "label", "codigo_ruta", "inicio_km", "codigo_clog", "departamento",
  "provincia", "distrito", "localidad", "id_departamento", "id_provincia", "id_distrito",
  "es_concesionado", "titular", "ubicacion", "estado", "administrador", "latitud", "longitud",
  "fecha_corte", "source_batch_id",
] as const;

async function insertPeajesBatch(client: PoolClient, batchId: number, rows: readonly CanonicalPeaje[]): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * PEAJES_COLUMNS.length;
    tuples.push(`(${PEAJES_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.codigoPeaje, row.nombre, row.label, row.codigoRuta, row.inicioKm, row.codigoClog,
      row.departamento, row.provincia, row.distrito, row.localidad, row.idDepartamento,
      row.idProvincia, row.idDistrito, row.esConcesionado, row.titular, row.ubicacion,
      row.estado, row.administrador, row.latitud, row.longitud, row.fechaCorte, batchId
    );
  });

  await client.query(
    `INSERT INTO peajes (${PEAJES_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (codigo_peaje, fecha_corte) DO UPDATE SET
       nombre = EXCLUDED.nombre, label = EXCLUDED.label, codigo_ruta = EXCLUDED.codigo_ruta,
       inicio_km = EXCLUDED.inicio_km, codigo_clog = EXCLUDED.codigo_clog,
       departamento = EXCLUDED.departamento, provincia = EXCLUDED.provincia,
       distrito = EXCLUDED.distrito, localidad = EXCLUDED.localidad,
       id_departamento = EXCLUDED.id_departamento, id_provincia = EXCLUDED.id_provincia,
       id_distrito = EXCLUDED.id_distrito, es_concesionado = EXCLUDED.es_concesionado,
       titular = EXCLUDED.titular, ubicacion = EXCLUDED.ubicacion, estado = EXCLUDED.estado,
       administrador = EXCLUDED.administrador, latitud = EXCLUDED.latitud,
       longitud = EXCLUDED.longitud, source_batch_id = EXCLUDED.source_batch_id`,
    values
  );
}

export async function ingestPeajesData(): Promise<IngestSummary> {
  const geojsonText = await fetchText(PEAJES_URL, "utf-8");
  const geojson = JSON.parse(geojsonText) as { features: PeajeFeature[] };
  const { rows, rejected } = normalizePeajes(geojson.features ?? []);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, "peajes", PEAJES_URL, checksumOf(geojsonText), geojson.features?.length ?? 0);
    await insertPeajesBatch(client, batchId, rows);
    await insertRejectedBatch(client, "peajes_rejected", batchId, rejected);
    await client.query("COMMIT");
    return { dataset: "peajes", batchId, filasOrigen: geojson.features?.length ?? 0, filasInsertadas: rows.length, filasRechazadas: rejected.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2];
  const ingestFn = target === "puertos" ? ingestPuertos : target === "aerodromos" ? ingestAerodromosData : target === "peajes" ? ingestPeajesData : null;

  if (!ingestFn) {
    console.error(`Uso: tsx infraestructura-mtc-connector.ts <puertos|aerodromos|peajes>`);
    process.exit(1);
  }

  ingestFn()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
