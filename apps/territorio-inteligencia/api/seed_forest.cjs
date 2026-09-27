const { Pool } = require("pg");
const pool = new Pool({ connectionString: "postgres://catastro_minero:catastro_minero@localhost:5462/catastro_minero" });
async function run() {
  try {
    await pool.query("INSERT INTO catastro_forestal_titulos (titular_ruc, titular_nombre, superficie, departamento, ubicacion_geo) VALUES ($1, $2, $3, $4, $5)", ["20123456789", "Empresa Forestal Loreto S.A.", 50000, "LORETO", "POINT(-73.25 -3.75)"]);
    console.log("Forest titles seeded");
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
