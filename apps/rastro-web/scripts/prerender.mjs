#!/usr/bin/env node
/**
 * Prerenderiza las rutas estáticas de la SPA a HTML real, un archivo por
 * ruta bajo `dist/`, para que un crawler que no ejecuta JavaScript (GPTBot,
 * ClaudeBot, PerplexityBot, Google-Extended, etc. — ver public/robots.txt)
 * reciba contenido real en vez de `<div id="root"></div>` vacío.
 *
 * Corre después de `vite build` (dist/) y `vite build --ssr
 * src/entry-server.tsx --outDir dist-ssr` (ver package.json: ambos build
 * antes que este script). Usa la misma app (`App.tsx`) que el navegador real
 * — el HTML congelado y el render en vivo nunca pueden divergir en
 * estructura porque son literalmente el mismo árbol de componentes.
 *
 * Alcance: solo rutas estáticas (sin parámetro dinámico) — /proveedor/:ruc y
 * /distrito/:ubigeo no tienen un conjunto finito enumerable, quedan fuera
 * (ver docs/normas o el diagnóstico "Rastro Ledger" para el detalle de esa
 * decisión de alcance).
 *
 * Uso: node scripts/prerender.mjs
 * Falla fuerte (exit 1) solo si NINGUNA ruta pudo prerenderizarse — una
 * falla aislada de una sola ruta se reporta pero no bloquea el build entero
 * (mejor servir 10 rutas prerenderizadas que 0 por un bug en una).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT_DIV = '<div id="root"></div>';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const distDir = path.join(root, "dist");
const ssrEntryPath = path.join(root, "dist-ssr", "entry-server.js");
const templatePath = path.join(distDir, "index.html");

// Rutas estáticas reales de App.tsx — mantener en sync a mano. Un test en
// src/__tests__/prerender-routes.test.ts falla si App.tsx agrega/quita una
// ruta estática sin actualizar esta lista (mismo problema de drift silencioso
// que el conteo de apps/tools de R1, cerrado con el mismo tipo de guardia).
export const STATIC_ROUTES = [
  "/",
  "/buscar",
  "/catalogo",
  "/docs/api",
  "/docs/integridad",
  "/estado",
  "/gore/la-libertad/ficha",
  "/gore/la-libertad/comparativo",
  "/gore/la-libertad/benchmark",
  "/prensa/proveedores",
  "/auditoria/entidades-infobras",
];

function outputPathFor(routePath) {
  if (routePath === "/") return templatePath;
  return path.join(distDir, routePath, "index.html");
}

async function main() {
  if (!fs.existsSync(templatePath)) {
    console.error(`[prerender] No existe ${path.relative(root, templatePath)} — corre "vite build" antes.`);
    process.exit(1);
  }
  if (!fs.existsSync(ssrEntryPath)) {
    console.error(
      `[prerender] No existe ${path.relative(root, ssrEntryPath)} — corre "vite build --ssr src/entry-server.tsx --outDir dist-ssr" antes.`,
    );
    process.exit(1);
  }

  const { renderRoute } = await import(pathToFileURL(ssrEntryPath).href);
  const template = fs.readFileSync(templatePath, "utf8");

  let ok = 0;
  const failures = [];
  for (const routePath of STATIC_ROUTES) {
    try {
      const appHtml = renderRoute(routePath);
      if (!template.includes(ROOT_DIV)) {
        throw new Error(`El template ${path.relative(root, templatePath)} no contiene ${JSON.stringify(ROOT_DIV)} — ¿cambió el HTML que emite Vite?`);
      }
      const page = template.replace(ROOT_DIV, `<div id="root">${appHtml}</div>`);
      const outPath = outputPathFor(routePath);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, page);
      ok += 1;
    } catch (err) {
      failures.push({ routePath, message: err instanceof Error ? err.message : String(err) });
    }
  }

  for (const f of failures) {
    console.error(`[prerender] FALLÓ ${f.routePath}: ${f.message}`);
  }
  console.log(`[prerender] OK — ${ok}/${STATIC_ROUTES.length} rutas prerenderizadas.`);

  fs.rmSync(path.join(root, "dist-ssr"), { recursive: true, force: true });

  if (ok === 0) {
    console.error("[prerender] Ninguna ruta se pudo prerenderizar — algo está roto en entry-server.tsx o App.tsx bajo SSR.");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
