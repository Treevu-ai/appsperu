import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppKey } from "./apps.js";

/**
 * CX-15 (docs/PRD_Consolidacion_Logica_Compartida_y_Rigor_Temporal_v1.md): deriva los endpoints
 * `GET` reales de una app directamente de `app.ts` + `routes/*.ts`, en vez de una lista
 * mantenida a mano — mismo patrón de "parsear como texto" que ya usa `mcp-server/src/search.ts`
 * sobre `catalog.ts` (evita arrastrar Express como dependencia de `mcp-server` solo para introspección).
 */

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../");

function read(filePath: string): string | null {
  return existsSync(filePath) ? readFileSync(filePath, "utf8").replace(/\r\n/g, "\n") : null;
}

/** Reduce cualquier segmento de parámetro (`:ocid`, `:kind(a|b|c)`, `{ocid}`) a un token fijo —
 *  el nombre del parámetro puede diferir legítimamente entre la ruta Express y el `pathTemplate`
 *  del catálogo (ver `providerId` vs. `:provider_id`), así que no debe afectar la comparación. */
export function normalizeExpressPath(p: string): string {
  let s = p.replace(/:(\w+)\([^)]*\)/g, ":param").replace(/:\w+/g, ":param");
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s === "" ? "/" : s;
}

/** Igual que `normalizeExpressPath` pero para el `pathTemplate` del catálogo: acepta las dos
 *  sintaxis que se usan en `TOOL_CATALOG` — `{ocid}` (la mayoritaria) y `:ocid` (Express). Sin
 *  esto, una entrada escrita en sintaxis Express nunca casaba con su ruta real y CX-15 reportaba
 *  un tool faltante que en realidad ya estaba registrado. */
export function normalizeCatalogPath(p: string): string {
  let s = p.replace(/\{[^}]+\}/g, ":param").replace(/:(\w+)\([^)]*\)/g, ":param").replace(/:\w+/g, ":param");
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s === "" ? "/" : s;
}

function joinPath(prefix: string, routePath: string): string {
  if (routePath === "/") return prefix;
  const p = prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
  const r = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return `${p}${r}`;
}

function extractGetPaths(source: string): string[] {
  const re = /\.get\(\s*"([^"]*)"/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) out.push(m[1]);
  return out;
}

/**
 * Lee los paths `GET` de un archivo `routes/<file>.ts`. Si el archivo no declara ninguno
 * directamente, sigue su import local (patrón factory — ver
 * `apps/actividad-agraria/api/src/routes/wage.ts`, que re-exporta un router construido por
 * `createRegionalMonthlyRouter()` en `regional-monthly.ts`) y lee los paths reales ahí.
 */
function routesDirGetPaths(routesDir: string, file: string, seen: Set<string> = new Set()): string[] {
  if (seen.has(file)) return [];
  seen.add(file);
  const src = read(path.join(routesDir, `${file}.ts`));
  if (!src) return [];
  const direct = extractGetPaths(src);
  if (direct.length > 0) return direct;
  const importMatch = src.match(/from\s+"\.\/([\w.-]+)\.js"/);
  return importMatch ? routesDirGetPaths(routesDir, importMatch[1], seen) : [];
}

/**
 * Devuelve los paths `GET` reales y montados de una app (`/api/...`, ya combinados con el
 * prefijo de `app.use`), o `null` si no se pudo leer `app.ts` (app sin API, o ruta movida).
 */
export function getRealRoutesForApp(app: AppKey): string[] | null {
  const appDir = path.join(REPO_ROOT, "apps", app, "api", "src");
  const appTs = read(path.join(appDir, "app.ts"));
  if (!appTs) return null;

  // Acepta `import { aRouter } from "./routes/x.js"` y también varios en la misma
  // sentencia (`import { aRouter, bRouter } from "./routes/x.js"`), que es como
  // seguridad-ciudadana monta dos routers desde un mismo archivo. Antes solo
  // reconocía el primer nombre y la app entera aparecía sin rutas.
  const importRe = /import\s+(?:\{\s*([^}]*?)\s*\}|(?:\*\s+as\s+)?(\w+))\s+from\s+"\.\/routes\/([\w.-]+)\.js";/g;
  const varToFile = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(appTs))) {
    const file = m[3];
    const names = m[1] !== undefined ? m[1].split(",") : [m[2]];
    for (const raw of names) {
      const varName = raw.trim().split(/\s+as\s+/).pop()?.trim();
      if (varName) varToFile.set(varName, file);
    }
  }

  const mountRe = /app\.use\(\s*"([^"]+)"\s*,\s*(\w+)\s*\)/g;
  const routesDir = path.join(appDir, "routes");
  const routes = new Set<string>();
  while ((m = mountRe.exec(appTs))) {
    const [, prefix, varName] = m;
    const file = varToFile.get(varName);
    if (!file) continue; // no es un router importado (ej. apiRateLimit, errorHandler)
    for (const getPath of routesDirGetPaths(routesDir, file)) {
      routes.add(normalizeExpressPath(joinPath(prefix, getPath)));
    }
  }
  return [...routes];
}
