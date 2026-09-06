import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const connectMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

const { ingestInformesControl } = await import("../ingest/informes-control-connector.js");

function makeRow(codigo: string, overrides: Record<string, unknown> = {}) {
  return {
    CodigoInforme: codigo,
    Entidad: "MUNICIPALIDAD X",
    Departamento: "LA LIBERTAD",
    Periodo: "2026",
    FechaPublicacion: "2026/01/15",
    EsConResponsabilidad: "N",
    TotalRows: "2",
    Funcionarios: null,
    ...overrides,
  };
}

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe("ingestInformesControl", () => {
  const clientQueryMock = vi.fn();
  const client = { query: clientQueryMock, release: vi.fn() };

  beforeEach(() => {
    connectMock.mockResolvedValue(client);
    clientQueryMock.mockReset();
    clientQueryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO raw_contraloria_batches")) {
        return Promise.resolve({ rows: [{ id: 1 }] });
      }
      return Promise.resolve({ rows: [] });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pagina hasta encontrar una página con menos filas que PAGE_SIZE, e inserta cada informe", async () => {
    const fullPage = Array.from({ length: 500 }, (_, i) => makeRow(`COD-${i}`));
    const lastPage = [makeRow("COD-LAST")];

    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        call += 1;
        const u = new URL(url);
        const pageNumber = u.searchParams.get("PageNumber");
        if (pageNumber === "1") return Promise.resolve(jsonResponse(fullPage));
        if (pageNumber === "2") return Promise.resolve(jsonResponse(lastPage));
        throw new Error(`llamada inesperada #${call} a ${url}`);
      })
    );

    const summary = await ingestInformesControl(2026);

    expect(summary.paginasProcesadas).toBe(2);
    expect(summary.filasInsertadas).toBe(501);
    expect(summary.filasSinCodigo).toBe(0);

    const insertCalls = clientQueryMock.mock.calls.filter(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO informes_control"));
    expect(insertCalls).toHaveLength(501);
  }, 15000);

  it("nunca incluye Funcionarios/Responsabilidad/Text en los parámetros de INSERT, aunque la fuente los traiga poblados", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse([
            makeRow("COD-1", {
              Funcionarios: "UN NOMBRE REAL AQUI",
              Responsabilidad: "detalle de responsabilidad",
              Text: "texto que podria incluir UN NOMBRE REAL AQUI también",
              EsConResponsabilidad: "S",
            }),
          ])
        )
      )
    );

    await ingestInformesControl(2026);

    const insertCall = clientQueryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO informes_control"));
    expect(insertCall).toBeDefined();
    const serializedParams = JSON.stringify(insertCall![1]);
    expect(serializedParams).not.toContain("UN NOMBRE REAL AQUI");
    expect(serializedParams).not.toContain("detalle de responsabilidad");
  });

  it("cuenta filas sin CodigoInforme sin abortar la ingesta completa", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse([makeRow("COD-1"), { Entidad: "SIN CODIGO" }])))
    );

    const summary = await ingestInformesControl(2026);
    expect(summary.filasInsertadas).toBe(1);
    expect(summary.filasSinCodigo).toBe(1);
  });

  it("hace rollback si una inserción falla a mitad de una página", async () => {
    clientQueryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO raw_contraloria_batches")) {
        return Promise.resolve({ rows: [{ id: 1 }] });
      }
      if (typeof sql === "string" && sql.includes("INSERT INTO informes_control")) {
        return Promise.reject(new Error("constraint violation"));
      }
      return Promise.resolve({ rows: [] });
    });
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse([makeRow("COD-1")]))));

    await expect(ingestInformesControl(2026)).rejects.toThrow("constraint violation");
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });

  it("propaga un error explícito si la API devuelve un status distinto de 2xx", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response)));
    await expect(ingestInformesControl(2026)).rejects.toThrow(/500/);
  });

  it("propaga el filtro pDepartamento cuando se pasa, y lo omite cuando no", async () => {
    let capturedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        capturedUrl = url;
        return Promise.resolve(jsonResponse([makeRow("COD-1")]));
      })
    );

    await ingestInformesControl(2026, "LA LIBERTAD");
    expect(new URL(capturedUrl).searchParams.get("pDepartamento")).toBe("LA LIBERTAD");

    await ingestInformesControl(2026);
    expect(new URL(capturedUrl).searchParams.has("pDepartamento")).toBe(false);
  });
});
