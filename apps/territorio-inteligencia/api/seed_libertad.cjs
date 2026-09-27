const { Pool } = require("pg");
const pool = new Pool({ connectionString: "postgres://catastro_minero:catastro_minero@localhost:5462/catastro_minero" });
async function run() {
  try {
    // Operator for La Libertad
    await pool.query("INSERT INTO inteligencia_minero (titular_ruc, titular_nombre, superficie, departamento, provincia, distrito) VALUES ($1, $2, $3, $4, $5, $6)", ["20999999999", "Corporación Minera Norte S.A.", 8000, "LA LIBERTAD", "OTUZCO", "OTUZCO"]);
    await pool.query("INSERT INTO catastro_forestal_titulos (titular_ruc, titular_nombre, superficie, departamento, provincia, distrito) VALUES ($1, $2, $3, $4, $5, $6)", ["20999999999", "Corporación Minera Norte S.A.", 15000, "LA LIBERTAD", "OTUZCO", "OTUZCO"]);
    
    // Project for La Libertad
    await pool.query("INSERT INTO proyectos (nombre, codigo, monto, departamento, provincia, distrito) VALUES ($1, $2, $3, $4, $5, $6)", ["Proyecto Vial Otuzco", "CUI-999", 2500000, "LA LIBERTAD", "OTUZCO", "OTUZCO"]);
    
    console.log("Data for La Libertad seeded successfully");
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
