import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";

const SOURCE_URL = "https://www.datosabiertos.gob.pe/sites/default/files/2605_COLEGIOS%20H%C3%81BILES%20-%20PRONABEC.csv";
const DATASET = "pronabec_colegios_habiles";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const BATCH_SIZE = 1000;

interface Row {
  colegioNombre: string;
  modalidadEstudio: string | null;
  educacionForma: string | null;
  tipoGestion: string | null;
  telefono: string | null;
  direccion: string | null;
  localidad: string | null;
  centroPoblado: string | null;
  ugel: string | null;
}

function parseCsv(text: string): { rows: Row[]; rejected: number } {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: Row[] = [];
  let rejected = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 9) {
      rejected++;
      continue;
    }
    const colegioNombre = cols[0].trim();
    if (!colegioNombre) {
      rejected++;
      continue;
    }
    rows.push({
      colegioNombre,
      modalidadEstudio: cols[1]?.trim() || null,
      educacionForma: cols[2]?.trim() || null,
      tipoGestion: cols[3]?.trim() || null,
      telefono: cols[4]?.trim() || null,
      direccion: cols[5]?.trim() || null,
      localidad: cols[6]?.trim() || null,
      centroPoblado: cols[7]?.trim() || null,
      ugel: cols[8]?.trim() || null,
    });
  }
  return { rows, rejected };
}

async function insertBatch(client: PoolClient, rows: Row[], batchId: number): Promise<void> {
  if (rows.length === 0) return;
  const values: unknown[] = [];
  const placeholders: string[] = [];
  rows.forEach((row, idx) => {
    const base = idx * 10;
    placeholders.push(
      `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10})`
    );
    values.push(
      row.colegioNombre, row.modalidadEstudio, row.educacionForma, row.tipoGestion,
      row.telefono, row.direccion, row.localidad, row.centroPoblado, row.ugel, batchId
    );
  });
  await client.query(
    `INSERT INTO colegios_habiles
       (colegio_nombre, modalidad_estudio, educacion_forma, tipo_gestion, telefono,
        direccion, localidad, centro_poblado, ugel, source_batch_id)
     VALUES ${placeholders.join(",")}`,
    values
  );
}

async function ingestPronabec(): Promise<{ batchId: number; filasInsertadas: number; filasRechazadas: number }> {
  const res = await fetch(SOURCE_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) {
    throw new Error(`PRONABEC devolvió ${res.status} al descargar ${SOURCE_URL}`);
  }
  const text = await res.text();
  const { rows, rejected } = parseCsv(text);
  const checksum = createHash("sha256").update(text).digest("hex");

  const metaClient = await pool.connect();
  let batchId: number;
  try {
    const { rows: batchRows } = await metaClient.query<{ id: number }>(
      `INSERT INTO raw_pronabec_batches (dataset, source_url, checksum, record_count) VALUES ($1, $2, $3, $4) RETURNING id`,
      [DATASET, SOURCE_URL, checksum, rows.length]
    );
    batchId = batchRows[0].id;
  } finally {
    metaClient.release();
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const slice = rows.slice(i, i + BATCH_SIZE);
      await insertBatch(client, slice, batchId);
      await client.query("COMMIT");
      inserted += slice.length;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return { batchId, filasInsertadas: inserted, filasRechazadas: rejected };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestPronabec()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
