import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse";
import { pool } from "../db/pool.js";

/**
 * Bienes muebles patrimoniales dados de baja — MEF, Plataforma Nacional de
 * Datos Abiertos, un CSV por año (2020-2024), sin autenticación.
 * https://www.datosabiertos.gob.pe/dataset/listado-de-bienes-muebles-patrimoniales-dados-de-baja
 *
 * Cada archivo pesa 47-96 MB (confirmado vía `curl -I` en vivo) — no ~13.5MB
 * como el AIRHSP. Se descarga y parsea en streaming (no `res.text()` +
 * `csv-parse/sync`) para no cargar el archivo completo en memoria; lección
 * aprendida en vivo de un conector hermano (airhsp-connector.ts) que se
 * quedó en 0 filas insertadas tras >7 minutos intentando cargar 357MB de
 * una sola vez.
 *
 * No hay checksum de contenido (streaming no permite hashear sin bufferizar
 * de nuevo) — se usa ETag/Last-Modified del servidor como identidad del
 * batch en su lugar.
 */

const FILES_BASE_URL = "https://fs.datosabiertos.mef.gob.pe/datastorefiles";
const BATCH_SIZE = 1000;
const COLUMNS_PER_ROW = 8;

interface BienesMueblesRow {
  RUC_ENTIDAD: string;
  NOM_ENTIDAD: string;
  NRO_RESOLUCION_BAJA: string;
  FECHA_RESOLUCION_BAJA: string;
  NOM_ACTO_BAJA: string;
  CODIGO_PATRIMONIAL: string;
  DENOMINACION_BIEN: string;
}

function parseFecha(value: string | undefined): string | null {
  if (!value) return null;
  const [dd, mm, yyyy] = value.split("/");
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

export interface BienesMueblesBajaIngestSummary {
  ejercicio: number;
  rowsTotal: number;
  rowsUpserted: number;
  batchId: number;
}

async function insertBatch(
  batchRaw: BienesMueblesRow[],
  ejercicio: number,
  batchId: number
): Promise<void> {
  // El CSV trae codigo_patrimonial duplicado dentro del mismo archivo/lote
  // en algunos casos — Postgres no permite que ON CONFLICT DO UPDATE afecte
  // la misma fila dos veces en una sentencia. Deduplicar por lote, última
  // ocurrencia gana (encontrado en vivo corriendo el conector contra 2024).
  const dedup = new Map<string, BienesMueblesRow>();
  for (const r of batchRaw) dedup.set(r.CODIGO_PATRIMONIAL, r);
  const batch = Array.from(dedup.values());

  const valuesSql = batch
    .map((_, idx) => {
      const base = idx * COLUMNS_PER_ROW;
      const placeholders = Array.from({ length: COLUMNS_PER_ROW }, (_, c) => `$${base + c + 1}`);
      return `(${placeholders.join(",")})`;
    })
    .join(",");
  const params = batch.flatMap((r) => [
    r.RUC_ENTIDAD,
    r.NOM_ENTIDAD,
    r.NRO_RESOLUCION_BAJA || null,
    parseFecha(r.FECHA_RESOLUCION_BAJA),
    r.NOM_ACTO_BAJA || null,
    r.CODIGO_PATRIMONIAL,
    r.DENOMINACION_BIEN,
    ejercicio,
  ]);

  await pool.query(
    `INSERT INTO bienes_muebles_baja (
       ruc_entidad, nom_entidad, nro_resolucion_baja, fecha_resolucion_baja,
       nom_acto_baja, codigo_patrimonial, denominacion_bien, ejercicio, source_batch_id
     ) SELECT v.ruc_entidad, v.nom_entidad, v.nro_resolucion_baja, v.fecha_resolucion_baja::date,
              v.nom_acto_baja, v.codigo_patrimonial, v.denominacion_bien, v.ejercicio::int, $${params.length + 1}
       FROM (VALUES ${valuesSql}) AS v(
         ruc_entidad, nom_entidad, nro_resolucion_baja, fecha_resolucion_baja,
         nom_acto_baja, codigo_patrimonial, denominacion_bien, ejercicio
       )
     ON CONFLICT (codigo_patrimonial) DO UPDATE SET
       nro_resolucion_baja = EXCLUDED.nro_resolucion_baja,
       fecha_resolucion_baja = EXCLUDED.fecha_resolucion_baja,
       nom_acto_baja = EXCLUDED.nom_acto_baja,
       source_batch_id = EXCLUDED.source_batch_id`,
    [...params, batchId]
  );
}

export async function ingestBienesMueblesBajaYear(ejercicio: number): Promise<BienesMueblesBajaIngestSummary> {
  const url = `${FILES_BASE_URL}/BAJA_BM_PAT_${ejercicio}_INV.csv`;
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Bienes muebles baja ${ejercicio} devolvió ${res.status} en ${url}`);

  const etag = res.headers.get("etag");
  const lastModified = res.headers.get("last-modified");

  // batchId provisional: se crea antes de saber record_count (streaming), se
  // actualiza al final. Placeholder record_count=0 hasta cerrar el conteo.
  const { rows: existing } = await pool.query<{ id: number }>(
    `SELECT id FROM raw_bienes_muebles_baja_batches WHERE source_url = $1 AND etag IS NOT DISTINCT FROM $2 AND last_modified IS NOT DISTINCT FROM $3`,
    [url, etag, lastModified]
  );
  let batchId: number;
  if (existing.length > 0) {
    batchId = existing[0].id;
  } else {
    const { rows: inserted } = await pool.query<{ id: number }>(
      `INSERT INTO raw_bienes_muebles_baja_batches (source_url, ejercicio, etag, last_modified, record_count)
       VALUES ($1, $2, $3, $4, 0) RETURNING id`,
      [url, ejercicio, etag, lastModified]
    );
    batchId = inserted[0].id;
  }

  const parser = Readable.fromWeb(res.body as import("stream/web").ReadableStream).pipe(
    parse({ columns: true, skip_empty_lines: true, bom: true })
  );

  let totalRows = 0;
  let upserted = 0;
  let batch: BienesMueblesRow[] = [];

  for await (const record of parser) {
    const row = record as BienesMueblesRow;
    if (!row.CODIGO_PATRIMONIAL) continue;
    batch.push(row);
    totalRows += 1;
    if (batch.length >= BATCH_SIZE) {
      await insertBatch(batch, ejercicio, batchId);
      upserted += batch.length;
      batch = [];
    }
  }
  if (batch.length > 0) {
    await insertBatch(batch, ejercicio, batchId);
    upserted += batch.length;
  }

  await pool.query(`UPDATE raw_bienes_muebles_baja_batches SET record_count = $1 WHERE id = $2`, [totalRows, batchId]);

  return { ejercicio, rowsTotal: totalRows, rowsUpserted: upserted, batchId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ejercicio = Number(process.argv[2] ?? new Date().getFullYear() - 1);
  ingestBienesMueblesBajaYear(ejercicio)
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
    })
    .finally(() => pool.end())
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
