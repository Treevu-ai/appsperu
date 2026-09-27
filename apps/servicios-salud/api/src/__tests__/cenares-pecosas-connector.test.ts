import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const queryMock = vi.fn();
const connectMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

const { ingestCenaresPecosas } = await import("../ingest/cenares-pecosas-connector.js");

const PACKAGE_SHOW_BODY = {
  success: true,
  result: {
    resources: [
      { id: "r1", name: "DATASET Pecosa 2023", format: "csv", url: "https://x/DATASET_PECOSA2023.csv" },
      { id: "r2", name: "Diccionario", format: ".xlsx", url: "https://x/Diccionario.xlsx" },
    ],
  },
};

const CSV_HEADER =
  "ANIOPECOSA;NROPECOSA;FECHAPECOSA;CODIGO_SIGA;NOMBRE_ALM;NROPEDIDO;DESCMARCAPECOSA;ANIO_OC;NRO_OC;OBSERVACION_OC;MARCA_OC;PROVEEDOR;DESC_PROVEEDOR";

// Fila 1: completa y válida. Fila 2: desalineada (le faltan columnas) -- se descarta.
const CSV_BODY = [
  CSV_HEADER,
  "2023;15207;6/03/2023;583800810004;NO REFRIG;18390;HYOS-B20;2023;1996;OBS;42390;663;DROGUERIA JPS S.A.C",
  "2023;15208;6/03/2023;1;NOMBRE;18391;ITEM;2023;1;OBS;42390",
].join("\n");

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function textResponse(text: string) {
  return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(text, "utf-8") } as unknown as Response;
}

describe("ingestCenaresPecosas", () => {
  const clientQueryMock = vi.fn();
  const client = {
    query: clientQueryMock,
    release: vi.fn(),
  };

  beforeEach(() => {
    connectMock.mockResolvedValue(client);
    clientQueryMock.mockReset();
    clientQueryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("SELECT id FROM raw_cenares_pecosas_batches")) {
        return Promise.resolve({ rows: [] });
      }
      if (typeof sql === "string" && sql.includes("INSERT INTO raw_cenares_pecosas_batches")) {
        return Promise.resolve({ rows: [{ id: 42 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("package_show")) return Promise.resolve(jsonResponse(PACKAGE_SHOW_BODY));
        if (url.includes("DATASET_PECOSA2023.csv")) return Promise.resolve(textResponse(CSV_BODY));
        throw new Error(`fetch inesperado: ${url}`);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resuelve el recurso CSV, inserta filas válidas y cuenta descartes", async () => {
    const summary = await ingestCenaresPecosas();

    expect(summary.resourceUrl).toBe("https://x/DATASET_PECOSA2023.csv");
    expect(summary.yaIngerido).toBe(false);
    expect(summary.filasOrigen).toBe(1);
    expect(summary.filasInsertadas).toBe(1);
    expect(summary.filasRechazadas).toBe(1);

    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();
  });

  it("no reinserta si el checksum ya existe (mismo contenido)", async () => {
    clientQueryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("SELECT id FROM raw_cenares_pecosas_batches")) {
        return Promise.resolve({ rows: [{ id: 7 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    const summary = await ingestCenaresPecosas();
    expect(summary.yaIngerido).toBe(true);
    expect(summary.batchId).toBe(7);
    expect(summary.filasInsertadas).toBe(0);
    expect(clientQueryMock).not.toHaveBeenCalledWith("BEGIN");
  });

  it("hace rollback y libera el cliente si una query falla a mitad de la ingesta", async () => {
    clientQueryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("SELECT id FROM raw_cenares_pecosas_batches")) {
        return Promise.resolve({ rows: [] });
      }
      if (typeof sql === "string" && sql.includes("INSERT INTO raw_cenares_pecosas_batches")) {
        return Promise.resolve({ rows: [{ id: 42 }] });
      }
      if (typeof sql === "string" && sql.includes("INSERT INTO cenares_pecosas")) {
        return Promise.reject(new Error("constraint violation"));
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(ingestCenaresPecosas()).rejects.toThrow("constraint violation");
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });

  it("propaga un error claro si la descarga del CSV devuelve un status distinto de 2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("package_show")) return Promise.resolve(jsonResponse(PACKAGE_SHOW_BODY));
        return Promise.resolve({ ok: false, status: 503 } as Response);
      })
    );
    await expect(ingestCenaresPecosas()).rejects.toThrow(/503/);
  });
});
