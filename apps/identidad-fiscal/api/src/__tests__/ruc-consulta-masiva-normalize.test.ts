import { describe, expect, it } from "vitest";
import { normalizeRucMasivoRow, parseRucMasivoFile, isRejected } from "../ingest/ruc-consulta-masiva-normalize.js";

// Archivo real descargado el 2026-09-18 (RM20260918211442606.txt), decodificado latin1.
const REAL_FILE = [
  "NumeroRuc|Nombre – RazonSocial|Tipo de Contribuyente|Profesion u Oficio|Nombre Comercial|Condicion del Contribuyente|Estado del Contribuyente|Fecha de Inscripcion|Fecha de Inicio de Actividades|Departamento|Provincia|Distrito|Direccion|Telefono|Fax|Actividad de Comercio Exterior|Principal- CIIU|Secundario 1- CIIU|Secundario 2- CIIU|Afecto Nuevo RUS|Buen Contribuyente|Agente de Retencion|Agente de Percepcion VtaInt|Agente de Percepcion ComLiq|",
  "20404057805|COOPERATIVA AGRARIA ACOPAGRO LTDA|COOPERATIVAS, SAIS, CAPS|-|-|HABIDO|ACTIVO|23/07/1997|23/07/1997|SAN MARTIN|MARISCAL CACERES|JUANJUI|JR. ARICA NRO. 284 |-|-|IMPORTADOR/EXPORTADOR                                                                                                             |CULTIVOS DE CEREALES.|TRANSPORTE  DE CARGA POR CARRETERA.|-|NO|-|-|-|-|",
  "20132489824|COOPERATIVA AGRARIA CAFETALERA CHANCAMAYO LTDA. N° 008-B-VII|COOPERATIVAS, SAIS, CAPS|-|-|HABIDO|ACTIVO|06/05/1993|15/02/1974|CUSCO|LA CONVENCION|SANTA ANA|AV. EDGAR DE LA TORRE NRO. 1353 (CENTRAL COCLA) |-|-|SIN ACTIVIDAD                                                                                                                     |TRANSPORTE  DE CARGA POR CARRETERA.|SERVICIOS AGRICOLAS, GANADERAS.|ACTIVIDADES INMOBILIARIAS|NO|-|-|-|-|",
].join("\n");

describe("normalizeRucMasivoRow", () => {
  it("normaliza una fila real bien formada (ACOPAGRO)", () => {
    const fields = REAL_FILE.split("\n")[1].split("|");
    const result = normalizeRucMasivoRow(fields);
    expect(isRejected(result)).toBe(false);
    if (isRejected(result)) throw new Error("no debería rechazarse");

    expect(result.ruc).toBe("20404057805");
    expect(result.razonSocial).toBe("COOPERATIVA AGRARIA ACOPAGRO LTDA");
    expect(result.tipoContribuyente).toBe("COOPERATIVAS, SAIS, CAPS");
    expect(result.condicionContribuyente).toBe("HABIDO");
    expect(result.estadoContribuyente).toBe("ACTIVO");
    expect(result.fechaInscripcion).toBe("1997-07-23");
    expect(result.fechaInicioActividades).toBe("1997-07-23");
    expect(result.departamento).toBe("SAN MARTIN");
    expect(result.provincia).toBe("MARISCAL CACERES");
    expect(result.distrito).toBe("JUANJUI");
    expect(result.actividadComercioExterior).toBe("IMPORTADOR/EXPORTADOR");
    expect(result.ciiuPrincipal).toBe("CULTIVOS DE CEREALES.");
    expect(result.ciiuSecundario1).toBe("TRANSPORTE  DE CARGA POR CARRETERA.");
    expect(result.ciiuSecundario2).toBeNull();
    expect(result.afectoNuevoRus).toBe("NO");
    expect(result.profesionOficio).toBeNull();
    expect(result.nombreComercial).toBeNull();
  });

  it("rechaza una fila con muy pocas columnas", () => {
    const result = normalizeRucMasivoRow(["20404057805", "COOPERATIVA AGRARIA ACOPAGRO LTDA"]);
    expect(isRejected(result)).toBe(true);
    if (!isRejected(result)) throw new Error("debería rechazarse");
    expect(result.reason).toMatch(/columnas/);
  });

  it("rechaza un RUC que no tiene 11 dígitos", () => {
    const fields = REAL_FILE.split("\n")[1].split("|");
    fields[0] = "123";
    const result = normalizeRucMasivoRow(fields);
    expect(isRejected(result)).toBe(true);
    if (!isRejected(result)) throw new Error("debería rechazarse");
    expect(result.reason).toMatch(/RUC inválido/);
  });
});

describe("parseRucMasivoFile", () => {
  it("parsea el archivo completo saltando el encabezado", () => {
    const rows = parseRucMasivoFile(REAL_FILE);
    expect(rows).toHaveLength(2);
    const [acopagro, chancamayo] = rows;
    if (isRejected(acopagro) || isRejected(chancamayo)) throw new Error("no deberían rechazarse");
    expect(acopagro.ruc).toBe("20404057805");
    expect(chancamayo.ruc).toBe("20132489824");
    expect(chancamayo.razonSocial).toContain("CHANCAMAYO");
  });
});
