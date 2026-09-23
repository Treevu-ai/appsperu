import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const connectMock = vi.fn();

vi.mock("../db/pool.js", () => ({ pool: { connect: connectMock } }));

const {
  findReactivoMatches,
  firstAwardOf,
  isReactivoText,
  recordByOcidUrl,
  releasesPageUrl,
  scanReactivosMedicos,
} = await import("../ingest/reactivos-medicos-scan.js");
import type { OcdsReleaseWithItems } from "../ingest/reactivos-medicos-scan.js";
import type { OcdsRecord } from "../ingest/normalize-awards.js";

describe("isReactivoText", () => {
  it("detecta menciones a reactivo/reactivos sin importar mayúsculas", () => {
    expect(isReactivoText("REACTIVO DPD P/CLORO LIBRE Y TOTAL")).toBe(true);
    expect(isReactivoText("Adquisición de reactivos de bioquímica")).toBe(true);
    expect(isReactivoText("reactiva")).toBe(true); // prefijo REACTIV, aceptable como falso positivo leve
  });

  it("no matchea texto que no menciona reactivo", () => {
    expect(isReactivoText("BALON DE GAS VACIO PARA GAS PROPANO")).toBe(false);
    expect(isReactivoText("REACTOR NUCLEAR")).toBe(false); // no comparte el prefijo REACTIV
    expect(isReactivoText(null)).toBe(false);
    expect(isReactivoText(undefined)).toBe(false);
    expect(isReactivoText("")).toBe(false);
  });
});

describe("releasesPageUrl / recordByOcidUrl", () => {
  it("arma la URL de /releases con categoría goods y ventana de fechas", () => {
    const url = releasesPageUrl(3, "2026-06-01", "2026-09-23");
    expect(url).toContain("page=3");
    expect(url).toContain("mainProcurementCategory=goods");
    expect(url).toContain("startDate=2026-06-01");
    expect(url).toContain("endDate=2026-09-23");
  });

  it("arma la URL de /records filtrando por ocid", () => {
    expect(recordByOcidUrl("ocds-dgv273-seacev3-1251069")).toBe(
      "https://contratacionesabiertas.oece.gob.pe/api/v1/records?ocid=ocds-dgv273-seacev3-1251069"
    );
  });
});

describe("findReactivoMatches", () => {
  it("emite una fila por ítem que menciona reactivo dentro de un release", () => {
    const releases: OcdsReleaseWithItems[] = [
      {
        ocid: "ocds-1",
        buyer: { id: "PE-1", name: "ESSALUD" },
        tender: {
          title: "LP-SM-1-2026-ESSALUD-1",
          datePublished: "2026-08-19T00:00:00-05:00",
          value: { amount: 100, currency: "PEN" },
          items: [
            { description: "REACTIVOS DE BIOQUIMICA" },
            { description: "GUANTES DE LATEX" },
          ],
        },
      },
    ];
    const matches = findReactivoMatches(releases);
    expect(matches).toHaveLength(1);
    expect(matches[0].itemDesc).toBe("REACTIVOS DE BIOQUIMICA");
    expect(matches[0].buyerName).toBe("ESSALUD");
  });

  it("cae al título del proceso cuando no hay ítems desglosados pero el título sí menciona reactivo", () => {
    const releases: OcdsReleaseWithItems[] = [
      {
        ocid: "ocds-2",
        buyer: { id: "PE-2", name: "GORE ICA" },
        tender: { title: "ADQUISICION DE REACTIVOS PARA HEMOGRAMA" },
      },
    ];
    const matches = findReactivoMatches(releases);
    expect(matches).toHaveLength(1);
    expect(matches[0].itemDesc).toBe("ADQUISICION DE REACTIVOS PARA HEMOGRAMA");
  });

  it("no emite nada para releases sin mención a reactivo, y descarta releases sin ocid", () => {
    const releases: OcdsReleaseWithItems[] = [
      { ocid: "ocds-3", tender: { title: "BALON DE GAS" } },
      { tender: { title: "REACTIVO SIN OCID" } },
    ];
    expect(findReactivoMatches(releases)).toHaveLength(0);
  });

  it("no colisiona itemDesc cuando dos ítems distintos tienen description vacía pero matchean por classification.description (regresión del hallazgo HIGH del code-reviewer)", () => {
    const releases: OcdsReleaseWithItems[] = [
      {
        ocid: "ocds-7",
        buyer: { id: "PE-7", name: "HOSPITAL X" },
        tender: {
          title: "PROCESO GENERICO",
          items: [
            { description: "", classification: { description: "REACTIVO DE HEMATOLOGIA" } },
            { description: "", classification: { description: "REACTIVO DE INMUNOLOGIA" } },
          ],
        },
      },
    ];
    const matches = findReactivoMatches(releases);
    expect(matches).toHaveLength(2);
    expect(matches[0].itemDesc).toBe("REACTIVO DE HEMATOLOGIA");
    expect(matches[1].itemDesc).toBe("REACTIVO DE INMUNOLOGIA");
    expect(matches[0].itemDesc).not.toBe(matches[1].itemDesc);
  });
});

describe("firstAwardOf", () => {
  it("devuelve el primer award con proveedor completo", () => {
    const record: OcdsRecord = {
      ocid: "ocds-4",
      compiledRelease: {
        awards: [
          { id: "a1", suppliers: [{ id: undefined, name: "SIN RUC" }] },
          { id: "a2", suppliers: [{ id: "PE-RUC-1", name: "DIVCOM S.A.C." }], value: { amount: 385200, currency: "PEN" }, date: "2026-09-22" },
        ],
      },
    };
    const award = firstAwardOf(record);
    expect(award).toEqual({
      supplierId: "PE-RUC-1",
      supplierName: "DIVCOM S.A.C.",
      valor: 385200,
      moneda: "PEN",
      fecha: "2026-09-22",
    });
  });

  it("devuelve null si el record no tiene awards o el proveedor está incompleto", () => {
    expect(firstAwardOf(undefined)).toBeNull();
    expect(firstAwardOf({ ocid: "ocds-5", compiledRelease: {} })).toBeNull();
    expect(
      firstAwardOf({ ocid: "ocds-6", compiledRelease: { awards: [{ id: "a1", suppliers: [] }] } })
    ).toBeNull();
  });
});

function jsonResponse(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe("scanReactivosMedicos", () => {
  const clientQueryMock = vi.fn();
  const client = { query: clientQueryMock, release: vi.fn() };

  beforeEach(() => {
    connectMock.mockResolvedValue(client);
    clientQueryMock.mockReset().mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pagina /releases, filtra por reactivo, cruza con /records y hace upsert con los campos correctos", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.includes("/releases") && url.includes("page=1")) {
          return Promise.resolve(
            jsonResponse({
              releases: [
                {
                  ocid: "ocds-8",
                  buyer: { id: "PE-8", name: "ESSALUD" },
                  tender: { title: "ADQUISICION DE REACTIVOS DE BIOQUIMICA", datePublished: "2026-09-01T00:00:00-05:00" },
                },
              ],
            })
          );
        }
        if (url.includes("/releases")) return Promise.resolve(jsonResponse({ releases: [] }));
        if (url.includes("/records?ocid=ocds-8")) {
          return Promise.resolve(
            jsonResponse({
              records: [
                {
                  ocid: "ocds-8",
                  compiledRelease: {
                    awards: [{ id: "a1", suppliers: [{ id: "PE-RUC-9", name: "PROVEEDOR X" }], value: { amount: 1000, currency: "PEN" }, date: "2026-09-10" }],
                  },
                },
              ],
            })
          );
        }
        throw new Error(`fetch inesperado: ${url}`);
      })
    );

    const summary = await scanReactivosMedicos({ startDate: "2026-01-01", endDate: "2026-09-23" });

    expect(summary.releasesScanned).toBe(1);
    expect(summary.matches).toBe(1);
    expect(summary.matchesConAward).toBe(1);
    expect(summary.filasUpsertadas).toBe(1);

    expect(clientQueryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = clientQueryMock.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (ocid, item_desc) DO UPDATE SET");
    expect(sql).toContain("buyer_name = EXCLUDED.buyer_name"); // refresca campos de tender, no solo award
    expect(params).toEqual([
      "ocds-8",
      "PE-8",
      "ESSALUD",
      null,
      "ADQUISICION DE REACTIVOS DE BIOQUIMICA",
      "ADQUISICION DE REACTIVOS DE BIOQUIMICA",
      null,
      null,
      "2026-09-01T00:00:00-05:00",
      "PE-RUC-9",
      "PROVEEDOR X",
      1000,
      "PEN",
      "2026-09-10",
    ]);
    expect(client.release).toHaveBeenCalled();
  });

  it("no llama a /records ni hace upsert cuando no hay matches", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(jsonResponse({ releases: [] }))));

    const summary = await scanReactivosMedicos({ startDate: "2026-01-01", endDate: "2026-09-23" });

    expect(summary.matches).toBe(0);
    expect(summary.filasUpsertadas).toBe(0);
    expect(clientQueryMock).not.toHaveBeenCalled();
  });
});
