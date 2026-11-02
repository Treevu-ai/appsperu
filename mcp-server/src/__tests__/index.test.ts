import { describe, expect, it, vi } from "vitest";
import { buildPath, buildQuery, emitTelemetry, findTool, invokeTool, mcpServerEnvFile, resolveStdioEnv, runRastroLlamar, type ToolTelemetryEvent, validateArgs } from "../index.js";
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

describe("validateArgs", () => {
  it("rejects a value outside an enum instead of silently dropping it", () => {
    const tool = makeTool({ querySchema: { estado: z.enum(["PENDING", "REVIEWED"]).optional() } });
    const result = validateArgs(tool, { estado: "NO_EXISTE" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([expect.objectContaining({ campo: "estado" })]);
    }
  });

  it("rejects a limit above its declared .max()", () => {
    const tool = makeTool({ querySchema: { limit: z.coerce.number().int().min(1).max(500).optional() } });
    const result = validateArgs(tool, { limit: 999999 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].campo).toBe("limit");
    }
  });

  it("rejects a missing required query field", () => {
    const tool = makeTool({ querySchema: { ruc: z.string().regex(/^\d{8,11}$/) } });
    const result = validateArgs(tool, {});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0].campo).toBe("ruc");
    }
  });

  it("accepts and coerces a valid value", () => {
    const tool = makeTool({ querySchema: { anio: z.coerce.number().int().optional() } });
    const result = validateArgs(tool, { anio: 2025 });
    expect(result).toEqual({ ok: true, data: { anio: 2025 } });
  });

  it("accepts an empty args object when the tool has no query fields", () => {
    const tool = makeTool({ querySchema: {} });
    expect(validateArgs(tool, {})).toEqual({ ok: true, data: {} });
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

  it("geo_intersections_minero sustituye codigou (no deja ':codigou' literal)", () => {
    const tool = findTool("geo_intersections_minero");
    expect(tool).toBeDefined();
    const path = buildPath(tool!, { codigou: "010012345" });
    expect(path).not.toContain(":codigou");
    expect(path).toBe("/api/cruce/minero/010012345");
  });

  it("geo_intersections_forestal sustituye capa y objectid (no deja ':capa'/':objectid' literales)", () => {
    const tool = findTool("geo_intersections_forestal");
    expect(tool).toBeDefined();
    const path = buildPath(tool!, { capa: "concesiones", objectid: "42" });
    expect(path).not.toContain(":capa");
    expect(path).not.toContain(":objectid");
    expect(path).toBe("/api/cruce/forestal/concesiones/42");
  });

  it("ningún pathTemplate del catálogo usa parámetros estilo Express (/:param) — buildPath solo reemplaza {param}", () => {
    const offenders = TOOL_CATALOG.filter((t) => /\/:[A-Za-z_]/.test(t.pathTemplate)).map(
      (t) => `${t.name}: ${t.pathTemplate}`,
    );
    expect(offenders).toEqual([]);
  });

  it("todo pathParam declarado aparece como {param} en su pathTemplate, y buildPath no deja placeholders", () => {
    for (const tool of TOOL_CATALOG) {
      for (const param of tool.pathParams) {
        expect(tool.pathTemplate, `${tool.name} debe contener {${param}}`).toContain(`{${param}}`);
      }
      const args = Object.fromEntries(tool.pathParams.map((p) => [p, "valor"]));
      const path = buildPath(tool, args);
      expect(path, tool.name).not.toMatch(/\{[^}]+\}|\/:[A-Za-z_]/);
    }
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

  it("reports an invalid query arg as isError instead of forwarding it to the API", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const tool = makeTool({ querySchema: { limit: z.coerce.number().int().max(500).optional() } });
    const result = await invokeTool(tool, { limit: 999999 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/limit/);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("reports a missing required query arg as isError instead of forwarding without it", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const tool = makeTool({ querySchema: { ruc: z.string().regex(/^\d{8,11}$/) } });
    const result = await invokeTool(tool, {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/ruc/);
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("fires telemetry with the tool name, app, and isError on a successful call, without changing the result", async () => {
    vi.stubEnv("HERMES_INGEST_URL", "http://localhost:4000/ingest");
    vi.stubEnv("HERMES_INGEST_TOKEN", "test-token");
    const telemetryFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", telemetryFetch);
    // The HTTP-proxy call inside invokeTool and the telemetry POST both go
    // through the same stubbed global fetch here — distinguish by call order:
    // call[0] is the tool's own HTTP-proxy request, call[1] is telemetry.
    telemetryFetch
      .mockResolvedValueOnce({ status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true });

    const tool = makeTool({ name: "test_tool", app: "renamu", pathTemplate: "/api/recurso", pathParams: [] });
    const result = await invokeTool(tool, { filtro: "x" });

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('"ok": true');
    expect(telemetryFetch).toHaveBeenCalledTimes(2);
    const [telemetryUrl, telemetryInit] = telemetryFetch.mock.calls[1];
    expect(telemetryUrl).toBe("http://localhost:4000/ingest");
    const payload = JSON.parse(telemetryInit.body);
    expect(payload.tool).toBe("test_tool");
    expect(payload.app).toBe("renamu");
    expect(payload.isError).toBe(false);
    expect(payload.args).toEqual({ filtro: "x" });
    expect(typeof payload.durationMs).toBe("number");
    expect(payload.resultSummary.bytes).toBeGreaterThan(0);

    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fires telemetry with isError true when the call fails, without changing the result", async () => {
    vi.stubEnv("HERMES_INGEST_URL", "http://localhost:4000/ingest");
    vi.stubEnv("HERMES_INGEST_TOKEN", "test-token");
    const telemetryFetch = vi.fn();
    telemetryFetch
      .mockResolvedValueOnce({ status: 503, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ error: "down" }) })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal("fetch", telemetryFetch);

    const tool = makeTool({ name: "test_tool", app: "renamu", pathTemplate: "/api/recurso", pathParams: [] });
    const result = await invokeTool(tool, {});

    expect(result.isError).toBe(true);
    const payload = JSON.parse(telemetryFetch.mock.calls[1][1].body);
    expect(payload.isError).toBe(true);

    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does not call fetch for telemetry when HERMES_INGEST_URL is unset (existing tests' default env)", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchSpy);

    const tool = makeTool({ pathTemplate: "/api/recurso", pathParams: [] });
    await invokeTool(tool, {});

    // Only the tool's own HTTP-proxy call — no second (telemetry) call.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("still returns the tool's result even when the telemetry POST rejects", async () => {
    vi.stubEnv("HERMES_INGEST_URL", "http://localhost:4000/ingest");
    vi.stubEnv("HERMES_INGEST_TOKEN", "test-token");
    const telemetryFetch = vi.fn();
    telemetryFetch
      .mockResolvedValueOnce({ status: 200, headers: new Headers({ "content-type": "application/json" }), json: async () => ({ ok: true }) })
      .mockRejectedValueOnce(new Error("ingest down"));
    vi.stubGlobal("fetch", telemetryFetch);

    const tool = makeTool({ pathTemplate: "/api/recurso", pathParams: [] });
    const result = await invokeTool(tool, {});

    expect(result.isError).toBe(false);
    expect(result.content[0].text).toContain('"ok": true');

    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});

describe("emitTelemetry", () => {
  const sampleEvent: ToolTelemetryEvent = {
    tool: "test_tool",
    app: "renamu",
    durationMs: 12.5,
    isError: false,
    args: { departamento: "LA LIBERTAD" },
    resultSummary: { bytes: 42, rows: 3 },
  };

  it("does nothing when HERMES_INGEST_URL is not set", () => {
    vi.stubEnv("HERMES_INGEST_URL", "");
    vi.stubEnv("HERMES_INGEST_TOKEN", "test-token");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    emitTelemetry(sampleEvent);

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does nothing when HERMES_INGEST_TOKEN is not set", () => {
    vi.stubEnv("HERMES_INGEST_URL", "http://localhost:4000/ingest");
    vi.stubEnv("HERMES_INGEST_TOKEN", "");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    emitTelemetry(sampleEvent);

    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("posts the event with the token header when both env vars are set", () => {
    vi.stubEnv("HERMES_INGEST_URL", "http://localhost:4000/ingest");
    vi.stubEnv("HERMES_INGEST_TOKEN", "test-token");
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchSpy);

    emitTelemetry(sampleEvent);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("http://localhost:4000/ingest");
    expect(init.method).toBe("POST");
    expect(init.headers["x-ingest-token"]).toBe("test-token");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body)).toEqual(sampleEvent);
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does not throw when the fetch rejects", async () => {
    vi.stubEnv("HERMES_INGEST_URL", "http://localhost:4000/ingest");
    vi.stubEnv("HERMES_INGEST_TOKEN", "test-token");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    expect(() => emitTelemetry(sampleEvent)).not.toThrow();
    // let the rejected promise's .catch() settle before the test ends
    await new Promise((resolve) => setTimeout(resolve, 0));

    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});

describe("runRastroLlamar", () => {
  it("returns an actionable error for a tool name not in the catalog", async () => {
    const result = await runRastroLlamar(undefined, "no_existe_este_tool");
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
    const result = await runRastroLlamar(undefined, first.name, {});
    expect(result.isError).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe("resolveStdioEnv", () => {
  it("sin NEON_DATABASE_URL no pasa env: el fallback HTTP a los Express locales queda intacto", () => {
    expect(resolveStdioEnv({ PATH: "x" } as never)).toBeUndefined();
  });

  it("con NEON_DATABASE_URL pasa el entorno para que los handlers corran contra Neon (paridad Worker)", () => {
    const env = resolveStdioEnv({ NEON_DATABASE_URL: "postgres://x/y", MCP_API_KEY: "k" } as never);
    expect(env).toMatchObject({ NEON_DATABASE_URL: "postgres://x/y" });
  });

  it("resuelve el .env del paquete aunque el cwd sea la raíz del repo", () => {
    const desdeSrc = mcpServerEnvFile("file:///C:/repo/mcp-server/src/index.ts");
    const desdeDist = mcpServerEnvFile("file:///C:/repo/mcp-server/dist/index.js");
    expect(desdeSrc.replaceAll("\\", "/")).toBe("C:/repo/mcp-server/.env");
    expect(desdeDist.replaceAll("\\", "/")).toBe("C:/repo/mcp-server/.env");
  });

});
