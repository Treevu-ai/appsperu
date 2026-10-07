import type { NeonRow } from "../../db/neon-pool.js";
import type { ToolHandlerContext, HandlerResult } from "../registry.js";

interface MaxIngestedRow extends NeonRow {
  max_ingested: string | null;
}

interface RawBatchRow extends NeonRow {
  source_file: string;
  year: number;
  row_count: number;
  ingested_at: string;
}

interface CountRow extends NeonRow {
  count: string;
}

/**
 * Handler para `sunat_aduanas_meta_freshness` — GET /api/meta/freshness.
 * Origen: apps/sunat-aduanas/api/src/routes/meta.ts.
 */
export async function freshness(ctx: ToolHandlerContext): Promise<HandlerResult> {
  const { db } = ctx;

  const { rows } = await db.query<MaxIngestedRow>(
    `SELECT MAX(ingested_at) as max_ingested FROM raw_batches`
  );

  const lastBatch = await db.query<RawBatchRow>(
    `SELECT source_file, year, row_count, ingested_at
     FROM raw_batches
     ORDER BY ingested_at DESC LIMIT 1`
  );

  const totalImports = await db.query<CountRow>(
    `SELECT COUNT(*) as count FROM port_imports`
  );
  const totalSubpartidas = await db.query<CountRow>(
    `SELECT COUNT(*) as count FROM port_subpartida_imports`
  );

  return {
    status: 200,
    body: {
      last_ingested_at: rows[0]?.max_ingested ?? null,
      stats: {
        port_imports_rows: Number(totalImports.rows[0]?.count ?? 0),
        subpartida_rows: Number(totalSubpartidas.rows[0]?.count ?? 0),
      },
      source_files: lastBatch.rows,
      fuente: "SUNAT Anuario de Comercio Exterior",
      url_fuente: "https://www.sunat.gob.pe/estad-comExt/modelo_web/web_estadistica.htm",
    },
  };
}
