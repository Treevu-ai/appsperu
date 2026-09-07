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

// URLs estáticas servidas por public/ que NO son una <Route> de App.tsx —
// no las descubre STATIC_ROUTES, se listan a mano acá.
const EXTRA_SITEMAP_URLS = ["/citar-rastro.md"];

// Prioridad/frecuencia por ruta — el resto usa el default. Refleja qué tan
// seguido cambia el contenido real de cada vista, no un valor arbitrario.
const SITEMAP_PRIORITY = {
  "/": "1.0",
  "/gore/la-libertad/ficha": "0.9",
  "/gore/la-libertad/comparativo": "0.8",
  "/gore/la-libertad/benchmark": "0.8",
  "/estado": "0.7",
  "/docs/api": "0.6",
  "/buscar": "0.5",
};
const SITEMAP_CHANGEFREQ = {
  "/": "weekly",
  "/gore/la-libertad/ficha": "weekly",
  "/gore/la-libertad/comparativo": "weekly",
  "/gore/la-libertad/benchmark": "weekly",
  "/estado": "daily",
  "/docs/api": "monthly",
};
const DEFAULT_PRIORITY = "0.5";
const DEFAULT_CHANGEFREQ = "monthly";

/**
 * Genera sitemap.xml desde STATIC_ROUTES en vez de mantenerlo a mano — el
 * anterior (público, hardcodeado) declaraba 8 URLs mientras App.tsx ya tenía
 * 15 rutas reales. Ahora es imposible que sitemap.xml y App.tsx diverjan sin
 * que el test de src/__tests__/prerender-routes.test.ts lo detecte primero
 * (STATIC_ROUTES es la misma lista que usa esa guardia).
 */
function buildSitemap(routes) {
  const urls = [...routes, ...EXTRA_SITEMAP_URLS];
  const items = urls
    .map((routePath) => {
      const loc = `https://www.rastro.fyi${routePath}`;
      const changefreq = SITEMAP_CHANGEFREQ[routePath] ?? DEFAULT_CHANGEFREQ;
      const priority = SITEMAP_PRIORITY[routePath] ?? DEFAULT_PRIORITY;
      return `  <url>\n    <loc>${loc}</loc>\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`;
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

  const sitemapPath = path.join(distDir, "sitemap.xml");
  fs.writeFileSync(sitemapPath, buildSitemap(STATIC_ROUTES));
  console.log(`[prerender] sitemap.xml regenerado con ${STATIC_ROUTES.length + EXTRA_SITEMAP_URLS.length} URLs.`);

  fs.rmSync(path.join(root, "dist-ssr"), { recursive: true, force: true });

  if (ok === 0) {
    console.error("[prerender] Ninguna ruta se pudo prerenderizar — algo está roto en entry-server.tsx o App.tsx bajo SSR.");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
