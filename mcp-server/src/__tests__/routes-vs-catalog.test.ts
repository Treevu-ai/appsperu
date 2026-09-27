import { describe, expect, it } from "vitest";
import { TOOL_CATALOG } from "../catalog.js";
import { APP_KEYS } from "../apps.js";
import { getRealRoutesForApp, normalizeCatalogPath } from "../route-introspection.js";

/**
 * CX-15 (docs/PRD_Consolidacion_Logica_Compartida_y_Rigor_Temporal_v1.md) — complementa
 * `catalog.test.ts` (`EXPECTED_TOOLS_BY_APP`, que solo detecta si el catálogo se desincroniza
 * de sí mismo: un tool renombrado/borrado sin querer). Este test compara contra las rutas
 * Express reales de cada app, para detectar el caso que `EXPECTED_TOOLS_BY_APP` no puede: un
 * endpoint real que nunca tuvo tool, o un tool que ya no corresponde a ningún endpoint real —
 * exactamente el gap de 20 endpoints de `compras-publicas` que motivó este ticket (ver PR #99).
 */
describe("catálogo MCP vs. rutas Express reales (CX-15)", () => {
  for (const app of APP_KEYS) {
    it(`"${app}": cada endpoint GET real tiene tool, y cada tool corresponde a un endpoint real`, () => {
      const realRoutes = getRealRoutesForApp(app);
      expect(realRoutes, `No se pudo leer apps/${app}/api/src/app.ts`).not.toBeNull();

      const catalogPaths = new Set(
        TOOL_CATALOG.filter((tool) => tool.app === app).map((tool) => normalizeCatalogPath(tool.pathTemplate))
      );
      const realSet = new Set(realRoutes ?? []);

      const missingTools = [...realSet].filter((route) => !catalogPaths.has(route)).sort();
      const orphanTools = [...catalogPaths].filter((route) => !realSet.has(route)).sort();

      expect(missingTools, `Endpoint(s) GET real(es) de "${app}" sin tool MCP: ${missingTools.join(", ")}`).toEqual([]);
      expect(orphanTools, `Tool(s) MCP de "${app}" sin endpoint GET real: ${orphanTools.join(", ")}`).toEqual([]);
    });
  }
});
