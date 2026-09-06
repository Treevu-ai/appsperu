import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeCemCasos, type CanonicalCemCaso, type RejectedRow } from "./normalize.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * Corte más reciente confirmado en vivo el 2026-09-06 (a diciembre de 2025).
 * El dataset publica un CSV nuevo por corte, sin URL estable — hay que
 * revisar el catálogo cada cierto tiempo para no quedarse en este corte.
 */
const FILE_URL = "https://www.datosabiertos.gob.pe/sites/default/files/2.1.1%20BdD_CEM_Casos_9.csv";

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function saveRawBatch(client: PoolClient, csvText: string, recordCount: number): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_mimp_batches (dataset, source_url, checksum, record_count, payload)
     VALUES ('cem_casos', $1, $2, $3, $4)
     RETURNING id`,
    [FILE_URL, checksumOf(csvText), recordCount, JSON.stringify({ csv: csvText })]
  );
  return result.rows[0].id;
}

async function persistRows(client: PoolClient, rows: readonly CanonicalCemCaso[], batchId: number): Promise<void> {
  for (const row of rows) {
    await client.query(
      `INSERT INTO cem_casos_violencia
         (anio_reporte, periodo, codigo_centro_atencion, nombre_centro_atencion, ubigeo, departamento,
          provincia, distrito, casos_total, casos_hombres, casos_mujeres, casos_violencia_psicologica,
          casos_violencia_fisica, casos_violencia_sexual, casos_violencia_economica, source_batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (anio_reporte, codigo_centro_atencion) DO UPDATE SET
         casos_total = EXCLUDED.casos_total,
         casos_hombres = EXCLUDED.casos_hombres,
         casos_mujeres = EXCLUDED.casos_mujeres,
         casos_violencia_psicologica = EXCLUDED.casos_violencia_psicologica,
         casos_violencia_fisica = EXCLUDED.casos_violencia_fisica,
         casos_violencia_sexual = EXCLUDED.casos_violencia_sexual,
         casos_violencia_economica = EXCLUDED.casos_violencia_economica,
         source_batch_id = EXCLUDED.source_batch_id`,
      [
        row.anioReporte, row.periodo, row.codigoCentroAtencion, row.nombreCentroAtencion, row.ubigeo,
        row.departamento, row.provincia, row.distrito, row.casosTotal, row.casosHombres, row.casosMujeres,
        row.casosViolenciaPsicologica, row.casosViolenciaFisica, row.casosViolenciaSexual,
        row.casosViolenciaEconomica, batchId,
      ]
    );
  }
}

async function persistRejected(client: PoolClient, rejected: readonly RejectedRow[], batchId: number): Promise<void> {
  for (const bad of rejected) {
    await client.query(
      `INSERT INTO cem_casos_violencia_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`,
      [batchId, JSON.stringify(bad.raw), bad.reason]
    );
  }
}

export interface CemIngestSummary {
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
  filasRechazadas: number;
}

export async function ingestCemCasos(): Promise<CemIngestSummary> {
  const res = await fetch(FILE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MIMP devolvió ${res.status} al descargar ${FILE_URL}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  // Confirmado en vivo: Latin-1 (igual que INFOMIDIS, a diferencia de RENIPRESS que es UTF-8 con BOM).
  const csvText = buffer.toString("latin1");

  const rawRows = parse(csvText, {
    columns: true,
    delimiter: ";",
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];

  const { rows, rejected } = normalizeCemCasos(rawRows);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, csvText, rawRows.length);
    await persistRows(client, rows, batchId);
    await persistRejected(client, rejected, batchId);
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
  ingestCemCasos()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
