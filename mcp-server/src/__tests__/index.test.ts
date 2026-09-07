import { describe, expect, it, vi } from "vitest";
import { buildPath, buildQuery, findTool, invokeTool, runRastroLlamar } from "../index.js";
import { TOOL_CATALOG, type ToolSpec } from "../catalog.js";
import { z } from "zod";

function makeTool(overrides: Partial<ToolSpec> = {}): ToolSpec {
  return {
    name: "test_tool",
    app: "renamu",
    description: "test",
    pathTemplate: "/api/recurso",
    pathParams: [],
    querySchema: {},
    ...overrides,
  };
}

describe("buildQuery", () => {
  it("passes through a plain string filter", () => {
    const tool = makeTool({ querySchema: { departamento: z.string().optional() } });
    expect(buildQuery(tool, { departamento: "LA LIBERTAD" })).toEqual({ departamento: "LA LIBERTAD" });
  });

  it("does not silently drop a z.coerce.number() filter sent as a JS number", () => {
    // Regresión: varias tools (renamu_municipalidades, residuos_solidos_residuos,
    // autoridades_electas_autoridades, etc.) declaran querySchema con z.coerce.number() — el
    // cliente MCP envía el tipo declarado (number), no un string. Antes de este fix,
    // `typeof value === "string"` fallaba y el filtro se descartaba sin ningún error visible.
    const tool = makeTool({ querySchema: { anio: z.coerce.number().int().optional() } });
    expect(buildQuery(tool, { anio: 2025 })).toEqual({ anio: "2025" });
  });

  it("does not silently drop a z.coerce.boolean() filter sent as a JS boolean", () => {
    const tool = makeTool({ querySchema: { estricto: z.coerce.boolean().optional() } });
    expect(buildQuery(tool, { estricto: true })).toEqual({ estricto: "true" });
  });

  it("omits a filter that was not provided", () => {
    const tool = makeTool({ querySchema: { anio: z.coerce.number().optional() } });
    expect(buildQuery(tool, {})).toEqual({ anio: undefined });
  });
});

describe("buildPath", () => {
  it("substitutes a required path param", () => {
    const tool = makeTool({ pathTemplate: "/api/execution/{entityCode}", pathParams: ["entityCode"] });
    expect(buildPath(tool, { entityCode: "M-123" })).toBe("/api/execution/M-123");
  });

  it("throws with an actionable message when a required path param is missing", () => {
    const tool = makeTool({ pathTemplate: "/api/execution/{entityCode}", pathParams: ["entityCode"] });
    expect(() => buildPath(tool, {})).toThrow(/entityCode/);
  });
});

describe("findTool", () => {
  it("finds a real tool from the catalog by its exact name", () => {
    const [first] = TOOL_CATALOG;
    expect(findTool(first.name)).toEqual(first);
  });

  it("returns undefined for a name not in the catalog", () => {
    expect(findTool("no_existe_este_tool")).toBeUndefined();
  });
});

describe("invokeTool", () => {
  it("returns the API body pass-through on a successful call", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ ok: true }) })
    );
    const tool = makeTool({ pathTemplate: "/api/recurso", pathParams: [] });
    const result = await invokeTool(tool, {});
    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('"ok": true');
    vi.unstubAllGlobals();
  });

  it("marks a 5xx response as isError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 503, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ error: "down" }) })
    );
    const tool = makeTool({ pathTemplate: "/api/recurso", pathParams: [] });
    const result = await invokeTool(tool, {});
    expect(result.isError).toBe(true);
    vi.unstubAllGlobals();
  });

  it("does not mark a domain 404 as isError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 404, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ error: "no encontrado" }) })
    );
    const tool = makeTool({ pathTemplate: "/api/recurso", pathParams: [] });
    const result = await invokeTool(tool, {});
    expect(result.isError).toBe(false);
    vi.unstubAllGlobals();
  });

  it("reports a missing required path param as isError instead of throwing", async () => {
    const tool = makeTool({ pathTemplate: "/api/execution/{entityCode}", pathParams: ["entityCode"] });
    const result = await invokeTool(tool, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/entityCode/);
  });
});

describe("runRastroLlamar", () => {
  it("returns an actionable error for a tool name not in the catalog", async () => {
    const result = await runRastroLlamar("no_existe_este_tool");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/No existe un tool llamado "no_existe_este_tool"/);
    expect(result.content[0].text).toMatch(/rastro_buscar_tools/);
  });

  it("invokes a real catalog tool by exact name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ ok: true }) })
    );
    const [first] = TOOL_CATALOG;
    const result = await runRastroLlamar(first.name, {});
    expect(result.isError).toBe(false);
    vi.unstubAllGlobals();
  });
});
