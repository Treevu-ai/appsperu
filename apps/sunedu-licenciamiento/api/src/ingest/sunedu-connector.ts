import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

const SOURCE_URL = "https://www.datosabiertos.gob.pe/sites/default/files/Licenciamiento%20Institucional_18.csv";
const DATASET = "sunedu_licenciamiento_institucional";
/** La fuente bloquea requests sin User-Agent de navegador (CloudWAF 418). */
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

interface Row {
  codigoEntidad: string;
  nombre: string;
  tipoGestion: string;
  estadoLicenciamiento: string;
  fechaInicio: string | null;
  fechaFin: string | null;
  periodoLicenciamiento: number | null;
  departamento: string;
  provincia: string;
  distrito: string;
  ubigeo: string;
  latitud: number | null;
  longitud: number | null;
  fechaCorte: string | null;
}

/** "20180410" (YYYYMMDD) → "2018-04-10"; cadena vacía → null. */
function toIsoDate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length !== 8) return null;
  return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
}

function toNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isNaN(n) ? null : n;
}

function toInt(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * La fuente declara pipe (`|`) como separador y viene en ISO-8859-1 real
 * (confirmado en vivo 2026-10-07 contra `datosabiertos.gob.pe`: decodificar
 * como UTF-8 corrompe toda Ñ/tilde de NOMBRE/DEPARTAMENTO/PROVINCIA).
 */
function parseCsv(buffer: ArrayBuffer): Row[] {
  const text = new TextDecoder("iso-8859-1").decode(buffer);
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const rows: Row[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split("|");
    if (cols.length < 14) continue;
    rows.push({
      codigoEntidad: cols[0],
      nombre: cols[1],
      tipoGestion: cols[2],
      estadoLicenciamiento: cols[3],
      fechaInicio: toIsoDate(cols[4]),
      fechaFin: toIsoDate(cols[5]),
      periodoLicenciamiento: toInt(cols[6]),
      departamento: cols[7],
      provincia: cols[8],
      distrito: cols[9],
      ubigeo: cols[10],
      latitud: toNumber(cols[11]),
      longitud: toNumber(cols[12]),
      fechaCorte: toIsoDate(cols[13]),
    });
  }
  return rows;
}

async function fetchCsv(): Promise<{ buffer: ArrayBuffer; rows: Row[] }> {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`SUNEDU devolvió ${res.status} al pedir ${SOURCE_URL}`);
  const buffer = await res.arrayBuffer();
  return { buffer, rows: parseCsv(buffer) };
}

async function ingestSunedu(): Promise<{ batchId: number; filasInsertadas: number }> {
  const { buffer, rows } = await fetchCsv();

  const client = await pool.connect();
  try {
    const { rows: batchRows } = await client.query<{ id: number }>(
      `INSERT INTO raw_sunedu_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
      [DATASET, SOURCE_URL, checksumOf(Buffer.from(buffer).toString("hex")), rows.length]
    );
    const batchId = batchRows[0].id;

    let filasInsertadas = 0;
    await client.query("BEGIN");
    try {
      for (const row of rows) {
        await client.query(
          `INSERT INTO licenciamiento_universidades
             (codigo_entidad, nombre, tipo_gestion, estado_licenciamiento, fecha_inicio, fecha_fin,
              periodo_licenciamiento, departamento, provincia, distrito, ubigeo, latitud, longitud,
              fecha_corte, source_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [
            row.codigoEntidad, row.nombre, row.tipoGestion, row.estadoLicenciamiento,
            row.fechaInicio, row.fechaFin, row.periodoLicenciamiento, row.departamento,
            row.provincia, row.distrito, row.ubigeo, row.latitud, row.longitud,
            row.fechaCorte, batchId,
          ]
        );
        filasInsertadas++;
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }

    return { batchId, filasInsertadas };
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestSunedu()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
