import { describe, expect, it } from "vitest";
import {
  CAMPOS_PERSONALES_EXCLUIDOS,
  extractTotalRows,
  normalizeInforme,
  type RawInforme,
} from "../ingest/informes-control-parse.js";

// Fila real (2026-09-05) de BusquedaInformesCGR.ashx?Action=loadInformesElastic,
// con nombres de campo exactos confirmados en vivo.
const RAW_ROW: RawInforme = {
  id: null,
  CodigoInforme: "2026CPO077500003",
  Responsabilidad: "     ",
  Departamento: "SAN MARTIN",
  Provincia: "EL DORADO",
  Distrito: "SAN MARTIN",
  Descripcion: "Aprobación y pago de valorizaciones de obra...",
  Entidad: "MUNICIPALIDAD DISTRITAL DE SAN MARTIN",
  FechaEmision: "2023/10/16",
  FechaPublicacion: "2026/05/08",
  FechaFinEjecucion: "2023/10/16",
  ModalidadServicio: "ACCION OFICIO POSTERIOR",
  ServicioControl: "SERVICIO CONTROL POSTERIOR",
  NumeroInforme: "035-2023-2-0775",
  CiacCodigo: "035202320775",
  CresCodigoFormato: "2026-CPO-0775-00003",
  ResumenEjecutivo: "http://apps8.contraloria.gob.pe/SPIC/srvDownload/ViewPDF?CRES_CODIGO=2026CPO077500003&TIPOARCHIVO=RE",
  ResumenInforme: "http://apps8.contraloria.gob.pe/SPIC/srvDownload/ViewPDF?CRES_CODIGO=2026CPO077500003&TIPOARCHIVO=ADJUNTO",
  Sector: "GOBIERNOS LOCALES",
  Periodo: "2023",
  RutaCloudInforme: "http://apps8.contraloria.gob.pe/SPIC/srvDownload/ViewPDF?CRES_CODIGO=2026CPO077500003&TIPOARCHIVO=ADJUNTO",
  EsReconstruccion: "N",
  TotalFuncionarios: "0",
  Funcionarios: null,
  Text: "2026CPO077500003 SAN MARTIN ... MUNICIPALIDAD DISTRITAL DE SAN MARTIN ...",
  TotalRows: "58950",
  TotalPages: "11790",
  EsConResponsabilidad: "N",
  NivelGobierno: "GOBIERNO LOCAL",
  CodigoEntidad: null,
  CodigoSector: null,
  Recomendaciones: null,
  TotalRecomendaciones: "0",
  EsCovid: "N",
};

describe("normalizeInforme — nunca expone datos de persona natural", () => {
  it("mapea correctamente los campos de entidad/informe", () => {
    const informe = normalizeInforme(RAW_ROW);
    expect(informe.codigoInforme).toBe("2026CPO077500003");
    expect(informe.entidad).toBe("MUNICIPALIDAD DISTRITAL DE SAN MARTIN");
    expect(informe.departamento).toBe("SAN MARTIN");
    expect(informe.periodo).toBe(2023);
    expect(informe.fechaEmision).toBe("2023-10-16");
    expect(informe.fechaPublicacion).toBe("2026-05-08");
    expect(informe.esConResponsabilidad).toBe(false);
    expect(informe.esReconstruccion).toBe(false);
    expect(informe.totalRecomendaciones).toBe(0);
  });

  it("el objeto normalizado no tiene ninguna clave de las excluidas por PII, ni siquiera con valor null", () => {
    const informe = normalizeInforme(RAW_ROW);
    const keys = Object.keys(informe);
    for (const campoExcluido of CAMPOS_PERSONALES_EXCLUIDOS) {
      expect(keys).not.toContain(campoExcluido);
      // tampoco una versión camelCase equivalente
      expect(keys.map((k) => k.toLowerCase())).not.toContain(campoExcluido.toLowerCase());
    }
  });

  it("incluso si la fila trae Funcionarios poblado con un nombre real, no aparece en el resultado normalizado", () => {
    const filaConFuncionario: RawInforme = {
      ...RAW_ROW,
      Funcionarios: "PEREZ GOMEZ, JUAN CARLOS - ALCALDE",
      TotalFuncionarios: "1",
      EsConResponsabilidad: "S",
    };
    const informe = normalizeInforme(filaConFuncionario);
    const serialized = JSON.stringify(informe);
    expect(serialized).not.toContain("PEREZ GOMEZ");
    expect(serialized).not.toContain("JUAN CARLOS");
    expect(informe.esConResponsabilidad).toBe(true); // el flag booleano sí se conserva
  });

  it("lanza un error explícito si falta CodigoInforme (no persiste con clave sintética)", () => {
    const { CodigoInforme, ...sinCodigo } = RAW_ROW;
    expect(() => normalizeInforme(sinCodigo)).toThrow(/CodigoInforme/);
  });

  it("convierte campos vacíos/ausentes a null, nunca a string vacío o 0 falso", () => {
    const filaMinima: RawInforme = { CodigoInforme: "X1", CodigoEntidad: "" };
    const informe = normalizeInforme(filaMinima);
    expect(informe.codigoEntidad).toBeNull();
    expect(informe.periodo).toBeNull();
    expect(informe.esConResponsabilidad).toBeNull();
  });
});

describe("extractTotalRows", () => {
  it("lee TotalRows de la primera fila", () => {
    expect(extractTotalRows([RAW_ROW])).toBe(58950);
  });

  it("devuelve null para una página vacía", () => {
    expect(extractTotalRows([])).toBeNull();
  });
});
