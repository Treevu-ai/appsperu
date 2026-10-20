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
import {
  normalizeCdro15,
  normalizeCdro16,
  NORMALIZER_VERSION_CDRO16,
  normalizeFlatRanking,
  FLAT_RANKING_SHAPES,
  NORMALIZER_VERSION_FLAT_RANKING,
  normalizeCuodeRanking,
  CUODE_RANKING_SHAPES,
  NORMALIZER_VERSION_CUODE_RANKING,
  normalizeSectorRanking,
  SECTOR_RANKING_SHAPES,
  NORMALIZER_VERSION_SECTOR_RANKING,
  normalizeCountryRanking,
  COUNTRY_RANKING_SHAPES,
  NORMALIZER_VERSION_COUNTRY_RANKING,
  normalizeCdro01,
  normalizeCdro03,
  normalizeCdro14,
  NORMALIZER_VERSION_TRADE_SUMMARY,
  normalizeCdro02,
  NORMALIZER_VERSION_COUNTRY_BILATERAL,
  normalizeCdro12,
  normalizeCdro13,
  NORMALIZER_VERSION_CUSTOMS_OPS,
} from "./normalize.js";

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

    // El checksum identifica el ARCHIVO, no el parser que lo produjo: un fix en
    // normalizeCdro16() (como el de NORMALIZER_VERSION_CDRO16 2026-10-05) no cambia el
    // checksum, así que sin el filtro por normalizer_version este SKIP perpetuaría
    // indefinidamente datos producidos por una versión de parser ya corregida.
    const existing = await pool.query<{ id: string }>(
      "SELECT id FROM raw_batches WHERE source_file = $1 AND checksum = $2 AND normalizer_version = $3",
      ["cdro_16.xlsx", checksum, NORMALIZER_VERSION_CDRO16]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      console.log("  [SKIP] cdro_16.xlsx ya ingestado (checksum y version de parser iguales)");
    } else {
      // Puede haber un batch previo del mismo archivo producido por una version de parser
      // vieja (checksum igual, normalizer_version distinta) — sus filas usan una clave de
      // agrupacion distinta (p.ej. texto de descripcion en vez de codigo arancelario) y NO
      // colisionan con el ON CONFLICT de abajo, asi que quedarian duplicadas si no se
      // eliminan explicitamente antes de insertar las nuevas.
      const batchesViejos = await pool.query<{ id: string }>(
        "SELECT id FROM raw_batches WHERE source_file = $1 AND normalizer_version < $2",
        ["cdro_16.xlsx", NORMALIZER_VERSION_CDRO16]
      );
      if (batchesViejos.rowCount && batchesViejos.rowCount > 0) {
        const idsViejos = batchesViejos.rows.map((r) => Number(r.id));
        const { rowCount: filasEliminadas } = await pool.query(
          "DELETE FROM port_subpartida_imports WHERE batch_id = ANY($1)",
          [idsViejos]
        );
        await pool.query("DELETE FROM raw_batches WHERE id = ANY($1)", [idsViejos]);
        console.log(`  cdro_16.xlsx: ${filasEliminadas} filas de version(es) de parser vieja(s) eliminadas`);
      }

      const batch = await pool.query<{ id: string }>(
        `INSERT INTO raw_batches (source_file, year, checksum, row_count, normalizer_version)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        ["cdro_16.xlsx", 2024, checksum, data.length, NORMALIZER_VERSION_CDRO16]
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

  // ---------------------------------------------------------------------------
  // Rankings planos (cdro_07, cdro_08, cdro_09, cdro_20) — Fase 1
  // ---------------------------------------------------------------------------
  for (const shape of Object.values(FLAT_RANKING_SHAPES)) {
    const fileName = `${shape.sourceCdro}.xlsx`;
    const filePath = join(DATA_DIR, fileName);
    if (!existsSync(filePath)) {
      console.log(`  [SKIP] ${fileName} no encontrado`);
      continue;
    }

    const buf = readFileSync(filePath);
    const checksum = await computeChecksum(buf);
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = normalizeFlatRanking(ws, shape);

    const existing = await pool.query<{ id: string }>(
      "SELECT id FROM raw_batches WHERE source_file = $1 AND checksum = $2 AND normalizer_version = $3",
      [fileName, checksum, NORMALIZER_VERSION_FLAT_RANKING]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`  [SKIP] ${fileName} ya ingestado (checksum y version de parser iguales)`);
      continue;
    }

    // Mismo criterio que cdro_16: un batch previo del mismo archivo con una
    // version de parser vieja usa potencialmente otra clave de agrupacion —
    // se elimina explicitamente antes de insertar las filas nuevas.
    const batchesViejos = await pool.query<{ id: string }>(
      "SELECT id FROM raw_batches WHERE source_file = $1 AND normalizer_version < $2",
      [fileName, NORMALIZER_VERSION_FLAT_RANKING]
    );
    if (batchesViejos.rowCount && batchesViejos.rowCount > 0) {
      const idsViejos = batchesViejos.rows.map((r) => Number(r.id));
      const { rowCount: filasEliminadas } = await pool.query(
        "DELETE FROM trade_flat_ranking WHERE batch_id = ANY($1)",
        [idsViejos]
      );
      await pool.query("DELETE FROM raw_batches WHERE id = ANY($1)", [idsViejos]);
      console.log(`  ${fileName}: ${filasEliminadas} filas de version(es) de parser vieja(s) eliminadas`);
    }

    const batch = await pool.query<{ id: string }>(
      `INSERT INTO raw_batches (source_file, year, checksum, row_count, normalizer_version)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [fileName, 2024, checksum, data.length, NORMALIZER_VERSION_FLAT_RANKING]
    );
    const batchId = Number(batch.rows[0].id);

    for (const row of data) {
      await pool.query(
        `INSERT INTO trade_flat_ranking
           (source_cdro, dimension_type, rank, dimension_code, dimension_value,
            year, value_fob_usd, value_cif_usd, pct_change, pct_structure, batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (source_cdro, year, rank) DO UPDATE
           SET value_fob_usd = EXCLUDED.value_fob_usd,
               value_cif_usd = EXCLUDED.value_cif_usd,
               pct_change = EXCLUDED.pct_change,
               pct_structure = EXCLUDED.pct_structure,
               batch_id = EXCLUDED.batch_id`,
        [
          row.source_cdro, row.dimension_type, row.rank, row.dimension_code, row.dimension_value,
          row.year, row.value_fob_usd, row.value_cif_usd, row.pct_change, row.pct_structure, batchId,
        ]
      );
    }
    console.log(`  ${fileName}: ${data.length} filas ingestadas`);
  }

  // ---------------------------------------------------------------------------
  // Rankings con categoría CUODE (cdro_04, cdro_05, cdro_06) — Fase 2
  // ---------------------------------------------------------------------------
  for (const shape of Object.values(CUODE_RANKING_SHAPES)) {
    const fileName = `${shape.sourceCdro}.xlsx`;
    const filePath = join(DATA_DIR, fileName);
    if (!existsSync(filePath)) {
      console.log(`  [SKIP] ${fileName} no encontrado`);
      continue;
    }

    const buf = readFileSync(filePath);
    const checksum = await computeChecksum(buf);
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = normalizeCuodeRanking(ws, shape);

    const existing = await pool.query<{ id: string }>(
      "SELECT id FROM raw_batches WHERE source_file = $1 AND checksum = $2 AND normalizer_version = $3",
      [fileName, checksum, NORMALIZER_VERSION_CUODE_RANKING]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`  [SKIP] ${fileName} ya ingestado (checksum y version de parser iguales)`);
      continue;
    }

    const batchesViejos = await pool.query<{ id: string }>(
      "SELECT id FROM raw_batches WHERE source_file = $1 AND normalizer_version < $2",
      [fileName, NORMALIZER_VERSION_CUODE_RANKING]
    );
    if (batchesViejos.rowCount && batchesViejos.rowCount > 0) {
      const idsViejos = batchesViejos.rows.map((r) => Number(r.id));
      const { rowCount: filasEliminadas } = await pool.query(
        "DELETE FROM trade_cuode_ranking WHERE batch_id = ANY($1)",
        [idsViejos]
      );
      await pool.query("DELETE FROM raw_batches WHERE id = ANY($1)", [idsViejos]);
      console.log(`  ${fileName}: ${filasEliminadas} filas de version(es) de parser vieja(s) eliminadas`);
    }

    const batch = await pool.query<{ id: string }>(
      `INSERT INTO raw_batches (source_file, year, checksum, row_count, normalizer_version)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [fileName, 2024, checksum, data.length, NORMALIZER_VERSION_CUODE_RANKING]
    );
    const batchId = Number(batch.rows[0].id);

    for (const row of data) {
      await pool.query(
        `INSERT INTO trade_cuode_ranking
           (source_cdro, cuode_category, dimension_type, rank, dimension_code, dimension_value,
            year, value_fob_usd, value_cif_usd, pct_change, pct_structure, batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (source_cdro, year, cuode_category, rank) DO UPDATE
           SET value_fob_usd = EXCLUDED.value_fob_usd,
               value_cif_usd = EXCLUDED.value_cif_usd,
               pct_change = EXCLUDED.pct_change,
               pct_structure = EXCLUDED.pct_structure,
               batch_id = EXCLUDED.batch_id`,
        [
          row.source_cdro, row.cuode_category, row.dimension_type, row.rank, row.dimension_code,
          row.dimension_value, row.year, row.value_fob_usd, row.value_cif_usd, row.pct_change,
          row.pct_structure, batchId,
        ]
      );
    }
    console.log(`  ${fileName}: ${data.length} filas ingestadas`);
  }

  // ---------------------------------------------------------------------------
  // Rankings con sector económico embebido (cdro_18, cdro_19) — Fase 2
  // ---------------------------------------------------------------------------
  for (const shape of Object.values(SECTOR_RANKING_SHAPES)) {
    const fileName = `${shape.sourceCdro}.xlsx`;
    const filePath = join(DATA_DIR, fileName);
    if (!existsSync(filePath)) {
      console.log(`  [SKIP] ${fileName} no encontrado`);
      continue;
    }

    const buf = readFileSync(filePath);
    const checksum = await computeChecksum(buf);
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = normalizeSectorRanking(ws, shape);

    const existing = await pool.query<{ id: string }>(
      "SELECT id FROM raw_batches WHERE source_file = $1 AND checksum = $2 AND normalizer_version = $3",
      [fileName, checksum, NORMALIZER_VERSION_SECTOR_RANKING]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`  [SKIP] ${fileName} ya ingestado (checksum y version de parser iguales)`);
      continue;
    }

    const batchesViejos = await pool.query<{ id: string }>(
      "SELECT id FROM raw_batches WHERE source_file = $1 AND normalizer_version < $2",
      [fileName, NORMALIZER_VERSION_SECTOR_RANKING]
    );
    if (batchesViejos.rowCount && batchesViejos.rowCount > 0) {
      const idsViejos = batchesViejos.rows.map((r) => Number(r.id));
      const { rowCount: filasEliminadas } = await pool.query(
        "DELETE FROM trade_sector_ranking WHERE batch_id = ANY($1)",
        [idsViejos]
      );
      await pool.query("DELETE FROM raw_batches WHERE id = ANY($1)", [idsViejos]);
      console.log(`  ${fileName}: ${filasEliminadas} filas de version(es) de parser vieja(s) eliminadas`);
    }

    const batch = await pool.query<{ id: string }>(
      `INSERT INTO raw_batches (source_file, year, checksum, row_count, normalizer_version)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [fileName, 2024, checksum, data.length, NORMALIZER_VERSION_SECTOR_RANKING]
    );
    const batchId = Number(batch.rows[0].id);

    for (const row of data) {
      await pool.query(
        `INSERT INTO trade_sector_ranking
           (source_cdro, sector_category, dimension_type, rank, dimension_code, dimension_value,
            year, value_fob_usd, pct_change, pct_structure, batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (source_cdro, year, sector_category, rank) DO UPDATE
           SET value_fob_usd = EXCLUDED.value_fob_usd,
               pct_change = EXCLUDED.pct_change,
               pct_structure = EXCLUDED.pct_structure,
               batch_id = EXCLUDED.batch_id`,
        [
          row.source_cdro, row.sector_category, row.dimension_type, row.rank, row.dimension_code,
          row.dimension_value, row.year, row.value_fob_usd, row.pct_change, row.pct_structure, batchId,
        ]
      );
    }
    console.log(`  ${fileName}: ${data.length} filas ingestadas`);
  }

  // ---------------------------------------------------------------------------
  // Rankings por país (cdro_10, cdro_11, cdro_21, cdro_22) — Fase 3
  // ---------------------------------------------------------------------------
  for (const shape of Object.values(COUNTRY_RANKING_SHAPES)) {
    const fileName = `${shape.sourceCdro}.xlsx`;
    const filePath = join(DATA_DIR, fileName);
    if (!existsSync(filePath)) {
      console.log(`  [SKIP] ${fileName} no encontrado`);
      continue;
    }

    const buf = readFileSync(filePath);
    const checksum = await computeChecksum(buf);
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = normalizeCountryRanking(ws, shape);

    const existing = await pool.query<{ id: string }>(
      "SELECT id FROM raw_batches WHERE source_file = $1 AND checksum = $2 AND normalizer_version = $3",
      [fileName, checksum, NORMALIZER_VERSION_COUNTRY_RANKING]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`  [SKIP] ${fileName} ya ingestado (checksum y version de parser iguales)`);
      continue;
    }

    const batchesViejos = await pool.query<{ id: string }>(
      "SELECT id FROM raw_batches WHERE source_file = $1 AND normalizer_version < $2",
      [fileName, NORMALIZER_VERSION_COUNTRY_RANKING]
    );
    if (batchesViejos.rowCount && batchesViejos.rowCount > 0) {
      const idsViejos = batchesViejos.rows.map((r) => Number(r.id));
      const { rowCount: filasEliminadas } = await pool.query(
        "DELETE FROM trade_country_ranking WHERE batch_id = ANY($1)",
        [idsViejos]
      );
      await pool.query("DELETE FROM raw_batches WHERE id = ANY($1)", [idsViejos]);
      console.log(`  ${fileName}: ${filasEliminadas} filas de version(es) de parser vieja(s) eliminadas`);
    }

    const batch = await pool.query<{ id: string }>(
      `INSERT INTO raw_batches (source_file, year, checksum, row_count, normalizer_version)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [fileName, 2024, checksum, data.length, NORMALIZER_VERSION_COUNTRY_RANKING]
    );
    const batchId = Number(batch.rows[0].id);

    for (const row of data) {
      await pool.query(
        `INSERT INTO trade_country_ranking
           (source_cdro, country, dimension_type, rank, dimension_code, dimension_value,
            year, value_fob_usd, value_cif_usd, pct_change, pct_structure, batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (source_cdro, year, country, rank) DO UPDATE
           SET value_fob_usd = EXCLUDED.value_fob_usd,
               value_cif_usd = EXCLUDED.value_cif_usd,
               pct_change = EXCLUDED.pct_change,
               pct_structure = EXCLUDED.pct_structure,
               batch_id = EXCLUDED.batch_id`,
        [
          row.source_cdro, row.country, row.dimension_type, row.rank, row.dimension_code,
          row.dimension_value, row.year, row.value_fob_usd, row.value_cif_usd, row.pct_change,
          row.pct_structure, batchId,
        ]
      );
    }
    console.log(`  ${fileName}: ${data.length} filas ingestadas`);
  }

  // ---------------------------------------------------------------------------
  // trade_summary (cdro_01, cdro_03, cdro_14) — Fase 4
  // ---------------------------------------------------------------------------
  const summaryNormalizers: Record<string, (ws: XLSX.WorkSheet) => ReturnType<typeof normalizeCdro01>> = {
    cdro_01: normalizeCdro01,
    cdro_03: normalizeCdro03,
    cdro_14: normalizeCdro14,
  };
  for (const [sourceCdro, normalizer] of Object.entries(summaryNormalizers)) {
    const fileName = `${sourceCdro}.xlsx`;
    const filePath = join(DATA_DIR, fileName);
    if (!existsSync(filePath)) {
      console.log(`  [SKIP] ${fileName} no encontrado`);
      continue;
    }

    const buf = readFileSync(filePath);
    const checksum = await computeChecksum(buf);
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = normalizer(ws);

    const existing = await pool.query<{ id: string }>(
      "SELECT id FROM raw_batches WHERE source_file = $1 AND checksum = $2 AND normalizer_version = $3",
      [fileName, checksum, NORMALIZER_VERSION_TRADE_SUMMARY]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`  [SKIP] ${fileName} ya ingestado (checksum y version de parser iguales)`);
      continue;
    }

    const batchesViejos = await pool.query<{ id: string }>(
      "SELECT id FROM raw_batches WHERE source_file = $1 AND normalizer_version < $2",
      [fileName, NORMALIZER_VERSION_TRADE_SUMMARY]
    );
    if (batchesViejos.rowCount && batchesViejos.rowCount > 0) {
      const idsViejos = batchesViejos.rows.map((r) => Number(r.id));
      const { rowCount: filasEliminadas } = await pool.query(
        "DELETE FROM trade_summary WHERE batch_id = ANY($1)",
        [idsViejos]
      );
      await pool.query("DELETE FROM raw_batches WHERE id = ANY($1)", [idsViejos]);
      console.log(`  ${fileName}: ${filasEliminadas} filas de version(es) de parser vieja(s) eliminadas`);
    }

    const batch = await pool.query<{ id: string }>(
      `INSERT INTO raw_batches (source_file, year, checksum, row_count, normalizer_version)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [fileName, 2024, checksum, data.length, NORMALIZER_VERSION_TRADE_SUMMARY]
    );
    const batchId = Number(batch.rows[0].id);

    for (const row of data) {
      await pool.query(
        `INSERT INTO trade_summary
           (source_cdro, category_path, item_code, item_label, year, value_usd, pct_change, pct_metric, batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (source_cdro, year, category_path, item_label) DO UPDATE
           SET value_usd = EXCLUDED.value_usd,
               pct_change = EXCLUDED.pct_change,
               pct_metric = EXCLUDED.pct_metric,
               batch_id = EXCLUDED.batch_id`,
        [
          row.source_cdro, row.category_path, row.item_code, row.item_label,
          row.year, row.value_usd, row.pct_change, row.pct_metric, batchId,
        ]
      );
    }
    console.log(`  ${fileName}: ${data.length} filas ingestadas`);
  }

  // ---------------------------------------------------------------------------
  // trade_country_bilateral (cdro_02) — Fase 4
  // ---------------------------------------------------------------------------
  {
    const fileName = "cdro_02.xlsx";
    const filePath = join(DATA_DIR, fileName);
    if (!existsSync(filePath)) {
      console.log(`  [SKIP] ${fileName} no encontrado`);
    } else {
      const buf = readFileSync(filePath);
      const checksum = await computeChecksum(buf);
      const wb = XLSX.read(buf, { type: "buffer" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = normalizeCdro02(ws);

      const existing = await pool.query<{ id: string }>(
        "SELECT id FROM raw_batches WHERE source_file = $1 AND checksum = $2 AND normalizer_version = $3",
        [fileName, checksum, NORMALIZER_VERSION_COUNTRY_BILATERAL]
      );
      if (existing.rowCount && existing.rowCount > 0) {
        console.log(`  [SKIP] ${fileName} ya ingestado (checksum y version de parser iguales)`);
      } else {
        const batchesViejos = await pool.query<{ id: string }>(
          "SELECT id FROM raw_batches WHERE source_file = $1 AND normalizer_version < $2",
          [fileName, NORMALIZER_VERSION_COUNTRY_BILATERAL]
        );
        if (batchesViejos.rowCount && batchesViejos.rowCount > 0) {
          const idsViejos = batchesViejos.rows.map((r) => Number(r.id));
          const { rowCount: filasEliminadas } = await pool.query(
            "DELETE FROM trade_country_bilateral WHERE batch_id = ANY($1)",
            [idsViejos]
          );
          await pool.query("DELETE FROM raw_batches WHERE id = ANY($1)", [idsViejos]);
          console.log(`  ${fileName}: ${filasEliminadas} filas de version(es) de parser vieja(s) eliminadas`);
        }

        const batch = await pool.query<{ id: string }>(
          `INSERT INTO raw_batches (source_file, year, checksum, row_count, normalizer_version)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [fileName, 2024, checksum, data.length, NORMALIZER_VERSION_COUNTRY_BILATERAL]
        );
        const batchId = Number(batch.rows[0].id);

        for (const row of data) {
          await pool.query(
            `INSERT INTO trade_country_bilateral
               (continent, economic_zone, country, year, export_usd, import_usd, total_usd, pct_change, pct_structure, batch_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (year, continent, economic_zone, country) DO UPDATE
               SET export_usd = EXCLUDED.export_usd,
                   import_usd = EXCLUDED.import_usd,
                   total_usd = EXCLUDED.total_usd,
                   pct_change = EXCLUDED.pct_change,
                   pct_structure = EXCLUDED.pct_structure,
                   batch_id = EXCLUDED.batch_id`,
            [
              row.continent, row.economic_zone, row.country, row.year,
              row.export_usd, row.import_usd, row.total_usd, row.pct_change, row.pct_structure, batchId,
            ]
          );
        }
        console.log(`  ${fileName}: ${data.length} filas ingestadas`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // customs_ops_ranking (cdro_12, cdro_13) — Fase 4
  // ---------------------------------------------------------------------------
  const customsOpsNormalizers: Record<string, (ws: XLSX.WorkSheet) => ReturnType<typeof normalizeCdro12>> = {
    cdro_12: normalizeCdro12,
    cdro_13: normalizeCdro13,
  };
  for (const [sourceCdro, normalizer] of Object.entries(customsOpsNormalizers)) {
    const fileName = `${sourceCdro}.xlsx`;
    const filePath = join(DATA_DIR, fileName);
    if (!existsSync(filePath)) {
      console.log(`  [SKIP] ${fileName} no encontrado`);
      continue;
    }

    const buf = readFileSync(filePath);
    const checksum = await computeChecksum(buf);
    const wb = XLSX.read(buf, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = normalizer(ws);

    const existing = await pool.query<{ id: string }>(
      "SELECT id FROM raw_batches WHERE source_file = $1 AND checksum = $2 AND normalizer_version = $3",
      [fileName, checksum, NORMALIZER_VERSION_CUSTOMS_OPS]
    );
    if (existing.rowCount && existing.rowCount > 0) {
      console.log(`  [SKIP] ${fileName} ya ingestado (checksum y version de parser iguales)`);
      continue;
    }

    const batchesViejos = await pool.query<{ id: string }>(
      "SELECT id FROM raw_batches WHERE source_file = $1 AND normalizer_version < $2",
      [fileName, NORMALIZER_VERSION_CUSTOMS_OPS]
    );
    if (batchesViejos.rowCount && batchesViejos.rowCount > 0) {
      const idsViejos = batchesViejos.rows.map((r) => Number(r.id));
      const { rowCount: filasEliminadas } = await pool.query(
        "DELETE FROM customs_ops_ranking WHERE batch_id = ANY($1)",
        [idsViejos]
      );
      await pool.query("DELETE FROM raw_batches WHERE id = ANY($1)", [idsViejos]);
      console.log(`  ${fileName}: ${filasEliminadas} filas de version(es) de parser vieja(s) eliminadas`);
    }

    const batch = await pool.query<{ id: string }>(
      `INSERT INTO raw_batches (source_file, year, checksum, row_count, normalizer_version)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [fileName, 2024, checksum, data.length, NORMALIZER_VERSION_CUSTOMS_OPS]
    );
    const batchId = Number(batch.rows[0].id);

    for (const row of data) {
      await pool.query(
        `INSERT INTO customs_ops_ranking
           (source_cdro, operator_category, rank, operator_name, year, value_cif_usd, dam_count, duties_usd, batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (source_cdro, year, operator_category, rank) DO UPDATE
           SET value_cif_usd = EXCLUDED.value_cif_usd,
               dam_count = EXCLUDED.dam_count,
               duties_usd = EXCLUDED.duties_usd,
               batch_id = EXCLUDED.batch_id`,
        [
          row.source_cdro, row.operator_category, row.rank, row.operator_name,
          row.year, row.value_cif_usd, row.dam_count, row.duties_usd, batchId,
        ]
      );
    }
    console.log(`  ${fileName}: ${data.length} filas ingestadas`);
  }

  await pool.end();
  console.log("[sunat-connector] Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error("[sunat-connector] Error:", err);
  process.exit(1);
});
