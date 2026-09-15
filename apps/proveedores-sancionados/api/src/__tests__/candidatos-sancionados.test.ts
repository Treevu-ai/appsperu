import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const candidatosQueryMock = vi.fn();
const sancionadosQueryMock = vi.fn();
const comprasQueryMock = vi.fn();

vi.mock("../db/candidatos-pool.js", () => ({
  candidatosPool: { query: candidatosQueryMock },
}));
vi.mock("../db/pool.js", () => ({
  pool: { query: sancionadosQueryMock },
}));
vi.mock("../db/compras-pool.js", () => ({
  comprasPool: { query: comprasQueryMock },
}));
vi.mock("../db/fiscal-pool.js", () => ({
  fiscalPool: { query: vi.fn() },
}));
vi.mock("../db/ejecucion-pool.js", () => ({
  ejecucionPool: { query: vi.fn() },
}));

const { createApp } = await import("../app.js");

beforeEach(() => {
  candidatosQueryMock.mockReset();
  sancionadosQueryMock.mockReset();
  comprasQueryMock.mockReset();
});

function candidato(overrides: Record<string, unknown> = {}) {
  return {
    dni: "43446775",
    nombre_completo: "ALICIA MERCEDES RIOS PADILLA",
    cargo: "ALCALDE DISTRITAL",
    tipo_eleccion: "MUNICIPAL DISTRITAL",
    organizacion_politica: "AHORA NACION - AN",
    departamento: "LIMA",
    provincia: "HUAURA",
    distrito: "VEGUETA",
    estado: "INSCRITO",
    ...overrides,
  };
}

describe("GET /api/crossref/candidatos-sancionados", () => {
  it("requiere departamento o dni", async () => {
    const res = await request(createApp()).get("/api/crossref/candidatos-sancionados");
    expect(res.status).toBe(400);
    expect(candidatosQueryMock).not.toHaveBeenCalled();
  });

  it("marca una sanción directa (RUC-10) vigente, con el DNI enmascarado", async () => {
    candidatosQueryMock.mockResolvedValueOnce({ rows: [candidato()] });
    sancionadosQueryMock.mockResolvedValueOnce({
      rows: [
        {
          dni: "43446775", ruc: "10434467751", razon_social: "RIOS PADILLA ALICIA MERCEDES",
          estado: "VIGENTE", resolucion: "6483-2026-TCP-S6", desde: "2026-08-03", hasta: "2026-12-03",
          tipo: "INHABILITACION",
        },
      ],
    });
    comprasQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref/candidatos-sancionados").query({ departamento: "LIMA" });

    expect(res.status).toBe(200);
    expect(res.body.candidatosRevisados).toBe(1);
    expect(res.body.resultados).toHaveLength(1);
    const result = res.body.resultados[0];
    expect(result.dniEnmascarado).toBe("*****775");
    // El DNI completo no viaja como campo propio — el RUC-10 sí lo incluye
    // como substring por diseño (10 + DNI + dígito verificador) y sí se
    // expone, porque el RUC es el identificador público de la sanción.
    expect(res.body.resultados.some((r: { dniEnmascarado: string }) => r.dniEnmascarado === "43446775")).toBe(false);
    expect(result.tieneSancionDirectaVigente).toBe(true);
    expect(result.sancionesDirectas).toEqual([
      { tipo: "INHABILITACION", rucSancionado: "10434467751", resolucion: "6483-2026-TCP-S6", estado: "VIGENTE", desde: "2026-08-03", hasta: "2026-12-03" },
    ]);
    expect(result.vinculosEmpresariales).toEqual([]);
  });

  it("distingue un vínculo societario sin sanción de una sanción directa — no las mezcla", async () => {
    candidatosQueryMock.mockResolvedValueOnce({ rows: [candidato({ dni: "12345678" })] });
    sancionadosQueryMock
      .mockResolvedValueOnce({ rows: [] }) // sanciones directas: ninguna
      .mockResolvedValueOnce({ rows: [] }); // sanciones de la empresa vinculada: ninguna
    comprasQueryMock.mockResolvedValueOnce({
      rows: [
        { numero_documento: "12345678", ruc: "20611348003", nombre: "SANCHEZ NUÑEZ EDGAR ADOLFO", rol: "SOCIO", cargo: null, fecha_ingreso: "2020-01-01" },
      ],
    });

    const res = await request(createApp()).get("/api/crossref/candidatos-sancionados").query({ departamento: "LIMA" });

    expect(res.status).toBe(200);
    const result = res.body.resultados[0];
    expect(result.sancionesDirectas).toEqual([]);
    expect(result.vinculosEmpresariales).toHaveLength(1);
    expect(result.vinculosEmpresariales[0]).toMatchObject({ ruc: "20611348003", empresaTieneSancion: false, sancionesEmpresa: [] });
  });

  it("marca empresaTieneSancion cuando la empresa vinculada sí tiene una sanción, sin que sea una sanción directa de la persona", async () => {
    candidatosQueryMock.mockResolvedValueOnce({ rows: [candidato({ dni: "12345678" })] });
    sancionadosQueryMock
      .mockResolvedValueOnce({ rows: [] }) // sanciones directas de la persona: ninguna
      .mockResolvedValueOnce({
        rows: [
          { dni: null, ruc: "20539807081", razon_social: "AGUSTINA SERVICIOS GENERALES", estado: "VIGENTE", resolucion: "1287-2026-TCP-S4", desde: "2026-03-10", hasta: "2026-09-10", tipo: "INHABILITACION" },
        ],
      });
    comprasQueryMock.mockResolvedValueOnce({
      rows: [{ numero_documento: "12345678", ruc: "20539807081", nombre: "ALGUIEN GERENTE", rol: "REPRESENTANTE", cargo: "Gerente General", fecha_ingreso: null }],
    });

    const res = await request(createApp()).get("/api/crossref/candidatos-sancionados").query({ departamento: "LIMA" });

    const result = res.body.resultados[0];
    expect(result.sancionesDirectas).toEqual([]);
    expect(result.vinculosEmpresariales[0].empresaTieneSancion).toBe(true);
    expect(result.vinculosEmpresariales[0].sancionesEmpresa).toHaveLength(1);
  });

  it("no incluye a un candidato sin vínculo ni sanción en los resultados", async () => {
    candidatosQueryMock.mockResolvedValueOnce({ rows: [candidato({ dni: "99999999" })] });
    sancionadosQueryMock.mockResolvedValueOnce({ rows: [] });
    comprasQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp()).get("/api/crossref/candidatos-sancionados").query({ departamento: "LIMA" });

    expect(res.status).toBe(200);
    expect(res.body.candidatosRevisados).toBe(1);
    expect(res.body.resultados).toEqual([]);
  });

  it("acepta una lista explícita de dni en vez de departamento", async () => {
    candidatosQueryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(createApp()).get("/api/crossref/candidatos-sancionados").query({ dni: "12345678,87654321" });
    expect(res.status).toBe(200);
    const [, params] = candidatosQueryMock.mock.calls[0];
    expect(params[0]).toEqual(["12345678", "87654321"]);
  });
});
