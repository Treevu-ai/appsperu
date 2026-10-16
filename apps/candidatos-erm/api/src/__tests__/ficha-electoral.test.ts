/**
 * Ficha electoral por circunscripción (ERM 2026) — une candidatos, autoridades
 * electas y RENAMU por UBIGEO, más sanciones del Tribunal de Contrataciones
 * por DNI exacto. Ninguna unión es difusa.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const candidatosQueryMock = vi.fn();
const autoridadesQueryMock = vi.fn();
const renamuQueryMock = vi.fn();
const sancionadosQueryMock = vi.fn();

vi.mock("../db/pool.js", () => ({
  pool: { query: candidatosQueryMock },
}));
vi.mock("../db/autoridades-pool.js", () => ({
  autoridadesPool: { query: autoridadesQueryMock },
}));
vi.mock("../db/renamu-pool.js", () => ({
  renamuPool: { query: renamuQueryMock },
}));
vi.mock("../db/sancionados-pool.js", () => ({
  sancionadosPool: { query: sancionadosQueryMock },
}));

const { createApp } = await import("../app.js");

const UBIGEO = "130101";

// DNI real de prueba 45678901 → enmascarado *****901 (últimos 3 visibles)
const CANDIDATO_A = {
  dni: "45678901",
  nombre_completo: "MARIA PEREZ LOPEZ",
  cargo: "ALCALDE DISTRITAL",
  tipo_eleccion: "MUNICIPAL DISTRITAL",
  organizacion_politica: "PARTIDO EJEMPLO",
  organizacion_estado: null,
  estado: "INSCRITO",
  departamento: "LA LIBERTAD",
  provincia: "TRUJILLO",
  distrito: "TRUJILLO",
  posicion: 1,
  sentencias_declaradas: 0,
};

const CANDIDATO_B = {
  ...CANDIDATO_A,
  dni: "70123456",
  nombre_completo: "JUAN GARCIA RIOS",
  posicion: 2,
  sentencias_declaradas: 2,
};

const AUTORIDAD = {
  nombres: "PEDRO",
  apellido_paterno: "QUISPE",
  apellido_materno: "MAMANI",
  cargo: "ALCALDE",
  organizacion_politica: "PARTIDO EJEMPLO",
  ambito: "DISTRITAL",
  periodo: "2023-2026",
};

const MUNICIPIO = {
  id: "55",
  idmunici: "MUN001",
  anio: 2024,
  tipomuni: "2",
  departamento: "LA LIBERTAD",
  provincia: "TRUJILLO",
  distrito: "TRUJILLO",
};

const SANCION = {
  dni: "70123456",
  ruc: "20601567335",
  razon_social: "CONSTRUCTORA EJEMPLO S.A.C.",
  estado: "VIGENTE",
  resolucion: "RES. 001-2024",
  desde: "2024-01-01",
  hasta: "2026-01-01",
  tipo: "INHABILITACION",
};

function mockTodasLasFuentes() {
  candidatosQueryMock.mockResolvedValueOnce({ rows: [CANDIDATO_A, CANDIDATO_B] });
  autoridadesQueryMock.mockResolvedValueOnce({ rows: [AUTORIDAD] });
  renamuQueryMock
    .mockResolvedValueOnce({ rows: [MUNICIPIO] }) // municipalidad
    .mockResolvedValueOnce({ rows: [{ tiene_internet: true }] }) // conectividad
    .mockResolvedValueOnce({ rows: [{ operativos: "3" }] }); // vehículos
  sancionadosQueryMock.mockResolvedValueOnce({ rows: [SANCION] });
}

beforeEach(() => {
  candidatosQueryMock.mockReset();
  autoridadesQueryMock.mockReset();
  renamuQueryMock.mockReset();
  sancionadosQueryMock.mockReset();
});

describe("GET /api/ficha-electoral", () => {
  it("junta candidatos, autoridades, municipalidad y sanciones en una sola respuesta", async () => {
    mockTodasLasFuentes();

    const res = await request(createApp()).get("/api/ficha-electoral").query({ ubigeo: UBIGEO });

    expect(res.status).toBe(200);
    expect(res.body.ubigeo).toBe(UBIGEO);
    expect(res.body.distrito).toBe("TRUJILLO");

    expect(res.body.candidatos.total).toBe(2);
    expect(res.body.candidatos.inscritos).toBe(2);
    expect(res.body.candidatos.porTipoYEleccion).toEqual([
      { tipoEleccion: "MUNICIPAL DISTRITAL", cargo: "ALCALDE DISTRITAL", total: 2 },
    ]);
    expect(res.body.candidatos.conSentenciasDeclaradas).toBe(1);

    expect(res.body.autoridadesVigentes.total).toBe(1);
    expect(res.body.autoridadesVigentes.detalle[0].nombreCompleto).toBe("PEDRO QUISPE MAMANI");

    expect(res.body.municipalidad).toMatchObject({
      idmunici: "MUN001",
      anio: 2024,
      tipo: "Distrital",
      tieneInternet: true,
      vehiculosOperativos: 3,
    });

    expect(res.body.advertencia).toMatch(/no establece ninguna relación causal/);
  });

  it("enmascara el DNI en el detalle de candidatos y en las sanciones", async () => {
    mockTodasLasFuentes();

    const res = await request(createApp()).get("/api/ficha-electoral").query({ ubigeo: UBIGEO });

    expect(res.body.candidatos.detalle[0].dniEnmascarado).toBe("*****901");
    expect(res.body.candidatos.detalle[1].dniEnmascarado).toBe("*****456");
    expect(res.body.candidatos.detalle[0].dni).toBeUndefined();

    expect(res.body.candidatosConSancionDirecta).toHaveLength(1);
    expect(res.body.candidatosConSancionDirecta[0].dniEnmascarado).toBe("*****456");
    expect(res.body.candidatosConSancionDirecta[0].dni).toBeUndefined();
    expect(res.body.candidatosConSancionDirecta[0].sanciones[0]).toMatchObject({
      tipo: "INHABILITACION",
      estado: "VIGENTE",
      razonSocial: "CONSTRUCTORA EJEMPLO S.A.C.",
    });
    expect(res.body.candidatosConSancionDirecta[0].sanciones[0].nota).toBeUndefined();
  });

  it("la nota de sanciones aclara que no es sentencia penal ni inhabilita la postulación", async () => {
    mockTodasLasFuentes();

    const res = await request(createApp()).get("/api/ficha-electoral").query({ ubigeo: UBIGEO });

    expect(res.body.candidatosConSancionDirecta[0].sanciones).toHaveLength(1);
    // La restricción viaja en el cuerpo de la ficha, no solo en la documentación.
    expect(res.body.notaSanciones).toMatch(/sentencia penal/);
    expect(res.body.notaSanciones).toMatch(/no inhabilita/);
  });

  it("sin autoridades, el total es 0 y la nota explica que no significa 'no hay autoridad'", async () => {
    candidatosQueryMock.mockResolvedValueOnce({ rows: [CANDIDATO_A] });
    autoridadesQueryMock.mockResolvedValueOnce({ rows: [] });
    renamuQueryMock
      .mockResolvedValueOnce({ rows: [MUNICIPIO] })
      .mockResolvedValueOnce({ rows: [{ tiene_internet: true }] })
      .mockResolvedValueOnce({ rows: [{ operativos: "0" }] });
    sancionadosQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/ficha-electoral").query({ ubigeo: UBIGEO });

    expect(res.status).toBe(200);
    expect(res.body.autoridadesVigentes.total).toBe(0);
    expect(res.body.autoridadesVigentes.detalle).toEqual([]);
    expect(res.body.autoridadesVigentes.nota).toMatch(/NO significa que la circunscripción no tenga autoridad/);
  });

  it("sin candidatos no se consulta sanciones, y el cruce vacío no se confunde con 'sin sanciones'", async () => {
    candidatosQueryMock.mockResolvedValueOnce({ rows: [] });
    autoridadesQueryMock.mockResolvedValueOnce({ rows: [] });
    renamuQueryMock
      .mockResolvedValueOnce({ rows: [MUNICIPIO] })
      .mockResolvedValueOnce({ rows: [{ tiene_internet: false }] })
      .mockResolvedValueOnce({ rows: [{ operativos: "1" }] });

    const res = await request(createApp()).get("/api/ficha-electoral").query({ ubigeo: UBIGEO });

    expect(res.status).toBe(200);
    expect(sancionadosQueryMock).not.toHaveBeenCalled();
    expect(res.body.candidatosConSancionDirecta).toEqual([]);
  });

  it("sin candidatos, los nombres territoriales salen de RENAMU", async () => {
    candidatosQueryMock.mockResolvedValueOnce({ rows: [] });
    autoridadesQueryMock.mockResolvedValueOnce({ rows: [] });
    renamuQueryMock
      .mockResolvedValueOnce({ rows: [MUNICIPIO] })
      .mockResolvedValueOnce({ rows: [{ tiene_internet: true }] })
      .mockResolvedValueOnce({ rows: [{ operativos: "0" }] });

    const res = await request(createApp()).get("/api/ficha-electoral").query({ ubigeo: UBIGEO });

    expect(res.body.departamento).toBe("LA LIBERTAD");
    expect(res.body.provincia).toBe("TRUJILLO");
    expect(res.body.distrito).toBe("TRUJILLO");
  });

  it("responde 404 si ninguna de las tres fuentes por UBIGEO conoce el distrito", async () => {
    candidatosQueryMock.mockResolvedValueOnce({ rows: [] });
    autoridadesQueryMock.mockResolvedValueOnce({ rows: [] });
    renamuQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/ficha-electoral").query({ ubigeo: UBIGEO });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no aparece en ninguna de las tres fuentes/);
  });

  it("pasa el UBIGEO a las tres fuentes por UBIGEO", async () => {
    mockTodasLasFuentes();

    await request(createApp()).get("/api/ficha-electoral").query({ ubigeo: UBIGEO });

    expect(candidatosQueryMock.mock.calls[0][1]).toEqual([UBIGEO]);
    expect(autoridadesQueryMock.mock.calls[0][1]).toEqual([UBIGEO]);
    expect(renamuQueryMock.mock.calls[0][1]).toEqual([UBIGEO]);
  });

  it("usa el año más reciente de RENAMU", async () => {
    mockTodasLasFuentes();

    await request(createApp()).get("/api/ficha-electoral").query({ ubigeo: UBIGEO });

    const [sql] = renamuQueryMock.mock.calls[0];
    expect(sql).toMatch(/ORDER BY anio DESC/);
    expect(sql).toMatch(/LIMIT 1/);
  });

  it("un UBIGEO mal formado responde 400 y no toca ninguna base", async () => {
    const res = await request(createApp()).get("/api/ficha-electoral").query({ ubigeo: "1301" });

    expect(res.status).toBe(400);
    expect(candidatosQueryMock).not.toHaveBeenCalled();
    expect(autoridadesQueryMock).not.toHaveBeenCalled();
    expect(renamuQueryMock).not.toHaveBeenCalled();
    expect(sancionadosQueryMock).not.toHaveBeenCalled();
  });
});
