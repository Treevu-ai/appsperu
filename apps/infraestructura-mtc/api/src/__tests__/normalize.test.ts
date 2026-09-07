import { describe, expect, it } from "vitest";
import { normalizeTerminalesPortuarios, normalizeAerodromos, normalizePeajes } from "../ingest/normalize.js";

describe("normalizeTerminalesPortuarios", () => {
  function realRow(overrides: Record<string, unknown> = {}) {
    // Fila real confirmada 2026-09-06 (La Libertad, TP Multipropósito Salaverry, corte 2025).
    return {
      ID: "371",
      ID_DEPARTAMENTO: "13",
      ID_PROVINCIA: "1301",
      ID_DISTRITO: "130109",
      LOCALIDAD: "Salaverry",
      NOMBRE_TERMINAL: "Multipropósito de Salaverry",
      LABEL_TERMINAL: "TP Multipropósito de Salaverry",
      AMBITO: "Marítimo",
      TIPO_TERMINAL: "Terminal Portuario",
      CODIGO_PUERTO: "131SVY1",
      ALCANCE: "Nacional",
      USO: "Público",
      TRAFICO: "Granel sólido Fraccionada,Granel líquido,Pasajeros",
      ACTIVIDAD: "Multipropósito",
      SUBACTIVIDAD: "Comercial",
      ESTADO: "Operativo",
      ESTADO_CONSERVACION: "Bueno",
      TITULARIDAD: "Público (Concesionado)",
      ADMINISTRADOR: "SALAVERRY TERMINAL INTERNACIONAL S.A.",
      ES_CONCES: "1",
      LATITUD: "-8.227368334",
      LONGITUD: "-78.98310972",
      FECHA_CORTE: "20251231",
      ...overrides,
    };
  }

  it("returns empty when no rows are passed", () => {
    expect(normalizeTerminalesPortuarios([]).rows).toEqual([]);
  });

  it("normalizes a well-formed row", () => {
    const { rows, rejected } = normalizeTerminalesPortuarios([realRow()]);
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      codigoPuerto: "131SVY1",
      idDepartamento: "13",
      ambito: "Marítimo",
      esConcesionado: true,
      latitud: -8.227368334,
      fechaCorte: "2025-12-31",
    });
  });

  it("interprets ES_CONCES -1 as false and 0 as false, distinct from null", () => {
    expect(normalizeTerminalesPortuarios([realRow({ ES_CONCES: "-1" })]).rows[0].esConcesionado).toBe(false);
    expect(normalizeTerminalesPortuarios([realRow({ ES_CONCES: "0" })]).rows[0].esConcesionado).toBe(false);
    expect(normalizeTerminalesPortuarios([realRow({ ES_CONCES: "" })]).rows[0].esConcesionado).toBeNull();
  });

  it("treats the literal '-' as null", () => {
    expect(normalizeTerminalesPortuarios([realRow({ ESTADO_CONSERVACION: "-" })]).rows[0].estadoConservacion).toBeNull();
  });

  it("rejects a row missing CODIGO_PUERTO instead of throwing", () => {
    const { rows, rejected } = normalizeTerminalesPortuarios([realRow({ CODIGO_PUERTO: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/CODIGO_PUERTO/);
  });

  it("rejects a row with invalid FECHA_CORTE instead of throwing", () => {
    const { rows, rejected } = normalizeTerminalesPortuarios([realRow({ FECHA_CORTE: "2025" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/FECHA_CORTE/);
  });
});

describe("normalizeAerodromos", () => {
  function realRow(overrides: Record<string, unknown> = {}) {
    // Fila real confirmada 2026-09-06 (La Libertad, Aeropuerto Internacional Trujillo, corte 2025).
    // ID viene como el literal "#¡REF!" en el corte 2025 — bug confirmado de la fuente.
    return {
      ID: "#¡REF!",
      ID_DEPARTAMENTO: "13",
      ID_PROVINCIA: "1301",
      ID_DISTRITO: "130104",
      DEPARTAMENTO: "La Libertad",
      PROVINCIA: "Trujillo",
      DISTRITO: "Huanchaco",
      NOMBRE: "Cap. FAP. Carlos Martinez de Pinillos",
      LABEL: "Aeropuerto Cap. FAP. Carlos Martinez de Pinillos",
      TIPO_AERODROMO: "Aeropuerto Internacional",
      CODIGO_AERODROMO: "1311TRU",
      CODIGO_OACI: "SPRU",
      ESCALA: "Internacional",
      ESTADO: "Operativo",
      ADMINISTRADOR: "Aeropuertos del Perú S.A.",
      JERARQUIA: "Nacional",
      TITULARIDAD: "Pública (Concesionada)",
      LATITUD: "-8.081708",
      LONGITUD: "-79.108644",
      ES_CONCES: "1",
      FECHA_CORTE: "20251231",
      ...overrides,
    };
  }

  it("normalizes a well-formed row using CODIGO_AERODROMO, ignoring the broken ID column", () => {
    const { rows, rejected } = normalizeAerodromos([realRow()]);
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      codigoAerodromo: "1311TRU",
      departamento: "La Libertad",
      provincia: "Trujillo",
      tipoAerodromo: "Aeropuerto Internacional",
      esConcesionado: true,
      fechaCorte: "2025-12-31",
    });
    expect(rows[0]).not.toHaveProperty("id");
  });

  it("rejects a row missing CODIGO_AERODROMO instead of throwing", () => {
    const { rows, rejected } = normalizeAerodromos([realRow({ CODIGO_AERODROMO: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/CODIGO_AERODROMO/);
  });
});

describe("normalizePeajes", () => {
  function realFeature(overrides: Record<string, unknown> = {}) {
    // Feature real confirmada 2026-09-06 (La Libertad, U.P. Virú, corte 2025-12-31).
    return {
      type: "Feature" as const,
      properties: {
        IDPEAJE: 186,
        NOMBRE: "Virú",
        LABEL: "U.P. Virú",
        CODPEAJE: "13PE1NVIR1",
        CODRUTA: "PE-1N",
        INICIO: 529.5,
        CODCLOG: "01CRL01",
        DEPARTAMEN: "LA LIBERTAD",
        PROVINCIA: "VIRÚ",
        DISTRITO: "VIRÚ",
        LOCALIDAD: "CASERIO VICTOR R HAYA",
        IDDPTO: "13",
        IDPROV: "1312",
        IDDIST: "131201",
        ES_CONCES: 1,
        TITULAR: "Pública (concesionada)",
        UBICACION: "Panamericana Norte km 529+500",
        ESTADO: "Operativo",
        ADMINIST: "Autopista del Norte S.A.C (AUNOR)",
        FECCORTE: "20251231",
        ...overrides,
      },
      geometry: { type: "Point", coordinates: [-79.0, -8.4] as [number, number] },
    };
  }

  it("normalizes a well-formed feature, reading coordinates from the geometry", () => {
    const { rows, rejected } = normalizePeajes([realFeature()]);
    expect(rejected).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      codigoPeaje: "13PE1NVIR1",
      departamento: "LA LIBERTAD",
      provincia: "VIRÚ",
      inicioKm: 529.5,
      longitud: -79.0,
      latitud: -8.4,
      fechaCorte: "2025-12-31",
    });
  });

  it("returns null coordinates when geometry is missing instead of throwing", () => {
    const feature = realFeature();
    const withoutGeometry = { ...feature, geometry: null };
    const { rows } = normalizePeajes([withoutGeometry]);
    expect(rows[0].latitud).toBeNull();
    expect(rows[0].longitud).toBeNull();
  });

  it("rejects a feature missing CODPEAJE instead of throwing", () => {
    const { rows, rejected } = normalizePeajes([realFeature({ CODPEAJE: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/CODPEAJE/);
  });

  it("rejects a feature missing FECCORTE instead of throwing", () => {
    const { rows, rejected } = normalizePeajes([realFeature({ FECCORTE: "" })]);
    expect(rows).toHaveLength(0);
    expect(rejected[0].reason).toMatch(/FECCORTE/);
  });
});
