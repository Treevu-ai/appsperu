import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const connectMock = vi.fn();
const ejecucionQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

vi.mock("../db/ejecucion-pool.js", () => ({
  ejecucionPool: { query: ejecucionQueryMock },
}));

const { ingestDeactivatedInvestments } = await import("../ingest/invierte-desactivadas-connector.js");

const CSV_HEADER =
  "NIVEL,SECTOR,ENTIDAD,CODIGO_UNICO,COD_SNIP,NOMBRE_INVERSION,NOM_UEP,ESTADO,SITUACION,MONTO_VIABLE,COSTO_ACTUALIZADO,FECHA_REGISTRO,FECHA_VIABILIDAD,FUNCION,TIPO_INVERSION,DEPARTAMENTO,PROVINCIA,DISTRITO,UBIGEO,NUM_HABITANTES_BENEF";

const CSV_BODY = [
  CSV_HEADER,
  'GL,GOBIERNOS LOCALES,MUNICIPALIDAD DISTRITAL DE X,111,111,PROYECTO DESACTIVADO LA LIBERTAD,MUNICIPALIDAD DISTRITAL DE X,DESACTIVADO PERMANENTE,EN FORMULACION,1000,1000,2020-01-01,,SANEAMIENTO,PROYECTO DE INVERSION,LA LIBERTAD,TRUJILLO,TRUJILLO,130101,5000',
  'GN,MINISTERIO X,MINISTERIO X,222,222,PROYECTO DESACTIVADO LIMA,MINISTERIO X,DESACTIVADO PERMANENTE,VIABLE,2000,2000,2019-05-01,2019-06-01,TRANSPORTE,PROYECTO DE INVERSION,LIMA,LIMA,LIMA,150101,1000',
  "", // fetchDeactivatedInvestmentsCsv descarta todo lo posterior al último "\n" (asume línea cortada por Range) — sin esto, la última fila real se pierde.
].join("\n");

function csvResponse(text: string) {
  return { ok: true, status: 200, text: async () => text } as unknown as Response;
}

describe("ingestDeactivatedInvestments", () => {
  const clientQueryMock = vi.fn();
  const client = { query: clientQueryMock, release: vi.fn() };

  beforeEach(() => {
    connectMock.mockResolvedValue(client);
    clientQueryMock.mockReset();
    ejecucionQueryMock.mockReset();
    ejecucionQueryMock.mockResolvedValue({ rows: [] });
    clientQueryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO raw_investment_deactivated_batches")) {
        return Promise.resolve({ rows: [{ id: 9 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(csvResponse(CSV_BODY))));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("filtra por departamento y persiste solo las filas dentro del alcance", async () => {
    const summary = await ingestDeactivatedInvestments({ departamentos: ["LA LIBERTAD"] });

    expect(summary.totalFetched).toBe(2);
    expect(summary.accepted).toBe(1);
    expect(summary.skippedOtherDepartamento).toBe(1);
    expect(summary.rejected).toBe(0);

    const insertCall = clientQueryMock.mock.calls.find(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO investments_deactivated")
    );
    expect(insertCall).toBeDefined();
    const payload = JSON.parse(insertCall![1][0]);
    expect(payload).toHaveLength(1);
    expect(payload[0].cui).toBe("111");
    expect(payload[0].departamento).toBe("LA LIBERTAD");

    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  it("sin filtro de departamento, acepta todas las filas válidas", async () => {
    const summary = await ingestDeactivatedInvestments({ departamentos: [] });
    expect(summary.accepted).toBe(2);
    expect(summary.skippedOtherDepartamento).toBe(0);
  });

  it("hace rollback y libera el cliente si el insert falla", async () => {
    clientQueryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO raw_investment_deactivated_batches")) {
        return Promise.resolve({ rows: [{ id: 9 }] });
      }
      if (typeof sql === "string" && sql.includes("INSERT INTO investments_deactivated")) {
        return Promise.reject(new Error("constraint violation"));
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(ingestDeactivatedInvestments({ departamentos: ["LA LIBERTAD"] })).rejects.toThrow("constraint violation");
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });
});
