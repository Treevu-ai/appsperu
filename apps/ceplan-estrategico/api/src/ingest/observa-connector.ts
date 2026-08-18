import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import type { ObservaCollectionRaw } from "./field-mapping.js";
import { normalizeObservaIndicadores, type RejectedRow } from "./normalize.js";

const DEFAULT_BASE_URL = "https://observaperu.ceplan.gob.pe";
const INDICATORS_PATH = "/assets/data/seguimiento-estrategico/indicadores_priorizados_gestion_estrategica_estado.json";

/**
 * Asset JSON estático confirmado en vivo el 2026-08-17: es lo que el botón
 * "Descargar (Excel)" de /explorar-datos usa client-side para armar el
 * archivo (el Excel se genera en el browser, no en el servidor — no hay
 * endpoint de descarga estable para el .xlsx en sí). Este JSON es la fuente
 * real y no requiere sesión ni formulario, así que se ingiere directo, sin
 * necesidad de la librería `xlsx`.
 */
function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function fetchObservaIndicadores(baseUrl: string = DEFAULT_BASE_URL): Promise<{
  data: ObservaCollectionRaw;
  rawText: string;
}> {
  const res = await fetch(`${baseUrl}${INDICATORS_PATH}`);
  if (!res.ok) {
    throw new Error(`ObservaPerú devolvió ${res.status} al pedir el catálogo de indicadores`);
  }
  const rawText = await res.text();
  return { data: JSON.parse(rawText) as ObservaCollectionRaw, rawText };
}

async function saveRawBatch(client: PoolClient, rawText: string, recordCount: number): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO raw_ceplan_batches (resource_id, query, checksum, record_count, payload, source)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [INDICATORS_PATH, "", checksumOf(rawText), recordCount, rawText, "ObservaPerú"]
  );
  return rows[0].id;
}

export interface IngestSummary {
  batchId: number;
  accepted: number;
  rejected: number;
  rejectedDetails: RejectedRow[];
}

/**
 * Descarga el catálogo de indicadores, guarda el lote crudo (lake de
 * evidencia) y hace upsert en `strategic_indicators` por
 * (indicator_code, serie_id, measurement_date). No es una ingesta parcial
 * (`isPartial`) como en las otras apps — el archivo es un JSON completo de
 * ~60KB, no requiere streaming ni paginación.
 *
 * Las filas rechazadas no se persisten en una tabla `*_rejected` (a
 * diferencia de radar-ejecucion): con datos bien formados el rechazo
 * debería ser cero en la práctica, y agregar esa tabla es prematuro para
 * este sprint. Quedan en el summary devuelto (visible en el log del CLI).
 */
export async function ingestObservaIndicadores(baseUrl: string = DEFAULT_BASE_URL): Promise<IngestSummary> {
  const { data, rawText } = await fetchObservaIndicadores(baseUrl);
  const { rows, rejected } = normalizeObservaIndicadores(data);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, rawText, rows.length);

    for (const row of rows) {
      await client.query(
        `INSERT INTO strategic_indicators
           (indicator_code, indicator_name, serie_id, serie_label, nivel_gobierno, value,
            measurement_date, unit_of_measure, frequency, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (indicator_code, serie_id, measurement_date) DO UPDATE
           SET indicator_name = EXCLUDED.indicator_name,
               serie_label = EXCLUDED.serie_label,
               nivel_gobierno = EXCLUDED.nivel_gobierno,
               value = EXCLUDED.value,
               unit_of_measure = EXCLUDED.unit_of_measure,
               frequency = EXCLUDED.frequency,
               source = EXCLUDED.source,
               updated_at = now()`,
        [
          row.indicatorCode,
          row.indicatorName,
          row.serieId,
          row.serieLabel,
          row.nivelGobierno,
          row.value,
          row.measurementDate,
          row.unitOfMeasure,
          row.frequency,
          row.source,
        ]
      );
    }

    await client.query("COMMIT");

    return { batchId, accepted: rows.length, rejected: rejected.length, rejectedDetails: rejected };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const baseUrl = process.env.OBSERVA_BASE_URL ?? DEFAULT_BASE_URL;
  ingestObservaIndicadores(baseUrl)
    .then((summary) => {
      console.log("Ingesta ObservaPerú completada:", {
        batchId: summary.batchId,
        aceptados: summary.accepted,
        rechazados: summary.rejected,
      });
      if (summary.rejected > 0) {
        console.warn("Filas rechazadas:", JSON.stringify(summary.rejectedDetails, null, 2));
      }
      return pool.end();
    })
    .catch((err) => {
      console.error("Ingesta ObservaPerú falló:", err);
      process.exit(1);
    });
}
