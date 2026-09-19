import { describe, expect, it } from "vitest";
import { parseExportacionesFobHtml } from "../ingest/exportaciones-fob-normalize.js";

// Fragmento real de la respuesta de aduanet.gob.pe (ACOPAGRO, año 2025,
// capturado en vivo el 2026-09-19), recortado a 2 filas + encabezado —
// preserva la estructura real de <tr class="bg"> con los bytes nulos de
// relleno (\x00) y el onclick con los códigos reales.
const REAL_HTML_2_FILAS = `
<table cellspacing="1" cellpadding="1" width="100%" align="center">
  <tr align="center">
    <td class="beta" width="7%"><b>LISTAR DUAS</b></td>
    <td class="beta" width="14%"><b>EXPORTADOR</b></td>
    <td class="beta" width="8%"><b>MES</b></td>
    <td class="beta" width="13%"><b>AGENTE</b></td>
    <td class="beta" width="13%"><b>ADUANA</b></td>
    <td class="beta" width="13%"><b>PAÍS</b></td>
    <td class="beta" width="8%"><b>FOB $</b></td>
  </tr>
  <tr class="bg">
    <td align="center">
      <a href='javascript:jsDetalleDUA("40","420404057805","118","7378","8","2025","BE");'>LISTAR</a>
    </td>
    <td align="left">20404057805-COOPERATIVA AGRARIA ACOPAGRO LTDA\x00\x00\x00</td>
    <td align="center">Agosto 2025</td>
    <td align="left">SAN MIGUEL ADUANAS S.A.C.\x00\x00\x00</td>
    <td align="left">MARITIMA DEL CALLAO                                    </td>
    <td align="left">BELGIUM                                                </td>
    <td align="right">245,107.20</td>
  </tr>
  <tr class="bg">
    <td align="center">
      <a href='javascript:jsDetalleDUA("40","420404057805","118","7378","1","2025","NL");'>LISTAR</a>
    </td>
    <td align="left">20404057805-COOPERATIVA AGRARIA ACOPAGRO LTDA\x00\x00\x00</td>
    <td align="center">Enero 2025</td>
    <td align="left">SAN MIGUEL ADUANAS S.A.C.\x00\x00\x00</td>
    <td align="left">MARITIMA DEL CALLAO                                    </td>
    <td align="left">NETHERLANDS                                            </td>
    <td align="right">218,209.28</td>
  </tr>
</table>
`;

const REAL_HTML_SIN_REGISTROS = `
<table cellspacing="1" cellpadding="1" width="100%" align="center">
  <tr align="center">
    <td class="beta" width="7%"><b>LISTAR DUAS</b></td>
  </tr>
  <tr class="bg">
    <td align="center" colspan="10">No se encontraron registros...</td>
  </tr>
</table>
`;

describe("parseExportacionesFobHtml", () => {
  it("parsea filas reales (ACOPAGRO 2025) extrayendo códigos del link LISTAR", () => {
    const rows = parseExportacionesFobHtml(REAL_HTML_2_FILAS);
    expect(rows).toHaveLength(2);

    const [belgica, holanda] = rows;
    expect(belgica.ruc).toBe("20404057805");
    expect(belgica.anio).toBe(2025);
    expect(belgica.mes).toBe(8);
    expect(belgica.aduanaCodigo).toBe("118");
    expect(belgica.aduanaNombre).toBe("MARITIMA DEL CALLAO");
    expect(belgica.agenteCodigo).toBe("7378");
    expect(belgica.agenteNombre).toBe("SAN MIGUEL ADUANAS S.A.C.");
    expect(belgica.paisCodigo).toBe("BE");
    expect(belgica.paisNombre).toBe("BELGIUM");
    expect(belgica.fobUsd).toBe(245107.2);

    expect(holanda.mes).toBe(1);
    expect(holanda.paisCodigo).toBe("NL");
    expect(holanda.fobUsd).toBe(218209.28);
  });

  it("devuelve array vacío cuando la fuente dice 'No se encontraron registros' (no es un error)", () => {
    const rows = parseExportacionesFobHtml(REAL_HTML_SIN_REGISTROS);
    expect(rows).toEqual([]);
  });

  it("devuelve array vacío ante HTML sin filas de resultados", () => {
    const rows = parseExportacionesFobHtml("<html><body>vacío</body></html>");
    expect(rows).toEqual([]);
  });
});
