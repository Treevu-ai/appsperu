import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import ExcelJS from "exceljs";
import { pool } from "../db/pool.js";

const SOURCE_URL = "https://www.datosabiertos.gob.pe/sites/default/files/Estudios_aprobados_periodo_2024-2025.xlsx";
const DATASET = "midagri_dgaaa_estudios_suelos_2024_2025";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

interface Row {
  cut: string;
  nombreEstudio: string | null;
  nivelDetalle: string | null;
  escalaTrabajo: string | null;
  superficieHa: number | null;
  titular: string;
  documentoAprobacion: string | null;
  fechaRegistro: string | null;
  sistemaCtcum: string | null;
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

function cellNumber(value: unknown): number | null {
  const t = cellText(value);
  if (t === null) return null;
  const n = Number(t.replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

async function fetchRows(): Promise<{ rows: Row[]; checksum: string }> {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MIDAGRI-DGAAA devolvió ${res.status} al descargar ${SOURCE_URL}`);
  }
  const buf = await res.arrayBuffer();
  const checksum = createHash("sha256").update(Buffer.from(buf)).digest("hex");

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const ws = wb.worksheets[0];

  const rows: Row[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    // `row.getCell(n)` y `row.values[n]` quedaron desfasados por 1 en este
    // archivo específico (confirmado en vivo 2026-10-01: getCell(4) devolvía
    // el contenido de la columna 5) -- se usa `values[]` directo, que sí
    // mapea correcto contra el header real.
    // Array 0-indexed de JS: v[0] y v[1] son null (placeholders), v[2]="N°",
    // v[3]=CUT -- confirmado en vivo 2026-10-01 tras un error de conteo
    // previo que asumía v[4]=CUT.
    const v = row.values as unknown[];
    const cut = cellText(v[3]);
    const titular = cellText(v[8]);
    if (!cut || !titular) return;
    rows.push({
      cut,
      nombreEstudio: cellText(v[4]),
      nivelDetalle: cellText(v[5]),
      escalaTrabajo: cellText(v[6]),
      superficieHa: cellNumber(v[7]),
      titular,
      documentoAprobacion: cellText(v[9]),
      fechaRegistro: cellText(v[10]),
      sistemaCtcum: cellText(v[11]),
    });
  });
  return { rows, checksum };
}

async function ingestDgaaa(): Promise<{ batchId: number; filasInsertadas: number }> {
  const { rows, checksum } = await fetchRows();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: batchRows } = await client.query<{ id: number }>(
      `INSERT INTO raw_dgaaa_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
      [DATASET, SOURCE_URL, checksum, rows.length]
    );
    const batchId = batchRows[0].id;

    for (const row of rows) {
      await client.query(
        `INSERT INTO estudios_suelos
           (cut, nombre_estudio, nivel_detalle, escala_trabajo, superficie_ha, titular,
            documento_aprobacion, fecha_registro, sistema_ctcum, source_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (cut) DO UPDATE SET
           documento_aprobacion = EXCLUDED.documento_aprobacion,
           source_batch_id = EXCLUDED.source_batch_id`,
        [
          row.cut, row.nombreEstudio, row.nivelDetalle, row.escalaTrabajo, row.superficieHa,
          row.titular, row.documentoAprobacion, row.fechaRegistro, row.sistemaCtcum, batchId,
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
  ingestDgaaa()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
