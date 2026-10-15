import { describe, expect, it } from "vitest";
import { TOOL_CATALOG } from "../catalog.js";
import { APP_KEYS, type AppKey } from "../apps.js";
import { getRealRoutesForApp, normalizeCatalogPath } from "../route-introspection.js";

/**
 * CX-15 (docs/PRD_Consolidacion_Logica_Compartida_y_Rigor_Temporal_v1.md) — complementa
 * `catalog.test.ts` (`EXPECTED_TOOLS_BY_APP`, que solo detecta si el catálogo se desincroniza
 * de sí mismo: un tool renombrado/borrado sin querer). Este test compara contra las rutas
 * Express reales de cada app, para detectar el caso que `EXPECTED_TOOLS_BY_APP` no puede: un
 * endpoint real que nunca tuvo tool, o un tool que ya no corresponde a ningún endpoint real —
 * exactamente el gap de 20 endpoints de `compras-publicas` que motivó este ticket (ver PR #99).
 *
 * EXCEPCIÓN EXPLÍCITA Y CERRADA — `MCP_ONLY_PATHS`: desde 2026-10-14 existen tools que se
 * sirven SOLO por el Worker MCP contra Neon, sin ruta Express equivalente, porque la fuente
 * no tiene app (solo conector CLI + handler + catálogo — ver `src/ingest/`). Cada path de esa
 * lista está declarado acá con su app; la lista está versionada como cualquier otro código y
 * el primer test de este archivo verifica en ambos sentidos que la lista es EXACTAMENTE el
 * conjunto de paths del catálogo sin ruta Express real: agregar un tool sin Express y sin
 * anotarlo acá rompe el test, y anotar un path que ya no existe en el catálogo también.
 * Nada queda exento en silencio.
 */
const MCP_ONLY_PATHS: Partial<Record<AppKey, string[]>> = {
  // MINCETUR "Comercio Exterior de Bienes" (src/ingest/mincetur-comercio-bienes.ts)
  "sunat-aduanas": ["/api/comercio-bienes", "/api/comercio-bienes/meta"],
  // UN Comtrade + Banco Mundial WDI (src/ingest/comtrade-benchmark.ts, src/ingest/wdi-contexto.ts)
  "bcrp-comercio-exterior": ["/api/comtrade", "/api/wdi", "/api/wdi/indicadores"],
  // MIDAGRI/Agromercado, Planes de Articulación Comercial (src/ingest/agromercado-articulacion.ts)
  "actividad-agraria": ["/api/agromercado-articulacion"],
};

describe("catálogo MCP vs. rutas Express reales (CX-15)", () => {
  it("MCP_ONLY_PATHS es exactamente el conjunto de tools del catálogo sin ruta Express real", () => {
    // --- del lado del catálogo: todo path sin Express debe estar en la lista ---
    for (const app of APP_KEYS) {
      const realRoutes = getRealRoutesForApp(app);
      expect(realRoutes, `No se pudo leer apps/${app}/api/src/app.ts`).not.toBeNull();
      const realSet = new Set(realRoutes ?? []);
      const exempt = new Set((MCP_ONLY_PATHS[app] ?? []).map(normalizeCatalogPath));

      const catalogPaths = TOOL_CATALOG.filter((tool) => tool.app === app).map((tool) =>
        normalizeCatalogPath(tool.pathTemplate)
      );
      const sinExpress = catalogPaths.filter((p) => !realSet.has(p) && !exempt.has(p));
      expect(
        sinExpress.map((p) => TOOL_CATALOG.find((t) => t.app === app && normalizeCatalogPath(t.pathTemplate) === p)?.name ?? p),
        `Tools de "${app}" sin ruta Express real y sin declarar en MCP_ONLY_PATHS`
      ).toEqual([]);
    }

    // --- del lado de la lista: toda entrada debe existir en el catálogo de esa app ---
    for (const [app, paths] of Object.entries(MCP_ONLY_PATHS)) {
      const catalogPaths = new Set(
        TOOL_CATALOG.filter((tool) => tool.app === app).map((tool) => normalizeCatalogPath(tool.pathTemplate))
      );
      for (const p of paths ?? []) {
        expect(
          catalogPaths.has(normalizeCatalogPath(p)),
          `MCP_ONLY_PATHS declara "${p}" para "${app}" pero ese path no está en el catálogo`
        ).toBe(true);
      }
    }
  });

  for (const app of APP_KEYS) {
    it(`"${app}": cada endpoint GET real tiene tool, y cada tool corresponde a un endpoint real o a MCP_ONLY_PATHS`, () => {
      const realRoutes = getRealRoutesForApp(app);
      expect(realRoutes, `No se pudo leer apps/${app}/api/src/app.ts`).not.toBeNull();

      const exempt = new Set((MCP_ONLY_PATHS[app] ?? []).map(normalizeCatalogPath));

      const catalogPaths = new Set(
        TOOL_CATALOG.filter((tool) => tool.app === app).map((tool) => normalizeCatalogPath(tool.pathTemplate))
      );
      const realSet = new Set(realRoutes ?? []);

      const missingTools = [...realSet].filter((route) => !catalogPaths.has(route)).sort();
      const orphanTools = [...catalogPaths].filter((route) => !realSet.has(route) && !exempt.has(route)).sort();

      expect(missingTools, `Endpoint(s) GET real(es) de "${app}" sin tool MCP: ${missingTools.join(", ")}`).toEqual([]);
      expect(orphanTools, `Tool(s) MCP de "${app}" sin endpoint GET real ni entrada en MCP_ONLY_PATHS: ${orphanTools.join(", ")}`).toEqual([]);
    });
  }
});
