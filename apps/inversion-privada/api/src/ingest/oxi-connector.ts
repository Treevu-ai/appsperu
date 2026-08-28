import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import unzipper from "unzipper";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { OXI_COLUMNS, parseOxiRow, type NormalizedOxiRow, type OxiRawRow } from "./oxi-normalize.js";

const OXI_EXPORT_URL =
  "https://www.investinperu.pe/wp-content/themes/hello-elementor-child/__api/service/oxi/investmentpromotionExport.php";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

interface OxiExportResponse {
  Code: number;
  Message?: string;
  Data?: string; // XLSX en base64
}

export async function fetchOxiExportBuffer(): Promise<Buffer> {
  const form = new FormData();
  form.set("Lan", "es");

  const res = await fetch(OXI_EXPORT_URL, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`OxI investmentpromotionExport.php devolvió HTTP ${res.status}.`);
  }

  const data = (await res.json()) as OxiExportResponse;
  if (data.Code !== 1 || !data.Data) {
    throw new Error(`OxI export respondió con error: ${data.Message ?? "payload inválido"}`);
  }

  return Buffer.from(data.Data, "base64");
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

function getAttr(tag: string, name: string): string | undefined {
  const m = tag.match(new RegExp(`${name}="([^"]*)"`));
  return m ? m[1] : undefined;
}

function parseSharedStrings(xml: string): string[] {
  const matches = [...xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)];
  return matches.map((m) => {
    const texts = [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]);
    return decodeXmlEntities(texts.join(""));
  });
}

/**
 * Extrae filas del sheet como `{ columna: texto }` (p. ej. `{ B: "5893",
 * M: "MEJORAMIENTO..." }`). A diferencia de `infobras-connector.ts` (que
 * lee `<x:v>` en streaming porque ese XLSX es ~726MB y no usa shared
 * strings), este sheet es pequeño (~760 filas) y sí usa shared strings
 * (`t="s"`) para casi todo el texto — se resuelve contra `sharedStrings.xml`
 * antes de devolver las filas. Se carga completo en memoria; no requiere
 * streaming.
 */
export function parseOxiSheetXml(sheetXml: string, sharedStrings: string[]): OxiRawRow[] {
  const rowMatches = [...sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)];

  return rowMatches.map((rowMatch) => {
    const cellMatches = [...rowMatch[2].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)];
    const row: OxiRawRow = {};
    for (const cellMatch of cellMatches) {
      const attrs = cellMatch[1];
      const inner = cellMatch[2] ?? "";
      const ref = getAttr(attrs, "r");
      if (!ref) continue;
      const type = getAttr(attrs, "t");
      const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
      let value = vMatch ? vMatch[1] : undefined;
      if (type === "s" && value !== undefined) value = sharedStrings[Number(value)];
      const column = ref.match(/[A-Z]+/)?.[0];
      if (!column) continue;
      row[column] = value !== undefined ? decodeXmlEntities(value) : "";
    }
    return row;
  });
}

export interface ParsedOxiWorkbook {
  recordsTotal: number;
  rows: NormalizedOxiRow[];
}

/**
 * `records_total` se lee de la celda de metadata ("Nº Registros: NNN"),
 * confirmada en vivo en la fila con esa etiqueta en la columna B — no hay
 * un campo estructurado aparte para el total.
 */
function extractRecordsTotal(rawRows: OxiRawRow[]): number | null {
  for (const row of rawRows) {
    const text = row[OXI_COLUMNS.id];
    const m = text?.match(/N[ºo]\s*Registros:\s*(\d+)/i);
    if (m) return Number(m[1]);
  }
  return null;
}

export async function parseOxiWorkbook(buffer: Buffer): Promise<ParsedOxiWorkbook> {
  const directory = await unzipper.Open.buffer(buffer);
  const sheetEntry = directory.files.find((f) => f.path === "xl/worksheets/sheet1.xml");
  const sharedStringsEntry = directory.files.find((f) => f.path === "xl/sharedStrings.xml");
  if (!sheetEntry) {
    throw new Error("El XLSX de OxI no tiene xl/worksheets/sheet1.xml — formato inesperado.");
  }

  const sharedStrings = sharedStringsEntry ? parseSharedStrings((await sharedStringsEntry.buffer()).toString("utf-8")) : [];
  const sheetXml = (await sheetEntry.buffer()).toString("utf-8");
  const rawRows = parseOxiSheetXml(sheetXml, sharedStrings);

  const recordsTotal = extractRecordsTotal(rawRows);
  const rows = rawRows.map(parseOxiRow).filter((row): row is NormalizedOxiRow => row !== null);

  if (recordsTotal === null) {
    throw new Error("No se encontró la celda 'Nº Registros: NNN' en el XLSX de OxI — formato inesperado.");
  }

  return { recordsTotal, rows };
}

async function saveRawBatch(client: PoolClient, recordsTotal: number, checksum: string): Promise<number> {
  const { rows } = await client.query<{ id: number }>(
    `INSERT INTO raw_oxi_batches (records_total, checksum) VALUES ($1, $2) RETURNING id`,
    [recordsTotal, checksum]
  );
  return rows[0].id;
}

async function upsertOxiRow(client: PoolClient, batchId: number, row: NormalizedOxiRow): Promise<void> {
  await client.query(
    `INSERT INTO oxi_investment_promotions (
       oxi_id, fase, tipo_inversion, nivel_estudio, nivel_gobierno, departamento, provincia,
       distrito, entidad, codigo_referencia, nombre_proyecto, funcion, tipologia,
       monto_inversion_referencial, rango_monto, source_batch_id, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, now())
     ON CONFLICT (oxi_id) DO UPDATE SET
       fase = EXCLUDED.fase,
       tipo_inversion = EXCLUDED.tipo_inversion,
       nivel_estudio = EXCLUDED.nivel_estudio,
       nivel_gobierno = EXCLUDED.nivel_gobierno,
       departamento = EXCLUDED.departamento,
       provincia = EXCLUDED.provincia,
       distrito = EXCLUDED.distrito,
       entidad = EXCLUDED.entidad,
       codigo_referencia = EXCLUDED.codigo_referencia,
       nombre_proyecto = EXCLUDED.nombre_proyecto,
       funcion = EXCLUDED.funcion,
       tipologia = EXCLUDED.tipologia,
       monto_inversion_referencial = EXCLUDED.monto_inversion_referencial,
       rango_monto = EXCLUDED.rango_monto,
       source_batch_id = EXCLUDED.source_batch_id,
       updated_at = now()`,
    [
      row.oxiId,
      row.fase,
      row.tipoInversion,
      row.nivelEstudio,
      row.nivelGobierno,
      row.departamento,
      row.provincia,
      row.distrito,
      row.entidad,
      row.codigoReferencia,
      row.nombreProyecto,
      row.funcion,
      row.tipologia,
      row.montoInversionReferencial,
      row.rangoMonto,
      batchId,
    ]
  );
}

export interface OxiIngestSummary {
  batchId: number;
  recordsTotal: number;
  rowsUpserted: number;
  isPartial: boolean;
}

export async function ingestOxiPortfolio(): Promise<OxiIngestSummary> {
  const buffer = await fetchOxiExportBuffer();
  const checksum = createHash("sha256").update(buffer).digest("hex");
  const { recordsTotal, rows } = await parseOxiWorkbook(buffer);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, recordsTotal, checksum);
    for (const row of rows) {
      await upsertOxiRow(client, batchId, row);
    }
    await client.query("COMMIT");

    return {
      batchId,
      recordsTotal,
      rowsUpserted: rows.length,
      isPartial: rows.length < recordsTotal,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestOxiPortfolio()
    .then((summary) => console.log("Ingesta OxI (PROINVERSIÓN) completada:", summary))
    .finally(async () => {
      await pool.end();
    })
    .catch((error) => {
      console.error("Ingesta OxI falló:", error);
      process.exitCode = 1;
    });
}
