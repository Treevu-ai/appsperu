import { describe, expect, it } from "vitest";
import { inferSourceId, normalizeOcdsReleases, type OcdsRelease } from "../ingest/normalize.js";

// Forma real observada el 2026-08-16 contra /api/v1/releases (Municipalidad
// Distrital de Pichari), recortada a lo que normalize.ts usa.
function realRelease(overrides: Partial<OcdsRelease> = {}): OcdsRelease {
  return {
    ocid: "ocds-dgv273-seacev3-1241737",
    date: "2026-08-16T10:08:18.495872-05:00",
    publishedDate: "2026-08-16T10:08:18.495890-05:00",
    tag: ["planning", "tender"],
    buyer: { id: "PE-CONSUCODE-822", name: "MUNICIPALIDAD DISTRITAL DE PICHARI" },
    tender: {
      id: "1241737",
      title: "CP-ABR-37-2026-MDP/C-2",
      mainProcurementCategory: "services",
      value: { amount: 0, currency: "PEN" },
      tenderPeriod: { startDate: "2026-08-14T00:00:00-05:00", endDate: "2026-08-14T00:00:00-05:00" },
    },
    parties: [
      {
        id: "PE-CONSUCODE-822",
        name: "MUNICIPALIDAD DISTRITAL DE PICHARI",
        address: {
          streetAddress: "PLAZO PRINCIPAL S/N PICHARI",
          locality: "PICHARI",
          region: "LA CONVENCION",
          department: "CUSCO",
          countryName: "PERU",
        },
        roles: ["buyer", "procuringEntity"],
      },
    ],
    ...overrides,
  };
}

describe("normalizeOcdsReleases", () => {
  it("returns empty when no releases are passed", () => {
    const result = normalizeOcdsReleases([]);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("normalizes a well-formed release, deriving departamento from the buyer party address", () => {
    const { rows, rejected } = normalizeOcdsReleases([realRelease()]);
    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ocid: "ocds-dgv273-seacev3-1241737",
      sourceId: "seace_v3",
      buyerId: "PE-CONSUCODE-822",
      buyerName: "MUNICIPALIDAD DISTRITAL DE PICHARI",
      departamento: "CUSCO",
      provincia: "LA CONVENCION",
      distrito: "PICHARI",
      categoria: "services",
      valorMonto: 0,
      valorMoneda: "PEN",
    });
    expect(rows[0].tags).toEqual(["planning", "tender"]);
  });

  it("rejects releases with missing ocid instead of throwing", () => {
    const { rows, rejected } = normalizeOcdsReleases([realRelease({ ocid: undefined })]);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/ocid/);
  });

  it("rejects releases with missing buyer instead of throwing", () => {
    const { rows, rejected } = normalizeOcdsReleases([realRelease({ buyer: undefined })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/buyer/);
  });

  it("returns null departamento instead of throwing when parties is absent", () => {
    const { rows } = normalizeOcdsReleases([realRelease({ parties: undefined })]);
    expect(rows[0].departamento).toBeNull();
    expect(rows[0].provincia).toBeNull();
    expect(rows[0].distrito).toBeNull();
  });

  it("returns null departamento when the buyer id has no matching party", () => {
    const { rows } = normalizeOcdsReleases([
      realRelease({ buyer: { id: "PE-CONSUCODE-999", name: "OTRA ENTIDAD" } }),
    ]);
    expect(rows[0].departamento).toBeNull();
  });

  it("handles a release with no tender block at all", () => {
    const { rows } = normalizeOcdsReleases([realRelease({ tender: undefined })]);
    expect(rows[0]).toMatchObject({
      tenderId: null,
      categoria: null,
      titulo: null,
      valorMonto: null,
      valorMoneda: null,
      tenderInicio: null,
      tenderFin: null,
    });
  });

  it("falls back to entity code as name is not applicable here, but tags default to empty array", () => {
    const { rows } = normalizeOcdsReleases([realRelease({ tag: undefined })]);
    expect(rows[0].tags).toEqual([]);
  });
});

describe("inferSourceId", () => {
  it("extracts seace_v3 from a v3 ocid", () => {
    expect(inferSourceId("ocds-dgv273-seacev3-1241737")).toBe("seace_v3");
  });

  it("extracts seace_v2 from a v2 ocid", () => {
    expect(inferSourceId("ocds-dgv273-seacev2-3496677")).toBe("seace_v2");
  });

  it("returns null when the ocid does not match the known pattern", () => {
    expect(inferSourceId("ocds-dgv273-unknown-123")).toBeNull();
  });
});
