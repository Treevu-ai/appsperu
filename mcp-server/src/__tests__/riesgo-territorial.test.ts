/**
 * Tests para la vista compuesta riesgo-territorial.
 *
 * Los mocks de `invokeTool` usan la forma REAL que devuelve `index.invokeTool`:
 * `content[0].text` es `serializeToolResponse(status, body)` = `{ status, body }`.
 * (Los tests anteriores mockeaban el body sin envolver, y por eso pasaban aunque
 * en producción el resumen salía siempre en 0.)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runRiesgoTerritorial,
  resolverDepartamento,
  TOOL_NAMES,
} from "../tools/riesgo-territorial.js";
import { serializeToolResponse } from "../tool-output.js";
import * as index from "../index.js";

vi.mock("../index.js", () => ({
  findTool: vi.fn(),
  invokeTool: vi.fn(),
}));

const { findTool, invokeTool } = vi.mocked(index);

type Invoke = Awaited<ReturnType<typeof index.invokeTool>>;

function mockTool(name: string) {
  return {
    name,
    app: "geo-intersections" as const,
    description: "test",
    pathTemplate: `/api/${name}`,
    pathParams: [],
    querySchema: {},
  };
}

/** Respuesta HTTP de la app, envuelta igual que `invokeTool` real. */
function http(status: number, body: unknown): Invoke {
  return {
    content: [{ type: "text" as const, text: serializeToolResponse(status, body) }],
    isError: status >= 500,
  };
}

/** Fallo antes de tener respuesta HTTP (ej. conexión rechazada): texto plano, sin `{ status }`. */
function sinRespuesta(message: string): Invoke {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

// Bodies con la forma real de cada API.
const GEO_OK = {
  total: 42,
  limit: 20,
  offset: 0,
  hasMore: true,
  resultados: [{ id: 1 }, { id: 2 }, { id: 3 }],
};
const EMERGENCIAS_OK = {
  departamento: "LA LIBERTAD",
  totalDistritos: 3,
  distritos: [
    { distrito: "TRUJILLO", historialEmergencias: { totalEmergencias: 10 }, proyectosPrevencion: [] },
    { distrito: "ASCOPE", historialEmergencias: { totalEmergencias: 2 }, proyectosPrevencion: [] },
    { distrito: "PACASMAYO", historialEmergencias: null, proyectosPrevencion: [{ cui: "1" }] },
  ],
};
const CAPTURA_OK = [{ ruc: "X", nombre: "X" }, { ruc: "Y", nombre: "Y" }];
const EUDR_OK = [{ estadoRiesgo: "BAJO" }, { estadoRiesgo: "ALTO" }, { estadoRiesgo: "NO_EVALUABLE" }];

/** Estado actual del catálogo: las 2 tools de territorio-inteligencia no existen. */
function catalogoActual() {
  findTool.mockImplementation((name: string) =>
    name === TOOL_NAMES.captura || name === TOOL_NAMES.eudr ? undefined : mockTool(name)
  );
}

function catalogoCompleto() {
  findTool.mockImplementation((name: string) => mockTool(name));
}

/** Responde por nombre de tool (independiente del orden de las llamadas). */
function responder(map: Partial<Record<string, Invoke | Error>>) {
  invokeTool.mockImplementation(async (tool) => {
    const r = map[tool.name];
    if (r instanceof Error) throw r;
    if (!r) throw new Error(`sin mock para ${tool.name}`);
    return r;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolverDepartamento", () => {
  it("mapea UBIGEO de 2 dígitos al nombre que usan las fuentes", () => {
    expect(resolverDepartamento("13")).toBe("LA LIBERTAD");
    expect(resolverDepartamento("1")).toBe("AMAZONAS");
    expect(resolverDepartamento("25")).toBe("UCAYALI");
  });

  it("normaliza nombres: mayúsculas, sin tildes, espacios colapsados", () => {
    expect(resolverDepartamento(" la  libertad ")).toBe("LA LIBERTAD");
    expect(resolverDepartamento("Junín")).toBe("JUNIN");
    expect(resolverDepartamento("San Martín")).toBe("SAN MARTIN");
  });

  it("código numérico inexistente → null", () => {
    expect(resolverDepartamento("99")).toBeNull();
    expect(resolverDepartamento("00")).toBeNull();
  });
});

describe("runRiesgoTerritorial", () => {
  it("catálogo actual: captura y EUDR fuera del catálogo → cobertura 2/4, métricas null, motivo TOOL_NO_EN_CATALOGO", async () => {
    catalogoActual();
    responder({
      [TOOL_NAMES.superposiciones]: http(200, GEO_OK),
      [TOOL_NAMES.emergencias]: http(200, EMERGENCIAS_OK),
    });

    const r = await runRiesgoTerritorial({ departamento: "13" });

    expect(r.metadata.cobertura).toBe("2/4");
    expect(r.metadata.fuentesRespondidas).toEqual([TOOL_NAMES.superposiciones, TOOL_NAMES.emergencias]);
    expect(r.metadata.fuentesFallidas).toEqual([TOOL_NAMES.captura, TOOL_NAMES.eudr]);
    expect(r.metadata.fuentesNoDisponibles.map((f) => f.motivo)).toEqual([
      "TOOL_NO_EN_CATALOGO",
      "TOOL_NO_EN_CATALOGO",
    ]);
    expect(r.metadata.fuentesNoDisponibles[0].detalle).toContain("territorio-inteligencia");
    expect(r.resumen.totalRucsConcentracion).toBeNull();
    expect(r.resumen.nivelRiesgoEudr).toBeNull();
    expect(r.resumen.superposicionesCount).toBe(42);
    expect(r.resumen.distritosConEmergenciasCount).toBe(2);
    expect(r.metadata.advertencia).toMatch(/Sin dato no significa sin riesgo/);
    expect(r.metadata.advertencia).toContain(TOOL_NAMES.captura);
    // No se invoca lo que no está en el catálogo.
    expect(invokeTool).toHaveBeenCalledTimes(2);
  });

  it("envía el nombre del departamento (no el UBIGEO) a geo-intersections y emergencias", async () => {
    catalogoActual();
    responder({
      [TOOL_NAMES.superposiciones]: http(200, GEO_OK),
      [TOOL_NAMES.emergencias]: http(200, EMERGENCIAS_OK),
    });

    const r = await runRiesgoTerritorial({ departamento: "13" });

    expect(r.metadata.departamento).toBe("13");
    expect(r.metadata.departamentoConsultado).toBe("LA LIBERTAD");
    const calls = new Map(invokeTool.mock.calls.map(([tool, args]) => [tool.name, args]));
    expect(calls.get(TOOL_NAMES.superposiciones)).toEqual({ departamento: "LA LIBERTAD", limit: 20 });
    expect(calls.get(TOOL_NAMES.emergencias)).toEqual({ departamento: "LA LIBERTAD" });
  });

  it("departamento con código inexistente → error explícito, sin invocar tools", async () => {
    catalogoActual();
    await expect(runRiesgoTerritorial({ departamento: "99" })).rejects.toThrow(/no reconocido/);
    expect(invokeTool).not.toHaveBeenCalled();
  });

  it("las 4 fuentes responden (catálogo completo) → cobertura 4/4 y métricas desde la forma real de cada API", async () => {
    catalogoCompleto();
    responder({
      [TOOL_NAMES.captura]: http(200, CAPTURA_OK),
      [TOOL_NAMES.superposiciones]: http(200, GEO_OK),
      [TOOL_NAMES.eudr]: http(200, EUDR_OK),
      [TOOL_NAMES.emergencias]: http(200, EMERGENCIAS_OK),
    });

    const r = await runRiesgoTerritorial({ departamento: "LA LIBERTAD", ruc: "20123456789" });

    expect(r.metadata.cobertura).toBe("4/4");
    expect(r.metadata.fuentesNoDisponibles).toEqual([]);
    expect(r.resumen).toEqual({
      totalRucsConcentracion: 2,
      superposicionesCount: 42,
      nivelRiesgoEudr: "ALTO",
      distritosConEmergenciasCount: 2,
    });
    // `data` es el body desempaquetado, no el sobre `{ status, body }`.
    expect(r.superposiciones.data).toEqual(GEO_OK);
    expect(r.superposiciones.status).toBe(200);
    const eudrArgs = invokeTool.mock.calls.find(([tool]) => tool.name === TOOL_NAMES.eudr)?.[1];
    expect(eudrArgs).toEqual({ departamento: "LA LIBERTAD", ruc: "20123456789" });
  });

  it("HTTP 4xx → no disponible con motivo HTTP_ERROR y status, métrica null (no 0)", async () => {
    catalogoActual();
    responder({
      [TOOL_NAMES.superposiciones]: http(400, { error: "Parámetro inválido." }),
      [TOOL_NAMES.emergencias]: http(200, EMERGENCIAS_OK),
    });

    const r = await runRiesgoTerritorial({ departamento: "13" });

    expect(r.metadata.cobertura).toBe("1/4");
    expect(r.metadata.fuentesRespondidas).not.toContain(TOOL_NAMES.superposiciones);
    const geo = r.metadata.fuentesNoDisponibles.find((f) => f.tool === TOOL_NAMES.superposiciones);
    expect(geo).toMatchObject({ motivo: "HTTP_ERROR", status: 400 });
    expect(geo?.detalle).toContain("Parámetro inválido.");
    expect(r.resumen.superposicionesCount).toBeNull();
    expect(r.superposiciones).toMatchObject({ ok: false, status: 400 });
  });

  it("HTTP 5xx → no disponible con motivo HTTP_ERROR", async () => {
    catalogoActual();
    responder({
      [TOOL_NAMES.superposiciones]: http(200, GEO_OK),
      [TOOL_NAMES.emergencias]: http(503, { error: "Base no disponible." }),
    });

    const r = await runRiesgoTerritorial({ departamento: "13" });

    expect(r.metadata.cobertura).toBe("1/4");
    expect(r.metadata.fuentesNoDisponibles.find((f) => f.tool === TOOL_NAMES.emergencias)).toMatchObject({
      motivo: "HTTP_ERROR",
      status: 503,
    });
    expect(r.resumen.distritosConEmergenciasCount).toBeNull();
    expect(r.resumen.superposicionesCount).toBe(42);
  });

  it("ENRIQUECIMIENTO_NO_CONFIGURADO (200 con distritos vacíos) → no disponible, no 'respondida' ni 0", async () => {
    catalogoActual();
    responder({
      [TOOL_NAMES.superposiciones]: http(200, GEO_OK),
      [TOOL_NAMES.emergencias]: http(200, {
        estado: "ENRIQUECIMIENTO_NO_CONFIGURADO",
        departamento: "LA LIBERTAD",
        distritos: [],
      }),
    });

    const r = await runRiesgoTerritorial({ departamento: "13" });

    expect(r.metadata.fuentesRespondidas).toEqual([TOOL_NAMES.superposiciones]);
    expect(r.metadata.fuentesNoDisponibles.find((f) => f.tool === TOOL_NAMES.emergencias)).toMatchObject({
      motivo: "ENRIQUECIMIENTO_NO_CONFIGURADO",
      status: 200,
    });
    expect(r.resumen.distritosConEmergenciasCount).toBeNull();
    expect(r.metadata.cobertura).toBe("1/4");
  });

  it("fallo sin respuesta HTTP (conexión rechazada) → ERROR_INVOCACION con el mensaje", async () => {
    catalogoActual();
    responder({
      [TOOL_NAMES.superposiciones]: sinRespuesta("No se pudo conectar a http://localhost:4037"),
      [TOOL_NAMES.emergencias]: http(200, EMERGENCIAS_OK),
    });

    const r = await runRiesgoTerritorial({ departamento: "13" });

    expect(r.metadata.fuentesNoDisponibles.find((f) => f.tool === TOOL_NAMES.superposiciones)).toMatchObject({
      motivo: "ERROR_INVOCACION",
      detalle: "No se pudo conectar a http://localhost:4037",
    });
    expect(r.superposiciones.ok).toBe(false);
  });

  it("invokeTool lanza → ERROR_INVOCACION, las demás fuentes siguen", async () => {
    catalogoActual();
    responder({
      [TOOL_NAMES.superposiciones]: new Error("boom"),
      [TOOL_NAMES.emergencias]: http(200, EMERGENCIAS_OK),
    });

    const r = await runRiesgoTerritorial({ departamento: "13" });

    expect(r.metadata.fuentesNoDisponibles.find((f) => f.tool === TOOL_NAMES.superposiciones)).toMatchObject({
      motivo: "ERROR_INVOCACION",
      detalle: "boom",
    });
    expect(r.metadata.fuentesRespondidas).toEqual([TOOL_NAMES.emergencias]);
  });

  it("ninguna tool en el catálogo → cobertura 0/4, todo null, sin invocaciones", async () => {
    findTool.mockReturnValue(undefined);

    const r = await runRiesgoTerritorial({ departamento: "13" });

    expect(r.metadata.cobertura).toBe("0/4");
    expect(r.metadata.fuentesNoDisponibles).toHaveLength(4);
    expect(r.metadata.fuentesNoDisponibles.every((f) => f.motivo === "TOOL_NO_EN_CATALOGO")).toBe(true);
    expect(r.resumen).toEqual({
      totalRucsConcentracion: null,
      superposicionesCount: null,
      nivelRiesgoEudr: null,
      distritosConEmergenciasCount: null,
    });
    expect(invokeTool).not.toHaveBeenCalled();
  });

  it("respuesta truncada → fuente respondida pero métrica null y advertencia", async () => {
    catalogoActual();
    const truncado: Invoke = {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ status: 200, truncated: true, bodyPreview: "{...", limitation: "x" }),
        },
      ],
      isError: false,
    };
    responder({
      [TOOL_NAMES.superposiciones]: http(200, GEO_OK),
      [TOOL_NAMES.emergencias]: truncado,
    });

    const r = await runRiesgoTerritorial({ departamento: "13" });

    expect(r.metadata.fuentesRespondidas).toContain(TOOL_NAMES.emergencias);
    expect(r.emergencias.truncated).toBe(true);
    expect(r.resumen.distritosConEmergenciasCount).toBeNull();
    expect(r.metadata.advertencia).toMatch(/truncada/);
  });

  it("EUDR: solo filas NO_EVALUABLE → NO_EVALUABLE; array vacío → null", async () => {
    catalogoCompleto();
    responder({
      [TOOL_NAMES.captura]: http(200, []),
      [TOOL_NAMES.superposiciones]: http(200, { total: 0, resultados: [] }),
      [TOOL_NAMES.eudr]: http(200, [{ estadoRiesgo: "NO_EVALUABLE" }]),
      [TOOL_NAMES.emergencias]: http(200, { distritos: [] }),
    });
    let r = await runRiesgoTerritorial({ departamento: "13" });
    expect(r.resumen.nivelRiesgoEudr).toBe("NO_EVALUABLE");
    // Fuente que respondió con 0 real → 0 (no null).
    expect(r.resumen.superposicionesCount).toBe(0);
    expect(r.resumen.totalRucsConcentracion).toBe(0);
    expect(r.resumen.distritosConEmergenciasCount).toBe(0);

    responder({
      [TOOL_NAMES.captura]: http(200, []),
      [TOOL_NAMES.superposiciones]: http(200, { total: 0, resultados: [] }),
      [TOOL_NAMES.eudr]: http(200, []),
      [TOOL_NAMES.emergencias]: http(200, { distritos: [] }),
    });
    r = await runRiesgoTerritorial({ departamento: "13" });
    expect(r.resumen.nivelRiesgoEudr).toBeNull();
  });

  it("EUDR 503 RIESGO_EUDR_NO_DISPONIBLE → no disponible, nivel null (no BAJO)", async () => {
    catalogoCompleto();
    responder({
      [TOOL_NAMES.captura]: http(200, CAPTURA_OK),
      [TOOL_NAMES.superposiciones]: http(200, GEO_OK),
      [TOOL_NAMES.eudr]: http(503, { error: "RIESGO_EUDR_NO_DISPONIBLE", detalle: "..." }),
      [TOOL_NAMES.emergencias]: http(200, EMERGENCIAS_OK),
    });

    const r = await runRiesgoTerritorial({ departamento: "13" });

    expect(r.metadata.cobertura).toBe("3/4");
    expect(r.resumen.nivelRiesgoEudr).toBeNull();
    expect(r.metadata.fuentesNoDisponibles).toEqual([
      expect.objectContaining({ tool: TOOL_NAMES.eudr, motivo: "HTTP_ERROR", status: 503 }),
    ]);
  });

  it("genera timestamp ISO en metadata", async () => {
    catalogoActual();
    responder({
      [TOOL_NAMES.superposiciones]: http(200, GEO_OK),
      [TOOL_NAMES.emergencias]: http(200, EMERGENCIAS_OK),
    });
    const r = await runRiesgoTerritorial({ departamento: "13" });
    expect(r.metadata.generadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
