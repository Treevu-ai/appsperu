import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeTitulos, type CanonicalTitulo, type Capa, type RejectedRow } from "./normalize-serfor.js";

const BASE_URL = "https://geo.serfor.gob.pe/geoservicios/rest/services/Servicios_OGC";
const INSERT_BATCH_SIZE = 1000;

/**
 * IDs de capa y servicio confirmados en vivo 2026-09-22 (ADS-01/ADS-02) contra
 * `<servicio>/MapServer?f=json` de cada uno. El dominio también expone `Zonificacion_Forestal`,
 * `Inventario_Forestal` y `Unidad_Monitoreo_Satelital` (alertas de incendios casi en tiempo real,
 * dominio distinto) -- fuera de alcance de ADS-02, ver docs/data-contracts/serfor-catastro-forestal.md.
 */
const LAYERS: Record<Capa, { service: string; layerId: number }> = {
  modalidad_permisos: { service: "Modalidad_Acceso", layerId: 0 },
  modalidad_cesiones_en_uso: { service: "Modalidad_Acceso", layerId: 1 },
  modalidad_autorizaciones_pfdm_avnb: { service: "Modalidad_Acceso", layerId: 2 },
  modalidad_autorizacion_cambio_uso_agropecuario: { service: "Modalidad_Acceso", layerId: 3 },
  modalidad_bosques_locales: { service: "Modalidad_Acceso", layerId: 4 },
  modalidad_unidad_aprovechamiento: { service: "Modalidad_Acceso", layerId: 5 },
  modalidad_concesiones_forestales: { service: "Modalidad_Acceso", layerId: 6 },
  ordenamiento_bosques_locales: { service: "Ordenamiento_Forestal", layerId: 0 },
  ordenamiento_bosques_protectores: { service: "Ordenamiento_Forestal", layerId: 1 },
  ordenamiento_bosques_produccion_permanente: { service: "Ordenamiento_Forestal", layerId: 2 },
};

interface EsriFeature {
  attributes: Record<string, unknown>;
}

interface EsriQueryResponse {
  features?: EsriFeature[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string };
}

function layerUrl(capa: Capa): string {
  const { service, layerId } = LAYERS[capa];
  return `${BASE_URL}/${service}/MapServer/${layerId}`;
}

/**
 * Los 10 conteos reales confirmados en vivo van de 2 a 1,793 filas por capa -- todos muy por
 * debajo de `maxRecordCount` (10,000 confirmado en `Modalidad_Acceso`), así que una sola consulta
 * sin filtro trae el dataset completo de cada capa (mismo criterio que `areas-protegidas`/SERNANP:
 * no se implementa paginación por OBJECTID). Ese supuesto se verifica en cada corrida, no solo se
 * asume una vez -- si `exceededTransferLimit: true`, se aborta la capa en vez de confirmar un
 * snapshot truncado.
 */
async function fetchLayerFeatures(capa: Capa): Promise<EsriFeature[]> {
  const params = new URLSearchParams({ where: "1=1", outFields: "*", returnGeometry: "false", f: "json" });
  const res = await fetch(`${layerUrl(capa)}/query?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`SERFOR devolvió ${res.status} al consultar la capa "${capa}"`);
  }
  const payload = (await res.json()) as EsriQueryResponse;
  if (payload.error) {
    throw new Error(`SERFOR devolvió error ${payload.error.code}: ${payload.error.message} (capa "${capa}")`);
  }
  if (!Array.isArray(payload.features)) {
    throw new Error(`SERFOR devolvió una respuesta sin "features" (array) para la capa "${capa}"`);
  }
  if (payload.exceededTransferLimit === true) {
    throw new Error(
      `SERFOR devolvió exceededTransferLimit=true para la capa "${capa}" -- este conector no pagina; ` +
        "confirmar el volumen real y agregar paginación por OBJECTID antes de reintentar."
    );
  }
  return payload.features;
}

async function saveRawBatch(client: PoolClient, capa: Capa): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_serfor_batches (source_url, capa, record_count) VALUES ($1, $2, 0) RETURNING id`,
    [`${layerUrl(capa)}/query`, capa]
  );
  return result.rows[0].id;
}

const INSERT_COLUMNS = [
  "capa", "objectid", "fuente", "doc_reg", "fec_reg", "observ", "zon_utm", "origen",
  "nom_dis", "nom_pro", "nom_dep", "aut_for", "fec_ini", "fec_ter", "situac", "sup_sig",
  "sup_apr", "doc_leg", "fec_leg", "atributos_extra", "source_batch_id",
] as const;

async function insertBatch(client: PoolClient, batchId: number, rows: readonly CanonicalTitulo[]): Promise<void> {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * INSERT_COLUMNS.length;
    tuples.push(`(${INSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.capa, row.objectid, row.fuente, row.docReg, row.fecReg, row.observ, row.zonUtm, row.origen,
      row.nomDis, row.nomPro, row.nomDep, row.autFor, row.fecIni, row.fecTer, row.situac, row.supSig,
      row.supApr, row.docLeg, row.fecLeg, row.atributosExtra ? JSON.stringify(row.atributosExtra) : null, batchId
    );
  });

  await client.query(`INSERT INTO catastro_forestal_titulos (${INSERT_COLUMNS.join(",")}) VALUES ${tuples.join(",")}`, values);
}

async function insertRejectedBatch(client: PoolClient, batchId: number, rejected: readonly RejectedRow[]): Promise<void> {
  for (const bad of rejected) {
    await client.query(
      `INSERT INTO catastro_forestal_titulos_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
      [batchId, JSON.stringify(bad.raw), bad.reason]
    );
  }
}

export interface CapaIngestSummary {
  capa: Capa;
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export interface IngestSummary {
  capas: CapaIngestSummary[];
}

/**
 * Ninguno de los campos de estas 10 capas es una clave estable garantizada única (a diferencia de
 * INGEMMET/`CODIGOU` o legislativo-congreso) -- mismo criterio que SERNANP: cada ingesta es un
 * SNAPSHOT COMPLETO por capa, se borran todas las filas existentes de esa capa y se insertan las
 * nuevas, en la misma transacción, con advisory lock por capa para serializar corridas solapadas.
 */
async function ingestCapa(capa: Capa): Promise<CapaIngestSummary> {
  const features = await fetchLayerFeatures(capa);
  const { rows, rejected } = normalizeTitulos(features, capa);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('catastro_forestal_titulos_ingest'), hashtext($1))", [capa]);
    const batchId = await saveRawBatch(client, capa);

    await client.query("DELETE FROM catastro_forestal_titulos WHERE capa = $1", [capa]);

    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      await insertBatch(client, batchId, rows.slice(i, i + INSERT_BATCH_SIZE));
    }
    for (let i = 0; i < rejected.length; i += INSERT_BATCH_SIZE) {
      await insertRejectedBatch(client, batchId, rejected.slice(i, i + INSERT_BATCH_SIZE));
    }
    await client.query("UPDATE raw_serfor_batches SET record_count = $1 WHERE id = $2", [rows.length, batchId]);

    await client.query("COMMIT");
    return { capa, batchId, filasOrigen: features.length, filasInsertadas: rows.length, filasRechazadas: rejected.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ingestSerfor(): Promise<IngestSummary> {
  const capas: CapaIngestSummary[] = [];
  const errores: string[] = [];

  for (const capa of Object.keys(LAYERS) as Capa[]) {
    try {
      capas.push(await ingestCapa(capa));
    } catch (error) {
      errores.push(`${capa}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (errores.length > 0) {
    throw new Error(`Fallaron ${errores.length} de ${Object.keys(LAYERS).length} capa(s): ${errores.join("; ")}`);
  }

  return { capas };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestSerfor()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
