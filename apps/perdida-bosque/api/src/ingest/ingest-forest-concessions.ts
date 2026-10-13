import "dotenv/config";
import { Pool } from "pg";

/**
 * Trae `osinfor_per_forest_concessions` (OSINFOR/SERFOR, v2025) directo
 * desde la GFW Data API y la carga en `perdida_bosque.forest_concessions`
 * para poder cruzarla por SQL contra `perdida_bosque_poligono` — mismo
 * propósito que `transfer-mining-rights.ts`, pero la fuente acá es GFW,
 * no otra base Neon. El dataset vectorial de GFW acepta LIMIT/OFFSET en
 * su endpoint de query SQL (confirmado en vivo), así que se pagina en
 * lotes de 200 para no pedir ~2,300 geometrías completas en una sola
 * respuesta (algunos polígonos tienen miles de vértices).
 *
 * `start_date`/`end_date` vienen NULL para TODAS las concesiones
 * MADERABLE (confirmado en vivo: count(*) con start_date IS NOT NULL = 0)
 * — no hay dato temporal para validar causalidad como se hizo con
 * minería (fecha_denuncio). El cruce con `perdida_bosque_poligono` queda
 * como solapamiento espacial únicamente, sin inferir causalidad.
 */

const GFW_BASE_URL = "https://data-api.globalforestwatch.org";
const DATASET = "osinfor_per_forest_concessions";
const VERSION = "v2025";
const PAGE_SIZE = 200;

const dstUrl = process.env.DATABASE_URL;
if (!dstUrl) throw new Error("DATABASE_URL no está definida.");
const dst = new Pool({ connectionString: dstUrl });
dst.on("error", (err) => console.error("Error inesperado en conexión idle (dst):", err.message));

function apiKey(): string {
  const key = process.env.GFW_API_KEY;
  if (!key) throw new Error("GFW_API_KEY no está definida.");
  return key;
}

function headers(): Record<string, string> {
  return {
    "x-api-key": apiKey(),
    Origin: "http://localhost",
  };
}

interface ConcesionRow {
  gfw_fid: number;
  iso3: string | null;
  conc_type: string | null;
  conc_name: string | null;
  conc_stat: string | null;
  cont_type: string | null;
  cont_id: string | null;
  company: string | null;
  start_date: string | null;
  end_date: string | null;
  source: string | null;
  source_yr: string | null;
  notes: string | null;
  wkt: string | null;
}

async function fetchPage(offset: number): Promise<ConcesionRow[]> {
  const sql =
    "SELECT gfw_fid, iso3, conc_type, conc_name, conc_stat, cont_type, cont_id, company, " +
    "start_date, end_date, source, source_yr, notes, ST_AsText(geom) AS wkt FROM data " +
    `LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
  const url = new URL(`${GFW_BASE_URL}/dataset/${DATASET}/${VERSION}/query/json`);
  url.searchParams.set("sql", sql);

  const res = await fetch(url, { headers: headers() });
  if (!res.ok) throw new Error(`GFW query falló (${res.status}): ${await res.text()}`);
  const body = (await res.json()) as { data: ConcesionRow[]; status: string };
  return body.data;
}

const INSERT_COLUMNS = [
  "gfw_fid", "iso3", "conc_type", "conc_name", "conc_stat", "cont_type",
  "cont_id", "company", "start_date", "end_date", "source", "source_yr", "notes", "geom",
] as const;

async function insertBatch(client: import("pg").PoolClient, rows: readonly ConcesionRow[]): Promise<void> {
  const withGeom = rows.filter((r) => r.wkt);
  if (withGeom.length === 0) return;

  const values: string[] = [];
  const params: unknown[] = [];
  let p = 1;
  for (const row of withGeom) {
    values.push(
      `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, ST_GeomFromText($${p++}, 4326))`
    );
    params.push(
      row.gfw_fid,
      row.iso3,
      row.conc_type,
      row.conc_name,
      row.conc_stat,
      row.cont_type,
      row.cont_id,
      row.company,
      row.start_date,
      row.end_date,
      row.source,
      row.source_yr,
      row.notes,
      row.wkt
    );
  }

  await client.query(
    `INSERT INTO forest_concessions (${INSERT_COLUMNS.join(",")})
     VALUES ${values.join(",")}
     ON CONFLICT (gfw_fid) DO UPDATE SET geom = EXCLUDED.geom, conc_stat = EXCLUDED.conc_stat`,
    params
  );
}

async function ingestForestConcessions(): Promise<void> {
  const client = await dst.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS forest_concessions (
        gfw_fid INTEGER PRIMARY KEY,
        iso3 TEXT,
        conc_type TEXT,
        conc_name TEXT,
        conc_stat TEXT,
        cont_type TEXT,
        cont_id TEXT,
        company TEXT,
        start_date DATE,
        end_date DATE,
        source TEXT,
        source_yr TEXT,
        notes TEXT,
        geom GEOMETRY(Geometry, 4326) NOT NULL
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_forest_concessions_geom ON forest_concessions USING GIST (geom)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_forest_concessions_conc_type ON forest_concessions (conc_type)`);

    let offset = 0;
    let totalInserted = 0;
    while (true) {
      const page = await fetchPage(offset);
      if (page.length === 0) break;
      await insertBatch(client, page);
      totalInserted += page.length;
      console.log(`  ${totalInserted.toLocaleString()} concesiones forestales procesadas...`);
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    await client.query("COMMIT");
    console.log(`${totalInserted} concesiones forestales (OSINFOR) insertadas en perdida_bosque.forest_concessions`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  await dst.end();
}

ingestForestConcessions().catch((err) => {
  console.error(err);
  process.exit(1);
});
