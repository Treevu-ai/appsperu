import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeResiduos, type CanonicalResiduos, type RejectedRow } from "./normalize.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const FILE_URL =
  "https://www.datosabiertos.gob.pe/sites/default/files/1.%20Dataset%20Generaci%C3%B3n%20anual%20de%20residuos%20s%C3%B3lidos%20domiciliarios%20y%20municipales.csv";

const INSERT_BATCH_SIZE = 1000;

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function saveRawBatch(client: PoolClient, checksum: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_residuos_solidos_batches (source_url, checksum, record_count) VALUES ($1, $2, $3) RETURNING id`,
    [FILE_URL, checksum, recordCount]
  );
  return result.rows[0].id;
}

const INSERT_COLUMNS = [
  "ubigeo", "anio", "departamento", "provincia", "distrito", "region_natural",
  "tipo_municipalidad", "poblacion_total", "poblacion_urbana", "poblacion_rural",
  "clasificacion_municipal_mef", "generacion_percapita_dom", "generacion_dom_urbana_tdia",
  "generacion_dom_urbana_tanio", "generacion_mun_tanio", "generacion_mun_tdia",
  "generacion_percapita_mun", "fecha_corte", "source_batch_id",
] as const;

async function insertBatch(client: PoolClient, batchId: number, rows: readonly CanonicalResiduos[]): Promise<void> {
  if (rows.length === 0) return;

  const byKey = new Map(rows.map((row) => [`${row.ubigeo}|${row.anio}`, row]));
  const deduped = [...byKey.values()];

  const values: unknown[] = [];
  const tuples: string[] = [];
  deduped.forEach((row, i) => {
    const base = i * INSERT_COLUMNS.length;
    tuples.push(`(${INSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.ubigeo, row.anio, row.departamento, row.provincia, row.distrito, row.regionNatural,
      row.tipoMunicipalidad, row.poblacionTotal, row.poblacionUrbana, row.poblacionRural,
      row.clasificacionMunicipalMef, row.generacionPercapitaDom, row.generacionDomUrbanaTdia,
      row.generacionDomUrbanaTanio, row.generacionMunTanio, row.generacionMunTdia,
      row.generacionPercapitaMun, row.fechaCorte, batchId
    );
  });

  await client.query(
    `INSERT INTO residuos_solidos_municipales (${INSERT_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (ubigeo, anio) DO UPDATE SET
       departamento = EXCLUDED.departamento, provincia = EXCLUDED.provincia, distrito = EXCLUDED.distrito,
       region_natural = EXCLUDED.region_natural, tipo_municipalidad = EXCLUDED.tipo_municipalidad,
       poblacion_total = EXCLUDED.poblacion_total, poblacion_urbana = EXCLUDED.poblacion_urbana,
       poblacion_rural = EXCLUDED.poblacion_rural, clasificacion_municipal_mef = EXCLUDED.clasificacion_municipal_mef,
       generacion_percapita_dom = EXCLUDED.generacion_percapita_dom,
       generacion_dom_urbana_tdia = EXCLUDED.generacion_dom_urbana_tdia,
       generacion_dom_urbana_tanio = EXCLUDED.generacion_dom_urbana_tanio,
       generacion_mun_tanio = EXCLUDED.generacion_mun_tanio, generacion_mun_tdia = EXCLUDED.generacion_mun_tdia,
       generacion_percapita_mun = EXCLUDED.generacion_percapita_mun, fecha_corte = EXCLUDED.fecha_corte,
       source_batch_id = EXCLUDED.source_batch_id`,
    values
  );
}

async function insertRejectedBatch(client: PoolClient, batchId: number, rejected: readonly RejectedRow[]): Promise<void> {
  for (const bad of rejected) {
    await client.query(`INSERT INTO residuos_solidos_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`, [
      batchId,
      JSON.stringify(bad.raw),
      bad.reason,
    ]);
  }
}

export interface IngestSummary {
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export async function ingestResiduos(): Promise<IngestSummary> {
  const res = await fetch(FILE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MINAM/PNDA devolvió ${res.status} al descargar ${FILE_URL}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const csvText = buffer.toString("utf-8");

  const rawRows = parse(csvText, {
    columns: true,
    delimiter: ";",
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];

  const { rows, rejected } = normalizeResiduos(rawRows);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, checksumOf(csvText), rawRows.length);

    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      await insertBatch(client, batchId, rows.slice(i, i + INSERT_BATCH_SIZE));
    }
    for (let i = 0; i < rejected.length; i += INSERT_BATCH_SIZE) {
      await insertRejectedBatch(client, batchId, rejected.slice(i, i + INSERT_BATCH_SIZE));
    }

    await client.query("COMMIT");
    return { batchId, filasOrigen: rawRows.length, filasInsertadas: rows.length, filasRechazadas: rejected.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestResiduos()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
