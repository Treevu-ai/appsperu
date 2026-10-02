import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

const SOURCE_URL =
  "https://www.osinergmin.gob.pe/seccion/centro_documental/hidrocarburos/SCOP/SCOP-DOCS/Reporte-Diario/CL-Registro-precios-DMIN.csv";
const DATASET = "osinergmin_precios_combustibles_dmin";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

interface Row {
  registroHidrocarburos: string | null;
  ruc: string | null;
  razonSocial: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  direccion: string | null;
  departamentoReparto: string | null;
  provinciaReparto: string | null;
  fechaRegistro: string | null;
  producto: string;
  precioMinSoles: number | null;
  precioMaxSoles: number | null;
  unidad: string | null;
}

function nanToNull(value: string): string | null {
  const v = value.trim();
  return v === "" || v.toLowerCase() === "nan" ? null : v;
}

function parseDecimalComa(value: string): number | null {
  const v = nanToNull(value);
  if (!v) return null;
  const normalized = v.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isNaN(n) ? null : n;
}

function parseFechaRegistro(value: string): string | null {
  const v = nanToNull(value);
  if (!v) return null;
  const m = v.match(/^(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
}

function parseCsv(text: string): { rows: Row[]; rejected: number } {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: Row[] = [];
  let rejected = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(";");
    if (cols.length < 16) {
      rejected++;
      continue;
    }
    const razonSocial = cols[4].trim();
    const producto = cols[12].trim();
    if (!razonSocial || !producto) {
      rejected++;
      continue;
    }
    rows.push({
      registroHidrocarburos: nanToNull(cols[2]),
      ruc: nanToNull(cols[3]),
      razonSocial,
      departamento: nanToNull(cols[5]),
      provincia: nanToNull(cols[6]),
      distrito: nanToNull(cols[7]),
      direccion: nanToNull(cols[8]),
      departamentoReparto: nanToNull(cols[9]),
      provinciaReparto: nanToNull(cols[10]),
      fechaRegistro: parseFechaRegistro(cols[11]),
      producto,
      precioMinSoles: parseDecimalComa(cols[13]),
      precioMaxSoles: parseDecimalComa(cols[14]),
      unidad: nanToNull(cols[15]),
    });
  }
  return { rows, rejected };
}

async function ingestPreciosCombustibles(): Promise<{
  batchId: number;
  filasInsertadas: number;
  filasRechazadas: number;
}> {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`OSINERGMIN devolvió ${res.status} al descargar ${SOURCE_URL}`);
  }
  const text = await res.text();
  const { rows, rejected } = parseCsv(text);
  const checksum = createHash("sha256").update(text).digest("hex");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: batchRows } = await client.query<{ id: number }>(
      `INSERT INTO raw_osinergmin_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
      [DATASET, SOURCE_URL, checksum, rows.length]
    );
    const batchId = batchRows[0].id;

    for (const row of rows) {
      await client.query(
        `INSERT INTO precios_combustibles_distribuidores
           (registro_hidrocarburos, ruc, razon_social, departamento, provincia, distrito,
            direccion, departamento_reparto, provincia_reparto, fecha_registro, producto,
            precio_min_soles, precio_max_soles, unidad, source_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          row.registroHidrocarburos, row.ruc, row.razonSocial, row.departamento, row.provincia,
          row.distrito, row.direccion, row.departamentoReparto, row.provinciaReparto,
          row.fechaRegistro, row.producto, row.precioMinSoles, row.precioMaxSoles,
          row.unidad, batchId,
        ]
      );
    }
    await client.query("COMMIT");
    return { batchId, filasInsertadas: rows.length, filasRechazadas: rejected };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestPreciosCombustibles()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
