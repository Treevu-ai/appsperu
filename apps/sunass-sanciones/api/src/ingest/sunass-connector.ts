import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

const SOURCE_URL = "https://www.datosabiertos.gob.pe/sites/default/files/Sanciones_impuestas_Dataset.csv";
const DATASET = "sunass_sanciones_eps";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

interface Row {
  expediente: string;
  administrado: string;
  ubigeo: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  tema: string | null;
  incumplimiento: string | null;
  resolucion: string | null;
  multa: boolean;
  amonestacionEscrita: boolean;
  remocion: boolean;
  archivo: boolean;
  medidaCorrectiva: boolean;
  anio: number | null;
  mes: number | null;
}

function toBool(v: string): boolean {
  return v.trim() === "1";
}

/**
 * `administrado`/`incumplimiento`/`resolucion` son texto libre y pueden traer comas dentro de
 * comillas (ej. "EPS SEDAPAL, SUCURSAL NORTE") — un `split(",")` ingenuo corta ahí y desplaza
 * todas las columnas siguientes, corrompiendo `multa`/`anio`/`mes` sin avisar (hallazgo real de
 * CodeRabbit en PR #233). Parser consciente de comillas, mismo patrón que senasa-connector.ts.
 */
function parseCsvLine(line: string): string[] {
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
    } else if (c === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function parseCsv(text: string): Row[] {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    if (cols.length < 17) continue;
    rows.push({
      expediente: cols[0].trim(),
      administrado: cols[1].trim(),
      ubigeo: cols[2].trim() || null,
      departamento: cols[3].trim() || null,
      provincia: cols[4].trim() || null,
      distrito: cols[5].trim() || null,
      tema: cols[6].trim() || null,
      incumplimiento: cols[7].trim() || null,
      resolucion: cols[8].trim() || null,
      multa: toBool(cols[9]),
      amonestacionEscrita: toBool(cols[10]),
      remocion: toBool(cols[11]),
      archivo: toBool(cols[12]),
      medidaCorrectiva: toBool(cols[13]),
      anio: Number(cols[14].trim()) || null,
      mes: Number(cols[15].trim()) || null,
    });
  }
  return rows;
}

async function ingestSunass(): Promise<{ batchId: number; filasInsertadas: number }> {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`SUNASS devolvió ${res.status} al descargar ${SOURCE_URL}`);
  }
  const text = await res.text();
  const rows = parseCsv(text);
  const checksum = createHash("sha256").update(text).digest("hex");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: batchRows } = await client.query<{ id: number }>(
      `INSERT INTO raw_sunass_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
      [DATASET, SOURCE_URL, checksum, rows.length]
    );
    const batchId = batchRows[0].id;

    for (const row of rows) {
      await client.query(
        `INSERT INTO sanciones_eps
           (expediente, administrado, ubigeo, departamento, provincia, distrito, tema,
            incumplimiento, resolucion, multa, amonestacion_escrita, remocion, archivo,
            medida_correctiva, anio, mes, source_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         ON CONFLICT (expediente) DO UPDATE SET
           administrado = EXCLUDED.administrado, ubigeo = EXCLUDED.ubigeo, departamento = EXCLUDED.departamento,
           provincia = EXCLUDED.provincia, distrito = EXCLUDED.distrito, tema = EXCLUDED.tema,
           incumplimiento = EXCLUDED.incumplimiento, resolucion = EXCLUDED.resolucion,
           multa = EXCLUDED.multa, amonestacion_escrita = EXCLUDED.amonestacion_escrita,
           remocion = EXCLUDED.remocion, archivo = EXCLUDED.archivo,
           medida_correctiva = EXCLUDED.medida_correctiva, anio = EXCLUDED.anio, mes = EXCLUDED.mes,
           source_batch_id = EXCLUDED.source_batch_id`,
        [
          row.expediente, row.administrado, row.ubigeo, row.departamento, row.provincia,
          row.distrito, row.tema, row.incumplimiento, row.resolucion, row.multa,
          row.amonestacionEscrita, row.remocion, row.archivo, row.medidaCorrectiva,
          row.anio, row.mes, batchId,
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
  ingestSunass()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
