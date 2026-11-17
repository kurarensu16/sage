"""Render the module-based Visual Table of Contents (Figure 2.13) as SVG + PNG, in two
parts. Tree: ASPIRE (0.0) -> modules (n.0) -> user roles (n.m) -> functions (n.m.k).
Rows of three modules hang from a trunk on the left; PNGs via PyMuPDF like dfdkit.

Run: py render_vtoc.py <out_dir>
"""
import io
import os
import sys
import textwrap
from xml.sax.saxutils import escape
from vtoc_data import MODULES, PARTS

OUT = sys.argv[1]
W = 1660
TRUNK, X0, GAP = 24, 56, 36
COL_W = (W - X0 - TRUNK - 2 * GAP) / 3
INK, LINE = '#000000', '#555555'
ROOT_FILL, MOD_FILL, ROLE_FILL = '#D4D4D4', '#E4E4E4', '#F4F4F4'
FONT = 'Arial, Helvetica, sans-serif'
H_FS, R_FS, F_FS = 25, 23, 21
H_LH, R_LH, F_LH = 31, 28, 26
ROLE_INDENT = 38


class SVG:
    def __init__(self):
        self.s = []
        self.maxy = 0

    def rect(self, x, y, w, h, fill, sw=1.6, stroke='#9A9A9A'):
        self.maxy = max(self.maxy, y + h)
        self.s.append(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="6" '
                      f'fill="{fill}" stroke="{stroke}" stroke-width="{sw}"/>')

    def line(self, x1, y1, x2, y2):
        self.s.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
                      f'stroke="{LINE}" stroke-width="2"/>')

    def text(self, x, y, t, size, bold=False, anchor='start'):
        self.s.append(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{FONT}" font-size="{size}" '
                      f'font-weight="{"bold" if bold else "normal"}" text-anchor="{anchor}" fill="{INK}">'
                      f'{escape(t)}</text>')

    def save(self, base, pad=24, scale=2):
        h = int(self.maxy + pad)
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{h}" viewBox="0 0 {W} {h}">'
               f'<rect width="100%" height="100%" fill="white"/>' + ''.join(self.s) + '</svg>')
        io.open(base + '.svg', 'w', encoding='utf-8').write(svg)
        import fitz
        pm = fitz.open(base + '.svg')[0].get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        pm.save(base + '.png')
        return pm.width, pm.height


def wrap(t, px, size):
    return textwrap.wrap(t, max(8, int(px / (size * 0.53)))) or ['']


def module_layout(num, name, roles):
    """Return (height, draw(svg, x, y)) for one module column."""
    head = wrap('%d.0  %s' % (num, name), COL_W - 24, H_FS)
    head_h = len(head) * H_LH + 18
    blocks = []
    for ri, (role, funcs) in enumerate(roles, 1):
        lines = []
        for fi, f in enumerate(funcs, 1):
            w = wrap('%d.%d.%d  %s' % (num, ri, fi, f), COL_W - ROLE_INDENT - 22, F_FS)
            lines += [w[0]] + ['        ' + z for z in w[1:]]
        h = 12 + R_LH + len(lines) * F_LH + 8
        blocks.append(('%d.%d  %s' % (num, ri, role), lines, h))
    total = head_h + sum(18 + b[2] for b in blocks)

    def draw(svg, x, y):
        svg.rect(x, y, COL_W, head_h, MOD_FILL, 1.8, '#8A8A8A')
        for i, l in enumerate(head):
            svg.text(x + COL_W / 2, y + 9 + H_FS + i * H_LH, l, H_FS, True, 'middle')
        spine_x, cy = x + 18, y + head_h
        last_mid = cy
        for title, lines, h in blocks:
            cy += 18
            bx = x + ROLE_INDENT
            svg.rect(bx, cy, COL_W - ROLE_INDENT, h, ROLE_FILL)
            svg.text(bx + 12, cy + 8 + R_FS, title, R_FS, True)
            for i, l in enumerate(lines):
                indent = 58 if l.startswith(' ') else 0   # SVG collapses leading spaces
                svg.text(bx + 14 + indent, cy + 12 + R_LH + F_FS - 4 + i * F_LH, l.strip(), F_FS)
            mid = cy + min(h / 2, 26)
            svg.line(spine_x, mid, bx, mid)
            last_mid = mid
            cy += h
        svg.line(spine_x, y + head_h, spine_x, last_mid)
    return total, draw


def render_part(idx, lo, hi):
    svg = SVG()
    root_w, root_h = 760, 104
    rx, ry = (W - root_w) / 2, 10
    svg.rect(rx, ry, root_w, root_h, ROOT_FILL, 2, '#8A8A8A')
    title = '0.0  ASPIRE' + ('' if idx == 0 else '  (continued)')
    svg.text(W / 2, ry + 38, title, 27, True, 'middle')
    svg.text(W / 2, ry + 68, 'Academic Support and Performance Advising', 21, False, 'middle')
    svg.text(W / 2, ry + 93, 'with Intervention, Risk, and Evaluation', 21, False, 'middle')

    cols_x = [X0 + c * (COL_W + GAP) for c in range(3)]
    mods = list(range(lo, hi))
    rows = [mods[i:i + 3] for i in range(0, len(mods), 3)]
    y = ry + root_h + 40           # first bus
    svg.line(W / 2, ry + root_h, W / 2, y)
    trunk_top = y
    for r, row in enumerate(rows):
        bus_y = y
        layouts = [module_layout(m + 1, *MODULES[m]) for m in row]
        centers = [cols_x[c] + COL_W / 2 for c in range(len(row))]
        svg.line(TRUNK, bus_y, max(centers[-1], W / 2 if r == 0 else 0), bus_y)
        for c, (hgt, draw) in enumerate(layouts):
            svg.line(centers[c], bus_y, centers[c], bus_y + 26)
            draw(svg, cols_x[c], bus_y + 26)
        y = bus_y + 26 + max(h for h, _ in layouts) + 44
        last_bus = bus_y
    svg.line(TRUNK, trunk_top, TRUNK, last_bus)
    return svg.save(os.path.join(OUT, 'Figure-2.13-VTOC-Module-part%d' % (idx + 1)))


os.makedirs(OUT, exist_ok=True)
for i, (lo, hi) in enumerate(PARTS):
    print('part', i + 1, render_part(i, lo, hi))
