import { pool } from "./src/db/pool.js";
import { calcularScoreVulnerabilidad } from "./src/routes/vulnerabilidad-portuaria.js";

async function main() {
  const { rows: terminales } = await pool.query(`
    SELECT codigo_puerto, nombre_terminal, id_departamento, ambito, alcance,
           estado_conservacion, es_concesionado, latitud, longitud, fecha_corte
    FROM terminales_portuarios
    WHERE fecha_corte = (SELECT MAX(fecha_corte) FROM terminales_portuarios)
  `);

  console.log("Terminales encontrados:", terminales.length);

  await pool.query("DELETE FROM indice_vulnerabilidad_portuaria WHERE fuente_datos = $1", ["MTC_2025"]);

  let insertados = 0;
  for (const t of terminales) {
    const tieneGeo = t.latitud !== null && t.longitud !== null;
    const { score, componentes } = calcularScoreVulnerabilidad({
      estadoConservacion: t.estado_conservacion,
      esConcesionado: t.es_concesionado,
      alcance: t.alcance,
      ambito: t.ambito,
      tieneGeolocalizacion: tieneGeo,
    });

    await pool.query(`
      INSERT INTO indice_vulnerabilidad_portuaria
        (codigo_puerto, nombre_terminal, id_departamento, departamento, ambito, alcance,
         estado_conservacion, es_concesionado, tiene_geolocalizacion, score_vulnerabilidad,
         componentes, fuente_datos, fecha_corte)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (codigo_puerto, fuente_datos) DO UPDATE SET
        score_vulnerabilidad = EXCLUDED.score_vulnerabilidad,
        componentes = EXCLUDED.componentes,
        calculado_en = CURRENT_DATE
    `, [t.codigo_puerto, t.nombre_terminal, t.id_departamento, null, t.ambito,
        t.alcance, t.estado_conservacion, t.es_concesionado, tieneGeo,
        score, JSON.stringify(componentes), "MTC_2025", t.fecha_corte]);
    insertados++;
  }

  console.log("Insertados:", insertados);

  const { rows: top } = await pool.query(`
    SELECT codigo_puerto, nombre_terminal, ambito, score_vulnerabilidad
    FROM indice_vulnerabilidad_portuaria
    WHERE fuente_datos = 'MTC_2025'
    ORDER BY score_vulnerabilidad DESC
    LIMIT 10
  `);

  console.log("\n=== TOP 10 MÁS VULNERABLES ===");
  top.forEach((t, i) => console.log(`${i+1}. ${t.codigo_puerto} | ${t.nombre_terminal} | Score: ${t.score_vulnerabilidad}`));

  const { rows: stats } = await pool.query(`
    SELECT COUNT(*) total,
           AVG(score_vulnerabilidad)::numeric(5,2) promedio,
           MIN(score_vulnerabilidad) minimo,
           MAX(score_vulnerabilidad) maximo,
           PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score_vulnerabilidad) mediana
    FROM indice_vulnerabilidad_portuaria WHERE fuente_datos = 'MTC_2025'
  `);
  console.log("\n=== ESTADÍSTICAS ===");
  console.log("Total terminales indexados:", stats[0].total);
  console.log("Score promedio:", stats[0].promedio);
  console.log("Mediana:", stats[0].mediana);
  console.log("Rango:", stats[0].minimo, "-", stats[0].maximo);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
