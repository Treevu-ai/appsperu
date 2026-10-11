import { pool } from "./src/db/pool.js";
import { normalizeMidagri, LAYER_NAMES } from "./src/ingest/normalize-midagri.js";

const BASE_URL = "https://georural.midagri.gob.pe/geoservicios/rest/services/public/Catastro_Rural/MapServer";

async function testIngest() {
  console.log("Testing DB connection...");
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    console.log("DB OK");
  } catch (e) {
    console.error("DB Error:", e.message);
    return;
  }

  console.log("Fetching layer 0...");
  const res = await fetch(`${BASE_URL}/0/query?where=1=1&outFields=*&returnGeometry=true&outSR=4326&resultOffset=0&resultRecordCount=1000&f=json`);
  console.log("Fetch status:", res.status);
  const payload = await res.json();
  console.log("Features:", payload.features?.length, "exceeded:", payload.exceededTransferLimit);

  const { rows, rejected } = normalizeMidagri(payload.features ?? [], 0);
  console.log("Normalized:", rows.length, "rejected:", rejected.length);

  const capa = rows[0]?.capa ?? LAYER_NAMES[0];
  console.log("Capa name:", capa);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('catastro_rural_ingest'), hashtext($1))", [capa]);
    console.log("Lock acquired");

    const batchResult = await client.query(
      `INSERT INTO raw_midagri_batches (source_url, capa, record_count) VALUES ($1, $2, $3) RETURNING id`,
      [`${BASE_URL}/0/query`, capa, payload.features.length]
    );
    const batchId = batchResult.rows[0].id;
    console.log("Batch ID:", batchId);

    await client.query("DELETE FROM catastro_rural WHERE capa = $1", [capa]);
    console.log("Deleted old rows");

    // Insert first 5 rows
    const testRows = rows.slice(0, 5);
    const INSERT_COLUMNS = [
      "capa", "objectid", "area_ha", "perimetro", "id_dist", "cod_proy",
      "nom_dpto", "nom_prov", "nom_dist", "nombre", "estado", "fuente",
      "tipo_proceso", "nro_titulo", "anio_titulo", "geometry",
      "area_km2", "geometry_valid", "atributos_extra", "source_batch_id",
    ];
    
    const values = [];
    const tuples = [];
    testRows.forEach((row, i) => {
      const base = i * INSERT_COLUMNS.length;
      tuples.push(`(${INSERT_COLUMNS.map((_, j) => `$${base + j + 1}`).join(",")})`);
      values.push(row.capa, row.objectid, row.area_ha, row.perimetro, row.id_dist, row.cod_proy,
        row.nom_dpto, row.nom_prov, row.nom_dist, row.nombre, row.estado, row.fuente,
        row.tipo_proceso, row.nro_titulo, row.anio_titulo, null, null, null, null, batchId);
    });

    await client.query(`INSERT INTO catastro_rural (${INSERT_COLUMNS.join(",")}) VALUES ${tuples.join(",")}`, values);
    console.log("Inserted", testRows.length, "rows");

    await client.query("COMMIT");
    console.log("Committed");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error("Error:", e.message, e.stack);
  } finally {
    client.release();
  }
  
  await pool.end();
}

testIngest().catch(e => { console.error("Fatal:", e.message, e.stack); process.exit(1); });