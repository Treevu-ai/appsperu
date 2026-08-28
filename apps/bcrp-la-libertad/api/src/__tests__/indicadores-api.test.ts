import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
});

describe("GET /api/indicadores", () => {
  it("devuelve la serie con traceability y filtra por anexo", async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        {
          anexo_numero: 10,
          seccion: null,
          indicador: "GASTO NO FINANCIERO TOTAL (I+II)",
          periodo_anio: 2026,
          periodo_mes: 1,
          valor: "757.0000",
          report_period: "2026-01",
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/indicadores").query({ anexo: 10 });

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({
      anexoNumero: 10,
      indicador: "GASTO NO FINANCIERO TOTAL (I+II)",
      periodoAnio: 2026,
      periodoMes: 1,
      valor: 757,
    });
    expect(res.body.resultados[0].fuente.reportePeriod).toBe("2026-01");

    const [, params] = queryMock.mock.calls[0];
    expect(params).toEqual([10]);
  });

  it("responde 400 cuando mes está fuera de rango", async () => {
    const app = createApp();
    const res = await request(app).get("/api/indicadores?mes=13");

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
