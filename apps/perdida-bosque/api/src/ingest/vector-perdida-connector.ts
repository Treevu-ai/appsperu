import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import proj4 from "proj4";
import { pool } from "../db/pool.js";
import { ShpReader, type ShpRecord } from "./shp-reader.js";

/**
 * Carga el shapefile nacional "Bosque_No_Bosque_2025" (Geobosques/MINAM) a
 * PostGIS. Fuente descargada manualmente (formulario de contacto de
 * geobosques.minam.gob.pe, no automatizable) — ver migración 002 para el
 * contexto completo. Reproyecta de EPSG:32718 (UTM Zona 18S) a EPSG:4326
 * (WGS84) vértice por vértice, porque el shapefile no trae eso resuelto.
 *
 * Usa `ShpReader` (lector propio de acceso aleatorio O(1), ver ese archivo)
 * en vez de la librería `shapefile` — con esa librería, "saltar" a la fila
 * 2.66M para reanudar tardaba 52+ minutos de CPU (decodificaba cada fila
 * saltada igual que si la fuera a insertar). Con acceso directo por offset
 * de bytes, saltar a cualquier fila es ~0ms.
 */

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data-local");
const SHP_PATH = path.join(DATA_DIR, "Bosque_No_Bosque_2025.shp");
const SHX_PATH = path.join(DATA_DIR, "Bosque_No_Bosque_2025.shx");
const DBF_PATH = path.join(DATA_DIR, "Bosque_No_Bosque_2025.dbf");
const EXPECTED_RECORD_COUNT = 5_655_291;
const BATCH_SIZE = 3000;

proj4.defs("EPSG:32718", "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs");
const toWgs84 = proj4("EPSG:32718", "WGS84");

type Ring = number[][];

function reprojectRing(ring: Ring): Ring {
  return ring.map(([x, y]) => {
    const [lon, lat] = toWgs84.forward([x, y]);
    return [lon, lat];
  });
}

function toMultiPolygonGeoJson(geometry: ShpRecord["geometry"]): string | null {
  if (!geometry) return null;
  if (geometry.type === "Polygon") {
    const coords = geometry.coordinates.map(reprojectRing);
    if (coords.length === 0 || coords[0].length < 4) return null;
    return JSON.stringify({ type: "MultiPolygon", coordinates: [coords] });
  }
  const coords = geometry.coordinates.map((poly) => poly.map(reprojectRing));
  const valid = coords.filter((poly) => poly.length > 0 && poly[0].length >= 4);
  if (valid.length === 0) return null;
  return JSON.stringify({ type: "MultiPolygon", coordinates: valid });
}

interface ParsedRow {
  gridcode: number | null;
  cobertura: string;
  area_ha: number | null;
  shape_area_m2: number | null;
  geojson: string;
}

function checksumOfFile(filePath: string): string {
  const stat = statSync(filePath);
  return createHash("sha256").update(`${filePath}:${stat.size}:${stat.mtimeMs}`).digest("hex");
}

async function registerBatch(sourcePath: string): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO raw_geobosques_batches (nivel, ubigeo, source_url, checksum, record_count)
     VALUES ('vector', 'PE', $1, $2, $3) RETURNING id`,
    [sourcePath, checksumOfFile(sourcePath), EXPECTED_RECORD_COUNT]
  );
  return rows[0].id;
}

async function flushBatch(batch: ParsedRow[], batchId: number): Promise<void> {
  if (batch.length === 0) return;

  const values: string[] = [];
  const params: unknown[] = [];
  let p = 1;
  for (const row of batch) {
    values.push(
      `($${p++}, $${p++}, $${p++}, $${p++}, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($${p++}), 4326)), $${p++})`
    );
    params.push(row.gridcode, row.cobertura, row.area_ha, row.shape_area_m2, row.geojson, batchId);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO perdida_bosque_poligono
         (gridcode, cobertura, area_ha, shape_area_m2, geom, source_batch_id)
       VALUES ${values.join(",")}`,
      params
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function ingestVectorPerdida(): Promise<{
  inicioEn: number;
  procesadas: number;
  insertadas: number;
  saltadas: number;
  terminoArchivoCompleto: boolean;
  coberturas: Record<string, number>;
}> {
  if (!existsSync(SHP_PATH) || !existsSync(SHX_PATH) || !existsSync(DBF_PATH)) {
    throw new Error(
      `No se encuentra el shapefile en ${DATA_DIR}. Extrae Bosque_No_Bosque_2025.{shp,shx,dbf} ahí primero.`
    );
  }

  // Punto de partida: SIEMPRE se calcula contra la base, nunca se recibe a
  // mano — evita el error de pasar un SKIP_FEATURES desactualizado.
  const { rows: countRows } = await pool.query<{ count: string }>(
    `SELECT count(*) FROM perdida_bosque_poligono`
  );
  const inicioEn = Number(countRows[0].count);

  const maxThisRun = process.env.MAX_FEATURES_THIS_RUN
    ? Number(process.env.MAX_FEATURES_THIS_RUN)
    : Infinity;
  const finEn = Math.min(inicioEn + maxThisRun, EXPECTED_RECORD_COUNT);

  console.log(
    `Arrancando en la fila ${inicioEn.toLocaleString()} (ya en la base), ` +
      `hasta ${finEn.toLocaleString()} en este tramo.`
  );

  const batchId = await registerBatch(SHP_PATH);
  console.log(`Batch registrado: id=${batchId}`);

  const reader = new ShpReader(SHP_PATH, SHX_PATH, DBF_PATH);
  if (reader.numRecords !== EXPECTED_RECORD_COUNT) {
    throw new Error(
      `El .dbf tiene ${reader.numRecords} registros, se esperaban ${EXPECTED_RECORD_COUNT}`
    );
  }

  let procesadas = 0;
  let insertadas = 0;
  let saltadas = 0;
  let batch: ParsedRow[] = [];
  const coberturas: Record<string, number> = {};
  const startedAt = Date.now();

  for (let n = inicioEn; n < finEn; n++) {
    const record = reader.read(n);
    procesadas++;

    const cobertura = record.cobertura;
    coberturas[cobertura] = (coberturas[cobertura] ?? 0) + 1;

    const geojson = toMultiPolygonGeoJson(record.geometry);
    if (!geojson) {
      saltadas++;
      continue;
    }

    batch.push({
      gridcode: record.gridcode,
      cobertura,
      area_ha: record.areaHa,
      shape_area_m2: record.shapeArea,
      geojson,
    });

    if (batch.length >= BATCH_SIZE) {
      await flushBatch(batch, batchId);
      insertadas += batch.length;
      batch = [];

      if (insertadas % 100_000 < BATCH_SIZE) {
        const elapsedS = (Date.now() - startedAt) / 1000;
        const totalProcesadas = inicioEn + procesadas;
        const pct = ((totalProcesadas / EXPECTED_RECORD_COUNT) * 100).toFixed(1);
        console.log(
          `${totalProcesadas.toLocaleString()} / ${EXPECTED_RECORD_COUNT.toLocaleString()} procesadas (${pct}%), ` +
            `${insertadas.toLocaleString()} insertadas en este tramo, ${saltadas} saltadas, ${elapsedS.toFixed(0)}s transcurridos`
        );
      }
    }
  }

  if (batch.length > 0) {
    await flushBatch(batch, batchId);
    insertadas += batch.length;
  }

  reader.close();

  const terminoArchivoCompleto = finEn >= EXPECTED_RECORD_COUNT;
  if (terminoArchivoCompleto) {
    console.log("Reindexando (VACUUM ANALYZE)...");
    await pool.query("VACUUM ANALYZE perdida_bosque_poligono");
  }

  return { inicioEn, procesadas, insertadas, saltadas, terminoArchivoCompleto, coberturas };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  ingestVectorPerdida()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
