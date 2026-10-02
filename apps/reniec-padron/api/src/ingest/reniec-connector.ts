import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

const SOURCE_URL = "https://www.datosabiertos.gob.pe/sites/default/files/DataPadron_EG_2026.csv";
const DATASET = "reniec_padron_electoral_eg_2026";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const BATCH_SIZE = 1000;

interface Row {
  ubigeo: string | null;
  departamento: string;
  provincia: string;
  distrito: string;
  sexo: string;
  rangoEdad: string;
  caducidad: string;
  padron: string;
  discapacidad: string;
  educacion: string;
  estadoCivil: string;
  tipoDni: string;
  cantidad: number;
}

function parseCsv(text: string): Row[] {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 16) continue;
    rows.push({
      ubigeo: cols[1].trim() || null,
      departamento: cols[4].trim(),
      provincia: cols[5].trim(),
      distrito: cols[6].trim(),
      sexo: cols[7].trim(),
      rangoEdad: cols[8].trim(),
      caducidad: cols[9].trim(),
      padron: cols[10].trim(),
      discapacidad: cols[11].trim(),
      educacion: cols[12].trim(),
      estadoCivil: cols[13].trim(),
      tipoDni: cols[14].trim(),
      cantidad: Number(cols[15].trim()) || 0,
    });
  }
  return rows;
}

async function insertBatch(client: import("pg").PoolClient, rows: Row[], batchId: number): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  rows.forEach((row, idx) => {
    const base = idx * 14;
    placeholders.push(
      `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13},$${base + 14})`
    );
    values.push(
      row.ubigeo, row.departamento, row.provincia, row.distrito, row.sexo, row.rangoEdad,
      row.caducidad, row.padron, row.discapacidad, row.educacion, row.estadoCivil, row.tipoDni,
      row.cantidad, batchId
    );
  });
  await client.query(
    `INSERT INTO padron_electoral_2026
       (ubigeo, departamento, provincia, distrito, sexo, rango_edad, caducidad, padron,
        discapacidad, educacion, estado_civil, tipo_dni, cantidad, source_batch_id)
     VALUES ${placeholders.join(",")}`,
    values
  );
}

async function ingestReniec(): Promise<{ batchId: number; filasInsertadas: number }> {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`RENIEC devolvió ${res.status} al descargar ${SOURCE_URL}`);
  }
  const text = await res.text();
  const rows = parseCsv(text);
  const checksum = createHash("sha256").update(text).digest("hex");

  // Commits por lote (no una sola transacción de 153 lotes) -- un corte de
  // conexión a mitad de una transacción larga revierte todo (confirmado en
  // vivo 2026-09-30, ECONNRESET a mitad de carga). Si se relanza, el batch
  // anterior queda commiteado y solo hay que truncar antes de reintentar.
  let inserted = 0;
  const batchClient = await pool.connect();
  let batchId: number;
  try {
    const { rows: batchRows } = await batchClient.query<{ id: number }>(
      `INSERT INTO raw_reniec_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
      [DATASET, SOURCE_URL, checksum, rows.length]
    );
    batchId = batchRows[0].id;
  } finally {
    batchClient.release();
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await insertBatch(client, rows.slice(i, i + BATCH_SIZE), batchId);
      await client.query("COMMIT");
      inserted += Math.min(BATCH_SIZE, rows.length - i);
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
  ingestReniec()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
