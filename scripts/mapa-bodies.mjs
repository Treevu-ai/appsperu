/**
 * Lista, por función, los `body:` / `status:` que devuelve un handler, y los
 * `res.json` / `res.status` de su route de origen. Para contrastar a mano
 * dónde está cada respuesta (el emparejamiento automático por solapamiento de
 * claves puede atribuir mal un body).
 *
 *   node scripts/mapa-bodies.mjs <app> <modulo>
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const raiz = join(here, "..");
const [app, modulo] = process.argv.slice(2);

const handler = readFileSync(join(raiz, "mcp-server", "src", "handlers", app, `${modulo}.ts`), "utf8").split("\n");
const route = readFileSync(join(raiz, "apps", app, "api", "src", "routes", `${modulo}.ts`), "utf8").split("\n");

console.log(`=== HANDLER ${app}/${modulo}`);
let fn = "(modulo)";
handler.forEach((l, i) => {
  const m = l.match(/^export async function (\w+)/);
  if (m) fn = m[1];
  if (/body:\s*\{/.test(l) || /status:\s*\d+/.test(l)) {
    console.log(String(i + 1).padStart(5), fn.padEnd(14), l.trim().slice(0, 92));
  }
});

console.log(`\n=== ORIGEN apps/${app}/api/src/routes/${modulo}.ts`);
let ruta = "(modulo)";
route.forEach((l, i) => {
  const m = l.match(/Router\.get\(\s*"([^"]+)"/);
  if (m) ruta = m[1];
  if (/res\.(status\(\d+\)\.)?json/.test(l)) {
    console.log(String(i + 1).padStart(5), ruta.padEnd(14), l.trim().slice(0, 92));
  }
});
