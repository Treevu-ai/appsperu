/**
 * Imprime, por app, cada tool del catálogo con su pathTemplate y pathParams, y
 * los módulos de handler existentes con sus exports. Sirve para armar el
 * mapeo `handler: "modulo:funcion"` sin depender de memoria ni de lo que
 * reportó quien portó.
 *
 *   node scripts/catalogo-handler-map.mjs [app]
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const raiz = join(here, "..");
const solo = process.argv[2];

const catalogo = readFileSync(join(raiz, "mcp-server", "src", "catalog.ts"), "utf8");
const handlersDir = join(raiz, "mcp-server", "src", "handlers");

const apps = [...new Set([...catalogo.matchAll(/app:\s*"([^"]+)"/g)].map((m) => m[1]))]
  .filter((a) => !solo || a === solo)
  .sort();

for (const app of apps) {
  const dir = join(handlersDir, app);
  const modulos = existsSync(dir)
    ? readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "_helpers.ts")
    : [];

  if (modulos.length === 0) continue;

  // Cada tool del catálogo es un objeto `{ name, app, pathTemplate, ... }`.
  // Se parte por la posición de cada `name:` en vez de por delimitadores, que
  // cambian con el formateo.
  const tools = [];
  const nombres = [...catalogo.matchAll(/^ {4}name: "([^"]+)",?$/gm)];
  for (let i = 0; i < nombres.length; i++) {
    const desde = nombres[i].index;
    const hasta = i + 1 < nombres.length ? nombres[i + 1].index : catalogo.length;
    const b = catalogo.slice(desde, hasta);
    if (!b.includes(`app: "${app}"`)) continue;
    const path = b.match(/pathTemplate:\s*"([^"]+)"/)?.[1];
    const handler = b.match(/handler:\s*"([^"]+)"/)?.[1];
    const params = [...(b.match(/pathParams:\s*\[([^\]]*)\]/) ?? ["", ""])[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    if (path) tools.push({ name: nombres[i][1], path, params, handler });
  }

  console.log(`\n=== ${app} — ${tools.length} tools, ${modulos.length} modulos de handler ===`);
  for (const t of tools) {
    console.log(`  ${t.handler ? "[wiring] " : "[PENDIENTE] "}${t.name}`);
    console.log(`      ${t.path}   params: [${t.params.join(", ")}]`);
  }
  console.log("  -- modulos --");
  for (const m of modulos.sort()) {
    const fuente = readFileSync(join(dir, m), "utf8");
    const fns = [...fuente.matchAll(/export async function (\w+)/g)].map((x) => x[1]);
    console.log(`      ${m.replace(/\.ts$/, "")}: ${fns.join(", ") || "(sin exports)"}`);
  }
}
