import { describe, expect, it } from "vitest";
import { buildPath, buildQuery } from "../index.js";
import type { ToolSpec } from "../catalog.js";
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
