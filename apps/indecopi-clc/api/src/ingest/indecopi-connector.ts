import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import { pool } from "../db/pool.js";

const SOURCE_URL = "https://www.datosabiertos.gob.pe/sites/default/files/Expedientes%20Presentados%202019.xlsx";
const DATASET = "indecopi_spc_expedientes_presentados_2019";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

interface Row {
  nroExpediente: string;
  nroExpedienteOrigen: string | null;
  tipoExpediente: string | null;
  fechaPresentacion: string | null;
  denunciado: string | null;
  tipoDocumento: string | null;
  numeroDocumento: string | null;
  materia: string | null;
}

function cellText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && value !== null && "text" in (value as Record<string, unknown>)) {
    return String((value as { text: unknown }).text).trim() || null;
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  return s === "" ? null : s;
}

function parseDocumento(raw: string | null): { tipo: string | null; numero: string | null } {
  if (!raw) return { tipo: null, numero: null };
  const m = raw.match(/^([A-Za-zÁÉÍÓÚáéíóú.]+)\s*:\s*(.+)$/);
  if (!m) return { tipo: null, numero: raw };
  return { tipo: m[1].trim(), numero: m[2].trim() };
}

async function fetchRows(): Promise<{ rows: Row[]; rawBuffer: ArrayBuffer }> {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`INDECOPI devolvió ${res.status} al descargar ${SOURCE_URL}`);
  }
  const buf = await res.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];

  const rows: Row[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const nroExpediente = cellText(row.getCell(1).value);
    if (!nroExpediente) return;
    const { tipo, numero } = parseDocumento(cellText(row.getCell(6).value));
    rows.push({
      nroExpediente,
      nroExpedienteOrigen: cellText(row.getCell(2).value),
      tipoExpediente: cellText(row.getCell(3).value),
      fechaPresentacion: cellText(row.getCell(4).value),
      denunciado: cellText(row.getCell(5).value),
      tipoDocumento: tipo,
      numeroDocumento: numero,
      materia: cellText(row.getCell(7).value),
    });
  });
  return { rows, rawBuffer: buf };
}

async function ingestIndecopi(): Promise<{ batchId: number; filasInsertadas: number }> {
  const { rows, rawBuffer } = await fetchRows();
  const checksum = createHash("sha256").update(Buffer.from(rawBuffer)).digest("hex");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: batchRows } = await client.query<{ id: number }>(
      `INSERT INTO raw_indecopi_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
      [DATASET, SOURCE_URL, checksum, rows.length]
    );
    const batchId = batchRows[0].id;

    for (const row of rows) {
      await client.query(
        `INSERT INTO expedientes_spc
           (nro_expediente, nro_expediente_origen, tipo_expediente, fecha_presentacion,
            denunciado, tipo_documento, numero_documento, materia, source_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (nro_expediente) DO UPDATE SET materia = EXCLUDED.materia, source_batch_id = EXCLUDED.source_batch_id`,
        [
          row.nroExpediente, row.nroExpedienteOrigen, row.tipoExpediente, row.fechaPresentacion,
          row.denunciado, row.tipoDocumento, row.numeroDocumento, row.materia, batchId,
        ]
      );
    }
    await client.query("COMMIT");
    return { batchId, filasInsertadas: rows.length };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestIndecopi()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
