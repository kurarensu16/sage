"""Highlight, in yellow, every section that still has pending content (yellow drafts,
[To complete], [Insert], [verify], sample values): both its heading in the body and its
line in the Table of Contents, matched through the TOC hyperlink's bookmark. Formatting
only; no text changes. A later "Update entire table" rebuilds the TOC and drops the TOC
highlights, but the body heading highlights stay.

Run: py highlight_pending.py <in.docx> <out.docx>
"""
import sys
import zipfile
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
MARKERS = ('[To complete', '[to complete', '[Insert', '[verify]', '[Verify', '[Sample', '[ ]',
           'Suggested (confirm', '[Not applicable')
EXTRA = {'Schedule Timeline'}  # sample month labels M1-M8, no marker text
# rPr children that must precede <w:highlight> (schema order)
BEFORE_HL = {W + t for t in ('rStyle', 'rFonts', 'b', 'bCs', 'i', 'iCs', 'caps', 'smallCaps', 'strike',
                             'dstrike', 'outline', 'shadow', 'emboss', 'imprint', 'noProof', 'snapToGrid',
                             'vanish', 'webHidden', 'color', 'spacing', 'w', 'kern', 'position', 'sz', 'szCs')}

zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
body = root.find(W + 'body')


def tx(e):
    return ''.join(t.text or '' for t in e.iter(W + 't'))


def style(p):
    ppr = p.find(W + 'pPr')
    s = ppr.find(W + 'pStyle') if ppr is not None else None
    return s.get(W + 'val', '') if s is not None else ''


def is_yellow(e):
    for r in e.iter(W + 'r'):
        rp = r.find(W + 'rPr')
        hl = rp.find(W + 'highlight') if rp is not None else None
        if hl is not None and hl.get(W + 'val') == 'yellow' and tx(r).strip():
            return True
    return False


def highlight_runs(p):
    for r in p.iter(W + 'r'):
        if not tx(r).strip() and r.find(W + 'tab') is None:
            continue
        rp = r.find(W + 'rPr')
        if rp is None:
            rp = etree.Element(W + 'rPr')
            r.insert(0, rp)
        hl = rp.find(W + 'highlight')
        if hl is None:
            hl = etree.Element(W + 'highlight')
            pos = 0
            for i, c in enumerate(rp):
                if c.tag in BEFORE_HL:
                    pos = i + 1
            rp.insert(pos, hl)
        hl.set(W + 'val', 'yellow')


# ---- find pending sections (deepest heading that directly holds pending content)
pending, stack, started = [], [], False
for e in body:
    if e.tag == W + 'p' and style(e).startswith('Heading'):
        name = tx(e).strip()
        if name == 'CHAPTER 1':
            started = True
        lvl = int(style(e)[7:])
        stack = [s for s in stack if s[0] < lvl] + [(lvl, e)]
        if started and (is_yellow(e) or name in EXTRA):
            pending.append(e)
        continue
    if started and stack and (is_yellow(e) or any(m in tx(e) for m in MARKERS)):
        pending.append(stack[-1][1])
seen, heads = set(), []
for h in pending:
    if id(h) not in seen:
        seen.add(id(h))
        heads.append(h)

# ---- TOC entries by hyperlink anchor
toc_by_anchor = {}
for p in body.iter(W + 'p'):
    if style(p).startswith('TOC') and style(p) != 'TOCHeading':
        for h in p.iter(W + 'hyperlink'):
            if h.get(W + 'anchor'):
                toc_by_anchor[h.get(W + 'anchor')] = p

missing = []
for h in heads:
    highlight_runs(h)
    anchors = [b.get(W + 'name') for b in h.iter(W + 'bookmarkStart') if (b.get(W + 'name') or '').startswith('_Toc')]
    prev = h.getprevious()
    while prev is not None and prev.tag == W + 'bookmarkStart':
        anchors.append(prev.get(W + 'name'))
        prev = prev.getprevious()
    entry = next((toc_by_anchor[a] for a in anchors if a in toc_by_anchor), None)
    if entry is None:
        missing.append(tx(h).strip())
    else:
        highlight_runs(entry)
    print('highlighted:', tx(h).strip(), '' if entry is not None else '(no TOC line found)')

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('sections:', len(heads), 'without TOC line:', missing)
