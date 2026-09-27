const { Pool } = require("pg");
const pool = new Pool({ connectionString: "postgres://catastro_minero:catastro_minero@localhost:5462/catastro_minero" });
async function run() {
  const { rows } = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = "catastro_minero_derechos"");
  console.log(rows.map(r => r.column_name));
  process.exit();
}
run();
