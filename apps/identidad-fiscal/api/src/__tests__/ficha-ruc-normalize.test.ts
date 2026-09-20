import { describe, expect, it } from "vitest";
import { parseFichaRuc, parseRepresentantes, isRejectedFicha } from "../ingest/ficha-ruc-normalize.js";

// Texto real capturado el 2026-09-18 (e-consultaruc.sunat.gob.pe, RUC 20129156083).
const FICHA_TEXT = `Consulta RUC
Volver
Resultado de la Búsqueda
Número de RUC:
20129156083 - COOP AGRARIA CAFET VALLE RIO APURIMAC
Tipo Contribuyente:

COOPERATIVAS, SAIS, CAPS

Nombre Comercial:

CAC VALLE RIO APURIMAC

Fecha de Inscripción:

04/05/1993

Fecha de Inicio de Actividades:

14/12/1969

Estado del Contribuyente:

ACTIVO

Condición del Contribuyente:

HABIDO

Domicilio Fiscal:

AV. 28 DE JULIO NRO. 4 (PUERTO SAN FRANCISCO) AYACUCHO - LA MAR - AYNA

Sistema Emisión de Comprobante:

MANUAL/COMPUTARIZADO

Actividad Comercio Exterior:

EXPORTADOR

Sistema Contabilidad:

COMPUTARIZADO

Actividad(es) Económica(s):
Principal - 4630 - VENTA AL POR MAYOR DE ALIMENTOS, BEBIDAS Y TABACO
Secundaria 1 - 1073 - ELABORACIÓN DE CACAO Y CHOCOLATE Y DE PRODUCTOS DE CONFITERÍA
Secundaria 2 - 6810 - ACTIVIDADES INMOBILIARIAS REALIZADAS CON BIENES PROPIOS O ARRENDADOS
Comprobantes de Pago c/aut. de impresión (F. 806 u 816):
FACTURA
BOLETA DE VENTA
LIQUIDACION DE COMPRA
NOTA DE CREDITO
NOTA DE DEBITO
GUIA DE REMISION - REMITENTE
COMPROBANTE DE OPERACIONES - LEY N. 29972
NOTA DE AJUSTE DE OPERACIONES - LEY N. 29972
Sistema de Emisión Electrónica:
FACTURA PORTAL DESDE 31/01/2018
BOLETA PORTAL DESDE 16/09/2021
Emisor electrónico desde:

31/01/2018

Comprobantes Electrónicos:

FACTURA (desde 31/01/2018),BOLETA (desde 16/09/2021)

Afiliado al PLE desde:

01/01/2014

Padrones:
NINGUNO
Fecha consulta: 18/09/2026 18:34
Volver
Información Histórica`;

// Texto real capturado el 2026-09-18 (misma consulta, botón "Representante(s) Legal(es)").
const REPRESENTANTES_TEXT = `REPRESENTANTES LEGALES DE 20129156083 - COOP AGRARIA CAFET VALLE RIO APURIMAC
Resultado de la Búsqueda
La información exhibida en esta consulta corresponde a lo declarado por el contribuyente ante la Administración Tributaria.
Documento Nro. Documento Nombre Cargo Fecha Desde
DNI 28703600 OCHOA RUA TIMOTEO GERENTE GENERAL 23/02/2023
Volver Imprimir
e-mail`;

describe("parseFichaRuc", () => {
  it("normaliza la ficha real completa", () => {
    const result = parseFichaRuc(FICHA_TEXT);
    expect(isRejectedFicha(result)).toBe(false);
    if (isRejectedFicha(result)) throw new Error("no debería rechazarse");

    expect(result.ruc).toBe("20129156083");
    expect(result.razonSocial).toBe("COOP AGRARIA CAFET VALLE RIO APURIMAC");
    expect(result.nombreComercial).toBe("CAC VALLE RIO APURIMAC");
    expect(result.tipoContribuyente).toBe("COOPERATIVAS, SAIS, CAPS");
    expect(result.fechaInscripcion).toBe("1993-05-04");
    expect(result.fechaInicioActividades).toBe("1969-12-14");
    expect(result.estadoContribuyente).toBe("ACTIVO");
    expect(result.condicionContribuyente).toBe("HABIDO");
    expect(result.domicilioFiscal).toBe(
      "AV. 28 DE JULIO NRO. 4 (PUERTO SAN FRANCISCO) AYACUCHO - LA MAR - AYNA"
    );
    expect(result.sistemaEmisionComprobante).toBe("MANUAL/COMPUTARIZADO");
    expect(result.actividadComercioExterior).toBe("EXPORTADOR");
    expect(result.sistemaContabilidad).toBe("COMPUTARIZADO");
    expect(result.emisorElectronicoDesde).toBe("2018-01-31");
    expect(result.comprobantesElectronicos).toBe("FACTURA (desde 31/01/2018),BOLETA (desde 16/09/2021)");
    expect(result.afiliadoPleDesde).toBe("2014-01-01");
    expect(result.padrones).toEqual([]);
  });

  it("extrae comprobantes de pago y sistema de emisión electrónica como listas", () => {
    const result = parseFichaRuc(FICHA_TEXT);
    if (isRejectedFicha(result)) throw new Error("no debería rechazarse");

    expect(result.comprobantesPago).toEqual([
      "FACTURA",
      "BOLETA DE VENTA",
      "LIQUIDACION DE COMPRA",
      "NOTA DE CREDITO",
      "NOTA DE DEBITO",
      "GUIA DE REMISION - REMITENTE",
      "COMPROBANTE DE OPERACIONES - LEY N. 29972",
      "NOTA DE AJUSTE DE OPERACIONES - LEY N. 29972",
    ]);
    expect(result.sistemaEmisionElectronica).toEqual([
      "FACTURA PORTAL DESDE 31/01/2018",
      "BOLETA PORTAL DESDE 16/09/2021",
    ]);
  });

  it("extrae actividad principal y secundarias con código CIIU", () => {
    const result = parseFichaRuc(FICHA_TEXT);
    if (isRejectedFicha(result)) throw new Error("no debería rechazarse");

    expect(result.actividades).toEqual([
      { orden: 1, tipo: "PRINCIPAL", codigoCiiu: "4630", descripcion: "VENTA AL POR MAYOR DE ALIMENTOS, BEBIDAS Y TABACO" },
      { orden: 2, tipo: "SECUNDARIA", codigoCiiu: "1073", descripcion: "ELABORACIÓN DE CACAO Y CHOCOLATE Y DE PRODUCTOS DE CONFITERÍA" },
      { orden: 3, tipo: "SECUNDARIA", codigoCiiu: "6810", descripcion: "ACTIVIDADES INMOBILIARIAS REALIZADAS CON BIENES PROPIOS O ARRENDADOS" },
    ]);
  });

  it("rechaza un texto sin la línea de RUC", () => {
    const result = parseFichaRuc("Página de error, RUC no existe.");
    expect(isRejectedFicha(result)).toBe(true);
    if (!isRejectedFicha(result)) throw new Error("debería rechazarse");
    expect(result.reason).toMatch(/Número de RUC/);
  });
});

describe("parseRepresentantes", () => {
  it("separa documento, nombre, cargo conocido y fecha", () => {
    const result = parseRepresentantes(REPRESENTANTES_TEXT);
    expect(result).toEqual([
      {
        tipoDocumento: "DNI",
        numeroDocumento: "28703600",
        nombre: "OCHOA RUA TIMOTEO",
        cargo: "GERENTE GENERAL",
        fechaDesde: "2023-02-23",
      },
    ]);
  });

  it("devuelve una lista vacía cuando no hay representantes", () => {
    const result = parseRepresentantes("REPRESENTANTES LEGALES DE 20999999999\nNo se encontraron registros.");
    expect(result).toEqual([]);
  });

  it("conserva el texto completo en nombre cuando el cargo no está en la lista conocida", () => {
    const result = parseRepresentantes(
      "DNI 12345678 PEREZ GOMEZ JUAN COORDINADOR DE OPERACIONES 01/01/2020"
    );
    expect(result[0].cargo).toBeNull();
    expect(result[0].nombre).toBe("PEREZ GOMEZ JUAN COORDINADOR DE OPERACIONES");
  });
});
