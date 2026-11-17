"""Reorder Chapter 2 to match the template's System Development Methodology sequence:
Requirements -> Proposed System -> Logical Specifications -> Physical Specifications ->
System Design (Process Design/DFDs, Visual Table of Contents, Database Design, User
Interface Design) -> System Implementation -> Tools and Technologies -> Schedule ->
Responsibilities -> Implementation Plan (absorbing System Maintenance's content,
since the template lists maintenance under Implementation Plan) -> Verification,
Validation and Testing -> Definition of Terms.

No content is added or removed except the now-redundant "System Maintenance" heading
itself (its one paragraph of content is kept, just relocated and un-headed). Headings
are NOT re-leveled -- Process Design/Database Design/User Interface Design keep their
current heading level, just physically regrouped and moved, consistent with "stay on
the current setup" rather than a deeper re-leveling that risks TOC/style side effects.
Pure relocation of already-existing content carries no tracked-changes marking of its
own (same precedent as earlier image/section moves this session); only the deleted
"System Maintenance" heading paragraph is marked as a tracked deletion in --tracked mode.

Run: py fix_ch2_reorder.py <in.docx> <out.docx> [--tracked]
"""
import sys
import zipfile
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
TRACKED = '--tracked' in sys.argv[3:]
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{%s}' % NS['w']
AUTHOR, DATE = 'Claude Code', '2026-11-16T12:00:00Z'


class Ctx:
    def __init__(self, tracked):
        self.tracked = tracked
        self.n = 105000

    def rid(self):
        self.n += 1
        return str(self.n)

    def mark(self, tag):
        e = etree.Element(W + tag)
        e.set(W + 'id', self.rid())
        e.set(W + 'author', AUTHOR)
        e.set(W + 'date', DATE)
        return e


ctx = Ctx(TRACKED)


def vis_text(p):
    return ''.join(t.text or '' for t in p.iter(W + 't')
                    if not any(a.tag == W + 'del' for a in t.iterancestors()))


def delete_paragraph(p):
    if not ctx.tracked:
        p.getparent().remove(p)
        return
    for r in [r for r in p.iter(W + 'r') if not any(a.tag == W + 'del' for a in r.iterancestors())
              and r.find(W + 't') is not None]:
        par = r.getparent()
        idx = par.index(r)
        par.remove(r)
        d = ctx.mark('del')
        d.append(r)
        par.insert(idx, d)
        for t_el in r.findall(W + 't'):
            t_el.tag = W + 'delText'
    ppr = p.find(W + 'pPr')
    if ppr is None:
        ppr = etree.Element(W + 'pPr')
        p.insert(0, ppr)
    rp = ppr.find(W + 'rPr')
    if rp is None:
        rp = etree.SubElement(ppr, W + 'rPr')
    for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
        rp.remove(x)
    rp.insert(0, ctx.mark('del'))


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
body = root.find(W + 'body')
all_p = list(root.iter(W + 'p'))


def heading(text):
    hits = [p for p in all_p if vis_text(p).strip() == text and
            (p.find(W + 'pPr') is not None and p.find(W + 'pPr').find(W + 'pStyle') is not None
             and p.find(W + 'pPr').find(W + 'pStyle').get(W + 'val', '').startswith('Heading'))]
    assert len(hits) == 1, (text, len(hits))
    return hits[0]


def capture_range(start_el, end_el_exclusive):
    """Remove and return, in order, every body-level sibling from start_el (inclusive)
    up to but excluding end_el_exclusive."""
    els = []
    cur = start_el
    while cur is not None and cur is not end_el_exclusive:
        nxt = cur.getnext()
        els.append(cur)
        cur = nxt
    for e in els:
        e.getparent().remove(e)
    return els


def insert_before(anchor, elements):
    for e in elements:
        anchor.addprevious(e)


# ============ Move 1: Logical Specifications + Physical Specifications block ==========
# currently sits AFTER System Design/Process Design; template wants it before.
logical_start = heading('Logical Specifications')
vtoc_heading = heading('Visual Table of Contents')
system_design_heading = heading('System Design')

block = capture_range(logical_start, vtoc_heading)
insert_before(system_design_heading, block)

# ============ Move 2: fold System Maintenance's content into Implementation Plan =======
# In --tracked mode the heading paragraph must stay in place (struck through), not be
# excised, so only its content siblings are captured and relocated; the heading itself
# is marked deleted afterward, still attached at its original position.
sysmaint_heading = heading('System Maintenance')
tools_heading = heading('Tools and Technologies Used')
vvt_heading = heading('Verification, Validation and Testing')

sysmaint_content = capture_range(sysmaint_heading.getnext(), tools_heading)
insert_before(vvt_heading, sysmaint_content)
if TRACKED:
    delete_paragraph(sysmaint_heading)
else:
    sysmaint_heading.getparent().remove(sysmaint_heading)

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done, tracked=%s' % TRACKED)
