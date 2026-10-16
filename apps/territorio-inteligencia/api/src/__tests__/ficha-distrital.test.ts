/**
 * Ficha distrital de presión institucional — une SIDPOL, MIDIS, RENIPRESS y
 * MTPE por UBIGEO. Las cuatro fuentes son independientes: un vacío en una no
 * anula las otras, y un vacío se expone como `null`, nunca como cero.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import request from "supertest";

const seguridadQueryMock = vi.fn();
const programasQueryMock = vi.fn();
const saludQueryMock = vi.fn();
const empresasQueryMock = vi.fn();

vi.mock("../db/seguridad-pool.js", () => ({
  seguridadPool: { query: seguridadQueryMock },
}));
vi.mock("../db/programas-pool.js", () => ({
  programasPool: { query: programasQueryMock },
}));
vi.mock("../db/salud-pool.js", () => ({
  saludPool: { query: saludQueryMock },
}));
vi.mock("../db/empresas-pool.js", () => ({
  empresasPool: { query: empresasQueryMock },
}));

const { createApp } = await (async () => {
  // `createApp()` importa todos los routers de la app, y cada pool cross-app
  // lanza en tiempo de import si su variable no está definida. Definirlas aquí
  // alcanza para que el import no truene: un `Pool` no abre conexión al
  // construirse. `dotenv/config` no pisa valores ya presentes, así que esto
  // también funciona con un `.env` local que exista.
  for (const variable of [
    "CATASTRO_MINERO_DATABASE_URL",
    "CATASTRO_FORESTAL_DATABASE_URL",
    "SANCIONES_DATABASE_URL",
    "GEO_INTERSECTIONS_DATABASE_URL",
    "INVERSION_PRIVADA_DATABASE_URL",
    "SEGURIDAD_DATABASE_URL",
    "PROGRAMAS_DATABASE_URL",
    "SALUD_DATABASE_URL",
    "EMPRESAS_DATABASE_URL",
  ]) {
    process.env[variable] ??= "postgresql://user:pass@localhost/no-conecta";
  }
  return import("../app.js");
})();

const UBIGEO = "130101";

const DENUNCIA_EXTORSION = {
  departamento: "LA LIBERTAD",
  provincia: "TRUJILLO",
  distrito: "TRUJILLO",
  modalidad: "Extorsión",
  cantidad: "1322",
};

const DENUNCIA_SECUESTRO = {
  departamento: "LA LIBERTAD",
  provincia: "TRUJILLO",
  distrito: "TRUJILLO",
  modalidad: "Secuestro",
  cantidad: "84",
};

const COBERTURA_CON_NULLS = {
  fecha_corte: new Date("2026-03-31T00:00:00.000Z"),
  cunamas_cuidado_diurno: 120,
  cunamas_acompanamiento_familias: null,
  juntos_hogares_afiliados: 900,
  juntos_hogares_abonados: 870,
  foncodes_usuarios_estimados: null,
  qaliwarma_ninos_atendidos: 4500,
  qaliwarma_iiee: 31,
  pension65_usuarios: 2100,
  contigo_usuarios: null,
  pais_tambos: 2,
  pais_atenciones: 150,
  pais_beneficiarios: 1200,
};

const IPRESS_FILA = {
  total: "48",
  activos: "41",
  departamento: "LA LIBERTAD",
  provincia: "TRUJILLO",
  distrito: "TRUJILLO",
};

const EMPRESA_FILA = { anio: 2025, mes: 8, numero_empresas: 9210, distrito: "TRUJILLO" };

function mockLasCuatroFuentes() {
  seguridadQueryMock.mockResolvedValueOnce({
    rows: [DENUNCIA_EXTORSION, DENUNCIA_SECUESTRO],
  });
  programasQueryMock.mockResolvedValueOnce({ rows: [COBERTURA_CON_NULLS] });
  saludQueryMock.mockResolvedValueOnce({ rows: [IPRESS_FILA] });
  empresasQueryMock.mockResolvedValueOnce({ rows: [EMPRESA_FILA] });
}

beforeEach(() => {
  seguridadQueryMock.mockReset();
  programasQueryMock.mockReset();
  saludQueryMock.mockReset();
  empresasQueryMock.mockReset();
});

describe("GET /api/ficha-distrital", () => {
  it("junta las cuatro fuentes y expone cada serie con su propia restricción", async () => {
    mockLasCuatroFuentes();

    const res = await request(createApp())
      .get("/api/ficha-distrital")
      .query({ ubigeo: UBIGEO, anio: "2025" });

    expect(res.status).toBe(200);
    expect(res.body.ubigeo).toBe(UBIGEO);
    expect(res.body.anio).toBe(2025);
    expect(res.body.distrito).toBe("TRUJILLO");

    // SIDPOL: ambas modalidades, ordenadas por volumen, con la restricción
    // explícita de que una denuncia no es un hecho confirmado ni es homicidio.
    expect(res.body.denuncias.total).toBe(1406);
    expect(res.body.denuncias.porModalidad[0]).toEqual({ modalidad: "Extorsión", cantidad: 1322 });
    expect(res.body.denuncias.nota).toMatch(/imputación, no un hecho confirmado/);
    expect(res.body.denuncias.nota).toMatch(/homicidio/);

    expect(res.body.establecimientosSalud).toEqual({
      total: 48,
      activos: 41,
      nota: expect.stringContaining("RENIPRESS"),
    });

    expect(res.body.empresasPrivadas).toMatchObject({
      anio: 2025,
      mes: 8,
      numeroEmpresas: 9210,
    });
    expect(res.body.advertencia).toMatch(/Coincidencia territorial/);
  });

  it("MIDIS: un NULL de programa es 'sin dato', se lista y no se lee como cero", async () => {
    mockLasCuatroFuentes();

    const res = await request(createApp())
      .get("/api/ficha-distrital")
      .query({ ubigeo: UBIGEO, anio: "2025" });

    expect(res.body.coberturaSocial.fechaCorte).toBe("2026-03-31T00:00:00.000Z");
    expect(res.body.coberturaSocial.programas.juntos_hogares_afiliados).toBe(900);
    expect(res.body.coberturaSocial.programas.cunamas_acompanamiento_familias).toBeNull();
    expect(res.body.coberturaSocial.columnasSinDato).toEqual([
      "cunamas_acompanamiento_familias",
      "foncodes_usuarios_estimados",
      "contigo_usuarios",
    ]);
  });

  it("SIDPOL sin registro devuelve denuncias null (no 0) y la ficha sigue armándose", async () => {
    seguridadQueryMock.mockResolvedValueOnce({ rows: [] });
    programasQueryMock.mockResolvedValueOnce({ rows: [COBERTURA_CON_NULLS] });
    saludQueryMock.mockResolvedValueOnce({ rows: [IPRESS_FILA] });
    empresasQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp())
      .get("/api/ficha-distrital")
      .query({ ubigeo: UBIGEO, anio: "2025" });

    expect(res.status).toBe(200);
    expect(res.body.denuncias.total).toBeNull();
    expect(res.body.denuncias.porModalidad).toEqual([]);
    // Sin SIDPOL ni MTPE, los nombres territoriales salen de RENIPRESS.
    expect(res.body.distrito).toBe("TRUJILLO");
    expect(res.body.empresasPrivadas).toBeNull();
  });

  it("RENIPRESS sin establecimientos expone null, no un conteo de cero", async () => {
    seguridadQueryMock.mockResolvedValueOnce({ rows: [DENUNCIA_EXTORSION] });
    programasQueryMock.mockResolvedValueOnce({ rows: [] });
    saludQueryMock.mockResolvedValueOnce({ rows: [{ total: "0", activos: "0", departamento: null, provincia: null, distrito: null }] });
    empresasQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp())
      .get("/api/ficha-distrital")
      .query({ ubigeo: UBIGEO, anio: "2025" });

    expect(res.status).toBe(200);
    expect(res.body.establecimientosSalud).toBeNull();
    expect(res.body.coberturaSocial).toBeNull();
  });

  it("responde 404 si ninguna de las cuatro fuentes conoce el UBIGEO", async () => {
    seguridadQueryMock.mockResolvedValueOnce({ rows: [] });
    programasQueryMock.mockResolvedValueOnce({ rows: [] });
    saludQueryMock.mockResolvedValueOnce({ rows: [{ total: "0", activos: "0", departamento: null, provincia: null, distrito: null }] });
    empresasQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(createApp())
      .get("/api/ficha-distrital")
      .query({ ubigeo: UBIGEO, anio: "2025" });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/no aparece en ninguna de las cuatro fuentes/);
  });

  it("pasa el UBIGEO a las cuatro fuentes", async () => {
    mockLasCuatroFuentes();

    await request(createApp()).get("/api/ficha-distrital").query({ ubigeo: UBIGEO, anio: "2025" });

    expect(seguridadQueryMock.mock.calls[0][1]).toEqual([UBIGEO, 2025]);
    expect(programasQueryMock.mock.calls[0][1]).toEqual([UBIGEO]);
    expect(saludQueryMock.mock.calls[0][1]).toEqual([UBIGEO]);
    expect(empresasQueryMock.mock.calls[0][1]).toEqual([UBIGEO]);
  });

  it("usa el corte más reciente de MIDIS y de MTPE, no el más antiguo", async () => {
    mockLasCuatroFuentes();

    await request(createApp()).get("/api/ficha-distrital").query({ ubigeo: UBIGEO, anio: "2025" });

    const [programasSql] = programasQueryMock.mock.calls[0];
    expect(programasSql).toMatch(/ORDER BY fecha_corte DESC/);
    expect(programasSql).toMatch(/LIMIT 1/);

    const [empresasSql] = empresasQueryMock.mock.calls[0];
    expect(empresasSql).toMatch(/ORDER BY anio DESC, mes DESC/);
  });

  it("un UBIGEO mal formado responde 400 y no toca ninguna base", async () => {
    const res = await request(createApp())
      .get("/api/ficha-distrital")
      .query({ ubigeo: "1301", anio: "2025" });

    expect(res.status).toBe(400);
    expect(seguridadQueryMock).not.toHaveBeenCalled();
    expect(programasQueryMock).not.toHaveBeenCalled();
    expect(saludQueryMock).not.toHaveBeenCalled();
    expect(empresasQueryMock).not.toHaveBeenCalled();
  });

  it("un año mal formado responde 400 explícito, no se traga en silencio", async () => {
    const res = await request(createApp())
      .get("/api/ficha-distrital")
      .query({ ubigeo: UBIGEO, anio: "2025-26" });

    expect(res.status).toBe(400);
    expect(seguridadQueryMock).not.toHaveBeenCalled();
  });
});
