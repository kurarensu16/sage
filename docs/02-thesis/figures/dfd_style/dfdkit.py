"""Yourdon-style DFD drawing kit that copies the Essence Derm Booking Management
documentation look: pale-yellow boxes, black outlines, numbered process boxes,
grey-tabbed data stores, straight directed arrows with bulleted flow lists.

Every flow is a separate directed arrow (entity->process, process->entity,
process->store, store->process), which is what a correct DFD requires.
Renders SVG, then PNG through PyMuPDF (py -m pip install pymupdf).
"""
import io
import math
import textwrap
from xml.sax.saxutils import escape

YELLOW = '#FFFCB4'
GREY = '#D9D9D9'
INK = '#111111'
FS = 24
LH = 31
NL = chr(10)
FONT = 'Arial, Helvetica, sans-serif'


class Fig:
    def __init__(self, w):
        self.w = w
        self.s = []
        self.maxy = 0

    def _t(self, y):
        self.maxy = max(self.maxy, y)

    def text(self, x, y, t, size=FS, bold=False, anchor='start', italic=False):
        self._t(y + 8)
        self.s.append(
            f'<text x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" '
            f'font-weight="{"bold" if bold else "normal"}" '
            f'font-style="{"italic" if italic else "normal"}" '
            f'text-anchor="{anchor}" fill="{INK}">{escape(t)}</text>')

    def lines(self, cx, cy, lines, size=FS, bold=True, lh=None):
        lh = lh or size * 1.25
        y0 = cy - (len(lines) - 1) * lh / 2 + size * 0.35
        for i, l in enumerate(lines):
            self.text(cx, y0 + i * lh, l, size, bold, 'middle')

    def entity(self, x, y, w, h, label):
        self._t(y + h)
        self.s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="{YELLOW}" stroke="{INK}" stroke-width="3"/>')
        self.lines(x + w / 2, y + h / 2, label.split('\n'), 26, True)

    def process(self, x, y, w, h, num, label):
        self._t(y + h)
        tab, band = 60, 24
        self.s.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="20" fill="{YELLOW}" stroke="{INK}" stroke-width="3"/>')
        self.s.append(f'<line x1="{x}" y1="{y+band}" x2="{x+w}" y2="{y+band}" stroke="{INK}" stroke-width="3"/>')
        self.s.append(f'<line x1="{x}" y1="{y+h-band}" x2="{x+w}" y2="{y+h-band}" stroke="{INK}" stroke-width="3"/>')
        self.s.append(f'<line x1="{x+tab}" y1="{y}" x2="{x+tab}" y2="{y+band}" stroke="{INK}" stroke-width="3"/>')
        self.text(x + tab / 2, y + band - 5, num, 18, True, 'middle')
        self.lines(x + w / 2, y + h / 2, label.split('\n'), 28, True)

    def store(self, x, y, w, h, sid, label, tab=70):
        self._t(y + h)
        self.s.append(f'<rect x="{x}" y="{y}" width="{tab}" height="{h}" fill="{GREY}" stroke="{INK}" stroke-width="3"/>')
        self.s.append(f'<rect x="{x+tab}" y="{y}" width="{w-tab}" height="{h}" fill="{YELLOW}" stroke="{INK}" stroke-width="3"/>')
        self.text(x + tab / 2, y + h / 2 + 7, sid, 22, True, 'middle')
        self.lines(x + tab + (w - tab) / 2, y + h / 2, label.split('\n'), 22, True)

    def arrow(self, x1, y1, x2, y2, w=3):
        self._t(max(y1, y2) + 4)
        self.s.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{INK}" stroke-width="{w}"/>')
        a = math.atan2(y2 - y1, x2 - x1)
        L, sp = 16, 0.42
        p = [(x2, y2),
             (x2 - L * math.cos(a - sp), y2 - L * math.sin(a - sp)),
             (x2 - L * math.cos(a + sp), y2 - L * math.sin(a + sp))]
        self.s.append('<polygon points="' + ' '.join(f'{px:.1f},{py:.1f}' for px, py in p) + f'" fill="{INK}"/>')

    def bullets(self, x, y_anchor, items, width_chars, up=True, anchor='start'):
        """Bulleted list above (up=True) or below the anchor y."""
        rows = []
        for it in items:
            w = textwrap.wrap(it, width_chars) or ['']
            rows.append('• ' + w[0])
            rows += ['   ' + z for z in w[1:]]
        n = len(rows)
        top = (y_anchor - 12 - n * LH + LH * 0.8) if up else (y_anchor + 14 + LH * 0.8)
        for i, r in enumerate(rows):
            self.text(x, top + i * LH, r, FS, False, anchor)
        return n

    def save(self, path_svg, path_png, pad=20, scale=1.6):
        h = int(self.maxy + pad)
        svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{h}" viewBox="0 0 {self.w} {h}">'
               f'<rect width="100%" height="100%" fill="white"/>' + ''.join(self.s) + '</svg>')
        io.open(path_svg, 'w', encoding='utf-8').write(svg)
        import fitz
        d = fitz.open(path_svg)
        pm = d[0].get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False)
        pm.save(path_png)
        return pm.width, pm.height


def wrapn(items, width_chars):
    return sum(len(textwrap.wrap(i, width_chars)) or 1 for i in items)


def context(path_base, sysnum, sysname, left, right, W=1800, BW=320, PW=420, store=None):
    """left/right: lists of dict(name, to_sys[list], from_sys[list]).
    to_sys = flows entity -> system, from_sys = flows system -> entity."""
    wc = 25

    def rowh(col):
        return [(wrapn(e['to_sys'], wc) + wrapn(e['from_sys'], wc)) * LH + 300 for e in col]

    lr = rowh(left)
    rr = rowh(right) if right else [0]
    ph = max(sum(lr), sum(rr), 360)
    fig = Fig(W)
    px, top = (W - PW) // 2, 40
    fig.process(px, top, PW, ph, sysnum, sysname)

    def draw(col, rh, side):
        y = top
        extra = (ph - sum(rh)) / len(col)
        for e, h in zip(col, rh):
            h += extra
            cy = y + h / 2
            y += h
            ya, yb = cy - 40, cy + 40
            ex = 30 if side == 'L' else W - 30 - BW
            fig.entity(ex, cy - 45, BW, 90, e['name'])
            if side == 'L':
                x0, x1 = ex + BW, px
                if e['to_sys']:
                    fig.arrow(x0, ya, x1, ya)
                if e['from_sys']:
                    fig.arrow(x1, yb, x0, yb)
            else:
                x0, x1 = px + PW, ex
                if e['to_sys']:
                    fig.arrow(x1, ya, x0, ya)
                if e['from_sys']:
                    fig.arrow(x0, yb, x1, yb)
            fig.bullets(x0 + 18, ya, e['to_sys'], wc, up=True)
            fig.bullets(x0 + 18, yb, e['from_sys'], wc, up=False)

    draw(left, lr, 'L')
    if right:
        draw(right, rr, 'R')
    elif store:
        sid, sl = store
        sy, sx = top + ph / 2 - 50, W - 30 - 330
        fig.store(sx, sy, 330, 100, sid, sl)
        x0 = px + PW
        fig.arrow(x0, sy + 28, sx, sy + 28)
        fig.arrow(sx, sy + 72, x0, sy + 72)
    return fig.save(path_base + '.svg', path_base + '.png')


# ---------------------------------------------------------------- Level 1 ----
def _human(n):
    return n.replace('_', ' ').title() if '_' in n else n


def _lbl(mode_verb, label):
    return mode_verb + ' ' + label[0].lower() + label[1:] if label[:2].upper() != label[:2] else mode_verb + ' ' + label


def level1(path_base, entity, modules, chunk_h=2550, W=1780):
    """modules: list of dict(num, name, ins[], outs[], stores[]).
    stores: (id, name, label, mode) with mode r (store->process), w (process->store), rw (both),
            or ('X', name, label_to_ext, label_from_ext) for an external box.
    Returns list of (png_path, w, h); bands never split across images."""
    wc_e, wc_s = 28, 26
    BW, PW, SW = 220, 320, 380
    ex, px = 30, 30 + 220 + 390
    sx = px + PW + 370
    bands = []
    for m in modules:
        rows = []
        for st in m['stores']:
            if st[0] == 'X':
                n = max(wrapn([st[2]], wc_s), wrapn([st[3]], wc_s)) if st[2] and st[3] else wrapn([st[2] or st[3]], wc_s)
                rows.append(('X', st, (wrapn([st[2]], wc_s) if st[2] else 0) + (wrapn([st[3]], wc_s) if st[3] else 0) + 3))
            else:
                mode = st[3]
                if mode == 'rw':
                    n = wrapn([_lbl('Save', st[2])], wc_s) + wrapn([_lbl('Retrieve', st[2])], wc_s)
                    rows.append(('S', st, n + 4.4))
                else:
                    n = wrapn([_lbl('Save' if mode == 'w' else 'Retrieve', st[2])], wc_s)
                    rows.append(('S', st, n + 3.2))
        sh = sum(r[2] * LH for r in rows)
        eh = (wrapn(m['ins'], wc_e) + wrapn(m['outs'], wc_e)) * LH + 130
        H = max(sh, eh, 190) + 30
        bands.append((m, rows, H))
    # chunking
    chunks, cur, acc = [], [], 0
    for b in bands:
        if cur and acc + b[2] + 50 > chunk_h:
            chunks.append(cur); cur, acc = [], 0
        cur.append(b); acc += b[2] + 50
    chunks.append(cur)
    outs = []
    for ci, ch in enumerate(chunks):
        fig = Fig(W)
        y = 30
        for m, rows, H in ch:
            cy = y + H / 2
            fig.process(px, y, PW, H, m['num'], m['name'].replace('|', '\n'))
            fig.entity(ex, cy - 45, BW, 90, entity)
            ya, yb = cy - 40, cy + 40
            if m['ins']:
                fig.arrow(ex + BW, ya, px, ya)
                fig.bullets(ex + BW + 14, ya, m['ins'], wc_e, up=True)
            if m['outs']:
                fig.arrow(px, yb, ex + BW, yb)
                fig.bullets(ex + BW + 14, yb, m['outs'], wc_e, up=False)
            # stores column, vertically centred on the band
            sh = sum(r[2] * LH for r in rows)
            ry = cy - sh / 2
            for kind, st, rh in rows:
                rc = ry + rh * LH / 2
                if kind == 'X':
                    fig.entity(sx, rc - 40, SW, 80, st[1])
                    ya2, yb2 = rc - 22, rc + 22
                    if st[2]:
                        fig.arrow(px + PW, ya2, sx, ya2)
                        fig.bullets(px + PW + 14, ya2 - 4, [st[2]], wc_s, up=True)
                    if st[3]:
                        fig.arrow(sx, yb2, px + PW, yb2)
                        fig.bullets(px + PW + 14, yb2 + 4, [st[3]], wc_s, up=False)
                else:
                    fig.store(sx, rc - 42, SW, 84, st[0], NL.join(textwrap.wrap(_human(st[1]), 22)))
                    mode = st[3]
                    if mode == 'rw':
                        a, b = rc - 22, rc + 22
                        fig.arrow(px + PW, a, sx, a)
                        fig.bullets(px + PW + 14, a - 4, [_lbl('Save', st[2])], wc_s, up=True)
                        fig.arrow(sx, b, px + PW, b)
                        fig.bullets(px + PW + 14, b + 4, [_lbl('Retrieve', st[2])], wc_s, up=False)
                    elif mode == 'w':
                        fig.arrow(px + PW, rc, sx, rc)
                        fig.bullets(px + PW + 14, rc - 4, [_lbl('Save', st[2])], wc_s, up=True)
                    else:
                        fig.arrow(sx, rc, px + PW, rc)
                        fig.bullets(px + PW + 14, rc - 4, [_lbl('Retrieve', st[2])], wc_s, up=True)
                ry += rh * LH
            y += H + 50
        suffix = '' if len(chunks) == 1 else '-' + 'ABCDEFG'[ci]
        w, h = fig.save(path_base + suffix + '.svg', path_base + suffix + '.png')
        outs.append((path_base + suffix + '.png', w, h))
    return outs
