/**
 * El cruce es por NOMBRE (`@appsperu/entity-matcher`), no por RUC — ni
 * catastro_minero_derechos ni las tablas de sanciones comparten un ID. Una
 * coincidencia exacta normalizada es "confirmada"; una por similitud de
 * tokens es "candidata" y debe reportarse como tal, no fusionarse.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mineroQueryMock = vi.fn();
const sancionesQueryMock = vi.fn();

vi.mock("../db/catastro-minero-pool.js", () => ({
  catastroMineroPool: { query: mineroQueryMock },
}));
vi.mock("../db/sanciones-pool.js", () => ({
  sancionesPool: { query: sancionesQueryMock },
}));

const { getTitularesConRiesgo } = await import("../routes/titulares-riesgo.js");

beforeEach(() => {
  mineroQueryMock.mockReset();
  sancionesQueryMock.mockReset();
  // Las 3 tablas de sanciones se consultan en paralelo con Promise.all.
  sancionesQueryMock.mockResolvedValue({ rows: [] });
});

describe("getTitularesConRiesgo", () => {
  it("marca 'confirmada' una coincidencia exacta de nombre normalizado", async () => {
    mineroQueryMock.mockResolvedValueOnce({
      rows: [{ titular: "MINERA EJEMPLO S.A.", departamento: "LA LIBERTAD", provincia: "PATAZ", distrito: "PATAZ", concesion: "C-1", hectareas: "100" }],
    });
    sancionesQueryMock
      .mockResolvedValueOnce({ rows: [{ ruc: "20100000001", razon_social: "MINERA EJEMPLO S.A.", resolucion: "R-1", desde: "2024-01-01", hasta: null, estado: "VIGENTE", descripcion: "infra" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const [row] = await getTitularesConRiesgo({});

    expect(row.titular).toBe("MINERA EJEMPLO S.A.");
    expect(row.tipoCatastro).toBe("minero");
    expect(row.riesgos).toHaveLength(1);
    expect(row.riesgos[0].confianza).toBe("confirmada");
    expect(row.riesgos[0].tipo).toBe("inhabilitacion");
  });

  it("no inventa riesgos para un titular sin ninguna coincidencia de nombre", async () => {
    mineroQueryMock.mockResolvedValueOnce({
      rows: [{ titular: "MINERA SIN SANCIONES S.A.", departamento: "LA LIBERTAD", provincia: "PATAZ", distrito: "PATAZ", concesion: "C-2", hectareas: "50" }],
    });

    const results = await getTitularesConRiesgo({});

    expect(results).toEqual([]);
  });

  it("suma hectáreas y concesiones cuando el mismo titular tiene varios derechos", async () => {
    mineroQueryMock.mockResolvedValueOnce({
      rows: [
        { titular: "MINERA DOS S.A.", departamento: "LA LIBERTAD", provincia: "PATAZ", distrito: "ONGON", concesion: "C-1", hectareas: "100" },
        { titular: "MINERA DOS S.A.", departamento: "LA LIBERTAD", provincia: "PATAZ", distrito: "ONGON", concesion: "C-2", hectareas: "200" },
      ],
    });
    sancionesQueryMock
      .mockResolvedValueOnce({ rows: [{ ruc: "1", razon_social: "MINERA DOS S.A.", resolucion: "R", desde: null, hasta: null, estado: "VIGENTE", descripcion: "x" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const [row] = await getTitularesConRiesgo({});

    expect(row.superficie).toBe(300);
    expect(row.concesiones.sort()).toEqual(["C-1", "C-2"]);
  });
});
