import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { CONFIRMED_MEF_FIELD_MAPPING } from "./field-mapping.js";
import { normalizeMefRows } from "./normalize.js";

const FILES_BASE_URL = "https://fs.datosabiertos.mef.gob.pe/datastorefiles";

/**
 * Los archivos del MEF son de escala nacional completa, no paginados: se
 * confirmó en vivo que pesan entre 4.5 GB (2009) y 10+ GB (años recientes) —
 * incluso el "mensual" 2026 pesa 6.2 GB. Cargar el archivo completo en
 * memoria (como hacía la primera versión de este conector) cuelga el
 * proceso. Por eso el default es una descarga PARCIAL vía HTTP Range: sirve
 * para probar el pipeline end-to-end con datos reales, pero NO es una
 * ingesta completa del dataset.
 *
 * TODO antes de producción: reemplazar por streaming real (parseo por
 * chunks + inserts en lote) y mover el lake de evidencia crudo a
 * almacenamiento de archivos en vez de JSONB inline — un payload de
 * millones de filas no cabe razonablemente en una columna jsonb.
 */
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB — suficiente para una muestra real de miles de filas

function checksumOf(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

async function fetchRange(url: string, start: number, end: number): Promise<string> {
  const res = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } });
  if (!res.ok && res.status !== 206) {
    throw new Error(`MEF devolvió ${res.status} al pedir bytes=${start}-${end}`);
  }
  return res.text();
}

/**
 * Descarga un prefijo acotado (`maxBytes`) del CSV vía HTTP Range y lo
 * parsea. Cuando `startByte` es 0 (default), el rango arranca en el header
 * real del archivo. Cuando `startByte` > 0 (para saltar a una sección del
 * archivo que no empieza en el byte 0, ej. un departamento específico), el
 * header se pide aparte y se antepone — sin él, csv-parse no sabría a qué
 * columna corresponde cada valor. La primera y última línea del rango de
 * datos pueden quedar cortadas a la mitad — se descartan antes de parsear.
 */
export async function fetchMefCsv(
  filename: string,
  maxBytes: number = DEFAULT_MAX_BYTES,
  startByte = 0
): Promise<{ rows: Record<string, unknown>[]; rawText: string; isPartial: boolean }> {
  const url = `${FILES_BASE_URL}/${filename}`;

  let headerLine = "";
  if (startByte > 0) {
    const headerChunk = await fetchRange(url, 0, 4095);
    headerLine = headerChunk.slice(0, headerChunk.indexOf("\n"));
  }

  let text = await fetchRange(url, startByte, startByte + maxBytes - 1);
  const isPartial = true;

  const lastNewline = text.lastIndexOf("\n");
  if (lastNewline > 0) text = text.slice(0, lastNewline);

  if (startByte > 0) {
    const firstNewline = text.indexOf("\n");
    if (firstNewline > 0) text = text.slice(firstNewline + 1);
    text = `${headerLine}\n${text}`;
  }

  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];

  return { rows, rawText: text, isPartial };
}

/**
 * Guarda el lote crudo en el lake de evidencia. Nunca actualiza un lote existente.
 */
async function saveRawBatch(
  client: PoolClient,
  filename: string,
  rawText: string,
  recordCount: number
): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_mef_batches (resource_id, query, checksum, record_count, payload)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [filename, `range-download:${filename}`, checksumOf(rawText), recordCount, JSON.stringify({ csv: rawText })]
  );
  return result.rows[0].id;
}

/**
 * Deriva el catálogo territorial del propio CSV de ejecución del MEF (trae
 * código + nombre de departamento/provincia/distrito por fila). No es INEI
 * oficial — se registra la fuente real como tal — pero evita depender de un
 * import separado para que `entities.ubigeo` tenga a qué apuntar.
 */
async function upsertTerritoryFromMef(
  client: PoolClient,
  ubigeo: string,
  departamento: string | null,
  provincia: string | null,
  distrito: string | null
): Promise<void> {
  await client.query(
    `INSERT INTO territories (ubigeo, departamento, provincia, distrito, vigente_desde, fuente)
     VALUES ($1, $2, $3, $4, CURRENT_DATE, 'MEF - Presupuesto y ejecución de gasto (derivado, no INEI oficial)')
     ON CONFLICT (ubigeo) DO NOTHING`,
    [ubigeo, departamento ?? "Sin especificar", provincia, distrito]
  );
}

async function upsertEntity(
  client: PoolClient,
  entityCode: string,
  entityName: string,
  nivelGobierno: string,
  ubigeo: string | null
): Promise<void> {
  await client.query(
    `INSERT INTO entities (entity_code, nombre, nivel_gobierno, ubigeo)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (entity_code) DO UPDATE
       SET nombre = EXCLUDED.nombre,
           nivel_gobierno = EXCLUDED.nivel_gobierno,
           ubigeo = COALESCE(EXCLUDED.ubigeo, entities.ubigeo)`,
    [entityCode, entityName, nivelGobierno, ubigeo]
  );
}

export interface IngestSummary {
  batchId: number;
  totalFetched: number;
  accepted: number;
  skippedOtherDepartamento: number;
  rejected: number;
  nullRatePct: number;
  isPartial: boolean;
}

export interface IngestOptions {
  mapping?: typeof CONFIRMED_MEF_FIELD_MAPPING;
  maxBytes?: number;
  startByte?: number;
  /**
   * Filtra por DEPARTAMENTO_META (a dónde se dirige el gasto) — incluye
   * programas nacionales que ejecutan metas en ese departamento aunque su
   * sede esté en otro. Se aplica antes de agregar.
   */
  departamento?: string;
  /**
   * Filtra por el departamento de la propia entidad ejecutora (dónde tiene
   * sede/opera la entidad) — para traer la ejecución del Gobierno Regional o
   * municipalidades de un departamento, no lo que otros le destinan. Se
   * aplica después de agregar (el modelo canónico ya trae este campo).
   */
  ejecutoraDepartamento?: string;
}

/**
 * Punto de entrada de la ingesta: descarga un prefijo del CSV del año
 * indicado (ver `fetchMefCsv`), guarda el lote crudo, normaliza (agregando
 * por entidad+función+año) y escribe budget_execution + rechazados.
 */
export async function ingestMefBudgetExecution(
  filename: string,
  options: IngestOptions = {}
): Promise<IngestSummary> {
  const {
    mapping = CONFIRMED_MEF_FIELD_MAPPING,
    maxBytes = DEFAULT_MAX_BYTES,
    startByte = 0,
    departamento,
    ejecutoraDepartamento,
  } = options;

  const { rows: fetchedRecords, rawText, isPartial } = await fetchMefCsv(filename, maxBytes, startByte);
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const batchId = await saveRawBatch(client, filename, rawText, fetchedRecords.length);

    // El filtro se aplica ANTES de agregar, sobre DEPARTAMENTO_META (a dónde
    // se dirige el gasto) — no sobre el departamento de la entidad ejecutora.
    // Un ministerio con sede en Lima puede ejecutar metas en La Libertad; eso
    // es "dato de La Libertad" para efectos de este filtro. Filtrar antes de
    // agregar evita mezclar metas de distintos departamentos bajo una misma
    // fila entidad+función+año.
    const wantedDepartamento = departamento?.toUpperCase().trim();
    const records = wantedDepartamento
      ? fetchedRecords.filter(
          (r) => String(r[mapping.metaDepartamentoNombre] ?? "").toUpperCase().trim() === wantedDepartamento
        )
      : fetchedRecords;
    const skippedOtherDepartamento = fetchedRecords.length - records.length;

    const { rows: aggregatedRows, rejected } = normalizeMefRows(records, mapping);
    const wantedEjecutoraDept = ejecutoraDepartamento?.toUpperCase().trim();
    const rows = wantedEjecutoraDept
      ? aggregatedRows.filter((r) => r.departamentoNombre?.toUpperCase().trim() === wantedEjecutoraDept)
      : aggregatedRows;
    const fechaCorte = new Date().toISOString().slice(0, 10);

    // Cuando se filtró por meta, esa columna se persiste junto al monto —
    // sin esto, "gasto nacional dirigido a X" se vuelve indistinguible de
    // "ejecución propia de X" una vez escrito en budget_execution.
    const metaDepartamentoToPersist = wantedDepartamento ?? null;

    for (const row of rows) {
      if (row.ubigeo) {
        await upsertTerritoryFromMef(
          client,
          row.ubigeo,
          row.departamentoNombre,
          row.provinciaNombre,
          row.distritoNombre
        );
      }
      await upsertEntity(client, row.entityCode, row.entityName, row.nivelGobierno, row.ubigeo);
      await client.query(
        `INSERT INTO budget_execution
           (entity_code, funcion, anio_fiscal, pia, pim, devengado, fecha_corte, source_batch_id, meta_departamento)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (entity_code, funcion, anio_fiscal, fecha_corte, COALESCE(meta_departamento, '')) DO UPDATE
           SET pia = EXCLUDED.pia, pim = EXCLUDED.pim, devengado = EXCLUDED.devengado,
               source_batch_id = EXCLUDED.source_batch_id`,
        [
          row.entityCode,
          row.funcion,
          row.anioFiscal,
          row.pia,
          row.pim,
          row.devengado,
          fechaCorte,
          batchId,
          metaDepartamentoToPersist,
        ]
      );
    }

    for (const bad of rejected) {
      await client.query(
        `INSERT INTO budget_execution_rejected (source_batch_id, raw_row, reason)
         VALUES ($1, $2, $3)`,
        [batchId, JSON.stringify(bad.raw), bad.reason]
      );
    }

    await client.query("COMMIT");

    return {
      batchId,
      totalFetched: fetchedRecords.length,
      accepted: rows.length,
      skippedOtherDepartamento,
      rejected: rejected.length,
      nullRatePct: records.length === 0 ? 0 : Math.round((rejected.length / records.length) * 10000) / 100,
      isPartial,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const filename = process.env.MEF_DATA_FILENAME;
  if (!filename) {
    console.error("Define MEF_DATA_FILENAME en .env (ej. 2026-Gasto-Mensual.csv) antes de ingerir.");
    process.exit(1);
  }
  const startByte = process.env.MEF_RANGE_START_BYTES ? Number(process.env.MEF_RANGE_START_BYTES) : 0;
  const maxBytes = process.env.MEF_RANGE_MAX_BYTES ? Number(process.env.MEF_RANGE_MAX_BYTES) : undefined;
  const departamento = process.env.MEF_FILTER_DEPARTAMENTO;
  const ejecutoraDepartamento = process.env.MEF_FILTER_EJECUTORA_DEPARTAMENTO;

  ingestMefBudgetExecution(filename, { startByte, maxBytes, departamento, ejecutoraDepartamento })
    .then((summary) => {
      console.log("Ingesta completada:", summary);
      if (summary.isPartial) {
        console.warn(
          "AVISO: esta es una ingesta PARCIAL (rango de bytes acotado). " +
            "El archivo completo pesa varios GB — ver TODO en mef-connector.ts antes de producción."
        );
      }
      return pool.end();
    })
    .catch((err) => {
      console.error("Ingesta falló:", err);
      process.exit(1);
    });
}
