"""Re-swap just the 3 regenerated figure images (AI Model Provider label fixed: no more
"via OpenRouter") into an already-built docx, found by locating the picture that sits right
before each known caption -- same technique used for the original figure swaps.

Run: py swap_ai_label_figures.py <in.docx> <out.docx>
"""
import os
import re
import sys
import zipfile
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
NS = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
}
W = '{%s}' % NS['w']
R = '{%s}' % NS['r']
FIG_DIR = os.path.join(os.path.dirname(__file__), '..', 'figures', 'dfd_style', 'out')
TARGETS = [
    ('Figure 2.7 |', 'Figure-2.7-Proposed-Level0.png'),
    ('Figure 2.8 | Level 1 DFD: Student Portal (part 2 of 3)', 'Figure-2.8-Student-B.png'),
    ('Figure 2.9 | Level 1 DFD: Faculty Portal (part 3 of', 'Figure-2.9-Faculty-C.png'),
]


def vis_text(p):
    return ''.join(t.text or '' for t in p.iter(W + 't')
                    if not any(a.tag == W + 'del' for a in t.iterancestors()))


def png_size(path):
    import struct
    with open(path, 'rb') as f:
        b = f.read(24)
    return struct.unpack('>II', b[16:24])


MAXW, MAXH = 5376672, 6900000


def fit(w, h):
    s = min(MAXW / w, MAXH / h)
    return int(w * s), int(h * s)


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
rels_xml = files['word/_rels/document.xml.rels'].decode('utf-8')

all_p = list(root.iter(W + 'p'))
done = []
for caption_start, png_name in TARGETS:
    caps = [p for p in all_p if vis_text(p).strip().startswith(caption_start)]
    assert len(caps) == 1, (caption_start, len(caps))
    cap = caps[0]
    img_p = cap.getprevious()
    blips = list(img_p.iter('{%s}blip' % NS['a']))
    assert len(blips) == 1, caption_start
    rid = blips[0].get(R + 'embed')
    m = re.search(r'<Relationship[^>]*Id="%s"[^>]*Target="([^"]+)"' % rid, rels_xml)
    if not m:
        m = re.search(r'<Relationship[^>]*Target="([^"]+)"[^>]*Id="%s"' % rid, rels_xml)
    assert m, (caption_start, rid)
    media_path = 'word/' + m.group(1)
    new_bytes = open(os.path.join(FIG_DIR, png_name), 'rb').read()
    files[media_path] = new_bytes
    w, h = png_size(os.path.join(FIG_DIR, png_name))
    cx, cy = fit(w, h)
    for e in img_p.iter('{%s}extent' % NS['wp']):
        e.set('cx', str(cx))
        e.set('cy', str(cy))
    for e in img_p.iter('{%s}ext' % NS['a']):
        e.set('cx', str(cx))
        e.set('cy', str(cy))
    done.append((caption_start, media_path, png_name))

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)

for c, m, p in done:
    print('swapped', m, '<-', p, 'for caption', repr(c))
