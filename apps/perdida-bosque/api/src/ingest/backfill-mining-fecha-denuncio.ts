import "dotenv/config";
import { Pool } from "pg";

/**
 * Backfill de `fecha_denuncio` (fecha del petitorio minero, INGEMMET) en
 * `perdida_bosque.mining_rights` — se omitió en la transferencia original
 * (`transfer-mining-rights.ts`), pero es necesaria para distinguir si la
 * pérdida de bosque ocurrió antes o después de iniciado el trámite/título
 * de la concesión (causalidad, no solo solapamiento espacial).
 */

const srcUrl = process.env.SRC_TERRITORIES_DATABASE_URL; // apunta a geo_intersections
const dstUrl = process.env.DATABASE_URL;

if (!srcUrl) throw new Error("SRC_TERRITORIES_DATABASE_URL no está definida.");
if (!dstUrl) throw new Error("DATABASE_URL no está definida.");

const src = new Pool({ connectionString: srcUrl });
const dst = new Pool({ connectionString: dstUrl });
src.on("error", (err) => console.error("Error inesperado en conexión idle (src):", err.message));
dst.on("error", (err) => console.error("Error inesperado en conexión idle (dst):", err.message));

async function backfill(): Promise<void> {
  const { rows } = await src.query<{ codigou: string; fecha_denuncio: string | null }>(
    `SELECT codigou, fecha_denuncio FROM mining_rights WHERE fecha_denuncio IS NOT NULL`
  );
  console.log(`Leídas ${rows.length} fechas de denuncio de geo_intersections.mining_rights`);

  const client = await dst.connect();
  try {
    await client.query("BEGIN");
    const BATCH_SIZE = 2000;
    let updated = 0;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const codigous = batch.map((r) => r.codigou);
      const fechas = batch.map((r) => r.fecha_denuncio);
      await client.query(
        `UPDATE mining_rights m
         SET fecha_denuncio = v.fecha_denuncio::date
         FROM (SELECT unnest($1::text[]) AS codigou, unnest($2::text[]) AS fecha_denuncio) v
         WHERE m.codigou = v.codigou`,
        [codigous, fechas]
      );
      updated += batch.length;
      console.log(`  ${updated.toLocaleString()} / ${rows.length.toLocaleString()} actualizadas...`);
    }
    await client.query("COMMIT");
    console.log(`${updated} fechas de denuncio backfilleadas en perdida_bosque.mining_rights`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  await src.end();
  await dst.end();
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
