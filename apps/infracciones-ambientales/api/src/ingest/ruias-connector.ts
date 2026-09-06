import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeInfracciones, type CanonicalInfraccion, type RejectedRow } from "./normalize.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

// Confirmado en vivo 2026-09-06: el dataset no resuelve vía `package_show` de CKAN (devuelve
// `result: []` para el slug derivado de la URL) — se usa la URL directa del recurso, igual que
// ya hace `midagri-estadistica-agraria` para varios de sus recursos.
const FILE_URL =
  "https://www.datosabiertos.gob.pe/sites/default/files/1a_Registro%20%C3%9Anico%20de%20Infractores%20Ambientales%20Sancionados.csv";

const INSERT_BATCH_SIZE = 1000;

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function saveRawBatch(client: PoolClient, checksum: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_ruias_batches (source_url, checksum, record_count) VALUES ($1, $2, $3) RETURNING id`,
    [FILE_URL, checksum, recordCount]
  );
  return result.rows[0].id;
}

const INSERT_COLUMNS = [
  "tipo_doc", "id_doc_administrado", "id_doc_enmascarado", "nombre_administrado",
  "unidad_fiscalizable", "subsector_economico", "departamento", "provincia", "distrito",
  "nro_expediente", "nro_rd", "fecha_rd", "fecha_inicio_sup", "fecha_fin_sup", "nro_rd_multa",
  "fecha_rd_multa", "detalle_infraccion", "norma_tipificadora", "tipo_sancion", "tipo_infraccion",
  "medida_dictada", "cantidad_multa", "cantidad_infracciones", "multa_expediente", "fecha_corte",
  "row_hash", "source_batch_id",
] as const;

async function insertBatch(client: PoolClient, batchId: number, rows: readonly CanonicalInfraccion[]): Promise<void> {
  if (rows.length === 0) return;

  // Postgres rechaza un ON CONFLICT DO UPDATE que afecte la misma fila dos veces dentro del
  // mismo statement — la fuente real trae filas exactamente duplicadas (mismo rowHash) dentro
  // de un mismo lote, confirmado en vivo 2026-09-06. Se deduplica por rowHash antes de insertar,
  // mismo patrón que ya usa `identidad-fiscal/padron-connector.ts` con RUC.
  const byHash = new Map(rows.map((row) => [row.rowHash, row]));
  const deduped = [...byHash.values()];

  const values: unknown[] = [];
  const tuples: string[] = [];
  deduped.forEach((row, i) => {
    const base = i * INSERT_COLUMNS.length;
    tuples.push(`(${INSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.tipoDoc, row.idDocAdministrado, row.idDocEnmascarado, row.nombreAdministrado,
      row.unidadFiscalizable, row.subsectorEconomico, row.departamento, row.provincia, row.distrito,
      row.nroExpediente, row.nroRd, row.fechaRd, row.fechaInicioSup, row.fechaFinSup, row.nroRdMulta,
      row.fechaRdMulta, row.detalleInfraccion, row.normaTipificadora, row.tipoSancion, row.tipoInfraccion,
      row.medidaDictada, row.cantidadMulta, row.cantidadInfracciones, row.multaExpediente, row.fechaCorte,
      row.rowHash, batchId
    );
  });

  await client.query(
    `INSERT INTO infracciones_ambientales (${INSERT_COLUMNS.join(",")})
     VALUES ${tuples.join(",")}
     ON CONFLICT (row_hash) DO UPDATE SET source_batch_id = EXCLUDED.source_batch_id`,
    values
  );
}

async function insertRejectedBatch(client: PoolClient, batchId: number, rejected: readonly RejectedRow[]): Promise<void> {
  for (const bad of rejected) {
    await client.query(`INSERT INTO infracciones_ambientales_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`, [
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

export async function ingestRuias(): Promise<IngestSummary> {
  const res = await fetch(FILE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`OEFA/PNDA devolvió ${res.status} al descargar ${FILE_URL}`);
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

  const { rows, rejected } = normalizeInfracciones(rawRows);

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
  ingestRuias()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
