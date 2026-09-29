/**
 * Lista los tools de una app que aún NO tienen `handler` en catalog.ts, con su
 * pathTemplate y pathParams. Sirve para saber qué falta portar.
 *
 *   node scripts/tools-pendientes.mjs [app]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const texto = readFileSync(join(here, "..", "mcp-server", "src", "catalog.ts"), "utf8").replace(/\r\n/g, "\n");
const solo = process.argv[2];

const nombres = [...texto.matchAll(/^ {4}name: "([^"]+)",$/gm)];
let pendientes = 0;
let total = 0;

for (let i = 0; i < nombres.length; i++) {
  const bloque = texto.slice(nombres[i].index, i + 1 < nombres.length ? nombres[i + 1].index : texto.length);
  const app = bloque.match(/app: "([^"]+)"/)?.[1];
  if (!app || (solo && app !== solo)) continue;
  total++;
  if (/^\s*handler:/m.test(bloque)) continue;
  pendientes++;
  const path = bloque.match(/pathTemplate: "([^"]+)"/)?.[1];
  const params = [...(bloque.match(/pathParams: \[([^\]]*)\]/) ?? ["", ""])[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  console.log(`${nombres[i][1].padEnd(50)} ${String(path).padEnd(52)} [${params.join(",")}]`);
}

console.log(`\n${solo ?? "todas"}: ${pendientes} de ${total} tools sin handler`);
