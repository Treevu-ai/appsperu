import { describe, expect, it, vi, beforeEach } from "vitest";

const { queryMock, connectMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  connectMock: vi.fn(),
}));

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock, end: vi.fn() },
}));

const { ingestOeceInhabilitacionesJudiciales } = await import("../ingest/oece-inhabilitaciones-judiciales-connector.js");

const ATTACHMENT_LIST_RESPONSE = {
  results: [
    { title: "otro-archivo.docx", _links: { download: "/rest/api/content/106889261/child/attachment/att999/download" } },
    { title: "inhabilitaciones_judiciales.csv", _links: { download: "/rest/api/content/106889261/child/attachment/att106892498/download" } },
  ],
};

const REAL_CSV =
  "FECHA_CORTE|RUC_DNI|NOMBRE_RAZONODENOMINACIONSOCIAL|ORGANO_JURISDICCIONAL|NUMERO_RESOLUCION|FECHA_INICIO|FECHA_FIN\n" +
  "20260901|10040039711|BARRETO MARCELO TEODORO|Corte Superior de Justicia de Pasco|SENTENCIA DE FECHA 28.04.2017|20170428|20250428";

function mockFetchSequence() {
  const fetchMock = vi.fn();
  fetchMock.mockImplementationOnce(async (url: string) => {
    expect(url).toBe("https://osce-gob-pe.atlassian.net/wiki/rest/api/content/106889261/child/attachment");
    return { ok: true, json: async () => ATTACHMENT_LIST_RESPONSE };
  });
  fetchMock.mockImplementationOnce(async (url: string) => {
    // fetch() sigue el redirect 302 hacia api.media.atlassian.com solo -- acá
    // se simula ya resuelto, el conector no maneja el redirect a mano.
    expect(url).toBe("https://osce-gob-pe.atlassian.net/wiki/rest/api/content/106889261/child/attachment/att106892498/download");
    return { ok: true, arrayBuffer: async () => Buffer.from(REAL_CSV, "latin1") };
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  queryMock.mockReset();
  connectMock.mockReset();
  connectMock.mockResolvedValue({ query: queryMock, release: vi.fn() });
  vi.unstubAllGlobals();
});

describe("ingestOeceInhabilitacionesJudiciales", () => {
  it("resuelve el attachment por título (no por posición), descarga y guarda batch + filas aceptadas", async () => {
    mockFetchSequence();
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // saveRawBatch
      .mockResolvedValueOnce(undefined) // insertAceptadas
      .mockResolvedValueOnce(undefined); // insertRechazadas (0 filas, no debería ni llamarse, pero por si acaso)

    const summary = await ingestOeceInhabilitacionesJudiciales();

    expect(summary).toEqual({ batchId: 1, totalFilas: 1, aceptadas: 1, rechazadas: 0 });

    const batchCall = queryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO raw_inhabilitaciones_judiciales_batches"));
    expect(batchCall?.[1]).toEqual([
      "https://osce-gob-pe.atlassian.net/wiki/rest/api/content/106889261/child/attachment/att106892498/download",
      expect.any(String),
      1,
    ]);

    const insertCall = queryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO inhabilitaciones_judiciales "));
    expect(insertCall?.[1]).toEqual(["2026-09-01", "10040039711", "BARRETO MARCELO TEODORO", "Corte Superior de Justicia de Pasco", "SENTENCIA DE FECHA 28.04.2017", "2017-04-28", "2025-04-28", 1]);
  });

  it("decodifica el CSV como Latin-1, no UTF-8 (regresión: nombres con tilde/Ñ llegaban corruptos, verificado en vivo 2026-09-20)", async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ATTACHMENT_LIST_RESPONSE });
    const csvConTilde =
      "FECHA_CORTE|RUC_DNI|NOMBRE_RAZONODENOMINACIONSOCIAL|ORGANO_JURISDICCIONAL|NUMERO_RESOLUCION|FECHA_INICIO|FECHA_FIN\n" +
      "20260901|10803056698|JULIO CESAR REATEGUI V\xC1SQUEZ|Sala Penal Especial|04|20251003|20291003";
    fetchMock.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => Buffer.from(csvConTilde, "latin1") });
    vi.stubGlobal("fetch", fetchMock);
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] }).mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

    await ingestOeceInhabilitacionesJudiciales();

    const insertCall = queryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO inhabilitaciones_judiciales "));
    expect(insertCall?.[1][2]).toBe("JULIO CESAR REATEGUI VÁSQUEZ");
  });

  it("lanza un error accionable si el attachment esperado ya no está en la lista (el archivo cambió de nombre)", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: async () => ({ results: [{ title: "otro-nombre.csv", _links: { download: "/x" } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(ingestOeceInhabilitacionesJudiciales()).rejects.toThrow(/inhabilitaciones_judiciales\.csv/);
    expect(fetchMock).toHaveBeenCalledTimes(1); // nunca llega a intentar la descarga
  });
});
