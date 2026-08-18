import { describe, expect, it } from "vitest";
import { normalizeAwards, type OcdsRecord } from "../ingest/normalize-awards.js";

// Forma real observada el 2026-08-17 contra /api/v1/records.
function realRecord(overrides: Partial<OcdsRecord["compiledRelease"]> = {}): OcdsRecord {
  return {
    ocid: "ocds-dgv273-seacev3-999999",
    compiledRelease: {
      buyer: { id: "PE-CONSUCODE-1339", name: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO" },
      parties: [
        {
          id: "PE-CONSUCODE-1339",
          name: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO",
          address: { department: "LA LIBERTAD", region: "TRUJILLO", locality: "TRUJILLO" },
          roles: ["buyer", "procuringEntity"],
        },
      ],
      awards: [
        {
          id: "999999-20297868790",
          value: { amount: 89950, currency: "PEN" },
          date: "2024-04-01T00:00:00-05:00",
          suppliers: [{ id: "PE-RUC-20297868790", name: "UNIVERSIDAD SAN IGNACIO DE LOYOLA S.R.L." }],
        },
      ],
      ...overrides,
    },
  };
}

describe("normalizeAwards", () => {
  it("returns empty when no records are passed", () => {
    const result = normalizeAwards([]);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("normalizes a well-formed award into one row per supplier", () => {
    const { rows, rejected } = normalizeAwards([realRecord()]);
    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ocid: "ocds-dgv273-seacev3-999999",
      awardId: "999999-20297868790",
      buyerName: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO",
      departamento: "LA LIBERTAD",
      supplierId: "PE-RUC-20297868790",
      supplierName: "UNIVERSIDAD SAN IGNACIO DE LOYOLA S.R.L.",
      valorMonto: 89950,
    });
  });

  it("silently skips records with no awards yet (not a rejection)", () => {
    const { rows, rejected } = normalizeAwards([realRecord({ awards: [] })]);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });

  it("silently skips when compiledRelease.awards is undefined entirely", () => {
    const record: OcdsRecord = { ocid: "ocds-1", compiledRelease: { buyer: { id: "x", name: "X" } } };
    const { rows, rejected } = normalizeAwards([record]);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });

  it("produces one row per supplier for a consortium award (multiple suppliers)", () => {
    const record = realRecord({
      buyer: { id: "PE-CONSUCODE-1339", name: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO" },
      awards: [
        {
          id: "999999-1",
          value: { amount: 500000, currency: "PEN" },
          suppliers: [
            { id: "PE-RUC-1", name: "CONSORCIO A" },
            { id: "PE-RUC-2", name: "CONSORCIO B" },
          ],
        },
      ],
    });
    const { rows } = normalizeAwards([record]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.supplierId)).toEqual(["PE-RUC-1", "PE-RUC-2"]);
  });

  it("rejects an award with no suppliers instead of throwing", () => {
    const record = realRecord({ awards: [{ id: "999999-2", value: { amount: 100 }, suppliers: [] }] });
    const { rows, rejected } = normalizeAwards([record]);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/sin proveedores/);
  });

  it("rejects a supplier missing id or name instead of throwing", () => {
    const record = realRecord({
      awards: [{ id: "999999-3", suppliers: [{ id: "PE-RUC-9" }] }],
    });
    const { rows, rejected } = normalizeAwards([record]);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/proveedor incompleto/);
  });

  it("rejects a record with missing ocid when it does have awards", () => {
    const record = realRecord();
    record.ocid = undefined;
    const { rows, rejected } = normalizeAwards([record]);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/ocid/);
  });
});
