"""Standalone Word file: every ERD figure with its caption and a description.
Run: py build_erd_docx.py <output.docx>
"""
import os
import struct
import sys

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt

import erd_text as T

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
MAXW, MAXH = 6.4, 8.2     # inches


def png_size(path):
    with open(path, 'rb') as f:
        b = f.read(24)
    return struct.unpack('>II', b[16:24])


doc = Document()
sec = doc.sections[0]
sec.left_margin = sec.right_margin = Inches(1)
sec.top_margin = sec.bottom_margin = Inches(0.9)
st = doc.styles['Normal']
st.font.name = 'Times New Roman'
st.font.size = Pt(12)
for name in ('Heading 1', 'Heading 2', 'Heading 3'):
    h = doc.styles[name]
    h.font.name = 'Times New Roman'
    h.font.color.rgb = None
    h.font.bold = True
doc.styles['Heading 1'].font.size = Pt(16)
doc.styles['Heading 2'].font.size = Pt(14)
doc.styles['Heading 3'].font.size = Pt(12)

doc.add_heading('ASPIRE Database Entity Relationship Diagrams', level=1)
p = doc.add_paragraph(T.intro())
p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

last_cat = None
for m in T.META:
    if m['cat_no'] != last_cat:
        last_cat = m['cat_no']
        doc.add_heading(f"{m['category']}", level=2)
    path = os.path.join(OUT, m['png'])
    w, h = png_size(path)
    s = min(MAXW / w, MAXH / h)
    pic = doc.add_paragraph()
    pic.alignment = WD_ALIGN_PARAGRAPH.CENTER
    pic.paragraph_format.keep_with_next = True
    pic.add_run().add_picture(path, width=Inches(w * s))
    cap = doc.add_paragraph()
    cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
    cap.paragraph_format.keep_with_next = True
    r = cap.add_run(m['caption'])
    r.italic = True
    d = doc.add_paragraph(T.describe(m))
    d.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    d.paragraph_format.space_after = Pt(14)

doc.save(sys.argv[1])
print('saved', sys.argv[1], len(T.META), 'figures')
