import { createHash } from "node:crypto";
import { parse } from "csv-parse/sync";
import { pool } from "../db/pool.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const BASE_URL = "https://datosabiertos.mincetur.gob.pe/DGIETA/Indicadores_ocupabilidad";

export type HospedajeIngestSummary = {
  anio: number;
  batchId: number;
  filasOrigen: number;
  filasInsertadas: number;
};

type RawRow = Record<string, string>;

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function parseDecimal(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const normalized = value.replace(",", ".").trim();
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function parseIntSafe(value: string | undefined): number | null {
  if (!value || value.trim() === "") return null;
  const n = Number(value.replace(/\D/g, ""));
  return Number.isFinite(n) ? n : null;
}

function isConsolidatedRow(row: RawRow): boolean {
  const categoria = (row.CATEGORIA ?? "").toUpperCase();
  const idCategoria = (row.ID_CATEGORIA ?? "").toUpperCase();
  return idCategoria === "TT" || categoria.includes("TODAS CONSOLIDADAS");
}

async function fetchCsv(anio: number): Promise<string> {
  const url = `${BASE_URL}_${anio}.csv`;
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MINCETUR devolvió ${res.status} al descargar ${url}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.toString("latin1");
}

export async function ingestMinceturHospedajeYear(anio: number): Promise<HospedajeIngestSummary> {
  const csvText = await fetchCsv(anio);
  const rows = parse(csvText, {
    columns: true,
    delimiter: ";",
    bom: true,
    trim: true,
    skip_empty_lines: true,
    relax_column_count: true,
  }) as RawRow[];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const batchResult = await client.query<{ id: number }>(
      `INSERT INTO raw_mincetur_batches (resource_id, anio, checksum, record_count, payload)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (resource_id, checksum) DO UPDATE SET fetched_at = now()
       RETURNING id`,
      [`mincetur-hospedaje-${anio}`, anio, checksumOf(csvText), rows.length, JSON.stringify({ anio })]
    );
    const batchId = batchResult.rows[0].id;

    let inserted = 0;
    for (const row of rows) {
      if (!isConsolidatedRow(row)) continue;
      const departamento = (row.DEPARTAMENTO ?? "").toUpperCase().trim();
      if (!departamento) continue;

      const mes = parseIntSafe(row.MES);
      if (!mes) continue;

      await client.query(
        `INSERT INTO tourism_hospitality_monthly (
           departamento, id_ubigeo_depto, anio, mes, total_arribos, total_pernoctaciones,
           numero_establecimientos, porcentaje_tnoh, source_batch_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (departamento, anio, mes) DO UPDATE SET
           total_arribos = EXCLUDED.total_arribos,
           total_pernoctaciones = EXCLUDED.total_pernoctaciones,
           numero_establecimientos = EXCLUDED.numero_establecimientos,
           porcentaje_tnoh = EXCLUDED.porcentaje_tnoh,
           source_batch_id = EXCLUDED.source_batch_id`,
        [
          departamento,
          row.ID_UBIGEO ?? "",
          anio,
          mes,
          parseIntSafe(row.TOTAL_ARRIBOS),
          parseIntSafe(row.TOTAL_PERNOCT),
          parseIntSafe(row.NUMERO_ESTABLECIMIENTOS),
          parseDecimal(row.PORCENTAJE_TNOH),
          batchId,
        ]
      );
      inserted += 1;
    }

    await client.query("COMMIT");
    return { anio, batchId, filasOrigen: rows.length, filasInsertadas: inserted };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const anio = Number(process.argv[2] ?? new Date().getFullYear() - 1);
  ingestMinceturHospedajeYear(anio)
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
