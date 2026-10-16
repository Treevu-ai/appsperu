"""
Genera la propuesta de proyecto en PDF — formato profesional, blanco y negro
"""
import re
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable,
    Table, TableStyle
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY

INPUT  = Path(__file__).parent / "Propuesta-Proyecto-Gobernanza-Exportaciones.md"
OUTPUT = Path(__file__).parent / "Propuesta-Proyecto-Gobernanza-Exportaciones.pdf"

BLACK  = colors.HexColor('#000000')
DARK   = colors.HexColor('#1a1a1a')
GREY   = colors.HexColor('#555555')
LGREY  = colors.HexColor('#aaaaaa')
VLIGHT = colors.HexColor('#f4f4f4')
WHITE  = colors.white

ss = getSampleStyleSheet()
def sty(name, **kw): return ParagraphStyle(name, parent=ss['Normal'], **kw)

title_s   = sty('T',  fontSize=24, leading=30, textColor=BLACK, alignment=TA_CENTER, fontName='Helvetica-Bold', spaceAfter=8)
subtitle_s= sty('S',  fontSize=13, leading=18, textColor=GREY, alignment=TA_CENTER, fontName='Helvetica', spaceAfter=6)
meta_s    = sty('M',  fontSize=10, leading=14, textColor=GREY, alignment=TA_CENTER, fontName='Helvetica-Oblique', spaceAfter=4)
sec_s     = sty('H',  fontSize=12, leading=16, textColor=WHITE, fontName='Helvetica-Bold',
                  spaceBefore=14, spaceAfter=0, backColor=BLACK, leftIndent=-12, rightIndent=-12, borderPad=5)
subsec_s  = sty('SB', fontSize=10.5, leading=14, textColor=BLACK, fontName='Helvetica-Bold',
                  spaceBefore=10, spaceAfter=3)
body_s    = sty('B',  fontSize=10.5, leading=15, textColor=DARK, alignment=TA_JUSTIFY, fontName='Helvetica', spaceAfter=6)
bullet_s  = sty('BU', fontSize=10.5, leading=15, textColor=DARK, fontName='Helvetica',
                  leftIndent=20, firstLineIndent=-14, spaceAfter=4, alignment=TA_JUSTIFY)
ref_s     = sty('R',  fontSize=9.5, leading=14, textColor=DARK, fontName='Helvetica',
                  leftIndent=18, firstLineIndent=-18, spaceAfter=4, alignment=TA_JUSTIFY)
th_s      = sty('TH', fontSize=9, leading=12, textColor=WHITE, fontName='Helvetica-Bold',
                  alignment=TA_CENTER, backColor=BLACK)
td_s      = sty('TD', fontSize=9, leading=12, textColor=DARK, fontName='Helvetica', alignment=TA_LEFT)
cap_s     = sty('CP', fontSize=8.5, leading=12, textColor=GREY, fontName='Helvetica-Oblique',
                  alignment=TA_CENTER, spaceAfter=6, spaceBefore=2)

def rule(): return HRFlowable(width='100%', thickness=1.5, color=BLACK, spaceAfter=6, spaceBefore=2)
def sp(h=.3): return Spacer(1, h*cm)
def sec(t): return [sp(.3), Paragraph(t, sec_s), rule()]
def sub(t): return [sp(.3), Paragraph(t, subsec_s)]
def p(t):   return Paragraph(t, body_s)
def bul(t): return Paragraph('\u2022\u00a0' + t, bullet_s)
def ref(t): return Paragraph(t, ref_s)
def cp(t):  return Paragraph('*' + t + '*', cap_s)

def md_strip(t):
    """Strip markdown formatting to plain text."""
    t = re.sub(r'\*\*(.+?)\*\*', r'\1', t)
    t = re.sub(r'\*(.+?)\*', r'\1', t)
    t = re.sub(r'`(.+?)`', r'\1', t)
    return t

def parse_md(text):
    story = []
    lines = text.split('\n')
    i = 0
    in_refs = False
    ref_block = []
    table_rows = []
    in_table = False
    pending_cap = None

    def flush_table(rows, cap):
        nonlocal table_rows, in_table, pending_cap
        if not rows: table_rows=[]; in_table=False; pending_cap=None; return
        s = [
            ('BACKGROUND',(0,0),(-1,0),BLACK), ('TEXTCOLOR',(0,0),(-1,0),WHITE),
            ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'), ('FONTSIZE',(0,0),(-1,0),9),
            ('ALIGN',(0,0),(-1,0),'CENTER'), ('BOTTOMPADDING',(0,0),(-1,0),5),
            ('TOPPADDING',(0,0),(-1,0),5),
            ('ROWBACKGROUNDS',(0,1),(-1,-1),[WHITE,VLIGHT]),
            ('FONTSIZE',(0,1),(-1,-1),9), ('ALIGN',(1,1),(-1,-1),'CENTER'),
            ('GRID',(0,0),(-1,-1),0.3,LGREY),
            ('TOPPADDING',(0,1),(-1,-1),4), ('BOTTOMPADDING',(0,1),(-1,-1),4),
        ]
        tbl = Table([[Paragraph(c, th_s) if r==0 else Paragraph(c, td_s)
                      for c in row] for r,row in enumerate(rows)],
                    colWidths=[None]*len(rows[0]))
        tbl.setStyle(TableStyle(s))
        if cap: story.append(cp(cap))
        story.append(tbl); story.append(sp(.3))
        table_rows=[]; in_table=False; pending_cap=None

    while i < len(lines):
        line = lines[i].rstrip()

        if line.startswith('|'):
            in_table=True
            cells=[c.strip() for c in line.split('|')[1:-1]]
            table_rows.append(cells); i+=1
            if i<len(lines) and re.match(r'\|[\s\-:|]+\|', lines[i]): i+=1
            continue
        else:
            if in_table: flush_table(table_rows, pending_cap)

        s = line.strip()
        # Referencias
        is_ref = s.startswith('Acemoglu') or s.startswith('Anderson, J') or \
                 s.startswith('Abreo') or s.startswith('Volpe') or \
                 s.startswith('Wei') or s.startswith('Jaramillo') or \
                 s.startswith('De Groot') or s.startswith('Kaufmann') or \
                 s.startswith('Lederman') or s.startswith('Santos Silva') or \
                 s.startswith('Tinbergen') or s.startswith('Tyszynski') or \
                 s.startswith('Méon') or s.startswith('Riker') or \
                 s.startswith('Escobal') or s.startswith('Hasnain') or \
                 s.startswith('Mayer') or s.startswith('North')
        if is_ref or (in_refs and s and not s.startswith('#') and not s.startswith('---')):
            if not in_refs:
                in_refs=True; i+=1; continue
            if not s or s.startswith('---'):
                if ref_block: story.append(p(' '.join(ref_block))); ref_block=[]
                in_refs=False; i+=1; continue
            ref_block.append(s); i+=1; continue

        if re.match(r'^---+$', s) or re.match(r'^\*\*\*+$', s): i+=1; continue

        # Portada
        if line.startswith('# '):
            story.append(sp(1.5)); story.append(Paragraph(line[2:], title_s)); i+=1; continue
        if line.startswith('### '):
            story.append(sp()); story.append(Paragraph(line[4:].strip(), meta_s)); i+=1; continue

        # Encabezados
        if line.startswith('## '):
            t = line[3:].strip()
            if t in ('Referencias','Referencias principales'): i+=1; continue
            story += sec(t); i+=1; continue
        if line.startswith('### '):
            story += sub(line[4:].strip()); i+=1; continue
        if line.startswith('#### '):
            story.append(p('<b>' + md_strip(line[5:].strip()) + '</b>')); i+=1; continue

        # Caption
        if s.startswith('*Tabla') or s.startswith('*Nota'):
            pending_cap=s.strip('*'); i+=1; continue

        # Listas
        if re.match(r'\s*[-*]\s+', line):
            t = re.sub(r'\s*[-*]\s+', '', s)
            story.append(bul(md_strip(t))); i+=1; continue

        # Vacío
        if not s: story.append(sp(.2)); i+=1; continue

        # Normal
        story.append(Paragraph(md_strip(s), body_s)); i+=1

    return story

with open(INPUT, encoding='utf-8') as fh:
    md = fh.read()

story = parse_md(md)

doc = SimpleDocTemplate(
    str(OUTPUT), pagesize=A4,
    leftMargin=2.5*cm, rightMargin=2.5*cm,
    topMargin=2.5*cm, bottomMargin=2.5*cm,
    title="Propuesta: Gobernanza institucional y competitividad exportadora del Peru",
    author="Ricardo Antonio Cuba Alván — Rosa Patricia Larios Francia",
)

def first_page(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setFillColor(BLACK); canvas.rect(0, h-4.5*cm, w, 4.5*cm, fill=1, stroke=0)
    canvas.setFillColor(WHITE)
    canvas.setFont('Helvetica-Bold', 10)
    canvas.drawCentredString(w/2, h-1.7*cm, "PROPUESTA DE PROYECTO DE INVESTIGACION")
    canvas.setFont('Helvetica', 8)
    canvas.drawCentredString(w/2, h-2.3*cm, "Propuesta de proyecto de investigacion colaborativo")
    canvas.drawCentredString(w/2, h-2.8*cm, "Version octubre 2026")
    canvas.restoreState()

def later_pages(canvas, doc):
    canvas.saveState()
    w, h = A4
    canvas.setStrokeColor(BLACK); canvas.setLineWidth(.5)
    canvas.line(2.5*cm, h-1.8*cm, w-2.5*cm, h-1.8*cm)
    canvas.setFont('Helvetica', 8); canvas.setFillColor(GREY)
    canvas.drawString(2.5*cm, h-1.6*cm,
        "Propuesta: Gobernanza institucional y competitividad exportadora del Peru")
    canvas.drawRightString(w-2.5*cm, h-1.6*cm, "Version octubre 2026")
    canvas.line(2.5*cm, 2.0*cm, w-2.5*cm, 2.0*cm)
    canvas.drawString(2.5*cm, 1.5*cm, "2026 — Investigacion en curso")
    canvas.drawCentredString(w/2, 1.5*cm, f"Pagina {doc.page}")
    canvas.drawRightString(w-2.5*cm, 1.5*cm, "---")
    canvas.restoreState()

doc.build(story, onFirstPage=first_page, onLaterPages=later_pages)
print(f'PDF: {OUTPUT}')
