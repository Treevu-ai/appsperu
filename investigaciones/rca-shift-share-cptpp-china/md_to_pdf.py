"""
Genera paper_wgi_competitividad_ENG_JOURNAL.pdf a partir del .md
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

INPUT  = Path(__file__).parent / "paper_wgi_competitividad_ENG_JOURNAL.md"
OUTPUT = Path(__file__).parent / "paper_wgi_competitividad_ENG_JOURNAL.pdf"

# ── Colores ─────────────────────────────────────────────────────────────────
NAVY    = colors.HexColor('#1a3050')
STEEL   = colors.HexColor('#2c5f8a')
LIGHT   = colors.HexColor('#e8f0f7')
GREY    = colors.HexColor('#555555')
LGREY   = colors.HexColor('#888888')
RULE    = colors.HexColor('#2c5f8a')
BLACK   = colors.HexColor('#111111')

# ── Estilos base ─────────────────────────────────────────────────────────────
ss = getSampleStyleSheet()

def style(name, **kw):
    s = ParagraphStyle(name, parent=ss['Normal'], **kw)
    return s

# Portada
title_s   = style('Title2',   fontSize=22, leading=28, textColor=NAVY,
                   alignment=TA_CENTER, fontName='Helvetica-Bold', spaceAfter=10)
subtitle_s= style('Sub',       fontSize=13, leading=18, textColor=STEEL,
                   alignment=TA_CENTER, fontName='Helvetica', spaceAfter=6)
meta_s    = style('Meta',      fontSize=10, leading=14, textColor=GREY,
                   alignment=TA_CENTER, fontName='Helvetica-Oblique', spaceAfter=4)

# Abstract
abstract_s= style('Abstract',  fontSize=10.5, leading=15, textColor=BLACK,
                   alignment=TA_JUSTIFY, fontName='Helvetica', spaceAfter=6,
                   leftIndent=18, rightIndent=18)

# Cuerpo
body_s    = style('Body',      fontSize=10.5, leading=15, textColor=BLACK,
                   alignment=TA_JUSTIFY, fontName='Helvetica', spaceAfter=7)
body_bold = style('BodyBold',  fontSize=10.5, leading=15, textColor=BLACK,
                   fontName='Helvetica-Bold', spaceAfter=4)

# Encabezados de sección
h1_s      = style('H1',       fontSize=13, leading=18, textColor=colors.white,
                   fontName='Helvetica-Bold', spaceBefore=16, spaceAfter=6,
                   backColor=NAVY, leftIndent=-12, rightIndent=-12,
                   borderPad=5)
h2_s      = style('H2',       fontSize=11, leading=15, textColor=NAVY,
                   fontName='Helvetica-Bold', spaceBefore=12, spaceAfter=4)
h3_s      = style('H3',       fontSize=10.5, leading=14, textColor=STEEL,
                   fontName='Helvetica-Bold', spaceBefore=8, spaceAfter=3)

# Listas
bullet_s  = style('Bullet',    fontSize=10.5, leading=15, textColor=BLACK,
                   fontName='Helvetica', leftIndent=22, firstLineIndent=-14,
                   spaceAfter=5, alignment=TA_JUSTIFY)

# Tablas
th_s      = style('TH',        fontSize=9, leading=12, textColor=colors.white,
                   fontName='Helvetica-Bold', alignment=TA_CENTER,
                   backColor=NAVY)
td_s      = style('TD',        fontSize=9, leading=12, textColor=BLACK,
                   fontName='Helvetica', alignment=TA_LEFT)
td_c      = style('TDC',       fontSize=9, leading=12, textColor=BLACK,
                   fontName='Helvetica', alignment=TA_CENTER)

# Footnote / caption
caption_s = style('Caption',   fontSize=8.5, leading=12, textColor=GREY,
                   fontName='Helvetica-Oblique', alignment=TA_CENTER,
                   spaceAfter=6, spaceBefore=2)
ref_s     = style('Ref',       fontSize=9.5, leading=14, textColor=BLACK,
                   fontName='Helvetica', leftIndent=18, firstLineIndent=-18,
                   spaceAfter=4, alignment=TA_JUSTIFY)

# Keywords
kw_s      = style('KW',        fontSize=10, leading=14, textColor=STEEL,
                   fontName='Helvetica', spaceAfter=4)

def hr(thick=0.5, color=LGREY):
    return HRFlowable(width='100%', thickness=thick, color=color,
                      spaceAfter=4, spaceBefore=4)

def rule(thick=1.5, color=RULE):
    return HRFlowable(width='100%', thickness=thick, color=color,
                      spaceAfter=6, spaceBefore=6)

# ── Parser del Markdown ──────────────────────────────────────────────────────
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
        col_count = len(rows[0])
        style_rows = [
            ('BACKGROUND', (0,0), (-1,0), NAVY),
            ('TEXTCOLOR', (0,0), (-1,0), colors.white),
            ('FONTNAME', (0,0), (-1,0), 'Helvetica-Bold'),
            ('FONTSIZE', (0,0), (-1,0), 9),
            ('ALIGN', (0,0), (-1,0), 'CENTER'),
            ('BOTTOMPADDING', (0,0), (-1,0), 5),
            ('TOPPADDING', (0,0), (-1,0), 5),
            ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, LIGHT]),
            ('FONTSIZE', (0,1), (-1,-1), 9),
            ('ALIGN', (1,1), (-1,-1), 'CENTER'),
            ('GRID', (0,0), (-1,-1), 0.3, LGREY),
            ('TOPPADDING', (0,1), (-1,-1), 4),
            ('BOTTOMPADDING', (0,1), (-1,-1), 4),
        ]
        tbl = Table([[Paragraph(c, th_s) if r == 0 else Paragraph(c, td_s)
                      for c in row] for r, row in enumerate(rows)],
                    colWidths=[None]*col_count)
        tbl.setStyle(TableStyle(style_rows))
        if cap:
            story.append(cp(cap))
        story.append(tbl)
        story.append(sp(0.3))
        table_rows = []; in_table = False; pending_caption = None

    while i < len(lines):
        line = lines[i].rstrip()

        # Tabla markdown
        if line.startswith('|'):
            in_table = True
            cells = [c.strip().strip('**').strip('*') for c in line.split('|')[1:-1]]
            table_rows.append(cells)
            i += 1
            # ¿separador?
            if i < len(lines) and re.match(r'\|[\s\-:|]+\|', lines[i]):
                i += 1  # skip separator
            continue
        else:
            if in_table:
                flush_table(table_rows, pending_caption)

        # Bloque de referencias
        if '## References' in line or line.strip().startswith('Acemoglu') or in_refs:
            if not in_refs and ('## References' in line or line.strip().startswith('Acemoglu')):
                if line.startswith('#'):
                    story.append(sp())
                    story.append(h1(line.lstrip('#').strip()))
                    story.append(rule())
                in_refs = True
                i += 1
                continue
            if in_refs:
                stripped = line.strip()
                if stripped == '' or stripped.startswith('---') or stripped.startswith('*Ackno'):
                    if ref_block:
                        story.append(p(' '.join(ref_block)))
                        ref_block = []
                    in_refs = False
                    i += 1
                    continue
                ref_block.append(stripped)
                i += 1
                continue

        # Skip horizontal rules
        if re.match(r'^---+$', line) or re.match(r'^\*\*\*+$', line):
            i += 1; continue

        # Portada
        if line.startswith('# '):
            story.append(sp(1.5))
            story.append(ps(line[2:], title_s))
            i += 1; continue
        if line.startswith('## ') and 'Abstract' not in line and 'INTRODUCTION' not in line.upper():
            story.append(sp())
            story.append(ps(line[3:].strip(), subtitle_s))
            i += 1; continue

        # Abstract
        if '## Abstract' in line or line.strip().startswith('**Abstract**'):
            in_abstract = True
            story.append(sp())
            story.append(h1('Abstract'))
            i += 1; continue
        if in_abstract and line.strip().startswith('**Keywords'):
            kw_line = line.replace('**Keywords:**', '').replace('**Keywords**', '').strip()
            parts = re.split(r'[,;:]', kw_line)
            story.append(sp(0.2))
            story.append(pb('Keywords:'))
            for pt in parts:
                pt = pt.strip().rstrip('.*')
                if pt:
                    story.append(kw(pt))
            story.append(rule())
            in_abstract = False
            i += 1; continue
        if in_abstract and line.strip() == '':
            in_abstract = False
            i += 1; continue
        if in_abstract and line.strip() and not line.startswith('#'):
            story.append(ps(line.strip(), abstract_s))
            i += 1; continue

        # JEL
        if 'JEL Classification' in line:
            story.append(p(line))
            i += 1; continue

        # Encabezados
        if line.startswith('## '):
            story.append(sp())
            story.append(h1(line[3:].strip()))
            story.append(rule())
            i += 1; continue
        if line.startswith('### '):
            story.append(sp(0.4))
            story.append(h2(line[4:].strip()))
            i += 1; continue
        if line.startswith('#### '):
            story.append(sp(0.3))
            story.append(h3(line[5:].strip()))
            i += 1; continue

        # Caption de tabla
        if line.strip().startswith('*Table') or line.strip().startswith('*Figure'):
            pending_caption = line.strip().strip('*')
            i += 1; continue

        # Listas
        if re.match(r'\s*[-*]\s+', line):
            text = re.sub(r'\s*[-*]\s+', '', line).strip()
            text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
            text = re.sub(r'\*(.*?)\*', r'<i>\1</i>', text)
            story.append(bul(text))
            i += 1; continue

        # Párrafo vacío
        if not line.strip():
            story.append(sp(0.2))
            i += 1; continue

        # Párrafo normal
        text = line
        text = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', text)
        text = re.sub(r'\*(.*?)\*', r'<i>\1</i>', text)
        text = re.sub(r'`(.*?)`', r'<font face="Courier">\1</font>', text)
        text = re.sub(r'\$([^$]+)\$', r'\1', text)
        text = re.sub(r'\^(\d+)', r'<sup>\1</sup>', text)
        story.append(p(text))
        i += 1

    return story

# ── Story ─────────────────────────────────────────────────────────────────────
with open(INPUT, encoding='utf-8') as fh:
    md = fh.read()

story = parse_md(md)

# ── PDF ──────────────────────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    str(OUTPUT),
    pagesize=A4,
    leftMargin=2.8*cm, rightMargin=2.8*cm,
    topMargin=2.5*cm, bottomMargin=2.5*cm,
    title="Institutional Quality and Peru's Export Performance",
    author="Academic Research Team — aplicaciones.pe",
)

def header_footer(canvas, doc):
    canvas.saveState()
    w, h = A4
    # Header line
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(2.8*cm, h - 2.0*cm, w - 2.8*cm, h - 2.0*cm)
    canvas.setFont('Helvetica', 8)
    canvas.setFillColor(LGREY)
    canvas.drawString(2.8*cm, h - 1.75*cm,
                      "Institutional Quality and Peru's Export Performance")
    canvas.drawRightString(w - 2.8*cm, h - 1.75*cm,
                           "aplicaciones.pe research platform")
    # Footer line
    canvas.line(2.8*cm, 2.2*cm, w - 2.8*cm, 2.2*cm)
    canvas.drawString(2.8*cm, 1.7*cm, "© 2026 Academic Research Team")
    canvas.drawCentredString(w/2, 1.7*cm, f"Page {doc.page}")
    canvas.drawRightString(w - 2.8*cm, 1.7*cm, "—")
    canvas.restoreState()

def first_page(canvas, doc):
    canvas.saveState()
    w, h = A4
    # Logo area
    canvas.setFillColor(NAVY)
    canvas.rect(0, h - 3.5*cm, w, 3.5*cm, fill=1, stroke=0)
    canvas.setFillColor(colors.white)
    canvas.setFont('Helvetica-Bold', 11)
    canvas.drawCentredString(w/2, h - 2.0*cm, "APLICACIONES.PE  |  RESEARCH PLATFORM")
    canvas.setFont('Helvetica', 9)
    canvas.drawCentredString(w/2, h - 2.5*cm, "Journal of International Trade and Development")
    # No regular header on first page
    canvas.restoreState()

def later_pages(canvas, doc):
    header_footer(canvas, doc)

doc.build(story, onFirstPage=first_page, onLaterPages=later_pages)
print(f'PDF written: {OUTPUT}')
