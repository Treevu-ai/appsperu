import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("../db/pool.js", () => ({ pool: { query: queryMock } }));
vi.mock("../db/radar-pool.js", () => ({ radarPool: { query: vi.fn() } }));
const { createApp } = await import("../app.js");

beforeEach(() => queryMock.mockReset());

describe("GET /api/entities/:buyerId/profile", () => {
  it("keeps processes, awards, bidders, and unavailable minor contracts separate", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ buyer_id: "PE-CONSUCODE-1894", buyer_name: "UNIVERSIDAD NACIONAL DE TRUJILLO", rows: 4 }] })
      .mockResolvedValueOnce({ rows: [{ processes: 2, tenders: 2, amount_null: 0, amount_zero: 1, positive_amount: "100000", first_publication: "2026-08-01", last_publication: "2026-08-02", first_tender_start: "2026-01-01", last_tender_start: "2026-02-01" }] })
      .mockResolvedValueOnce({ rows: [{ category: "goods", processes: 2, positive_amount: "100000", amount_not_published: 1 }] })
      .mockResolvedValueOnce({ rows: [{ ocid: "ocds-1", tender_id: "1", categoria: "goods", titulo: "Compra", valor_monto: "100000", valor_moneda: "PEN", fecha_publicacion: "2026-08-01", tender_inicio: "2026-01-01", tender_fin: null, bidders: 5, winners: 1 }] })
      .mockResolvedValueOnce({ rows: [{ awards: 1, ocids: 1, suppliers: 1, amount_null: 0, positive_amount: "90000", first_award: "2026-02-01", last_award: "2026-02-01" }] })
      .mockResolvedValueOnce({ rows: [{ award_year: 2026, currency: "PEN", awards: 1, total_amount: "90000" }] })
      .mockResolvedValueOnce({ rows: [{ participations: 5, processes_with_bidders: 1, bidders: 5, processes_with_winner: 1 }] })
      .mockResolvedValueOnce({ rows: [{ ocid: "ocds-1", bidders: 5, winners: 1 }] })
      .mockResolvedValueOnce({ rows: [{ reconciliation_status: "matched_exact_ocid", ocids: 1 }] })
      .mockResolvedValueOnce({ rows: [] });

    const response = await request(createApp()).get("/api/entities/PE-CONSUCODE-1894/profile");

    expect(response.status).toBe(200);
    expect(response.body.entity).toEqual({ buyerId: "PE-CONSUCODE-1894", buyerName: "UNIVERSIDAD NACIONAL DE TRUJILLO" });
    expect(response.body.processes).toMatchObject({ processes: 2, positiveAmount: 100000, amountZero: 1 });
    expect(response.body.awards).toMatchObject({ awards: 1, positiveAmount: 90000 });
    expect(response.body.bidders).toMatchObject({ participations: 5, processesWithBidders: 1 });
    expect(response.body.reconciliation.method).toBe("exact_ocid_only");
    expect(response.body.minorContracts).toMatchObject({ available: false });
    expect(response.body.minorContracts.limitation).toMatch(/no debe mostrar cero contratos/i);
  });

  it("returns 404 when no materialized OCDS buyer matches the identifier", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const response = await request(createApp()).get("/api/entities/PE-NOT-FOUND/profile");
    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/no encontrada/i);
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
