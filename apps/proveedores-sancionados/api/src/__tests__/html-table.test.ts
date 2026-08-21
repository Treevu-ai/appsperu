import { describe, expect, it } from "vitest";
import { parseHtmlRows } from "../ingest/html-table.js";

// Fragmento real (recortado) del export en vivo del 2026-08-20.
const REAL_FRAGMENT = `
<table border=1 bordercolor=#000000  CELLPADDING=0 CELLSPACING=0  width=100%>
  <tr bgcolor=#F9AF42>
    <td align=center height="21"><FONT face=Arial size=1 color=#000000>#</font></td>
    <td align=center height="21"><FONT face=Arial size=1 color=#000000>Razon Social</font></td>
    <td align=center height="21"><FONT face=Arial size=1 color=#000000>RUC</font>  </td>
  </tr>
  <tr>
    <td height="20"><FONT face=Arial size=1>GEOMATICA CONSULTORES Y EJECUTORES S.A.C. &nbsp;</font>
    <td height="20"><FONT face=Arial size=1>20571603579&nbsp;</font>
    <td height="20"><FONT face=Arial size=1>6386-2026-TCP-S4&nbsp;</font>
  </tr>
</table>
`;

describe("parseHtmlRows", () => {
  it("extrae el texto de cada celda <font> por fila, decodificando entidades y colapsando espacios", () => {
    const rows = parseHtmlRows(REAL_FRAGMENT);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual(["#", "Razon Social", "RUC"]);
    expect(rows[1]).toEqual(["GEOMATICA CONSULTORES Y EJECUTORES S.A.C.", "20571603579", "6386-2026-TCP-S4"]);
  });

  it("decodifica entidades HTML con tilde reales del reporte", () => {
    const html = `<tr><td><font>Resoluci&oacute;n</font></td><td><font>Direcci&oacute;n del Registro Nacional de Proveedores</font></td></tr>`;
    const rows = parseHtmlRows(html);
    expect(rows[0][0]).toBe("Resolución");
    expect(rows[0][1]).toContain("Dirección");
  });

  it("no produce filas para <tr> sin ninguna celda <font> (filas decorativas)", () => {
    const html = `<tr><td>&nbsp;</td><td>&nbsp;</td></tr>`;
    const rows = parseHtmlRows(html);
    expect(rows).toHaveLength(0);
  });

  it("devuelve un array vacío para HTML sin filas", () => {
    expect(parseHtmlRows("<html><body>nada aquí</body></html>")).toEqual([]);
  });
});
