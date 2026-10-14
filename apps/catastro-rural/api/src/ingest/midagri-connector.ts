import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool, connectSafe } from "../db/pool.js";
import { normalizeMidagri, type CanonicalPredio, type Capa, type RejectedRow, LAYER_NAMES } from "./normalize-midagri.js";

const BASE_URL = "https://georural.midagri.gob.pe/geoservicios/rest/services/public/Catastro_Rural/MapServer";
const INSERT_BATCH_SIZE = 1000;

export const TOTAL_LAYERS = 10;

export function getCapaName(layerId: number): Capa {
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

export function layerUrl(layerId: number): string {
  return `${BASE_URL}/${layerId}`;
}

export function ringsToGeoJSON(rings: unknown): object | null {
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

// DISTINCT objectid, no count(*) crudo -- una corrida que se corta a mitad
// de página puede reinsertar un rango ya presente; con ON CONFLICT DO
// NOTHING eso ya no duplica filas, pero sigue siendo necesario contar lo
// realmente único para decidir el offset real de reanudación.
async function contarFilasExistentes(capa: Capa): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT count(DISTINCT objectid) FROM catastro_rural WHERE capa = $1`,
    [capa]
  );
  return Number(rows[0].count);
}

async function ultimoBatchId(capa: Capa): Promise<number | null> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM raw_midagri_batches WHERE capa = $1 ORDER BY id DESC LIMIT 1`,
    [capa]
  );
  return rows[0]?.id ?? null;
}

// geometry_mp/geometry_valid_mp (no "geometry"/"geometry_valid" -- esas
// quedaron deprecadas tras el incidente de tipo Polygon vs MultiPolygon del
// 2026-10-14) requieren ST_GeomFromGeoJSON(), no se les puede pasar el
// GeoJSON como parámetro plano -- el INSERT original hacía exactamente eso
// y nunca lo notamos porque geomJson siempre era null (bug de normalize-
// midagri.ts), así que el error de tipo nunca llegó a dispararse en vivo.
const INSERT_COLUMNS_PLAIN = [
  "capa", "objectid", "area_ha", "perimetro", "id_dist", "cod_proy",
  "nom_dpto", "nom_prov", "nom_dist", "nombre", "estado", "fuente",
  "tipo_proceso", "nro_titulo", "anio_titulo",
  "area_km2", "atributos_extra", "source_batch_id",
] as const;

async function insertBatch(client: PoolClient, batchId: number, rows: readonly CanonicalPredio[]): Promise<void> {
  if (rows.length === 0) return;

  const columnas = [...INSERT_COLUMNS_PLAIN, "geometry_mp", "geometry_valid_mp"];
  const nPlain = INSERT_COLUMNS_PLAIN.length;
  const values: unknown[] = [];
  const tuples: string[] = [];

  rows.forEach((row, i) => {
    const base = i * (nPlain + 1); // +1: ambas columnas de geometría comparten el mismo parámetro GeoJSON

    const geomJson = ringsToGeoJSON(row.geometry_rings);

    let area_km2: number | null = null;
    if (geomJson && row.area_ha !== null && row.area_ha !== undefined) {
      area_km2 = row.area_ha / 100;
    }

    const placeholdersPlain = Array.from({ length: nPlain }, (_, j) => `$${base + j + 1}`);
    const geomParam = `$${base + nPlain + 1}`;
    tuples.push(
      `(${placeholdersPlain.join(",")}, ST_Multi(ST_GeomFromGeoJSON(${geomParam})), ST_Multi(ST_GeomFromGeoJSON(${geomParam})))`
    );
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
      area_km2,
      row.atributos_extra ? JSON.stringify(row.atributos_extra) : null,
      batchId,
      geomJson ? JSON.stringify(geomJson) : null
    );
  });

  await client.query(
    `INSERT INTO catastro_rural (${columnas.join(",")}) VALUES ${tuples.join(",")}
     ON CONFLICT (capa, objectid) DO NOTHING`,
    values
  );
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

  // Lock de SESIÓN (no transaccional) tomado con pg_try_advisory_lock y
  // sostenido durante TODA la ingesta de esta capa -- sin esto, dos
  // corridas concurrentes de la misma capa (ej. un relanzamiento sobre un
  // proceso "killed" que en realidad seguía vivo) pueden leer el mismo
  // conteo de partida y pisarse: confirmado en vivo, generó filas
  // duplicadas y disparó el branch de "arranque limpio" (DELETE) mientras
  // otro proceso seguía insertando, perdiendo ~3M filas ya transferidas.
  const lockClient = await connectSafe();
  const lockKey = Number(BigInt.asIntN(32, BigInt(`0x${Buffer.from(capa).toString("hex")}`.slice(0, 10))));
  const { rows: lockRows } = await lockClient.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock(hashtext('catastro_rural_ingest'), $1) AS locked",
    [lockKey]
  );
  if (!lockRows[0].locked) {
    lockClient.release();
    throw new Error(`capa ${layerId} (${capa}) ya tiene otra ingesta en curso (lock no disponible) -- no se relanza en paralelo`);
  }

  try {
    const totalEsperado = await contarFeaturesArcGIS(layerId);
    const yaInsertadas = await contarFilasExistentes(capa);

    let offset: number;
    let batchId: number;

    // FORCE_RESCAN_OFFSET0: el contador totalInserted usado para loggear
    // "COMPLETED" suma el tamaño de cada página recibida, sin descontar las
    // que ON CONFLICT DO NOTHING descarta por ya existir -- confirmado en
    // vivo: tras varias corridas con cortes/reanudaciones, el script
    // reportó "3,060,135/3,060,135 COMPLETED" pero Neon solo tenía
    // 3,008,135 filas reales (0 rechazadas). La reanudación usa el conteo
    // DISTINCT como offset posicional de ArcGIS, lo que puede "adelantar"
    // la posición real cuando hubo duplicados reinsertados, dejando un
    // tramo genuino sin recorrer. Esta bandera fuerza un recorrido completo
    // desde offset=0 reusando el mismo batch (sin el DELETE del arranque
    // limpio) -- 100% seguro porque todo insert pasa por
    // ON CONFLICT (capa, objectid) DO NOTHING.
    const forzarRecorridoCompleto = process.env.FORCE_RESCAN_OFFSET0 === "true";

    if (yaInsertadas >= totalEsperado && yaInsertadas > 0 && !forzarRecorridoCompleto) {
      const existente = await ultimoBatchId(capa);
      if (existente === null) throw new Error(`capa ${layerId} tiene ${yaInsertadas} filas pero ningún batch registrado -- estado inconsistente`);
      console.log(`[capa ${layerId} (${capa})] YA COMPLETA: ${yaInsertadas}/${totalEsperado} filas únicas, nada que hacer.`);
      return { capa, layerId, batchId: existente, filasOrigen: totalEsperado, filasInsertadas: yaInsertadas, filasRechazadas: 0 };
    } else if (forzarRecorridoCompleto && yaInsertadas > 0) {
      offset = 0;
      const existente = await ultimoBatchId(capa);
      if (existente === null) throw new Error(`capa ${layerId} tiene ${yaInsertadas} filas pero ningún batch registrado -- estado inconsistente`);
      batchId = existente;
      console.log(`[capa ${layerId} (${capa})] RECORRIDO COMPLETO FORZADO: ${yaInsertadas}/${totalEsperado} filas únicas en DB, re-escaneando desde offset=0 para cubrir posibles huecos (idempotente)`);
    } else if (yaInsertadas > 0) {
      offset = yaInsertadas;
      const existente = await ultimoBatchId(capa);
      if (existente === null) throw new Error(`capa ${layerId} tiene ${yaInsertadas} filas pero ningún batch registrado -- estado inconsistente`);
      batchId = existente;
      console.log(`[capa ${layerId} (${capa})] REANUDANDO: ya hay ${yaInsertadas}/${totalEsperado} filas únicas, offset=${offset}`);
    } else {
      offset = 0;
      const initClient = await connectSafe();
      try {
        await initClient.query("BEGIN");
        await initClient.query("DELETE FROM catastro_rural WHERE capa = $1", [capa]);
        await initClient.query("DELETE FROM catastro_rural_rejected WHERE capa = $1", [capa]);
        batchId = await saveRawBatch(initClient, layerId, 0); // actualizamos al final
        await initClient.query("COMMIT");
      } catch (error) {
        await initClient.query("ROLLBACK");
        throw error;
      } finally {
        initClient.release();
      }
      console.log(`[capa ${layerId} (${capa})] Arranque limpio: 0/${totalEsperado} filas`);
    }

    return await paginarCapa(layerId, capa, pageSize, offset, batchId, totalEsperado, yaInsertadas);
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock(hashtext('catastro_rural_ingest'), $1)", [lockKey]);
    lockClient.release();
  }
}

async function paginarCapa(
  layerId: number,
  capa: Capa,
  pageSize: number,
  offsetInicial: number,
  batchId: number,
  totalEsperado: number,
  yaInsertadas: number
): Promise<CapaIngestSummary> {
  let offset = offsetInicial;
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

    const client = await connectSafe();
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