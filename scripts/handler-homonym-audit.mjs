/**
 * Para cada app con handlers, indica si el módulo tiene un route homónimo en
 * apps/<app>/api/src/routes. Sin homónimo, la verificación de fidelidad se
 * hace contra el corpus completo de la app (menos precisa pero no nula).
 */
import { readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const handlersDir = join(here, "..", "mcp-server", "src", "handlers");
const appsDir = join(here, "..", "apps");

for (const app of readdirSync(handlersDir).sort()) {
  const dir = join(handlersDir, app);
  if (!statSync(dir).isDirectory()) continue;
  const modulos = readdirSync(dir).filter((f) => f.endsWith(".ts") && f !== "_helpers.ts");
  if (modulos.length === 0) continue;

  const routesDir = join(appsDir, app, "api", "src", "routes");
  const routes = existsSync(routesDir) ? readdirSync(routesDir).filter((f) => f.endsWith(".ts")).map((f) => f.replace(/\.ts$/, "")) : [];

  const conHom = [];
  const sinHom = [];
  for (const m of modulos.map((f) => f.replace(/\.ts$/, "")).sort()) {
    (routes.includes(m) ? conHom : sinHom).push(m);
  }

  console.log(`\n=== ${app}: ${modulos.length} modulos, ${routes.length} routes`);
  console.log(`  homonimo (verificacion estricta): ${conHom.length} -> ${conHom.join(", ") || "-"}`);
  console.log(`  SIN homonimo (verificacion laxa) : ${sinHom.length} -> ${sinHom.join(", ") || "-"}`);
}
