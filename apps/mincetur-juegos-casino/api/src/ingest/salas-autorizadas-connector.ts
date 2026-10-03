import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

const SOURCE_URL = "https://www.mincetur.gob.pe/Datos_abiertos/DGJCMT/Salas_autorizadas_juego.csv";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const BATCH_SIZE = 200;

interface Row {
  fechaCorte: string;
  ruc: string;
  empresa: string;
  establecimiento: string;
  giro: string | null;
  resolucion: string | null;
  codigoSala: string;
  fechaVigencia: string | null;
  direccion: string | null;
  distrito: string | null;
  provincia: string | null;
  departamento: string | null;
}

function toNullable(s: string | undefined): string | null {
  const v = (s ?? "").trim();
  return v === "" ? null : v;
}

/** `YYYYMMDD` -> `YYYY-MM-DD`. La fuente no usa ISO ni separadores. */
function parseFechaYyyyMmDd(s: string | undefined): string | null {
  const v = toNullable(s);
  if (!v || v.length !== 8) return null;
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

/** `DD/MM/YYYY` -> `YYYY-MM-DD`. Puede venir vacía (sin vigencia registrada). */
function parseFechaDdMmYyyy(s: string | undefined): string | null {
  const v = toNullable(s);
  if (!v) return null;
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * La fuente declara `Content-Type: text/csv` sin charset y el archivo es
 * ISO-8859-1 real (confirmado con `file`, no UTF-8 con BOM) -- decodificar
 * como UTF-8 corrompe toda Ñ/tilde en distrito/provincia/departamento. Se
 * decodifica explícitamente con `TextDecoder("iso-8859-1")` sobre el buffer
 * crudo en vez de `res.text()` (que asume UTF-8).
 */
function parseCsv(buffer: ArrayBuffer): Row[] {
  const text = new TextDecoder("iso-8859-1").decode(buffer);
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(";");
    if (c.length < 12) continue;
    const ruc = toNullable(c[1]);
    const codigoSala = toNullable(c[6]);
    if (!ruc || !codigoSala) continue;
    rows.push({
      fechaCorte: parseFechaYyyyMmDd(c[0]) ?? "",
      ruc,
      empresa: toNullable(c[2]) ?? "",
      establecimiento: toNullable(c[3]) ?? "",
      giro: toNullable(c[4]),
      resolucion: toNullable(c[5]),
      codigoSala,
      fechaVigencia: parseFechaDdMmYyyy(c[7]),
      direccion: toNullable(c[8]),
      distrito: toNullable(c[9]),
      provincia: toNullable(c[10]),
      departamento: toNullable(c[11]),
    });
  }
  return rows.filter((r) => r.fechaCorte !== "");
}

export async function ingestSalasAutorizadas(): Promise<{ batchId: number; filasInsertadas: number }> {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`MINCETUR devolvió ${res.status} al descargar ${SOURCE_URL}`);
  }
  const buffer = await res.arrayBuffer();
  const rows = parseCsv(buffer);
  const checksum = createHash("sha256").update(Buffer.from(buffer)).digest("hex");

  const metaClient = await pool.connect();
  let batchId: number;
  try {
    const { rows: batchRows } = await metaClient.query<{ id: number }>(
      `INSERT INTO raw_salas_autorizadas_batches (source_url, checksum, record_count) VALUES ($1, $2, $3) RETURNING id`,
      [SOURCE_URL, checksum, rows.length]
    );
    batchId = batchRows[0].id;
  } finally {
    metaClient.release();
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const row of slice) {
        await client.query(
          `INSERT INTO salas_autorizadas
             (codigo_sala, ruc, empresa, establecimiento, giro, resolucion, fecha_vigencia,
              direccion, distrito, provincia, departamento, fecha_corte, source_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (codigo_sala) DO UPDATE SET
             ruc = EXCLUDED.ruc, empresa = EXCLUDED.empresa, establecimiento = EXCLUDED.establecimiento,
             giro = EXCLUDED.giro, resolucion = EXCLUDED.resolucion, fecha_vigencia = EXCLUDED.fecha_vigencia,
             direccion = EXCLUDED.direccion, distrito = EXCLUDED.distrito, provincia = EXCLUDED.provincia,
             departamento = EXCLUDED.departamento, fecha_corte = EXCLUDED.fecha_corte,
             source_batch_id = EXCLUDED.source_batch_id`,
          [
            row.codigoSala, row.ruc, row.empresa, row.establecimiento, row.giro, row.resolucion,
            row.fechaVigencia, row.direccion, row.distrito, row.provincia, row.departamento,
            row.fechaCorte, batchId,
          ]
        );
      }
      await client.query("COMMIT");
      inserted += slice.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return { batchId, filasInsertadas: inserted };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestSalasAutorizadas()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
