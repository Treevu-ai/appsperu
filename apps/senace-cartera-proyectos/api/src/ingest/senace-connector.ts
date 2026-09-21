import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeProyectos, type CanonicalProyecto, type RejectedRow } from "./normalize-senace.js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const BASE_URL = "https://datosabiertos.senace.gob.pe/home/VistaDatos/JsonCarteraProyecto";
const INSERT_BATCH_SIZE = 1000;

/**
 * Confirmado en vivo 2026-09-21 (ADS-04): este endpoint pertenece al portal público de catálogo
 * de datos de SENACE (`/home/CatalogoDatos/`), sin autenticación -- **no** a la API documentada
 * en `/Api/Help`, que sí exige `auth_key` (y que además tiene un hallazgo de seguridad real, ver
 * docs/seguridad/senace-reporte-vulnerabilidad-2026-09-21.md; este conector no la usa en absoluto).
 *
 * No existe un endpoint de catálogo/discovery de estados válidos (a diferencia del Congreso) --
 * los 3 valores de `q` se confirmaron manualmente inspeccionando la grilla del portal. Si SENACE
 * agrega un estado nuevo en el futuro, esta lista quedaría desactualizada silenciosamente; no hay
 * forma de detectarlo automáticamente con la información disponible hoy.
 */
interface EstadoConocido {
  /** Valor que se pasa como `q` en la URL. */
  param: string;
  /** Valor real de `ESTADO` en la respuesta (puede diferir del `param`, ej. la tilde de "Evaluación"). */
  label: string;
}

const ESTADOS_CONOCIDOS: readonly EstadoConocido[] = [
  { param: "Aprobado", label: "Aprobado" },
  { param: "Desaprobado", label: "Desaprobado" },
  { param: "En Evaluacion", label: "En Evaluación" },
];

interface CarteraProyectoResponse {
  datos: {
    labels: string[];
    data: Record<string, unknown>[];
  };
}

async function fetchProyectosDelEstado(estadoParam: string): Promise<Record<string, unknown>[]> {
  const url = `${BASE_URL}?q=${encodeURIComponent(estadoParam)}`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/plain, */*" } });
  if (!res.ok) {
    throw new Error(`SENACE devolvió ${res.status} al consultar el estado "${estadoParam}"`);
  }
  const payload = (await res.json()) as CarteraProyectoResponse;
  if (!Array.isArray(payload.datos?.data)) {
    throw new Error(`SENACE devolvió una respuesta sin "datos.data" (arreglo) para el estado "${estadoParam}"`);
  }
  return payload.datos.data;
}

async function saveRawBatch(client: PoolClient, estadoParam: string): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_senace_batches (source_url, estado_filtro, record_count) VALUES ($1, $2, 0) RETURNING id`,
    [BASE_URL, estadoParam]
  );
  return result.rows[0].id;
}

const UPSERT_COLUMNS = [
  "senace_id", "titular", "ruc", "titulo_proyecto", "unidad_proyecto", "tipo", "actividad",
  "fecha_inicio", "estado", "descripcion", "longitud", "latitud", "resolucion", "source_batch_id",
] as const;

async function upsertBatch(client: PoolClient, batchId: number, rows: readonly CanonicalProyecto[]): Promise<void> {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * UPSERT_COLUMNS.length;
    tuples.push(`(${UPSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.senaceId, row.titular, row.ruc, row.tituloProyecto, row.unidadProyecto, row.tipo, row.actividad,
      row.fechaInicio, row.estado, row.descripcion, row.longitud, row.latitud, row.resolucion, batchId
    );
  });

  await client.query(
    `INSERT INTO senace_cartera_proyectos (${UPSERT_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (senace_id) DO UPDATE SET
       titular = EXCLUDED.titular,
       ruc = EXCLUDED.ruc,
       titulo_proyecto = EXCLUDED.titulo_proyecto,
       unidad_proyecto = EXCLUDED.unidad_proyecto,
       tipo = EXCLUDED.tipo,
       actividad = EXCLUDED.actividad,
       fecha_inicio = EXCLUDED.fecha_inicio,
       estado = EXCLUDED.estado,
       descripcion = EXCLUDED.descripcion,
       longitud = EXCLUDED.longitud,
       latitud = EXCLUDED.latitud,
       resolucion = EXCLUDED.resolucion,
       source_batch_id = EXCLUDED.source_batch_id,
       updated_at = now()`,
    values
  );
}

async function insertRejectedBatch(client: PoolClient, batchId: number, rejected: readonly RejectedRow[]): Promise<void> {
  for (const bad of rejected) {
    await client.query(
      `INSERT INTO senace_cartera_proyectos_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
      [batchId, JSON.stringify(bad.raw), bad.reason]
    );
  }
}

export interface EstadoIngestSummary {
  estadoParam: string;
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export interface IngestSummary {
  estados: EstadoIngestSummary[];
}

/**
 * `senace_id` es único globalmente (verificado: 1,870 IDs únicos sobre 1,870 filas combinando
 * los 3 estados) -- un cambio de estado de un proyecto (ej. de "En Evaluación" a "Aprobado") se
 * refleja como UPDATE de la misma fila, no como una fila nueva. El borrado de "stale" se limita
 * al propio `estado` de esta corrida -- si un proyecto pasó de estado, la corrida del estado
 * viejo no debe borrarlo (ya lo actualizó la corrida del estado nuevo con su source_batch_id).
 */
async function ingestEstado(estado: EstadoConocido): Promise<EstadoIngestSummary> {
  const rawRows = await fetchProyectosDelEstado(estado.param);
  const { rows, rejected } = normalizeProyectos(rawRows);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('senace_cartera_proyectos_ingest'), hashtext($1))", [estado.label]);
    const batchId = await saveRawBatch(client, estado.param);

    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      await upsertBatch(client, batchId, rows.slice(i, i + INSERT_BATCH_SIZE));
    }
    for (let i = 0; i < rejected.length; i += INSERT_BATCH_SIZE) {
      await insertRejectedBatch(client, batchId, rejected.slice(i, i + INSERT_BATCH_SIZE));
    }

    await client.query(
      "DELETE FROM senace_cartera_proyectos WHERE estado = $1 AND source_batch_id <> $2",
      [estado.label, batchId]
    );

    await client.query("UPDATE raw_senace_batches SET record_count = $1 WHERE id = $2", [rows.length, batchId]);

    await client.query("COMMIT");
    return { estadoParam: estado.param, batchId, filasOrigen: rawRows.length, filasInsertadas: rows.length, filasRechazadas: rejected.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ingestSenace(): Promise<IngestSummary> {
  const estados: EstadoIngestSummary[] = [];
  const errores: string[] = [];

  for (const estado of ESTADOS_CONOCIDOS) {
    try {
      estados.push(await ingestEstado(estado));
    } catch (error) {
      errores.push(`estado "${estado.param}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (errores.length > 0) {
    throw new Error(`Fallaron ${errores.length} de ${ESTADOS_CONOCIDOS.length} estado(s): ${errores.join("; ")}`);
  }

  return { estados };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestSenace()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
