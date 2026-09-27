/**
 * Tests para la vista compuesta riesgo-territorial.
 *
 * Escenario:
 * - 4 tools del catálogo son llamadas internamente por runRiesgoTerritorial
 * - Cada una puede fallar o responder independientemente
 * - El resumen se calcula a partir de las respuestas (o valores por defecto si fallan)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { runRiesgoTerritorial } from "../tools/riesgo-territorial.js";
import * as index from "../index.js";

// Mock completo de las funciones del módulo index.js
vi.mock("../index.js", () => ({
  findTool: vi.fn(),
  invokeTool: vi.fn(),
}));

const { findTool, invokeTool } = vi.mocked(index);

beforeEach(() => {
  vi.clearAllMocks();
});

/** Helper: construye un mock de tool en el catálogo. */
function mockTool(name: string) {
  return {
    name,
    app: "test" as const,
    description: "test",
    pathTemplate: `/api/${name}`,
    pathParams: [],
    querySchema: {},
  };
}

/** Helper: mock de respuesta exitosa de invokeTool (respuesta JSON). */
function mockInvokeSuccess(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    isError: false,
  };
}

/** Helper: mock de respuesta de error de invokeTool. */
function mockInvokeError(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

describe("runRiesgoTerritorial", () => {
  // ---- helpers de setup ----

  function setupAllToolsSuccess() {
    findTool.mockImplementation((name: string) => mockTool(name));

    invokeTool
      .mockResolvedValueOnce(
        mockInvokeSuccess({ data: [{ ruc: "20123456789" }, { ruc: "20123456790" }] })
      )
      .mockResolvedValueOnce(mockInvokeSuccess({ items: [{ id: 1 }, { id: 2 }, { id: 3 }] }))
      .mockResolvedValueOnce(mockInvokeSuccess({ nivel: "ALTO" }))
      .mockResolvedValueOnce(mockInvokeSuccess({ emergencias: [{ id: 1 }] }));
  }

  function setupToolNotFound(toolName: string) {
    findTool.mockImplementation((name: string) => {
      if (name === toolName) return undefined;
      return mockTool(name);
    });
    // Los invokes que no encuentren tool no se ejecutan porque findTool ya falló
  }

  // ---- tests ----

  it("todas las 4 tools responden → todas en fuentesRespondidas, ninguna en fuentesFallidas", async () => {
    setupAllToolsSuccess();

    const result = await runRiesgoTerritorial({ departamento: "13" });

    expect(result.metadata.fuentesRespondidas).toContain("territorio_inteligencia_captura_territorio");
    expect(result.metadata.fuentesRespondidas).toContain("geo_intersections_reporte");
    expect(result.metadata.fuentesRespondidas).toContain("territorio_inteligencia_riesgo_eudr");
    expect(result.metadata.fuentesRespondidas).toContain("emergencias_indeci_preparacion_riesgo");
    expect(result.metadata.fuentesFallidas).toHaveLength(0);
  });

  it("una tool falla → en fuentesFallidas, las demás en fuentesRespondidas", async () => {
    findTool.mockImplementation((name: string) => mockTool(name));

    // geo_intersections_reporte falla
    invokeTool
      .mockResolvedValueOnce(mockInvokeSuccess({ data: [{ ruc: "20123456789" }] }))
      .mockResolvedValueOnce(mockInvokeError("Error de conexión a geo-intersections"))
      .mockResolvedValueOnce(mockInvokeSuccess({ nivel: "MEDIO" }))
      .mockResolvedValueOnce(mockInvokeSuccess({ emergencias: [] }));

    const result = await runRiesgoTerritorial({ departamento: "13" });

    expect(result.metadata.fuentesRespondidas).toContain("territorio_inteligencia_captura_territorio");
    expect(result.metadata.fuentesRespondidas).toContain("territorio_inteligencia_riesgo_eudr");
    expect(result.metadata.fuentesRespondidas).toContain("emergencias_indeci_preparacion_riesgo");
    expect(result.metadata.fuentesFallidas).toContain("geo_intersections_reporte");
    expect(result.metadata.fuentesFallidas).toHaveLength(1);
  });

  it("sin ruc opcional → la llamada funciona sin enviar ruc a ninguna tool", async () => {
    setupAllToolsSuccess();

    const result = await runRiesgoTerritorial({ departamento: "13" });

    expect(result.metadata.ruc).toBeUndefined();
    expect(result.metadata.departamento).toBe("13");
    // Verificar que se llamó sin ruc en los args
    expect(invokeTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "territorio_inteligencia_captura_territorio" }),
      expect.objectContaining({ departamento: "13" })
    );
    expect(invokeTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "territorio_inteligencia_riesgo_eudr" }),
      expect.objectContaining({ departamento: "13" })
    );
  });

  it("con ruc opcional → enriquecido en metadata y pasado a tools que lo soportan", async () => {
    setupAllToolsSuccess();

    const result = await runRiesgoTerritorial({ departamento: "13", ruc: "20123456789" });

    expect(result.metadata.ruc).toBe("20123456789");
    // Verificar que se llamó con ruc en riesgo_eudr
    expect(invokeTool).toHaveBeenCalledWith(
      expect.objectContaining({ name: "territorio_inteligencia_riesgo_eudr" }),
      expect.objectContaining({ departamento: "13", ruc: "20123456789" })
    );
  });

  it("genera timestamp ISO en metadata", async () => {
    setupAllToolsSuccess();

    const result = await runRiesgoTerritorial({ departamento: "13" });

    expect(result.metadata.generadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("resume.contador extrae correctamente el total de rucs del array data", async () => {
    setupAllToolsSuccess();

    const result = await runRiesgoTerritorial({ departamento: "13" });

    expect(result.resumen.totalRucsConcentracion).toBe(2);
  });

  it("resume.contador extrae correctamente superposicionesCount del array items", async () => {
    setupAllToolsSuccess();

    const result = await runRiesgoTerritorial({ departamento: "13" });

    expect(result.resumen.superposicionesCount).toBe(3);
  });

  it("resume.nivelRiesgoEudr extrae BAJO/MEDIO/ALTO/CRITICO del campo nivel", async () => {
    setupAllToolsSuccess();

    const result = await runRiesgoTerritorial({ departamento: "13" });

    expect(result.resumen.nivelRiesgoEudr).toBe("ALTO");
  });

  it("resume.nivelRiesgoEudr devuelve N/A si no hay campo nivel", async () => {
    findTool.mockImplementation((name: string) => mockTool(name));
    invokeTool
      .mockResolvedValueOnce(mockInvokeSuccess({ data: [] }))
      .mockResolvedValueOnce(mockInvokeSuccess({ items: [] }))
      .mockResolvedValueOnce(mockInvokeSuccess({ foo: "bar" })) // sin campo nivel
      .mockResolvedValueOnce(mockInvokeSuccess({ emergencias: [] }));

    const result = await runRiesgoTerritorial({ departamento: "13" });

    expect(result.resumen.nivelRiesgoEudr).toBe("N/A");
  });

  it("resume.emergenciasActivasCount extrae del array emergencias", async () => {
    setupAllToolsSuccess();

    const result = await runRiesgoTerritorial({ departamento: "13" });

    expect(result.resumen.emergenciasActivasCount).toBe(1);
  });

  it("tool no existe en catálogo → se reporta en fuentesFallidas", async () => {
    // Solo geo_intersections_reporte no existe
    findTool.mockImplementation((name: string) => {
      if (name === "geo_intersections_reporte") return undefined;
      return mockTool(name);
    });

    invokeTool
      .mockResolvedValueOnce(mockInvokeSuccess({ data: [] }))
      // geo_intersections falla porque findTool devolvió undefined
      .mockResolvedValueOnce(mockInvokeSuccess({ nivel: "BAJO" }))
      .mockResolvedValueOnce(mockInvokeSuccess({ emergencias: [] }));

    const result = await runRiesgoTerritorial({ departamento: "13" });

    expect(result.metadata.fuentesFallidas).toContain("geo_intersections_reporte");
  });

  it("captura.capturaPropia incluye el data parseado cuando la tool responde OK", async () => {
    setupAllToolsSuccess();

    const result = await runRiesgoTerritorial({ departamento: "13" });

    expect(result.captura.ok).toBe(true);
    expect(result.captura.data).toBeDefined();
    expect(result.superposiciones.ok).toBe(true);
    expect(result.eudr.ok).toBe(true);
    expect(result.emergencias.ok).toBe(true);
  });

  it("captura.error incluye el mensaje cuando la tool falla", async () => {
    findTool.mockImplementation((name: string) => mockTool(name));
    invokeTool
      .mockResolvedValueOnce(mockInvokeError("Connection timeout"))
      .mockResolvedValueOnce(mockInvokeSuccess({ items: [] }))
      .mockResolvedValueOnce(mockInvokeSuccess({ nivel: "BAJO" }))
      .mockResolvedValueOnce(mockInvokeSuccess({ emergencias: [] }));

    const result = await runRiesgoTerritorial({ departamento: "13" });

    expect(result.captura.ok).toBe(false);
    expect(result.captura.error).toBe("Connection timeout");
    expect(result.metadata.fuentesFallidas).toContain("territorio_inteligencia_captura_territorio");
  });

  it("multiple tools fallan → todas en fuentesFallidas", async () => {
    findTool.mockImplementation((name: string) => mockTool(name));
    invokeTool
      .mockResolvedValueOnce(mockInvokeSuccess({ data: [] }))
      .mockResolvedValueOnce(mockInvokeError("geo error"))
      .mockResolvedValueOnce(mockInvokeError("eudr error"))
      .mockResolvedValueOnce(mockInvokeSuccess({ emergencias: [] }));

    const result = await runRiesgoTerritorial({ departamento: "13" });

    expect(result.metadata.fuentesFallidas).toContain("geo_intersections_reporte");
    expect(result.metadata.fuentesFallidas).toContain("territorio_inteligencia_riesgo_eudr");
    expect(result.metadata.fuentesFallidas).toHaveLength(2);
    expect(result.metadata.fuentesRespondidas).toContain("territorio_inteligencia_captura_territorio");
    expect(result.metadata.fuentesRespondidas).toContain("emergencias_indeci_preparacion_riesgo");
  });

  it("las 4 tools fallan → todas en fuentesFallidas, resumen con valores por defecto", async () => {
    findTool.mockImplementation((name: string) => mockTool(name));
    invokeTool
      .mockResolvedValueOnce(mockInvokeError("error 1"))
      .mockResolvedValueOnce(mockInvokeError("error 2"))
      .mockResolvedValueOnce(mockInvokeError("error 3"))
      .mockResolvedValueOnce(mockInvokeError("error 4"));

    const result = await runRiesgoTerritorial({ departamento: "99", ruc: "20111111111" });

    expect(result.metadata.fuentesFallidas).toHaveLength(4);
    expect(result.metadata.fuentesRespondidas).toHaveLength(0);
    expect(result.resumen.totalRucsConcentracion).toBe(0);
    expect(result.resumen.superposicionesCount).toBe(0);
    expect(result.resumen.nivelRiesgoEudr).toBe("N/A");
    expect(result.resumen.emergenciasActivasCount).toBe(0);
  });
});
