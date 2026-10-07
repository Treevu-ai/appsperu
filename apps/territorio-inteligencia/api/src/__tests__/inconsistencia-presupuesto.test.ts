/**
 * Cruza `inversion-privada.oxi_investment_promotions` (distrito/provincia
 * reales) contra `catastro_minero_derechos` por coincidencia exacta de
 * ubicación — nunca por geometría, ninguna de las dos fuentes la tiene.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const oxiQueryMock = vi.fn();
const mineroQueryMock = vi.fn();

vi.mock("../db/inversion-privada-pool.js", () => ({
  inversionPrivadaPool: { query: oxiQueryMock },
}));
vi.mock("../db/catastro-minero-pool.js", () => ({
  catastroMineroPool: { query: mineroQueryMock },
}));

const { getInconsistenciasPresupuestales } = await import("../routes/inconsistencia-presupuesto.js");

beforeEach(() => {
  oxiQueryMock.mockReset();
  mineroQueryMock.mockReset();
});

describe("getInconsistenciasPresupuestales", () => {
  it("marca conflicto cuando hay derechos mineros en el mismo distrito+provincia", async () => {
    oxiQueryMock.mockResolvedValueOnce({
      rows: [{ codigo_referencia: "SFEN021", nombre_proyecto: "Obra X", monto_inversion_referencial: "100000", departamento: "LA LIBERTAD", provincia: "PATAZ", distrito: "ONGON", entidad: "GORE LA LIBERTAD" }],
    });
    mineroQueryMock.mockResolvedValueOnce({ rows: [{ provincia: "PATAZ", distrito: "ONGON" }] });

    const [row] = await getInconsistenciasPresupuestales({});

    expect(row.conflictoDeteccionado).toBe(true);
    expect(row.proyecto).toBe("Obra X");
    expect(row.monto).toBe(100000);
  });

  it("no marca conflicto cuando el distrito del proyecto no tiene derechos mineros", async () => {
    oxiQueryMock.mockResolvedValueOnce({
      rows: [{ codigo_referencia: "SFEN022", nombre_proyecto: "Obra Y", monto_inversion_referencial: "50000", departamento: "LA LIBERTAD", provincia: "VIRU", distrito: "VIRU", entidad: "MIDAGRI" }],
    });
    mineroQueryMock.mockResolvedValueOnce({ rows: [] });

    const [row] = await getInconsistenciasPresupuestales({});

    expect(row.conflictoDeteccionado).toBe(false);
  });

  it("no consulta catastro-minero si no hay proyectos", async () => {
    oxiQueryMock.mockResolvedValueOnce({ rows: [] });

    const results = await getInconsistenciasPresupuestales({});

    expect(results).toEqual([]);
    expect(mineroQueryMock).not.toHaveBeenCalled();
  });
});
