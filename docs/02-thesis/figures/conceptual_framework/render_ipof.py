"""Figure 1.1, ASPIRE Conceptual Framework (IPOF). Input -> Process -> Output across the top;
Output -> Feedback (down, right) and Feedback -> Input (up, left) close the cycle.
Same grey look as the original Mermaid figure; SVG -> PNG via PyMuPDF.

Run: py render_ipof.py <out_dir>
"""
import io
import os
import sys
import textwrap
from xml.sax.saxutils import escape

OUT = sys.argv[1]
W = 1750
FONT = 'Arial, Helvetica, sans-serif'
COL_FILL, BOX_FILL, STROKE, LINE = '#F4F4F4', '#E1E1E1', '#6E6E6E', '#555555'

INPUT = ['Preliminary needs assessment', 'RRL/RRS and framework foundations', 'DYCI policies and COG templates',
         'Scores, attendance, and activity metadata', 'Stakeholder, role, and security requirements']
PROCESS = ['Five role-based portals and centralized Supabase data', 'COG-based grade computation and controlled posting',
           'Deterministic four-factor risk assessment', 'AI Study Advising and AI-assisted drafts (non-binding)',
           'Faculty-led intervention, task verification, and follow-up', 'Dean oversight and one-use correction authorization']
OUTPUT = ['Timely tentative and official grade views', 'Explainable risk priorities and advisories',
          'Faculty-approved intervention plans and tasks', 'Dean Risk and Honors Overview and intervention results',
          'Registrar academic catalog, enrollment, loading, and grade records',
          'Administrative configuration, activity, and audit records']
FEEDBACK = ['Controlled functional verification', 'TAM: PU and PEOU', 'ISO/IEC 25010:2023 evaluation']

s = []


def rect(x, y, w, h, fill, sw=3):
    s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{fill}" stroke="{STROKE}" stroke-width="{sw}"/>')


def text_block(cx, cy, label, size, bold=False, width_chars=26):
    lines = textwrap.wrap(label, width_chars)
    lh = size * 1.25
    y0 = cy - (len(lines) - 1) * lh / 2 + size * 0.35
    for i, l in enumerate(lines):
        s.append(f'<text x="{cx}" y="{y0 + i * lh:.1f}" font-family="{FONT}" font-size="{size}" '
                 f'font-weight="{"bold" if bold else "normal"}" text-anchor="middle" fill="#000">{escape(l)}</text>')


def arrow(x1, y1, x2, y2):
    s.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{LINE}" stroke-width="3.5"/>')
    if x1 == x2:
        d = 1 if y2 > y1 else -1
        pts = [(x2, y2), (x2 - 9, y2 - 16 * d), (x2 + 9, y2 - 16 * d)]
    else:
        d = 1 if x2 > x1 else -1
        pts = [(x2, y2), (x2 - 16 * d, y2 - 9), (x2 - 16 * d, y2 + 9)]
    s.append('<polygon points="' + ' '.join(f'{px},{py}' for px, py in pts) + f'" fill="{LINE}"/>')


TITLE_Y = 60
s.append(f'<text x="{W / 2}" y="{TITLE_Y}" font-family="{FONT}" font-size="50" font-weight="bold" '
         f'text-anchor="middle" fill="#000">ASPIRE CONCEPTUAL FRAMEWORK (IPOF)</text>')

COL_W, GAP, TOP = 494, 98, 100
cols_x = [30, 30 + COL_W + GAP, 30 + 2 * (COL_W + GAP)]
BOX_H, BOX_GAP, HEAD = 196, 18, 92
n_max = max(len(INPUT), len(PROCESS), len(OUTPUT))
col_h = HEAD + n_max * BOX_H + (n_max - 1) * BOX_GAP + 30
for x, (title, items) in zip(cols_x, (('INPUT', INPUT), ('PROCESS', PROCESS), ('OUTPUT', OUTPUT))):
    rect(x, TOP, COL_W, col_h, COL_FILL)
    text_block(x + COL_W / 2, TOP + 48, title, 44, True)
    # spread the boxes over the same height so the three columns line up
    avail = col_h - HEAD - 30
    h = (avail - (len(items) - 1) * BOX_GAP) / len(items)
    for i, it in enumerate(items):
        by = TOP + HEAD + i * (h + BOX_GAP)
        rect(x + 30, by, COL_W - 60, h, BOX_FILL)
        text_block(x + COL_W / 2, by + h / 2, it, 30)

mid_y = TOP + col_h / 2
arrow(cols_x[0] + COL_W + 6, mid_y, cols_x[1] - 8, mid_y)
arrow(cols_x[1] + COL_W + 6, mid_y, cols_x[2] - 8, mid_y)

FB_TOP = TOP + col_h + 90
FB_H = 300
FB_X, FB_W = 30, W - 60
rect(FB_X, FB_TOP, FB_W, FB_H, COL_FILL)
text_block(W / 2, FB_TOP + 50, 'FEEDBACK AND REFINEMENT', 44, True)
fw, fgap = 470, 50
fx0 = (W - (3 * fw + 2 * fgap)) / 2
for i, it in enumerate(FEEDBACK):
    bx = fx0 + i * (fw + fgap)
    rect(bx, FB_TOP + 100, fw, 140, BOX_FILL)
    text_block(bx + fw / 2, FB_TOP + 170, it, 33, True, 22)

out_cx = cols_x[2] + COL_W / 2
in_cx = cols_x[0] + COL_W / 2
arrow(out_cx, TOP + col_h + 6, out_cx, FB_TOP - 8)          # Output -> Feedback
arrow(in_cx, FB_TOP - 6, in_cx, TOP + col_h + 8)             # Feedback -> Input

H = FB_TOP + FB_H + 20
svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">'
       f'<rect width="100%" height="100%" fill="white"/>' + ''.join(s) + '</svg>')
os.makedirs(OUT, exist_ok=True)
base = os.path.join(OUT, 'Figure-1.1-Conceptual-Framework-IPOF')
io.open(base + '.svg', 'w', encoding='utf-8').write(svg)
import fitz
pm = fitz.open(base + '.svg')[0].get_pixmap(matrix=fitz.Matrix(1.25, 1.25), alpha=False)
pm.save(base + '.png')
print(pm.width, pm.height)
