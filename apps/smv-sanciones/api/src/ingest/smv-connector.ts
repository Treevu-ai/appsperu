import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

const BASE_URL = "https://mvnet.smv.gob.pe/SMV.OData.Api/api/registro/ListadoSanciones";
const DATASET = "smv_sanciones_personas_juridicas";

/**
 * El endpoint rechaza `sFechaInicio` fuera de 2018-2026 (ResponseCode 50002) —
 * confirmado en vivo 2026-10-07. No es un límite arbitrario nuestro, es el
 * rango que la API de SMV acepta.
 */
const FECHA_INICIO = "01/01/2018";

function fechaFin(): string {
  const now = new Date();
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${now.getUTCFullYear()}`;
}

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

interface SmvSancionRaw {
  FechaResolucion: string;
  NroResolucion: string;
  Empresa: string;
  Sumilla: string;
  Tipo: string;
  Monto: number;
  ConRecurso: string;
  NroResResolutiva: string;
  FechaResResolutiva: string;
}

interface SmvResponse {
  ResponseCode: string;
  Message: string;
  Resultado: SmvSancionRaw[] | null;
}

/** Convierte "24/12/2025 12:00:00 a.m." o "03/03/2026" a "2025-12-24"; cadena vacía → null. */
function toIsoDate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const datePart = trimmed.split(" ")[0];
  const [dd, mm, yyyy] = datePart.split("/");
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

async function fetchSanciones(): Promise<{ raw: string; rows: SmvSancionRaw[] }> {
  const url = `${BASE_URL}?sFechaInicio=${FECHA_INICIO}&sFechaFin=${fechaFin()}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`SMV devolvió ${res.status} al pedir ${url}`);
  const raw = await res.text();
  const parsed = JSON.parse(raw) as SmvResponse;
  if (parsed.ResponseCode !== "0" && parsed.ResponseCode !== "108") {
    throw new Error(`SMV devolvió ResponseCode=${parsed.ResponseCode}: ${parsed.Message}`);
  }
  return { raw, rows: parsed.Resultado ?? [] };
}

async function ingestSmvSanciones(): Promise<{ batchId: number; filasInsertadas: number }> {
  const { raw, rows } = await fetchSanciones();

  const client = await pool.connect();
  try {
    const { rows: batchRows } = await client.query<{ id: number }>(
      `INSERT INTO raw_smv_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
      [DATASET, BASE_URL, checksumOf(raw), rows.length]
    );
    const batchId = batchRows[0].id;

    let filasInsertadas = 0;
    await client.query("BEGIN");
    try {
      for (const row of rows) {
        await client.query(
          `INSERT INTO sanciones_smv
             (fecha_resolucion, nro_resolucion, empresa, sumilla, tipo, monto,
              con_recurso, nro_res_resolutiva, fecha_res_resolutiva, source_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            toIsoDate(row.FechaResolucion),
            row.NroResolucion,
            row.Empresa,
            row.Sumilla,
            row.Tipo,
            row.Monto,
            row.ConRecurso.trim().toLowerCase() === "si",
            row.NroResResolutiva || null,
            toIsoDate(row.FechaResResolutiva),
            batchId,
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
  ingestSmvSanciones()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
