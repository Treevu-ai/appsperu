import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeAreas, type CanonicalArea, type Capa, type RejectedRow } from "./normalize-sernanp.js";

const BASE_URL = "https://geoservicios.sernanp.gob.pe/arcgis/rest/services/sernanp_visor/servicio_descarga/MapServer";
const INSERT_BATCH_SIZE = 1000;

/**
 * IDs de capa confirmados en vivo 2026-09-21 contra `MapServer?f=json`. El servicio también
 * expone más capas (Zonificación, Zona de Amortiguamiento, Áreas de Alto Valor Marino, etc.)
 * fuera de alcance de GEO-02 -- ver docs/data-contracts/sernanp-areas-protegidas.md.
 */
const LAYERS: Record<Capa, number> = {
  anp_nacional_definitiva: 1,
  zona_reservada: 2,
  area_conservacion_regional: 3,
  area_conservacion_privada: 4,
  sitios_prioritarios: 5,
};

interface EsriFeature {
  attributes: Record<string, unknown>;
}

interface EsriQueryResponse {
  features?: EsriFeature[];
  exceededTransferLimit?: boolean;
  error?: { code: number; message: string };
}

/**
 * A diferencia de INGEMMET (GEO-01), este servicio sí soporta paginación estándar
 * (`advancedQueryCapabilities.supportsPagination: true`, `maxRecordCount: 200000`, confirmado en
 * vivo) y las 5 capas son pequeñas (6 a 233 filas) -- una sola consulta sin filtro trae el
 * dataset completo de cada capa, así que este conector NO implementa paginación por `OBJECTID`.
 *
 * Ese supuesto se verifica en cada corrida, no solo se asume una vez (hallazgo real de Copilot):
 * si la respuesta trae `exceededTransferLimit: true` (la capa creció más allá de
 * `maxRecordCount`), se aborta la capa explícitamente en vez de confirmar un snapshot truncado --
 * mismo criterio que exigir `features` como array real ante un schema inesperado.
 */
async function fetchLayerFeatures(layerId: number, capa: Capa): Promise<EsriFeature[]> {
  const params = new URLSearchParams({ where: "1=1", outFields: "*", returnGeometry: "false", f: "json" });
  const res = await fetch(`${BASE_URL}/${layerId}/query?${params.toString()}`);
  if (!res.ok) {
    throw new Error(`SERNANP devolvió ${res.status} al consultar la capa ${layerId}`);
  }
  const payload = (await res.json()) as EsriQueryResponse;
  if (payload.error) {
    throw new Error(`SERNANP devolvió error ${payload.error.code}: ${payload.error.message}`);
  }
  if (!Array.isArray(payload.features)) {
    throw new Error(
      `SERNANP devolvió una respuesta sin "features" (array) para la capa "${capa}" -- ` +
        "no se asume capa vacía ante un schema inesperado."
    );
  }
  if (payload.exceededTransferLimit === true) {
    throw new Error(
      `SERNANP devolvió exceededTransferLimit=true para la capa "${capa}" -- este conector no pagina ` +
        "(asume que las 5 capas caben en una sola respuesta); confirmar el volumen real y agregar " +
        "paginación por OBJECTID antes de reintentar, no confirmar un snapshot truncado."
    );
  }
  return payload.features;
}

async function saveRawBatch(client: PoolClient, capa: Capa): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_sernanp_batches (source_url, capa, record_count) VALUES ($1, $2, 0) RETURNING id`,
    [`${BASE_URL}/${LAYERS[capa]}/query`, capa]
  );
  return result.rows[0].id;
}

const INSERT_COLUMNS = [
  "capa", "objectid", "codigo", "nombre", "categoria", "ubicacion", "superficie_ha",
  "base_legal_establecimiento", "fecha_establecimiento", "base_legal_modificacion",
  "fecha_modificacion", "observaciones", "atributos_extra", "source_batch_id",
] as const;

async function insertBatch(client: PoolClient, batchId: number, rows: readonly CanonicalArea[]): Promise<void> {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * INSERT_COLUMNS.length;
    tuples.push(`(${INSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.capa, row.objectid, row.codigo, row.nombre, row.categoria, row.ubicacion, row.superficieHa,
      row.baseLegalEstablecimiento, row.fechaEstablecimiento, row.baseLegalModificacion,
      row.fechaModificacion, row.observaciones, row.atributosExtra ? JSON.stringify(row.atributosExtra) : null, batchId
    );
  });

  await client.query(`INSERT INTO sernanp_areas (${INSERT_COLUMNS.join(",")}) VALUES ${tuples.join(",")}`, values);
}

async function insertRejectedBatch(client: PoolClient, batchId: number, rejected: readonly RejectedRow[]): Promise<void> {
  for (const bad of rejected) {
    await client.query(`INSERT INTO sernanp_areas_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`, [
      batchId,
      JSON.stringify(bad.raw),
      bad.reason,
    ]);
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
 * Ni el código de área ni `objectid` son una clave incremental segura (ver
 * docs/data-contracts/sernanp-areas-protegidas.md) -- cada corrida es un SNAPSHOT COMPLETO por
 * capa: se borran todas las filas existentes de esa capa y se insertan las nuevas, en la misma
 * transacción. No hay upsert por clave derivada (decisión explícita del PRD, hallazgo real de
 * CodeRabbit).
 */
async function ingestCapa(capa: Capa): Promise<CapaIngestSummary> {
  const features = await fetchLayerFeatures(LAYERS[capa], capa);
  const { rows, rejected } = normalizeAreas(features, capa);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Hallazgo real de Copilot: dos corridas manuales solapadas de la misma capa podrían
    // confirmar la más vieja DESPUÉS de la más nueva, dejando el snapshot final desactualizado.
    // `pg_advisory_xact_lock` serializa por capa (hash del nombre) -- se libera sola al terminar
    // la transacción.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('sernanp_areas_ingest'), hashtext($1))", [capa]);
    const batchId = await saveRawBatch(client, capa);

    await client.query("DELETE FROM sernanp_areas WHERE capa = $1", [capa]);

    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      await insertBatch(client, batchId, rows.slice(i, i + INSERT_BATCH_SIZE));
    }
    for (let i = 0; i < rejected.length; i += INSERT_BATCH_SIZE) {
      await insertRejectedBatch(client, batchId, rejected.slice(i, i + INSERT_BATCH_SIZE));
    }
    await client.query("UPDATE raw_sernanp_batches SET record_count = $1 WHERE id = $2", [rows.length, batchId]);

    await client.query("COMMIT");
    return { capa, batchId, filasOrigen: features.length, filasInsertadas: rows.length, filasRechazadas: rejected.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ingestSernanp(): Promise<IngestSummary> {
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
  ingestSernanp()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
