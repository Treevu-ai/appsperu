"""
Genera paper_wgi_competitividad_ES.pdf — versión en blanco y negro
"""
import re
from pathlib import Path
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable,
    Table, TableStyle, PageBreak, KeepTogether
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY, TA_RIGHT

INPUT  = Path(__file__).parent / "paper_wgi_competitividad_ES.md"
OUTPUT = Path(__file__).parent / "paper_wgi_competitividad_ES.pdf"

# ── Paleta blanco y negro ───────────────────────────────────────────────────
BLACK   = colors.HexColor('#000000')
DARK    = colors.HexColor('#222222')
GREY    = colors.HexColor('#555555')
LGREY   = colors.HexColor('#aaaaaa')
VLIGHT  = colors.HexColor('#f0f0f0')
WHITE   = colors.white

# ── Estilos base ─────────────────────────────────────────────────────────────
ss = getSampleStyleSheet()

def sty(name, **kw):
    return ParagraphStyle(name, parent=ss['Normal'], **kw)

# Portada
title_s    = sty('Title2', fontSize=22, leading=28, textColor=BLACK,
                  alignment=TA_CENTER, fontName='Helvetica-Bold', spaceAfter=10)
subtitle_s = sty('Sub',    fontSize=12, leading=17, textColor=GREY,
                  alignment=TA_CENTER, fontName='Helvetica', spaceAfter=6)
meta_s     = sty('Meta',   fontSize=10, leading=14, textColor=GREY,
                  alignment=TA_CENTER, fontName='Helvetica-Oblique', spaceAfter=4)

# Abstract / Keywords
abstract_s = sty('Abstract', fontSize=10.5, leading=15, textColor=DARK,
                  alignment=TA_JUSTIFY, fontName='Helvetica', spaceAfter=6,
                  leftIndent=18, rightIndent=18)
kw_s       = sty('KW',     fontSize=10,  leading=14, textColor=GREY,
                  fontName='Helvetica', spaceAfter=4, leftIndent=20, firstLineIndent=-14)

# Cuerpo
body_s     = sty('Body',   fontSize=10.5, leading=15, textColor=DARK,
                  alignment=TA_JUSTIFY, fontName='Helvetica', spaceAfter=7)
body_bold  = sty('BBold',  fontSize=10.5, leading=15, textColor=BLACK,
                  fontName='Helvetica-Bold', spaceAfter=4)

# Encabezados
h1_s       = sty('H1',    fontSize=13, leading=18, textColor=WHITE,
                  fontName='Helvetica-Bold', spaceBefore=16, spaceAfter=6,
                  backColor=BLACK, leftIndent=-12, rightIndent=-12, borderPad=5)
h2_s       = sty('H2',    fontSize=11, leading=15, textColor=BLACK,
                  fontName='Helvetica-Bold', spaceBefore=12, spaceAfter=4,
                  borderPadding=(0, 0, 2, 0))
h3_s       = sty('H3',    fontSize=10.5, leading=14, textColor=GREY,
                  fontName='Helvetica-Bold', spaceBefore=8, spaceAfter=3)

# Listas
bullet_s    = sty('Bullet', fontSize=10.5, leading=15, textColor=DARK,
                  fontName='Helvetica', leftIndent=22, firstLineIndent=-14,
                  spaceAfter=5, alignment=TA_JUSTIFY)

# Tablas
th_s       = sty('TH',    fontSize=9, leading=12, textColor=WHITE,
                  fontName='Helvetica-Bold', alignment=TA_CENTER, backColor=BLACK)
td_s       = sty('TD',    fontSize=9, leading=12, textColor=DARK,
                  fontName='Helvetica', alignment=TA_LEFT)
caption_s   = sty('Cap',   fontSize=8.5, leading=12, textColor=GREY,
                  fontName='Helvetica-Oblique', alignment=TA_CENTER,
                  spaceAfter=6, spaceBefore=2)

def hr(thick=0.5, color=LGREY):
    return HRFlowable(width='100%', thickness=thick, color=color,
                      spaceAfter=4, spaceBefore=4)

def rule(thick=1.5, color=BLACK):
    return HRFlowable(width='100%', thickness=thick, color=color,
                      spaceAfter=6, spaceBefore=6)

def p(text): return Paragraph(text, body_s)
def pb(text): return Paragraph(text, body_bold)
def ps(text, st): return Paragraph(text, st)
def bul(text): return Paragraph(f'\u2022\u00a0{text}', bullet_s)
def h1(text): return Paragraph(text, h1_s)
def h2(text): return Paragraph(text, h2_s)
def h3(text): return Paragraph(text, h3_s)
def sp(h=0.4): return Spacer(1, h * cm)
def cp(text): return Paragraph(f'*{text}*', caption_s)
def kw(text): return Paragraph(f'\u2022\u00a0{text}', kw_s)

# ── Parser Markdown ────────────────────────────────────────────────────────────
def parse_md(text):
    story = []
    lines = text.split('\n')
    i = 0
    in_abstract = False
    in_refs = False
    ref_block = []
    table_rows = []
    in_table = False
    pending_caption = None

    def flush_table(rows, cap):
        nonlocal table_rows, in_table, pending_caption
        if not rows:
            table_rows = []; in_table = False; pending_caption = None; return
        style_rows = [
            ('BACKGROUND', (0,0), (-1,0), BLACK),
            ('TEXTCOLOR',  (0,0), (-1,0), WHITE),
            ('FONTNAME',   (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE',   (0,0), (-1,0), 9),
            ('ALIGN',      (0,0), (-1,0), 'CENTER'),
            ('BOTTOMPADDING',(0,0),(-1,0), 5),
            ('TOPPADDING', (0,0), (-1,0), 5),
            ('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE, VLIGHT]),
            ('FONTSIZE',   (0,1), (-1,-1), 9),
            ('ALIGN',      (1,1), (-1,-1), 'CENTER'),
            ('GRID',       (0,0), (-1,-1), 0.3, LGREY),
            ('TOPPADDING', (0,1), (-1,-1), 4),
            ('BOTTOMPADDING',(0,1),(-1,-1), 4),
        ]
        tbl = Table([[Paragraph(c, th_s) if r==0 else Paragraph(c, td_s)
                      for c in row] for r,row in enumerate(rows)],
                    colWidths=[None]*len(rows[0]))
        tbl.setStyle(TableStyle(style_rows))
        if cap: story.append(cp(cap))
        story.append(tbl); story.append(sp(0.3))
        table_rows = []; in_table = False; pending_caption = None

    while i < len(lines):
        line = lines[i].rstrip()

        # Tabla
        if line.startswith('|'):
            in_table = True
            cells = [c.strip().strip('**').strip('*') for c in line.split('|')[1:-1]]
            table_rows.append(cells)
            i += 1
            if i < len(lines) and re.match(r'\|[\s\-:|]+\|', lines[i]):
                i += 1
            continue
        else:
            if in_table:
                flush_table(table_rows, pending_caption)

        # Referencias
        stripped = line.strip()
        if '## Referencias' in line or stripped.startswith('Acemoglu') or (
            in_refs and stripped and not stripped.startswith('#')
        ):
            if not in_refs and (stripped.startswith('Acemoglu') or
                                  '## Referencias' in line):
                if line.startswith('#'):
                    story.append(sp()); story.append(h1(line.lstrip('#').strip())); story.append(rule())
                in_refs = True; i += 1; continue
            if in_refs:
                if stripped == '' or stripped.startswith('---') or stripped.startswith('*Reconoc'):
                    if ref_block:
                        story.append(p(' '.join(ref_block))); ref_block = []
                    in_refs = False; i += 1; continue
                ref_block.append(stripped)
            i += 1; continue

        # Skip HRs
        if re.match(r'^---+$', stripped) or re.match(r'^\*\*\*+$', stripped):
            i += 1; continue

        # Portada
        if line.startswith('# '):
            story.append(sp(1.5)); story.append(ps(line[2:], title_s)); i += 1; continue
        if line.startswith('## ') and 'Resumen' not in line and 'INTRODU' not in line.upper():
            story.append(sp()); story.append(ps(line[3:].strip(), subtitle_s)); i += 1; continue

        # Abstract
        if '## Resumen' in line:
            in_abstract = True; story.append(sp()); story.append(h1('Resumen')); i += 1; continue
        if in_abstract and stripped.startswith('**Palabras clave'):
            kw_line = stripped.replace('**Palabras clave:**','').replace('**Palabras clave**','').strip()
            parts = re.split(r'[,;:]', kw_line)
            story.append(sp(0.2)); story.append(pb('Palabras clave:'))
            for pt in parts:
                pt = pt.strip().rstrip('.*')
                if pt: story.append(kw(pt))
            story.append(rule()); in_abstract = False; i += 1; continue
        if in_abstract and stripped == '':
            in_abstract = False; i += 1; continue
        if in_abstract and stripped and not stripped.startswith('#'):
            story.append(ps(stripped, abstract_s)); i += 1; continue

        # Clasificación JEL
        if 'Clasificación JEL' in line:
            story.append(p(line)); i += 1; continue

        # Encabezados
        if line.startswith('## '):
            story.append(sp()); story.append(h1(line[3:].strip())); story.append(rule()); i += 1; continue
        if line.startswith('### '):
            story.append(sp(0.4)); story.append(h2(line[4:].strip())); i += 1; continue
        if line.startswith('#### '):
            story.append(sp(0.3)); story.append(h3(line[5:].strip())); i += 1; continue

        # Caption
        if stripped.startswith('*Tabla') or stripped.startswith('*Figura'):
            pending_caption = stripped.strip('*'); i += 1; continue

        # Listas
        if re.match(r'\s*[-*]\s+', line):
            text = re.sub(r'\s*[-*]\s+', '', stripped)
            text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
            text = re.sub(r'\*(.*?)\*', r'<i>\1</i>', text)
            story.append(bul(text)); i += 1; continue

        # Vacío
        if not stripped:
            story.append(sp(0.2)); i += 1; continue

        # Normal
        text = stripped
        text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
        text = re.sub(r'\*(.*?)\*', r'<i>\1</i>', text)
        text = re.sub(r'`(.*?)`', r'<font face="Courier">\1</font>', text)
        text = re.sub(r'\$([^$]+)\$', r'\1', text)
        text = re.sub(r'\^(\d+)', r'<sup>\1</sup>', text)
        story.append(p(text)); i += 1

    return story

# ── Build ─────────────────────────────────────────────────────────────────────
with open(INPUT, encoding='utf-8') as fh:
    md = fh.read()

story = parse_md(md)

doc = SimpleDocTemplate(
    str(OUTPUT), pagesize=A4,
    leftMargin=2.8*cm, rightMargin=2.8*cm,
    topMargin=2.5*cm, bottomMargin=2.5*cm,
    title="Calidad Institucional y Desempeño Exportador del Perú",
    author="Equipo de Investigación",
)

def first_page(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(BLACK)
    canvas.rect(0, h - 3.5*cm, w, 3.5*cm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont('Helvetica-Bold', 11)
    canvas.drawCentredString(w/2, h - 2.0*cm, "DOCUMENTO DE INVESTIGACION")
    canvas.setFont('Helvetica', 9)
    canvas.drawCentredString(w/2, h - 2.5*cm, "Revista de Comercio Internacional y Desarrollo")
    canvas.restoreState()

def later_pages(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setStrokeColor(BLACK); canvas.setLineWidth(0.5)
    canvas.line(2.8*cm, h - 2.0*cm, w - 2.8*cm, h - 2.0*cm)
    canvas.setFont('Helvetica', 8); canvas.setFillColor(GREY)
    canvas.drawString(2.8*cm, h - 1.75*cm,
        "Calidad Institucional y Desempeno Exportador del Peru")
    canvas.drawRightString(w - 2.8*cm, h - 1.75*cm, "Documento de trabajo")
    canvas.line(2.8*cm, 2.2*cm, w - 2.8*cm, 2.2*cm)
    canvas.drawString(2.8*cm, 1.7*cm, "2026 Equipo de Investigacion Academica")
    canvas.drawCentredString(w/2, 1.7*cm, f"Pagina {doc.page}")
    canvas.drawRightString(w - 2.8*cm, 1.7*cm, "---")
    canvas.restoreState()

doc.build(story, onFirstPage=first_page, onLaterPages=later_pages)
print(f'PDF escrito: {OUTPUT}')
