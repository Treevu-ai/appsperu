const { Pool } = require("pg");
const pool = new Pool({ connectionString: "postgres://catastro_minero:catastro_minero@localhost:5462/catastro_minero" });
async function run() {
  try {
    // Operator for Huanuco
    await pool.query("INSERT INTO inteligencia_minero (titular_ruc, titular_nombre, superficie, departamento, provincia, distrito) VALUES ($1, $2, $3, $4, $5, $6)", ["20888888888", "Consorcio Minero Centro S.A.", 12000, "HUANUCO", "LEONCIO PRADO", "TINGO MARIA"]);
    await pool.query("INSERT INTO catastro_forestal_titulos (titular_ruc, titular_nombre, superficie, departamento, provincia, distrito) VALUES ($1, $2, $3, $4, $5, $6)", ["20888888888", "Consorcio Minero Centro S.A.", 25000, "HUANUCO", "LEONCIO PRADO", "TINGO MARIA"]);
    
    // Project for Huanuco
    await pool.query("INSERT INTO proyectos (nombre, codigo, monto, departamento, provincia, distrito) VALUES ($1, $2, $3, $4, $5, $6)", ["Puente Tingo Maria", "CUI-777", 4200000, "HUANUCO", "LEONCIO PRADO", "TINGO MARIA"]);
    
    console.log("Data for Huanuco seeded successfully");
  } catch (e) {
    console.error(e);
  } finally {
    process.exit();
  }
}
run();
