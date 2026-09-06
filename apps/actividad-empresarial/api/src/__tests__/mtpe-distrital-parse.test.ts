import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  confirmSheetYear,
  extract7zUrlFromLandingPage,
  extractDistritoRows,
  extractYearLinksFromListing,
  findHeaderRow,
  pickLatestYearLink,
  sheetNameForYear,
  type YearLink,
} from "../ingest/mtpe-distrital-parse.js";

// Fragmento real (recortado) de www2.trabajo.gob.pe/estadisticas/ind-lab-a-nivel-distrital/,
// descargado el 2026-09-05 durante la migración — confirma que cada año usa
// un slug distinto, sin patrón común más allá del año en la URL.
const LISTING_HTML = `
<a href="https://www.gob.pe/institucion/mtpe/informes-publicaciones/1984592-indicadores-laborales-a-nivel-de-distrito-2020">2020</a>
<a href="https://www.gob.pe/institucion/mtpe/informes-publicaciones/3114668-indicadores-laborales-a-nivel-distrital-ano-2021">2021</a>
<a href="https://www.gob.pe/institucion/mtpe/informes-publicaciones/4312369-indicadores-a-nivel-de-distrito-2022">2022</a>
<a href="https://www.gob.pe/institucion/mtpe/informes-publicaciones/5736119-indicadores-a-nivel-de-distrito-2023">2023</a>
<a href="https://www.gob.pe/institucion/mtpe/informes-publicaciones/7089103-indicadores-a-nivel-de-distrito-2024">2024</a>
<a href="https://www.gob.pe/institucion/mtpe/informes-publicaciones/8222238-indicadores-a-nivel-de-distrito-2025">2025</a>
`;

// Fragmento real de la landing page 2025, confirmado en vivo.
const LANDING_HTML = `
<a href="https://cdn.www.gob.pe/uploads/document/file/10095224/8222238-boletin-de-indicadores-laborales-a-nivel-distrital-2025.pdf?v=1780548355">PDF</a>
<a href="https://cdn.www.gob.pe/uploads/document/file/10095225/8222238-indicadores-a-nivel-distrital-2025.7z?v=1780548719">7z</a>
`;

describe("extractYearLinksFromListing", () => {
  it("extrae los 6 años reales con sus URLs completas", () => {
    const links = extractYearLinksFromListing(LISTING_HTML);
    expect(links.map((l) => l.year).sort()).toEqual([2020, 2021, 2022, 2023, 2024, 2025]);
    const link2025 = links.find((l) => l.year === 2025)!;
    expect(link2025.url).toContain("8222238-indicadores-a-nivel-de-distrito-2025");
  });
});

describe("pickLatestYearLink", () => {
  it("elige el año más alto, sin depender del orden del arreglo", () => {
    const links: YearLink[] = [{ year: 2022, url: "a" }, { year: 2025, url: "b" }, { year: 2023, url: "c" }];
    expect(pickLatestYearLink(links).year).toBe(2025);
  });

  it("lanza un error explícito si no hay ningún enlace", () => {
    expect(() => pickLatestYearLink([])).toThrow(/No se encontró ningún enlace/);
  });
});

describe("extract7zUrlFromLandingPage", () => {
  it("extrae la URL del .7z, ignorando el PDF", () => {
    const url = extract7zUrlFromLandingPage(LANDING_HTML);
    expect(url).toContain("8222238-indicadores-a-nivel-distrital-2025.7z");
  });

  it("devuelve null si no hay ningún enlace .7z", () => {
    expect(extract7zUrlFromLandingPage("<a href=\"x.pdf\">solo pdf</a>")).toBeNull();
  });
});

describe("sheetNameForYear", () => {
  it("construye el nombre real confirmado (EMPRESAS_25 para 2025)", () => {
    expect(sheetNameForYear(2025)).toBe("EMPRESAS_25");
    expect(sheetNameForYear(2020)).toBe("EMPRESAS_20");
  });
});

/** Construye una hoja que reproduce la estructura real confirmada del
 * archivo 2025 (filas de título, encabezado en la fila 7, datos desde la 8). */
async function buildRealShapeWorksheet() {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("EMPRESAS_25");
  ws.addRow(["PERÚ"]);
  ws.addRow([]);
  ws.addRow(["NÚMERO DE EMPRESAS EN EL SECTOR PRIVADO POR MESES, SEGÚN DISTRITOS"]);
  ws.addRow([]);
  ws.addRow(["AÑO 2025"]);
  ws.addRow([]);
  ws.addRow(["Código de Ubigeo", "DISTRITOS", "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SETIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]);
  ws.addRow(["010101", "CHACHAPOYAS", 672, 672, 668, 675, 680, 691, 698, 706, 711, 721, 725, 745]);
  ws.addRow(["010103", "BALSAS", 2, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1]);
  ws.addRow(["130101", "TRUJILLO", 10076, 10059, 10063, 10191, 10296, 10353, 10429, 10458, 10578, 10681, 10761, 10660]);
  return ws;
}

describe("findHeaderRow", () => {
  it("encuentra la fila 7 real, sin asumir una posición fija", async () => {
    const ws = await buildRealShapeWorksheet();
    expect(findHeaderRow(ws)).toBe(7);
  });

  it("lanza un error explícito si nunca aparece UBIGEO", async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Vacía");
    ws.addRow(["sin encabezado reconocible"]);
    expect(() => findHeaderRow(ws, 3)).toThrow(/No se encontró una fila de encabezado/);
  });
});

describe("confirmSheetYear", () => {
  it("confirma el año real declarado en la hoja (fila 5: 'AÑO 2025')", async () => {
    const ws = await buildRealShapeWorksheet();
    expect(confirmSheetYear(ws, 2025)).toBe(true);
  });

  it("devuelve false si el año no aparece (protege contra una hoja mal resuelta)", async () => {
    const ws = await buildRealShapeWorksheet();
    expect(confirmSheetYear(ws, 2024)).toBe(false);
  });
});

describe("extractDistritoRows", () => {
  it("extrae las 3 filas de distrito reales con sus 12 valores mensuales", async () => {
    const ws = await buildRealShapeWorksheet();
    const rows = extractDistritoRows(ws, 7);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ ubigeo: "010101", distrito: "CHACHAPOYAS", valoresPorMes: [672, 672, 668, 675, 680, 691, 698, 706, 711, 721, 725, 745] });
    expect(rows[2].ubigeo).toBe("130101");
    expect(rows[2].valoresPorMes[11]).toBe(10660); // diciembre
  });

  it("descarta filas cuyo UBIGEO no es numérico (fin de tabla, notas al pie)", async () => {
    const ws = await buildRealShapeWorksheet();
    ws.addRow(["Fuente: MTPE - Oficina General de Estadística"]);
    const rows = extractDistritoRows(ws, 7);
    expect(rows).toHaveLength(3);
  });

  it("lanza un error explícito si falta alguna columna de mes en el encabezado", async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Incompleta");
    for (let i = 0; i < 6; i += 1) ws.addRow([]);
    ws.addRow(["Código de Ubigeo", "DISTRITOS", "ENERO", "FEBRERO"]); // faltan 10 meses
    expect(() => extractDistritoRows(ws, 7)).toThrow(/No se encontraron las columnas de mes/);
  });
});
