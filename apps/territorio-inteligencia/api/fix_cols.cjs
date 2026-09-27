const { Pool } = require("pg");
const pool = new Pool({ connectionString: "postgres://catastro_minero:catastro_minero@localhost:5462/catastro_minero" });
async function run() {
  try {
    await pool.query(`ALTER TABLE inteligencia_minero ADD COLUMN IF NOT EXISTS provincia TEXT;`);
    await pool.query(`ALTER TABLE inteligencia_minero ADD COLUMN IF NOT EXISTS distrito TEXT;`);
    await pool.query(`ALTER TABLE catastro_forestal_titulos ADD COLUMN IF NOT EXISTS provincia TEXT;`);
    await pool.query(`ALTER TABLE catastro_forestal_titulos ADD COLUMN IF NOT EXISTS distrito TEXT;`);
    await pool.query("UPDATE inteligencia_minero SET provincia = $1, distrito = $2 WHERE departamento = $3", ["MAYNAS", "MAYNAS", "LORETO"]);
    await pool.query("UPDATE catastro_forestal_titulos SET provincia = $1, distrito = $2 WHERE departamento = $3", ["MAYNAS", "MAYNAS", "LORETO"]);
    console.log("Columns added and updated");
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
