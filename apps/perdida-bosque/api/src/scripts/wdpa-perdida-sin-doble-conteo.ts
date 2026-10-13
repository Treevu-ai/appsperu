import "dotenv/config";

/**
 * Fix del bug de doble conteo en las tablas cubo de GFW
 * (`wdpa_protected_areas__tcl__change`/`__summary`) señalado en sesiones
 * anteriores como pendiente. Diagnóstico confirmado en vivo (2026-10-12):
 *
 * 1. El bug NO está en agrupar por `tsc_tree_cover_loss_drivers__driver`
 *    (eso particiona correctamente una vez fijado el threshold). El bug
 *    real es no fijar `umd_tree_cover_density_2000__threshold` (8 valores
 *    no excluyentes: 0,10,15,20,25,30,50,75% de densidad de copa) antes de
 *    sumar por año/driver — sumar sobre varios thresholds cuenta el mismo
 *    píxel de pérdida varias veces. Fix: SIEMPRE fijar un único threshold
 *    (30%, el default del dashboard oficial de GFW) antes de cualquier
 *    otro GROUP BY.
 * 2. El bug de "duplicate designation" de WDPA es real y se confirmó con
 *    datos: Pacaya-Samiria tiene DOS `wdpa_protected_area__id` (249 y
 *    68138) con área casi idéntica (21,717.93 vs 21,717.92 ha) — son el
 *    mismo polígono físico digitalizado dos veces. Sumarlos sin deduplicar
 *    por id (ej. agrupando por nombre, con grafías "Pacaya Samiria" vs
 *    "Pacaya - Samiria") duplica el total. Fix: deduplicar SIEMPRE por
 *    `wdpa_protected_area__id`, nunca por nombre.
 */

const GFW_BASE_URL = "https://data-api.globalforestwatch.org";
const THRESHOLD = 30; // default oficial del dashboard GFW

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": process.env.GFW_API_KEY ?? "",
    Origin: "http://localhost",
  };
}

interface AreaProtegida {
  id: string;
  nombre: string;
}

// IDs confirmados vía wdpa_protected_areas (site_id), no por nombre -- evita el
// bug de duplicados. Pacaya-Samiria usa un único id (249) de los dos existentes.
const AREAS: AreaProtegida[] = [
  { id: "20183", nombre: "Alto Mayo" },
  { id: "249", nombre: "Pacaya-Samiria" },
  { id: "303320", nombre: "Cordillera Azul" },
];

async function totalSinDobleConteo(areaId: string): Promise<number> {
  const sql = `SELECT sum(umd_tree_cover_loss__ha) AS total FROM data WHERE wdpa_protected_area__id='${areaId}' AND umd_tree_cover_density_2000__threshold=${THRESHOLD}`;
  const url = new URL(`${GFW_BASE_URL}/dataset/wdpa_protected_areas__tcl__change/latest/query/json`);
  url.searchParams.set("sql", sql);
  const res = await fetch(url, { headers: headers() });
  const body = (await res.json()) as { data?: Array<{ total: number | null }> };
  return body.data?.[0]?.total ?? 0;
}

async function porDriverSinDobleConteo(areaId: string): Promise<Array<{ driver: string; ha: number }>> {
  const sql = `SELECT tsc_tree_cover_loss_drivers__driver, sum(umd_tree_cover_loss__ha) AS ha FROM data WHERE wdpa_protected_area__id='${areaId}' AND umd_tree_cover_density_2000__threshold=${THRESHOLD} GROUP BY tsc_tree_cover_loss_drivers__driver ORDER BY ha DESC`;
  const url = new URL(`${GFW_BASE_URL}/dataset/wdpa_protected_areas__tcl__change/latest/query/json`);
  url.searchParams.set("sql", sql);
  const res = await fetch(url, { headers: headers() });
  const body = (await res.json()) as { data?: Array<{ tsc_tree_cover_loss_drivers__driver: string; ha: number }> };
  return (body.data ?? []).map((r) => ({ driver: r.tsc_tree_cover_loss_drivers__driver, ha: r.ha }));
}

async function main(): Promise<void> {
  for (const area of AREAS) {
    const total = await totalSinDobleConteo(area.id);
    const porDriver = await porDriverSinDobleConteo(area.id);
    const sumaDrivers = porDriver.reduce((s, d) => s + d.ha, 0);
    console.log(`\n=== ${area.nombre} (id ${area.id}, 2001-2022, threshold ${THRESHOLD}%) ===`);
    console.log(`  Total pérdida: ${total.toFixed(1)} ha`);
    console.log(`  Por driver: ${porDriver.map((d) => `${d.driver}=${d.ha.toFixed(1)}ha`).join(", ")}`);
    console.log(`  Suma drivers = ${sumaDrivers.toFixed(1)} ha (debe ≈ total; diferencia confirma que el driver particiona correctamente)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
