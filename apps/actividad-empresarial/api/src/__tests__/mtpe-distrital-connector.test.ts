import { EventEmitter } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const queryMock = vi.fn();
const connectMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

/**
 * La descompresión real de `.7z` ya está fuera de alcance de este test: es
 * un detalle de infraestructura (node-7z + binario bundleado), no lógica de
 * negocio. Se reemplaza por un stub que escribe un `.xlsx` real (construido
 * con la misma librería `exceljs` que usa el conector) en el directorio de
 * destino, para poder probar de punta a punta la resolución del año más
 * reciente, la lectura de la hoja, el upsert mensual y la limpieza del
 * directorio temporal — todo lo que sí es lógica propia del conector.
 */
vi.mock("node-7z", () => ({
  default: {
    extractFull: (_archivePath: string, destDir: string) => {
      const emitter = new EventEmitter();
      (async () => {
        await mkdir(destDir, { recursive: true });
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("EMPRESAS_25");
        sheet.getRow(1).getCell(1).value = "AÑO 2025";
        const header = [
          "UBIGEO", "DISTRITO", "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
          "JULIO", "AGOSTO", "SETIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
        ];
        header.forEach((h, i) => {
          sheet.getRow(3).getCell(i + 1).value = h;
        });
        const dataRow = ["150101", "LIMA", 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];
        dataRow.forEach((v, i) => {
          sheet.getRow(4).getCell(i + 1).value = v;
        });
        const buffer = await workbook.xlsx.writeBuffer();
        await writeFile(path.join(destDir, "empresas.xlsx"), Buffer.from(buffer));
        emitter.emit("end");
      })().catch((err: unknown) => emitter.emit("error", err));
      return emitter;
    },
  },
}));

const { ingestMtpeDistrital } = await import("../ingest/mtpe-distrital-connector.js");

const LISTING_HTML = `
  <a href="https://www.gob.pe/institucion/mtpe/informes-publicaciones/indicadores-a-nivel-de-distrito-2025">2025</a>
  <a href="https://www.gob.pe/institucion/mtpe/informes-publicaciones/indicadores-laborales-a-nivel-de-distrito-2020">2020</a>
`;
const LANDING_HTML = `<a href="https://cdn.www.gob.pe/uploads/document/file/12345/indicadores-2025.7z">Descargar</a>`;

function jsonHtmlResponse(text: string) {
  return { ok: true, status: 200, text: async () => text } as unknown as Response;
}

function binaryResponse(bytes: string) {
  return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(bytes) } as unknown as Response;
}

describe("ingestMtpeDistrital", () => {
  const clientQueryMock = vi.fn();
  const client = {
    query: clientQueryMock,
    release: vi.fn(),
  };

  beforeEach(() => {
    connectMock.mockResolvedValue(client);
    clientQueryMock.mockReset();
    clientQueryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO raw_mtpe_batches")) {
        return Promise.resolve({ rows: [{ id: 7 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "https://www2.trabajo.gob.pe/estadisticas/ind-lab-a-nivel-distrital/") {
          return Promise.resolve(jsonHtmlResponse(LISTING_HTML));
        }
        if (url.includes("indicadores-a-nivel-de-distrito-2025")) {
          return Promise.resolve(jsonHtmlResponse(LANDING_HTML));
        }
        if (url.includes("indicadores-2025.7z")) {
          return Promise.resolve(binaryResponse("archivo-7z-simulado"));
        }
        throw new Error(`fetch inesperado: ${url}`);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resuelve el año más reciente, extrae la hoja correcta e inserta los 12 meses del distrito", async () => {
    const summary = await ingestMtpeDistrital();

    expect(summary.anio).toBe(2025);
    expect(summary.resourceUrl).toBe("https://cdn.www.gob.pe/uploads/document/file/12345/indicadores-2025.7z");
    expect(summary.filasOrigen).toBe(1);
    expect(summary.filasInsertadas).toBe(1);
    expect(summary.filasSinUbigeo).toBe(0);

    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");
    expect(client.release).toHaveBeenCalled();

    const empresasInserts = clientQueryMock.mock.calls.filter(
      ([sql]) => typeof sql === "string" && sql.includes("INSERT INTO empresas_privadas_distrito")
    );
    expect(empresasInserts).toHaveLength(12); // un insert por mes

    const [, eneroParams] = empresasInserts[0];
    expect(eneroParams).toEqual(["150101", 2025, 1, "LIMA", 10, 7]);
  });

  it("hace rollback y libera el cliente si un insert falla a mitad de la ingesta", async () => {
    clientQueryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO raw_mtpe_batches")) {
        return Promise.resolve({ rows: [{ id: 7 }] });
      }
      if (typeof sql === "string" && sql.includes("INSERT INTO empresas_privadas_distrito")) {
        return Promise.reject(new Error("constraint violation"));
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(ingestMtpeDistrital()).rejects.toThrow("constraint violation");
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });

  it("propaga un error claro si la página de listado devuelve un status distinto de 2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 500 } as Response))
    );
    await expect(ingestMtpeDistrital()).rejects.toThrow(/500/);
  });
});
