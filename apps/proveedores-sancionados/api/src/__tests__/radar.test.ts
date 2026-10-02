/**
 * Tests de integración para GET /api/radar — RCC-05 a RCC-09.
 * Mock por sustring de SQL (no por orden de llamada): `computeCrossref`
 * dispara varias queries en paralelo vía `Promise.all` y el orden exacto no
 * es parte del contrato público del endpoint.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

function routeByQuery(routes: { match: RegExp; rows: unknown[] }[]) {
  return vi.fn((sql: string) => {
    const hit = routes.find((r) => r.match.test(sql));
    return Promise.resolve({ rows: hit ? hit.rows : [] });
  });
}

const sancionadosQueryMock = vi.fn();
const comprasQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({ pool: { query: sancionadosQueryMock } }));
vi.mock("../db/compras-pool.js", () => ({ comprasPool: { query: comprasQueryMock } }));
vi.mock("../db/fiscal-pool.js", () => ({ fiscalPool: { query: vi.fn().mockResolvedValue({ rows: [] }) } }));
vi.mock("../db/candidatos-pool.js", () => ({ candidatosPool: { query: vi.fn().mockResolvedValue({ rows: [] }) } }));

const { createApp } = await import("../app.js");

const AWARD_PEN = {
  ocid: "ocds-1", award_id: "AWARD-1", supplier_id: "PE-RUC-20601567335",
  supplier_name: "EMPRESA SANCIONADA SAC", buyer_name: "MINISTERIO A",
  valor_monto: "100000.00", valor_moneda: "PEN", fecha: "2026-05-10",
};
const AWARD_USD = {
  ocid: "ocds-2", award_id: "AWARD-2", supplier_id: "PE-RUC-20601567335",
  supplier_name: "EMPRESA SANCIONADA SAC", buyer_name: "MINISTERIO B",
  valor_monto: "5000.00", valor_moneda: "USD", fecha: "2026-05-11",
};
const INHABILITACION_VIGENTE = { ruc: "20601567335", estado: "VIGENTE", periodo_inhabilitacion: "1 año", resolucion: "R-1", desde: "2026-01-01", hasta: "2027-01-01", fetched_at: "2026-06-01" };

beforeEach(() => {
  sancionadosQueryMock.mockReset();
  comprasQueryMock.mockReset();
});

describe("GET /api/radar", () => {
  it("separa montos PEN de otra moneda y reporta contratos sin monto/sin ruc por separado", async () => {
    comprasQueryMock.mockImplementation(
      routeByQuery([
        { match: /FROM awards/, rows: [AWARD_PEN, AWARD_USD] },
        { match: /FROM minor_contracts/, rows: [] },
        { match: /raw_ocds_batches/, rows: [{ fetched_at: "2026-09-30" }] },
      ])
    );
    sancionadosQueryMock.mockImplementation(
      routeByQuery([
        { match: /FROM inhabilitaciones i\s+JOIN raw_sanciones_batches/, rows: [INHABILITACION_VIGENTE] },
        { match: /FROM ingestion_log/, rows: [{ ultima_ejecucion: "2026-09-29", filas_ingeridas: 18024 }] },
        { match: /FROM sanciones_contratos_vistos/, rows: [] },
        { match: /inhabilitaciones_judiciales/, rows: [{ total: "0" }] },
      ])
    );

    const res = await request(createApp()).get("/api/radar");

    expect(res.status).toBe(200);
    expect(res.body.resumen.totalContratosMonto).toBe(100000);
    expect(res.body.resumen.contratosEnOtraMoneda).toBe(1);
    expect(res.body.resumen.montoEnOtraMoneda).toBe(5000);
    expect(res.body.resumen.totalProveedores).toBe(1);
    expect(res.body.resumen.top5Proveedores[0].ruc).toBe("20601567335");
    expect(res.body.frescura.proveedoresSancionados.filasIngeridas).toBe(18024);
    expect(res.body.frescura.comprasPublicas.ultimaIngesta).toBe("2026-09-30");
  });

  it("marca como alerta un contrato visto por primera vez dentro de la ventana", async () => {
    comprasQueryMock.mockImplementation(
      routeByQuery([
        { match: /FROM awards/, rows: [AWARD_PEN] },
        { match: /FROM minor_contracts/, rows: [] },
        { match: /raw_ocds_batches/, rows: [] },
      ])
    );
    sancionadosQueryMock.mockImplementation(
      routeByQuery([
        { match: /FROM inhabilitaciones i\s+JOIN raw_sanciones_batches/, rows: [INHABILITACION_VIGENTE] },
        { match: /FROM ingestion_log/, rows: [] },
        {
          match: /FROM sanciones_contratos_vistos/,
          rows: [{ ruc: "20601567335", referencia_contrato: "awards:ocds-1:AWARD-1", primera_vez_visto: "2026-09-25" }],
        },
        { match: /inhabilitaciones_judiciales/, rows: [{ total: "0" }] },
      ])
    );

    const res = await request(createApp()).get("/api/radar");

    expect(res.status).toBe(200);
    expect(res.body.resumen.nuevosDesdeUltimaCorrida).toBe(1);
    expect(res.body.alertas).toHaveLength(1);
    expect(res.body.alertas[0]).toMatchObject({ tipo: "NUEVO_CONTRATO_SANCIONADO", ruc: "20601567335", monto: 100000 });
  });

  it("devuelve ceros/vacíos (no error) cuando no hay ninguna sanción vigente", async () => {
    comprasQueryMock.mockImplementation(routeByQuery([{ match: /raw_ocds_batches/, rows: [] }]));
    sancionadosQueryMock.mockImplementation(
      routeByQuery([
        { match: /FROM ingestion_log/, rows: [] },
        { match: /inhabilitaciones_judiciales/, rows: [{ total: "0" }] },
      ])
    );

    const res = await request(createApp()).get("/api/radar");

    expect(res.status).toBe(200);
    expect(res.body.resumen.totalProveedores).toBe(0);
    expect(res.body.resumen.top5Proveedores).toEqual([]);
    expect(res.body.alertas).toEqual([]);
  });

  it("acepta ventanaDiasNuevos y la refleja en el resumen", async () => {
    comprasQueryMock.mockImplementation(routeByQuery([{ match: /raw_ocds_batches/, rows: [] }]));
    sancionadosQueryMock.mockImplementation(
      routeByQuery([
        { match: /FROM ingestion_log/, rows: [] },
        { match: /inhabilitaciones_judiciales/, rows: [{ total: "0" }] },
      ])
    );

    const res = await request(createApp()).get("/api/radar").query({ ventanaDiasNuevos: "30" });
    expect(res.status).toBe(200);
    expect(res.body.resumen.ventanaDiasNuevos).toBe(30);
  });

  it("rechaza ventanaDiasNuevos fuera de rango", async () => {
    const res = await request(createApp()).get("/api/radar").query({ ventanaDiasNuevos: "9999" });
    expect(res.status).toBe(400);
  });
});
