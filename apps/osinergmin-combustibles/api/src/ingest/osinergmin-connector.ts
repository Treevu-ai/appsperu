import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

const SOURCE_URL =
  "https://www.datosabiertos.gob.pe/sites/default/files/18Grifos%20y%20Estaciones%20de%20Servicios_1.csv";
const DATASET = "osinergmin_grifos_estaciones";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

interface Row {
  expediente: string;
  codigoOsinergmin: string | null;
  registro: string | null;
  ruc: string | null;
  razonSocial: string;
  direccionOperativa: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  tipoEstablecimiento: string | null;
  capacidadTotalClGln: number | null;
  fechaEmision: string | null;
  terminoVigencia: string | null;
  representante: string | null;
}

function nanToNull(value: string): string | null {
  const v = value.trim();
  return v === "" || v.toLowerCase() === "nan" ? null : v;
}

/**
 * `Number("1.234,5")` o cualquier texto no numérico da `NaN`, y el driver
 * `pg` lo envía como el string `'NaN'` -- Postgres lo acepta en una columna
 * `NUMERIC` en vez de rechazarlo, así que un valor corrupto entraba en
 * silencio. Hallazgo de CodeRabbit en PR #223, confirmado.
 */
function parseNumeric(value: string): number | null {
  const v = nanToNull(value);
  if (v === null) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

function parseFechaDdMmYyyy(value: string): string | null {
  const v = nanToNull(value);
  if (!v) return null;
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Split de una línea CSV delimitada por `;` respetando comillas RFC4180
 * (`""` escapa una comilla literal dentro de un campo entrecomillado).
 * El `split(";")` ingenuo anterior desalineaba columnas en filas cuya
 * DIRECCION OPERATIVA trae `;` embebido dentro de comillas (ej.
 * `"AV. ... LOTES 01; 02; 03"`, confirmado en vivo contra el CSV real).
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ";") {
      out.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  out.push(current);
  return out;
}

function parseCsv(text: string): { rows: Row[]; rejected: number } {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: Row[] = [];
  let rejected = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 26) {
      rejected++;
      continue;
    }
    const expediente = cols[1].trim();
    const razonSocial = cols[5].trim();
    if (!expediente || !razonSocial) {
      rejected++;
      continue;
    }
    rows.push({
      expediente,
      codigoOsinergmin: nanToNull(cols[2]),
      registro: nanToNull(cols[3]),
      ruc: nanToNull(cols[4]),
      razonSocial,
      direccionOperativa: nanToNull(cols[6]),
      departamento: nanToNull(cols[7]),
      provincia: nanToNull(cols[8]),
      distrito: nanToNull(cols[9]),
      tipoEstablecimiento: nanToNull(cols[10]),
      capacidadTotalClGln: parseNumeric(cols[21]),
      fechaEmision: parseFechaDdMmYyyy(cols[22]),
      terminoVigencia: nanToNull(cols[23]),
      representante: nanToNull(cols[24]),
    });
  }
  return { rows, rejected };
}

async function ingestOsinergmin(): Promise<{ batchId: number; filasInsertadas: number; filasRechazadas: number }> {
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
      [DATASET, SOURCE_URL, checksum, rows.length + rejected]
    );
    const batchId = batchRows[0].id;

    for (const row of rows) {
      await client.query(
        `INSERT INTO grifos_estaciones
           (expediente, codigo_osinergmin, registro, ruc, razon_social, direccion_operativa,
            departamento, provincia, distrito, tipo_establecimiento, capacidad_total_cl_gln,
            fecha_emision, termino_vigencia, representante, source_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (expediente) DO UPDATE
           SET codigo_osinergmin = EXCLUDED.codigo_osinergmin, registro = EXCLUDED.registro,
               ruc = EXCLUDED.ruc, razon_social = EXCLUDED.razon_social,
               direccion_operativa = EXCLUDED.direccion_operativa, departamento = EXCLUDED.departamento,
               provincia = EXCLUDED.provincia, distrito = EXCLUDED.distrito,
               tipo_establecimiento = EXCLUDED.tipo_establecimiento,
               capacidad_total_cl_gln = EXCLUDED.capacidad_total_cl_gln,
               fecha_emision = EXCLUDED.fecha_emision, termino_vigencia = EXCLUDED.termino_vigencia,
               representante = EXCLUDED.representante, source_batch_id = EXCLUDED.source_batch_id`,
        [
          row.expediente, row.codigoOsinergmin, row.registro, row.ruc, row.razonSocial,
          row.direccionOperativa, row.departamento, row.provincia, row.distrito,
          row.tipoEstablecimiento, row.capacidadTotalClGln, row.fechaEmision,
          row.terminoVigencia, row.representante, batchId,
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
  ingestOsinergmin()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
