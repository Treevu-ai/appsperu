import "dotenv/config";
import { writeFileSync, appendFileSync } from "node:fs";
import { cruzarProyectosInfobras, cruzarProyectoInfobrasPorId } from "./src/crossref/infobras-matcher.js";
import { pool } from "./src/db/pool.js";

const LOG = "verify.log";
writeFileSync(LOG, "");
const log = (s: string) => { appendFileSync(LOG, s + "\n"); console.log(s); };

async function medir(nombre: string, fn: () => Promise<{ total: number; cruces: any[]; hasMore: boolean }>) {
  const t = performance.now();
  const r = await fn();
  const ms = performance.now() - t;
  log(`${nombre}: ${ms.toFixed(0)} ms | total=${r.total} | pagina=${r.cruces.length} | hasMore=${r.hasMore}`);
  return r;
}

log("=== periodo 2021 completo (14,864 proyectos) ===");
const lib = await medir("LA LIBERTAD p2021", () => cruzarProyectosInfobras("LA LIBERTAD", { periodo: 2021 }));
const lima = await medir("LIMA      p2021", () => cruzarProyectosInfobras("LIMA", { periodo: 2021 }));
const alias = await medir("'P C DEL CALLAO'  ", () => cruzarProyectosInfobras("P C DEL CALLAO", { periodo: 2021 }));
const callao = await medir("'CALLAO'          ", () => cruzarProyectosInfobras("CALLAO", { periodo: 2021 }));

log("\nalias y canonico deben coincidir en total: " + (alias.total === callao.total ? "OK" : `DIFIEREN ${alias.total} vs ${callao.total}`));
log("LIMA y LA LIBERTAD deben diferir: " + (lima.total !== lib.total ? "OK" : "IGUALES (sospechoso)"));

log("\n=== periodo 2026 ===");
const v26 = await medir("LA LIBERTAD p2026", () => cruzarProyectosInfobras("LA LIBERTAD", { periodo: 2026 }));

log("\n=== top 8 cruces (LA LIBERTAD 2021, defaults) ===");
for (const c of lib.cruces.slice(0, 8)) {
  log(`  score ${c.matchScore.toFixed(2)} kws=[${c.matchedKeywords.join(",")}]`);
  log(`    PL: ${c.proyecto.titulo.slice(0, 76)}`);
  log(`    OB: ${c.obra.nombreObra.slice(0, 76)}`);
}

log("\n=== paginacion estable: pagina 1 y 2 no se solapan ===");
const a = await cruzarProyectosInfobras("LA LIBERTAD", { periodo: 2021, limite: 5, offset: 0 });
const b = await cruzarProyectosInfobras("LA LIBERTAD", { periodo: 2021, limite: 5, offset: 5 });
const ca = a.cruces.map((x: any) => `${x.proyecto.pleyNum}|${x.obra.codigoInfobras}`);
const cb = b.cruces.map((x: any) => `${x.proyecto.pleyNum}|${x.obra.codigoInfobras}`);
log(`  pagina1=${ca.length} pagina2=${cb.length} solapamiento=${ca.filter((x: string) => cb.includes(x)).length}`);

log("\n=== proyecto individual ===");
const uno = await medir("proyecto 14849", () => cruzarProyectoInfobrasPorId(2021, 14849, "LA LIBERTAD"));
log(`  total=${uno.total}`);

await pool.end();
