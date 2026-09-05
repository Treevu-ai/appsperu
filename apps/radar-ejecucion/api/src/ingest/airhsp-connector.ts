import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";
import { parse } from "csv-parse";
import { pool } from "../db/pool.js";

/**
 * AIRHSP: personal activo y pensionista del sector público, agregado por
 * Unidad Ejecutora / régimen / cargo (columna CANTIDAD, no una fila por
 * persona). Dataset oficial del MEF en la Plataforma Nacional de Datos
 * Abiertos, un CSV público por año, sin autenticación.
 * https://www.datosabiertos.gob.pe/dataset/personal-activo-y-pensionista-del-sector-p%C3%BAblico-registrado-en-el-airhsp
 *
 * El CSV real pesa ~357 MB por año (no ~13.5 MB como se asumió al diseñar
 * el esquema) — cargarlo completo con `res.text()` + `csv-parse/sync` nunca
 * llegó a insertar una sola fila tras >15 min. Se descarga y parsea en
 * streaming (Readable.fromWeb + csv-parse en modo stream, iteración
 * for-await-of para respetar backpressure) sin retener el archivo completo
 * en memoria.
 */

const FILES_BASE_URL = "https://fs.datosabiertos.mef.gob.pe/datastorefiles";

interface AirhspRow {
  PERIODO: string;
  EJERCICIO: string;
  MES: string;
  NIVEL: string;
  CODIGO_SECTOR: string;
  SECTOR: string;
  CODIGO_PLIEGO: string;
  PLIEGO: string;
  CODIGO_UE: string;
  UNIDAD_EJECUTORA: string;
  TIPO_ESTABLECIMIENTO: string;
  DESC_TIPO_REGISTRO: string;
  DESC_SUB_TIPO_REGISTRO: string;
  ESTADO_REGISTRO: string;
  DESC_REGIMEN_LABORAL: string;
  // Ortografía intencional — así viene el encabezado real del CSV fuente
  // (verificado: los 652,392 registros ingeridos tienen ambos campos
  // poblados). No "corregir" a OCUPACIONAL/ESTRUCTURAL, rompería el mapeo.
  DESC_GRUPO_OCASIONAL: string;
  DESC_CARGO_ESTRUCUTURAL: string;
  DESC_CONDICION_LABORAL: string;
  DESC_REGIMEN_PENSIONARIO: string;
  CANTIDAD: string;
  COSTO_TOTAL_ANUAL: string;
}

function toNumOrNull(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// 22 columnas por fila; el límite de bind params de Postgres es 65535 —
// 1000 filas x 22 = 22000, con margen amplio.
const BATCH_SIZE = 1000;
const COLUMNS_PER_ROW = 22;

export interface AirhspIngestSummary {
  ejercicio: number;
  rowsTotal: number;
  rowsUpserted: number;
  batchId: number;
}

function rowToParams(r: AirhspRow, batchId: number): unknown[] {
  return [
    r.PERIODO,
    Number(r.EJERCICIO),
    Number(r.MES),
    r.NIVEL || null,
    r.CODIGO_SECTOR || null,
    r.SECTOR || null,
    r.CODIGO_PLIEGO || null,
    r.PLIEGO,
    r.CODIGO_UE || null,
    r.UNIDAD_EJECUTORA,
    r.TIPO_ESTABLECIMIENTO || null,
    r.DESC_TIPO_REGISTRO || null,
    r.DESC_SUB_TIPO_REGISTRO || null,
    r.ESTADO_REGISTRO || null,
    r.DESC_REGIMEN_LABORAL || null,
    r.DESC_GRUPO_OCASIONAL || null,
    r.DESC_CARGO_ESTRUCUTURAL || null,
    r.DESC_CONDICION_LABORAL || null,
    r.DESC_REGIMEN_PENSIONARIO || null,
    Number(r.CANTIDAD) || 0,
    toNumOrNull(r.COSTO_TOTAL_ANUAL),
    batchId,
  ];
}

function conflictKey(r: AirhspRow): string {
  return [
    r.PERIODO, r.CODIGO_PLIEGO, r.CODIGO_UE, r.DESC_TIPO_REGISTRO, r.DESC_SUB_TIPO_REGISTRO,
    r.DESC_REGIMEN_LABORAL, r.DESC_GRUPO_OCASIONAL, r.DESC_CARGO_ESTRUCUTURAL,
    r.DESC_CONDICION_LABORAL, r.DESC_REGIMEN_PENSIONARIO,
  ].join("");
}

/**
 * El CSV trae filas legítimamente distintas (ej. ESTADO_REGISTRO u otro
 * campo no incluido en la clave de conflicto) que colapsan a la misma
 * combinación (periodo, pliego, UE, tipo/subtipo de registro, régimen,
 * grupo, cargo, condición, régimen pensionario) — Postgres rechaza un
 * INSERT ... ON CONFLICT DO UPDATE que intente tocar la misma fila dos
 * veces dentro del mismo comando. Se colapsan sumando CANTIDAD/COSTO_TOTAL
 * antes de insertar, coherente con que la columna ya es un agregado.
 */
function dedupeBatch(batch: AirhspRow[]): AirhspRow[] {
  const merged = new Map<string, AirhspRow>();
  for (const r of batch) {
    const key = conflictKey(r);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, { ...r });
      continue;
    }
    const cantidad = (Number(existing.CANTIDAD) || 0) + (Number(r.CANTIDAD) || 0);
    const costo = (toNumOrNull(existing.COSTO_TOTAL_ANUAL) ?? 0) + (toNumOrNull(r.COSTO_TOTAL_ANUAL) ?? 0);
    existing.CANTIDAD = String(cantidad);
    existing.COSTO_TOTAL_ANUAL = String(costo);
  }
  return Array.from(merged.values());
}

async function insertBatch(rawBatch: AirhspRow[], batchId: number): Promise<number> {
  const batch = dedupeBatch(rawBatch);
  const valuesSql = batch
    .map((_, idx) => {
      const base = idx * COLUMNS_PER_ROW;
      const placeholders = Array.from({ length: COLUMNS_PER_ROW }, (_, c) => `$${base + c + 1}`);
      return `(${placeholders.join(",")})`;
    })
    .join(",");
  const params = batch.flatMap((r) => rowToParams(r, batchId));

  await pool.query(
    `INSERT INTO airhsp_personal (
       periodo, ejercicio, mes, nivel, codigo_sector, sector, codigo_pliego, pliego,
       codigo_ue, unidad_ejecutora, tipo_establecimiento, desc_tipo_registro,
       desc_sub_tipo_registro, estado_registro, desc_regimen_laboral,
       desc_grupo_ocupacional, desc_cargo_estructural, desc_condicion_laboral,
       desc_regimen_pensionario, cantidad, costo_total_anual, source_batch_id
     ) VALUES ${valuesSql}
     ON CONFLICT (periodo, codigo_pliego, codigo_ue, desc_tipo_registro, desc_sub_tipo_registro,
       desc_regimen_laboral, desc_grupo_ocupacional, desc_cargo_estructural,
       desc_condicion_laboral, desc_regimen_pensionario)
     DO UPDATE SET cantidad = EXCLUDED.cantidad, costo_total_anual = EXCLUDED.costo_total_anual,
       source_batch_id = EXCLUDED.source_batch_id`,
    params
  );
  return batch.length;
}

export async function ingestAirhspYear(ejercicio: number): Promise<AirhspIngestSummary> {
  const url = `${FILES_BASE_URL}/PERSONALSP_${ejercicio}.csv`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`AIRHSP ${ejercicio} devolvió ${res.status} en ${url}`);
  if (!res.body) throw new Error(`AIRHSP ${ejercicio}: respuesta sin body`);

  // Huella liviana en vez de sha256 del archivo completo (357MB): el ETag
  // que sirve el servidor de MEF ya identifica la versión exacta del
  // archivo, y estar disponible desde la respuesta de headers (antes de
  // leer el body) permite crear la fila de raw_airhsp_batches — y por
  // tanto el source_batch_id que cada fila necesita — antes de empezar a
  // parsear en streaming, sin tener que bufferizar nada para calcularla.
  const fingerprint =
    res.headers.get("etag") ??
    `${res.headers.get("last-modified") ?? ""}:${res.headers.get("content-length") ?? ""}`;
  if (!fingerprint || fingerprint === ":") {
    throw new Error(`AIRHSP ${ejercicio}: no se pudo obtener ETag ni Last-Modified/Content-Length de ${url}`);
  }

  let batchId: number;
  {
    const { rows: existing } = await pool.query<{ id: number }>(
      `SELECT id FROM raw_airhsp_batches WHERE source_url = $1 AND checksum = $2`,
      [url, fingerprint]
    );
    if (existing.length > 0) {
      batchId = existing[0].id;
    } else {
      const { rows: inserted } = await pool.query<{ id: number }>(
        `INSERT INTO raw_airhsp_batches (source_url, ejercicio, checksum, record_count)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [url, ejercicio, fingerprint, 0]
      );
      batchId = inserted[0].id;
    }
  }

  const nodeStream = Readable.fromWeb(res.body as unknown as import("node:stream/web").ReadableStream);
  const parser = nodeStream.pipe(parse({ columns: true, skip_empty_lines: true, bom: true }));

  let rowsTotal = 0;
  let upserted = 0;
  let batch: AirhspRow[] = [];

  for await (const record of parser as AsyncIterable<AirhspRow>) {
    rowsTotal += 1;
    batch.push(record);
    if (batch.length >= BATCH_SIZE) {
      upserted += await insertBatch(batch, batchId);
      batch = [];
    }
  }
  if (batch.length > 0) {
    upserted += await insertBatch(batch, batchId);
  }

  await pool.query(`UPDATE raw_airhsp_batches SET record_count = $1 WHERE id = $2`, [rowsTotal, batchId]);

  return { ejercicio, rowsTotal, rowsUpserted: upserted, batchId };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ejercicio = Number(process.argv[2] ?? new Date().getFullYear());
  ingestAirhspYear(ejercicio)
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
    })
    .finally(() => pool.end())
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
