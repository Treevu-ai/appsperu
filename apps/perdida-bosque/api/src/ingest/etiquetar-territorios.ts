import { pool } from "../db/pool.js";

/**
 * Etiqueta con ubigeo/departamento/provincia/distrito las filas de
 * `perdida_bosque_poligono` que todavía no lo tienen — vía
 * `ST_Contains(distrito.geom, ST_Centroid(poligono.geom))` contra la tabla
 * `territories` (ya poblada por `transfer-territories.ts`). Automatiza el
 * mismo UPDATE en lotes de 200K por rango de `id` que se corrió a mano el
 * 2026-10-11 — un solo UPDATE gigante sobre millones de filas se cae por
 * timeout (confirmado en vivo), por eso va en lotes.
 */

const BATCH_SIZE = 200_000;

async function etiquetarTerritorios(): Promise<{ loteId: number; filas: number }[]> {
  const { rows: rangeRows } = await pool.query<{ min: string; max: string }>(
    `SELECT min(id), max(id) FROM perdida_bosque_poligono WHERE ubigeo IS NULL`
  );
  const min = Number(rangeRows[0].min);
  const max = Number(rangeRows[0].max);

  if (Number.isNaN(min) || Number.isNaN(max)) {
    console.log("No hay filas sin etiquetar.");
    return [];
  }

  console.log(`Etiquetando filas sin ubigeo entre id ${min} y ${max}...`);
  const resultados: { loteId: number; filas: number }[] = [];

  for (let start = min; start <= max; start += BATCH_SIZE) {
    const end = Math.min(start + BATCH_SIZE - 1, max);
    const { rowCount } = await pool.query(
      `UPDATE perdida_bosque_poligono p
       SET ubigeo = t.ubigeo, departamento = t.departamento, provincia = t.provincia, distrito = t.distrito
       FROM territories t
       WHERE p.id BETWEEN $1 AND $2
         AND p.ubigeo IS NULL
         AND ST_Contains(t.geom, ST_Centroid(p.geom))`,
      [start, end]
    );
    console.log(`  id ${start}-${end}: ${rowCount ?? 0} filas etiquetadas`);
    resultados.push({ loteId: start, filas: rowCount ?? 0 });
  }

  return resultados;
}

etiquetarTerritorios()
  .then((resumen) => {
    console.log(JSON.stringify(resumen, null, 2));
    return pool.end();
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
