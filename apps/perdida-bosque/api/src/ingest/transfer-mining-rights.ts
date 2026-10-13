import "dotenv/config";
import { Pool } from "pg";

/**
 * Copia `geo_intersections.mining_rights` (concesiones mineras INGEMMET,
 * con geometría real) a `perdida_bosque` para poder cruzarla por SQL contra
 * `perdida_bosque_poligono` — Neon no soporta cross-database query nativo,
 * mismo patrón que `transfer-territories.ts`.
 */

const srcUrl = process.env.SRC_TERRITORIES_DATABASE_URL; // misma conexión a geo_intersections, ya en .env
const dstUrl = process.env.DATABASE_URL;

if (!srcUrl) throw new Error("SRC_TERRITORIES_DATABASE_URL no está definida (apunta a geo_intersections).");
if (!dstUrl) throw new Error("DATABASE_URL no está definida.");

const src = new Pool({ connectionString: srcUrl });
const dst = new Pool({ connectionString: dstUrl });
src.on("error", (err) => console.error("Error inesperado en conexión idle (src):", err.message));
dst.on("error", (err) => console.error("Error inesperado en conexión idle (dst):", err.message));

interface MiningRightRow {
  codigou: string;
  titular: string | null;
  hectareas: number | null;
  estado: string | null;
  estado_descripcion: string | null;
  sustancia: string | null;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  fecha_denuncio: string | null;
  wkt: string;
}

async function transferMiningRights(): Promise<void> {
  const { rows } = await src.query<MiningRightRow>(
    `SELECT codigou, titular, hectareas, estado, estado_descripcion, sustancia,
            departamento, provincia, distrito, fecha_denuncio::text, ST_AsText(geometry) as wkt
     FROM mining_rights WHERE geometry IS NOT NULL ORDER BY id`
  );
  console.log(`Leídas ${rows.length} concesiones mineras de geo_intersections.mining_rights`);

  const client = await dst.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS mining_rights (
        codigou TEXT PRIMARY KEY,
        titular TEXT,
        hectareas NUMERIC,
        estado TEXT,
        estado_descripcion TEXT,
        sustancia TEXT,
        departamento TEXT,
        provincia TEXT,
        distrito TEXT,
        fecha_denuncio DATE,
        geom GEOMETRY(Geometry, 4326) NOT NULL
      )
    `);
    await client.query(`ALTER TABLE mining_rights ADD COLUMN IF NOT EXISTS fecha_denuncio DATE`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_mining_rights_geom ON mining_rights USING GIST (geom)`);

    // Un INSERT por fila (round-trip por fila) tarda horas con 67K filas a
    // la latencia real de Neon — confirmado en vivo (territories, 1874 filas
    // una por una, tardó ~6-7min; a ese ritmo 67K habría tardado 3+ horas).
    // Multi-row VALUES por lote es el mismo patrón que ya usa la ingesta del
    // shapefile nacional.
    const BATCH_SIZE = 2000;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values: string[] = [];
      const params: unknown[] = [];
      let p = 1;
      for (const row of batch) {
        values.push(
          `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, ST_GeomFromText($${p++}, 4326))`
        );
        params.push(
          row.codigou,
          row.titular,
          row.hectareas,
          row.estado,
          row.estado_descripcion,
          row.sustancia,
          row.departamento,
          row.provincia,
          row.distrito,
          row.fecha_denuncio,
          row.wkt
        );
      }
      await client.query(
        `INSERT INTO mining_rights (codigou, titular, hectareas, estado, estado_descripcion, sustancia, departamento, provincia, distrito, fecha_denuncio, geom)
         VALUES ${values.join(",")}
         ON CONFLICT (codigou) DO UPDATE SET geom = EXCLUDED.geom, fecha_denuncio = EXCLUDED.fecha_denuncio`,
        params
      );
      inserted += batch.length;
      console.log(`  ${inserted.toLocaleString()} / ${rows.length.toLocaleString()} insertadas...`);
    }
    await client.query("COMMIT");
    console.log(`${inserted} concesiones mineras insertadas en perdida_bosque.mining_rights`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  await src.end();
  await dst.end();
}

transferMiningRights().catch((err) => {
  console.error(err);
  process.exit(1);
});
