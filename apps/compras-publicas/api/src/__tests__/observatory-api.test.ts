import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const queryMock = vi.fn();
vi.mock("../db/pool.js", () => ({ pool: { query: queryMock } }));
vi.mock("../db/radar-pool.js", () => ({ radarPool: { query: vi.fn() } }));

const { createApp } = await import("../app.js");

beforeEach(() => queryMock.mockReset());

describe("GET /api/contracts", () => {
  it("returns canonical minor-contract fields and source traceability", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{
      contracting_id: "oece:ocds-1:award-1", ocid: "ocds-1", award_id: "award-1", year: 2026,
      object_original: "Servicio de mantenimiento", object_normalized: "servicio de mantenimiento", category: "services",
      estimated_amount: "43000", awarded_amount: "42000", publication_date: "2026-02-01", award_date: "2026-02-03",
      quotation_count: 2, valid_quotation_count: null, source_url: "https://source", source_timestamp: "2026-02-04",
      municipality_id: "oece:buyer-1", municipality_name: "MUNICIPALIDAD DISTRITAL X", province: "TRUJILLO", district: "X",
      supplier_id: "PE-RUC-20123456789", supplier_name: "PROVEEDOR SAC", ruc: "20123456789",
    }] });
    const response = await request(createApp()).get("/api/contracts").query({ year: 2026, maxAmount: 44000 });
    expect(response.status).toBe(200);
    expect(response.body.resultados[0]).toMatchObject({ contractingId: "oece:ocds-1:award-1", awardedAmount: 42000, validQuotationCount: null, municipality: { district: "X" }, source: { url: "https://source" } });
    expect(response.body.scope.maximumAmount).toBe(44000);
    expect(queryMock.mock.calls[0][1]).toEqual([2026, 44000, 100]);
  });

  it("rejects a threshold beyond the 8 UIT pilot maximum", async () => {
    const response = await request(createApp()).get("/api/contracts?maxAmount=44001");
    expect(response.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/signals", () => {
  it("uses only the latest immutable run by default", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const response = await request(createApp()).get("/api/signals").query({ signalType: "S05" });
    expect(response.status).toBe(200);
    expect(response.body.resultados).toEqual([]);
    expect(queryMock.mock.calls[0][0]).toMatch(/SELECT signal_run_id FROM signal_runs ORDER BY executed_at DESC LIMIT 1/);
    expect(queryMock.mock.calls[0][1]).toEqual(["S05", 100]);
  });
});

describe("GET /api/identities", () => {
  it("returns only verified links when requested and never invents a MEF code", async () => {
    queryMock.mockResolvedValueOnce({ rows: [{
      subject_id: "seace:entity:1", source_identifier_type: "MUNICIPALITY_ID", source_identifier_value: "seace:entity:1",
      target_identifier_type: "RUC", target_identifier_value: "20123456789", strength: "VERIFICADA",
    }] });
    const response = await request(createApp()).get("/api/identities").query({ identifier: "20123456789", soloVerificadas: "true" });
    expect(response.status).toBe(200);
    expect(response.body.resultados[0].target_identifier_type).toBe("RUC");
    expect(queryMock.mock.calls[0][0]).toMatch(/strength IN \('EXACTA','VERIFICADA'\)/);
  });
});

describe("GET /api/signals/:id", () => {
  it("returns the append-only human review history alongside source evidence", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ signal_id: "S01:example" }] })
      .mockResolvedValueOnce({ rows: [{ evidence_id: 1 }] })
      .mockResolvedValueOnce({ rows: [{ review_event_id: 2, decision: "REVIEWED", reviewer_role: "analista" }] });
    const response = await request(createApp()).get("/api/signals/S01%3Aexample");
    expect(response.status).toBe(200);
    expect(response.body.reviews).toEqual([{ review_event_id: 2, decision: "REVIEWED", reviewer_role: "analista" }]);
    expect(queryMock.mock.calls[2][0]).toMatch(/signal_review_events/);
  });
});

describe("GET /api/semantic-review-queue", () => {
  it("returns a dedicated, non-conclusive queue built from S12/S13", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const response = await request(createApp()).get("/api/semantic-review-queue");
    expect(response.status).toBe(200);
    expect(response.body.resultados).toEqual([]);
    expect(response.body.limitation).toMatch(/no determina misma necesidad/i);
    expect(queryMock.mock.calls[0][0]).toMatch(/cs.signal_type IN \('S12','S13'\)/);
    expect(queryMock.mock.calls[0][1]).toEqual([50]);
  });
});

describe("GET /api/semantic-review-clusters", () => {
  it("groups only comparable contracts from distinct source records", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const response = await request(createApp()).get("/api/semantic-review-clusters");
    expect(response.status).toBe(200);
    expect(response.body.resultados).toEqual([]);
    expect(response.body.limitation).toMatch(/no determinan una misma necesidad/i);
    expect(queryMock.mock.calls[0][0]).toMatch(/c\.source_contracting_id <> related\.source_contracting_id/);
  });
});

describe("GET /api/meta/freshness", () => {
  it("makes the extraction date and coverage contract visible", async () => {
    queryMock.mockResolvedValueOnce({ rows: [
      { source: "oece_ocds", fetched_at: "2026-08-23T10:00:00.000Z", records: "12", latest_batch_id: "42", rejected_in_latest_batch: "3", coverage: "Parcial" },
      { source: "seace_contratos_menores", fetched_at: "2026-08-23T11:00:00.000Z", records: "34", latest_batch_id: "7", rejected_in_latest_batch: null, coverage: "Materializada" },
    ] });
    const response = await request(createApp()).get("/api/meta/freshness");
    expect(response.status).toBe(200);
    expect(response.body.sources).toEqual([
      { source: "oece_ocds", fetchedAt: "2026-08-23T10:00:00.000Z", records: 12, latestBatchId: 42, rejectedInLatestBatch: 3, coverage: "Parcial" },
      { source: "seace_contratos_menores", fetchedAt: "2026-08-23T11:00:00.000Z", records: 34, latestBatchId: 7, rejectedInLatestBatch: null, coverage: "Materializada" },
    ]);
    expect(response.body.limitation).toMatch(/no son equivalentes/i);
    expect(response.body.limitation).toMatch(/rejectedInLatestBatch/);
  });
});

describe("GET /api/municipalities/:id", () => {
  it("maps the canonical municipality row to the frontend contract", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ municipality_id: "seace:entity:1", official_name: "MUNICIPALIDAD DISTRITAL X", ruc: null, province: "TRUJILLO", district: "X" }] })
      .mockResolvedValueOnce({ rows: [{ contracts: 2, total_amount: "42000", average_amount: "21000", supplier_count: 2, quotation_average: "0" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const response = await request(createApp()).get("/api/municipalities/seace%3Aentity%3A1");
    expect(response.status).toBe(200);
    expect(response.body.municipality).toEqual({
      municipalityId: "seace:entity:1", officialName: "MUNICIPALIDAD DISTRITAL X", ruc: null,
      province: "TRUJILLO", district: "X", contracts: 2, totalAmount: 42000, suppliers: 2,
    });
  });
});

describe("GET /api/analytics/territorial", () => {
  it("returns province and district aggregates with an explicit date basis", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ contracts: 4, total_amount: "60000", average_amount: "15000", supplier_count: 3 }] })
      .mockResolvedValueOnce({ rows: [{ province: "TRUJILLO", district: null, contracts: 4, total_amount: "60000", average_amount: "15000", supplier_count: 3, cr1: "0.5", cr3: "1" }] })
      .mockResolvedValueOnce({ rows: [{ province: "TRUJILLO", district: "LAREDO", contracts: 4, total_amount: "60000", average_amount: "15000", supplier_count: 3, cr1: "0.5", cr3: "1" }] });
    const response = await request(createApp()).get("/api/analytics/territorial?year=2026&category=services&dateBasis=publication_year");
    expect(response.status).toBe(200);
    expect(response.body.scope).toMatchObject({ year: 2026, category: "services", dateBasis: "publication_year", dateField: "minor_contracts.publication_date" });
    expect(response.body.totals).toEqual({ contracts: 4, totalAmount: 60000, averageAmount: 15000, suppliers: 3 });
    expect(response.body.byDistrict[0]).toMatchObject({ province: "TRUJILLO", district: "LAREDO", cr1: 0.5, cr3: 1 });
    expect(queryMock.mock.calls[0][1]).toEqual(["LA LIBERTAD", "services", 2026]);
  });

  it("rejects an unknown date basis", async () => {
    const response = await request(createApp()).get("/api/analytics/territorial?dateBasis=unknown");
    expect(response.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
