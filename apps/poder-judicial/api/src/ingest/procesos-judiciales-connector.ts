import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";
import { parseProcesosJudicialesCsv, NUMERIC_COLUMNS } from "./procesos-judiciales-normalize.js";

/**
 * Estadística jurisdiccional del Poder Judicial — descarga directa de un
 * CSV plano publicado en datosabiertos.gob.pe. A diferencia del resto del
 * catálogo, este dataset NO se resuelve vía CKAN `package_show` (el enlace
 * de descarga es estático en la página del dataset, no un recurso indexado
 * por la API de ese portal) — se referencia la URL directa, confirmada en
 * vivo el 2026-09-20.
 *
 * Mismo WAF (CloudWAF) que el resto de datosabiertos.gob.pe -- user-agent
 * de navegador obligatorio (ver ADR-0018/ADR-0021 de otros conectores del
 * monorepo), aunque a diferencia de RENIPRESS/INFOMIDIS/CENARES no devuelve
 * 418 sino que sirve el archivo directo con un header `Set-Cookie` de sesión
 * WAF que no hace falta reenviar (GET simple, sin sesión real).
 */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const CSV_URL = "https://www.datosabiertos.gob.pe/sites/default/files/dataset_jurisdiccional_a-partir-del-2024.csv";

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

const INSERT_COLUMNS = [
  "anio",
  "mes",
  "distrito_judicial",
  "provincia",
  "distrito",
  "codigo_dependencia",
  "dependencia",
  "estado",
  "tipo_organo",
  "espec_exp",
  "espec_dep",
  "condicion",
  ...NUMERIC_COLUMNS.map((c) => c.toLowerCase()),
  "source_batch_id",
] as const;

const INSERT_BATCH_SIZE = 500;

export interface PoderJudicialIngestSummary {
  sourceUrl: string;
  batchId: number;
  yaIngerido: boolean;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export async function ingestProcesosJudiciales(): Promise<PoderJudicialIngestSummary> {
  const res = await fetch(CSV_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`Poder Judicial devolvió ${res.status} al descargar ${CSV_URL}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  // Confirmado en vivo: Latin-1 ("Apurímac"/"Cañete" llegan corruptos bajo UTF-8 ingenuo).
  const csvText = buffer.toString("latin1");
  const checksum = checksumOf(csvText);

  const client = await pool.connect();
  try {
    const existing = await client.query<{ id: number }>(
      `SELECT id FROM raw_poder_judicial_batches WHERE checksum = $1`,
      [checksum]
    );
    if (existing.rows.length > 0) {
      return {
        sourceUrl: CSV_URL,
        batchId: existing.rows[0].id,
        yaIngerido: true,
        filasOrigen: 0,
        filasInsertadas: 0,
        filasRechazadas: 0,
      };
    }

    const { rows, rejected } = parseProcesosJudicialesCsv(csvText);
    if (rejected.length > 0) {
      console.warn(`Poder Judicial: ${rejected.length} fila(s) rechazada(s) (ver reason por fila).`);
    }

    await client.query("BEGIN");

    const batchResult = await client.query<{ id: number }>(
      `INSERT INTO raw_poder_judicial_batches (source_url, checksum, record_count) VALUES ($1, $2, $3) RETURNING id`,
      [CSV_URL, checksum, rows.length]
    );
    const batchId = batchResult.rows[0].id;

    let inserted = 0;
    let buffer2: unknown[][] = [];

    const flush = async () => {
      if (buffer2.length === 0) return;
      const values: unknown[] = [];
      const tuples: string[] = [];
      buffer2.forEach((row, i) => {
        const base = i * INSERT_COLUMNS.length;
        tuples.push(`(${INSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
        values.push(...row);
      });
      await client.query(
        `INSERT INTO procesos_judiciales_jurisdiccional (${INSERT_COLUMNS.join(",")}) VALUES ${tuples.join(",")}
         ON CONFLICT (anio, mes, codigo_dependencia, tipo_organo, espec_exp, espec_dep, condicion) DO NOTHING`,
        values
      );
      inserted += buffer2.length;
      buffer2 = [];
    };

    for (const row of rows) {
      buffer2.push([
        row.anio,
        row.mes,
        row.distritoJudicial,
        row.provincia,
        row.distrito,
        row.codigoDependencia,
        row.dependencia,
        row.estado,
        row.tipoOrgano,
        row.especExp,
        row.especDep,
        row.condicion,
        ...NUMERIC_COLUMNS.map((c) => row.conteos[c]),
        batchId,
      ]);
      if (buffer2.length >= INSERT_BATCH_SIZE) await flush();
    }
    await flush();

    if (rejected.length > 0) {
      const rejectedValues: unknown[] = [];
      const rejectedTuples: string[] = [];
      rejected.forEach((r, i) => {
        rejectedTuples.push(`($${i * 3 + 1}, $${i * 3 + 2}, $${i * 3 + 3})`);
        rejectedValues.push(batchId, JSON.stringify(r.raw), r.reason);
      });
      await client.query(
        `INSERT INTO poder_judicial_rejected (source_batch_id, raw_row, reason) VALUES ${rejectedTuples.join(",")}`,
        rejectedValues
      );
    }

    await client.query("COMMIT");
    return {
      sourceUrl: CSV_URL,
      batchId,
      yaIngerido: false,
      filasOrigen: rows.length,
      filasInsertadas: inserted,
      filasRechazadas: rejected.length,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestProcesosJudiciales()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
