const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgres://catastro_minero:catastro_minero@localhost:5462/catastro_minero'
});

async function seed() {
  try {
    console.log('Sembrando datos de prueba...');
    await pool.query(
      CREATE TABLE IF NOT EXISTS catastro_minero_derechos (
        id SERIAL PRIMARY KEY,
        titular_ruc TEXT,
        titular_nombre TEXT,
        superficie NUMERIC,
        departamento TEXT,
        ubicacion_geo TEXT
      );
      CREATE TABLE IF NOT EXISTS catastro_forestal_titulos (
        id SERIAL PRIMARY KEY,
        titular_ruc TEXT,
        titular_nombre TEXT,
        superficie NUMERIC,
        departamento TEXT,
        ubicacion_geo TEXT
      );
      INSERT INTO catastro_minero_derechos (titular_ruc, titular_nombre, superficie, departamento, ubicacion_geo) 
      VALUES ('20123456789', 'Empresa Minera Riesgo S.A.', 5000, 'LORETO', 'POINT(-73.25 -3.75)');
      INSERT INTO catastro_forestal_titulos (titular_ruc, titular_nombre, superficie, departamento, ubicacion_geo) 
      VALUES ('20123456789', 'Empresa Minera Riesgo S.A.', 12000, 'LORETO', 'POINT(-73.25 -3.75)');
    );
    console.log('Datos sembrados exitosamente.');
  } catch (e) {
    console.error('Error sembrando datos:', e);
  } finally {
    pool.end();
    process.exit();
  }
}

seed();
