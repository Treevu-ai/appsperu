const { Pool } = require("pg");
const pool = new Pool({ connectionString: "postgres://catastro_minero:catastro_minero@localhost:5462/catastro_minero" });
async function run() {
  await pool.query(`CREATE TABLE IF NOT EXISTS catastro_forestal_titulos (id SERIAL PRIMARY KEY, titular_ruc TEXT, titular_nombre TEXT, superficie NUMERIC, departamento TEXT, ubicacion_geo TEXT);`);
  console.log("Table created");
  process.exit();
}
run();
