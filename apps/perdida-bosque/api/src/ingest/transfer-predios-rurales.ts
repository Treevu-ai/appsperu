import "dotenv/config";
import { Pool } from "pg";

/**
 * Copia la capa `predio_rural` de `catastro_rural` (MIDAGRI/UEGPS, ~3.06M
 * predios) a `perdida_bosque` para poder cruzarla por SQL contra
 * `perdida_bosque_poligono` -- Neon no soporta cross-database query nativo,
 * mismo patrón que `transfer-mining-rights.ts` y
 * `ingest-forest-concessions.ts`.
 *
 * IMPORTANTE: correr solo cuando la ingesta de la capa 0 de catastro-rural
 * (predio_rural) haya terminado -- si se corre con la ingesta a medias,
 * transfiere un snapshot parcial y hay que repetir el proceso completo.
 */

const srcUrl = process.env.SRC_CATASTRO_RURAL_DATABASE_URL;
const dstUrl = process.env.DATABASE_URL;

if (!srcUrl) throw new Error("SRC_CATASTRO_RURAL_DATABASE_URL no está definida (apunta a catastro_rural).");
if (!dstUrl) throw new Error("DATABASE_URL no está definida.");

const src = new Pool({ connectionString: srcUrl });
const dst = new Pool({ connectionString: dstUrl });

// Sin estos listeners, un error en una conexión idle (ej. reset de red de
// Neon) tumba el proceso Node completo en vez de solo descartar esa
// conexión -- confirmado en vivo durante la ingesta de catastro-rural.
src.on("error", (err) => console.error("Error inesperado en conexión idle (src):", err.message));
dst.on("error", (err) => console.error("Error inesperado en conexión idle (dst):", err.message));

interface PredioRuralRow {
  objectid: number | null;
  area_ha: number | null;
  nom_dpto: string | null;
  nom_prov: string | null;
  nom_dist: string | null;
  nombre: string | null;
  estado: string | null;
  wkt: string;
}

async function transferPredios(): Promise<void> {
  const { rows: totalRows } = await src.query<{ count: string }>(
    `SELECT count(*) FROM catastro_rural WHERE capa = 'predio_rural'`
  );
  console.log(`Total predio_rural en origen: ${totalRows[0].count}`);

  const client = await dst.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS predios_rurales (
        objectid INTEGER PRIMARY KEY,
        area_ha DOUBLE PRECISION,
        nom_dpto TEXT,
        nom_prov TEXT,
        nom_dist TEXT,
        nombre TEXT,
        estado TEXT,
        geom GEOMETRY(Geometry, 4326) NOT NULL
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_predios_rurales_geom ON predios_rurales USING GIST (geom)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_predios_rurales_dpto ON predios_rurales (nom_dpto)`);
  } finally {
    client.release();
  }

  const PAGE_SIZE = 50_000;
  const BATCH_SIZE = 2000;
  let offset = 0;
  let totalTransferidas = 0;

  while (true) {
    const { rows } = await src.query<PredioRuralRow>(
      `SELECT objectid, area_ha, nom_dpto, nom_prov, nom_dist, nombre, estado, ST_AsText(geometry) as wkt
       FROM catastro_rural
       WHERE capa = 'predio_rural' AND geometry IS NOT NULL AND objectid IS NOT NULL
       ORDER BY objectid
       LIMIT $1 OFFSET $2`,
      [PAGE_SIZE, offset]
    );
    if (rows.length === 0) break;

    const client = await dst.connect();
    try {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const values: string[] = [];
        const params: unknown[] = [];
        let p = 1;
        for (const row of batch) {
          values.push(`($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, ST_GeomFromText($${p++}, 4326))`);
          params.push(row.objectid, row.area_ha, row.nom_dpto, row.nom_prov, row.nom_dist, row.nombre, row.estado, row.wkt);
        }
        await client.query(
          `INSERT INTO predios_rurales (objectid, area_ha, nom_dpto, nom_prov, nom_dist, nombre, estado, geom)
           VALUES ${values.join(",")}
           ON CONFLICT (objectid) DO UPDATE SET geom = EXCLUDED.geom`,
          params
        );
      }
    } finally {
      client.release();
    }

    totalTransferidas += rows.length;
    offset += PAGE_SIZE;
    console.log(`  ${totalTransferidas.toLocaleString()} / ${totalRows[0].count} transferidas...`);
  }

  console.log(`${totalTransferidas} predios rurales transferidos a perdida_bosque.predios_rurales`);
  await src.end();
  await dst.end();
}

transferPredios().catch((err) => {
  console.error(err);
  process.exit(1);
});
