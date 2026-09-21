import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeTrayectoria, type CanonicalTrayectoria, type RejectedRow } from "./normalize-siagie.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * URLs directas confirmadas en vivo 2026-09-20/21 -- el dataset CKAN ("Matriculación y
 * Trayectoria Estudiantil 2021-2024") no resuelve por slug simple contra `package_show`, se
 * necesita el id interno o la URL directa del recurso; mismo criterio ya documentado en
 * `infracciones-ambientales/ruias-connector.ts` para otro dataset del mismo portal. Un archivo
 * por año lectivo -- no hay forma de traer los 4 años en una sola descarga.
 */
const SOURCE_URLS: Record<number, string> = {
  2021: "https://www.datosabiertos.gob.pe/sites/default/files/Matriculaci%C3%B3n%20y%20Trayectoria%20Estudiantil%202021.csv",
  2022: "https://www.datosabiertos.gob.pe/sites/default/files/Matriculaci%C3%B3n%20y%20Trayectoria%20Estudiantil%202022.csv",
  2023: "https://www.datosabiertos.gob.pe/sites/default/files/Matriculaci%C3%B3n%20y%20Trayectoria%20Estudiantil%202023.csv",
  2024: "https://www.datosabiertos.gob.pe/sites/default/files/Matriculaci%C3%B3n%20y%20Trayectoria%20Estudiantil%202024.csv",
};

const INSERT_BATCH_SIZE = 1000;

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function saveRawBatch(client: PoolClient, anio: number, sourceUrl: string, checksum: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_siagie_batches (anio, source_url, checksum, record_count) VALUES ($1, $2, $3, $4)
     ON CONFLICT (anio) DO UPDATE SET source_url = EXCLUDED.source_url, checksum = EXCLUDED.checksum,
       record_count = EXCLUDED.record_count, fetched_at = now()
     RETURNING id`,
    [anio, sourceUrl, checksum, recordCount]
  );
  return result.rows[0].id;
}

const INSERT_COLUMNS = [
  "anio", "cod_mod", "anexo", "nombre", "gestion", "id_nivel", "dsc_nivel", "edad",
  "tipo_disca_integrada", "total_estudiantes", "discapacidad", "mujer", "hombre", "venezolanos",
  "peruanos", "extranjeros", "dni_validado", "dni_sin_validar", "no_dni", "aprobado",
  "desaprobado", "promocion_guiada", "retirado", "fallecido", "requiere_recuperacion",
  "matriculado", "posterga_evaluacion", "tot_atraso", "source_batch_id",
] as const;

async function insertBatch(client: PoolClient, batchId: number, rows: readonly CanonicalTrayectoria[]): Promise<void> {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * INSERT_COLUMNS.length;
    tuples.push(`(${INSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.anio, row.codMod, row.anexo, row.nombre, row.gestion, row.idNivel, row.dscNivel, row.edad,
      row.tipoDiscaIntegrada, row.totalEstudiantes, row.discapacidad, row.mujer, row.hombre, row.venezolanos,
      row.peruanos, row.extranjeros, row.dniValidado, row.dniSinValidar, row.noDni, row.aprobado,
      row.desaprobado, row.promocionGuiada, row.retirado, row.fallecido, row.requiereRecuperacion,
      row.matriculado, row.postergaEvaluacion, row.totAtraso, batchId
    );
  });

  await client.query(
    `INSERT INTO siagie_trayectoria (${INSERT_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (anio, cod_mod, anexo, id_nivel, edad, tipo_disca_integrada) DO UPDATE SET
       nombre = EXCLUDED.nombre, gestion = EXCLUDED.gestion, dsc_nivel = EXCLUDED.dsc_nivel,
       total_estudiantes = EXCLUDED.total_estudiantes, discapacidad = EXCLUDED.discapacidad,
       mujer = EXCLUDED.mujer, hombre = EXCLUDED.hombre, venezolanos = EXCLUDED.venezolanos,
       peruanos = EXCLUDED.peruanos, extranjeros = EXCLUDED.extranjeros,
       dni_validado = EXCLUDED.dni_validado, dni_sin_validar = EXCLUDED.dni_sin_validar,
       no_dni = EXCLUDED.no_dni, aprobado = EXCLUDED.aprobado, desaprobado = EXCLUDED.desaprobado,
       promocion_guiada = EXCLUDED.promocion_guiada, retirado = EXCLUDED.retirado,
       fallecido = EXCLUDED.fallecido, requiere_recuperacion = EXCLUDED.requiere_recuperacion,
       matriculado = EXCLUDED.matriculado, posterga_evaluacion = EXCLUDED.posterga_evaluacion,
       tot_atraso = EXCLUDED.tot_atraso, source_batch_id = EXCLUDED.source_batch_id`,
    values
  );
}

async function insertRejectedBatch(client: PoolClient, batchId: number, rejected: readonly RejectedRow[]): Promise<void> {
  for (const bad of rejected) {
    await client.query(`INSERT INTO siagie_trayectoria_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`, [
      batchId,
      JSON.stringify(bad.raw),
      bad.reason,
    ]);
  }
}

export interface IngestYearSummary {
  anio: number;
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

async function ingestYear(anio: number, sourceUrl: string): Promise<IngestYearSummary> {
  const res = await fetch(sourceUrl, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MINEDU/SIAGIE devolvió ${res.status} al descargar ${sourceUrl}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const csvText = buffer.toString("utf-8");

  const rawRows = parse(csvText, {
    columns: true,
    delimiter: ",",
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];

  const { rows, rejected } = normalizeTrayectoria(rawRows, anio);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, anio, sourceUrl, checksumOf(csvText), rawRows.length);

    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      await insertBatch(client, batchId, rows.slice(i, i + INSERT_BATCH_SIZE));
    }
    for (let i = 0; i < rejected.length; i += INSERT_BATCH_SIZE) {
      await insertRejectedBatch(client, batchId, rejected.slice(i, i + INSERT_BATCH_SIZE));
    }

    await client.query("COMMIT");
    return { anio, batchId, filasOrigen: rawRows.length, filasInsertadas: rows.length, filasRechazadas: rejected.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function ingestSiagieTrayectoria(anios: readonly number[] = Object.keys(SOURCE_URLS).map(Number)): Promise<IngestYearSummary[]> {
  const summaries: IngestYearSummary[] = [];
  for (const anio of anios) {
    const sourceUrl = SOURCE_URLS[anio];
    if (!sourceUrl) {
      throw new Error(`No hay URL conocida para el año ${anio} -- agregar a SOURCE_URLS en siagie-connector.ts.`);
    }
    console.log(`[siagie-trayectoria] descargando año ${anio}...`);
    summaries.push(await ingestYear(anio, sourceUrl));
  }
  return summaries;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestSiagieTrayectoria()
    .then((summaries) => {
      console.log(JSON.stringify(summaries, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
