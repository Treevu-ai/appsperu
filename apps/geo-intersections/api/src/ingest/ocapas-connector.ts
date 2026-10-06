/**
 * ocapas-connector.ts — Conector para SERFOR OCAPAS_MIDAGRI.
 *
 * Ingere datos de Comunidades Campesinas/Nativas y predios rurales por departamento
 * desde la API ArcGIS REST de SERFOR OCAPAS_MIDAGRI.
 *
 * Uso:
 *   npm run ingest:ocapas                    ← todas las capas
 *   npm run ingest:ocapas -- comunidades     ← capas específicas
 */

import "dotenv/config";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeOcapasFeatures, type CanonicalCommunity, type RejectedRow } from "./normalize-ocapas.js";

const OCAPAS_BASE = "https://geo.serfor.gob.pe/geoservicios/rest/services/Visor/OCAPAS_MIDAGRI/MapServer";

const LAYERS: Record<string, number> = {
  comunidades_campesinas: 26,
  comunidades_nativas: 27,
  // Opcional: capas por departamento (no implementadas en Fase 1)
  // predios_amazonas: 1,
  // predios_ancash: 2,
  // predios_apurimac: 3,
  // predios_arequipa: 4,
  // predios_ayacucho: 5,
  // predios_cajamarca: 6,
  // predios_callao: 7,
  // predios_cusco: 8,
  // predios_huancavelica: 9,
  // predios_huanuco: 10,
  // predios_ica: 11,
  // predios_junin: 12,
  // predios_la_libertad: 13,
  // predios_lambayeque: 14,
  // predios_lima: 15,
  // predios_loreto: 16,
  // predios_madre_de_dios: 17,
  // predios_moquegua: 18,
  // predios_pasco: 19,
  // predios_piura: 20,
  // predios_puno: 21,
  // predios_san_martin: 22,
  // predios_tacna: 23,
  // predios_tumbes: 24,
  // predios_ucayali: 25,
};

const INSERT_BATCH_SIZE = 1000;

interface ArcGISFeature {
  attributes: Record<string, unknown>;
  geometry: { rings: number[][][] };
}

interface ArcGISResponse {
  features?: ArcGISFeature[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string };
}

async function fetchLayerFeatures(capa: string, layerId: number): Promise<ArcGISFeature[]> {
  const params = new URLSearchParams({
    where: "1=1",
    outFields: "*",
    returnGeometry: "true",
    outSR: "4326",
    f: "json",
  });

  const url = `${OCAPAS_BASE}/${layerId}/query?${params.toString()}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) {
    throw new Error(`SERFOR OCAPAS devolvió ${res.status} al consultar capa "${capa}"`);
  }

  const payload = (await res.json()) as ArcGISResponse;
  if (payload.error) {
    throw new Error(`SERFOR OCAPAS devolvió error ${payload.error.code}: ${payload.error.message}`);
  }
  if (!Array.isArray(payload.features)) {
    throw new Error(`SERFOR OCAPAS devolvió respuesta sin "features" para capa "${capa}"`);
  }

  // Con MaxRecordCount=1M, no debería haber exceededTransferLimit, pero verificamos
  if (payload.exceededTransferLimit === true) {
    throw new Error(
      `SERFOR OCAPAS devolvió exceededTransferLimit=true para capa "${capa}" -- ` +
        "agregar paginación por resultOffset/resultRecordCount"
    );
  }

  return payload.features;
}

async function saveRawBatch(client: PoolClient, capa: string, layerId: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_ocapas_batches (source_url, capa, record_count)
     VALUES ($1, $2, 0) RETURNING id`,
    [`${OCAPAS_BASE}/${layerId}/query`, capa]
  );
  return result.rows[0].id;
}

const INSERT_COLUMNS = [
  "capa", "objectid", "nombre", "departamento", "provincia", "distrito",
  "area_ha", "perimetro", "titulo", "zona_utm", "coordenada_x", "coordenada_y",
  "geometry", "atributos_extra", "source_batch_id",
] as const;

async function insertBatch(client: PoolClient, batchId: number, rows: readonly CanonicalCommunity[]): Promise<void> {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * INSERT_COLUMNS.length;
    tuples.push(
      `(${INSERT_COLUMNS.map((col, j) => {
        const placeholder = `$${base + j + 1}`;
        // La columna geometry es GEOMETRY(Polygon, 4326); el valor llega como string GeoJSON
        // y necesita el cast explícito, igual que en replicate-geometries.ts.
        return col === "geometry" ? `ST_GeomFromGeoJSON(${placeholder})` : placeholder;
      }).join(",")})`
    );
    values.push(
      row.capa, row.objectid, row.nombre, row.departamento, row.provincia, row.distrito,
      row.area_ha, row.perimetro, row.titulo, row.zona_utm, row.coordenada_x, row.coordenada_y,
      row.geometry,
      row.atributos_extra ? JSON.stringify(row.atributos_extra) : null,
      batchId
    );
  });

  await client.query(
    `INSERT INTO rural_communities (${INSERT_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}`,
    values
  );
}

async function insertRejectedBatch(client: PoolClient, batchId: number, rejected: readonly RejectedRow[]): Promise<void> {
  for (const bad of rejected) {
    await client.query(
      `INSERT INTO rural_communities_rejected (source_batch_id, raw_row, reason)
       VALUES ($1, $2, $3)`,
      [batchId, JSON.stringify(bad.raw), bad.reason]
    );
  }
}

export interface CapaIngestSummary {
  capa: string;
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export interface IngestSummary {
  capas: CapaIngestSummary[];
}

/**
 * Snapshot completo por capa (DELETE + INSERT) con advisory lock para serializar
 * ingestas solapadas. Mismo patrón que catastro-forestal.
 */
async function ingestCapa(capa: string, layerId: number): Promise<CapaIngestSummary> {
  const features = await fetchLayerFeatures(capa, layerId);
  const { rows, rejected } = normalizeOcapasFeatures(features, capa);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('rural_communities_ingest'), hashtext($1))", [capa]);
    const batchId = await saveRawBatch(client, capa, layerId);

    await client.query("DELETE FROM rural_communities WHERE capa = $1", [capa]);

    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      await insertBatch(client, batchId, rows.slice(i, i + INSERT_BATCH_SIZE));
    }
    for (let i = 0; i < rejected.length; i += INSERT_BATCH_SIZE) {
      await insertRejectedBatch(client, batchId, rejected.slice(i, i + INSERT_BATCH_SIZE));
    }

    await client.query("UPDATE raw_ocapas_batches SET record_count = $1 WHERE id = $2", [features.length, batchId]);

    await client.query("COMMIT");
    return { capa, batchId, filasOrigen: features.length, filasInsertadas: rows.length, filasRechazadas: rejected.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ingestOcapas(capas?: string[]): Promise<IngestSummary> {
  const capasAIngerir = capas || Object.keys(LAYERS);
  const resultados: CapaIngestSummary[] = [];
  const errores: string[] = [];

  for (const capa of capasAIngerir) {
    if (!(capa in LAYERS)) {
      errores.push(`${capa}: capa no definida en LAYERS`);
      continue;
    }

    try {
      const layerId = LAYERS[capa];
      const resultado = await ingestCapa(capa, layerId);
      resultados.push(resultado);
    } catch (error) {
      errores.push(`${capa}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (errores.length > 0) {
    throw new Error(`Fallaron ${errores.length} de ${capasAIngerir.length} capa(s): ${errores.join("; ")}`);
  }

  return { capas: resultados };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const capas = process.argv.slice(2);
  ingestOcapas(capas.length > 0 ? capas : undefined)
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
