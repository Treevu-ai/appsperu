import { describe, expect, it, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: queryMock, release: releaseMock }));

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

const { ingestSalasAutorizadas } = await import("../ingest/salas-autorizadas-connector.js");

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function csvResponse(text: string, ok = true) {
  const bytes = Buffer.from(text, "latin1");
  return {
    ok,
    status: ok ? 200 : 500,
    arrayBuffer: () => Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)),
  };
}

const HEADER = "FECHA_CORTE;RUC;EMPRESA;ESTABLECIMIENTO;GIRO;RESOLUCION;CODIGO_SALA;FECHA_VIGENCIA;DIRECCION;DISTRITO;PROVINCIA;DEPARTAMENTO";

function csvRow(overrides: Partial<Record<string, string>> = {}): string {
  const f = {
    fechaCorte: "20261001",
    ruc: "20605436022",
    empresa: "INVERSIONES MEGA GAMING SAC",
    establecimiento: "SAN JUAN II",
    giro: "",
    resolucion: "5789 - 2025",
    codigoSala: "142368004",
    fechaVigencia: "14/08/2029",
    direccion: "AV. SAN MARTIN MZ. K-1 LT. 27 - 28",
    distrito: "SAN JUAN DE LURIGANCHO",
    provincia: "LIMA",
    departamento: "LIMA",
    ...overrides,
  };
  return [
    f.fechaCorte, f.ruc, f.empresa, f.establecimiento, f.giro, f.resolucion, f.codigoSala,
    f.fechaVigencia, f.direccion, f.distrito, f.provincia, f.departamento,
  ].join(";");
}

beforeEach(() => {
  queryMock.mockReset();
  releaseMock.mockReset();
  connectMock.mockClear();
  fetchMock.mockReset();
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("INSERT INTO raw_salas_autorizadas_batches")) {
      return Promise.resolve({ rows: [{ id: 1 }] });
    }
    return Promise.resolve({ rows: [] });
  });
});

describe("ingestSalasAutorizadas", () => {
  it("parsea y upserta una fila valida con todos los campos mapeados", async () => {
    fetchMock.mockResolvedValueOnce(csvResponse(`${HEADER}\n${csvRow()}`));

    const summary = await ingestSalasAutorizadas();

    expect(summary.filasInsertadas).toBe(1);
    const insertCall = queryMock.mock.calls.find(([sql]) => sql.includes("INSERT INTO salas_autorizadas"));
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual([
      "142368004", "20605436022", "INVERSIONES MEGA GAMING SAC", "SAN JUAN II", null, "5789 - 2025",
      "2029-08-14", "AV. SAN MARTIN MZ. K-1 LT. 27 - 28", "SAN JUAN DE LURIGANCHO", "LIMA", "LIMA",
      "2026-10-01", 1,
    ]);
  });

  it("decodifica ISO-8859-1 -- una Ñ no llega corrupta", async () => {
    fetchMock.mockResolvedValueOnce(
      csvResponse(`${HEADER}\n${csvRow({ provincia: "CAÑETE", departamento: "LIMA" })}`)
    );

    await ingestSalasAutorizadas();

    const insertCall = queryMock.mock.calls.find(([sql]) => sql.includes("INSERT INTO salas_autorizadas"));
    expect(insertCall![1][9]).toBe("CAÑETE");
  });

  it("descarta filas sin RUC o sin codigo de sala", async () => {
    fetchMock.mockResolvedValueOnce(
      csvResponse(`${HEADER}\n${csvRow({ ruc: "" })}\n${csvRow({ codigoSala: "" })}`)
    );

    const summary = await ingestSalasAutorizadas();

    expect(summary.filasInsertadas).toBe(0);
  });

  it("deja fecha_vigencia en null cuando la fuente no la trae", async () => {
    fetchMock.mockResolvedValueOnce(csvResponse(`${HEADER}\n${csvRow({ fechaVigencia: "" })}`));

    await ingestSalasAutorizadas();

    const insertCall = queryMock.mock.calls.find(([sql]) => sql.includes("INSERT INTO salas_autorizadas"));
    expect(insertCall![1][6]).toBe(null);
  });

  it("hace upsert por codigo_sala -- actualiza campos sin duplicar la fila", async () => {
    fetchMock.mockResolvedValueOnce(csvResponse(`${HEADER}\n${csvRow()}`));

    await ingestSalasAutorizadas();

    const insertCall = queryMock.mock.calls.find(([sql]) => sql.includes("INSERT INTO salas_autorizadas"));
    expect(insertCall![0]).toMatch(/ON CONFLICT \(codigo_sala\) DO UPDATE SET/);
  });

  it("lanza un error si la fuente responde con un status distinto de 200", async () => {
    fetchMock.mockResolvedValueOnce(csvResponse("", false));

    await expect(ingestSalasAutorizadas()).rejects.toThrow(/MINCETUR devolvió 500/);
  });
});
