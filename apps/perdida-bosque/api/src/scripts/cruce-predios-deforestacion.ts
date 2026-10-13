import "dotenv/config";
import { pool } from "../db/pool.js";

/**
 * Cruce ST_Intersects entre `predios_rurales` (MIDAGRI, titulación de tierra
 * agrícola) y `perdida_bosque_poligono` (Geobosques, filtrado `cobertura
 * LIKE 'Pérdida%'`) -- mismo patrón ya validado para mining_rights y
 * forest_concessions: 1) contar candidatos vía EXISTS (barato, usa GIST),
 * 2) arreglar SOLO las geometrías inválidas del subconjunto candidato
 * (ST_MakeValid + ST_CollectionExtract, nunca la tabla completa -- da
 * timeout), 3) agregar hectáreas de solapamiento por departamento/provincia.
 */

async function main(): Promise<void> {
  const { rows: totalRows } = await pool.query<{ count: string }>(`SELECT count(*) FROM predios_rurales`);
  console.log(`Total predios rurales: ${totalRows[0].count}`);

  const { rows: candRows } = await pool.query<{ predios_candidatos: string; invalidos: string }>(
    `SELECT count(DISTINCT pr.objectid) AS predios_candidatos,
            count(DISTINCT pr.objectid) FILTER (WHERE NOT ST_IsValid(pr.geom)) AS invalidos
     FROM predios_rurales pr
     JOIN perdida_bosque_poligono p
       ON p.cobertura LIKE 'Pérdida%' AND ST_Intersects(p.geom, pr.geom)`
  );
  console.log(`Predios candidatos (intersectan pérdida): ${candRows[0].predios_candidatos} (${candRows[0].invalidos} con geometría inválida)`);

  if (Number(candRows[0].invalidos) > 0) {
    console.log("Corrigiendo geometrías inválidas del subconjunto candidato...");
    const { rowCount } = await pool.query(
      `UPDATE predios_rurales pr
       SET geom = ST_Multi(ST_CollectionExtract(ST_MakeValid(geom), 3))
       WHERE NOT ST_IsValid(pr.geom)
         AND EXISTS (SELECT 1 FROM perdida_bosque_poligono p WHERE p.cobertura LIKE 'Pérdida%' AND ST_Intersects(p.geom, pr.geom))`
    );
    console.log(`  ${rowCount} predios corregidos.`);
  }

  console.log("Calculando hectáreas de solapamiento por departamento...");
  const { rows: porDepto } = await pool.query<{ nom_dpto: string; predios: string; ha_perdida: string }>(
    `SELECT pr.nom_dpto,
            count(DISTINCT pr.objectid) AS predios,
            round(sum(ST_Area(ST_Intersection(p.geom, pr.geom)::geography))/10000)::numeric AS ha_perdida
     FROM predios_rurales pr
     JOIN perdida_bosque_poligono p
       ON p.cobertura LIKE 'Pérdida%' AND ST_Intersects(p.geom, pr.geom)
     GROUP BY pr.nom_dpto
     ORDER BY ha_perdida DESC`
  );
  console.table(porDepto);

  console.log("\nTop 15 predios por hectáreas de solapamiento...");
  const { rows: topPredios } = await pool.query<{ objectid: number; nom_dpto: string; nom_prov: string; nom_dist: string; nombre: string; estado: string; area_ha: number; ha_perdida: string }>(
    `SELECT pr.objectid, pr.nom_dpto, pr.nom_prov, pr.nom_dist, pr.nombre, pr.estado, pr.area_ha,
            round(sum(ST_Area(ST_Intersection(p.geom, pr.geom)::geography))/10000)::numeric AS ha_perdida
     FROM predios_rurales pr
     JOIN perdida_bosque_poligono p
       ON p.cobertura LIKE 'Pérdida%' AND ST_Intersects(p.geom, pr.geom)
     GROUP BY pr.objectid, pr.nom_dpto, pr.nom_prov, pr.nom_dist, pr.nombre, pr.estado, pr.area_ha
     ORDER BY ha_perdida DESC
     LIMIT 15`
  );
  console.table(topPredios);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
