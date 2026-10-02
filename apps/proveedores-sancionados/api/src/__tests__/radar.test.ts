/**
 * Tests de integración para GET /api/radar — RCC-05 a RCC-08.
 * Mock por substring de SQL (no por orden de llamada): el route dispara
 * varias queries propias en paralelo vía `Promise.all` (no reusa
 * `computeCrossref` de crossref.ts, ver docblock de routes/radar.ts) y el
 * orden exacto no es parte del contrato público del endpoint.
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
// Consorcio: 2 proveedores sancionados distintos comparten el MISMO award
// (mismo ocid+awardId) -- el total agregado debe contar el monto una sola
// vez, pero cada proveedor debe ver el monto completo en su propio total.
const AWARD_CONSORCIO_A = {
  ocid: "ocds-3", award_id: "AWARD-3", supplier_id: "PE-RUC-20601567335",
  supplier_name: "EMPRESA SANCIONADA SAC", buyer_name: "MINISTERIO C",
  valor_monto: "200000.00", valor_moneda: "PEN", fecha: "2026-05-12",
};
const AWARD_CONSORCIO_B = {
  ocid: "ocds-3", award_id: "AWARD-3", supplier_id: "PE-RUC-20609999999",
  supplier_name: "OTRA EMPRESA SANCIONADA SAC", buyer_name: "MINISTERIO C",
  valor_monto: "200000.00", valor_moneda: "PEN", fecha: "2026-05-12",
};
const INHABILITACION_VIGENTE = { ruc: "20601567335", estado: "VIGENTE", periodo_inhabilitacion: "1 año", resolucion: "R-1", desde: "2026-01-01", hasta: "2027-01-01", fetched_at: "2026-06-01" };
const INHABILITACION_VENCIDA = { ruc: "20601567335", estado: "VIGENTE", periodo_inhabilitacion: "1 año", resolucion: "R-0", desde: "2020-01-01", hasta: "2021-01-01", fetched_at: "2021-02-01" };
const INHABILITACION_CONSORCIO_B = { ruc: "20609999999", estado: "VIGENTE", periodo_inhabilitacion: "1 año", resolucion: "R-2", desde: "2026-01-01", hasta: "2027-01-01", fetched_at: "2026-06-01" };

beforeEach(() => {
  sancionadosQueryMock.mockReset();
  comprasQueryMock.mockReset();
});

describe("GET /api/radar", () => {
  it("separa montos PEN de otra moneda (desglosada) y reporta contratos sin monto por separado", async () => {
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
        { match: /inhabilitaciones_judiciales/, rows: [] },
      ])
    );

    const res = await request(createApp()).get("/api/radar");

    expect(res.status).toBe(200);
    expect(res.body.resumen.totalContratosMonto).toBe(100000);
    expect(res.body.resumen.contratosEnOtraMoneda).toBe(1);
    expect(res.body.resumen.montoPorOtraMoneda).toEqual({ USD: 5000 });
    expect(res.body.resumen.totalProveedores).toBe(1);
    expect(res.body.resumen.top5Proveedores[0].ruc).toBe("20601567335");
    expect(res.body.frescura.proveedoresSancionados.filasIngeridas).toBe(18024);
    expect(res.body.frescura.comprasPublicas.ultimaIngesta).toBe("2026-09-30");
  });

  it("no cuenta una sanción con estado VIGENTE pero `hasta` ya vencido", async () => {
    comprasQueryMock.mockImplementation(
      routeByQuery([
        { match: /FROM awards/, rows: [AWARD_PEN] },
        { match: /FROM minor_contracts/, rows: [] },
        { match: /raw_ocds_batches/, rows: [] },
      ])
    );
    sancionadosQueryMock.mockImplementation(
      routeByQuery([
        { match: /FROM inhabilitaciones i\s+JOIN raw_sanciones_batches/, rows: [INHABILITACION_VENCIDA] },
        { match: /FROM ingestion_log/, rows: [] },
        { match: /FROM sanciones_contratos_vistos/, rows: [] },
        { match: /inhabilitaciones_judiciales/, rows: [] },
      ])
    );

    const res = await request(createApp()).get("/api/radar");

    expect(res.status).toBe(200);
    expect(res.body.resumen.totalProveedores).toBe(0);
    expect(res.body.resumen.totalContratosMonto).toBe(0);
  });

  it("no duplica el monto de un award compartido por dos proveedores sancionados (consorcio), pero sí lo refleja completo en cada top5", async () => {
    comprasQueryMock.mockImplementation(
      routeByQuery([
        { match: /FROM awards/, rows: [AWARD_CONSORCIO_A, AWARD_CONSORCIO_B] },
        { match: /FROM minor_contracts/, rows: [] },
        { match: /raw_ocds_batches/, rows: [] },
      ])
    );
    sancionadosQueryMock.mockImplementation(
      routeByQuery([
        { match: /FROM inhabilitaciones i\s+JOIN raw_sanciones_batches/, rows: [INHABILITACION_VIGENTE, INHABILITACION_CONSORCIO_B] },
        { match: /FROM ingestion_log/, rows: [] },
        { match: /FROM sanciones_contratos_vistos/, rows: [] },
        { match: /inhabilitaciones_judiciales/, rows: [] },
      ])
    );

    const res = await request(createApp()).get("/api/radar");

    expect(res.status).toBe(200);
    // El award se cuenta UNA sola vez en el agregado nacional.
    expect(res.body.resumen.totalContratosMonto).toBe(200000);
    expect(res.body.resumen.totalProveedores).toBe(2);
    // Pero cada proveedor sancionado sí ve el monto completo del award
    // como su propia exposición.
    const montos = res.body.resumen.top5Proveedores.map((p: { montoTotal: number }) => p.montoTotal).sort();
    expect(montos).toEqual([200000, 200000]);
  });

  it("cuenta doble inhabilitación solo si administrativa Y judicial están vigentes hoy", async () => {
    comprasQueryMock.mockImplementation(routeByQuery([{ match: /raw_ocds_batches/, rows: [] }]));
    sancionadosQueryMock.mockImplementation(
      routeByQuery([
        { match: /FROM ingestion_log/, rows: [] },
        { match: /FROM sanciones_contratos_vistos/, rows: [] },
        {
          match: /inhabilitaciones_judiciales/,
          rows: [
            // Vigente en ambos lados -> cuenta.
            { dni_comun: "12345678", ruc_administrativo: "20601567335", admin_desde: "2026-01-01", admin_hasta: "2027-01-01", judicial_desde: "2026-01-01", judicial_hasta: "2027-01-01" },
            // Administrativa vencida -> NO cuenta.
            { dni_comun: "87654321", ruc_administrativo: "20609999999", admin_desde: "2020-01-01", admin_hasta: "2021-01-01", judicial_desde: "2026-01-01", judicial_hasta: "2027-01-01" },
          ],
        },
      ])
    );

    const res = await request(createApp()).get("/api/radar");

    expect(res.status).toBe(200);
    expect(res.body.resumen.proveedoresDobleInhabilitacion).toBe(1);
  });

  it("marca como alerta un contrato visto por primera vez dentro de la ventana, con diasDesdeSancion y diasDesdeDeteccion", async () => {
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
        { match: /inhabilitaciones_judiciales/, rows: [] },
      ])
    );

    const res = await request(createApp()).get("/api/radar");

    expect(res.status).toBe(200);
    expect(res.body.resumen.nuevosDesdeUltimaCorrida).toBe(1);
    expect(res.body.alertas).toHaveLength(1);
    expect(res.body.alertas[0]).toMatchObject({ tipo: "NUEVO_CONTRATO_SANCIONADO", ruc: "20601567335", monto: 100000 });
    expect(res.body.alertas[0]).toHaveProperty("diasDesdeSancion");
    expect(res.body.alertas[0]).toHaveProperty("diasDesdeDeteccion");
    expect(res.body.alertas[0].diasDesdeSancion).toBeGreaterThan(res.body.alertas[0].diasDesdeDeteccion);
  });

  it("devuelve ceros/vacíos (no error) cuando no hay ninguna sanción vigente", async () => {
    comprasQueryMock.mockImplementation(routeByQuery([{ match: /raw_ocds_batches/, rows: [] }]));
    sancionadosQueryMock.mockImplementation(
      routeByQuery([
        { match: /FROM ingestion_log/, rows: [] },
        { match: /inhabilitaciones_judiciales/, rows: [] },
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
        { match: /inhabilitaciones_judiciales/, rows: [] },
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
