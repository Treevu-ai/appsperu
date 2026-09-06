import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const queryMock = vi.fn();
const connectMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

const { ingestRenipress } = await import("../ingest/renipress-connector.js");

const PACKAGE_SHOW_BODY = {
  success: true,
  result: {
    resources: [
      { id: "r1", name: "RENIPRESS - Agosto 2026", format: "CSV", url: "https://x/RENIPRESS_31-08-2026.csv" },
      { id: "r2", name: "Diccionario", format: "XLSX", url: "https://x/Diccionario.xlsx" },
    ],
  },
};

const CSV_HEADER =
  "INSTITUCION;COD_IPRESS;NOMBRE;CLASIFICACION;TIPO_ESTABLECIMIENTO;DEPARTAMENTO;PROVINCIA;DISTRITO;UBIGEO;DIRECCION;CO_DISA;COD_RED;COD_MICRORRED;DISA;RED;MICRORED;COD_UE;UNIDAD_EJECUTORA;CATEGORIA;TELEFONO;HORARIO;INICIO_ACTIVIDAD;ESTADO;NORTE;ESTE;IMAGEN_1;FE_ACT_IMAGEN_1;IMAGEN_2;FE_ACT_IMAGEN_2;IMAGEN_3;FE_ACT_IMAGEN_3";

// Fila 1: completa y válida. Fila 2: sin COD_IPRESS (se descarta). Fila 3: sin UBIGEO (se inserta, se cuenta).
const CSV_BODY = [
  CSV_HEADER,
  "GOBIERNO REGIONAL;00002806;LA NOVIA;PUESTOS DE SALUD;ESTAB SIN INTERNAMIENTO;MADRE DE DIOS;TAHUAMANU;TAHUAMANU;170303;DIR;25;00;915;DISA;RED;MICRO;879;UE;I-1;973267838;7-19;1995-01-01;ACTIVO;-11.86;-69.13;;;;;;",
  "GOBIERNO REGIONAL;;SIN CODIGO;PUESTOS DE SALUD;ESTAB SIN INTERNAMIENTO;LIMA;LIMA;LIMA;150101;DIR;25;00;915;DISA;RED;MICRO;879;UE;I-1;973267838;7-19;1995-01-01;ACTIVO;-12;-77;;;;;;",
  "GOBIERNO REGIONAL;00009999;SIN UBIGEO;PUESTOS DE SALUD;ESTAB SIN INTERNAMIENTO;LIMA;LIMA;LIMA;;DIR;25;00;915;DISA;RED;MICRO;879;UE;I-1;973267838;7-19;1995-01-01;ACTIVO;-12;-77;;;;;;",
].join("\n");

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function textResponse(text: string) {
  return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(text, "utf-8") } as unknown as Response;
}

describe("ingestRenipress", () => {
  const clientQueryMock = vi.fn();
  const client = {
    query: clientQueryMock,
    release: vi.fn(),
  };

  beforeEach(() => {
    connectMock.mockResolvedValue(client);
    clientQueryMock.mockReset();
    clientQueryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO raw_renipress_batches")) {
        return Promise.resolve({ rows: [{ id: 42 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("package_show")) return Promise.resolve(jsonResponse(PACKAGE_SHOW_BODY));
        if (url.includes("RENIPRESS_31-08-2026.csv")) return Promise.resolve(textResponse(CSV_BODY));
        throw new Error(`fetch inesperado: ${url}`);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resuelve el recurso más reciente, inserta filas válidas y cuenta descartes/faltantes", async () => {
    const summary = await ingestRenipress();

    expect(summary.resourceUrl).toBe("https://x/RENIPRESS_31-08-2026.csv");
    expect(summary.filasOrigen).toBe(3);
    expect(summary.filasInsertadas).toBe(2); // fila sin COD_IPRESS se descarta, no se inserta
    expect(summary.filasSinCodIpress).toBe(1);
    expect(summary.filasSinUbigeo).toBe(1); // la fila sin UBIGEO sí se inserta, pero se cuenta

    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  it("hace rollback y libera el cliente si una query falla a mitad de la ingesta", async () => {
    clientQueryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO raw_renipress_batches")) {
        return Promise.resolve({ rows: [{ id: 42 }] });
      }
      if (typeof sql === "string" && sql.includes("INSERT INTO ipress")) {
        return Promise.reject(new Error("constraint violation"));
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(ingestRenipress()).rejects.toThrow("constraint violation");
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });

  it("propaga un error claro si package_show devuelve un status distinto de 2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 418 } as Response))
    );
    await expect(ingestRenipress()).rejects.toThrow(/418/);
  });
});
