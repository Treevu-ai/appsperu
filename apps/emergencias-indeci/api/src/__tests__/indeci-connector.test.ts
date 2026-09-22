import { describe, expect, it, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: queryMock, release: releaseMock }));

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

const { ingestIndeci } = await import("../ingest/indeci-connector.js");

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const REAL_ROW =
  "351;11/02/2003;2003;FEBRERO;010101;AMAZONAS;CHACHAPOYAS;CHACHAPOYAS;LLUVIA INTENSA;ORIGEN NATURAL;SIERRA;0;0;0;4;0;1;0;0;0;;;;;;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;0;363.24;345.4446";
const HEADER =
  "CODIGO DE EMERGENCIA-SINPAD;FECHA  DE LA EMER;AÑO;MES;COD. DISTRITO;DPTO.;PROV.;DIST.;PELIGRO;TIPO DE PELIGRO;REGIÓN NATURAL;FALLECIDOS;DESAPARECIDOS;LESIONADOS;DAMNIFICADOS;AFECTADOS;VIVIENDAS DESTRUIDAS;VIVIENDAS AFECTADAS;CENTROS EDUCATIVOS DESTRUIDOS;CENTROS EDUCATIVOS AFECTADOS;SCANT_CCEE;SAFEC_AULA;AULA_DES+INHA;SDESTRU_AULA;SINHAB_AULA;CENTROS SALUD DESTRUIDOS;CENTROS SALUD AFECTADOS;HAS CULTIVO DESTRUIDO;HAS CULTIVO AFECTADO;PUENTE DESTRUIDO;PUENTE AFECTADO;CARRETERA DESTRUIDA KM ;CARRETERA AFECTADA KM;CAMINO RURAL DESTRUIDO KM;CAMINO RURAL AFECTADO KM;CANAL DE REGADIO COLAPSADO;CANAL DE REGADIO AFECTADO;PERDIDA VACUNO;AFECTADOS VACUNO;PERDIDA CAMELIDO;AFECTADOS CAMELIDO;PERDIDA CAPRINO;AFECTADOS CAPRINO;PERDIDA PORCINO;AFECTADOS PORCINO;PERDIDA DE ANIMALES MENORES;AFECTA DE ANIMALES MENORES;PESO DE LA AYUDA;COSTO DE LA AYUDA";

function csvResponse(lines: string[], ok = true) {
  const text = [HEADER, ...lines].join("\r\n");
  return {
    ok,
    status: ok ? 200 : 500,
    // `Buffer.from(text).buffer` por sí solo puede devolver el ArrayBuffer completo del pool
    // interno de Node (más grande que el texto real, cuando Node reutiliza un buffer compartido
    // para strings cortas) -- hay que recortarlo a byteOffset/byteLength reales, igual que
    // reproduciría un `fetch` real (que sí devuelve exactamente los bytes de la respuesta).
    arrayBuffer: () => {
      const buf = Buffer.from(text, "latin1");
      return Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    },
  };
}

beforeEach(() => {
  queryMock.mockReset();
  releaseMock.mockReset();
  connectMock.mockClear();
  fetchMock.mockReset();
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("INSERT INTO raw_indeci_batches")) {
      return Promise.resolve({ rows: [{ id: 1 }] });
    }
    return Promise.resolve({ rows: [] });
  });
});

describe("ingestIndeci", () => {
  it("descarga, decodifica latin1 y normaliza el CSV real", async () => {
    fetchMock.mockResolvedValueOnce(csvResponse([REAL_ROW]));

    const summary = await ingestIndeci();

    expect(summary).toMatchObject({ filasOrigen: 1, filasInsertadas: 1, filasRechazadas: 0 });
    const insertCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("INSERT INTO indeci_emergencias "));
    expect(insertCalls).toHaveLength(1);
  });

  it("lanza un error si la descarga falla, sin tratarla como un CSV vacío", async () => {
    fetchMock.mockResolvedValueOnce(csvResponse([], false));

    await expect(ingestIndeci()).rejects.toThrow(/500/);
  });

  it("borra, dentro de la misma transacción, el snapshot completo antes de insertar el nuevo (archivo histórico republicado, no una API incremental)", async () => {
    fetchMock.mockResolvedValueOnce(csvResponse([REAL_ROW]));

    await ingestIndeci();

    const deleteCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("DELETE FROM indeci_emergencias"));
    expect(deleteCalls).toHaveLength(1);
    expect(deleteCalls[0][1]).toEqual([1]);
    expect(releaseMock).toHaveBeenCalled();
  });

  it("guarda record_count con el total real de filas de origen", async () => {
    const badRow = REAL_ROW.split(";").slice(0, 40).join(";"); // menos columnas de las esperadas
    fetchMock.mockResolvedValueOnce(csvResponse([REAL_ROW, badRow]));

    await ingestIndeci();

    const updateCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("UPDATE raw_indeci_batches"));
    expect(updateCalls[0][1]).toEqual([2, 1]); // 2 filas de origen (1 insertada + 1 rechazada)
  });

  it("hace rollback si algo falla dentro de la transacción", async () => {
    fetchMock.mockResolvedValueOnce(csvResponse([REAL_ROW]));
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO raw_indeci_batches")) return Promise.resolve({ rows: [{ id: 1 }] });
      if (sql.startsWith("DELETE FROM indeci_emergencias")) return Promise.reject(new Error("db error"));
      return Promise.resolve({ rows: [] });
    });

    await expect(ingestIndeci()).rejects.toThrow(/db error/);
    expect(queryMock.mock.calls.some(([sql]) => sql === "ROLLBACK")).toBe(true);
    expect(releaseMock).toHaveBeenCalled();
  });
});
