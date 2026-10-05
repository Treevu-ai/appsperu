import { describe, expect, it } from "vitest";
import {
  parseOxiMontoSoles,
  parseOxiRow,
  provinciaEsConfiable,
  extraerUbicacionDeNombreProyecto,
} from "../ingest/oxi-normalize.js";

describe("parseOxiMontoSoles", () => {
  it("convierte 'S/443,431.09' a 443431.09", () => {
    expect(parseOxiMontoSoles("S/443,431.09")).toBe(443431.09);
  });

  it("acepta el formato 'S/.' con punto", () => {
    expect(parseOxiMontoSoles("S/.6,784,469.84")).toBe(6784469.84);
  });

  it("retorna null para vacío o undefined", () => {
    expect(parseOxiMontoSoles("")).toBeNull();
    expect(parseOxiMontoSoles(undefined)).toBeNull();
    expect(parseOxiMontoSoles(null)).toBeNull();
  });

  it("retorna null para texto no numérico", () => {
    expect(parseOxiMontoSoles("no aplica")).toBeNull();
  });
});

describe("parseOxiRow", () => {
  const validRow = {
    B: "5893",
    C: "Priorizado",
    D: "Proyecto de inversión",
    E: "Ficha técnica",
    F: "Gobierno Local Provincial",
    G: "LA LIBERTAD",
    H: "TRUJILLO",
    I: "TRUJILLO",
    J: "MUNICIPALIDAD PROVINCIAL DE TRUJILLO",
    K: "Enlace",
    L: "2698796",
    M: "MEJORAMIENTO DEL SERVICIO DE MOVILIDAD URBANA",
    N: "TRANSPORTE",
    O: "Vías Urbanas",
    P: "S/6,784,469.84",
    Q: "3-10 mill",
  };

  it("normaliza una fila de datos real", () => {
    const row = parseOxiRow(validRow);
    expect(row).toMatchObject({
      oxiId: 5893,
      fase: "Priorizado",
      departamento: "LA LIBERTAD",
      codigoReferencia: "2698796",
      nombreProyecto: "MEJORAMIENTO DEL SERVICIO DE MOVILIDAD URBANA",
      funcion: "TRANSPORTE",
      montoInversionReferencial: 6784469.84,
      rangoMonto: "3-10 mill",
    });
  });

  it("retorna null cuando la columna B (N°) no es numérica", () => {
    expect(parseOxiRow({ B: "CONSULTA DE INVERSIONES EN PROMOCIÓN" })).toBeNull();
    expect(parseOxiRow({ B: "Nº Registros: 761" })).toBeNull();
    expect(parseOxiRow({})).toBeNull();
  });

  it("retorna null cuando falta el nombre del proyecto", () => {
    expect(parseOxiRow({ ...validRow, M: "" })).toBeNull();
  });

  it("deja codigoReferencia en null cuando la celda viene vacía", () => {
    const row = parseOxiRow({ ...validRow, L: "" });
    expect(row?.codigoReferencia).toBeNull();
  });

  it("marca provinciaConfiable true y no intenta el fallback cuando provincia es un nombre real", () => {
    const row = parseOxiRow(validRow);
    expect(row?.provinciaConfiable).toBe(true);
    expect(row?.provinciaExtraidaDeNombre).toBeNull();
    expect(row?.distritoExtraidoDeNombre).toBeNull();
  });

  it("marca provinciaConfiable false y extrae el fallback cuando provincia es numérica (DQ-18)", () => {
    const row = parseOxiRow({
      ...validRow,
      H: "478",
      I: "",
      M: "ADQUISICION DE AMBULANCIA; EN EL(LA) EESS CHINCHIHUASI - DISTRITO DE CHINCHIHUASI, PROVINCIA CHURCAMPA, DEPARTAMENTO HUANCAVELICA.",
    });
    expect(row?.provincia).toBe("478");
    expect(row?.provinciaConfiable).toBe(false);
    expect(row?.provinciaExtraidaDeNombre).toBe("CHURCAMPA");
    expect(row?.distritoExtraidoDeNombre).toBe("CHINCHIHUASI");
  });
});

describe("provinciaEsConfiable", () => {
  it("retorna false para un valor puramente numérico", () => {
    expect(provinciaEsConfiable("478")).toBe(false);
    expect(provinciaEsConfiable("34")).toBe(false);
  });

  it("retorna true para un nombre de provincia real", () => {
    expect(provinciaEsConfiable("TRUJILLO")).toBe(true);
    expect(provinciaEsConfiable("VIRU")).toBe(true);
  });

  it("retorna false para null o vacío", () => {
    expect(provinciaEsConfiable(null)).toBe(false);
    expect(provinciaEsConfiable("")).toBe(false);
  });
});

describe("extraerUbicacionDeNombreProyecto", () => {
  it('extrae distrito/provincia/departamento del patrón con "-" y "DE" en los tres', () => {
    const resultado = extraerUbicacionDeNombreProyecto(
      "MEJORAMIENTO DE LA INFRAESTRUCTURA DEPORTIVA DEL ESTADIO MAX AUGUSTIN DEL DISTRITO DE IQUITOS - PROVINCIA DE MAYNAS - DEPARTAMENTO DE LORETO"
    );
    expect(resultado).toEqual({ distrito: "IQUITOS", provincia: "MAYNAS", departamento: "LORETO" });
  });

  it('extrae del patrón con "," y sin "DE" antes de provincia/departamento, con punto final', () => {
    const resultado = extraerUbicacionDeNombreProyecto(
      "ADQUISICION DE AMBULANCIA; EN EL(LA) EESS LARAMARCA - DISTRITO DE LARAMARCA, PROVINCIA HUAYTARA, DEPARTAMENTO HUANCAVELICA."
    );
    expect(resultado).toEqual({ distrito: "LARAMARCA", provincia: "HUAYTARA", departamento: "HUANCAVELICA" });
  });

  it("captura un distrito multi-palabra que contiene su propio 'DE'", () => {
    const resultado = extraerUbicacionDeNombreProyecto(
      "ADQUISICION DE AMBULANCIA; EN EL(LA) EESS SAN ANTONIO DE CUSICANCHA - DISTRITO DE SAN ANTONIO DE CUSICANCHA, PROVINCIA HUAYTARA, DEPARTAMENTO HUANCAVELICA."
    );
    expect(resultado).toEqual({
      distrito: "SAN ANTONIO DE CUSICANCHA",
      provincia: "HUAYTARA",
      departamento: "HUANCAVELICA",
    });
  });

  it("retorna null cuando el texto no tiene el patrón DISTRITO/PROVINCIA/DEPARTAMENTO", () => {
    expect(
      extraerUbicacionDeNombreProyecto(
        "RECUPERACION DEL SERVICIO DE INSTRUCCIÓN BÁSICA DE VUELO EN AERONAVES DE ALA FIJA, PISCO - ICA."
      )
    ).toBeNull();
  });

  it("retorna null para una gramática distinta a la soportada (sin separador antes de PROVINCIA)", () => {
    // "DE LA PROVINCIA DE" / "DEL DEPARTAMENTO DE" sin "-"/"," delimitador:
    // deliberadamente no soportado, prefiere null a adivinar el límite.
    expect(
      extraerUbicacionDeNombreProyecto(
        "CREACION DEL SERVICIO...DISTRITO DE PATIBAMBA DE LA PROVINCIA DE LA MAR DEL DEPARTAMENTO DE AYACUCHO"
      )
    ).toBeNull();
  });
});
