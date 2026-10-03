import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

const SOURCE_URL = "https://www.datosabiertos.gob.pe/sites/default/files/Certificaciones_Evaluadas.csv";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const BATCH_SIZE = 500;

interface Row {
  expediente: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  ubigeo: string | null;
  titularProyecto: string | null;
  rucTitular: string | null;
  consultora: string | null;
  rucConsultora: string | null;
  tituloProyecto: string | null;
  unidadProyecto: string | null;
  tipoIga: string | null;
  actividad: string | null;
  fechaIngreso: string | null;
  estado: string | null;
  longitud: number | null;
  latitud: number | null;
  nroRd: string | null;
  fechaRd: string | null;
  montoInversion: number | null;
  monedaInversion: string | null;
}

/** Parser CSV con soporte de comillas (campos pueden traer punto y coma dentro, ej. títulos de proyecto). */
function parseCsvLine(line: string, delim: string): string[] {
  const fields: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function toNullable(s: string | undefined): string | null {
  const v = (s ?? "").trim();
  return v === "" ? null : v;
}

function parseFechaYyyyMmDd(s: string | undefined): string | null {
  const v = toNullable(s);
  if (!v || v.length !== 8) return null;
  return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
}

function parseCsv(text: string): Row[] {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = parseCsvLine(lines[i], ";");
    if (c.length < 21) continue;
    const expediente = toNullable(c[0]);
    if (!expediente) continue;
    rows.push({
      expediente,
      departamento: toNullable(c[1]),
      provincia: toNullable(c[2]),
      distrito: toNullable(c[3]),
      ubigeo: toNullable(c[4]),
      titularProyecto: toNullable(c[5]),
      rucTitular: toNullable(c[6]),
      consultora: toNullable(c[7]),
      rucConsultora: toNullable(c[8]),
      tituloProyecto: toNullable(c[9]),
      unidadProyecto: toNullable(c[10]),
      tipoIga: toNullable(c[11]),
      actividad: toNullable(c[12]),
      fechaIngreso: parseFechaYyyyMmDd(c[13]),
      estado: toNullable(c[14]),
      longitud: c[15] ? Number(c[15]) : null,
      latitud: c[16] ? Number(c[16]) : null,
      nroRd: toNullable(c[17]),
      fechaRd: parseFechaYyyyMmDd(c[18]),
      montoInversion: c[19] ? Number(c[19]) : null,
      monedaInversion: toNullable(c[20]),
    });
  }
  return rows;
}

export async function ingestCertificacionesEvaluadas(): Promise<{ batchId: number; filasInsertadas: number }> {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`SENACE devolvió ${res.status} al descargar ${SOURCE_URL}`);
  }
  const text = await res.text();
  const rows = parseCsv(text);
  const checksum = createHash("sha256").update(text).digest("hex");

  const metaClient = await pool.connect();
  let batchId: number;
  try {
    const { rows: batchRows } = await metaClient.query<{ id: number }>(
      `INSERT INTO raw_certificaciones_evaluadas_batches (source_url, checksum, record_count) VALUES ($1, $2, $3) RETURNING id`,
      [SOURCE_URL, checksum, rows.length]
    );
    batchId = batchRows[0].id;
  } finally {
    metaClient.release();
  }

  // Commits por lote -- mismo patrón que el resto de ingestas grandes de hoy,
  // para no sostener una sola conexión Postgres durante miles de inserts.
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const slice = rows.slice(i, i + BATCH_SIZE);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const row of slice) {
        await client.query(
          `INSERT INTO certificaciones_evaluadas
             (expediente, departamento, provincia, distrito, ubigeo, titular_proyecto, ruc_titular,
              consultora, ruc_consultora, titulo_proyecto, unidad_proyecto, tipo_iga, actividad,
              fecha_ingreso, estado, longitud, latitud, nro_rd, fecha_rd, monto_inversion,
              moneda_inversion, source_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
           ON CONFLICT (expediente) DO UPDATE SET
             estado = EXCLUDED.estado, monto_inversion = EXCLUDED.monto_inversion,
             source_batch_id = EXCLUDED.source_batch_id`,
          [
            row.expediente, row.departamento, row.provincia, row.distrito, row.ubigeo,
            row.titularProyecto, row.rucTitular, row.consultora, row.rucConsultora,
            row.tituloProyecto, row.unidadProyecto, row.tipoIga, row.actividad,
            row.fechaIngreso, row.estado, row.longitud, row.latitud, row.nroRd,
            row.fechaRd, row.montoInversion, row.monedaInversion, batchId,
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
  ingestCertificacionesEvaluadas()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
