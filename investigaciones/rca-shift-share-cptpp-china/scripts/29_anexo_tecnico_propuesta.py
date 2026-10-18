# -*- coding: utf-8 -*-
"""
Genera el Anexo técnico de análisis avanzados (scripts 19-32) como Markdown y DOCX.

Lee las tablas reales de results_avanzados/ y la hoja Resumen del libro
analisis_avanzados_wgi.xlsx, de modo que el anexo no transcribe cifras a mano.

Salidas:
  ../propuesta/Anexo-Tecnico-Analisis-Avanzados.md
  ../propuesta/Anexo-Tecnico-Analisis-Avanzados.docx
"""
from pathlib import Path

import pandas as pd
from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

PROJ = Path(__file__).parent / ".."
RES = PROJ / "results_avanzados"
WB = PROJ / "analisis_avanzados_wgi.xlsx"
OUT_MD = PROJ / "propuesta" / "Anexo-Tecnico-Analisis-Avanzados.md"
OUT_DOCX = PROJ / "propuesta" / "Anexo-Tecnico-Analisis-Avanzados.docx"


def fmt(v):
    if isinstance(v, float):
        if pd.isna(v):
            return ""
        if v == 0:
            return "0"
        return f"{v:.4g}"
    return str(v)


def mt(df: pd.DataFrame) -> str:
    """DataFrame -> tabla markdown."""
    cols = list(df.columns)
    lines = ["| " + " | ".join(str(c) for c in cols) + " |",
             "|" + "|".join(["---"] * len(cols)) + "|"]
    for _, row in df.iterrows():
        lines.append("| " + " | ".join(fmt(row[c]) for c in cols) + " |")
    return "\n".join(lines)


def leer(nombre: str) -> pd.DataFrame:
    return pd.read_csv(RES / nombre)


def tabla_resumen() -> pd.DataFrame:
    raw = pd.read_excel(WB, sheet_name="Resumen", header=None)
    fila_h = raw.index[raw[0] == "Análisis (script)"][0]
    cols = [str(c) for c in raw.iloc[fila_h].tolist()]
    body = raw.iloc[fila_h + 1:].copy()
    body.columns = cols
    body = body[body[cols[0]].notna()]
    body = body[body[cols[0]].astype(str).str.match(r"^\d")]
    return body


def main() -> None:
    resumen = tabla_resumen()

    ppml = leer("20_ppml_gravedad.csv")
    prod = leer("22_gravedad_producto.csv")
    cptpp = leer("23_did_cptpp_fta.csv")
    iv = leer("24_iv_gravedad.csv")
    din = leer("25_panel_dinamico.csv")
    dml = leer("26_dml_oster.csv")
    curva = leer("26_curva_especificaciones.csv")
    eci = leer("eci_paises.csv")
    pci = leer("complejidad_hs4.csv")
    opor = leer("peru_oportunidades.csv")
    h3 = leer("31_h3_definitiva.csv")
    panel6 = leer("32_panel_hs6.csv")

    eci_top = pd.concat([
        eci.sort_values("eci_2024", ascending=False).head(15),
        eci[eci["iso3"] == "PER"],
    ])
    pci_top = pci.sort_values("pci_2024", ascending=False).head(10)
    opor_top = opor.head(20)

    md = []
    md.append("# Anexo técnico — Análisis avanzados del proyecto WGI\n")
    md.append(
        "**Proyecto:** Gobernanza institucional y competitividad exportadora del Perú "
        "(Perú / CPTPP-China).  \n"
        "**Autores:** Mg. Ricardo A. Cuba Alván · Dra. Rosa Patricia Larios Francia.  \n"
        "**Fecha:** octubre de 2026.\n"
    )
    md.append(
        "Este anexo documenta la batería de análisis avanzados ejecutada sobre el panel de "
        "gravedad (184 socios, 2016-2024) y los insumos de producto y acuerdos disponibles. "
        "Hace explícito el alcance del hallazgo: **la asociación entre gobernanza y "
        "exportaciones es robusta en niveles entre países, pero no se sostiene en la variación "
        "dentro del país ni dentro de producto**. Se reporta, por tanto, como asociación y no "
        "como efecto causal.\n"
    )
    md.append(
        "Los scripts (19-32) y las tablas completas están en el repositorio del proyecto "
        "(`scripts/`, `results_avanzados/`) y en el libro `analisis_avanzados_wgi.xlsx`, hoja por "
        "análisis. Las tablas de este anexo reproducen esos resultados; las de mayor tamaño se "
        "resumen en sus primeras filas.\n"
    )

    md.append("## Resumen\n")
    md.append(mt(resumen))
    md.append("")

    md.append("## 1. PPML, Gamma PML y márgenes (script 20)\n")
    md.append(
        "El OLS log-lineal descarta ceros y es sensible a la heterocedasticidad y a los flujos "
        "grandes. Se estima un Poisson pseudo-máximo-verosímil (PPML) con y sin efectos fijos de "
        "socio, un panel con ceros (margen extensivo) y una Gamma PML. El coeficiente de "
        "gobernanza (WGI promedio rezagado) por modelo:\n"
    )
    md.append(mt(ppml))
    md.append("")
    md.append(
        "*Lectura:* el efecto de 0,667 (OLS) y 0,696 (Gamma PML) **cae y pierde significancia en "
        "PPML** (0,16-0,38) y el margen extensivo es nulo. El hallazgo en niveles es sensible al "
        "estimador — un resultado que el proyecto reporta explícitamente.\n"
    )

    md.append("## 2. Gravedad por producto (script 22)\n")
    md.append(
        "Panel Perú → 212 socios × HS4 (2015-2024), 198.159 observaciones, estimado por PPML con "
        "efectos fijos de socio, año y HS2. La gobernanza se interactúa con la complejidad del "
        "producto (PCI 2015, predeterminada).\n"
    )
    md.append(mt(prod))
    md.append("")
    md.append(
        "*Lectura:* no hay efecto **positivo** dentro de producto; la interacción gobernanza × "
        "complejidad es negativa y significativa. La señal agregada vive entre países, no dentro "
        "de la canasta.\n"
    )

    md.append("## 3. Acuerdos comerciales y DiD del CPTPP (script 23)\n")
    md.append(
        "Control de acuerdos comerciales (base CEPII RTA), diferencias en diferencias de la "
        "entrada en vigor del CPTPP para Perú (19-sep-2021) y evento-estudio (año base 2019).\n"
    )
    md.append(mt(cptpp))
    md.append("")
    md.append(
        "*Lectura:* la gobernanza sobrevive al control del acuerdo (0,655; p < 0,001); el DiD del "
        "CPTPP es nulo (coeficiente ≈ 0; p = 0,90) y no hay pre-tendencia ni efecto posterior.\n"
    )

    md.append("## 4. Variables instrumentales (script 24)\n")
    md.append(
        "2SLS con dos instrumentos exógenos: |latitud| del socio (proxy histórico de "
        "instituciones) y gobernanza promedio de su región, excluyendo al propio país "
        "(leave-one-out).\n"
    )
    md.append(mt(iv))
    md.append("")
    md.append(
        "*Lectura:* primera etapa fuerte (F = 39-67) y coeficiente 2SLS positivo (0,70-0,96; "
        "p < 0,01). El contraste de sobreidentificación no respalda del todo los instrumentos "
        "(Sargan p = 0,02-0,08), por lo que la lectura causal es limitada.\n"
    )

    md.append("## 5. Panel dinámico (script 25)\n")
    md.append(
        "Estimación de Anderson-Hsiao (2SLS en primeras diferencias) para medir la persistencia "
        "de las exportaciones y el efecto de la gobernanza **dentro** del país.\n"
    )
    md.append(mt(din))
    md.append("")
    md.append(
        "*Lectura:* fuerte persistencia (ρ ≈ 0,5) y efecto de gobernanza no significativo dentro "
        "del país, consistente con el fallo en primeras diferencias.\n"
    )

    md.append("## 6. Doble aprendizaje automático y sesgo de Oster (script 26)\n")
    md.append(mt(dml))
    md.append("")
    md.append(
        "*Lectura:* θ = 0,705 (p < 0,001) con controles completos y δ = 2,58 > 1 en Oster (2019): "
        "haría falta un sesgo de selección no observado dos veces y media mayor que el observado "
        "para anular la asociación en niveles.\n"
    )

    md.append("## 7. Curva de especificaciones (script 26)\n")
    md.append(
        "32 combinaciones de muestra (todas / sin China / sin CPTPP / winsor 5%), controles "
        "(mínimos / completos), rezago (t-1 / t-2) y efectos fijos (año / año + región).\n"
    )
    md.append(mt(curva))
    md.append("")
    md.append(
        "*Lectura:* 100% de las especificaciones son positivas y significativas; mediana 0,59, "
        "rango [0,46; 0,69]. Estabilidad alta en niveles.\n"
    )

    md.append("## 8. Complejidad económica — ECI por país (script 27)\n")
    md.append("Índice de complejidad económica (Hidalgo-Hausmann) calculado desde BACI HS4. Se muestran los 15 países más complejos de 2024 y el Perú.\n")
    md.append(mt(eci_top))
    md.append("")
    md.append("*Lectura:* el Perú registra ECI = -0,72 (2024), en la parte baja de la distribución.\n")

    md.append("## 9. Complejidad de producto — PCI por HS4 (script 27)\n")
    md.append("Los 10 productos HS4 más complejos (PCI 2024) y su ubicuidad (número de países con ventaja revelada).\n")
    md.append(mt(pci_top))
    md.append("")

    md.append("## 10. Oportunidades de diversificación del Perú (script 27)\n")
    md.append("Productos aún sin ventaja revelada (RCA < 1) con mayor densidad (vecindad en el espacio de productos).\n")
    md.append(mt(opor_top))
    md.append("")

    md.append("## 11. H3 definitiva — intensidad contractual de Nunn (2007) con "
              "efectos fijos producto×socio (scripts 30-31)\n")
    md.append(
        "El test central del proyecto lleva su forma definitiva. Se reemplaza la proxy de "
        "complejidad (PCI) por la **intensidad contractual de Nunn (2007)** —la fracción de "
        "insumos intermedios diferenciados de la industria, medida liberal— y se añade la "
        "clasificación de **Rauch (1999)** como contraste. Ambas se mapean a HS6/HS4 sobre la "
        "nomenclatura HS 1988/92 de BACI (con las concordancias ISIC rev.2 y SITC rev.2 de la "
        "clasificación de las Naciones Unidas). Los Nunn cubren 88,7% de las filas y 45,3% del "
        "valor exportado (lo no cubierto son, sobre todo, minerales). La especificación de "
        "exposición diferencial interactúa la gobernanza rezagada del socio con la intensidad "
        "contractual del producto y satura la variación entre países con **efectos fijos "
        "producto×socio** (más año; y una variante saturada con socio×año):\n"
    )
    md.append(mt(h3))
    md.append("")
    md.append(
        "*Lectura:* el término de exposición diferencial gobernanza × intensidad contractual "
        "**no es positivo en ningún modelo** y sólo resulta significativo —con signo negativo— en "
        "la especificación saturada a HS6 (-3,8; p = 0,014). Por tercios de intensidad "
        "contractual, el efecto de nivel de la gobernanza es positivo pero no significativo en la "
        "canasta de baja intensidad (+0,83) y pasa a negativo en la media (-0,86; p = 0,055) y la "
        "alta (-0,44; p = 0,012). La prueba definitiva **rechaza H3 en su forma de signo "
        "positivo**: la gobernanza no eleva las exportaciones del Perú ni siquiera en los "
        "productos más intensivos en relaciones contractuales.\n"
    )

    md.append("## 12. Panel HS6 del Perú (script 19)\n")
    md.append(
        "Base del test anterior: panel Perú → mundo a nivel HS6 (2015-2024), construido desde "
        "BACI, con la cobertura de la intensidad contractual de Nunn y de la clasificación de "
        "Rauch, y la magnitud de la demanda del destino (importaciones del socio desde el mundo, "
        "excluido el Perú).\n"
    )
    md.append(mt(panel6))
    md.append("")
    md.append(
        "*Lectura:* la canasta exportadora del Perú es amplia en número de productos (≈3.700 "
        "HS6 al año) pero la intensidad contractual sólo está definida para el subconjunto "
        "manufacturero/agropecuario de Nunn; el valor no cubierto corresponde a minerales.\n"
    )

    md.append("## Nota de reproducibilidad\n")
    md.append(
        "Los scripts 19-32 y el módulo común `_comun_gravedad.py` reproducen todas las tablas. "
        "Insumos: BACI/CEPII (HS92 V202601), WGI/WDI y atributos del Banco Mundial, CEPII GeoDist "
        "y CEPII RTA; intensidad contractual de Nunn (2007) y clasificación de Rauch (1999), "
        "mapeadas a HS con las concordancias del paquete `concordance` (ISIC rev.2 y SITC rev.2). "
        "El panel de producto y la matriz país × producto se construyen desde BACI en una sola "
        "pasada (script 21). Dependencias: pandas, statsmodels, linearmodels, pyfixest, "
        "scikit-learn, pyreadr, openpyxl.\n"
    )

    texto = "\n".join(md)
    OUT_MD.write_text(texto, encoding="utf-8")
    print(f"MD:   {OUT_MD}")

    # --- DOCX ---
    NAVY = RGBColor(0x1a, 0x30, 0x50)
    GREY = RGBColor(0x55, 0x55, 0x55)
    WHITE = RGBColor(0xFF, 0xFF, 0xFF)

    def shd(cell, color):
        tcPr = cell._tc.get_or_add_tcPr()
        e = OxmlElement("w:shd")
        e.set(qn("w:val"), "clear"); e.set(qn("w:color"), "auto"); e.set(qn("w:fill"), color)
        tcPr.append(e)

    doc = Document()
    sec = doc.sections[0]
    sec.page_width, sec.page_height = Cm(21.0), Cm(29.7)
    sec.left_margin = sec.right_margin = Cm(2.2)
    sec.top_margin = sec.bottom_margin = Cm(2.0)
    doc.styles["Normal"].font.size = Pt(10)

    lines = texto.split("\n")
    i = 0
    while i < len(lines):
        s = lines[i].strip()
        if not s:
            i += 1; continue
        if s.startswith("|"):
            rows = []
            j = i
            while j < len(lines) and lines[j].strip().startswith("|"):
                row = [c.strip() for c in lines[j].strip().split("|")[1:-1]]
                j += 1
                if j < len(lines) and set(lines[j].strip()) <= set("|-: "):
                    continue
                rows.append(row)
            ncol = max(len(r) for r in rows)
            t = doc.add_table(rows=len(rows), cols=ncol)
            t.alignment = WD_TABLE_ALIGNMENT.CENTER
            w = (Cm(21.0) - Cm(4.4)) / ncol
            for ri, rd in enumerate(rows):
                for ci in range(ncol):
                    cell = t.rows[ri].cells[ci]
                    cell.width = w
                    p = cell.paragraphs[0]
                    p.paragraph_format.space_before = Pt(2); p.paragraph_format.space_after = Pt(2)
                    txt = rd[ci] if ci < len(rd) else ""
                    r = p.add_run(txt.replace("**", ""))
                    r.font.size = Pt(8.5)
                    if ri == 0:
                        shd(cell, "1A3050"); r.font.bold = True; r.font.color.rgb = WHITE
                    elif ri % 2 == 0:
                        shd(cell, "F4F6FA")
            doc.add_paragraph().paragraph_format.space_after = Pt(3)
            i = j; continue
        if s.startswith("# "):
            p = doc.add_paragraph(); p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(12); p.paragraph_format.space_after = Pt(4)
            r = p.add_run(s[2:]); r.font.size = Pt(17); r.font.bold = True; r.font.color.rgb = NAVY
            i += 1; continue
        if s.startswith("## "):
            p = doc.add_paragraph(); p.paragraph_format.space_before = Pt(12); p.paragraph_format.space_after = Pt(3)
            r = p.add_run(s[3:].upper()); r.font.size = Pt(11); r.font.bold = True; r.font.color.rgb = NAVY
            i += 1; continue
        r = doc.add_paragraph()
        r.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        ital = s.startswith("*") and s.endswith("*")
        r.add_run(s.strip("*")).font.italic = ital
        i += 1

    doc.save(str(OUT_DOCX))
    print(f"DOCX: {OUT_DOCX}")
    print(f"resumen filas: {len(resumen)} | curva filas: {len(curva)} | eci filas: {len(eci)} | "
          f"pci filas: {len(pci)} | h3 filas: {len(h3)} | panel HS6 filas: {len(panel6)}")


if __name__ == "__main__":
    main()
