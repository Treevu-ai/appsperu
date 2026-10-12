import "dotenv/config";
import { Pool } from "pg";

const srcUrl = process.env.SRC_TERRITORIES_DATABASE_URL;
const dstUrl = process.env.DATABASE_URL;

if (!srcUrl) throw new Error("SRC_TERRITORIES_DATABASE_URL no está definida.");
if (!dstUrl) throw new Error("DATABASE_URL no está definida.");

const src = new Pool({ connectionString: srcUrl });
const dst = new Pool({ connectionString: dstUrl });

interface TerritoryRow {
  ubigeo: string;
  departamento: string;
  provincia: string;
  distrito: string;
  wkt: string;
}

async function transferTerritories(): Promise<void> {
  const { rows } = await src.query<TerritoryRow>(
    `SELECT ubigeo, departamento, provincia, distrito, ST_AsText(geometry) as wkt FROM territories ORDER BY ubigeo`
  );
  console.log(`Leídos ${rows.length} distritos de geo_intersections.territories`);

  const client = await dst.connect();
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      await client.query(
        `INSERT INTO territories (ubigeo, departamento, provincia, distrito, geom)
         VALUES ($1, $2, $3, $4, ST_Multi(ST_GeomFromText($5, 4326)))
         ON CONFLICT (ubigeo) DO UPDATE SET geom = EXCLUDED.geom`,
        [row.ubigeo, row.departamento, row.provincia, row.distrito, row.wkt]
      );
    }
    await client.query("COMMIT");
    console.log(`${rows.length} distritos insertados en perdida_bosque.territories`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  await src.end();
  await dst.end();
}

transferTerritories().catch((err) => {
  console.error(err);
  process.exit(1);
});
