import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();
const comprasQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));
vi.mock("../db/external-pools.js", () => ({
  comprasPool: { query: comprasQueryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
  comprasQueryMock.mockReset();
});

const FILA_INFRACCION = {
  ruc: "20529461667",
  nombre_administrado: "EMPRESA DE PRUEBA S.A.C.",
  total_infracciones: "3",
  subsectores: ["MINERIA", "HIDROCARBUROS"],
  ultima_fecha_rd: "2026-05-10",
};

describe("GET /api/crossref (OEFA x compras-publicas)", () => {
  it("reporta 0 limpio cuando no hay infracciones que calcen el filtro", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ total: 0, resultados: [], limitation: expect.stringContaining("Solo cruza RUC") });
    expect(comprasQueryMock).not.toHaveBeenCalled();
  });

  it("incluye solo RUC con al menos un match real en compras-publicas (awards)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [FILA_INFRACCION] });
    comprasQueryMock
      .mockResolvedValueOnce({
        rows: [{ supplier_id: "PE-RUC-20529461667", buyer_name: "MUNICIPALIDAD X", valor_monto: "15000.50", fecha: "2026-03-01" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.resultados[0]).toMatchObject({
      ruc: "20529461667",
      nombreAdministrado: "EMPRESA DE PRUEBA S.A.C.",
      totalInfracciones: 3,
      comprasPublicas: { adjudicaciones: 1, buyersDistintos: 1, montoTotal: 15000.5, ultimaFecha: "2026-03-01" },
    });
  });

  it("agrega adjudicaciones de awards Y minor_contracts para el mismo RUC", async () => {
    queryMock.mockResolvedValueOnce({ rows: [FILA_INFRACCION] });
    comprasQueryMock
      .mockResolvedValueOnce({ rows: [{ supplier_id: "PE-RUC-20529461667", buyer_name: "MUNICIPALIDAD X", valor_monto: "10000", fecha: "2026-01-01" }] })
      .mockResolvedValueOnce({ rows: [{ winning_supplier_id: "seace:ruc:20529461667", buyer_name: "MUNICIPALIDAD Y", awarded_amount: "5000", award_date: "2026-06-01" }] });

    const res = await request(createApp()).get("/api/crossref");

    expect(res.body.resultados[0].comprasPublicas).toMatchObject({
      adjudicaciones: 2,
      buyersDistintos: 2,
      montoTotal: 15000,
      ultimaFecha: "2026-06-01",
    });
  });

  it("filtra RUC sin ningún match en compras-publicas (no infla el total con sancionados que no contratan)", async () => {
    queryMock.mockResolvedValueOnce({ rows: [FILA_INFRACCION] });
    comprasQueryMock.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref");

    expect(res.body.total).toBe(0);
    expect(res.body.resultados).toEqual([]);
  });

  it("degrada a ENRIQUECIMIENTO_NO_DISPONIBLE (no 500) si compras-publicas falla", async () => {
    queryMock.mockResolvedValueOnce({ rows: [FILA_INFRACCION] });
    comprasQueryMock.mockRejectedValueOnce(new Error("connection refused"));

    const res = await request(createApp()).get("/api/crossref");

    expect(res.status).toBe(200);
    expect(res.body.estado).toBe("ENRIQUECIMIENTO_NO_DISPONIBLE");
  });

  it("valida ruc de 11 dígitos antes de tocar la base", async () => {
    const res = await request(createApp()).get("/api/crossref").query({ ruc: "123" });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it("filtra la consulta propia por departamento", async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });

    await request(createApp()).get("/api/crossref").query({ departamento: "la libertad" });

    const [sql, params] = queryMock.mock.calls[0];
    expect(sql).toMatch(/departamento = \$1/);
    expect(params).toEqual(["LA LIBERTAD"]);
  });
});
