import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { extractCargasRows, findHeaderRow, findLastDataRow } from "../ingest/cargas-portuarias-parse.js";

/** Reproduce el fragmento real de CARGAS_2010_2017.xlsx confirmado en vivo el 2026-10-03:
 * título + fila vacía, encabezado en la fila 8, TOTAL GENERAL, subtotales "Total IP Uso X",
 * un ámbito (Maritimo) con un puerto (Callao) y dos terminales de detalle, y el pie de fuente
 * duplicado al final. Solo 2 años (en vez de 8) para mantener el fixture legible. */
async function buildRealShapeWorksheet() {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Hoja1");
  ws.addRow([]);
  ws.addRow([null, "MOVIMIENTO DE CARGA"]);
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow([]);
  ws.addRow([null, "Evolucion del movimiento de carga..."]);
  ws.addRow([]);
  ws.addRow([null, "Terminales Portuarios ", "Uso", "Año 2010", "Año 2011", "Variación\n(%)"]);
  ws.addRow([]);
  ws.addRow([null, "TOTAL GENERAL", null, 70574581.39, 82104035.46]);
  ws.addRow([]);
  ws.addRow([null, "Total IP Uso Público", null, 30049527.45, 35513962.44]);
  ws.addRow([null, "Total IP Uso Privado", null, 40525053.94, 46590073.03]);
  ws.addRow([]);
  ws.addRow([null, "Maritimo", null, 69001966.81, 80712663.53]);
  ws.addRow([null, "Callao", null, 33172507.45, 40458257.49]);
  ws.addRow([null, "TNM Callao - ENAPU/ APM Terminals Callao", "Público", 17437423, 13955718.15]);
  ws.addRow([null, "T Multiboyas Refinería La Pampilla - Repsol", "Privado", 7140555.58, 7017095.995]);
  ws.addRow([]);
  ws.addRow([null, "Fuente:Instalaciones portuarias de uso público y privado"]);
  ws.addRow([null, "Elaborado por el Área de Estadísticas - DOMA"]);
  for (let i = 0; i < 20; i += 1) ws.addRow([]);
  ws.addRow([null, null, "Fuente:Instalaciones portuarias de uso público y privado"]);
  ws.addRow([null, null, "Elaborado por el Área de Estadísticas - DOMA"]);
  return ws;
}

describe("findHeaderRow", () => {
  it("encuentra la fila 8 real sin asumir una posición fija", async () => {
    const ws = await buildRealShapeWorksheet();
    expect(findHeaderRow(ws)).toBe(8);
  });

  it("lanza un error explícito si nunca aparece el encabezado esperado", async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet("Vacía");
    ws.addRow(["sin encabezado reconocible"]);
    expect(() => findHeaderRow(ws, 3)).toThrow(/No se encontró la fila de encabezado/);
  });
});

describe("findLastDataRow", () => {
  it("ignora el padding vacío y el pie de fuente duplicado al final", async () => {
    const ws = await buildRealShapeWorksheet();
    const header = findHeaderRow(ws);
    const last = findLastDataRow(ws, header);
    // la última fila con datos reales es la de Repsol (fila 18 en este fixture)
    expect(ws.getRow(last).getCell(2).value).toBe("T Multiboyas Refinería La Pampilla - Repsol");
  });
});

describe("extractCargasRows", () => {
  it("clasifica TOTAL GENERAL y los subtotales de uso como total_general, sin abrir un grupo de puerto", async () => {
    const ws = await buildRealShapeWorksheet();
    const header = findHeaderRow(ws);
    const last = findLastDataRow(ws, header);
    const { rows } = extractCargasRows(ws, header, last);

    const totales = rows.filter((r) => r.nivel === "total_general");
    expect(totales.map((r) => r.nombreFuente)).toEqual(
      expect.arrayContaining(["TOTAL GENERAL", "Total IP Uso Público", "Total IP Uso Privado"])
    );
    expect(totales.every((r) => r.puerto === null)).toBe(true);
  });

  it("asocia cada terminal de detalle a su puerto y ámbito reales (Callao bajo Maritimo)", async () => {
    const ws = await buildRealShapeWorksheet();
    const header = findHeaderRow(ws);
    const last = findLastDataRow(ws, header);
    const { rows } = extractCargasRows(ws, header, last);

    const repsol2010 = rows.find((r) => r.nombreFuente.includes("Repsol") && r.anio === 2010);
    expect(repsol2010).toMatchObject({
      nivel: "terminal",
      ambito: "MARITIMO",
      puerto: "Callao",
      uso: "Privado",
      volumenTm: 7140555.58,
    });

    const callao2011 = rows.find((r) => r.nombreFuente === "Callao" && r.anio === 2011);
    expect(callao2011).toMatchObject({ nivel: "puerto", ambito: "MARITIMO", puerto: null, volumenTm: 40458257.49 });
  });

  it("genera dos filas (una por año) por cada fila de origen", async () => {
    const ws = await buildRealShapeWorksheet();
    const header = findHeaderRow(ws);
    const last = findLastDataRow(ws, header);
    const { rows } = extractCargasRows(ws, header, last);

    const repsolRows = rows.filter((r) => r.nombreFuente.includes("Repsol"));
    expect(repsolRows.map((r) => r.anio).sort()).toEqual([2010, 2011]);
  });

  it("ignora las filas de pie de fuente y las filas vacías", async () => {
    const ws = await buildRealShapeWorksheet();
    const header = findHeaderRow(ws);
    const last = findLastDataRow(ws, header);
    const { rows } = extractCargasRows(ws, header, last);

    expect(rows.some((r) => r.nombreFuente.startsWith("Fuente:"))).toBe(false);
    expect(rows.some((r) => r.nombreFuente.startsWith("Elaborado por"))).toBe(false);
  });
});
