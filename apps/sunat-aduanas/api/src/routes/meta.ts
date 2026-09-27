import { Router } from "express";
import { pool } from "../db/pool.js";
import { asyncHandler } from "../lib/async-handler.js";

export const metaRouter = Router();

/** Freshness de la última ingesta */
metaRouter.get(
  "/freshness",
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query<{ max_ingested: Date | null }>(
      `SELECT MAX(ingested_at) as max_ingested FROM raw_batches`
    );

    const lastBatch = await pool.query<{
      source_file: string;
      year: number;
      row_count: number;
      ingested_at: Date;
    }>(
      `SELECT source_file, year, row_count, ingested_at
       FROM raw_batches
       ORDER BY ingested_at DESC LIMIT 1`
    );

    const totalImports = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM port_imports`
    );
    const totalSubpartidas = await pool.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM port_subpartida_imports`
    );

    res.json({
      last_ingested_at: rows[0]?.max_ingested ?? null,
      stats: {
        port_imports_rows: Number(totalImports.rows[0]?.count ?? 0),
        subpartida_rows: Number(totalSubpartidas.rows[0]?.count ?? 0),
      },
      source_files: lastBatch.rows,
      fuente: "SUNAT Anuario de Comercio Exterior",
      url_fuente: "https://www.sunat.gob.pe/estad-comExt/modelo_web/web_estadistica.htm",
    });
  })
);
