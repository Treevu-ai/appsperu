const { Pool } = require("pg");
const pool = new Pool({ connectionString: "postgres://catastro_minero:catastro_minero@localhost:5462/catastro_minero" });
async function run() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS inteligencia_minero (id SERIAL PRIMARY KEY, titular_ruc TEXT, titular_nombre TEXT, superficie NUMERIC, departamento TEXT, ubicacion_geo TEXT);`);
    await pool.query("INSERT INTO inteligencia_minero (titular_ruc, titular_nombre, superficie, departamento, ubicacion_geo) VALUES ($1, $2, $3, $4, $5)", ["20123456789", "Empresa Minera Riesgo S.A.", 5000, "LORETO", "POINT(-73.25 -3.75)"]);
    console.log("Table created and seeded");
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
