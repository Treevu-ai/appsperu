import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeCandidatosErm, type CanonicalCandidato, type RawCandidatoRow, type RejectedRow } from "./normalize.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// Ver el comentario de alcance en `db/migrations/001_init.sql`: no existe un
// dataset abierto oficial de candidatos ERM 2026; esta URL es una
// republicación de terceros (Datapol), verificada en vivo el 2026-09-10 como
// JSON estático sin protección anti-bot, derivado de las hojas de vida que
// el propio JNE hace públicas. Si esta URL deja de responder o cambia de
// forma, este conector debe fallar de forma visible (lanzar), nunca
// interpretar una forma inesperada como "cero candidatos".
const CANDIDATOS_JSON_URL =
  "https://datapol.lat/articulos/erm-2026-candidatos/buscador/data/candidatos.json";

const INSERT_BATCH_SIZE = 500;

interface TipoDef {
  id: number;
  nombre: string;
}

interface CandidateTuple extends Array<unknown> {
  0: number; // pos
  1: string; // nombre
  2: string; // dni
  3: string; // cargo
  4: string | null; // sexo
  5: number | null; // edad
  6: string | null; // provConsejero
  7: string | null; // estado
  8: number | null; // edu
  9: number | null; // sent
}

interface ListaDef {
  org: string;
  estado: string;
  cands: CandidateTuple[];
}

interface CircunscripcionDef {
  ubi: string;
  dep: string;
  prov: string;
  dist: string;
  listas: ListaDef[];
}

interface CandidatosJsonShape {
  generado: string;
  total_candidatos: number;
  tipos: TipoDef[];
  circ: Record<string, Record<string, CircunscripcionDef>>;
}

/**
 * Aplana la estructura anidada (tipo → ubigeo → lista → candidatos) a filas
 * planas, una por persona por lista/cargo — la misma forma que se usó a mano
 * el 2026-09-10 para el cruce de La Libertad y Lima, ahora reproducible.
 */
export function flattenCandidatosJson(data: CandidatosJsonShape): RawCandidatoRow[] {
  const tipoNombrePorId = new Map(data.tipos.map((t) => [String(t.id), t.nombre]));
  const rows: RawCandidatoRow[] = [];

  for (const [tipoId, ubigeos] of Object.entries(data.circ)) {
    const tipoNombre = tipoNombrePorId.get(tipoId) ?? null;
    for (const circ of Object.values(ubigeos)) {
      for (const lista of circ.listas) {
        for (const c of lista.cands) {
          rows.push({
            dni: c[2],
            nombre: c[1],
            cargo: c[3],
            tipo: tipoNombre,
            org: lista.org,
            orgEstado: lista.estado,
            estado: c[7],
            ubigeo: circ.ubi,
            departamento: circ.dep,
            provincia: circ.prov,
            distrito: circ.dist,
            posicion: c[0],
            sexo: c[4],
            edad: c[5],
            provinciaConsejero: c[6],
            sentenciasDeclaradas: c[9],
          });
        }
      }
    }
  }

  return rows;
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function saveRawBatch(client: PoolClient, sourceUrl: string, checksum: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_candidatos_erm_batches (source_url, checksum, record_count)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [sourceUrl, checksum, recordCount]
  );
  return result.rows[0].id;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function persistRejected(client: PoolClient, rejected: readonly RejectedRow[], batchId: number): Promise<void> {
  for (const batch of chunk(rejected as RejectedRow[], INSERT_BATCH_SIZE)) {
    await client.query(
      `INSERT INTO candidatos_erm_rejected (source_batch_id, raw_row, reason)
       SELECT $1, r.raw_row, r.reason
       FROM jsonb_to_recordset($2::jsonb) AS r(raw_row jsonb, reason text)`,
      [batchId, JSON.stringify(batch.map((r) => ({ raw_row: r.raw, reason: r.reason })))]
    );
  }
}

async function persistRows(client: PoolClient, rows: readonly CanonicalCandidato[], batchId: number): Promise<void> {
  const payload = rows.map((row) => ({
    dni: row.dni,
    nombre_completo: row.nombreCompleto,
    cargo: row.cargo,
    tipo_eleccion: row.tipoEleccion,
    organizacion_politica: row.organizacionPolitica,
    organizacion_estado: row.organizacionEstado,
    estado: row.estado,
    ubigeo: row.ubigeo,
    departamento: row.departamento,
    provincia: row.provincia,
    distrito: row.distrito,
    posicion: row.posicion,
    sexo: row.sexo,
    edad: row.edad,
    provincia_consejero: row.provinciaConsejero,
    sentencias_declaradas: row.sentenciasDeclaradas,
    source_batch_id: batchId,
  }));

  for (const batch of chunk(payload, INSERT_BATCH_SIZE)) {
    await client.query(
      `INSERT INTO candidatos_erm
         (dni, nombre_completo, cargo, tipo_eleccion, organizacion_politica, organizacion_estado,
          estado, ubigeo, departamento, provincia, distrito, posicion, sexo, edad,
          provincia_consejero, sentencias_declaradas, source_batch_id)
       SELECT r.dni, r.nombre_completo, r.cargo, r.tipo_eleccion, r.organizacion_politica, r.organizacion_estado,
              r.estado, r.ubigeo, r.departamento, r.provincia, r.distrito, r.posicion, r.sexo, r.edad,
              r.provincia_consejero, r.sentencias_declaradas, r.source_batch_id
       FROM jsonb_to_recordset($1::jsonb) AS r(
              dni text, nombre_completo text, cargo text, tipo_eleccion text,
              organizacion_politica text, organizacion_estado text, estado text, ubigeo text,
              departamento text, provincia text, distrito text, posicion integer, sexo text,
              edad integer, provincia_consejero text, sentencias_declaradas integer,
              source_batch_id bigint)
       ON CONFLICT (dni, tipo_eleccion, ubigeo, cargo, organizacion_politica) DO UPDATE SET
         nombre_completo = EXCLUDED.nombre_completo,
         organizacion_estado = EXCLUDED.organizacion_estado,
         estado = EXCLUDED.estado,
         departamento = EXCLUDED.departamento,
         provincia = EXCLUDED.provincia,
         distrito = EXCLUDED.distrito,
         posicion = EXCLUDED.posicion,
         sexo = EXCLUDED.sexo,
         edad = EXCLUDED.edad,
         provincia_consejero = EXCLUDED.provincia_consejero,
         sentencias_declaradas = EXCLUDED.sentencias_declaradas,
         source_batch_id = EXCLUDED.source_batch_id`,
      [JSON.stringify(batch)]
    );
  }
}

export interface CandidatosIngestSummary {
  sourceUrl: string;
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export async function ingestCandidatosErm(): Promise<CandidatosIngestSummary> {
  const res = await fetch(CANDIDATOS_JSON_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Datapol devolvió ${res.status} al descargar ${CANDIDATOS_JSON_URL}`);
  }
  const text = await res.text();
  const data = JSON.parse(text) as CandidatosJsonShape;

  if (!data.circ || !data.tipos || data.tipos.length === 0) {
    throw new Error(
      "El JSON de Datapol no tiene la forma esperada (falta 'circ' o 'tipos') — la fuente pudo haber cambiado de estructura."
    );
  }

  const rawRows = flattenCandidatosJson(data);
  const { rows, rejected } = normalizeCandidatosErm(rawRows);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, CANDIDATOS_JSON_URL, checksumOf(text), rawRows.length);
    await persistRows(client, rows, batchId);
    await persistRejected(client, rejected, batchId);
    await client.query("COMMIT");

    return { sourceUrl: CANDIDATOS_JSON_URL, batchId, filasOrigen: rawRows.length, filasInsertadas: rows.length, filasRechazadas: rejected.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestCandidatosErm()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
