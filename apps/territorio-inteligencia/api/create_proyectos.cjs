const { Pool } = require("pg");
const pool = new Pool({ connectionString: "postgres://catastro_minero:catastro_minero@localhost:5462/catastro_minero" });
async function run() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS proyectos (id SERIAL PRIMARY KEY, nombre TEXT, codigo TEXT, monto NUMERIC, departamento TEXT, provincia TEXT, distrito TEXT);`);
    await pool.query("INSERT INTO proyectos (nombre, codigo, monto, departamento, provincia, distrito) VALUES ($1, $2, $3, $4, $5, $6)", ["Proyecto Infraestructura Loreto", "CUI-123", 1000000, "LORETO", "MAYNAS", "MAYNAS"]);
    console.log("Projects table created and seeded");
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
