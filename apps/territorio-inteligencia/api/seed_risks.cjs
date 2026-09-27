const { Pool } = require("pg");
const pool = new Pool({ connectionString: "postgres://catastro_minero:catastro_minero@localhost:5462/catastro_minero" });
async function run() {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS inhabilitaciones (id SERIAL PRIMARY KEY, ruc TEXT, resolucion TEXT, desde DATE, hasta DATE, estado TEXT, "descripción" TEXT);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS inhabilitaciones_judiciales (id SERIAL PRIMARY KEY, ruc TEXT, resolucion TEXT, desde DATE, hasta DATE, estado TEXT, "descripción" TEXT);`);
    await pool.query(`CREATE TABLE IF NOT EXISTS multas (id SERIAL PRIMARY KEY, ruc TEXT, resolucion TEXT, desde DATE, hasta DATE, estado TEXT, "descripción" TEXT);`);

    // Seed risks for the identified RUCs
    await pool.query("INSERT INTO inhabilitaciones (ruc, resolucion, desde, hasta, estado, \"descripción\") VALUES ($1, $2, $3, $4, $5, $6)", ["20123456789", "RES-001-2024", "2024-01-01", "2026-01-01", "VIGENTE", "Inhabilitacion administrativa por incumplimiento de plan de cierre"]);
    await pool.query("INSERT INTO inhabilitaciones_judiciales (ruc, resolucion, desde, hasta, estado, \"descripción\") VALUES ($1, $2, $3, $4, $5, $6)", ["20999999999", "SENT-99-2023", "2023-06-01", "2028-06-01", "VIGENTE", "Sancion judicial por daño ambiental grave"]);
    await pool.query("INSERT INTO multas (ruc, resolucion, desde, hasta, estado, \"descripción\") VALUES ($1, $2, $3, $4, $5, $6)", ["20888888888", "MULT-444-2024", "2024-03-01", null, "PENDIENTE", "Multa por falta de reporte de producción trimestral"]);

    console.log("Risk tables created and seeded");
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
