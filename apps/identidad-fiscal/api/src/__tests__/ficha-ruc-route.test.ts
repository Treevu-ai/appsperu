import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const queryMock = vi.fn();
const fetchRucLiveMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: queryMock },
}));

vi.mock("../lib/openruc-client.js", () => ({
  fetchRucLive: fetchRucLiveMock,
}));

// app.ts monta crossref.ts, que exige estas env vars al importarse.
process.env.COMPRAS_DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.EJECUCION_DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SEGURIDAD_DATABASE_URL ??= "postgres://test:test@localhost:5432/test";

const { createApp } = await import("../app.js");

beforeEach(() => {
  queryMock.mockReset();
  fetchRucLiveMock.mockReset();
});

describe("GET /api/ficha-ruc/:ruc", () => {
  it("devuelve la ficha completa cuando el RUC está en ficha_ruc, sin consultar el fallback", async () => {
    queryMock
      .mockResolvedValueOnce({
        rows: [{ ruc: "20129156083", razon_social: "ACME SAC", estado_contribuyente: "ACTIVO" }],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/ficha-ruc/20129156083");

    expect(res.status).toBe(200);
    expect(res.body.fuente).toBe("ficha_ruc (SUNAT, importada manualmente)");
    expect(fetchRucLiveMock).not.toHaveBeenCalled();
  });

  it("cae al fallback en vivo cuando el RUC no está en ficha_ruc ni en caché", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // ficha_ruc: no encontrado
      .mockResolvedValueOnce({ rows: [] }) // ruc_lookup_cache: sin caché
      .mockResolvedValueOnce({
        rows: [
          {
            ruc: "20100070970",
            razon_social: "SUPERMERCADOS PERUANOS SAC",
            estado: "ACTIVO",
            condicion: "HABIDO",
            direccion: "CAL. MORELLI 181",
            ubigeo: "150130",
            as_of: "2026-10-05",
            consultado_en: new Date().toISOString(),
          },
        ],
      }); // INSERT ... RETURNING

    fetchRucLiveMock.mockResolvedValueOnce({
      ruc: "20100070970",
      razonSocial: "SUPERMERCADOS PERUANOS SAC",
      estado: "ACTIVO",
      condicion: "HABIDO",
      direccion: "CAL. MORELLI 181",
      ubigeo: "150130",
      asOf: "2026-10-05",
    });

    const res = await request(createApp()).get("/api/ficha-ruc/20100070970");

    expect(res.status).toBe(200);
    expect(res.body.fuente).toBe("openruc.com (ficha reducida, en vivo)");
    expect(res.body.razonSocial).toBe("SUPERMERCADOS PERUANOS SAC");
    expect(fetchRucLiveMock).toHaveBeenCalledWith("20100070970");
  });

  it("usa el caché fresco (< 24h) sin volver a llamar a openruc.com", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // ficha_ruc: no encontrado
      .mockResolvedValueOnce({
        rows: [
          {
            ruc: "20100070970",
            razon_social: "SUPERMERCADOS PERUANOS SAC",
            estado: "ACTIVO",
            condicion: "HABIDO",
            direccion: "CAL. MORELLI 181",
            ubigeo: "150130",
            as_of: "2026-10-05",
            consultado_en: new Date().toISOString(), // recién consultado
          },
        ],
      });

    const res = await request(createApp()).get("/api/ficha-ruc/20100070970");

    expect(res.status).toBe(200);
    expect(res.body.fuente).toBe("openruc.com (ficha reducida, en vivo)");
    expect(fetchRucLiveMock).not.toHaveBeenCalled();
  });

  it("responde 404 cuando ni ficha_ruc, ni el caché, ni openruc.com tienen el RUC", async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [] }) // ficha_ruc
      .mockResolvedValueOnce({ rows: [] }); // ruc_lookup_cache

    fetchRucLiveMock.mockResolvedValueOnce(null);

    const res = await request(createApp()).get("/api/ficha-ruc/99999999999");

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/openruc\.com/);
  });
});
