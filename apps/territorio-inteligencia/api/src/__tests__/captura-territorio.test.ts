/**
 * `capturaForestal` no tiene titular (SERFOR no lo publica) — agrupa por
 * `capa`+`SECTOR`, nunca por un campo de titular que la fuente no tiene.
 * `capturaMinero` sí agrupa por `titular` (nombre real de la fuente, no RUC).
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

const mineroQueryMock = vi.fn();
const forestalQueryMock = vi.fn();

vi.mock("../db/catastro-minero-pool.js", () => ({
  catastroMineroPool: { query: mineroQueryMock },
}));
vi.mock("../db/catastro-forestal-pool.js", () => ({
  catastroForestalPool: { query: forestalQueryMock },
}));

const { getCapturaTerritorio } = await import("../routes/captura-territorio.js");

beforeEach(() => {
  mineroQueryMock.mockReset();
  forestalQueryMock.mockReset();
});

describe("getCapturaTerritorio — minero", () => {
  it("calcula proporcionTerritorial sobre el total real, no sobre el top N", async () => {
    mineroQueryMock
      .mockResolvedValueOnce({ rows: [{ total: "1000" }] })
      .mockResolvedValueOnce({ rows: [{ titular: "EMPRESA A", totalsuperficie: "250", conteotitulos: "3" }] });

    const [row] = await getCapturaTerritorio({ tipoCatastro: "minero", limiteRucs: 1 });

    expect(row.identificador).toBe("EMPRESA A");
    expect(row.tipoCatastro).toBe("minero");
    expect(row.proporcionTerritorial).toBe(25);
  });
});

describe("getCapturaTerritorio — forestal", () => {
  it("usa SECTOR como identificador cuando viene presente", async () => {
    forestalQueryMock
      .mockResolvedValueOnce({ rows: [{ total: "500" }] })
      .mockResolvedValueOnce({ rows: [{ capa: "modalidad_concesiones_forestales", sector: "Alto Ponaza", totalsuperficie: "100", conteotitulos: "1" }] });

    const [row] = await getCapturaTerritorio({ tipoCatastro: "forestal", limiteRucs: 1 });

    expect(row.identificador).toBe("Alto Ponaza");
  });

  it("cae a la modalidad (capa) cuando SECTOR viene vacío", async () => {
    forestalQueryMock
      .mockResolvedValueOnce({ rows: [{ total: "500" }] })
      .mockResolvedValueOnce({ rows: [{ capa: "modalidad_concesiones_forestales", sector: "  ", totalsuperficie: "100", conteotitulos: "1" }] });

    const [row] = await getCapturaTerritorio({ tipoCatastro: "forestal", limiteRucs: 1 });

    expect(row.identificador).toBe("modalidad_concesiones_forestales");
  });

  it("devuelve [] si el departamento no mapea a un código UBIGEO conocido", async () => {
    const results = await getCapturaTerritorio({ tipoCatastro: "forestal", departamento: "NARNIA", limiteRucs: 1 });

    expect(results).toEqual([]);
    expect(forestalQueryMock).not.toHaveBeenCalled();
  });
});
