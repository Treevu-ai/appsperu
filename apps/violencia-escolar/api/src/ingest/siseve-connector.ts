import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { normalizeCasos, type CanonicalCaso, type RejectedRow } from "./normalize-siseve.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

/**
 * Confirmado en vivo 2026-09-21: un POST plano sin body, sin cookies ni sesión, reproduce
 * byte-por-byte el mismo archivo que descarga el botón "Excel" del dashboard público
 * https://siseve.minedu.gob.pe/Web/App/Mapa -- a diferencia de los endpoints AJAX del mismo
 * dashboard (`/TableroControl/ListarDatosMapa`), que sí cifran la respuesta con AES del lado
 * del cliente. Esta ruta de exportación no pasa por esa capa de cifrado.
 */
const SOURCE_URL = "https://siseve.minedu.gob.pe/Web/Inicio/DescargarEXCEL";
const SHEET_NAME = "BaseCompleta";
const HEADER_MARKER = "FECHA_REPORTE";
const INSERT_BATCH_SIZE = 1000;

async function downloadExcel(): Promise<Buffer> {
  const res = await fetch(SOURCE_URL, { method: "POST", headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`SíseVe devolvió ${res.status} al descargar ${SOURCE_URL}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

/**
 * El archivo trae varias filas de título/nota antes de la cabecera real (fila 6 en el corte
 * verificado 2026-09-21) -- se busca la fila que empieza con `FECHA_REPORTE` en vez de asumir
 * un número de fila fijo, por si MINEDU agrega o quita una nota en el futuro.
 */
function parseRows(buffer: Buffer): Promise<Record<string, unknown>[]> {
  const workbook = new ExcelJS.Workbook();
  return workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]).then(() => {
    const sheet = workbook.getWorksheet(SHEET_NAME);
    if (!sheet) {
      throw new Error(`El Excel no tiene una hoja "${SHEET_NAME}" -- formato inesperado.`);
    }

    let headerRowNumber = -1;
    let headers: string[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (headerRowNumber !== -1) return;
      const firstCell = String(row.getCell(1).value ?? "").trim();
      if (firstCell === HEADER_MARKER) {
        headerRowNumber = rowNumber;
        headers = (row.values as unknown[]).map((v) => (v === undefined || v === null ? "" : String(v).trim()));
      }
    });
    if (headerRowNumber === -1) {
      throw new Error(`No se encontró la fila de cabecera ("${HEADER_MARKER}") en la hoja "${SHEET_NAME}".`);
    }

    const rawRows: Record<string, unknown>[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber <= headerRowNumber) return;
      const firstCell = row.getCell(1).value;
      if (firstCell === null || firstCell === undefined) return;

      const record: Record<string, unknown> = {};
      headers.forEach((header, i) => {
        if (!header) return;
        record[header] = row.getCell(i).value;
      });
      rawRows.push(record);
    });

    return rawRows;
  });
}

/**
 * Recibe el `client` de la transacción en curso -- antes abría su propia conexión del pool
 * (autocommit, fuera del BEGIN/COMMIT de `ingestSiseve`), así que un rollback posterior dejaba
 * un `raw_siseve_batches` huérfano ya confirmado, con `record_count=0` y sin filas asociadas
 * (hallazgo real de CodeRabbit en PR #179).
 */
async function saveRawBatch(client: PoolClient, checksum: string): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_siseve_batches (source_url, checksum, record_count) VALUES ($1, $2, 0) RETURNING id`,
    [SOURCE_URL, checksum]
  );
  return result.rows[0].id;
}

const INSERT_COLUMNS = [
  "fecha_reporte", "dre", "ugel", "nivel_educativo", "tipo_reporte", "tipo_violencia",
  "subtipo_violencia", "tipo_estado_reporte", "source_batch_id",
] as const;

async function insertBatch(client: PoolClient, batchId: number, rows: readonly CanonicalCaso[]): Promise<void> {
  if (rows.length === 0) return;

  const values: unknown[] = [];
  const tuples: string[] = [];
  rows.forEach((row, i) => {
    const base = i * INSERT_COLUMNS.length;
    tuples.push(`(${INSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
    values.push(
      row.fechaReporte, row.dre, row.ugel, row.nivelEducativo, row.tipoReporte, row.tipoViolencia,
      row.subtipoViolencia, row.tipoEstadoReporte, batchId
    );
  });

  await client.query(`INSERT INTO violencia_escolar_casos (${INSERT_COLUMNS.join(",")}) VALUES ${tuples.join(",")}`, values);
}

async function insertRejectedBatch(client: PoolClient, batchId: number, rejected: readonly RejectedRow[]): Promise<void> {
  for (const bad of rejected) {
    await client.query(`INSERT INTO violencia_escolar_casos_rejected (source_batch_id, raw_row, reason) VALUES ($1, $2, $3)`, [
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

export async function ingestSiseve(): Promise<IngestSummary> {
  const buffer = await downloadExcel();
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const rawRows = await parseRows(buffer);
  const { rows, rejected } = normalizeCasos(rawRows);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, checksum);

    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
      await insertBatch(client, batchId, rows.slice(i, i + INSERT_BATCH_SIZE));
    }
    for (let i = 0; i < rejected.length; i += INSERT_BATCH_SIZE) {
      await insertRejectedBatch(client, batchId, rejected.slice(i, i + INSERT_BATCH_SIZE));
    }
    await client.query("UPDATE raw_siseve_batches SET record_count = $1 WHERE id = $2", [rows.length, batchId]);

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
  ingestSiseve()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
