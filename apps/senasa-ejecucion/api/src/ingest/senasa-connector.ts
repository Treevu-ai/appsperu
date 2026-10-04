import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

const SOURCE_URL = "https://www.datosabiertos.gob.pe/sites/default/files/ejecfisica0521.csv";
const DATASET = "senasa_ejecucion_fisica_2021_2026";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

interface Row {
  anio: number;
  mes: number;
  codDep: string | null;
  nomDep: string | null;
  codPro: string | null;
  nomPro: string | null;
  codDis: string | null;
  nomDis: string | null;
  actividad: string | null;
  unidadMedida: string | null;
  ejecucionFisica: number;
}

/** Parser CSV con soporte de comillas (campos pueden traer comas dentro, ej. nombres de actividad). */
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
    const c = parseCsvLine(lines[i]);
    if (c.length < 12) continue;
    const anio = Number(c[1]);
    const mes = Number(c[2]);
    // anio/mes son INTEGER NOT NULL en la tabla — un NaN (fila de pie/cabecera mal cortada)
    // llega como el literal "NaN" a Postgres y hace fallar toda la transacción de una vez
    // (hallazgo real de CodeRabbit en PR #233). Se descarta la fila en vez de abortar el lote.
    if (!Number.isFinite(anio) || !Number.isFinite(mes)) continue;
    rows.push({
      anio,
      mes,
      codDep: c[3]?.trim() || null,
      nomDep: c[4]?.trim() || null,
      codPro: c[5]?.trim() || null,
      nomPro: c[6]?.trim() || null,
      codDis: c[7]?.trim() || null,
      nomDis: c[8]?.trim() || null,
      actividad: c[9]?.trim() || null,
      unidadMedida: c[10]?.trim() || null,
      ejecucionFisica: Number(c[11]) || 0,
    });
  }
  return rows;
}

async function ingestSenasa(): Promise<{ batchId: number; filasInsertadas: number }> {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`SENASA devolvió ${res.status} al descargar ${SOURCE_URL}`);
  }
  const text = await res.text();
  const rows = parseCsv(text);
  const checksum = createHash("sha256").update(text).digest("hex");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: batchRows } = await client.query<{ id: number }>(
      `INSERT INTO raw_senasa_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
      [DATASET, SOURCE_URL, checksum, rows.length]
    );
    const batchId = batchRows[0].id;

    for (const row of rows) {
      await client.query(
        `INSERT INTO ejecucion_fisica
           (anio, mes, cod_dep, nom_dep, cod_pro, nom_pro, cod_dis, nom_dis, actividad,
            unidad_medida, ejecucion_fisica, source_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [
          row.anio, row.mes, row.codDep, row.nomDep, row.codPro, row.nomPro, row.codDis,
          row.nomDis, row.actividad, row.unidadMedida, row.ejecucionFisica, batchId,
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
  ingestSenasa()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
