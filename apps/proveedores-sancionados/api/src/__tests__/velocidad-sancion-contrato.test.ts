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
  fiscalPool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));
vi.mock("../db/candidatos-pool.js", () => ({
  candidatosPool: { query: vi.fn() },
}));

const { createApp } = await import("../app.js");

// Caso real verificado 2026-09-21: LABORATORIOS UNIDOS S.A. (RUC 20417180134), inhabilitación
// OSCE vigente 2026-07-08 a 2028-07-08 (Res. 6898-2026-TCP-S1), contrato MINSA 2026-08-31 por
// S/ 600,000.
const AWARD_DURANTE_SANCION = {
  ocid: "ocds-dgv273-seacev3-1223747",
  award_id: "1223747-20417180134",
  supplier_id: "PE-RUC-20417180134",
  supplier_name: "LABORATORIOS UNIDOS S.A.",
  buyer_name: "MINISTERIO DE SALUD",
  valor_monto: "600000.00",
  valor_moneda: "PEN",
  fecha: "2026-08-31",
};

const INHABILITACION_VIGENTE = {
  ruc: "20417180134",
  resolucion: "6898-2026-TCP-S1",
  desde: "2026-07-08",
  hasta: "2028-07-08",
  estado: "VIGENTE",
};

function mockQueries({
  awards = [] as unknown[],
  minorContracts = [] as unknown[],
  inhabilitaciones = [] as unknown[],
} = {}) {
  comprasQueryMock.mockReset();
  sancionadosQueryMock.mockReset();
  comprasQueryMock.mockResolvedValueOnce({ rows: awards }).mockResolvedValueOnce({ rows: minorContracts });
  sancionadosQueryMock.mockResolvedValueOnce({ rows: inhabilitaciones });
}

beforeEach(() => {
  comprasQueryMock.mockReset();
  sancionadosQueryMock.mockReset();
});

describe("GET /api/crossref/velocidad-sancion-contrato", () => {
  it("detecta un contrato adjudicado DURANTE una inhabilitación vigente (caso real MINSA/Laboratorios Unidos)", async () => {
    mockQueries({ awards: [AWARD_DURANTE_SANCION], inhabilitaciones: [INHABILITACION_VIGENTE] });

    const app = createApp();
    const res = await request(app).get("/api/crossref/velocidad-sancion-contrato");

    expect(res.status).toBe(200);
    expect(res.body.totalAlertas).toBe(1);
    expect(res.body.alertas[0]).toMatchObject({
      ruc: "20417180134",
      severidad: "DURANTE_SANCION_VIGENTE",
      diasDesdeFinSancion: null,
      valorMonto: 600000,
    });
  });

  it("es nacional por defecto -- no filtra por departamento a menos que se pida explícitamente", async () => {
    mockQueries({ awards: [], inhabilitaciones: [] });

    const app = createApp();
    const res = await request(app).get("/api/crossref/velocidad-sancion-contrato");

    expect(res.status).toBe(200);
    expect(res.body.departamento).toBe("TODOS");
    const [awardsSql, awardsParams] = comprasQueryMock.mock.calls[0];
    expect(awardsSql).not.toMatch(/WHERE departamento/);
    expect(awardsParams).toBeUndefined();
  });

  it("detecta un contrato adjudicado poco después de que la sanción terminó, dentro de la ventana", async () => {
    const inhabExpirada = { ruc: "20417180134", resolucion: "100-2025-TCP-S1", desde: "2025-01-01", hasta: "2026-08-01", estado: "NO VIGENTE" };
    const awardDespues = { ...AWARD_DURANTE_SANCION, fecha: "2026-08-31" }; // 30 días después del fin

    mockQueries({ awards: [awardDespues], inhabilitaciones: [inhabExpirada] });

    const app = createApp();
    const res = await request(app).get("/api/crossref/velocidad-sancion-contrato").query({ ventanaDiasPostSancion: 90 });

    expect(res.status).toBe(200);
    expect(res.body.alertas[0]).toMatchObject({ severidad: "POCO_DESPUES_DE_SANCION", diasDesdeFinSancion: 30 });
  });

  it("no genera alerta si el contrato quedó fuera de la ventana post-sanción", async () => {
    const inhabExpirada = { ruc: "20417180134", resolucion: "100-2025-TCP-S1", desde: "2025-01-01", hasta: "2026-01-01", estado: "NO VIGENTE" };
    const awardLejos = { ...AWARD_DURANTE_SANCION, fecha: "2026-08-31" }; // ~240 días después

    mockQueries({ awards: [awardLejos], inhabilitaciones: [inhabExpirada] });

    const app = createApp();
    const res = await request(app).get("/api/crossref/velocidad-sancion-contrato").query({ ventanaDiasPostSancion: 90 });

    expect(res.status).toBe(200);
    expect(res.body.totalAlertas).toBe(0);
  });

  it("no genera alerta si el contrato es anterior a que la sanción siquiera empezara", async () => {
    const inhabFutura = { ruc: "20417180134", resolucion: "100-2026-TCP-S1", desde: "2026-09-01", hasta: "2028-09-01", estado: "VIGENTE" };
    const awardAntes = { ...AWARD_DURANTE_SANCION, fecha: "2026-01-15" };

    mockQueries({ awards: [awardAntes], inhabilitaciones: [inhabFutura] });

    const app = createApp();
    const res = await request(app).get("/api/crossref/velocidad-sancion-contrato");

    expect(res.status).toBe(200);
    expect(res.body.totalAlertas).toBe(0);
  });

  it("prioriza DURANTE_SANCION_VIGENTE sobre POCO_DESPUES_DE_SANCION cuando el mismo RUC tiene ambos tipos de resolución", async () => {
    const inhabVigente = INHABILITACION_VIGENTE;
    const inhabExpirada = { ruc: "20417180134", resolucion: "OTRA-RES", desde: "2020-01-01", hasta: "2021-01-01", estado: "NO VIGENTE" };

    mockQueries({ awards: [AWARD_DURANTE_SANCION], inhabilitaciones: [inhabExpirada, inhabVigente] });

    const app = createApp();
    const res = await request(app).get("/api/crossref/velocidad-sancion-contrato");

    expect(res.body.alertas[0].severidad).toBe("DURANTE_SANCION_VIGENTE");
  });

  it("ordena por severidad y luego por proximidad (días desde fin de sanción, ascendente)", async () => {
    const supplierB = { ...AWARD_DURANTE_SANCION, supplier_id: "PE-RUC-20999999999", ocid: "ocds-2", award_id: "A-2", fecha: "2026-08-31" };
    const inhabB = { ruc: "20999999999", resolucion: "RES-B", desde: "2025-01-01", hasta: "2026-08-11", estado: "NO VIGENTE" }; // 20 días antes
    const supplierC = { ...AWARD_DURANTE_SANCION, supplier_id: "PE-RUC-20888888888", ocid: "ocds-3", award_id: "A-3", fecha: "2026-08-31" };
    const inhabC = { ruc: "20888888888", resolucion: "RES-C", desde: "2025-01-01", hasta: "2026-08-25", estado: "NO VIGENTE" }; // 6 días antes

    mockQueries({ awards: [supplierB, supplierC], inhabilitaciones: [inhabB, inhabC] });

    const app = createApp();
    const res = await request(app).get("/api/crossref/velocidad-sancion-contrato").query({ ventanaDiasPostSancion: 90 });

    expect(res.body.alertas).toHaveLength(2);
    expect(res.body.alertas[0].ruc).toBe("20888888888"); // 6 días, más cercano -> primero
    expect(res.body.alertas[1].ruc).toBe("20999999999"); // 20 días
  });

  it("acepta el filtro departamento igual que crossref", async () => {
    mockQueries({ awards: [], inhabilitaciones: [] });

    const app = createApp();
    const res = await request(app).get("/api/crossref/velocidad-sancion-contrato").query({ departamento: "LA LIBERTAD" });

    expect(res.status).toBe(200);
    expect(res.body.departamento).toBe("LA LIBERTAD");
    const [awardsSql, awardsParams] = comprasQueryMock.mock.calls[0];
    expect(awardsSql).toMatch(/WHERE departamento = \$1/);
    expect(awardsParams).toEqual(["LA LIBERTAD"]);
  });
});
