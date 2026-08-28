import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import {
  computeColumnPeriods,
  extractReportPeriod,
  parseAnexoTable,
  splitByAnexo,
  toIngestRows,
  type NormalizedIngestRow,
} from "./pdf-normalize.js";

export async function readPdfText(filePath: string): Promise<{ pageOneText: string; fullText: string }> {
  const buffer = readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const pageOne = await parser.getText({ first: 1, last: 1 });
    const full = await parser.getText();
    return { pageOneText: pageOne.text, fullText: full.text };
  } finally {
    await parser.destroy();
  }
}

async function saveRawBatch(
  client: PoolClient,
  reportPeriod: string,
  fileName: string,
  checksum: string
): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO raw_bcrp_ll_batches (report_period, file_name, checksum) VALUES ($1, $2, $3) RETURNING id`,
    [reportPeriod, fileName, checksum]
  );
  return rows[0].id;
}

async function upsertIndicatorRow(client: PoolClient, batchId: number, row: NormalizedIngestRow): Promise<void> {
  await client.query(
    `INSERT INTO bcrp_ll_indicators (anexo_numero, seccion, indicador, periodo_anio, periodo_mes, valor, source_batch_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (anexo_numero, seccion, indicador, periodo_anio, periodo_mes) DO UPDATE SET
       valor = EXCLUDED.valor,
       source_batch_id = EXCLUDED.source_batch_id`,
    [row.anexoNumero, row.seccion ?? "", row.indicador, row.periodoAnio, row.periodoMes, row.valor, batchId]
  );
}

export interface PdfIngestSummary {
  batchId: number;
  reportPeriod: string;
  anexosDetectados: number[];
  filasPorAnexo: Record<number, number>;
  totalFilas: number;
}

export async function ingestPdf(filePath: string): Promise<PdfIngestSummary> {
  const { pageOneText, fullText } = await readPdfText(filePath);

  const reportPeriod = extractReportPeriod(pageOneText);
  if (!reportPeriod) {
    throw new Error(
      `No se pudo extraer el período del reporte desde la portada del PDF (${filePath}). ` +
        "Revisar si cambió el formato del título."
    );
  }

  const columnPeriods = computeColumnPeriods(reportPeriod.year, reportPeriod.month);
  const anexoSections = splitByAnexo(fullText);
  if (anexoSections.size === 0) {
    throw new Error(`No se detectó ningún encabezado "ANEXO N" en el PDF (${filePath}). Revisar formato.`);
  }

  const checksum = createHash("sha256").update(fullText).digest("hex");
  const reportPeriodStr = `${reportPeriod.year}-${String(reportPeriod.month).padStart(2, "0")}`;
  const fileName = path.basename(filePath);

  const filasPorAnexo: Record<number, number> = {};
  let totalFilas = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, reportPeriodStr, fileName, checksum);

    for (const [anexoNumero, sectionText] of anexoSections) {
      const indicatorRows = parseAnexoTable(sectionText);
      const ingestRows = toIngestRows(anexoNumero, indicatorRows, columnPeriods);
      for (const row of ingestRows) {
        await upsertIndicatorRow(client, batchId, row);
      }
      filasPorAnexo[anexoNumero] = ingestRows.length;
      totalFilas += ingestRows.length;
    }

    await client.query("COMMIT");

    return {
      batchId,
      reportPeriod: reportPeriodStr,
      anexosDetectados: [...anexoSections.keys()].sort((a, b) => a - b),
      filasPorAnexo,
      totalFilas,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Uso: npm run ingest:pdf -- "<ruta-al-pdf>"');
    process.exit(1);
  }

  ingestPdf(filePath)
    .then((summary) => console.log("Ingesta BCRP La Libertad completada:", summary))
    .finally(async () => {
      await pool.end();
    })
    .catch((error) => {
      console.error("Ingesta falló:", error);
      process.exitCode = 1;
    });
}
