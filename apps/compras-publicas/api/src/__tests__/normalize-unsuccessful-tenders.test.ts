import { describe, expect, it } from "vitest";
import { normalizeUnsuccessfulTenders } from "../ingest/normalize-unsuccessful-tenders.js";
import type { OcdsRecord } from "../ingest/normalize-awards.js";

// Forma real observada el 2026-09-06 contra /api/v1/records (compiledRelease).
function realRecord(overrides: Record<string, unknown> = {}): OcdsRecord {
  return {
    ocid: "ocds-dgv273-seacev3-1221373",
    compiledRelease: {
      date: "2026-06-01T00:00:00-05:00",
      buyer: { id: "PE-CONSUCODE-822", name: "MUNICIPALIDAD DISTRITAL DE X" },
      parties: [
        {
          id: "PE-CONSUCODE-822",
          name: "MUNICIPALIDAD DISTRITAL DE X",
          address: { department: "LA LIBERTAD", region: "TRUJILLO", locality: "TRUJILLO" },
          roles: ["buyer", "procuringEntity"],
        },
      ],
      tender: {
        id: "1221373",
        items: [{ id: "item-1", description: "COMBUSTIBLE DIESEL", statusDetails: "DESIERTO" }],
      },
      ...overrides,
    },
  } as unknown as OcdsRecord;
}

describe("normalizeUnsuccessfulTenders", () => {
  it("returns empty when no records are passed", () => {
    const result = normalizeUnsuccessfulTenders([]);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("captures an item declared DESIERTO", () => {
    const { rows, rejected } = normalizeUnsuccessfulTenders([realRecord()]);
    expect(rejected).toHaveLength(0);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ocid: "ocds-dgv273-seacev3-1221373",
      itemId: "item-1",
      statusDetails: "DESIERTO",
      departamento: "LA LIBERTAD",
      fecha: "2026-06-01",
    });
  });

  it("captures an item declared NULO", () => {
    const record = realRecord({
      tender: { id: "1221373", items: [{ id: "item-2", statusDetails: "nulo" }] },
    });
    const { rows } = normalizeUnsuccessfulTenders([record]);
    expect(rows[0].statusDetails).toBe("NULO");
  });

  it("ignores CONVOCADO (still in progress, not terminal)", () => {
    const record = realRecord({
      tender: { id: "1221373", items: [{ id: "item-3", statusDetails: "CONVOCADO" }] },
    });
    const { rows, rejected } = normalizeUnsuccessfulTenders([record]);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });

  it("ignores ambiguous statuses it does not classify (RETROTRAIDO_POR_RESOLUCION)", () => {
    const record = realRecord({
      tender: { id: "1221373", items: [{ id: "item-4", statusDetails: "RETROTRAIDO_POR_RESOLUCION" }] },
    });
    const { rows, rejected } = normalizeUnsuccessfulTenders([record]);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });

  it("captures a mixed record: one item DESIERTO, one item awarded/CONTRATADO", () => {
    const record = realRecord({
      tender: {
        id: "1221373",
        items: [
          { id: "item-a", statusDetails: "CONTRATADO" },
          { id: "item-b", statusDetails: "DESIERTO" },
        ],
      },
    });
    const { rows } = normalizeUnsuccessfulTenders([record]);
    expect(rows).toHaveLength(1);
    expect(rows[0].itemId).toBe("item-b");
  });

  it("rejects an item with no id instead of throwing", () => {
    const record = realRecord({
      tender: { id: "1221373", items: [{ statusDetails: "DESIERTO" }] },
    });
    const { rows, rejected } = normalizeUnsuccessfulTenders([record]);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/item.id/);
  });

  it("rejects duplicate (ocid, itemId) within the same batch", () => {
    const record = realRecord();
    const { rows, rejected } = normalizeUnsuccessfulTenders([record, record]);
    expect(rows).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatch(/duplicado/);
  });

  it("skips records with no tender.items at all", () => {
    const record: OcdsRecord = { ocid: "ocds-x", compiledRelease: { buyer: { id: "x", name: "X" } } };
    const { rows, rejected } = normalizeUnsuccessfulTenders([record]);
    expect(rows).toHaveLength(0);
    expect(rejected).toHaveLength(0);
  });
});
