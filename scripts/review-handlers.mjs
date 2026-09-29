/**
 * Revisión automática de handlers portados. Comprueba lo que el guard de
 * fidelidad SQL NO cubre (ese solo mira los literales SQL):
 *
 *  1. exports presentes frente a los esperados
 *  2. `Promise.all` — solo tolerable si todas las queries van a la MISMA base
 *     (Workers permite 6 conexiones simultáneas; cruzando bases se agota)
 *  3. pools cross-app declarados
 *  4. marcadores de desvío declarado (`@nuevo:` / `@fidelity: precomputado`)
 *  5. params de path leídos como `args.<param>`
 *
 *   node scripts/review-handlers.mjs <app> [modulo]
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const base = join(here, "..", "mcp-server", "src", "handlers");

const app = process.argv[2];
if (!app) {
  console.error("uso: node scripts/review-handlers.mjs <app> [modulo]");
  process.exit(1);
}
const soloModulo = process.argv[3];

const dir = join(base, app);
const archivos = readdirSync(dir)
  .filter((f) => f.endsWith(".ts") && f !== "_helpers.ts")
  .filter((f) => !soloModulo || f === soloModulo)
  .sort();

if (archivos.length === 0) {
  console.log(`${app}: sin modulos que revisar`);
  process.exit(0);
}

console.log(`=== ${app}: ${archivos.length} modulos ===\n`);

for (const archivo of archivos) {
  const fuente = readFileSync(join(dir, archivo), "utf8");
  const modulo = archivo.replace(/\.ts$/, "");
  const exports = [...fuente.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]);
  const lineas = fuente.split("\n").length;

  const pools = [...fuente.matchAll(/crossAppPool\("([^"]+)"/g)].map((m) => m[1]);
  const paramsUsados = [...new Set([...fuente.matchAll(/args\.(\w+)/g)].map((m) => m[1]))];
  const marcadores = [...fuente.matchAll(/@nuevo:|@fidelity: \w+/g)].map((m) => m[0]);

  // Promise.all es seguro solo si dentro del bloque no hay refs a pools distintos.
  const paralelos = [...fuente.matchAll(/Promise\.all\(\[([\s\S]*?)\]\)/g)].map((m) => m[1]);
  const riesgoParalelo = paralelos
    .filter((bloque) => {
      const refs = [...bloque.matchAll(/\b(\w+Db|\w+Pool)\b/g)].map((m) => m[1]);
      const distintos = new Set(refs.filter((r) => r !== "db"));
      return distintos.size > 0;
    })
    .map((b) => [...b.matchAll(/\b(\w+Db|\w+Pool)\b/g)].map((m) => m[1]).filter((r) => r !== "db"));

  const alertas = [];
  if (exports.length === 0) alertas.push("sin exports");
  if (riesgoParalelo.length > 0) alertas.push(`Promise.all cruza bases: ${riesgoParalelo.flat().join(", ")}`);
  if (pools.length === 0 && /ejecucionPool|inversionesPool|comprasPool|radarPool/.test(fuente)) {
    alertas.push("usa pool cross-app del source pero no crossAppPool()");
  }
  if (marcadores.length > 0) alertas.push(`desvio declarado: ${marcadores.join(", ")}`);

  const estado = alertas.length === 0 ? "ok" : "REVISAR";
  console.log(
    `[${estado}] ${modulo} (${lineas} l.) exports: ${exports.join(", ") || "-"}` +
      (pools.length ? ` | cross-app: ${pools.join(",")}` : "") +
      (paramsUsados.length ? ` | args: ${paramsUsados.join(",")}` : "")
  );
  for (const a of alertas) console.log(`         -> ${a}`);
}
