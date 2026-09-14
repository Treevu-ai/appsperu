import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { PDFParse } from "pdf-parse";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { parsePasivosContingentesTable, type ParsedRow } from "./pdf-normalize.js";

export async function readPdfText(filePath: string): Promise<string> {
  const buffer = readFileSync(filePath);
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy();
  }
}

async function saveRawBatch(
  client: PoolClient,
  edicion: string,
  fileName: string,
  checksum: string,
  filasInsertadas: number
): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO raw_mmm_batches (edicion, file_name, checksum, filas_insertadas) VALUES ($1, $2, $3, $4) RETURNING id`,
    [edicion, fileName, checksum, filasInsertadas]
  );
  return rows[0].id;
}

async function upsertPasivoRow(client: PoolClient, edicion: string, row: ParsedRow): Promise<void> {
  await client.query(
    `INSERT INTO mmm_pasivos_contingentes (anio_cierre, categoria, pct_pbi, edicion_fuente)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (anio_cierre, categoria) DO UPDATE SET
       pct_pbi = EXCLUDED.pct_pbi,
       edicion_fuente = EXCLUDED.edicion_fuente`,
    [row.anio, row.categoria, row.pctPbi, edicion]
  );
}

export interface PdfIngestSummary {
  batchId: number;
  edicion: string;
  filasInsertadas: number;
  aniosDetectados: number[];
}

/**
 * Ingesta manual: recibe la ruta a un PDF ya descargado (MMM o IAPM del
 * MEF) y el `edicion` (debe existir previamente en mmm_ediciones — ver
 * migración 002 y docs/adr/0023). No hay descarga automática: mef.gob.pe
 * bloquea herramientas automatizadas para el listado de publicaciones (ver
 * docs/data-contracts/riesgo-fiscal-isds.md, sección Acceso).
 *
 * Si `parsePasivosContingentesTable` no encuentra la tabla en el formato
 * esperado (ej. MMM_2024_2027, que usa un formato distinto en la misma
 * sección), lanza un error explícito en vez de insertar filas parciales o
 * incorrectas — mismo criterio que bcrp-la-libertad.
 */
export async function ingestPdf(filePath: string, edicion: string): Promise<PdfIngestSummary> {
  const text = await readPdfText(filePath);

  const rows = parsePasivosContingentesTable(text);
  if (rows.length === 0) {
    throw new Error(
      `No se pudo parsear la tabla "Tipo de contingencia fiscal explícita" en el formato esperado (${filePath}). ` +
        "Puede ser un formato de tabla distinto (ver docs/adr/0023) — no se insertó ninguna fila."
    );
  }

  const checksum = createHash("sha256").update(text).digest("hex");
  const fileName = path.basename(filePath);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: edicionRows } = await client.query("SELECT 1 FROM mmm_ediciones WHERE edicion = $1", [edicion]);
    if (edicionRows.length === 0) {
      throw new Error(
        `La edición "${edicion}" no existe en mmm_ediciones. Agregarla primero (ver migración 002) antes de ingerir.`
      );
    }

    for (const row of rows) {
      await upsertPasivoRow(client, edicion, row);
    }

    const batchId = await saveRawBatch(client, edicion, fileName, checksum, rows.length);

    await client.query("COMMIT");

    return {
      batchId,
      edicion,
      filasInsertadas: rows.length,
      aniosDetectados: [...new Set(rows.map((r) => r.anio))].sort(),
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
  const edicion = process.argv[3];
  if (!filePath || !edicion) {
    console.error('Uso: npm run ingest:pdf -- "<ruta-al-pdf>" "<edicion, ej. IAPM_2025_2028>"');
    process.exit(1);
  }

  ingestPdf(filePath, edicion)
    .then((summary) => console.log("Ingesta MMM completada:", summary))
    .finally(async () => {
      await pool.end();
    })
    .catch((error) => {
      console.error("Ingesta falló:", error);
      process.exitCode = 1;
    });
}
