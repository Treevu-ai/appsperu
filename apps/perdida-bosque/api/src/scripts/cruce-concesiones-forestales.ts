import "dotenv/config";
import { pool } from "../db/pool.js";

/**
 * Cruce espacial entre concesiones forestales madereras activas (OSINFOR,
 * tabla `forest_concessions`) y pérdida de bosque (`perdida_bosque_poligono`).
 *
 * Un solo JOIN masivo (548 concesiones x 5.65M polígonos) da timeout en
 * Neon -- confirmado en vivo -- porque las concesiones forestales cubren
 * áreas enormes (hasta 49,000 ha, vs. 800-1000 ha de las concesiones
 * mineras) y el plan de ejecución no narrows bien con esa combinación.
 * Recorrer concesión por concesión sí es rápido (una concesión de 33,715
 * ha solo matcheó 53 polígonos candidatos en segundos), mismo principio
 * que ya se usó para evitar timeouts en otras partes de esta ingesta.
 *
 * NOTA: `start_date`/`end_date` vienen NULL para TODAS las concesiones
 * MADERABLE en OSINFOR -- no hay dato temporal para validar causalidad
 * (a diferencia de minería, donde sí existía `fecha_denuncio`). Esto es
 * SOLO solapamiento espacial, no se infiere causalidad.
 */

interface ConcesionResultado {
  gfwFid: number;
  company: string | null;
  contId: string | null;
  haConcesion: number;
  haPerdida: number;
}

async function main(): Promise<void> {
  const { rows: concesiones } = await pool.query<{ gfw_fid: number; company: string | null; cont_id: string | null; ha_concesion: string }>(
    `SELECT gfw_fid, company, cont_id, round((ST_Area(geom::geography) / 10000)::numeric)::text AS ha_concesion
     FROM forest_concessions
     WHERE conc_type = 'MADERABLE' AND conc_stat = 'ACTIVA'
     ORDER BY gfw_fid`
  );
  console.log(`Procesando ${concesiones.length} concesiones madereras activas...`);

  const resultados: ConcesionResultado[] = [];
  let procesadas = 0;

  for (const c of concesiones) {
    const { rows } = await pool.query<{ ha_perdida: string | null }>(
      `SELECT round(sum(ST_Area(ST_Intersection(p.geom, f.geom)::geography))/10000)::numeric::text AS ha_perdida
       FROM perdida_bosque_poligono p, forest_concessions f
       WHERE f.gfw_fid = $1 AND p.cobertura LIKE 'Pérdida%' AND ST_Intersects(p.geom, f.geom)`,
      [c.gfw_fid]
    );
    const haPerdida = Number(rows[0]?.ha_perdida ?? 0);
    if (haPerdida > 0) {
      resultados.push({
        gfwFid: c.gfw_fid,
        company: c.company,
        contId: c.cont_id,
        haConcesion: Number(c.ha_concesion),
        haPerdida,
      });
    }
    procesadas++;
    if (procesadas % 50 === 0) console.log(`  ${procesadas} / ${concesiones.length} concesiones procesadas...`);
  }

  resultados.sort((a, b) => b.haPerdida - a.haPerdida);

  console.log(`\n${resultados.length} de ${concesiones.length} concesiones madereras intersectan pérdida de bosque.`);
  const totalHaPerdida = resultados.reduce((s, r) => s + r.haPerdida, 0);
  console.log(`Total ha de solapamiento: ${totalHaPerdida.toFixed(1)}`);

  console.log(`\nTop 10 por ha de solapamiento:`);
  for (const r of resultados.slice(0, 10)) {
    const pct = ((r.haPerdida / r.haConcesion) * 100).toFixed(1);
    console.log(`  ${r.contId ?? r.gfwFid} — ${r.company} — ${r.haConcesion.toFixed(0)} ha concesión, ${r.haPerdida.toFixed(1)} ha pérdida (${pct}%)`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
