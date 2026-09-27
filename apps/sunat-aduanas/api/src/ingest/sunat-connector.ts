/**
 * Conector SUNAT — ingiere los XLSX del Anuario de Comercio Exterior.
 *
 * Fuentes:
 *   cdro_15: Importaciones CIF por aduana (trimestral + total anual), 2023-2024
 *   cdro_16: Importaciones FOB+CIF por aduana + subpartida, 2023-2024
 *
 * Uso:
 *   npx tsx src/ingest/sunat-connector.ts
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import XLSX from "xlsx";
import { pool } from "../db/pool.js";
import { normalizeCdro15, normalizeCdro16 } from "./normalize.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.SUNAT_DATA_DIR ?? join(__dirname, "..", "..", "..", "data", "sunat");

async function computeChecksum(buf: Buffer): Promise<string> {
  const crypto = await import("crypto");
  return crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16);
}

async function main() {
  console.log("[sunat-connector] Iniciando ingesta SUNAT Aduanas...");
  console.log(`[sunat-connector] Data dir: ${DATA_DIR}`);

  if (!existsSync(DATA_DIR)) {
    console.error(`[sunat-connector] Directorio no encontrado: ${DATA_DIR}`);
    process.exit(1);
  }

  // ---------------------------------------------------------------------------
  // cdro_15 — importaciones por aduana (trimestral + total)
  // ---------------------------------------------------------------------------
  const cdro15Path = join(DATA_DIR, "cdro_15.xlsx");
  if (existsSync(cdro15Path)) {
    const buf = readFileSync(cdro15Path);
    const checksum = await computeChecksum(buf);
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = normalizeCdro15(ws);

    const existing = await pool.query<{ id: string }>(
      "SELECT id FROM raw_batches WHERE source_file = $1 AND checksum = $2",
      ["cdro_15.xlsx", checksum]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      console.log("  [SKIP] cdro_15.xlsx ya ingestado (checksum igual)");
    } else {
      const batch = await pool.query<{ id: string }>(
        `INSERT INTO raw_batches (source_file, year, checksum, row_count)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        ["cdro_15.xlsx", 2024, checksum, data.length]
      );
      const batchId = Number(batch.rows[0].id);

      for (const row of data) {
        await pool.query(
          `INSERT INTO port_imports
             (aduana_code, aduana_name, year, quarter, is_total, value_cif_usd, batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (aduana_code, year, quarter, is_total) DO UPDATE
             SET value_cif_usd = EXCLUDED.value_cif_usd, batch_id = EXCLUDED.batch_id`,
          [row.aduana_code, row.aduana_name, row.year, row.quarter, row.is_total, row.value_cif_usd, batchId]
        );
      }
      console.log(`  cdro_15.xlsx: ${data.length} filas ingestadas`);
    }
  } else {
    console.log("  [SKIP] cdro_15.xlsx no encontrado");
  }

  // ---------------------------------------------------------------------------
  // cdro_16 — importaciones por aduana + subpartida
  // ---------------------------------------------------------------------------
  const cdro16Path = join(DATA_DIR, "cdro_16.xlsx");
  if (existsSync(cdro16Path)) {
    const buf = readFileSync(cdro16Path);
    const checksum = await computeChecksum(buf);
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = normalizeCdro16(ws);

    const existing = await pool.query<{ id: string }>(
      "SELECT id FROM raw_batches WHERE source_file = $1 AND checksum = $2",
      ["cdro_16.xlsx", checksum]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      console.log("  [SKIP] cdro_16.xlsx ya ingestado (checksum igual)");
    } else {
      const batch = await pool.query<{ id: string }>(
        `INSERT INTO raw_batches (source_file, year, checksum, row_count)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        ["cdro_16.xlsx", 2024, checksum, data.length]
      );
      const batchId = Number(batch.rows[0].id);

      for (const row of data) {
        await pool.query(
          `INSERT INTO port_subpartida_imports
             (aduana_code, aduana_name, year, subpartida, product_desc,
              value_fob_usd, value_cif_usd, pct_change, pct_structure, batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           ON CONFLICT (aduana_code, year, subpartida) DO UPDATE
             SET value_fob_usd = EXCLUDED.value_fob_usd,
                 value_cif_usd = EXCLUDED.value_cif_usd,
                 batch_id = EXCLUDED.batch_id`,
          [
            row.aduana_code, row.aduana_name, row.year, row.subpartida, row.product_desc,
            row.value_fob_usd, row.value_cif_usd, row.pct_change, row.pct_structure, batchId,
          ]
        );
      }
      console.log(`  cdro_16.xlsx: ${data.length} filas ingestadas`);
    }
  } else {
    console.log("  [SKIP] cdro_16.xlsx no encontrado");
  }

  await pool.end();
  console.log("[sunat-connector] Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[sunat-connector] Error:", err);
  process.exit(1);
});
