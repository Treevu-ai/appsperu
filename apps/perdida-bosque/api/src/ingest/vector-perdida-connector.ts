import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import proj4 from "proj4";
import * as shapefile from "shapefile";
import { pool } from "../db/pool.js";

/**
 * Carga el shapefile nacional "Bosque_No_Bosque_2025" (Geobosques/MINAM) a
 * PostGIS. Fuente descargada manualmente (formulario de contacto de
 * geobosques.minam.gob.pe, no automatizable) — ver migración 002 para el
 * contexto completo. Reproyecta de EPSG:32718 (UTM Zona 18S) a EPSG:4326
 * (WGS84) vértice por vértice, porque el shapefile no trae eso resuelto.
 */

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../data-local");
const SHP_PATH = path.join(DATA_DIR, "Bosque_No_Bosque_2025.shp");
const DBF_PATH = path.join(DATA_DIR, "Bosque_No_Bosque_2025.dbf");
const DATASET = "perdida_bosque_poligono";
const EXPECTED_RECORD_COUNT = 5_655_291;
// Los polígonos son en su mayoría un solo pixel Landsat (30x30m, 4-5
// vértices) — confirmado al inspeccionar las primeras filas — así que un
// lote de 3000 sigue siendo un payload chico; prioriza menos round-trips
// de red hacia Neon sobre el tamaño de transacción.
const BATCH_SIZE = 3000;

// EPSG:32718 = WGS 84 / UTM zone 18S (confirmado en el .prj del shapefile).
proj4.defs("EPSG:32718", "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs");
const toWgs84 = proj4("EPSG:32718", "WGS84");

type Ring = number[][];
type PolygonCoords = Ring[];
type MultiPolygonCoords = PolygonCoords[];

interface ParsedRow {
  gridcode: number | null;
  cobertura: string;
  area_ha: number | null;
  shape_area_m2: number | null;
  geojson: string;
}

function reprojectRing(ring: Ring): Ring {
  return ring.map(([x, y]) => {
    const [lon, lat] = toWgs84.forward([x, y]);
    return [lon, lat];
  });
}

/** Normaliza Polygon o MultiPolygon reproyectado a MultiPolygon GeoJSON (string). */
function toMultiPolygonGeoJson(geometry: GeoJSON.Geometry): string | null {
  if (geometry.type === "Polygon") {
    const coords = (geometry.coordinates as PolygonCoords).map(reprojectRing);
    if (coords.length === 0 || coords[0].length < 4) return null;
    return JSON.stringify({ type: "MultiPolygon", coordinates: [coords] });
  }
  if (geometry.type === "MultiPolygon") {
    const coords = (geometry.coordinates as MultiPolygonCoords).map((poly) => poly.map(reprojectRing));
    const valid = coords.filter((poly) => poly.length > 0 && poly[0].length >= 4);
    if (valid.length === 0) return null;
    return JSON.stringify({ type: "MultiPolygon", coordinates: valid });
  }
  return null;
}

function checksumOfFile(filePath: string): string {
  // Archivo de 1.85GB: no lo leemos entero a memoria para el checksum, solo
  // tamaño+mtime como huella — suficiente para trazabilidad del batch, el
  // checksum criptográfico real no aporta nada que el conteo de filas no
  // verifique ya.
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
  procesadas: number;
  insertadas: number;
  saltadas: number;
  coberturas: Record<string, number>;
}> {
  if (!existsSync(SHP_PATH) || !existsSync(DBF_PATH)) {
    throw new Error(
      `No se encuentra el shapefile en ${DATA_DIR}. Extrae Bosque_No_Bosque_2025.{shp,dbf,shx} ahí primero.`
    );
  }

  const batchId = await registerBatch(SHP_PATH);
  console.log(`Batch registrado: id=${batchId}`);

  // El .dbf trae texto en UTF-8 real (confirmado leyendo bytes crudos), pero
  // shapefile.js decodifica mal sin esta opción explícita — sin ella,
  // "Pérdida" sale como "PÃ©rdida".
  const source = await shapefile.open(SHP_PATH, DBF_PATH, { encoding: "utf-8" });

  // Reanudación tras un corte (ver sesión 2026-10-11: el proceso en
  // background fue matado a los 44min, con 2,664,000 filas ya confirmadas en
  // Neon de forma transaccional). La lectura del .shp es secuencial y
  // determinista, así que saltar los primeros N registros retoma
  // exactamente donde quedó, sin duplicar ni perder filas.
  const skip = Number(process.env.SKIP_FEATURES ?? 0);
  if (skip > 0) {
    console.log(`Saltando los primeros ${skip.toLocaleString()} registros ya cargados...`);
    for (let i = 0; i < skip; i++) {
      const r = await source.read();
      if (r.done) throw new Error(`SKIP_FEATURES=${skip} pero el shapefile solo tiene ${i} registros`);
    }
  }

  let procesadas = skip;
  let insertadas = 0;
  let saltadas = 0;
  let batch: ParsedRow[] = [];
  const coberturas: Record<string, number> = {};
  const startedAt = Date.now();

  while (true) {
    const result = await source.read();
    if (result.done) break;

    procesadas++;
    const feature = result.value;
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    const cobertura = String(props.Cobertura ?? props.cobertura ?? "");
    coberturas[cobertura] = (coberturas[cobertura] ?? 0) + 1;

    const geojson = feature.geometry ? toMultiPolygonGeoJson(feature.geometry) : null;
    if (!geojson) {
      saltadas++;
      continue;
    }

    batch.push({
      gridcode: typeof props.gridcode === "number" ? props.gridcode : null,
      cobertura,
      area_ha: typeof props.Area === "number" ? props.Area : null,
      shape_area_m2: typeof props.Shape_Area === "number" ? props.Shape_Area : null,
      geojson,
    });

    if (batch.length >= BATCH_SIZE) {
      await flushBatch(batch, batchId);
      insertadas += batch.length;
      batch = [];

      if (insertadas % 50_000 < BATCH_SIZE) {
        const elapsedS = (Date.now() - startedAt) / 1000;
        const pct = ((procesadas / EXPECTED_RECORD_COUNT) * 100).toFixed(1);
        console.log(
          `${procesadas.toLocaleString()} / ${EXPECTED_RECORD_COUNT.toLocaleString()} procesadas (${pct}%), ` +
            `${insertadas.toLocaleString()} insertadas, ${saltadas} saltadas, ${elapsedS.toFixed(0)}s transcurridos`
        );
      }
    }
  }

  if (batch.length > 0) {
    await flushBatch(batch, batchId);
    insertadas += batch.length;
  }

  console.log("Reindexando (VACUUM ANALYZE)...");
  await pool.query("VACUUM ANALYZE perdida_bosque_poligono");

  return { procesadas, insertadas, saltadas, coberturas };
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
