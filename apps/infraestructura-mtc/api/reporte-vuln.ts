import { pool } from "./src/db/pool.js";

async function main() {
  const { rows } = await pool.query(`
    SELECT codigo_puerto, nombre_terminal, id_departamento, ambito, alcance,
           estado_conservacion, es_concesionado, tiene_geolocalizacion,
           score_vulnerabilidad, componentes, rank
    FROM (
      SELECT *,
             ROW_NUMBER() OVER (ORDER BY score_vulnerabilidad DESC) AS rank
      FROM indice_vulnerabilidad_portuaria
      WHERE fuente_datos = 'MTC_2025'
    ) sub
    ORDER BY rank
  `);

  console.log("CODIGO,NOMBRE,DPTO,AMBITO,ALCANCE,ESTADO,CONCESIONADO,GEO,SCORE,ESTADO_SC,CONCESION_SC,ALCANCE_SC,AMBITO_SC,GEO_SC,RANK");
  
  for (const r of rows) {
    const c = r.componentes;
    console.log([
      r.codigo_puerto,
      `"${r.nombre_terminal}"`,
      r.id_departamento,
      r.ambito,
      r.alcance,
      r.estado_conservacion ?? "null",
      r.es_concesionado ?? "null",
      r.tiene_geolocalizacion,
      r.score_vulnerabilidad,
      c?.estadoConservacion ?? "null",
      c?.esConcesionado ?? "null",
      c?.alcance ?? "null",
      c?.ambito ?? "null",
      c?.tieneGeolocalizacion ?? "null",
      r.rank
    ].join(","));
  }

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
