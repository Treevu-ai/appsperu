/**
 * Tests de las semánticas de fallo de `getRiesgoEUDR`.
 *
 * Esta app está fuera del catálogo MCP (ver README.md) y aun así merece tests,
 * por una razón puntual: el módulo tenía `catch { return [] }`, que es
 * indistinguible de "no hay riesgo en este título". Es la clase de default que
 * hace que un agente descarte un caso que debería mirar, así que el test que
 * importa es el que verifica que se *propaga* el error y que la falta de dato
 * no se reporta como riesgo BAJO.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

const { getRiesgoEUDR, RiesgoEUDRNoDisponibleError, RIESGO_EUDR_NO_DISPONIBLE } =
  await import("../services/riesgo-eudr.service.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("getRiesgoEUDR — fallo de la fuente", () => {
  it("propaga el error en vez de devolver lista vacía", async () => {
    // El comportamiento anterior: `[]`. Para quien consulta esto, eso dice
    // "no encontramos riesgo forestal" cuando la verdad es "no pudimos mirar".
    queryMock.mockRejectedValueOnce(new Error('relation "minam_deforestacion" does not exist'));

    await expect(getRiesgoEUDR({ ruc: "20601030123" })).rejects.toBeInstanceOf(
      RiesgoEUDRNoDisponibleError
    );
  });

  it("el error distingue 'no pude consultar' de 'no hay riesgo'", async () => {
    queryMock.mockRejectedValueOnce(new Error("boom"));

    const error = await getRiesgoEUDR({}).catch((e) => e);

    expect(error.code).toBe(RIESGO_EUDR_NO_DISPONIBLE);
    // El mensaje tiene que desambiguar por sí solo: es lo que lee el agente si
    // no sabe mirar el código.
    expect(error.message).toMatch(/NO significa que no exista riesgo/);
  });

  it("conserva la causa original para poder diagnosticar", async () => {
    const cause = new Error("columna inexistente");
    queryMock.mockRejectedValueOnce(cause);

    const error = await getRiesgoEUDR({}).catch((e) => e);

    expect(error.cause).toBe(cause);
  });
});

describe("getRiesgoEUDR — ausencia de dato", () => {
  it("reporta NO_EVALUABLE, no BAJO, cuando no hay capa de deforestación", async () => {
    // LEFT JOIN sin coincidencia -> superficie_deforestada NULL. Con el
    // `ELSE "BAJO"` de antes esto salía como "riesgo bajo", que es afirmar
    // que no deforestó cuando nadie lo comprobó.
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          ruc: "20601030123",
          nombre: "AGRÍCOLA DEL NORTE S.A.",
          estado_riesgo: "NO_EVALUABLE",
          superficie_deforestada: null,
          evidencia: "Cruce entre Catastro Forestal y Capas de Deforestación MINAM",
        },
      ],
    });

    const [row] = await getRiesgoEUDR({ ruc: "20601030123" });

    expect(row.estadoRiesgo).toBe("NO_EVALUABLE");
  });

  it("conserva null en superficie, no lo convierte a 0", async () => {
    // `Number(null)` es 0. Con la conversión directa, "sin dato" salía como
    // "0 hectáreas deforestadas": un número falso y creíble.
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          ruc: "20601030123",
          nombre: "AGRÍCOLA DEL NORTE S.A.",
          estado_riesgo: "NO_EVALUABLE",
          superficie_deforestada: null,
          evidencia: "e",
        },
      ],
    });

    const [row] = await getRiesgoEUDR({ ruc: "20601030123" });

    expect(row.superficieDeforestada).toBeNull();
  });

  it("sí reporta superficie cuando la fuente respondió", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          ruc: "20601030123",
          nombre: "AGRÍCOLA DEL NORTE S.A.",
          estado_riesgo: "ALTO",
          superficie_deforestada: "250.5",
          evidencia: "e",
        },
      ],
    });

    const [row] = await getRiesgoEUDR({ ruc: "20601030123" });

    expect(row.estadoRiesgo).toBe("ALTO");
    expect(row.superficieDeforestada).toBe(250.5);
  });
});

describe("getRiesgoEUDR — query", () => {
  it("bindea los filtros en vez de interpolarlos", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await getRiesgoEUDR({ ruc: "20601030123", departamento: "LA LIBERTAD" });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).not.toMatch(/titular_ruc\s*=\s*'20601030123'/);
    expect(params).toEqual(["20601030123", "LA LIBERTAD"]);
  });
});
