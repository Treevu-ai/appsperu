"""
Paso 28 — Compila los resultados de los análisis avanzados (20-27) en un libro
Excel único: ../analisis_avanzados_wgi.xlsx

Salida: investigaciones/rca-shift-share-cptpp-china/analisis_avanzados_wgi.xlsx
"""
from pathlib import Path

import pandas as pd
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

PROJ = Path(__file__).parent / ".."
RES = PROJ / "results_avanzados"
OUT = PROJ / "analisis_avanzados_wgi.xlsx"

HEADER_FILL = PatternFill("solid", fgColor="1F4E78")
HEADER_FONT = Font(name="Arial", size=10, bold=True, color="FFFFFF")
BODY_FONT = Font(name="Arial", size=10)
TITLE_FONT = Font(name="Arial", size=14, bold=True, color="1F4E78")
SECTION_FONT = Font(name="Arial", size=11, bold=True, color="1F4E78")
THIN = Side(style="thin", color="BFBFBF")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
WRAP = Alignment(wrap_text=True, vertical="top")

HOJAS = [
    ("1_PPML_gravedad", "20_ppml_gravedad.csv",
     "PPML, Gamma PML, márgenes y efectos fijos. Coeficiente de gobernanza por modelo."),
    ("2_gravedad_producto", "22_gravedad_producto.csv",
     "Gravedad por producto HS4 (PPML, 198k obs): gobernanza e interacción con complejidad (PCI)."),
    ("3_CPTPP_FTA", "23_did_cptpp_fta.csv",
     "Control de acuerdos comerciales (RTA) y DiD/event study del CPTPP (sep-2021)."),
    ("4_IV_2SLS", "24_iv_gravedad.csv",
     "Variables instrumentales: latitud y gobernanza regional (leave-one-out)."),
    ("5_panel_dinamico", "25_panel_dinamico.csv",
     "Panel dinámico Anderson-Hsiao: persistencia y gobernanza dentro del país."),
    ("6_DML_Oster", "26_dml_oster.csv",
     "Double ML (Robinson) y sesgo de variable omitida de Oster (2019)."),
    ("7_curva_especificaciones", "26_curva_especificaciones.csv",
     "32 combinaciones de muestra, controles, rezago y efectos fijos."),
    ("8_ECI_paises", "eci_paises.csv",
     "Índice de complejidad económica (ECI) por país, 2015 y 2024."),
    ("9_PCI_productos", "complejidad_hs4.csv",
     "Índice de complejidad de producto (PCI) y ubicuidad por HS4."),
    ("10_oportunidades_Peru", "peru_oportunidades.csv",
     "Productos aún sin ventaja revelada (RCA<1) con mayor densidad para Perú."),
    ("11_H3_definitiva", "31_h3_definitiva.csv",
     "H3 definitiva: Nunn (2007) y Rauch (1999) con FE producto×socio (HS4 y HS6). Interacción gobernanza×intensidad contractual."),
    ("12_panel_HS6", "32_panel_hs6.csv",
     "Panel Perú→mundo a nivel HS6 (script 19): dimensión anual y cobertura de Nunn/Rauch."),
]

RESUMEN = [
    ("1. PPML y márgenes (20)", "Poisson/Gamma PML con FE socio+año, con y sin ceros; LPM/Logit extensivo",
     "OLS 0.667***; Gamma PML 0.696***; PPML 0.157 (ns) / 0.381 (ns); margen extensivo ~0",
     "La asociación NO se sostiene en PPML: sensible al estimador y a los flujos grandes"),
    ("2. Gravedad por producto (22)", "PPML FE socio+año+HS2, 198k obs (Perú→184 socios × HS4)",
     "WGI principal ns; interacción WGI×PCI = -0.58* (PPML) / -0.28*** (OLS)",
     "Sin efecto positivo DENTRO de producto: la señal vive entre países, no dentro de producto"),
    ("3. CPTPP y acuerdos (23)", "Control RTA + DiD (CPTPP×post2022) + event study (base 2019)",
     "WGI sobrevive al control del acuerdo (0.655***); DiD ≈ 0 (p=0.90); sin pre-tendencia",
     "Sin efecto detectable del CPTPP en el agregado"),
    ("4. IV / 2SLS (24)", "Instrumentos: |latitud| y gobernanza regional (leave-one-out)",
     "F 1ª etapa 39-67 (no débil); 2SLS 0.70-0.96**; Sargan p=0.021",
     "Asociación positiva y no débil, pero la validez del instrumento es discutible"),
    ("5. Panel dinámico (25)", "Anderson-Hsiao: 2SLS en primeras diferencias",
     "ρ (persistencia) ≈ 0.52; β(WGI) no significativo (-0.10 a -0.31)",
     "Dentro del país no hay efecto: consistente con el fallo de primeras diferencias (18_)"),
    ("6. Double ML (26)", "Robinson PLR con cross-fitting (gradient boosting), K=5",
     "θ = 0.705*** (completo) / 0.643** (+región)",
     "Robusto a mala especificación funcional de los controles"),
    ("7. Curva de especificaciones (26)", "32 combinaciones (muestra, controles, rezago, FE)",
     "100% positivo y significativo; mediana 0.59; rango [0.46, 0.69]",
     "En niveles, el resultado es extremadamente estable"),
    ("8. Oster (26)", "Sesgo de variable omitida (Rmax = 1.3·R²)",
     "δ = 2.58 (>1); β* = 0.41 (>0)",
     "Robusto a no-observables: haría falta que pesaran 2.6× lo observado para anularlo"),
    ("9. Complejidad económica (27)", "ECI/PCI (Hidalgo-Hausmann) desde BACI HS4",
     "Perú ECI = -0.72 (2024, puesto bajo); oportunidades adyacentes a recursos",
     "Perú en la parte baja de complejidad; margen en productos vecinos a su canasta"),
    ("10. H3 definitiva (30-31)", "Nunn (2007) y Rauch (1999) + FE producto×socio (HS4/HS6); exposición diferencial",
     "WGI×Nunn: A -2.6 (ns); B OLS +0.7 (ns); B2 -0.07 (ns); C +0.5 (ns); Rauch -0.72 (ns); "
     "tercios: CI baja +0.83 (ns), media -0.86 (p=0.055), alta -0.44 (p=0.012); HS6 saturada -3.8 (p=0.014)",
     "PRUEBA DEFINITIVA: se RECHAZA el efecto positivo; dentro de producto×socio el efecto no existe "
     "y en productos de alta intensidad contractual aparece una débil asociación negativa"),
    ("11. Panel HS6 (19 y 32)", "Perú→212 socios, 4.465 productos HS6, 415.757 obs (2015-2024)",
     "Nunn cubre 88,7% de las filas y 45,3% del valor (lo no cubierto son minerales, fuera del alcance de Nunn)",
     "Base del test definitivo; la cobertura excluye sobre todo productos primarios"),
]


def main() -> None:
    with pd.ExcelWriter(OUT, engine="openpyxl") as writer:
        for hoja, archivo, _ in HOJAS:
            pd.read_csv(RES / archivo).to_excel(writer, sheet_name=hoja, index=False)

    wb = load_workbook(OUT)

    def formatear(ws, df):
        for j, col in enumerate(df.columns, start=1):
            base = len(str(col))
            m = df[col].astype(str).str.len().max() if len(df) else base
            ws.column_dimensions[get_column_letter(j)].width = min(max(base, int(m or 0)) + 2, 46)
        for j in range(1, len(df.columns) + 1):
            c = ws.cell(row=1, column=j)
            c.font, c.fill, c.border = HEADER_FONT, HEADER_FILL, BORDER
            c.alignment = Alignment(horizontal="center", vertical="center")
        ws.row_dimensions[1].height = 26
        for i in range(2, len(df) + 2):
            for j in range(1, len(df.columns) + 1):
                ws.cell(row=i, column=j).font = BODY_FONT
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = f"A1:{get_column_letter(len(df.columns))}{len(df) + 1}"

    for hoja, archivo, _ in HOJAS:
        formatear(wb[hoja], pd.read_csv(RES / archivo))

    # --- hoja Resumen al frente ---
    rs = wb.create_sheet("Resumen", 0)
    rs.sheet_properties.tabColor = "1F4E78"
    widths = [30, 44, 52, 52]
    for i, w in enumerate(widths, start=1):
        rs.column_dimensions[get_column_letter(i)].width = w
    rs.cell(row=1, column=1, value="Análisis avanzados — Proyecto WGI (Perú / CPTPP-China)").font = TITLE_FONT
    rs.cell(row=2, column=1,
            value="Gobernanza (WGI) y competitividad exportadora · resultados de los scripts 19-32").font = BODY_FONT
    rs.cell(row=3, column=1,
            value="Generado 2026-10-16. Cifras de results_avanzados/. Nota: un hallazgo negativo es un resultado válido."
            ).font = Font(name="Arial", size=9, italic=True, color="808080")
    hdr = ["Análisis (script)", "Método", "Resultado clave", "Veredicto"]
    for j, h in enumerate(hdr, start=1):
        c = rs.cell(row=5, column=j, value=h)
        c.font, c.fill, c.border = HEADER_FONT, HEADER_FILL, BORDER
        c.alignment = Alignment(horizontal="center", vertical="center")
    rs.row_dimensions[5].height = 24
    r = 6
    for fila in RESUMEN:
        for j, v in enumerate(fila, start=1):
            c = rs.cell(row=r, column=j, value=v)
            c.font = BODY_FONT
            c.border = BORDER
            c.alignment = WRAP
        rs.row_dimensions[r].height = 44
        r += 1

    r += 1
    c = rs.cell(row=r, column=1, value="Veredicto global")
    c.font = SECTION_FONT
    r += 1
    c = rs.cell(row=r, column=1,
                value="La asociación gobernanza–exportaciones es fuerte y estable en NIVELES entre países "
                      "(OLS, DML, IV, curva de especificaciones, Oster: todos positivos y significativos), "
                      "pero desaparece en la variación DENTRO del país o DENTRO de producto (PPML, gravedad "
                      "por producto, panel dinámico, primeras diferencias). La PRUEBA DEFINITIVA de H3 — "
                      "intensidad contractual de Nunn (2007) con efectos fijos producto×socio (hoja 11) — "
                      "RECHAZA además el efecto positivo esperado: el término de exposición diferencial no es "
                      "positivo y en productos de alta intensidad contractual aparece una asociación negativa "
                      "débil. Conclusión: ASOCIACIÓN robusta, NO efecto causal; H3 no se sostiene en su forma "
                      "de signo positivo.")
    c.font = Font(name="Arial", size=10, italic=True, color="C00000")
    c.alignment = WRAP
    rs.merge_cells(start_row=r, start_column=1, end_row=r, end_column=4)
    rs.row_dimensions[r].height = 60

    wb.save(OUT)
    print("Escrito:", OUT)
    print("Hojas:", wb.sheetnames)


if __name__ == "__main__":
    main()
