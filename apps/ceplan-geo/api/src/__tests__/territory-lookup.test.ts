import { describe, expect, it, vi, beforeEach } from "vitest";

const { queryMock } = vi.hoisted(() => ({ queryMock: vi.fn() }));

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

const { lookupTerritoryByNames, canonicalizarProvinciaFuente, candidatosConNRestaurada } = await import("../crossref/territory-lookup.js");

function territoryRow(overrides: Record<string, unknown> = {}) {
  return {
    // `territories` guarda "Ñ" como "N" sin tilde (vía normalizeTerritoryToken/
    // ACCENT_MAP) — "CAÑETE" vive ahí como "CANETE", confirmado en vivo.
    ubigeo: "150501",
    departamento: "LIMA",
    provincia: "CANETE",
    distrito: "SAN VICENTE DE CANETE",
    geometry_geojson: null,
    ...overrides,
  };
}

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe("canonicalizarProvinciaFuente (hallazgo 2026-09-13, 7/7 obras de Callao sin match)", () => {
  it("canonicaliza el alias de provincia de Callao que usa INFOBRAS", () => {
    expect(canonicalizarProvinciaFuente("PROV CONST DEL CALLAO")).toBe("CALLAO");
  });

  it("deja cualquier otra provincia sin cambios, incluyendo null", () => {
    expect(canonicalizarProvinciaFuente("TRUJILLO")).toBe("TRUJILLO");
    expect(canonicalizarProvinciaFuente(null)).toBeNull();
  });
});

describe("lookupTerritoryByNames (alias de provincia, hallazgo 2026-09-13)", () => {
  it("busca por el nombre canónico CALLAO, no por el literal de INFOBRAS PROV CONST DEL CALLAO", async () => {
    await lookupTerritoryByNames("CALLAO", "PROV CONST DEL CALLAO", "BELLAVISTA");

    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual(["CALLAO", "CALLAO", "BELLAVISTA"]);
  });

  it("no altera una provincia que no tiene alias conocido", async () => {
    await lookupTerritoryByNames("LA LIBERTAD", "TRUJILLO", "TRUJILLO");

    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual(["LA LIBERTAD", "TRUJILLO", "TRUJILLO"]);
  });

  it("sin provincia, no agrega esa condición ni intenta aliasar null", async () => {
    await lookupTerritoryByNames("LORETO", null, null);

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).not.toMatch(/COALESCE\(provincia/i);
    expect(params).toEqual(["LORETO"]);
  });
});

describe("candidatosConNRestaurada (defecto de la fuente INFOBRAS/Contraloría, 2026-09-13)", () => {
  it("genera una variante por cada espacio interno reemplazado por N (territories guarda Ñ sin tilde)", () => {
    expect(candidatosConNRestaurada("CA ETE")).toEqual(["CANETE"]);
    expect(candidatosConNRestaurada("SAN VICENTE DE CA ETE")).toEqual([
      "SANNVICENTE DE CA ETE",
      "SAN VICENTENDE CA ETE",
      "SAN VICENTE DENCA ETE",
      "SAN VICENTE DE CANETE",
    ]);
  });

  it("no genera candidatos para texto sin espacios ni para null", () => {
    expect(candidatosConNRestaurada("CANETE")).toEqual([]);
    expect(candidatosConNRestaurada(null)).toEqual([]);
  });
});

describe("lookupTerritoryByNames — recuperación de Ñ cuando el match exacto falla", () => {
  it("recupera CAÑETE (CANETE en territories) cuando INFOBRAS manda CA ETE en provincia Y distrito a la vez", async () => {
    // Caso real verificado en vivo el 2026-09-13: INFOBRAS trae la misma
    // corrupción en provincia y distrito simultáneamente, así que el match
    // exacto (provincia+distrito tal cual) y los niveles 1/2 (uno corregido,
    // el otro tal cual) fallan — solo el nivel combinado (ambos corregidos)
    // calza contra el territorio real.
    queryMock.mockImplementation((_sql: string, params: string[]) => {
      const [, provincia, distrito] = params;
      if (provincia === "CANETE" && distrito === "SAN VICENTE DE CANETE") {
        return Promise.resolve({ rows: [territoryRow()] });
      }
      return Promise.resolve({ rows: [] });
    });

    const { territory, matchStatus } = await lookupTerritoryByNames("LIMA", "CA ETE", "SAN VICENTE DE CA ETE");

    expect(matchStatus).toBe("confirmada");
    expect(territory?.distrito).toBe("SAN VICENTE DE CANETE");
  });

  it("nivel 1: recupera cuando solo el distrito está corrupto y la provincia ya calza tal cual (caso real: Azángaro/Muñani, Puno)", async () => {
    queryMock.mockImplementation((_sql: string, params: string[]) => {
      const [, provincia, distrito] = params;
      if (provincia === "AZANGARO" && distrito === "MUNANI") {
        return Promise.resolve({ rows: [territoryRow({ ubigeo: "211203", provincia: "AZANGARO", distrito: "MUNANI" })] });
      }
      return Promise.resolve({ rows: [] });
    });

    const { territory, matchStatus } = await lookupTerritoryByNames("PUNO", "AZANGARO", "MU ANI");

    expect(matchStatus).toBe("confirmada");
    expect(territory?.distrito).toBe("MUNANI");
  });

  it("nivel 2: recupera cuando solo la provincia está corrupta y el distrito ya calza tal cual (caso real: Ferreñafe/Pueblo Nuevo, Lambayeque)", async () => {
    queryMock.mockImplementation((_sql: string, params: string[]) => {
      const [, provincia, distrito] = params;
      if (provincia === "FERRENAFE" && distrito === "PUEBLO NUEVO") {
        return Promise.resolve({ rows: [territoryRow({ ubigeo: "140401", provincia: "FERRENAFE", distrito: "PUEBLO NUEVO" })] });
      }
      return Promise.resolve({ rows: [] });
    });

    const { territory, matchStatus } = await lookupTerritoryByNames("LAMBAYEQUE", "FERRE AFE", "PUEBLO NUEVO");

    expect(matchStatus).toBe("confirmada");
    expect(territory?.provincia).toBe("FERRENAFE");
  });

  it("no adivina cuando dos candidatos distintos del mismo nivel producen resultados (ambigüedad)", async () => {
    queryMock.mockImplementation((_sql: string, params: string[]) => {
      const [, , distrito] = params;
      // Dos variantes de "N" distintas calzan con territorios reales dentro
      // del mismo nivel (provincia sin corregir + distrito candidato):
      // ambigüedad real, no se debe adivinar cuál es la correcta.
      if (distrito === "SANNVICENTE DE CA ETE" || distrito === "SAN VICENTE DE CANETE") {
        return Promise.resolve({ rows: [territoryRow()] });
      }
      return Promise.resolve({ rows: [] });
    });

    const { territory, matchStatus } = await lookupTerritoryByNames("LIMA", "CA ETE", "SAN VICENTE DE CA ETE");

    expect(matchStatus).toBe("sin_match");
    expect(territory).toBeNull();
  });

  it("sin espacios en provincia ni distrito, no intenta ninguna recuperación (ni una query extra)", async () => {
    queryMock.mockResolvedValue({ rows: [] });

    await lookupTerritoryByNames("LIMA", "CANETE", "SANVICENTE");

    // Solo la consulta exacta original — ninguna consulta adicional de recuperación.
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
