import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STATIC_ROUTES } from "../../scripts/prerender.mjs";

/**
 * Guardia contra el mismo tipo de drift silencioso que R1 cerró para
 * apps/tools (ver docs/normas/... o el diagnóstico "Rastro Ledger"):
 * `STATIC_ROUTES` en scripts/prerender.mjs se mantiene a mano — si App.tsx
 * gana o pierde una ruta estática sin actualizar esa lista, este test falla
 * en vez de dejar que el prerender sirva de menos (o intente de más) en
 * silencio.
 */
const appTsxPath = fileURLToPath(new URL("../App.tsx", import.meta.url));
const appSource = readFileSync(appTsxPath, "utf8");

// App.tsx tiene un solo nivel de anidación (el layout "gore/la-libertad" con
// sus 3 rutas hijas relativas) — se resuelve ese bloque a paths absolutos por
// separado del resto, que son todas rutas de nivel superior ya absolutas.
function extractStaticRoutePaths(source: string): string[] {
  const paths: string[] = [];

  const nestedBlockMatch = source.match(/<Route path="([^"]+)" element=\{<\w+ \/>\}>([\s\S]*?)\n {8}<\/Route>/);
  if (!nestedBlockMatch) {
    throw new Error("No se encontró el bloque de rutas anidadas de gore/la-libertad en App.tsx — ¿cambió la estructura?");
  }
  const [fullBlock, parentPath, blockBody] = nestedBlockMatch;
  for (const m of blockBody.matchAll(/<Route\s+path="([^"]+)"/g)) {
    paths.push(`${parentPath}/${m[1]}`);
  }

  const rest = source.replace(fullBlock, "");
  for (const m of rest.matchAll(/<Route\s+path="([^"]+)"/g)) {
    const routePath = m[1];
    if (routePath.includes(":") || routePath === "*") continue; // dinámica o catch-all — fuera de alcance
    paths.push(routePath);
  }
  return paths;
}

describe("STATIC_ROUTES vs App.tsx", () => {
  it("incluye la ruta raíz (index route de Home)", () => {
    expect(appSource).toMatch(/<Route\s+index\s+element=\{<Home\s*\/>\}/);
    expect(STATIC_ROUTES).toContain("/");
  });

  it("tiene una entrada por cada <Route path=\"...\"> estático real de App.tsx", () => {
    const realStaticPaths = extractStaticRoutePaths(appSource).map((p) => `/${p}`);
    const nonRootStaticRoutes = STATIC_ROUTES.filter((r) => r !== "/");

    for (const routePath of realStaticPaths) {
      expect(nonRootStaticRoutes).toContain(routePath);
    }
    for (const routePath of nonRootStaticRoutes) {
      expect(realStaticPaths).toContain(routePath);
    }
  });

  it("no incluye ninguna ruta dinámica (con :param) ni el catch-all", () => {
    for (const routePath of STATIC_ROUTES) {
      expect(routePath).not.toMatch(/:/);
      expect(routePath).not.toBe("*");
    }
  });
});
