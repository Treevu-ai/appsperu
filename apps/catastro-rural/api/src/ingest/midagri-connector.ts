import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeMidagri, type CanonicalPredio, type Capa, type RejectedRow, LAYER_NAMES } from "./normalize-midagri.js";

const BASE_URL = "https://georural.midagri.gob.pe/geoservicios/rest/services/public/Catastro_Rural/MapServer";
const INSERT_BATCH_SIZE = 1000;

const TOTAL_LAYERS = 10;

function getCapaName(layerId: number): Capa {
  return LAYER_NAMES[layerId] ?? `capa_${layerId}`;
}

interface EsriFeature {
  attributes: Record<string, unknown>;
  geometry?: { rings?: number[][][] };
}

interface EsriQueryResponse {
  features?: EsriFeature[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string };
}

function layerUrl(layerId: number): string {
  return `${BASE_URL}/${layerId}`;
}

function ringsToGeoJSON(rings: unknown): object | null {
  if (!Array.isArray(rings) || rings.length === 0) return null;
  const polygons: number[][][][] = rings.map((ring) => {
    if (!Array.isArray(ring)) return [];
    return [ring.map((coord) => {
      if (!Array.isArray(coord) || coord.length < 2) return [0, 0];
      return [Number(coord[0]), Number(coord[1])];
    })];
  }).filter((p) => p[0].length > 0);

  if (polygons.length === 0) return null;

  if (polygons.length === 1) {
    return { type: "Polygon", coordinates: polygons[0] };
  }
  return { type: "MultiPolygon", coordinates: polygons };
}

async function saveRawBatch(client: PoolClient, layerId: number, recordCount: number): Promise<number> {
  const capa = getCapaName(layerId);
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_midagri_batches (source_url, capa, record_count) VALUES ($1, $2, $3) RETURNING id`,
    [`${layerUrl(layerId)}/query`, capa, recordCount]
  );
  return result.rows[0].id;
}

/**
 * Total real de features en el servicio ArcGIS (returnCountOnly) -- permite
 * saber si una capa quedó a medio ingestar sin asumirlo, y calcular el
 * offset de reanudación real en vez de arrancar siempre desde 0. Necesario
 * porque la ingesta anterior (una transacción gigante por capa) se cayó a
 * mitad de camino (proceso matado por el entorno) y el ROLLBACK se llevó
 * las 1.2M filas ya insertadas -- mismo patrón de pérdida total que ya
 * vimos y arreglamos en perdida-bosque/shp-reader.
 */
async function contarFeaturesArcGIS(layerId: number): Promise<number> {
  const params = new URLSearchParams({ where: "1=1", returnCountOnly: "true", f: "json" });
  const res = await fetch(`${layerUrl(layerId)}/query?${params.toString()}`);
  if (!res.ok) throw new Error(`MIDAGRI Georural devolvió ${res.status} al contar la capa ${layerId}`);
  const body = (await res.json()) as { count?: number; error?: { code: number; message: string } };
  if (body.error) throw new Error(`MIDAGRI Georural devolvió error ${body.error.code}: ${body.error.message} (count capa ${layerId})`);
  if (typeof body.count !== "number") throw new Error(`MIDAGRI Georural no devolvió "count" para la capa ${layerId}`);
  return body.count;
}

async function contarFilasExistentes(capa: Capa): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(`SELECT count(*) FROM catastro_rural WHERE capa = $1`, [capa]);
  return Number(rows[0].count);
}

async function ultimoBatchId(capa: Capa): Promise<number | null> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM raw_midagri_batches WHERE capa = $1 ORDER BY id DESC LIMIT 1`,
    [capa]
  );
  return rows[0]?.id ?? null;
}

const INSERT_COLUMNS = [
  "capa", "objectid", "area_ha", "perimetro", "id_dist", "cod_proy",
  "nom_dpto", "nom_prov", "nom_dist", "nombre", "estado", "fuente",
  "tipo_proceso", "nro_titulo", "anio_titulo", "geometry",
  "area_km2", "geometry_valid", "atributos_extra", "source_batch_id",
] as const;

async function insertBatch(client: PoolClient, batchId: number, rows: readonly CanonicalPredio[]): Promise<void> {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];

  rows.forEach((row, i) => {
    const base = i * INSERT_COLUMNS.length;

    const geomJson = ringsToGeoJSON(row.geometry_rings);

    let area_km2: number | null = null;
    if (geomJson && row.area_ha !== null && row.area_ha !== undefined) {
      area_km2 = row.area_ha / 100;
    }

    tuples.push(`(${INSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.capa,
      row.objectid,
      row.area_ha,
      row.perimetro,
      row.id_dist,
      row.cod_proy,
      row.nom_dpto,
      row.nom_prov,
      row.nom_dist,
      row.nombre,
      row.estado,
      row.fuente,
      row.tipo_proceso,
      row.nro_titulo,
      row.anio_titulo,
      geomJson ? JSON.stringify(geomJson) : null,
      area_km2,
      geomJson ? JSON.stringify(geomJson) : null,
      row.atributos_extra ? JSON.stringify(row.atributos_extra) : null,
      batchId
    );
  });

  await client.query(`INSERT INTO catastro_rural (${INSERT_COLUMNS.join(",")}) VALUES ${tuples.join(",")}`, values);
}

async function insertRejectedBatch(client: PoolClient, batchId: number, rejected: readonly RejectedRow[], capa: Capa): Promise<void> {
  for (const bad of rejected) {
    await client.query(
      `INSERT INTO catastro_rural_rejected (source_batch_id, capa, raw_row, reason) VALUES ($1, $2, $3, $4)`,
      [batchId, capa, JSON.stringify(bad.raw), bad.reason]
    );
  }
}

export interface CapaIngestSummary {
  capa: Capa;
  layerId: number;
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export interface IngestSummary {
  capas: CapaIngestSummary[];
}

const MAX_PAGES_THIS_RUN = process.env.MAX_PAGES_THIS_RUN ? Number(process.env.MAX_PAGES_THIS_RUN) : Infinity;

async function ingestCapa(layerId: number): Promise<CapaIngestSummary> {
  const capa = getCapaName(layerId);
  const pageSize = 1000;

  const totalEsperado = await contarFeaturesArcGIS(layerId);
  const yaInsertadas = await contarFilasExistentes(capa);

  let offset: number;
  let batchId: number;

  if (yaInsertadas > 0 && yaInsertadas < totalEsperado) {
    offset = yaInsertadas;
    const existente = await ultimoBatchId(capa);
    if (existente === null) throw new Error(`capa ${layerId} tiene ${yaInsertadas} filas pero ningún batch registrado -- estado inconsistente`);
    batchId = existente;
    console.log(`[capa ${layerId} (${capa})] REANUDANDO: ya hay ${yaInsertadas}/${totalEsperado} filas, offset=${offset}`);
  } else {
    offset = 0;
    const lockClient = await pool.connect();
    try {
      await lockClient.query("BEGIN");
      await lockClient.query("SELECT pg_advisory_xact_lock(hashtext('catastro_rural_ingest'), hashtext($1))", [capa]);
      await lockClient.query("DELETE FROM catastro_rural WHERE capa = $1", [capa]);
      await lockClient.query("DELETE FROM catastro_rural_rejected WHERE capa = $1", [capa]);
      batchId = await saveRawBatch(lockClient, layerId, 0); // actualizamos al final
      await lockClient.query("COMMIT");
    } catch (error) {
      await lockClient.query("ROLLBACK");
      throw error;
    } finally {
      lockClient.release();
    }
    console.log(`[capa ${layerId} (${capa})] Arranque limpio: 0/${totalEsperado} filas`);
  }

  let pageCount = 0;
  let totalInserted = yaInsertadas;
  let totalRejected = 0;

  // Cada página es su propio INSERT autocommiteado (sin transacción que
  // envuelva toda la capa) -- si el proceso muere a mitad de camino, lo ya
  // insertado queda persistido y la próxima corrida reanuda desde el
  // offset real en vez de perderlo todo.
  while (offset < totalEsperado && pageCount < MAX_PAGES_THIS_RUN) {
    const params = new URLSearchParams({
      where: "1=1",
      outFields: "*",
      returnGeometry: "true",
      outSR: "4326",
      orderByFields: "OBJECTID",
      resultOffset: offset.toString(),
      resultRecordCount: pageSize.toString(),
      f: "json",
    });

    console.log(`[capa ${layerId} (${capa})] Fetching page (offset=${offset})...`);
    const res = await fetch(`${layerUrl(layerId)}/query?${params.toString()}`);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`MIDAGRI Georural devolvió ${res.status} al consultar la capa ${layerId}: ${text}`);
    }

    const payload = (await res.json()) as EsriQueryResponse;

    if (payload.error) {
      throw new Error(`MIDAGRI Georural devolvió error ${payload.error.code}: ${payload.error.message} (capa ${layerId})`);
    }

    if (!Array.isArray(payload.features)) {
      throw new Error(`MIDAGRI Georural devolvió una respuesta sin "features" (array) para la capa ${layerId}`);
    }

    const features = payload.features;
    console.log(`[capa ${layerId}] Features: ${features.length}, total insertado: ${totalInserted + features.length}/${totalEsperado}`);

    const { rows, rejected } = normalizeMidagri(features, layerId);
    totalInserted += rows.length;
    totalRejected += rejected.length;

    const client = await pool.connect();
    try {
      for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
        await insertBatch(client, batchId, rows.slice(i, i + INSERT_BATCH_SIZE));
      }
      for (let i = 0; i < rejected.length; i += INSERT_BATCH_SIZE) {
        await insertRejectedBatch(client, batchId, rejected.slice(i, i + INSERT_BATCH_SIZE), capa);
      }
    } finally {
      client.release();
    }

    pageCount++;
    offset += features.length;

    if (features.length === 0 || payload.exceededTransferLimit !== true) break;
  }

  const terminoCapaCompleta = offset >= totalEsperado;
  if (terminoCapaCompleta) {
    // record_count es el total crudo de origen (válidas + rechazadas), no solo
    // lo insertado -- offset avanza por cada feature recibida de ArcGIS.
    await pool.query("UPDATE raw_midagri_batches SET record_count = $1 WHERE id = $2", [offset, batchId]);
  }

  console.log(
    `[capa ${layerId}] ${terminoCapaCompleta ? "COMPLETED" : "PAUSADA (MAX_PAGES_THIS_RUN alcanzado)"}: ` +
      `${totalInserted}/${totalEsperado} insertadas, ${totalRejected} rechazadas en esta corrida, ${pageCount} páginas`
  );
  return { capa, layerId, batchId, filasOrigen: totalEsperado, filasInsertadas: totalInserted, filasRechazadas: totalRejected };
}

export async function ingestMidagri(): Promise<IngestSummary> {
  const capas: CapaIngestSummary[] = [];
  const errores: string[] = [];
  const soloLayerId = process.env.LAYER_ID !== undefined ? Number(process.env.LAYER_ID) : null;

  for (let layerId = soloLayerId ?? 0; layerId < (soloLayerId !== null ? soloLayerId + 1 : TOTAL_LAYERS); layerId++) {
    try {
      const resumen = await ingestCapa(layerId);
      capas.push(resumen);
      // Si esta corrida se pausó por MAX_PAGES_THIS_RUN (capa grande, en
      // tramos), no avanzar a la siguiente capa todavía -- hay que
      // reanudar esta misma capa en la próxima corrida.
      if (resumen.filasInsertadas < resumen.filasOrigen) break;
    } catch (error) {
      const msg = error instanceof Error ? `${error.name}: ${error.message}\n${error.stack}` : String(error);
      errores.push(`capa_${layerId}: ${msg}`);
      console.error(`Error en capa ${layerId}:`, msg);
    }
  }

  if (errores.length > 0) {
    throw new Error(`Fallaron ${errores.length} de ${TOTAL_LAYERS} capa(s): ${errores.join("; ")}`);
  }

  return { capas };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestMidagri()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}