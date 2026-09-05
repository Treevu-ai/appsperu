import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const connectMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { connect: connectMock },
}));

const { ingestInfomidis } = await import("../ingest/infomidis-connector.js");

const PACKAGE_SHOW_BODY = {
  success: true,
  result: {
    resources: [
      { id: "r1", name: "AGOSTO 2024", format: "csv", url: "https://x/202408_INFOMIDIS.csv", created: "Jue, 10/31/2024 - 10:54" },
      { id: "r2", name: "ABRIL 2026", format: ".csv", url: "https://x/ABRIL_2026.csv", created: "Lun, 08/03/2026 - 16:59" },
      { id: "r3", name: "Diccionario", format: "xlsx", url: "https://x/Diccionario.xlsx", created: "Vie, 12/01/2026 - 00:00" },
    ],
  },
};

const HEADER =
  "FECHA_CORTE;UBIGEO;CUNAMAS - Cuidado Diurno;CUNAMAS - Acompañamiento de Familias;JUNTOS - Hogares afiliados;JUNTOS - Hogares abonados;FONCODES - N° usuarios estimados;FONCODES - N° proy. Culminados;FONCODES - N° proy. en ejecucion;FONCODES - N° Hog. Haku Winay -proyectos en ejecucion;FONCODES - N° Hog. Haku Winay -proyectos culminados;PENSION 65 - Usuarios;QALI WARMA - N° de Niños y niñas atendidos;QALI WARMA - N° de IIEE;CONTIGO - Usuarios;PAIS - N° de Tambos prestando servicios;PAIS - N° de Atenciones realizadas a través de los Tambos;PAIS - N° de Beneficiarios atendidos a través de los Tambos";

// Fila 1: completa. Fila 2: sin UBIGEO (se descarta). Fila 3: FECHA_CORTE inválida (se descarta).
const CSV_BODY = [
  HEADER,
  "20241031;010101;96;90;493;423;;;;;;642;5,234;34;252;;;",
  "20241031;;0;0;10;10;;;;;;5;10;1;2;;;",
  "31-10-2024;010102;0;0;10;10;;;;;;5;10;1;2;;;",
].join("\n");

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function textResponse(text: string) {
  return { ok: true, status: 200, arrayBuffer: async () => Buffer.from(text, "latin1") } as unknown as Response;
}

describe("ingestInfomidis", () => {
  const clientQueryMock = vi.fn();
  const client = { query: clientQueryMock, release: vi.fn() };

  beforeEach(() => {
    connectMock.mockResolvedValue(client);
    clientQueryMock.mockReset();
    clientQueryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO raw_infomidis_batches")) {
        return Promise.resolve({ rows: [{ id: 7 }] });
      }
      return Promise.resolve({ rows: [] });
    });

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("package_show")) return Promise.resolve(jsonResponse(PACKAGE_SHOW_BODY));
        if (url.includes("ABRIL_2026.csv")) return Promise.resolve(textResponse(CSV_BODY));
        throw new Error(`fetch inesperado: ${url}`);
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("elige el recurso más reciente por `created`, inserta filas válidas y cuenta descartes", async () => {
    const summary = await ingestInfomidis();

    expect(summary.resourceUrl).toBe("https://x/ABRIL_2026.csv");
    expect(summary.filasOrigen).toBe(3);
    expect(summary.filasInsertadas).toBe(1);
    expect(summary.filasSinUbigeo).toBe(1);
    expect(summary.filasSinFechaCorte).toBe(1);
    expect(summary.columnasFaltantes).toEqual([]);

    expect(clientQueryMock).toHaveBeenCalledWith("BEGIN");
    expect(clientQueryMock).toHaveBeenCalledWith("COMMIT");

    const insertCall = clientQueryMock.mock.calls.find(([sql]) => typeof sql === "string" && sql.includes("INSERT INTO cobertura_social"));
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[0]).toBe("010101"); // ubigeo
    expect(params[1]).toBe("2024-10-31"); // fecha_corte
    expect(params[2]).toBe(96); // cunamas_cuidado_diurno
    expect(params[7]).toBe(5234); // qaliwarma_ninos_atendidos, de "5,234"
  });

  it("reporta columnasFaltantes sin fallar si el esquema del corte cambia", async () => {
    const csvSinPension = [
      "FECHA_CORTE;UBIGEO;CUNAMAS - Cuidado Diurno",
      "20241031;010101;96",
    ].join("\n");

    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("package_show")) return Promise.resolve(jsonResponse(PACKAGE_SHOW_BODY));
        if (url.includes("ABRIL_2026.csv")) return Promise.resolve(textResponse(csvSinPension));
        throw new Error(`fetch inesperado: ${url}`);
      })
    );

    const summary = await ingestInfomidis();
    expect(summary.columnasFaltantes).toContain("pension65Usuarios");
    expect(summary.columnasFaltantes).toContain("juntosAfiliados");
  });

  it("hace rollback si una inserción falla a mitad de la ingesta", async () => {
    clientQueryMock.mockImplementation((sql: string) => {
      if (typeof sql === "string" && sql.includes("INSERT INTO raw_infomidis_batches")) {
        return Promise.resolve({ rows: [{ id: 7 }] });
      }
      if (typeof sql === "string" && sql.includes("INSERT INTO cobertura_social")) {
        return Promise.reject(new Error("constraint violation"));
      }
      return Promise.resolve({ rows: [] });
    });

    await expect(ingestInfomidis()).rejects.toThrow("constraint violation");
    expect(clientQueryMock).toHaveBeenCalledWith("ROLLBACK");
    expect(client.release).toHaveBeenCalled();
  });
});
