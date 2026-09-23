import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const connectMock = vi.fn();

vi.mock("../db/pool.js", () => ({ pool: { connect: connectMock } }));

const {
  awardFromBulkRelease,
  bulkYearUrl,
  iterateBulkReleases,
  resolveBulkYears,
  scanBulkReactivos,
} = await import("../ingest/oece-bulk-reactivos.js");
import type { OcdsBulkRelease } from "../ingest/oece-bulk-reactivos.js";

describe("bulkYearUrl", () => {
  it("arma la URL del bulk anual republicado por OCP", () => {
    expect(bulkYearUrl(2025)).toBe(
      "https://data.open-contracting.org/en/publication/135/download?name=2025.jsonl.gz"
    );
  });
});

describe("resolveBulkYears", () => {
  it("acepta un año único", () => {
    expect(resolveBulkYears("2025")).toEqual([2025]);
  });

  it("acepta un rango YYYY-YYYY", () => {
    expect(resolveBulkYears("2022-2026")).toEqual([2022, 2023, 2024, 2025, 2026]);
  });

  it("acepta una lista separada por comas, ordenada", () => {
    expect(resolveBulkYears("2026,2022,2024")).toEqual([2022, 2024, 2026]);
  });

  it("'all' devuelve 2003 hasta el año actual", () => {
    const years = resolveBulkYears("all");
    expect(years[0]).toBe(2003);
    expect(years[years.length - 1]).toBe(new Date().getFullYear());
  });

  it("rechaza un rango invertido o un año no numérico", () => {
    expect(() => resolveBulkYears("2026-2022")).toThrow();
    expect(() => resolveBulkYears("no-es-un-año")).toThrow();
  });
});

describe("awardFromBulkRelease", () => {
  it("devuelve el primer award con proveedor completo, embebido en el release", () => {
    const release: OcdsBulkRelease = {
      ocid: "ocds-1",
      awards: [
        { id: "a1", suppliers: [{ id: undefined, name: "SIN RUC" }] },
        {
          id: "a2",
          suppliers: [{ id: "PE-RUC-1", name: "DIVCOM S.A.C." }],
          value: { amount: 385200, currency: "PEN" },
          date: "2026-09-22",
        },
      ],
    };
    expect(awardFromBulkRelease(release)).toEqual({
      supplierId: "PE-RUC-1",
      supplierName: "DIVCOM S.A.C.",
      valor: 385200,
      moneda: "PEN",
      fecha: "2026-09-22",
    });
  });

  it("devuelve null si el release no trae awards", () => {
    expect(awardFromBulkRelease({ ocid: "ocds-2" })).toBeNull();
  });
});

describe("iterateBulkReleases", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "oece-bulk-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("parsea línea por línea y omite líneas JSON inválidas sin abortar el archivo", async () => {
    const lines = [
      JSON.stringify({ ocid: "ocds-a", tender: { title: "PROCESO A" } }),
      "{esto no es json valido",
      JSON.stringify({ ocid: "ocds-b", tender: { title: "PROCESO B" } }),
    ];
    const gzPath = join(dir, "2025.jsonl.gz");
    writeFileSync(gzPath, gzipSync(lines.join("\n") + "\n"));

    const releases: OcdsBulkRelease[] = [];
    for await (const release of iterateBulkReleases(gzPath)) {
      releases.push(release);
    }

    expect(releases).toHaveLength(2);
    expect(releases[0].ocid).toBe("ocds-a");
    expect(releases[1].ocid).toBe("ocds-b");
  });
});

describe("scanBulkReactivos", () => {
  let cacheDir: string;
  const clientQueryMock = vi.fn();
  const client = { query: clientQueryMock, release: vi.fn() };

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "oece-bulk-cache-"));
    connectMock.mockResolvedValue(client);
    clientQueryMock.mockReset().mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    rmSync(cacheDir, { recursive: true, force: true });
  });

  function seedYear(year: number, releases: OcdsBulkRelease[]) {
    const gzPath = join(cacheDir, `${year}.jsonl.gz`);
    const body = releases.map((r) => JSON.stringify(r)).join("\n") + "\n";
    writeFileSync(gzPath, gzipSync(body));
  }

  it("detecta matches, hace upsert reutilizando la función compartida y no llama a fetch (award ya embebido)", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    seedYear(2025, [
      { ocid: "ocds-nomatch", tender: { title: "BALON DE GAS" } },
      {
        ocid: "ocds-match",
        buyer: { id: "PE-1", name: "ESSALUD" },
        tender: { title: "ADQUISICION DE REACTIVOS DE BIOQUIMICA", datePublished: "2025-06-01T00:00:00-05:00" },
        awards: [{ id: "a1", suppliers: [{ id: "PE-RUC-9", name: "PROVEEDOR X" }], value: { amount: 1000, currency: "PEN" }, date: "2025-06-10" }],
      },
    ]);

    const summary = await scanBulkReactivos({ years: [2025], cacheDir });

    expect(fetchSpy).not.toHaveBeenCalled(); // ya estaba en cache, no debe descargar
    expect(summary.totalReleasesScanned).toBe(2);
    expect(summary.totalMatches).toBe(1);
    expect(summary.totalMatchesConAward).toBe(1);
    expect(summary.totalFilasUpsertadas).toBe(1);
    expect(summary.perYear).toEqual([
      { year: 2025, releasesScanned: 2, matches: 1, matchesConAward: 1, filasUpsertadas: 1 },
    ]);

    expect(clientQueryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = clientQueryMock.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (ocid, item_desc) DO UPDATE SET");
    expect(params).toEqual([
      "ocds-match",
      "PE-1",
      "ESSALUD",
      null,
      "ADQUISICION DE REACTIVOS DE BIOQUIMICA",
      "ADQUISICION DE REACTIVOS DE BIOQUIMICA",
      null,
      null,
      "2025-06-01T00:00:00-05:00",
      "PE-RUC-9",
      "PROVEEDOR X",
      1000,
      "PEN",
      "2025-06-10",
    ]);
    expect(client.release).toHaveBeenCalled();
  });

  it("procesa varios años en orden ascendente y acumula el resumen por año", async () => {
    seedYear(2022, [{ ocid: "ocds-2022", tender: { title: "REACTIVOS PARA HEMOGRAMA" } }]);
    seedYear(2023, [{ ocid: "ocds-2023", tender: { title: "BALON DE GAS" } }]);

    const summary = await scanBulkReactivos({ years: [2023, 2022], cacheDir });

    expect(summary.years).toEqual([2022, 2023]); // ordenado ascendente aunque se pida al revés
    expect(summary.perYear.map((y) => y.year)).toEqual([2022, 2023]);
    expect(summary.totalMatches).toBe(1);
  });

  it("sin matches no llama al cliente de base de datos", async () => {
    seedYear(2024, [{ ocid: "ocds-x", tender: { title: "GUANTES DE LATEX" } }]);

    const summary = await scanBulkReactivos({ years: [2024], cacheDir });

    expect(summary.totalMatches).toBe(0);
    expect(summary.totalFilasUpsertadas).toBe(0);
    expect(clientQueryMock).not.toHaveBeenCalled();
  });
});
