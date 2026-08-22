import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import type { PoolClient } from "pg";
import { pool } from "../db/pool.js";
import { CONFIRMED_MEF_FIELD_MAPPING, type MefFieldMapping } from "./field-mapping.js";
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

/**
 * Hallazgo confirmado en vivo el 2026-08-18: `MONTO_PIA`/`MONTO_PIM` NO están
 * pobladas en las filas de movimiento mensual (`MES_EJE` 1-7 — el año fiscal
 * 2026 solo lleva hasta julio) — ahí siempre vienen en 0, solo
 * `MONTO_DEVENGADO` es real. El presupuesto de apertura/modificado vive en
 * filas separadas con `MES_EJE = "0"` (devengado = 0 en esas filas). Por eso
 * una ingesta parcial de una sola ventana de bytes (que cae en un solo mes)
 * solo trae uno de los dos campos, nunca ambos para las mismas filas.
 *
 * El archivo agrupa primero por `NIVEL_GOBIERNO_NOMBRE` (Regional → Local →
 * Nacional, confirmado en ese orden), luego dentro de cada nivel por
 * `MES_EJE` descendente (empieza en el mes corriente y baja hasta 0), y
 * dentro de cada mes, por departamento en orden alfabético. Los offsets de
 * abajo — uno por (nivel de gobierno, mes) para LA LIBERTAD — se ubicaron
 * escaneando el archivo completo (~6.2 GB) en pasos de 8-30 MB. Son
 * posiciones OBSERVADAS, no garantizadas por el MEF: si el archivo cambia de
 * tamaño/orden, la ventana puede dejar de contener filas de La Libertad.
 * `ingestMefFullYearForDepartamento` falla fuerte (no en silencio) si una
 * sección no trae ninguna fila del departamento pedido.
 *
 * Gobierno Nacional no se mapeó (no hay entidades con sede en La Libertad en
 * ese nivel — ver execution.ts, "gasto nacional dirigido a X" es un
 * concepto aparte, filtrado por DEPARTAMENTO_META, no por sede).
 */
const SECTION_OFFSETS_LA_LIBERTAD: Record<string, Record<string, number>> = {
  "GOBIERNOS REGIONALES": {
    "7": 120_000_000,
    "6": 320_000_000,
    "5": 500_000_000,
    "4": 680_000_000,
    "3": 840_000_000,
    "2": 984_000_000,
    "1": 1_112_000_000,
    "0": 1_368_000_000,
  },
  "GOBIERNOS LOCALES": {
    "7": 1_760_000_000,
    "6": 2_150_000_000,
    "5": 2_525_000_000,
    "4": 2_900_000_000,
    "3": 3_275_000_000,
    "2": 3_605_000_000,
    "1": 3_875_000_000,
    "0": 4_415_000_000,
  },
};
// Cada offset es un punto DENTRO del bloque del departamento, no
// necesariamente su inicio — se retrocede 20 MB para no perder el arranque
// del bloque, y se piden 60 MB en total (el bloque observado de La Libertad
// dentro de un mes ronda 30-40 MB).
const SECTION_LOOKBACK_BYTES = 20 * 1024 * 1024;
const SECTION_WINDOW_BYTES = 60 * 1024 * 1024;

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

export interface FullYearIngestSummary {
  batchIds: number[];
  entidadesActualizadas: number;
  seccionesSinDatos: string[];
}

/**
 * Ingesta comprensiva para un departamento (hoy solo tiene offsets
 * conocidos para LA LIBERTAD, ver `SECTION_OFFSETS_LA_LIBERTAD`): descarga
 * las 16 secciones (8 meses × 2 niveles de gobierno), junta TODAS las filas
 * crudas de ese departamento en un solo array, y recién ahí llama a
 * `normalizeMefRows` UNA vez — así el devengado de los 8 meses se SUMA
 * correctamente (agregación por entidad+función+año) y el PIA/PIM de la
 * sección MES_EJE=0 queda en las MISMAS filas que su devengado, no en filas
 * separadas sin match. Escribe budget_execution en un solo upsert final,
 * reemplazando pia/pim/devengado por completo (ahora sí correcto, porque la
 * fuente ya está completa para este departamento+año, a diferencia de
 * `ingestMefBudgetExecution`, pensada para una sola ventana parcial).
 */
export async function ingestMefFullYearForDepartamento(
  filename: string,
  ejecutoraDepartamento: string,
  mapping: MefFieldMapping = CONFIRMED_MEF_FIELD_MAPPING
): Promise<FullYearIngestSummary> {
  const wantedDepartamento = ejecutoraDepartamento.toUpperCase().trim();
  const offsetsByNivel = SECTION_OFFSETS_LA_LIBERTAD;

  const batchIds: number[] = [];
  const seccionesSinDatos: string[] = [];
  const allRecords: Record<string, unknown>[] = [];

  for (const [nivelGobierno, mesOffsets] of Object.entries(offsetsByNivel)) {
    for (const [mesEje, approxByte] of Object.entries(mesOffsets)) {
      const startByte = Math.max(0, approxByte - SECTION_LOOKBACK_BYTES);
      const { rows: fetchedRecords, rawText } = await fetchMefCsv(filename, SECTION_WINDOW_BYTES, startByte);

      const records = fetchedRecords.filter(
        (r) =>
          String(r.MES_EJE ?? "").trim() === mesEje &&
          String(r[mapping.departamentoNombre] ?? "").toUpperCase().trim() === wantedDepartamento
      );

      if (records.length === 0) {
        seccionesSinDatos.push(`${nivelGobierno}/mes=${mesEje}`);
        continue;
      }

      const client = await pool.connect();
      try {
        const batchId = await saveRawBatch(
          client,
          `${filename}#nivel=${nivelGobierno}#mes=${mesEje}`,
          rawText,
          records.length
        );
        batchIds.push(batchId);
      } finally {
        client.release();
      }

      allRecords.push(...records);
    }
  }

  if (allRecords.length === 0) {
    throw new Error(
      `No se encontró ninguna fila de "${ejecutoraDepartamento}" en ninguna de las 16 secciones configuradas. ` +
        `Los offsets de SECTION_OFFSETS_LA_LIBERTAD pueden haber quedado desactualizados — ` +
        `hay que volver a escanear el archivo.`
    );
  }

  const { rows } = normalizeMefRows(allRecords, mapping);
  const fechaCorte = new Date().toISOString().slice(0, 10);
  const lastBatchId = batchIds[batchIds.length - 1];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      await client.query(
        `INSERT INTO budget_execution
           (entity_code, funcion, anio_fiscal, pia, pim, devengado, fecha_corte, source_batch_id, meta_departamento)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL)
         ON CONFLICT (entity_code, funcion, anio_fiscal, fecha_corte, COALESCE(meta_departamento, '')) DO UPDATE
           SET pia = EXCLUDED.pia, pim = EXCLUDED.pim, devengado = EXCLUDED.devengado,
               source_batch_id = EXCLUDED.source_batch_id`,
        [row.entityCode, row.funcion, row.anioFiscal, row.pia, row.pim, row.devengado, fechaCorte, lastBatchId]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { batchIds, entidadesActualizadas: rows.length, seccionesSinDatos };
}

/**
 * Offsets del bloque "GOBIERNO NACIONAL" del archivo `2026-Gasto-Mensual.csv`
 * (confirmado en vivo el 2026-08-21 vía búsqueda binaria sobre bytes reales
 * del archivo remoto — no es una estimación). El bloque nacional viene
 * DESPUÉS de "GOBIERNOS LOCALES" (que termina cerca del byte 4,767,552,175)
 * y ocupa el resto del archivo hasta EOF. Tamaño total del archivo
 * confirmado por `Content-Range` en la respuesta HTTP: 6,240,885,549 bytes.
 *
 * A diferencia de `SECTION_OFFSETS_LA_LIBERTAD` (offsets *por departamento*,
 * porque el archivo ordena Regional/Local por `DEPARTAMENTO_EJECUTORA_NOMBRE`
 * y un departamento cae en un bloque contiguo angosto), estos offsets son
 * *por mes únicamente* — el orden interno del bloque Nacional sigue siendo
 * por departamento de la entidad ejecutora (mayormente Lima, sede de los
 * ministerios), no por `DEPARTAMENTO_META_NOMBRE`. Las filas dirigidas a un
 * departamento destino específico (ej. LA LIBERTAD) están **dispersas en
 * todo el bloque del mes**, no en una ventana angosta — por eso la ingesta
 * de abajo descarga cada sección de mes COMPLETA (decenas a cientos de MB),
 * no una ventana con lookback como el caso GR/GL. Esto hace que estos
 * offsets sirvan para filtrar por *cualquier* `DEPARTAMENTO_META_NOMBRE`, no
 * solo La Libertad — son offsets del bloque Nacional, no de un departamento.
 */
const NACIONAL_MES_START_BYTE: Record<string, number> = {
  "7": 4_767_552_175,
  "6": 4_962_111_870,
  "5": 5_128_297_026,
  "4": 5_295_149_068,
  "3": 5_454_753_275,
  "2": 5_614_487_230,
  "1": 5_768_701_506,
  "0": 5_914_421_330,
};
const NACIONAL_FILE_END_BYTE = 6_240_885_549;

/**
 * Ingesta comprensiva de Gobierno Nacional filtrado por `DEPARTAMENTO_META`
 * (a dónde se dirige el gasto, no dónde tiene sede la entidad) — ver
 * ADR-0006. Cierra el blind spot documentado en `SECTION_OFFSETS_LA_LIBERTAD`
 * arriba: `ingestMefFullYearForDepartamento` nunca ingiere Gobierno Nacional,
 * así que gasto de ministerios/programas con sede en Lima pero ejecutado
 * físicamente en un departamento (ej. reconstrucción post-desastre) era
 * invisible en `budget_execution` hasta esta función.
 *
 * Mismo patrón de agregación que `ingestMefFullYearForDepartamento`: junta
 * TODAS las filas de los 8 meses en un solo array y agrega una sola vez, para
 * que devengado (de los meses 1-7) y PIA/PIM (de MES_EJE=0) terminen en la
 * MISMA fila agregada por entidad+función+año, no en filas separadas sin
 * PIM/devengado completo.
 */
/**
 * Busca un lote ya descargado en una corrida anterior (mismo `resource_id`)
 * y devuelve sus filas crudas ya parseadas, sin volver a pedirlas por red.
 * Hace que la ingesta sea reanudable: cada sección de mes se descarga (~150-
 * 330 MB) una sola vez aunque el proceso se interrumpa a mitad de las 8 —
 * necesario porque una corrida completa (~1.47 GB, 8 secciones) puede
 * exceder el límite de tiempo de un proceso en background en este entorno
 * (confirmado en vivo el 2026-08-21: dos corridas completas fueron
 * terminadas externamente entre los 10 y 15 minutos, mucho antes de
 * completar las 8 secciones).
 */
async function loadCachedSection(
  resourceId: string,
  mesEje: string,
  mapping: MefFieldMapping,
  wantedMetaDepartamento: string
): Promise<{ id: number; rows: Record<string, unknown>[] } | null> {
  const { rows } = await pool.query<{ id: number; payload: { rows?: Record<string, unknown>[]; csv?: string } }>(
    `SELECT id, payload FROM raw_mef_batches WHERE resource_id = $1 ORDER BY fetched_at DESC LIMIT 1`,
    [resourceId]
  );
  if (rows.length === 0) return null;

  // Compatibilidad con lotes guardados antes de `saveFilteredBatch`
  // (formato viejo: CSV crudo sin filtrar completo — ver el comentario de
  // esa función sobre por qué se cambió el formato para mes=0).
  if (rows[0].payload.rows) {
    return { id: rows[0].id, rows: rows[0].payload.rows };
  }

  const parsedRows = parse(rows[0].payload.csv ?? "", {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  }) as Record<string, unknown>[];
  const filtered = parsedRows.filter(
    (r) =>
      String(r.MES_EJE ?? "").trim() === mesEje &&
      String(r[mapping.metaDepartamentoNombre] ?? "").toUpperCase().trim() === wantedMetaDepartamento
  );
  return { id: rows[0].id, rows: filtered };
}

/**
 * Guarda solo las filas YA FILTRADAS por `DEPARTAMENTO_META` (no la sección
 * completa sin filtrar, a diferencia del resto del proyecto). Esto es una
 * desviación deliberada del principio "el lake de evidencia nunca se filtra
 * antes de guardarse": la sección `mes=0` completa pesa ~311 MB de texto, y
 * Postgres rechaza strings JSONB de más de 268,435,455 bytes
 * (`error: string too long to represent as jsonb string`, confirmado en vivo
 * el 2026-08-21 — la primera versión de este connector intentaba guardar el
 * texto crudo completo y falló exactamente así). Las filas ya filtradas
 * (miles, no cientos de miles) pesan unos pocos MB — muy por debajo del
 * límite. El costo real: si `DEPARTAMENTO_META_NOMBRE` tuviera un bug de
 * normalización, las filas descartadas no quedan en ningún lado para
 * auditoría — aceptable acá porque el filtro es una comparación de string
 * exacta y trivial de verificar, no una heurística.
 */
async function saveFilteredBatch(
  client: PoolClient,
  resourceId: string,
  filteredRows: Record<string, unknown>[]
): Promise<number> {
  const payload = JSON.stringify({ rows: filteredRows });
  const result = await client.query<{ id: number }>(
    `INSERT INTO raw_mef_batches (resource_id, query, checksum, record_count, payload)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [resourceId, `meta-departamento-download:${resourceId}`, checksumOf(payload), filteredRows.length, payload]
  );
  return result.rows[0].id;
}

export async function ingestMefFullYearForMetaDepartamento(
  filename: string,
  metaDepartamento: string,
  mapping: MefFieldMapping = CONFIRMED_MEF_FIELD_MAPPING
): Promise<FullYearIngestSummary> {
  const wantedMetaDepartamento = metaDepartamento.toUpperCase().trim();
  const meses = ["7", "6", "5", "4", "3", "2", "1", "0"];

  const batchIds: number[] = [];
  const seccionesSinDatos: string[] = [];
  const allRecords: Record<string, unknown>[] = [];

  for (let i = 0; i < meses.length; i++) {
    const mesEje = meses[i];
    const resourceId = `${filename}#nivel=GOBIERNO NACIONAL#mes=${mesEje}#meta=${wantedMetaDepartamento}`;

    const cached = await loadCachedSection(resourceId, mesEje, mapping, wantedMetaDepartamento);
    if (cached) {
      // El payload cacheado YA está filtrado (ver `saveFilteredBatch`) — no
      // hace falta re-filtrar.
      console.log(`  [cache] mes=${mesEje}: ${cached.rows.length} filas de ${wantedMetaDepartamento} (sección ya descargada)`);
      batchIds.push(cached.id);
      allRecords.push(...cached.rows);
      continue;
    }

    const startByte = NACIONAL_MES_START_BYTE[mesEje];
    const nextStartByte = i + 1 < meses.length ? NACIONAL_MES_START_BYTE[meses[i + 1]] : NACIONAL_FILE_END_BYTE;
    const sectionBytes = nextStartByte - startByte;

    console.log(`  [red] mes=${mesEje}: descargando ${(sectionBytes / 1024 / 1024).toFixed(0)} MB...`);
    const { rows: fetchedRecords } = await fetchMefCsv(filename, sectionBytes, startByte);

    const records = fetchedRecords.filter(
      (r) =>
        String(r.MES_EJE ?? "").trim() === mesEje &&
        String(r[mapping.metaDepartamentoNombre] ?? "").toUpperCase().trim() === wantedMetaDepartamento
    );

    if (records.length === 0) {
      seccionesSinDatos.push(`GOBIERNO NACIONAL/mes=${mesEje}`);
      continue;
    }

    const client = await pool.connect();
    try {
      const batchId = await saveFilteredBatch(client, resourceId, records);
      batchIds.push(batchId);
    } finally {
      client.release();
    }

    console.log(`  [red] mes=${mesEje}: ${records.length} filas de ${wantedMetaDepartamento} guardadas`);
    allRecords.push(...records);
  }

  if (allRecords.length === 0) {
    throw new Error(
      `No se encontró ninguna fila de Gobierno Nacional dirigida a "${metaDepartamento}" en ninguna de las 8 ` +
        `secciones mensuales. Los offsets de NACIONAL_MES_START_BYTE pueden haber quedado desactualizados — ` +
        `hay que volver a escanear el archivo.`
    );
  }

  const { rows } = normalizeMefRows(allRecords, mapping);
  const fechaCorte = new Date().toISOString().slice(0, 10);
  const lastBatchId = batchIds[batchIds.length - 1];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      // Entidades de Gobierno Nacional (ministerios/programas) nunca fueron
      // sembradas por otro conector — a diferencia de GR/GL, que ya existen
      // en `entities` porque `ingestMefBudgetExecution` corrió antes para
      // ellas. Sin este upsert, el INSERT de abajo viola la FK
      // `budget_execution_entity_code_fkey` (confirmado en vivo 2026-08-21).
      if (row.ubigeo) {
        await upsertTerritoryFromMef(client, row.ubigeo, row.departamentoNombre, row.provinciaNombre, row.distritoNombre);
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
          lastBatchId,
          wantedMetaDepartamento,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return { batchIds, entidadesActualizadas: rows.length, seccionesSinDatos };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const filename = process.env.MEF_DATA_FILENAME;
  if (!filename) {
    console.error("Define MEF_DATA_FILENAME en .env (ej. 2026-Gasto-Mensual.csv) antes de ingerir.");
    process.exit(1);
  }

  if (process.env.MEF_INGESTA_META_DEPARTAMENTO === "true") {
    const metaDepartamento = process.env.MEF_FILTER_DEPARTAMENTO;
    if (!metaDepartamento) {
      console.error("Define MEF_FILTER_DEPARTAMENTO para la ingesta de Gobierno Nacional por meta.");
      process.exit(1);
    }
    ingestMefFullYearForMetaDepartamento(filename, metaDepartamento)
      .then((summary) => {
        console.log("Ingesta de Gobierno Nacional por meta_departamento completada:", summary);
        return pool.end();
      })
      .catch((err) => {
        console.error("Ingesta de Gobierno Nacional por meta_departamento falló:", err);
        process.exit(1);
      });
  } else if (process.env.MEF_INGESTA_ANIO_COMPLETO === "true") {
    const ejecutoraDepartamento = process.env.MEF_FILTER_EJECUTORA_DEPARTAMENTO;
    if (!ejecutoraDepartamento) {
      console.error("Define MEF_FILTER_EJECUTORA_DEPARTAMENTO para la ingesta de año completo.");
      process.exit(1);
    }
    ingestMefFullYearForDepartamento(filename, ejecutoraDepartamento)
      .then((summary) => {
        console.log("Ingesta de año completo (PIA/PIM + devengado) completada:", summary);
        return pool.end();
      })
      .catch((err) => {
        console.error("Ingesta de año completo falló:", err);
        process.exit(1);
      });
  } else {
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
}
