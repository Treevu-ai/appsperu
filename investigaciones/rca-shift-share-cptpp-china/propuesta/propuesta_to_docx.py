"""
Genera Propuesta-Proyecto-Gobernanza-Exportaciones.docx desde el markdown limpio.
"""
import re
from pathlib import Path
from docx import Document
from docx.shared import Pt, Cm, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

INPUT  = Path(__file__).parent / "Propuesta-Proyecto-Gobernanza-Exportaciones.md"
OUTPUT = Path(__file__).parent / "Propuesta-Proyecto-Gobernanza-Exportaciones.docx"

# ── Colores ───────────────────────────────────────────────────────────────
NAVY  = RGBColor(0x1a, 0x30, 0x50)
GREY  = RGBColor(0x55, 0x55, 0x55)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
BLACK = RGBColor(0x00, 0x00, 0x00)
LIGHT = RGBColor(0xf0, 0xf4, 0xf8)

# ── Helpers ──────────────────────────────────────────────────────────────
def set_cell_bg(cell, hex_color):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_color)
    tcPr.append(shd)

def add_page_border(doc):
    pass  # No borders needed for a clean academic proposal

doc = Document()

# Page setup
section = doc.sections[0]
section.page_width  = Cm(21.0)
section.page_height = Cm(29.7)
section.left_margin   = Cm(2.8)
section.right_margin  = Cm(2.8)
section.top_margin    = Cm(2.5)
section.bottom_margin = Cm(2.5)

# ── Estilos del documento ────────────────────────────────────────────────
styles = doc.styles

def style_para(name, base, size, bold=False, color=BLACK,
                align=WD_ALIGN_PARAGRAPH.LEFT,
                space_before=0, space_after=6,
                italic=False):
    try:
        s = styles[name]
    except KeyError:
        s = styles.add_style(name, 1)  # PARAGRAPH
    s.base_style = styles[base]
    s.font.size = Pt(size)
    s.font.bold = bold
    s.font.color.rgb = color
    s.font.italic = italic
    s.paragraph_format.alignment = align
    s.paragraph_format.space_before = Pt(space_before)
    s.paragraph_format.space_after  = Pt(space_after)
    return s

# Crear estilos
style_para('PropTitle',    'Normal', 20, bold=True,  color=NAVY,
            align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0,  space_after=6)
style_para('PropSubtitle', 'Normal', 11, bold=False, color=GREY,
            align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0,  space_after=4)
style_para('PropMeta',     'Normal', 9,  bold=False, color=GREY,
            align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0,  space_after=3)
style_para('SectionHdr',  'Normal', 12, bold=True,  color=WHITE,
            align=WD_ALIGN_PARAGRAPH.LEFT,   space_before=12, space_after=4)
style_para('SubSecHdr',   'Normal', 10, bold=True,  color=NAVY,
            align=WD_ALIGN_PARAGRAPH.LEFT,   space_before=8,  space_after=3)
style_para('Body',        'Normal', 10, bold=False, color=BLACK,
            align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=5)
style_para('Bullet',      'Normal', 10, bold=False, color=BLACK,
            align=WD_ALIGN_PARAGRAPH.JUSTIFY, space_before=0, space_after=3)
style_para('Ref',         'Normal', 9,  bold=False, color=BLACK,
            align=WD_ALIGN_PARAGRAPH.LEFT,   space_before=0, space_after=3)
style_para('TableHdr',    'Normal', 9,  bold=True,  color=WHITE,
            align=WD_ALIGN_PARAGRAPH.CENTER, space_before=0, space_after=0)
style_para('TableCell',   'Normal', 9,  bold=False, color=BLACK,
            align=WD_ALIGN_PARAGRAPH.LEFT,   space_before=0, space_after=0)

def para(text, style_name, bold=False, italic=False):
    p = doc.add_paragraph(style=style_name)
    p.paragraph_format.left_indent  = Pt(0)
    p.paragraph_format.first_line_indent = Pt(0)
    run = p.add_run(text)
    run.font.bold   = bold
    run.font.italic = italic
    return p

def bullet(text):
    p = doc.add_paragraph(style='Bullet')
    p.paragraph_format.left_indent = Pt(20)
    p.paragraph_format.first_line_indent = Pt(-14)
    run = p.add_run('\u2022  ' + text)
    return p

def add_section_header(text):
    # Encabezado con fondo negro
    p = doc.add_paragraph(style='SectionHdr')
    p.paragraph_format.space_before = Pt(14)
    p.paragraph_format.space_after  = Pt(2)
    run = p.add_run(text)
    run.font.color.rgb = WHITE
    run.font.bold = True
    run.font.size = Pt(11)
    # Fondo
    pPr = p._p.get_or_add_pPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), '1A3050')
    pPr.append(shd)
    # Línea bajo el encabezado
    p2 = doc.add_paragraph()
    p2.paragraph_format.space_before = Pt(0)
    p2.paragraph_format.space_after  = Pt(4)
    pPr2 = p2._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '12')
    bottom.set(qn('w:space'), '1')
    bottom.set(qn('w:color'), '1A3050')
    pBdr.append(bottom)
    pPr2.append(pBdr)

def add_subsec_header(text):
    p = doc.add_paragraph(style='SubSecHdr')
    p.paragraph_format.space_before = Pt(8)
    p.paragraph_format.space_after  = Pt(3)
    return p

def add_body(text):
    p = doc.add_paragraph(style='Body')
    return p

def add_table_header_row(table, cols):
    row = table.rows[0]
    for i, text in enumerate(cols):
        cell = row.cells[i]
        set_cell_bg(cell, '1A3050')
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(3)
        p.paragraph_format.space_after  = Pt(3)
        run = p.add_run(text)
        run.font.bold = True
        run.font.color.rgb = WHITE
        run.font.size = Pt(9)

# ── Parser del Markdown ───────────────────────────────────────────────────
with open(INPUT, encoding='utf-8') as fh:
    md = fh.read()

lines = md.split('\n')
i = 0

# Portada
p = doc.add_paragraph(style='PropTitle')
p.paragraph_format.space_before = Pt(36)
p.paragraph_format.space_after  = Pt(8)
r = p.add_run("GOBERNANZA INSTITUCIONAL Y COMPETITIVIDAD EXPORTADORA DEL PERU")
r.font.size = Pt(18); r.font.bold = True; r.font.color.rgb = NAVY

p2 = doc.add_paragraph(style='PropSubtitle')
p2.paragraph_format.space_before = Pt(0)
p2.paragraph_format.space_after  = Pt(6)
r2 = p2.add_run("Proyecto de investigacion colaborativo")
r2.font.size = Pt(12); r2.font.color.rgb = GREY

p3 = doc.add_paragraph(style='PropMeta')
p3.paragraph_format.space_before = Pt(0)
p3.paragraph_format.space_after  = Pt(3)
r3 = p3.add_run("Calidad institucional y desempeno exportador: una descomposicion shift-share y modelo de gravedad bilateral con indicadores WGI, 2015-2024")
r3.font.size = Pt(9); r3.font.italic = True; r3.font.color.rgb = GREY

p4 = doc.add_paragraph(style='PropMeta')
p4.paragraph_format.space_before = Pt(8)
r4 = p4.add_run("Version 1.0  |  Octubre 2026")
r4.font.size = Pt(9)

doc.add_page_break()

# Saltar la portada interna del markdown (# Portada / ## Proyecto... / ### Subtítulo / --- metadatos ---)
# para evitar duplicar título, subtítulo y metadatos ya puestos en la portada fija.
i = 0
while i < len(lines):
    s = lines[i].strip()
    if s.startswith('|') or (s.startswith('**') and ('investigador' in s or 'institución' in s)):
        i += 1
        continue
    # Buscar el primer --- tras los metadatos de portada
    if re.match(r'^---+$', s):
        i += 1; break
    i += 1

def md_strip(t):
    t = re.sub(r'\*\*(.+?)\*\*', r'\1', t)
    t = re.sub(r'\*(.+?)\*',       r'\1', t)
    t = re.sub(r'`(.+?)`',         r'\1', t)
    return t

while i < len(lines):
    line = lines[i].rstrip()
    s = line.strip()

    # Skip horizontal rules
    if re.match(r'^---+$', s):
        i += 1; continue

    # Tabla markdown
    if s.startswith('|'):
        rows = []
        cap = None
        j = i
        while j < len(lines) and lines[j].strip().startswith('|'):
            row = [c.strip() for c in lines[j].split('|')[1:-1]]
            if row and any(c for c in row):
                rows.append(row)
            j += 1
            if j < len(lines) and re.match(r'\|[\s\-:|]+\|', lines[j].strip()):
                j += 1
        if rows:
            col_count = len(rows[0])
            tbl = doc.add_table(rows=len(rows), cols=col_count)
            tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
            # Set column widths equally
            tbl.autofit = False
            width = (Cm(21.0) - Cm(2.8*2)) / col_count
            for row_idx, row_data in enumerate(rows):
                for col_idx, text in enumerate(row_data):
                    cell = tbl.rows[row_idx].cells[col_idx]
                    cell.width = width
                    p = cell.paragraphs[0]
                    p.paragraph_format.space_before = Pt(3)
                    p.paragraph_format.space_after  = Pt(3)
                    run = p.add_run(md_strip(text))
                    run.font.size = Pt(9)
                    if row_idx == 0:
                        set_cell_bg(cell, '1A3050')
                        run.font.bold = True
                        run.font.color.rgb = WHITE
                    else:
                        if row_idx % 2 == 0:
                            set_cell_bg(cell, 'F4F6FA')
                        else:
                            set_cell_bg(cell, 'FFFFFF')
            doc.add_paragraph().paragraph_format.space_after = Pt(4)
        i = j; continue

    # Empty line
    if not s:
        doc.add_paragraph().paragraph_format.space_after = Pt(2)
        i += 1; continue

    # H1 (# Title)
    if line.startswith('# '):
        p = doc.add_paragraph(style='Normal')
        p.paragraph_format.space_before = Pt(18)
        p.paragraph_format.space_after  = Pt(6)
        r = p.add_run(md_strip(s))
        r.font.size = Pt(16); r.font.bold = True; r.font.color.rgb = NAVY
        i += 1; continue

    # H2 (## Section)
    if line.startswith('## '):
        add_section_header(md_strip(s[3:].strip()))
        i += 1; continue

    # H3 (### Subsection)
    if line.startswith('### '):
        p = doc.add_paragraph(style='SubSecHdr')
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after  = Pt(3)
        r = p.add_run(md_strip(s[4:].strip()))
        r.font.size = Pt(10.5); r.font.bold = True; r.font.color.rgb = NAVY
        i += 1; continue

    # H4 (#### sub)
    if line.startswith('#### '):
        p = doc.add_paragraph(style='Body')
        r = p.add_run(md_strip(s[5:].strip()))
        r.font.bold = True
        i += 1; continue

    # Quote / block
    if s.startswith('>'):
        p = doc.add_paragraph(style='Body')
        p.paragraph_format.left_indent = Pt(20)
        r = p.add_run(md_strip(s.lstrip('> ')))
        r.font.italic = True
        i += 1; continue

    # Bullet
    if re.match(r'^\s*[-*]\s+', s):
        t = re.sub(r'^\s*[-*]\s+', '', s)
        bullet(md_strip(t))
        i += 1; continue

    # Ordered list (1. 2.)
    if re.match(r'^\d+\.\s+', s):
        t = re.sub(r'^\d+\.\s+', '', s)
        p = doc.add_paragraph(style='Bullet')
        p.paragraph_format.left_indent = Pt(20)
        p.paragraph_format.first_line_indent = Pt(-14)
        r = p.add_run(md_strip(t))
        i += 1; continue

    # Caption (italic lines starting *)
    if s.startswith('*') and not s.startswith('**'):
        p = doc.add_paragraph(style='Body')
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(md_strip(s))
        r.font.italic = True; r.font.size = Pt(8.5); r.font.color.rgb = GREY
        i += 1; continue

    # Normal paragraph
    p = doc.add_paragraph(style='Body')
    r = p.add_run(md_strip(s))
    i += 1

doc.save(str(OUTPUT))
print(f'DOCX: {OUTPUT}')
