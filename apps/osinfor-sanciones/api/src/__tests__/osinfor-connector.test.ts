import { describe, expect, it, vi, beforeEach } from "vitest";

const queryMock = vi.fn();
const releaseMock = vi.fn();
const onMock = vi.fn();
const connectMock = vi.fn(() => Promise.resolve({ query: queryMock, release: releaseMock, on: onMock }));

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock, query: queryMock },
  connectSafe: connectMock,
}));

const { ingestOsinforSanciones } = await import("../ingest/osinfor-connector.js");

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const HEADER =
  "FECHA_CORTE;ANIO_SUPERV;TITULAR;TITULO;MODALIDAD;UBIGEO;DEPARTAMENTO;PROVINCIA;DISTRITO;RD_TERMINO;INFRACCIONES;NUM_RESODIREC_RR;NUM_RESODIREC_TFFS;CADUCIDAD;SANCION;MONTO_MULTA;AREA_OTORGADA";

function csvResponse(body: string, ok = true) {
  return { ok, status: ok ? 200 : 500, text: () => Promise.resolve(body) };
}

beforeEach(() => {
  queryMock.mockReset();
  releaseMock.mockReset();
  connectMock.mockClear();
  fetchMock.mockReset();
  queryMock.mockImplementation((sql: string) => {
    if (sql.includes("INSERT INTO raw_osinfor_batches")) {
      return Promise.resolve({ rows: [{ id: 1 }] });
    }
    return Promise.resolve({ rows: [] });
  });
});

describe("ingestOsinforSanciones", () => {
  it("parsea y normaliza una fila válida del CSV (fecha YYYYMMDD, decimales, booleano)", async () => {
    const csv = `${HEADER}\n20260814;2025;GARAYAR GUEVARA JOSE ANTONIO;19-SEC/PER-FMP-2023-010;Permisos Forestales - Predio Privado;190304;PASCO;OXAPAMPA;PALCAZU;000009-2026-OSINFOR/DPSFFS;DS 007-2021-MIDAGRI MATERIA FORESTAL: 11;;;NO;MULTA;0.309;26.20`;
    fetchMock.mockResolvedValue(csvResponse(csv));

    const summary = await ingestOsinforSanciones();
    expect(summary.filasInsertadas).toBe(1);

    const insertCall = queryMock.mock.calls.find(([sql]) => sql.includes("INSERT INTO sanciones_osinfor"));
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[0]).toBe("2026-08-14"); // fecha_corte
    expect(params[1]).toBe(2025); // anio_superv
    expect(params[2]).toBe("GARAYAR GUEVARA JOSE ANTONIO"); // titular
    expect(params[11]).toBeNull(); // num_resodirec_rr vacío -> null
    expect(params[13]).toBe(false); // caducidad "NO" -> false
    expect(params[15]).toBe(0.309); // monto_multa_uit
    expect(params[16]).toBe(26.2); // area_otorgada_ha
  });

  it("marca CADUCIDAD='SI' como true", async () => {
    const csv = `${HEADER}\n20260101;2024;TITULAR TEST;TITULO-1;MODALIDAD;010101;LIMA;LIMA;LIMA;RD-1;;;;SI;CADUCIDAD;0.000;1.00`;
    fetchMock.mockResolvedValue(csvResponse(csv));

    await ingestOsinforSanciones();
    const insertCall = queryMock.mock.calls.find(([sql]) => sql.includes("INSERT INTO sanciones_osinfor"));
    const params = insertCall![1] as unknown[];
    expect(params[13]).toBe(true);
  });

  it("borra el snapshot anterior antes de insertar (carga completa, no incremental)", async () => {
    fetchMock.mockResolvedValue(csvResponse(HEADER));
    await ingestOsinforSanciones();
    const deleteCalls = queryMock.mock.calls.filter(([sql]) => sql.includes("DELETE FROM sanciones_osinfor"));
    expect(deleteCalls).toHaveLength(1);
  });

  it("lanza un error claro si las columnas del CSV cambiaron", async () => {
    fetchMock.mockResolvedValue(csvResponse("COL_A;COL_B\nx;y"));
    await expect(ingestOsinforSanciones()).rejects.toThrow(/Columnas del CSV de OSINFOR cambiaron/);
  });

  it("lanza un error si el portal responde con un status no-ok", async () => {
    fetchMock.mockResolvedValue(csvResponse("", false));
    await expect(ingestOsinforSanciones()).rejects.toThrow(/devolvió 500/);
  });

  it("hace rollback si falla la inserción", async () => {
    const csv = `${HEADER}\n20260101;2024;TITULAR TEST;TITULO-1;MODALIDAD;010101;LIMA;LIMA;LIMA;RD-1;;;;NO;MULTA;1.000;1.00`;
    fetchMock.mockResolvedValue(csvResponse(csv));
    queryMock.mockImplementation((sql: string) => {
      if (sql.includes("INSERT INTO raw_osinfor_batches")) return Promise.resolve({ rows: [{ id: 1 }] });
      if (sql.includes("INSERT INTO sanciones_osinfor")) return Promise.reject(new Error("boom"));
      return Promise.resolve({ rows: [] });
    });

    await expect(ingestOsinforSanciones()).rejects.toThrow("boom");
    const rollbackCalls = queryMock.mock.calls.filter(([sql]) => sql === "ROLLBACK");
    expect(rollbackCalls).toHaveLength(1);
    expect(releaseMock).toHaveBeenCalled();
  });
});
