import { describe, expect, it } from "vitest";
import { parseOeceFicha, parseOecePersonas } from "../ingest/oece-ficha-normalize.js";

// Respuesta real de eap.oece.gob.pe/ficha-proveedor-cns/1.0/ficha/20404057805/resumen
// (ACOPAGRO), capturada en vivo el 2026-09-19. Recortada a los campos que
// usa el parser.
const REAL_RESUMEN_ACOPAGRO = {
  datosSunat: {
    ruc: "20404057805",
    razon: "COOPERATIVA AGRARIA ACOPAGRO LTDA",
    tipoEmpresa: "COOPERATIVAS, SAIS, CAPS",
    estado: "ACTIVO",
    condicion: "HABIDO",
    departamento: "SAN MARTIN",
    provincia: "MARISCAL CACERES",
    distrito: "JUANJUI",
  },
  conformacion: {
    proveedor: { codigoRegistro: "S0631562" },
    socios: [],
    representantes: [
      {
        idRepresentante: 2885791,
        nroDocumento: "22999374",
        razonSocial: "RIOS NUÑEZ SEGUNDO GONZALO",
        idCargo: null,
        descCargo: "null",
        fechaIngreso: "22/07/1997",
      },
    ],
    organosAdm: [
      {
        idOrgano: 2579230,
        nroDocumento: "01004225",
        apellidosNomb: "PINCHI TAFUR PAULO SANTIAGO",
        idTipoOrgano: 21,
        descTipoOrgano: "CONSEJO DE ADMINISTRACION",
        idCargo: 28,
        descCargo: "Secretario",
        fechaIngreso: "25/03/2023",
      },
      {
        idOrgano: 2579228,
        nroDocumento: "43297198",
        apellidosNomb: "LANARES SALAS MARTHA ",
        idTipoOrgano: 21,
        descTipoOrgano: "CONSEJO DE ADMINISTRACION",
        idCargo: 1,
        descCargo: "Presidente",
        fechaIngreso: "27/03/2024",
      },
    ],
  },
};

describe("parseOeceFicha", () => {
  it("extrae los datos SUNAT y el codigo de registro RNP", () => {
    const ficha = parseOeceFicha("20404057805", REAL_RESUMEN_ACOPAGRO);
    expect(ficha.razonSocial).toBe("COOPERATIVA AGRARIA ACOPAGRO LTDA");
    expect(ficha.tipoEmpresa).toBe("COOPERATIVAS, SAIS, CAPS");
    expect(ficha.estadoSunat).toBe("ACTIVO");
    expect(ficha.condicionSunat).toBe("HABIDO");
    expect(ficha.departamento).toBe("SAN MARTIN");
    expect(ficha.codigoRegistro).toBe("S0631562");
  });
});

describe("parseOecePersonas", () => {
  it("extrae representantes y organos de administracion, distinguidos por rol", () => {
    const personas = parseOecePersonas(REAL_RESUMEN_ACOPAGRO);
    expect(personas).toHaveLength(3);

    const representante = personas.find((p) => p.rol === "REPRESENTANTE");
    expect(representante?.dni).toBe("22999374");
    expect(representante?.nombre).toBe("RIOS NUÑEZ SEGUNDO GONZALO");
    expect(representante?.fechaIngreso).toBe("1997-07-22");
    expect(representante?.cargo).toBeNull();

    const organos = personas.filter((p) => p.rol === "ORGANO_ADMINISTRACION");
    expect(organos).toHaveLength(2);
    const presidente = organos.find((o) => o.cargo === "Presidente");
    expect(presidente?.dni).toBe("43297198");
    expect(presidente?.nombre).toBe("LANARES SALAS MARTHA");
    expect(presidente?.tipoOrgano).toBe("CONSEJO DE ADMINISTRACION");
  });

  it("devuelve array vacio cuando socios/representantes/organosAdm vienen vacios o ausentes", () => {
    expect(parseOecePersonas({})).toEqual([]);
    expect(parseOecePersonas({ conformacion: {} })).toEqual([]);
    expect(parseOecePersonas({ conformacion: { socios: [], representantes: [], organosAdm: [] } })).toEqual([]);
  });
});
