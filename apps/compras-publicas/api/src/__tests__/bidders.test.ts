import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { normalizeBidders } from "../ingest/normalize-bidders.js";
import { filterRecordsByDepartment } from "../ingest/oece-records-connector.js";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("../db/pool.js", () => ({ pool: { query: queryMock } }));
vi.mock("../db/radar-pool.js", () => ({ radarPool: { query: vi.fn() } }));
const { createApp } = await import("../app.js");

const laLibertadRecord = {
  ocid: "ocds-demo-1",
  compiledRelease: {
    buyer: { id: "buyer-1" },
    parties: [{ id: "buyer-1", roles: ["buyer"], address: { department: "LA LIBERTAD" } }],
    tender: { bidders: [
      { id: "PE-RUC-20123456789", name: "PROVEEDOR GANADOR" },
      { id: "PE-RUC-20987654321", name: "PROVEEDOR PARTICIPANTE" },
    ] },
    awards: [{ suppliers: [{ id: "PE-RUC-20123456789" }] }],
  },
};

describe("postores OCDS", () => {
  it("preserves participation without inventing a ranking or quotation", () => {
    const result = normalizeBidders([laLibertadRecord]);
    expect(result.rejected).toEqual([]);
    expect(result.rows).toEqual([
      expect.objectContaining({ bidderId: "PE-RUC-20123456789", estado: "ganador", ranking: null }),
      expect.objectContaining({ bidderId: "PE-RUC-20987654321", estado: "participante", ranking: null }),
    ]);
  });

  it("uses the tenderers field published by OECE", () => {
    const record = {
      ...laLibertadRecord,
      compiledRelease: {
        ...laLibertadRecord.compiledRelease,
        tender: { tenderers: laLibertadRecord.compiledRelease.tender.bidders },
      },
    };
    expect(normalizeBidders([record]).rows).toHaveLength(2);
  });

  it("excludes records outside the selected department before persisting bidders", () => {
    const otherDepartment = structuredClone(laLibertadRecord);
    otherDepartment.compiledRelease.parties[0].address.department = "LIMA";
    expect(filterRecordsByDepartment([laLibertadRecord, otherDepartment], "LA LIBERTAD")).toEqual([laLibertadRecord]);
  });

  it("rejects a bidder whose legal name is not published", () => {
    const record = structuredClone(laLibertadRecord);
    record.compiledRelease.tender.bidders[1].name = "";
    expect(normalizeBidders([record]).rejected[0].reason).toMatch(/sin nombre/);
  });
});

describe("analítica de postores", () => {
  it("exposes co-participation as a descriptive metric, not a cartel signal", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const response = await request(createApp()).get("/api/bidders/analytics/co-participation");
    expect(response.status).toBe(200);
    expect(response.body.limitation).toMatch(/no determina coordinación ni colusión/i);
    expect(queryMock.mock.calls[0][0]).toMatch(/source_batch_id IS NOT NULL/);
  });

  it("does not retain the previous cartel-labelled route", async () => {
    const response = await request(createApp()).get("/api/bidders/analytics/cartels");
    expect(response.status).toBe(404);
  });
});
