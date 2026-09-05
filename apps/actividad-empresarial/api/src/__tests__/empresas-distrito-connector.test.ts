import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const connectMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

const { ingestEmpresasDistrito } = await import("../ingest/empresas-distrito-connector.js");

const PACKAGE_SHOW_BODY = {
  success: true,
  result: {
    resources: [
      { id: "r1", name: "Metadatos", format: "docx", url: "https://x/Metadatos.docx" },
      { id: "r2", name: "Empresas en el Sector Privado por mes, según distritos año 2022", format: "csv", url: "https://x/2022.csv" },
    ],
  },
};

const HEADER = "FECHA_CORTE;CODIGO_DE_UBIGEO;DISTRITOS;ENERO;FEBRERO;MARZO;ABRIL;MAYO;JUNIO;JULIO;AGOSTO;SETIEMBRE;OCTUBRE;NOVIEMBRE;DICIEMBRE";
// Fila 1: completa. Fila 2: sin CODIGO_DE_UBIGEO (se descarta por completo, las 12 filas mensuales).
const CSV_BODY = [
  HEADER,
  "20230807;130101;TRUJILLO;10076 ;10059 ;10063 ;10191 ;10296 ;10353 ;10429 ;10458 ;10578 ;10681 ;10761 ;10660 ",
  "20230807;;SIN UBIGEO;1 ;1 ;1 ;1 ;1 ;1 ;1 ;1 ;1 ;1 ;1 ;1 ",
].join("\n");

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function textResponse(text: string) {
  return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(text, "latin1") } as unknown as Response;
}

describe("ingestEmpresasDistrito", () => {
  const clientQueryMock = vi.fn();
  const client = { query: clientQueryMock, release: vi.fn() };

  beforeEach(() => {
    connectMock.mockResolvedValue(client);
    clientQueryMock.mockReset();
    clientQueryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO raw_mtpe_batches")) {
        return Promise.resolve({ rows: [{ id: 9 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("package_show")) return Promise.resolve(jsonResponse(PACKAGE_SHOW_BODY));
        if (url.includes("2022.csv")) return Promise.resolve(textResponse(CSV_BODY));
        throw new Error(`fetch inesperado: ${url}`);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("extrae el año 2022 del nombre del recurso (no de FECHA_CORTE), inserta 12 filas por distrito válido", async () => {
    const summary = await ingestEmpresasDistrito();

    expect(summary.anio).toBe(2022);
    expect(summary.resourceUrl).toBe("https://x/2022.csv");
    expect(summary.filasOrigen).toBe(2);
    expect(summary.filasInsertadas).toBe(1); // la fila sin ubigeo se descarta completa
    expect(summary.filasSinUbigeo).toBe(1);
    expect(summary.advertenciaRecurso).toBeNull();

    const insertCalls = clientQueryMock.mock.calls.filter(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO empresas_privadas_distrito"));
    expect(insertCalls).toHaveLength(12); // una por mes, para el único distrito válido

    const eneroCall = insertCalls[0][1] as unknown[];
    expect(eneroCall[0]).toBe("130101"); // ubigeo
    expect(eneroCall[1]).toBe(2022); // anio
    expect(eneroCall[2]).toBe(1); // mes = enero
    expect(eneroCall[4]).toBe(10076); // numero_empresas, de "10076 "
  });

  it("hace rollback si una inserción falla a mitad de la ingesta", async () => {
    clientQueryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO raw_mtpe_batches")) {
        return Promise.resolve({ rows: [{ id: 9 }] });
      }
      if (typeof sql === "string" && sql.includes("INSERT INTO empresas_privadas_distrito")) {
        return Promise.reject(new Error("constraint violation"));
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(ingestEmpresasDistrito()).rejects.toThrow("constraint violation");
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });

  it("lanza un error explícito si el nombre del recurso no trae ningún año (no asume un año por defecto)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("package_show")) {
          return Promise.resolve(
            jsonResponse({
              success: true,
              result: { resources: [{ id: "r1", name: "Empresas sin año en el título", format: "csv", url: "https://x/sin-anio.csv" }] },
            })
          );
        }
        throw new Error(`fetch inesperado: ${url}`);
      })
    );

    await expect(ingestEmpresasDistrito()).rejects.toThrow(/No se pudo extraer el año/);
  });
});
