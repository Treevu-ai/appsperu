import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { parseMontoSoles, parseOxiWorkbook, type OxiSpreadsheetRow } from "./oxi-xlsx.js";

export const OXI_EXPORT_URL =
  "https://www.investinperu.pe/wp-content/themes/hello-elementor-child/__api/service/oxi/investmentpromotionExport.php";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

interface OxiExportResponse {
  Code: number;
  Data?: string;
  Message?: string;
  FileName?: string;
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function fetchOxiWorkbookBuffer(): Promise<{ buffer: Buffer; fileName: string | null }> {
  const res = await fetch(OXI_EXPORT_URL, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT },
  });

  if (!res.ok) {
    throw new Error(`OxI investmentpromotionExport.php devolvió HTTP ${res.status}.`);
  }

  const data = (await res.json()) as OxiExportResponse;
  if (data.Code !== 1 || !data.Data) {
    throw new Error(`OxI respondió con error: ${data.Message ?? "payload inválido"}`);
  }

  return {
    buffer: Buffer.from(data.Data, "base64"),
    fileName: data.FileName ?? null,
  };
}

async function saveRawBatch(
  client: PoolClient,
  recordsTotal: number,
  checksum: string,
  payloadMeta: unknown
): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO raw_oxi_batches (records_total, checksum, payload_meta)
     VALUES ($1, $2, $3)
     RETURNING id`,
    [recordsTotal, checksum, JSON.stringify(payloadMeta)]
  );
  return rows[0].id;
}

async function upsertOxiProject(client: PoolClient, batchId: number, row: OxiSpreadsheetRow): Promise<void> {
  await client.query(
    `INSERT INTO oxi_promotion_projects (
       oxi_id, fase_oxi, tipo_inversion, ultimo_nivel_estudio, nivel_gobierno,
       departamento, provincia, distrito, entidad, codigo_snip, nombre, funcion, tipologia,
       monto_referencial, monto_referencial_soles, rango_monto, source_batch_id, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now()
     )
     ON CONFLICT (oxi_id) DO UPDATE SET
       fase_oxi = EXCLUDED.fase_oxi,
       tipo_inversion = EXCLUDED.tipo_inversion,
       ultimo_nivel_estudio = EXCLUDED.ultimo_nivel_estudio,
       nivel_gobierno = EXCLUDED.nivel_gobierno,
       departamento = EXCLUDED.departamento,
       provincia = EXCLUDED.provincia,
       distrito = EXCLUDED.distrito,
       entidad = EXCLUDED.entidad,
       codigo_snip = EXCLUDED.codigo_snip,
       nombre = EXCLUDED.nombre,
       funcion = EXCLUDED.funcion,
       tipologia = EXCLUDED.tipologia,
       monto_referencial = EXCLUDED.monto_referencial,
       monto_referencial_soles = EXCLUDED.monto_referencial_soles,
       rango_monto = EXCLUDED.rango_monto,
       source_batch_id = EXCLUDED.source_batch_id,
       updated_at = now()`,
    [
      row.oxiId,
      row.faseOxi,
      row.tipoInversion,
      row.ultimoNivelEstudio,
      row.nivelGobierno,
      row.departamento,
      row.provincia,
      row.distrito,
      row.entidad,
      row.codigoSnip,
      row.nombre,
      row.funcion,
      row.tipologia,
      row.montoReferencial,
      parseMontoSoles(row.montoReferencial),
      row.rangoMonto,
      batchId,
    ]
  );
}

export interface OxiIngestSummary {
  batchId: number;
  recordsTotal: number;
  rowsUpserted: number;
  fileName: string | null;
}

export async function ingestOxiPromotion(): Promise<OxiIngestSummary> {
  const { buffer, fileName } = await fetchOxiWorkbookBuffer();
  const rows = parseOxiWorkbook(buffer);
  const checksum = checksumOf(buffer.toString("base64"));
  const payloadMeta = { fileName, recordsParsed: rows.length };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, rows.length, checksum, payloadMeta);
    for (const row of rows) {
      await upsertOxiProject(client, batchId, row);
    }
    await client.query("COMMIT");

    return {
      batchId,
      recordsTotal: rows.length,
      rowsUpserted: rows.length,
      fileName,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestOxiPromotion()
    .then((summary) => console.log("Ingesta OxI (PROINVERSIÓN) completada:", summary))
    .finally(async () => {
      await pool.end();
    })
    .catch((error) => {
      console.error("Ingesta OxI falló:", error);
      process.exitCode = 1;
    });
}
