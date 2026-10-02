import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { pool } from "../db/pool.js";

const SOURCE_URL = "https://www.datosabiertos.gob.pe/sites/default/files/DataPadron_EG_2026.csv";
const DATASET = "reniec_padron_electoral_eg_2026";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const BATCH_SIZE = 1000;
const FETCH_TIMEOUT_MS = 120_000;

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

/**
 * Split de una línea CSV delimitada por `,` respetando comillas RFC4180.
 * Residencia "Extranjero" trae países con coma en el nombre dentro de
 * comillas (ej. `"Egipto, República Árabe"`) -- un `split(",")` ingenuo
 * parte ese campo en dos y desalinea todas las columnas siguientes,
 * haciendo que `cantidad` (última columna) lea el valor de `TipoDNI` en su
 * lugar. Confirmado en vivo contra el CSV real (fila con Egipto/Kenia como
 * país de residencia). Mismo bug de clase que se encontró y corrigió hoy en
 * osinergmin-connector.ts (ahí con `;` en vez de `,`).
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
    } else if (c === ",") {
      out.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  out.push(current);
  return out;
}

/**
 * Hallazgo de CodeRabbit en PR #224: una fila corta se descartaba en
 * silencio y una `cantidad` no numérica se guardaba como 0 -- ambos casos
 * podían reducir el conteo poblacional persistido sin que nada lo
 * reportara. Esta tabla alimenta el denominador de tasas por 100k
 * habitantes del Termómetro SIDPOL (SID), así que un conteo silenciosamente
 * bajo sesga esa tasa sin ningún indicio visible. Ahora cada fila inválida
 * lanza y aborta la ingesta completa -- preferible a persistir un número
 * que no corresponde a la fuente real.
 */
function parseCsv(text: string): Row[] {
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const rows: Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length < 16) {
      throw new Error(`RENIEC: fila ${i + 1} tiene menos de 16 columnas (${cols.length})`);
    }
    const cantidadText = cols[15].trim();
    const cantidad = Number(cantidadText);
    if (cantidadText.length === 0 || !Number.isFinite(cantidad)) {
      throw new Error(`RENIEC: cantidad inválida en la fila ${i + 1}: "${cantidadText}"`);
    }
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
      cantidad,
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
  const res = await fetch(SOURCE_URL, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`RENIEC devolvió ${res.status} al descargar ${SOURCE_URL}`);
  }
  const text = await res.text();
  const rows = parseCsv(text);
  const checksum = createHash("sha256").update(text).digest("hex");

  // Hallazgo de CodeRabbit en PR #224, confirmado EN VIVO durante esta misma
  // sesión: sin serializar por checksum, dos corridas concurrentes pueden
  // encontrar el mismo batch incompleto, borrar las filas de la otra y
  // reinsertar ambas sobre el mismo batchId -- se observó una duplicación
  // real (de 842,220 a 1,620,660 filas) cuando dos invocaciones en
  // background quedaron huérfanas y corrieron a la vez. `pg_advisory_lock`
  // sobre una conexión dedicada, mantenida durante TODA la ingesta (claim +
  // borrado + inserción + marcado de completo), hace que la segunda corrida
  // espere a que la primera termine en vez de pisarla -- al obtener el lock
  // ya encuentra el batch `completo` y sale sin tocar nada.
  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [checksum]);

    // Claim atómico del batch por checksum (migración 002): `ON CONFLICT DO
    // NOTHING` evita la ventana entre un SELECT de existencia y un INSERT
    // aparte. Si el batch ya existe y quedó `completo`, la reingesta se
    // omite (idempotencia real: reimportar el mismo CSV dos veces no
    // duplica el denominador poblacional). Si existe pero quedó incompleto
    // (una corrida anterior se interrumpió a mitad de los lotes), se
    // limpian sus filas parciales y se reintenta con el mismo batchId.
    const { rows: claimRows } = await lockClient.query<{ id: number }>(
      `INSERT INTO raw_reniec_batches (dataset, source_url, checksum, record_count)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (checksum) DO NOTHING
       RETURNING id`,
      [DATASET, SOURCE_URL, checksum, rows.length]
    );
    let batchId: number;
    if (claimRows.length > 0) {
      batchId = claimRows[0].id;
    } else {
      const { rows: existente } = await lockClient.query<{ id: number; completo: boolean }>(
        `SELECT id, completo FROM raw_reniec_batches WHERE checksum = $1`,
        [checksum]
      );
      batchId = existente[0].id;
      if (existente[0].completo) {
        return { batchId, filasInsertadas: 0 };
      }
      await lockClient.query(`DELETE FROM padron_electoral_2026 WHERE source_batch_id = $1`, [batchId]);
    }

    // Commits por lote (no una sola transacción de ~153 lotes) -- un corte de
    // conexión a mitad de una transacción larga revierte todo (confirmado en
    // vivo 2026-09-30, ECONNRESET a mitad de carga). Si se relanza, el claim
    // de arriba detecta el batch incompleto, limpia y retoma. El advisory
    // lock sigue tomado en `lockClient` mientras tanto, así que ninguna otra
    // corrida puede intervenir estas filas.
    let inserted = 0;
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

    await lockClient.query(`UPDATE raw_reniec_batches SET completo = true WHERE id = $1`, [batchId]);
    return { batchId, filasInsertadas: inserted };
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [checksum]).catch(() => {});
    lockClient.release();
  }
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
