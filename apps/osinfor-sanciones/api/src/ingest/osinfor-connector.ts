import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool, connectSafe } from "../db/pool.js";

/**
 * Sanciones emitidas por OSINFOR a títulos habilitantes forestales.
 * CSV único, delimitado por ";", actualizado anualmente, sin autenticación.
 * Confirmado en vivo 2026-10-13: requiere un User-Agent de navegador o el
 * WAF del portal devuelve 418.
 */
const SOURCE_URL = "https://www.datosabiertos.gob.pe/sites/default/files/DATASET%20-%20Sanciones%20emitidas_0.csv";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const INSERT_BATCH_SIZE = 500;

interface SancionRow {
  fechaCorte: string | null;
  anioSuperv: number | null;
  titular: string;
  titulo: string | null;
  modalidad: string | null;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  rdTermino: string | null;
  infracciones: string | null;
  numResodirecRr: string | null;
  numResodirecTffs: string | null;
  caducidad: boolean | null;
  sancion: string | null;
  montoMultaUit: number | null;
  areaOtorgadaHa: number | null;
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** "20260814" -> "2026-08-14"; vacío -> null. */
function toIsoDate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length !== 8) return null;
  return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
}

function toNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function toNullableString(value: string | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed === "" ? null : trimmed;
}

const COLUMNS = [
  "FECHA_CORTE", "ANIO_SUPERV", "TITULAR", "TITULO", "MODALIDAD", "UBIGEO",
  "DEPARTAMENTO", "PROVINCIA", "DISTRITO", "RD_TERMINO", "INFRACCIONES",
  "NUM_RESODIREC_RR", "NUM_RESODIREC_TFFS", "CADUCIDAD", "SANCION",
  "MONTO_MULTA", "AREA_OTORGADA",
] as const;

function parseCsv(text: string): SancionRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = lines[0]?.split(";").map((h) => h.trim()) ?? [];
  if (COLUMNS.some((c, i) => header[i] !== c)) {
    throw new Error(`Columnas del CSV de OSINFOR cambiaron -- esperado ${COLUMNS.join(",")}, recibido ${header.join(",")}`);
  }

  return lines.slice(1).map((line) => {
    const cols = line.split(";");
    return {
      fechaCorte: toIsoDate(cols[0] ?? ""),
      anioSuperv: toNullableNumber(cols[1] ?? ""),
      titular: (cols[2] ?? "").trim(),
      titulo: toNullableString(cols[3]),
      modalidad: toNullableString(cols[4]),
      ubigeo: toNullableString(cols[5]),
      departamento: toNullableString(cols[6]),
      provincia: toNullableString(cols[7]),
      distrito: toNullableString(cols[8]),
      rdTermino: toNullableString(cols[9]),
      infracciones: toNullableString(cols[10]),
      numResodirecRr: toNullableString(cols[11]),
      numResodirecTffs: toNullableString(cols[12]),
      caducidad: (cols[13] ?? "").trim().toUpperCase() === "SI",
      sancion: toNullableString(cols[14]),
      montoMultaUit: toNullableNumber(cols[15] ?? ""),
      areaOtorgadaHa: toNullableNumber(cols[16] ?? ""),
    };
  });
}

async function fetchSanciones(): Promise<{ raw: string; rows: SancionRow[] }> {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`datosabiertos.gob.pe devolvió ${res.status} al pedir el CSV de OSINFOR`);
  const raw = await res.text();
  return { raw, rows: parseCsv(raw) };
}

const INSERT_COLUMNS = [
  "fecha_corte", "anio_superv", "titular", "titulo", "modalidad", "ubigeo",
  "departamento", "provincia", "distrito", "rd_termino", "infracciones",
  "num_resodirec_rr", "num_resodirec_tffs", "caducidad", "sancion",
  "monto_multa_uit", "area_otorgada_ha", "source_batch_id",
] as const;

export async function ingestOsinforSanciones(): Promise<{ batchId: number; filasInsertadas: number }> {
  const { raw, rows } = await fetchSanciones();

  const client = await connectSafe();
  try {
    const { rows: batchRows } = await client.query<{ id: number }>(
      `INSERT INTO raw_osinfor_batches (source_url, checksum, record_count) VALUES ($1, $2, $3) RETURNING id`,
      [SOURCE_URL, checksumOf(raw), rows.length]
    );
    const batchId = batchRows[0].id;

    await client.query("BEGIN");
    try {
      await client.query("DELETE FROM sanciones_osinfor"); // snapshot completo, mismo patrón que otros conectores de 1 dataset
      for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
        const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
        const values: string[] = [];
        const params: unknown[] = [];
        let p = 1;
        for (const row of batch) {
          values.push(`(${INSERT_COLUMNS.map(() => `$${p++}`).join(",")})`);
          params.push(
            row.fechaCorte, row.anioSuperv, row.titular, row.titulo, row.modalidad,
            row.ubigeo, row.departamento, row.provincia, row.distrito, row.rdTermino,
            row.infracciones, row.numResodirecRr, row.numResodirecTffs, row.caducidad,
            row.sancion, row.montoMultaUit, row.areaOtorgadaHa, batchId
          );
        }
        await client.query(`INSERT INTO sanciones_osinfor (${INSERT_COLUMNS.join(",")}) VALUES ${values.join(",")}`, params);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    return { batchId, filasInsertadas: rows.length };
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestOsinforSanciones()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
