import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const comprasQueryMock = vi.fn();
const sancionadosQueryMock = vi.fn();
const seguridadQueryMock = vi.fn();

vi.mock("../db/compras-pool.js", () => ({
  comprasPool: { query: comprasQueryMock },
}));
vi.mock("../db/pool.js", () => ({
  pool: { query: sancionadosQueryMock },
}));
vi.mock("../db/seguridad-pool.js", () => ({
  seguridadPool: { query: seguridadQueryMock },
}));
vi.mock("../db/fiscal-pool.js", () => ({
  fiscalPool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
}));
vi.mock("../db/candidatos-pool.js", () => ({
  candidatosPool: { query: vi.fn() },
}));
vi.mock("../db/ejecucion-pool.js", () => ({
  ejecucionPool: null,
}));

const { createApp } = await import("../app.js");

const DENUNCIA_EXTORSION = {
  provincia: "La Libertad",
  distrito: "Trujillo",
  ubigeo: "130101",
  total_extorsion: "1322",
};

const DENUNCIA_EXTORSION_2 = {
  provincia: "La Libertad",
  distrito: "Chepen",
  ubigeo: "130201",
  total_extorsion: "174",
};

const INHABILITACION_VIGENTE = {
  ruc: "20601567335",
  estado: "VIGENTE",
  desde: "2025-01-01",
  hasta: "2028-12-02",
  resolucion: "7793-2026-TCP-S2",
};

const MINOR_CONTRACT_ROW = {
  supplier_id: "seace:ruc:20601567335",
  supplier_name: "FERCONSS CORPORATIVO S.A",
  ruc: "20601567335",
  valor_monto: "150000.00",
  fecha: "2026-05-10",
  buyer_name: "MUNICIPALIDAD DE TRUJILLO",
  provincia: "La Libertad",
  distrito: "Trujillo",
};

const AWARD_ROW = {
  ocid: "ocds-peru-1",
  award_id: "AWARD-1",
  supplier_id: "PE-RUC-20601567335",
  supplier_name: "FERCONSS CORPORATIVO S.A",
  buyer_name: "MUNICIPALIDAD DE TRUJILLO",
  valor_monto: "200000.00",
  valor_moneda: "PEN",
  fecha: "2026-05-10",
};

const OWNER_VINCULO_ROW = {
  ruc: "20601567335",
  numero_documento: "12345678",
  nombre: "JUAN PEREZ",
  rol: "SOCIO",
  cargo: "PRESIDENTE",
  fecha_ingreso: "2025-01-01",
};

const OWNER_INHABILITACION_ROW = {
  dni: "12345678",
  ruc: "10123456789",
  razon_social: "JUAN PEREZ",
  resolucion: "123-2026-TCP-S1",
  estado: "VIGENTE",
  desde: "2026-01-01",
  hasta: "2028-01-01",
  infraccion: "Falta de pago de multas",
  norma: "Ley 12345",
};

beforeEach(() => {
  comprasQueryMock.mockReset();
  sancionadosQueryMock.mockReset();
  seguridadQueryMock.mockReset();
});

describe("GET /api/crossref/extorsion-sancionados", () => {
  it("devuelve distritos con denuncias de extorsión y proveedores sancionados vinculados", async () => {
    seguridadQueryMock.mockResolvedValueOnce({ rows: [DENUNCIA_EXTORSION] });
    comprasQueryMock
      .mockResolvedValueOnce({ rows: [MINOR_CONTRACT_ROW] })
      .mockResolvedValueOnce({ rows: [] });
    sancionadosQueryMock.mockResolvedValueOnce({
      rows: [{ ruc: "20601567335", estado: "VIGENTE" }],
    });

    const res = await request(createApp()).get("/api/crossref/extorsion-sancionados").query({
      departamento: "LA LIBERTAD",
      anio: "2024",
    });

    expect(res.status).toBe(200);
    expect(res.body.departamento).toBe("LA LIBERTAD");
    expect(res.body.anio).toBe(2024);
    expect(res.body.distritos).toHaveLength(1);
    expect(res.body.distritos[0]).toMatchObject({
      provincia: "La Libertad",
      distrito: "Trujillo",
      denunciasExtorsion: 1322,
    });
    expect(res.body.distritos[0].proveedoresSancionadosConContratos).toHaveLength(1);
    expect(res.body.distritos[0].proveedoresSancionadosConContratos[0]).toMatchObject({
      ruc: "20601567335",
      supplierName: "FERCONSS CORPORATIVO S.A",
      valorMonto: 150000,
    });
  });

  it("retorna empty cuando no hay denuncias de extorsión en el departamento", async () => {
    seguridadQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref/extorsion-sancionados").query({
      departamento: "APURIMAC",
      anio: "2024",
    });

    expect(res.status).toBe(200);
    expect(res.body.distritos).toHaveLength(0);
  });
});

describe("GET /api/crossref/extorsion-duenos-reales (SEC-07)", () => {
  it("detecta owner sancionado vinculado a proveedor sancionado en distrito de extorsión", async () => {
    seguridadQueryMock.mockResolvedValueOnce({ rows: [DENUNCIA_EXTORSION] });
    sancionadosQueryMock
      .mockResolvedValueOnce({ rows: [{ ruc: "20601567335" }] })
      .mockResolvedValueOnce({ rows: [OWNER_INHABILITACION_ROW] })
      .mockResolvedValueOnce({ rows: [] });
    comprasQueryMock
      .mockResolvedValueOnce({ rows: [MINOR_CONTRACT_ROW] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [OWNER_VINCULO_ROW] });

    const res = await request(createApp()).get("/api/crossref/extorsion-duenos-reales").query({
      departamento: "LA LIBERTAD",
      anio: "2024",
    });

    expect(res.status).toBe(200);
    expect(res.body.departamento).toBe("LA LIBERTAD");
    expect(res.body.anio).toBe(2024);
    expect(res.body.resultado).toHaveLength(1);
    expect(res.body.resultado[0]).toMatchObject({
      rucProveedorSancionado: "20601567335",
      proveedorNombre: "FERCONSS CORPORATIVO S.A",
    });
    expect(res.body.resultado[0].dueñosReales).toHaveLength(1);
    expect(res.body.resultado[0].dueñosReales[0]).toMatchObject({
      nombre: "JUAN PEREZ",
      rol: "SOCIO",
      tieneSancionPropia: true,
    });
    expect(res.body.resultado[0].dueñosReales[0].dniEnmascarado).toMatch(/\*\*\*\*678/);
  });

  it("no incluye proveedores sin dueños sancionados", async () => {
    seguridadQueryMock.mockResolvedValueOnce({ rows: [DENUNCIA_EXTORSION] });
    sancionadosQueryMock
      .mockResolvedValueOnce({ rows: [{ ruc: "20601567335" }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    comprasQueryMock
      .mockResolvedValueOnce({ rows: [MINOR_CONTRACT_ROW] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [OWNER_VINCULO_ROW] });

    const res = await request(createApp()).get("/api/crossref/extorsion-duenos-reales").query({
      departamento: "LA LIBERTAD",
      anio: "2024",
    });

    expect(res.status).toBe(200);
    expect(res.body.resultado).toHaveLength(0);
  });

  it("filtra proveedores por distritos de alta extorsión", async () => {
    seguridadQueryMock.mockResolvedValueOnce({ rows: [DENUNCIA_EXTORSION_2] }); // Chepen
    sancionadosQueryMock
      .mockResolvedValueOnce({ rows: [{ ruc: "20601567335" }] })
      .mockResolvedValueOnce({ rows: [OWNER_INHABILITACION_ROW] })
      .mockResolvedValueOnce({ rows: [] });
    comprasQueryMock
      .mockResolvedValueOnce({ rows: [MINOR_CONTRACT_ROW] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [OWNER_VINCULO_ROW] });

    const res = await request(createApp()).get("/api/crossref/extorsion-duenos-reales").query({
      departamento: "LA LIBERTAD",
      anio: "2024",
    });

    expect(res.status).toBe(200);
    expect(res.body.distritosAlturaExtorsion[0].distrito).toBe("Chepen");
    expect(res.body.resultado).toHaveLength(0);
  });

  it("enmascara el DNI del owner en todas las respuestas", async () => {
    seguridadQueryMock.mockResolvedValueOnce({ rows: [DENUNCIA_EXTORSION] });
    sancionadosQueryMock
      .mockResolvedValueOnce({ rows: [{ ruc: "20601567335" }] })
      .mockResolvedValueOnce({ rows: [OWNER_INHABILITACION_ROW] })
      .mockResolvedValueOnce({ rows: [] });
    comprasQueryMock
      .mockResolvedValueOnce({ rows: [MINOR_CONTRACT_ROW] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [OWNER_VINCULO_ROW] });

    const res = await request(createApp()).get("/api/crossref/extorsion-duenos-reales").query({
      departamento: "LA LIBERTAD",
      anio: "2024",
    });

    expect(res.status).toBe(200);
    const sanciones = res.body.resultado[0].sancionesOwner;
    expect(sanciones).toHaveLength(1);
    expect(sanciones[0].dniEnmascarado).toMatch(/^\*+\d{3}$/);
    expect(sanciones[0].dniEnmascarado).not.toContain("12345678");
  });
});

describe("GET /api/crossref/extorsion-velocidad-sancion (SEC-08)", () => {
  it("detecta contrato DURANTE_SANCION_VIGENTE en distrito de alta extorsión", async () => {
    seguridadQueryMock.mockResolvedValueOnce({ rows: [DENUNCIA_EXTORSION] });
    sancionadosQueryMock.mockResolvedValueOnce({ rows: [INHABILITACION_VIGENTE] });
    comprasQueryMock
      .mockResolvedValueOnce({ rows: [AWARD_ROW] })
      .mockResolvedValueOnce({ rows: [MINOR_CONTRACT_ROW] });

    const res = await request(createApp()).get("/api/crossref/extorsion-velocidad-sancion").query({
      departamento: "LA LIBERTAD",
      anio: "2024",
    });

    expect(res.status).toBe(200);
    expect(res.body.departamento).toBe("LA LIBERTAD");
    expect(res.body.anio).toBe(2024);
    expect(res.body.totalAlertas).toBe(2);
    expect(res.body.alertas[0]).toMatchObject({
      ruc: "20601567335",
      severidad: "DURANTE_SANCION_VIGENTE",
      distritoCoincidencia: {
        provincia: "La Libertad",
        distrito: "Trujillo",
        denunciasExtorsion: 1322,
      },
    });
  });

  it("retorna alerta con distritoCoincidencia nulo cuando el contrato no está en distrito de extorsión", async () => {
    const denunciaChepen = {
      provincia: "La Libertad",
      distrito: "Chepen",
      ubigeo: "130201",
      total_extorsion: "174",
    };

    seguridadQueryMock.mockResolvedValueOnce({ rows: [denunciaChepen] });
    sancionadosQueryMock.mockResolvedValueOnce({ rows: [INHABILITACION_VIGENTE] });
    comprasQueryMock
      .mockResolvedValueOnce({
        rows: [{ ...AWARD_ROW, buyer_name: "MUNICIPALIDAD DE TRUJILLO" }],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref/extorsion-velocidad-sancion").query({
      departamento: "LA LIBERTAD",
      anio: "2024",
    });

    expect(res.status).toBe(200);
    expect(res.body.totalAlertas).toBe(1);
    expect(res.body.alertas[0].distritoCoincidencia).toBeNull();
  });

  it("usa fuzzy matching de buyer_name para awards sin distrito explícito", async () => {
    seguridadQueryMock.mockResolvedValueOnce({ rows: [DENUNCIA_EXTORSION] });
    sancionadosQueryMock.mockResolvedValueOnce({ rows: [INHABILITACION_VIGENTE] });
    comprasQueryMock
      .mockResolvedValueOnce({ rows: [AWARD_ROW] })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref/extorsion-velocidad-sancion").query({
      departamento: "LA LIBERTAD",
      anio: "2024",
    });

    expect(res.status).toBe(200);
    expect(res.body.alertas[0].distritoCoincidencia).toMatchObject({
      distrito: "Trujillo",
      denunciasExtorsion: 1322,
    });
  });

  it("retorna 0 alertas cuando no hay proveedores sancionados", async () => {
    seguridadQueryMock.mockResolvedValueOnce({ rows: [DENUNCIA_EXTORSION] });
    sancionadosQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref/extorsion-velocidad-sancion").query({
      departamento: "LA LIBERTAD",
      anio: "2024",
    });

    expect(res.status).toBe(200);
    expect(res.body.totalAlertas).toBe(0);
    expect(comprasQueryMock).not.toHaveBeenCalled();
  });

  it("prioriza DURANTE_SANCION_VIGENTE en el ordenamiento", async () => {
    seguridadQueryMock.mockResolvedValueOnce({ rows: [DENUNCIA_EXTORSION] });
    sancionadosQueryMock.mockResolvedValueOnce({
      rows: [
        INHABILITACION_VIGENTE,
        { ruc: "20999999999", resolucion: "B", desde: "2024-01-01", hasta: "2025-08-11", estado: "EXPIRADA" },
      ],
    });
    comprasQueryMock
      .mockResolvedValueOnce({
        rows: [
          { ...AWARD_ROW, supplier_id: "PE-RUC-20999999999", fecha: "2025-09-10" },
          { ...AWARD_ROW, supplier_id: "PE-RUC-20601567335", fecha: "2026-05-10" },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref/extorsion-velocidad-sancion").query({
      departamento: "LA LIBERTAD",
      anio: "2024",
    });

    expect(res.status).toBe(200);
    expect(res.body.alertas[0].severidad).toBe("DURANTE_SANCION_VIGENTE");
  });
});
