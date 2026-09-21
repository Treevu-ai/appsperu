import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeProyectos, type CanonicalProyecto, type RejectedRow } from "./normalize-congreso.js";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";

const API_BASE = "https://api.congreso.gob.pe/spley-portal-service";
const PERIODOS_ENDPOINT = `${API_BASE}/periodo-parlamentario`;
const LISTA_ENDPOINT = `${API_BASE}/proyecto-ley/lista-con-filtro`;
const INSERT_BATCH_SIZE = 1000;

interface PeriodoParlamentario {
  perParId: number;
}

/**
 * Confirmado en vivo 2026-09-21 (ADS-15): fuente pública, sin auth, sin sesión de navegador --
 * un `fetch` plano con solo `User-Agent` basta. Los periodos válidos se descubren en vivo aquí,
 * no se hardcodean -- `unimauro/congreso-abierto-peru` asume años históricos (2016, 2011, 2006)
 * que no existen en este servicio (devuelven 200 con lista vacía, no error) y por eso su
 * `PERIODOS_CONOCIDOS` está mal. Ver docs/data-contracts/congreso-spley-portal-service.md.
 */
async function fetchPeriodosValidos(): Promise<number[]> {
  const res = await fetch(PERIODOS_ENDPOINT, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/plain, */*" },
  });
  if (!res.ok) {
    throw new Error(`Congreso devolvió ${res.status} al consultar ${PERIODOS_ENDPOINT}`);
  }
  const payload = (await res.json()) as { code: number; data: PeriodoParlamentario[] };
  if (payload.code !== 200) {
    throw new Error(`Congreso devolvió code=${payload.code} al consultar periodos válidos`);
  }
  return payload.data.map((p) => p.perParId);
}

/**
 * `pageSize` no tiene efecto verificado en vivo (una respuesta con `pageSize=2` trajo el mismo
 * dataset completo que `pageSize=100000`) -- se pasa igual por si el backend cambia de
 * comportamiento, pero no se debe asumir que limita nada.
 */
async function fetchProyectosDelPeriodo(perParId: number): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${LISTA_ENDPOINT}?pageSize=100000&page=1&rowStart=0`, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/json" },
    body: JSON.stringify({
      perParId,
      perLegId: null,
      comisionId: null,
      estadoId: null,
      grupParId: null,
      tipoFirmanteId: null,
      congresistaId: null,
      texto: null,
      fechaPresentacion: null,
      numeroProyecto: null,
    }),
  });
  if (!res.ok) {
    throw new Error(`Congreso devolvió ${res.status} al consultar proyectos del periodo ${perParId}`);
  }
  const payload = (await res.json()) as { code: number; data: { proyectos: Record<string, unknown>[] } };
  if (payload.code !== 200) {
    throw new Error(`Congreso devolvió code=${payload.code} para el periodo ${perParId}`);
  }
  return payload.data.proyectos ?? [];
}

async function saveRawBatch(client: PoolClient, perParId: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_congreso_batches (source_url, per_par_id, record_count) VALUES ($1, $2, 0) RETURNING id`,
    [LISTA_ENDPOINT, perParId]
  );
  return result.rows[0].id;
}

const UPSERT_COLUMNS = [
  "per_par_id", "pley_num", "proyecto_ley", "estado", "fecha_presentacion",
  "titulo", "proponente", "autores", "cod_tipo_parl", "cod_tipo_parl_actual", "source_batch_id",
] as const;

/**
 * `ON CONFLICT DO UPDATE` no tolera que dos filas del mismo `INSERT` compartan la clave --
 * Postgres aborta con "ON CONFLICT DO UPDATE command cannot affect row a second time" (hallazgo
 * real de Copilot). No se ha visto un duplicado real en la fuente (verificado: 0 duplicados
 * sobre 14,864 filas del periodo 2021), pero el conector no debe asumirlo -- se deduplica por
 * `perParId`+`pleyNum` antes de armar el `INSERT`, quedándose con la última aparición.
 */
function dedupeByKey(rows: readonly CanonicalProyecto[]): CanonicalProyecto[] {
  const byKey = new Map<string, CanonicalProyecto>();
  for (const row of rows) {
    byKey.set(`${row.perParId}|${row.pleyNum}`, row);
  }
  return [...byKey.values()];
}

async function upsertBatch(client: PoolClient, batchId: number, rowsIn: readonly CanonicalProyecto[]): Promise<void> {
  const rows = dedupeByKey(rowsIn);
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * UPSERT_COLUMNS.length;
    tuples.push(`(${UPSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.perParId, row.pleyNum, row.proyectoLey, row.estado, row.fechaPresentacion,
      row.titulo, row.proponente, row.autores, row.codTipoParl, row.codTipoParlActual, batchId
    );
  });

  await client.query(
    `INSERT INTO legislativo_congreso_proyectos (${UPSERT_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (per_par_id, pley_num) DO UPDATE SET
       proyecto_ley = EXCLUDED.proyecto_ley,
       estado = EXCLUDED.estado,
       fecha_presentacion = EXCLUDED.fecha_presentacion,
       titulo = EXCLUDED.titulo,
       proponente = EXCLUDED.proponente,
       autores = EXCLUDED.autores,
       cod_tipo_parl = EXCLUDED.cod_tipo_parl,
       cod_tipo_parl_actual = EXCLUDED.cod_tipo_parl_actual,
       source_batch_id = EXCLUDED.source_batch_id,
       updated_at = now()`,
    values
  );
}

async function insertRejectedBatch(client: PoolClient, batchId: number, rejected: readonly RejectedRow[]): Promise<void> {
  for (const bad of rejected) {
    await client.query(
      `INSERT INTO legislativo_congreso_proyectos_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
      [batchId, JSON.stringify(bad.raw), bad.reason]
    );
  }
}

export interface PeriodoIngestSummary {
  perParId: number;
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export interface IngestSummary {
  periodosDescubiertos: number[];
  periodos: PeriodoIngestSummary[];
}

async function ingestPeriodo(perParId: number): Promise<PeriodoIngestSummary> {
  const rawRows = await fetchProyectosDelPeriodo(perParId);
  const { rows, rejected } = normalizeProyectos(rawRows);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, perParId);

    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      await upsertBatch(client, batchId, rows.slice(i, i + INSERT_BATCH_SIZE));
    }
    for (let i = 0; i < rejected.length; i += INSERT_BATCH_SIZE) {
      await insertRejectedBatch(client, batchId, rejected.slice(i, i + INSERT_BATCH_SIZE));
    }

    /**
     * Cada corrida trae el snapshot vigente completo de ese periodo -- un proyecto que ya no
     * aparece en la respuesta (retirado, o el propio Congreso lo quitó del listado) debe
     * desaparecer de la tabla, no quedarse "vigente" indefinidamente solo porque su fila no fue
     * tocada en esta corrida (hallazgo real de Copilot: el `ON CONFLICT` nunca borraba nada).
     * Cualquier fila de este `per_par_id` cuyo `source_batch_id` no sea el de esta corrida no fue
     * re-confirmada por la fuente -- se elimina, en la misma transacción.
     */
    await client.query(
      "DELETE FROM legislativo_congreso_proyectos WHERE per_par_id = $1 AND source_batch_id <> $2",
      [perParId, batchId]
    );

    await client.query("UPDATE raw_congreso_batches SET record_count = $1 WHERE id = $2", [rows.length, batchId]);

    await client.query("COMMIT");
    return { perParId, batchId, filasOrigen: rawRows.length, filasInsertadas: rows.length, filasRechazadas: rejected.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Ingiere todos los periodos parlamentarios que el propio catálogo del Congreso declara
 * válidos (`GET /periodo-parlamentario`) -- si un periodo falla, los demás igual se intentan;
 * los errores se acumulan y se lanzan al final para no dejar el fallo en silencio.
 */
export async function ingestCongreso(): Promise<IngestSummary> {
  const periodosDescubiertos = await fetchPeriodosValidos();
  const periodos: PeriodoIngestSummary[] = [];
  const errores: string[] = [];

  for (const perParId of periodosDescubiertos) {
    try {
      periodos.push(await ingestPeriodo(perParId));
    } catch (error) {
      errores.push(`periodo ${perParId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (errores.length > 0) {
    throw new Error(`Fallaron ${errores.length} de ${periodosDescubiertos.length} periodo(s): ${errores.join("; ")}`);
  }

  return { periodosDescubiertos, periodos };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestCongreso()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
