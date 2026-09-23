import { describe, expect, it, vi } from "vitest";

// Las funciones puras bajo prueba no tocan la base, pero el módulo importa `pool` a nivel de
// módulo (para ingestAutoridadesVigentes) y `db/pool.js` lanza si DATABASE_URL no está
// definida -- mockearlo evita que este test dependa de un Postgres real (mismo patrón que
// sbn-supervision-connector.test.ts en ceplan-geo).
vi.mock("../db/pool.js", () => ({
  pool: { query: vi.fn(), connect: vi.fn() },
}));

import { normalizeConformacion, soloDistritos, soloProvincias } from "../ingest/autoridades-vigentes-connector.js";

describe("soloDistritos / soloProvincias", () => {
  const ubigeos = [
    { strUbigeo: "120000", strUbiDepartamento: "12", strUbiProvincia: "00", strUbiDistrito: "00", strDepartamento: "LA LIBERTAD", strProvincia: "", strDistrito: "" },
    { strUbigeo: "120300", strUbiDepartamento: "12", strUbiProvincia: "03", strUbiDistrito: "00", strDepartamento: "LA LIBERTAD", strProvincia: "SANCHEZ CARRION", strDistrito: "" },
    { strUbigeo: "120307", strUbiDepartamento: "12", strUbiProvincia: "03", strUbiDistrito: "07", strDepartamento: "LA LIBERTAD", strProvincia: "SANCHEZ CARRION", strDistrito: "SARIN" },
  ];

  it("soloDistritos descarta filas de departamento y provincia", () => {
    const result = soloDistritos(ubigeos);
    expect(result).toHaveLength(1);
    expect(result[0].strDistrito).toBe("SARIN");
  });

  it("soloProvincias descarta filas de departamento y distrito", () => {
    const result = soloProvincias(ubigeos);
    expect(result).toHaveLength(1);
    expect(result[0].strProvincia).toBe("SANCHEZ CARRION");
  });
});

describe("normalizeConformacion", () => {
  // Fila real confirmada en vivo 2026-09-22 contra
  // POST cej.jne.gob.pe/Autoridades/ListarConformacionActual {idTipoEleccion:6, strUbigeo:"120307"}
  // (alcalde vigente de Sarín, Sánchez Carrión, La Libertad).
  function filaRealAlcaldeSarin(overrides: Record<string, unknown> = {}) {
    return {
      strDocumentoIdentidad: "41070984",
      strNombres: "RICHAR YORAN",
      strApellidoPaterno: "POLO",
      strApellidoMaterno: "CABRERA",
      strOrganizacionPolitica: "MOVIMIENTO REGIONAL FORTALEZA PERU",
      strCargo: "ALCALDE DISTRITAL",
      idCargo: 10,
      intPosicion: 0,
      strDepartamento: "LA LIBERTAD",
      strProvincia: "SANCHEZ CARRION",
      strDistrito: "SARIN",
      idProcesoElectoral: 113,
      strProcesoElectoral: "ELECCIONES REGIONALES Y MUNICIPALES 2022",
      idPeriodoGob: 9,
      strFechaFinVigencia: "31/12/2026 00:00:00",
      strRutaFoto: "https://declara.jne.gob.pe/Assets/Fotos-HojaVida/153548.jpg",
      strRutaPlanGob: "https://mpesije.jne.gob.pe/apidocs/b76ed823-54e0-47df-8c60-4122a96edb02.pdf",
      idHojaVida: 153548,
      idConformacionDetalle: 44195,
      ...overrides,
    };
  }

  it("nunca guarda el DNI en texto plano: dniHash es un hash SHA-256, no el DNI original", () => {
    const [row] = normalizeConformacion([filaRealAlcaldeSarin()], "120307", 6, "MUNICIPALIDAD DISTRITAL");
    expect(row.dniHash).not.toBe("41070984");
    expect(row.dniHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("el mismo DNI produce siempre el mismo hash (determinístico, sirve para detectar duplicados)", () => {
    const [a] = normalizeConformacion([filaRealAlcaldeSarin()], "120307", 6, "MUNICIPALIDAD DISTRITAL");
    const [b] = normalizeConformacion([filaRealAlcaldeSarin({ idConformacionDetalle: 99999 })], "120307", 6, "MUNICIPALIDAD DISTRITAL");
    expect(a.dniHash).toBe(b.dniHash);
  });

  it("dniHash es null cuando la fuente no trae documento de identidad", () => {
    const [row] = normalizeConformacion(
      [filaRealAlcaldeSarin({ strDocumentoIdentidad: null })],
      "120307",
      6,
      "MUNICIPALIDAD DISTRITAL"
    );
    expect(row.dniHash).toBeNull();
  });

  it("mapea correctamente los campos de identidad y cargo", () => {
    const [row] = normalizeConformacion([filaRealAlcaldeSarin()], "120307", 6, "MUNICIPALIDAD DISTRITAL");
    expect(row.nombres).toBe("RICHAR YORAN");
    expect(row.apellidoPaterno).toBe("POLO");
    expect(row.apellidoMaterno).toBe("CABRERA");
    expect(row.cargo).toBe("ALCALDE DISTRITAL");
    expect(row.organizacionPolitica).toBe("MOVIMIENTO REGIONAL FORTALEZA PERU");
    expect(row.ubigeo).toBe("120307");
    expect(row.idTipoEleccion).toBe(6);
    expect(row.tipoEleccion).toBe("MUNICIPALIDAD DISTRITAL");
    expect(row.idConformacionDetalle).toBe(44195);
  });

  it("parsea fecha_fin_vigencia de 'dd/mm/yyyy HH:mm:ss' a 'yyyy-mm-dd'", () => {
    const [row] = normalizeConformacion([filaRealAlcaldeSarin()], "120307", 6, "MUNICIPALIDAD DISTRITAL");
    expect(row.fechaFinVigencia).toBe("2026-12-31");
  });

  it("fechaFinVigencia es null cuando la fuente no trae el dato", () => {
    const [row] = normalizeConformacion(
      [filaRealAlcaldeSarin({ strFechaFinVigencia: null })],
      "120307",
      6,
      "MUNICIPALIDAD DISTRITAL"
    );
    expect(row.fechaFinVigencia).toBeNull();
  });

  it("normaliza apellido materno vacío/ausente a null en vez de cadena vacía", () => {
    const [row] = normalizeConformacion(
      [filaRealAlcaldeSarin({ strApellidoMaterno: "" })],
      "120307",
      6,
      "MUNICIPALIDAD DISTRITAL"
    );
    expect(row.apellidoMaterno).toBeNull();
  });

  it("devuelve un array vacío cuando no hay filas", () => {
    expect(normalizeConformacion([], "120307", 6, "MUNICIPALIDAD DISTRITAL")).toEqual([]);
  });
});
