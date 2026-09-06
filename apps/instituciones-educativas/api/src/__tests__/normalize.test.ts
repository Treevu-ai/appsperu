import { describe, expect, it } from "vitest";
import { normalizeInstituciones } from "../ingest/normalize.js";

describe("normalizeInstituciones", () => {
  function realRow(overrides: Record<string, unknown> = {}) {
    // Fila real confirmada 2026-09-06 contra el Padrón Web 2026-08-28 (decodificada cp850).
    return {
      CODINST: "24953981",
      COD_MOD: "0415547",
      ANEXO: "0",
      CODLOCAL: "016100",
      CEN_EDU: "123",
      D_NIV_MOD: "Inicial - Jardín",
      D_FORMA: "Escolarizada",
      D_TIPSSEXO: "Mixto",
      D_GESTION: "Pública de gestión directa",
      D_GES_DEP: "Sector Educación",
      DIRECTOR: "CACERES DE MAUTINO YONNY ESCOLASTICA",
      TELEFONO: "",
      EMAIL: "",
      DIR_CEN: "JIRON TERESA GONZALES DE FANNY 543",
      LOCALIDAD: "NICRUPAMPA",
      CODCCPP: "129688",
      CEN_POB: "CENTENARIO",
      DAREACENSO: "Urbana",
      CODGEO: "020105",
      D_DPTO: "ANCASH",
      D_PROV: "HUARAZ",
      D_DIST: "INDEPENDENCIA",
      D_REGION: "DRE ANCASH",
      CODOOII: "020001",
      D_DREUGEL: "UGEL HUARAZ",
      NLAT_IE: -9.51885,
      NLONG_IE: -77.53191,
      D_TIPOPROG: "",
      D_COD_TUR: "Mañana",
      NRORUC: "",
      RZSOCIAL: "",
      PROMOTOR: "",
      D_ESTADO: "Activo",
      FECHA_ACT: "28-08-2026",
      ...overrides,
    };
  }

  it("returns empty when no rows are passed", () => {
    const result = normalizeInstituciones([]);
    expect(result.rows).toEqual([]);
    expect(result.rejected).toEqual([]);
  });

  it("normalizes a well-formed row, converting DD-MM-YYYY to YYYY-MM-DD", () => {
    const { rows, rejected } = normalizeInstituciones([realRow()]);
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      codMod: "0415547",
      anexo: "0",
      nombre: "123",
      ubigeo: "020105",
      departamento: "ANCASH",
      provincia: "HUARAZ",
      distrito: "INDEPENDENCIA",
      latitud: -9.51885,
      longitud: -77.53191,
      estado: "Activo",
      fechaActualizacion: "2026-08-28",
    });
  });

  it("never includes DIRECTOR, TELEFONO, EMAIL or PROMOTOR in the canonical row", () => {
    const { rows } = normalizeInstituciones([realRow()]);
    const keys = Object.keys(rows[0]);
    expect(keys).not.toContain("director");
    expect(keys).not.toContain("telefono");
    expect(keys).not.toContain("email");
    expect(keys).not.toContain("promotor");
  });

  it("rejects a row missing COD_MOD instead of throwing", () => {
    const { rows, rejected } = normalizeInstituciones([realRow({ COD_MOD: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/COD_MOD/);
  });

  it("rejects a row missing ANEXO instead of throwing", () => {
    const { rows, rejected } = normalizeInstituciones([realRow({ ANEXO: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/ANEXO/);
  });

  it("rejects a row missing CEN_EDU (nombre) instead of throwing", () => {
    const { rows, rejected } = normalizeInstituciones([realRow({ CEN_EDU: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/CEN_EDU/);
  });

  it("rejects a row missing departamento/provincia/distrito instead of throwing", () => {
    const { rows, rejected } = normalizeInstituciones([realRow({ D_DPTO: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/D_DPTO/);
  });

  it("sets ubigeo to null instead of throwing when it is not 6 digits", () => {
    const { rows } = normalizeInstituciones([realRow({ CODGEO: "20105" })]);
    expect(rows[0].ubigeo).toBeNull();
  });

  it("keeps RUC and RZSOCIAL for privately-operated institutions", () => {
    const { rows } = normalizeInstituciones([realRow({ NRORUC: "20123456789", RZSOCIAL: "COLEGIO PRIVADO SAC" })]);
    expect(rows[0].ruc).toBe("20123456789");
    expect(rows[0].razonSocial).toBe("COLEGIO PRIVADO SAC");
  });

  it("returns null fechaActualizacion instead of throwing when unparseable", () => {
    const { rows } = normalizeInstituciones([realRow({ FECHA_ACT: "no es una fecha" })]);
    expect(rows[0].fechaActualizacion).toBeNull();
  });

  it("strips NUL bytes from text fields instead of letting them reach Postgres", () => {
    // Fila real de la ingesta 2026-09-06: el DBF rellena algunos campos de ancho fijo con
    // bytes NUL en vez de espacios, lo que Postgres rechaza directamente ("invalid byte
    // sequence for encoding UTF8: 0x00") a mitad de una corrida real (~fila 120,000/180,828).
    const { rows } = normalizeInstituciones([realRow({ CEN_EDU: "123\0\0\0" })]);
    expect(rows[0].nombre).toBe("123");
  });

  it("returns null coordinates instead of throwing when non-numeric", () => {
    const { rows } = normalizeInstituciones([realRow({ NLAT_IE: "", NLONG_IE: undefined })]);
    expect(rows[0].latitud).toBeNull();
    expect(rows[0].longitud).toBeNull();
  });
});
