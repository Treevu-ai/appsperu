import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const comprasQueryMock = vi.fn();
const sancionadosQueryMock = vi.fn();

vi.mock("../db/compras-pool.js", () => ({
  comprasPool: { query: comprasQueryMock },
}));
vi.mock("../db/pool.js", () => ({
  pool: { query: sancionadosQueryMock },
}));
vi.mock("../db/fiscal-pool.js", () => ({
  fiscalPool: { query: vi.fn() },
}));
vi.mock("../db/candidatos-pool.js", () => ({
  candidatosPool: { query: vi.fn() },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  comprasQueryMock.mockReset();
  sancionadosQueryMock.mockReset();
});

describe("GET /api/crossref/sancionado-recurrente", () => {
  it("devuelve un proveedor con varias resoluciones dentro de la ventana, con la explicación no concluyente", async () => {
    sancionadosQueryMock.mockResolvedValueOnce({
      rows: [
        {
          ruc: "20492687180",
          razon_social: "SERPAEM SOCIEDAD ANONIMA CERRADA - SERPAEM S.A.C.",
          num_resoluciones: "4",
          primera_resolucion: "2025-06-17",
          ultima_resolucion: "2025-11-06",
          ventana_dias: "142",
          resoluciones: [
            { resolucion: "3764-2025-TCP-S1", estado: "VIGENTE", desde: "2025-06-17", hasta: "2027-06-17" },
            { resolucion: "6220-2025-TCP-S5", estado: "VIGENTE", desde: "2025-10-21", hasta: "2027-11-21" },
            { resolucion: "6381-2025-TCP-S1", estado: "VIGENTE", desde: "2025-10-29", hasta: "2027-12-29" },
            { resolucion: "6654-2025-TCP-S3", estado: "VIGENTE", desde: "2025-11-06", hasta: "2028-01-06" },
          ],
        },
      ],
    });

    const app = createApp();
    const res = await request(app).get("/api/crossref/sancionado-recurrente");

    expect(res.status).toBe(200);
    expect(res.body.minResoluciones).toBe(2);
    expect(res.body.ventanaDias).toBe(180);
    expect(res.body.resultados).toHaveLength(1);
    const result = res.body.resultados[0];
    expect(result.ruc).toBe("20492687180");
    expect(result.numResoluciones).toBe(4);
    expect(result.resoluciones).toHaveLength(4);
    expect(result.explicacion).toMatch(/no determina un patrón de conducta/i);
  });

  it("usa los parámetros minResoluciones y ventanaDias en la consulta SQL", async () => {
    sancionadosQueryMock.mockResolvedValueOnce({ rows: [] });
    const app = createApp();
    const res = await request(app)
      .get("/api/crossref/sancionado-recurrente")
      .query({ minResoluciones: 3, ventanaDias: 90 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ minResoluciones: 3, ventanaDias: 90, resultados: [] });
    const [, params] = sancionadosQueryMock.mock.calls[0];
    expect(params).toEqual([3, 90]);
  });

  it("rechaza un minResoluciones menor a 2 (una sola resolución no es recurrencia)", async () => {
    const app = createApp();
    const res = await request(app).get("/api/crossref/sancionado-recurrente").query({ minResoluciones: 1 });
    expect(res.status).toBe(400);
    expect(sancionadosQueryMock).not.toHaveBeenCalled();
  });
});
