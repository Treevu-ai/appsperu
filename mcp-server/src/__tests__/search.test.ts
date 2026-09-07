import { describe, expect, it } from "vitest";
import { z } from "zod";
import { searchTools } from "../search.js";
import type { ToolSpec } from "../catalog.js";

const CATALOG: ToolSpec[] = [
  {
    name: "infobras_public_works",
    app: "infobras",
    description: "Lista de obras públicas registradas en INFOBRAS.",
    pathTemplate: "/api/public-works",
    pathParams: [],
    querySchema: { departamento: z.string().optional() },
  },
  {
    name: "infobras_public_work_by_codigo",
    app: "infobras",
    description: "Detalle de una obra pública por su código CUI.",
    pathTemplate: "/api/public-works/{codigo}",
    pathParams: ["codigo"],
    querySchema: {},
  },
  {
    name: "radar_ejecucion_execution",
    app: "radar-ejecucion",
    description: "Ejecución presupuestal (PIA/PIM/Devengado) por entidad.",
    pathTemplate: "/api/execution",
    pathParams: [],
    querySchema: { anio: z.coerce.number().optional() },
  },
];

describe("searchTools", () => {
  it("matches by a keyword present in the description", () => {
    const results = searchTools(CATALOG, "presupuestal");
    expect(results.map((r) => r.name)).toEqual(["radar_ejecucion_execution"]);
  });

  it("matches by a keyword present in the tool name", () => {
    const results = searchTools(CATALOG, "public_work");
    expect(results.map((r) => r.name)).toEqual(["infobras_public_works", "infobras_public_work_by_codigo"]);
  });

  it("requires every word to match (AND, not OR)", () => {
    const results = searchTools(CATALOG, "obra codigo");
    expect(results.map((r) => r.name)).toEqual(["infobras_public_work_by_codigo"]);
  });

  it("scopes results to a single app when provided", () => {
    const results = searchTools(CATALOG, "", "infobras");
    expect(results.map((r) => r.name)).toEqual(["infobras_public_works", "infobras_public_work_by_codigo"]);
  });

  it("combines an app filter with a keyword filter", () => {
    const results = searchTools(CATALOG, "codigo", "radar-ejecucion");
    expect(results).toEqual([]);
  });

  it("returns an empty query as a no-op text filter (lists everything in scope)", () => {
    const results = searchTools(CATALOG, "   ");
    expect(results).toHaveLength(CATALOG.length);
  });

  it("caps results at the given limit", () => {
    const results = searchTools(CATALOG, "", undefined, 1);
    expect(results).toHaveLength(1);
  });

  it("exposes pathParams and queryParams for a matched tool", () => {
    const [result] = searchTools(CATALOG, "codigo");
    expect(result).toEqual({
      name: "infobras_public_work_by_codigo",
      app: "infobras",
      description: "Detalle de una obra pública por su código CUI.",
      pathParams: ["codigo"],
      queryParams: [],
    });
  });
});
