import { describe, expect, it, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: queryMock, release: releaseMock }));

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

const { ingestCertificacionesEvaluadas } = await import("../ingest/certificaciones-evaluadas-connector.js");

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function textResponse(body: string, ok = true) {
  return { ok, status: ok ? 200 : 500, text: () => Promise.resolve(body) };
}

const HEADER =
  "EXPEDIENTE;DEPARTAMENTO;PROVINCIA;DISTRITO;UBIGEO;TITULAR;RUC_TITULAR;CONSULTORA;RUC_CONSULTORA;TITULO;UNIDAD;TIPO_IGA;ACTIVIDAD;FECHA_INGRESO;ESTADO;LONGITUD;LATITUD;NRO_RD;FECHA_RD;MONTO;MONEDA";

function csvRow(overrides: Partial<Record<string, string>> = {}): string {
  const fields: Record<string, string> = {
    expediente: "T-ITS-00112-2023",
    departamento: "LA LIBERTAD",
    provincia: "TRUJILLO",
    distrito: "TRUJILLO",
    ubigeo: "130101",
    titular: "MINISTERIO DE TRANSPORTES Y COMUNICACIONES",
    rucTitular: "20131379944",
    consultora: "FC INGENIERIA Y SERVICIOS AMBIENTALES S.A.C.",
    rucConsultora: "20543616967",
    titulo: "Proyecto de prueba",
    unidad: "ITS",
    tipoIga: "Evaluación y Aprobación del Informe Técnico Sustentatorio ITS",
    actividad: "Transportes",
    fechaIngreso: "20230505",
    estado: "En Evaluación",
    longitud: "-78.39",
    latitud: "-9.37",
    nroRd: "",
    fechaRd: "",
    monto: "150000",
    moneda: "US$",
    ...overrides,
  };
  return [
    fields.expediente, fields.departamento, fields.provincia, fields.distrito, fields.ubigeo,
    fields.titular, fields.rucTitular, fields.consultora, fields.rucConsultora, fields.titulo,
    fields.unidad, fields.tipoIga, fields.actividad, fields.fechaIngreso, fields.estado,
    fields.longitud, fields.latitud, fields.nroRd, fields.fechaRd, fields.monto, fields.moneda,
  ].join(";");
}

beforeEach(() => {
  queryMock.mockReset();
  releaseMock.mockReset();
  connectMock.mockClear();
  fetchMock.mockReset();
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("INSERT INTO raw_certificaciones_evaluadas_batches")) {
      return Promise.resolve({ rows: [{ id: 1 }] });
    }
    return Promise.resolve({ rows: [] });
  });
});

describe("ingestCertificacionesEvaluadas", () => {
  it("parsea y upserta una fila valida con todos los campos mapeados", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(`${HEADER}\n${csvRow()}`));

    const summary = await ingestCertificacionesEvaluadas();

    expect(summary.filasInsertadas).toBe(1);
    const insertCall = queryMock.mock.calls.find(([sql]) => sql.includes("INSERT INTO certificaciones_evaluadas"));
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toEqual([
      "T-ITS-00112-2023", "LA LIBERTAD", "TRUJILLO", "TRUJILLO", "130101",
      "MINISTERIO DE TRANSPORTES Y COMUNICACIONES", "20131379944",
      "FC INGENIERIA Y SERVICIOS AMBIENTALES S.A.C.", "20543616967",
      "Proyecto de prueba", "ITS", "Evaluación y Aprobación del Informe Técnico Sustentatorio ITS",
      "Transportes", "2023-05-05", "En Evaluación", -78.39, -9.37, null, null, 150000, "US$", 1,
    ]);
  });

  it("descarta filas sin numero de expediente", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(`${HEADER}\n${csvRow({ expediente: "" })}`));

    const summary = await ingestCertificacionesEvaluadas();

    expect(summary.filasInsertadas).toBe(0);
    expect(queryMock.mock.calls.some(([sql]) => sql.includes("INSERT INTO certificaciones_evaluadas"))).toBe(false);
  });

  it("hace upsert por expediente -- actualiza estado/monto sin duplicar la fila", async () => {
    fetchMock.mockResolvedValueOnce(textResponse(`${HEADER}\n${csvRow()}`));

    await ingestCertificacionesEvaluadas();

    const insertCall = queryMock.mock.calls.find(([sql]) => sql.includes("INSERT INTO certificaciones_evaluadas"));
    expect(insertCall![0]).toMatch(/ON CONFLICT \(expediente\) DO UPDATE SET/);
  });

  it("lanza un error si la fuente responde con un status distinto de 200", async () => {
    fetchMock.mockResolvedValueOnce(textResponse("", false));

    await expect(ingestCertificacionesEvaluadas()).rejects.toThrow(/SENACE devolvió 500/);
  });

  it("registra record_count igual a las filas validas (excluye las descartadas por expediente vacio)", async () => {
    fetchMock.mockResolvedValueOnce(
      textResponse(`${HEADER}\n${csvRow()}\n${csvRow({ expediente: "" })}`)
    );

    await ingestCertificacionesEvaluadas();

    const batchInsertCall = queryMock.mock.calls.find(([sql]) =>
      sql.includes("INSERT INTO raw_certificaciones_evaluadas_batches")
    );
    expect(batchInsertCall![1][2]).toBe(1);
  });
});
