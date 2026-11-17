"""1. Figure 1.1 (IPOF) swapped for the redrawn figure: Output -> Feedback -> Input cycle; five
   portals; AI Study Advising; Registrar output box. (Image swaps are not tracked by Word.)
2. Chapter 2 tables renumbered 2.1, 2.2, ... in page order, with every "Table 2.x" mention in
   the document updated to match (tracked as a delete/insert of just the number in --tracked).
Confirmed in chat.

Run: py fix_ch2_tables_fig11.py <in.docx> <out.docx> <fig11.png> [--tracked]
"""
import copy
import re
import sys
import zipfile
from lxml import etree
import fitz

IN, OUT, FIG = sys.argv[1], sys.argv[2], sys.argv[3]
TRACKED = '--tracked' in sys.argv[4:]
WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W = '{%s}' % WNS
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
R_EMBED = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed'
A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
WP = '{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}'
AUTHOR, DATE = 'Claude Code', '2026-11-17T02:00:00Z'
N = [125000]


def mark(tag):
    N[0] += 1
    e = etree.Element(W + tag)
    e.set(W + 'id', str(N[0]))
    e.set(W + 'author', AUTHOR)
    e.set(W + 'date', DATE)
    return e


def live(e):
    return not any(a.tag == W + 'del' for a in e.iterancestors())


def vis_text(p):
    return ''.join(t.text or '' for t in p.iter(W + 't') if live(t))


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
body = root.find(W + 'body')

# ------------------------------------------------------------------ 1. Figure 1.1
cap = [p for p in body.iter(W + 'p') if vis_text(p).strip().startswith('Figure 1.1 | Conceptual Framework')]
assert len(cap) == 1
img_p = cap[0].getprevious()
while not list(img_p.iter(A + 'blip')):
    img_p = img_p.getprevious()
rid = next(img_p.iter(A + 'blip')).get(R_EMBED)
rels = files['word/_rels/document.xml.rels'].decode('utf8')
target = re.search(r'Target="([^"]+)"', re.search(r'<Relationship[^>]*Id="%s"[^>]*>' % rid, rels).group(0)).group(1)
png = open(FIG, 'rb').read()
files['word/' + target] = png
pm = fitz.Pixmap(png)
ext = next(img_p.iter(WP + 'extent'))
cx = int(ext.get('cx'))
cy = int(cx * pm.height / pm.width)
ext.set('cy', str(cy))
for a_ext in img_p.iter(A + 'ext'):
    if a_ext.get('cx') is not None:
        a_ext.set('cx', str(cx))
        a_ext.set('cy', str(cy))
print('Figure 1.1 ->', target, '%.2f x %.2f in' % (cx / 914400, cy / 914400))

# ------------------------------------------------------------------ 2. Table renumbering
order = []
for p in body.iter(W + 'p'):
    m = re.match(r'Table 2\.(\d+) \|', vis_text(p).strip())
    if m:
        order.append(int(m.group(1)))
assert len(order) == len(set(order)), order
mapping = {old: new for new, old in enumerate(order, 1)}
print('mapping (old->new):', {k: v for k, v in mapping.items() if k != v})
PAT = re.compile(r'Table(s?)(\s)2\.(\d+)\b')

# every mention must sit inside a single <w:t>, or a run-level edit would miss it
para_hits = sum(len(PAT.findall(vis_text(p))) for p in body.iter(W + 'p'))
t_hits = sum(len(PAT.findall(t.text or '')) for t in body.iter(W + 't') if live(t))
assert para_hits == t_hits, ('a reference is split across runs', para_hits, t_hits)
assert not re.search(r'Tables\s2\.\d+\s*(and|to|-)\s*2\.\d+', ' '.join(vis_text(p) for p in body.iter(W + 'p'))), 'range refs'

changed = 0
for t in [t for t in body.iter(W + 't') if live(t) and PAT.search(t.text or '')]:
    s = t.text
    if not any(mapping.get(int(m.group(3)), int(m.group(3))) != int(m.group(3)) for m in PAT.finditer(s)):
        continue
    r = t.getparent()
    if not TRACKED:
        t.text = PAT.sub(lambda m: 'Table%s%s2.%d' % (m.group(1), m.group(2), mapping.get(int(m.group(3)), int(m.group(3)))), s)
        changed += 1
        continue
    # tracked: rebuild the run as [text][del old number][ins new number][text]...
    rpr = r.find(W + 'rPr')
    # Keep any siblings of this <w:t> (page-break markers, other <w:t>) in runs of their own
    # on either side, so only the matched text is split.
    kids = [c for c in r if c.tag != W + 'rPr']
    ti = kids.index(t)
    for side, group in (('before', kids[:ti]), ('after', kids[ti + 1:])):
        if not group:
            continue
        xr = etree.Element(W + 'r')
        if rpr is not None:
            xr.append(copy.deepcopy(rpr))
        for c in group:
            xr.append(c)
        (r.addprevious(xr) if side == 'before' else r.addnext(xr))
    pieces, pos = [], 0
    for m in PAT.finditer(s):
        old, new = int(m.group(3)), mapping.get(int(m.group(3)), int(m.group(3)))
        num_start = m.start(3) - 2          # position of "2."
        pieces.append(('keep', s[pos:num_start + 2]))
        if old != new:
            pieces.append(('del', str(old)))
            pieces.append(('ins', str(new)))
        else:
            pieces.append(('keep', str(old)))
        pos = m.end(3)
    pieces.append(('keep', s[pos:]))
    parent, idx = r.getparent(), r.getparent().index(r)
    parent.remove(r)
    for kind, txt in pieces:
        if not txt:
            continue
        nr = etree.Element(W + 'r')
        if rpr is not None:
            nr.append(copy.deepcopy(rpr))
        te = etree.SubElement(nr, W + ('delText' if kind == 'del' else 't'))
        te.text = txt
        te.set(XML_SPACE, 'preserve')
        node = nr
        if kind in ('del', 'ins'):
            node = mark(kind)
            node.append(nr)
        parent.insert(idx, node)
        idx += 1
    changed += 1
print('runs changed:', changed)

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done, tracked=%s' % TRACKED)
