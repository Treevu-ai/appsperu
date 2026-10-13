import "dotenv/config";
import { Pool } from "pg";
import { pool, connectSafe } from "../db/pool.js";
import { coincideTitular } from "../lib/titular-matcher.js";

/**
 * ITRE (Indice de Riesgo Territorial Extractivo) -- score 0-10 por concesion
 * forestal maderable activa, combinando:
 *   A) intensidad de perdida de bosque (ha_perdida / ha_concesion)
 *   B) sancion OSINFOR normalizada por hectarea (monto_multa_uit / ha_concesion)
 *
 * Solo se califican concesiones con ha_perdida > 0 (mismo principio que
 * apps/territorio-inteligencia/api/src/routes/riesgo-eudr.ts: una concesion
 * sin solapamiento detectado NO aparece en el ranking -- no es que tenga
 * score 10, es que no hay evidencia de riesgo que evaluar).
 *
 * El JOIN masivo concesiones x perdida_bosque_poligono da timeout en Neon
 * (confirmado en vivo en cruce-concesiones-forestales.ts) -- se itera
 * concesion por concesion, acotado por su propio bbox.
 */

const srcOsinforUrl = process.env.SRC_OSINFOR_SANCIONES_DATABASE_URL;
if (!srcOsinforUrl) throw new Error("SRC_OSINFOR_SANCIONES_DATABASE_URL no está definida.");

const srcOsinfor = new Pool({ connectionString: srcOsinforUrl });
srcOsinfor.on("error", (err) => console.error("Error inesperado en conexión idle (osinfor):", err.message));

interface ConcesionRow {
  gfw_fid: number;
  company: string | null;
  cont_id: string | null;
  ha_concesion: string;
}

interface SancionRow {
  titulo: string | null;
  titular: string | null;
  monto_multa_uit: string | null;
}


interface ResultadoConcesion {
  gfwFid: number;
  contId: string | null;
  company: string | null;
  haConcesion: number;
  haPerdida: number;
  montoSancionesUit: number;
  discrepanciaTitular: string[];
}

async function haPerdidaDeConcesion(gfwFid: number): Promise<number> {
  const { rows } = await pool.query<{ ha_perdida: string | null }>(
    `SELECT round(sum(ST_Area(ST_Intersection(p.geom, f.geom)::geography))/10000)::numeric::text AS ha_perdida
     FROM perdida_bosque_poligono p, forest_concessions f
     WHERE f.gfw_fid = $1 AND p.cobertura LIKE 'Pérdida%' AND ST_Intersects(p.geom, f.geom)`,
    [gfwFid]
  );
  return Number(rows[0]?.ha_perdida ?? 0);
}

async function main(): Promise<void> {
  const { rows: concesiones } = await pool.query<ConcesionRow>(
    `SELECT gfw_fid, company, cont_id, round((ST_Area(geom::geography) / 10000)::numeric)::text AS ha_concesion
     FROM forest_concessions
     WHERE conc_type = 'MADERABLE' AND conc_stat = 'ACTIVA'
     ORDER BY gfw_fid`
  );
  console.log(`Procesando ${concesiones.length} concesiones madereras activas...`);

  console.log("Trayendo sanciones OSINFOR (osinfor_sanciones)...");
  const { rows: sanciones } = await srcOsinfor.query<SancionRow>(
    `SELECT titulo, titular, monto_multa_uit::text FROM sanciones_osinfor WHERE titulo IS NOT NULL`
  );
  const sancionesPorTitulo = new Map<string, SancionRow[]>();
  for (const s of sanciones) {
    if (!s.titulo) continue;
    if (!sancionesPorTitulo.has(s.titulo)) sancionesPorTitulo.set(s.titulo, []);
    sancionesPorTitulo.get(s.titulo)!.push(s);
  }
  console.log(`${sanciones.length} sanciones, ${sancionesPorTitulo.size} títulos distintos.`);

  const resultados: ResultadoConcesion[] = [];
  let procesadas = 0;

  for (const c of concesiones) {
    const haPerdida = await haPerdidaDeConcesion(c.gfw_fid);
    procesadas++;
    if (procesadas % 50 === 0) console.log(`  ${procesadas} / ${concesiones.length} concesiones procesadas...`);

    if (haPerdida <= 0) continue; // sin evidencia de riesgo -- no se califica, no es score 10

    let montoSancionesUit = 0;
    const discrepanciaTitular: string[] = [];
    const candidatas = c.cont_id ? sancionesPorTitulo.get(c.cont_id) ?? [] : [];
    for (const s of candidatas) {
      if (!c.company || !s.titular) continue;
      if (coincideTitular(c.company, s.titular)) {
        montoSancionesUit += Number(s.monto_multa_uit ?? 0);
      } else {
        discrepanciaTitular.push(`${s.titular} (sanción, título ${s.titulo}) vs ${c.company} (concesión) -- NO atribuida`);
      }
    }

    resultados.push({
      gfwFid: c.gfw_fid,
      contId: c.cont_id,
      company: c.company,
      haConcesion: Number(c.ha_concesion),
      haPerdida,
      montoSancionesUit,
      discrepanciaTitular,
    });
  }

  console.log(`\n${resultados.length} de ${concesiones.length} concesiones califican (ha_perdida > 0).`);

  if (resultados.length === 0) {
    console.log("Sin concesiones calificadas, nada que persistir.");
    await pool.end();
    await srcOsinfor.end();
    return;
  }

  // Sub-indicadores crudos
  const subA = resultados.map((r) => r.haPerdida / r.haConcesion);
  const subB = resultados.map((r) => r.montoSancionesUit / r.haConcesion);

  const minMax = (arr: number[]) => {
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    return { min, max };
  };
  const { min: minA, max: maxA } = minMax(subA);
  const { min: minB, max: maxB } = minMax(subB);

  // Normaliza 0-10 (10 = peor en esta etapa), promedia, invierte para que
  // 10 = mejor (menor riesgo) -- misma convención que IRIS/IRESA del IPE.
  const normalizado = resultados.map((r, i) => {
    const nA = maxA > minA ? ((subA[i] - minA) / (maxA - minA)) * 10 : 0;
    const nB = maxB > minB ? ((subB[i] - minB) / (maxB - minB)) * 10 : 0;
    const promedio = (nA + nB) / 2;
    const score = 10 - promedio;
    return { ...r, subIndicadorA: nA, subIndicadorB: nB, score };
  });

  normalizado.sort((a, b) => a.score - b.score); // peor (score bajo) primero

  console.log(`\nTop 15 por score (peor primero):`);
  for (const r of normalizado.slice(0, 15)) {
    const pct = ((r.haPerdida / r.haConcesion) * 100).toFixed(1);
    console.log(
      `  ${r.contId ?? r.gfwFid} — ${r.company} — score ${r.score.toFixed(2)}/10 — ` +
        `${r.haConcesion.toFixed(0)} ha concesión, ${r.haPerdida.toFixed(1)} ha pérdida (${pct}%), ` +
        `${r.montoSancionesUit.toFixed(2)} UIT en sanciones`
    );
    if (r.discrepanciaTitular.length > 0) {
      for (const d of r.discrepanciaTitular) console.log(`      ⚠ discrepancia titular: ${d}`);
    }
  }

  console.log("\nPersistiendo en indice_riesgo_territorial_extractivo...");
  const client = await connectSafe();
  try {
    await client.query("BEGIN");
    for (const r of normalizado) {
      const notas = r.discrepanciaTitular.length > 0 ? r.discrepanciaTitular.join("; ") : null;
      await client.query(
        `INSERT INTO indice_riesgo_territorial_extractivo
           (cont_id, company, ha_concesion, ha_perdida, monto_sanciones_uit, sub_indicador_a, sub_indicador_b, score, notas)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (cont_id, fecha_corte) DO UPDATE SET
           company = EXCLUDED.company, ha_concesion = EXCLUDED.ha_concesion,
           ha_perdida = EXCLUDED.ha_perdida, monto_sanciones_uit = EXCLUDED.monto_sanciones_uit,
           sub_indicador_a = EXCLUDED.sub_indicador_a, sub_indicador_b = EXCLUDED.sub_indicador_b,
           score = EXCLUDED.score, notas = EXCLUDED.notas`,
        [
          r.contId ?? String(r.gfwFid),
          r.company,
          r.haConcesion,
          r.haPerdida,
          r.montoSancionesUit,
          r.subIndicadorA,
          r.subIndicadorB,
          r.score,
          notas,
        ]
      );
    }
    await client.query("COMMIT");
    console.log(`${normalizado.length} filas persistidas.`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  await pool.end();
  await srcOsinfor.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
