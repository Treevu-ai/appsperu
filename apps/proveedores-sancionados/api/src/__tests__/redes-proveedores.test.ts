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
// app.ts monta crossrefRouter, que importa fiscal-pool.ts — este último lee
// FISCAL_DATABASE_URL al cargar el módulo. Sin mockearlo, importar app.ts
// en un proceso de test sin ese env var lanza al vuelo, aunque esta ruta
// no lo use.
vi.mock("../db/fiscal-pool.js", () => ({
  fiscalPool: { query: vi.fn() },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  comprasQueryMock.mockReset();
  sancionadosQueryMock.mockReset();
});

describe("GET /api/crossref/redes-proveedores", () => {
  it("devuelve proveedores con su huella de municipios y montos", async () => {
    comprasQueryMock.mockResolvedValueOnce({
      rows: [
        {
          supplier_id: "seace:ruc:20123456789",
          legal_name: "Constructora Ejemplo SAC",
          ruc: "20123456789",
          municipios_count: 3,
          contratos: 5,
          monto_total: "150000",
          municipios: [
            { municipalityId: "m1", officialName: "Municipalidad Distrital de Moche", district: "MOCHE" },
            { municipalityId: "m2", officialName: "Municipalidad Distrital de Huanchaco", district: "HUANCHACO" },
          ],
        },
      ],
    });
    sancionadosQueryMock.mockResolvedValueOnce({ rows: [] });

    const app = createApp();
    const res = await request(app).get("/api/crossref/redes-proveedores");

    expect(res.status).toBe(200);
    expect(res.body.resultados[0]).toMatchObject({
      supplierId: "seace:ruc:20123456789",
      ruc: "20123456789",
      municipiosCount: 3,
      contratos: 5,
      montoTotal: 150000,
      tieneInhabilitacionVigente: false,
    });

    const [, comprasParams] = comprasQueryMock.mock.calls[0];
    expect(comprasParams).toEqual(["LA LIBERTAD", 2]);
  });

  it("marca tieneInhabilitacionVigente cuando el RUC tiene sanción vigente", async () => {
    comprasQueryMock.mockResolvedValueOnce({
      rows: [
        {
          supplier_id: "seace:ruc:20987654321",
          legal_name: "Servicios Generales EIRL",
          ruc: "20987654321",
          municipios_count: 2,
          contratos: 2,
          monto_total: "50000",
          municipios: [],
        },
      ],
    });
    sancionadosQueryMock.mockResolvedValueOnce({ rows: [{ ruc: "20987654321" }] });

    const app = createApp();
    const res = await request(app).get("/api/crossref/redes-proveedores");

    expect(res.status).toBe(200);
    expect(res.body.resultados[0].tieneInhabilitacionVigente).toBe(true);
  });

  it("filtra a solo sancionados cuando soloSancionados=true", async () => {
    comprasQueryMock.mockResolvedValueOnce({
      rows: [
        { supplier_id: "seace:ruc:20111111111", legal_name: "Sin sancion SAC", ruc: "20111111111", municipios_count: 2, contratos: 2, monto_total: "1000", municipios: [] },
        { supplier_id: "seace:ruc:20222222222", legal_name: "Con sancion SAC", ruc: "20222222222", municipios_count: 2, contratos: 2, monto_total: "2000", municipios: [] },
      ],
    });
    sancionadosQueryMock.mockResolvedValueOnce({ rows: [{ ruc: "20222222222" }] });

    const app = createApp();
    const res = await request(app).get("/api/crossref/redes-proveedores").query({ soloSancionados: "true" });

    expect(res.status).toBe(200);
    expect(res.body.resultados).toHaveLength(1);
    expect(res.body.resultados[0].ruc).toBe("20222222222");
  });

  it("responde 400 cuando minMunicipios no es un número válido, sin tocar ningún pool", async () => {
    const app = createApp();
    const res = await request(app).get("/api/crossref/redes-proveedores").query({ minMunicipios: "abc" });

    expect(res.status).toBe(400);
    expect(comprasQueryMock).not.toHaveBeenCalled();
    expect(sancionadosQueryMock).not.toHaveBeenCalled();
  });
});
