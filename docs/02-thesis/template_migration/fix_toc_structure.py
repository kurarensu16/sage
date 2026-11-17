"""Align the heading hierarchy with the capstone template TOC while keeping every
ASPIRE-specific section visible in a 4-level TOC. Confirmed in chat.

1. Proposed System moves under Logical Specifications (first sub-part) and drops a
   level; its five role sections drop a level.
2. Grading Engine Specification and Academic Risk Score Specification drop to H3
   under Logical Specifications; their children drop to H4.
3. Process Design, Visual Table of Contents, Database Design, User Interface Design
   drop to H3 under System Design; their children drop one level. The redundant
   "Data Flow Diagram" wrapper heading is removed (its intro paragraph stays under
   Process Design) so Existing/Proposed System DFDs sit at H4 and show in the TOC.
4. "Delimitation" -> "Delimitations" (template wording).
5. TOC field shows levels 1-4 instead of 1-3.
6. APPENDICES (H1) with Appendix A-K (H2), each with a yellow placeholder.

Run: py fix_toc_structure.py <in.docx> <out.docx> [--tracked]
"""
import copy
import sys
import zipfile
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
TRACKED = '--tracked' in sys.argv[3:]
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
AUTHOR, DATE = 'Claude Code', '2026-11-16T14:00:00Z'


class Ctx:
    def __init__(self):
        self.n = 109000

    def mark(self, tag):
        self.n += 1
        e = etree.Element(W + tag)
        e.set(W + 'id', str(self.n))
        e.set(W + 'author', AUTHOR)
        e.set(W + 'date', DATE)
        return e


ctx = Ctx()


def vis_text(p):
    return ''.join(t.text or '' for t in p.iter(W + 't')
                    if not any(a.tag == W + 'del' for a in t.iterancestors()))


def style(p):
    ppr = p.find(W + 'pPr')
    s = ppr.find(W + 'pStyle') if ppr is not None else None
    return s.get(W + 'val', '') if s is not None else ''


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
body = root.find(W + 'body')


def heading(text):
    hits = [p for p in body.iter(W + 'p') if style(p).startswith('Heading') and vis_text(p).strip() == text]
    assert len(hits) == 1, (text, len(hits))
    return hits[0]


def set_level(p, lvl):
    ppr = p.find(W + 'pPr')
    ps = ppr.find(W + 'pStyle')
    old = ps.get(W + 'val')
    new = 'Heading%d' % lvl
    if old == new:
        return
    if TRACKED and ppr.find(W + 'pPrChange') is None:
        snap = copy.deepcopy(ppr)
        for x in snap.findall(W + 'rPr') + snap.findall(W + 'sectPr'):
            snap.remove(x)
        ch = ctx.mark('pPrChange')
        ch.append(snap)
        ppr.append(ch)
    ps.set(W + 'val', new)


def shift_range(start, end_exclusive, delta):
    """Shift every heading between two body-level siblings by delta levels."""
    cur = start
    while cur is not None and cur is not end_exclusive:
        if cur.tag == W + 'p' and style(cur).startswith('Heading'):
            set_level(cur, int(style(cur)[7:]) + delta)
        cur = cur.getnext()


def capture_range(start, end_exclusive):
    els, cur = [], start
    while cur is not None and cur is not end_exclusive:
        els.append(cur)
        cur = cur.getnext()
    for e in els:
        body.remove(e)
    return els


def delete_paragraph(p):
    if not TRACKED:
        body.remove(p)
        return
    for r in [r for r in p.iter(W + 'r') if r.find(W + 't') is not None
              and not any(a.tag == W + 'del' for a in r.iterancestors())]:
        par = r.getparent()
        i = par.index(r)
        par.remove(r)
        d = ctx.mark('del')
        d.append(r)
        par.insert(i, d)
        for t in r.findall(W + 't'):
            t.tag = W + 'delText'
    ppr = p.find(W + 'pPr')
    rp = ppr.find(W + 'rPr')
    if rp is None:
        rp = etree.Element(W + 'rPr')
        ch = ppr.find(W + 'pPrChange')
        if ch is not None:
            ch.addprevious(rp)
        else:
            ppr.append(rp)
    for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
        rp.remove(x)
    rp.insert(0, ctx.mark('del'))


def retext(p, text):
    runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None
            and not any(a.tag == W + 'del' for a in r.iterancestors())]
    rpr = runs[0].find(W + 'rPr')
    rpr = copy.deepcopy(rpr) if rpr is not None else None
    if not TRACKED:
        runs[0].find(W + 't').text = text
        for r in runs[1:]:
            r.getparent().remove(r)
        return
    for r in runs:
        par = r.getparent()
        i = par.index(r)
        par.remove(r)
        d = ctx.mark('del')
        d.append(r)
        par.insert(i, d)
        for t in r.findall(W + 't'):
            t.tag = W + 'delText'
    ins = ctx.mark('ins')
    nr = etree.SubElement(ins, W + 'r')
    if rpr is not None:
        nr.append(rpr)
    t = etree.SubElement(nr, W + 't')
    t.text = text
    t.set(XML_SPACE, 'preserve')
    p.append(ins)


# ---------- 1-3. Re-level Logical Specifications and System Design ----------
proposed = heading('Proposed System')
logical = heading('Logical Specifications')
grading = heading('Grading Engine Specification')
physical = heading('Physical Specifications')
process = heading('Process Design')
dfd_wrap = heading('Data Flow Diagram')
sysimpl = heading('System Implementation')

shift_range(proposed, logical, +1)
shift_range(grading, physical, +1)
# Process Design .. UI Design: everything down one level, except the DFD branch below
# the wrapper, which keeps its level once the wrapper heading is gone.
existing_dfd = heading('Data Flow Diagram -- Existing System')
vtoc = heading('Visual Table of Contents')
shift_range(process, existing_dfd, +1)
shift_range(vtoc, sysimpl, +1)

block = capture_range(proposed, logical)
for e in block:
    grading.addprevious(e)

delete_paragraph(dfd_wrap)

# ---------- 4. Delimitations ----------
retext(heading('Delimitation'), 'Delimitations')

# ---------- 5. TOC depth 1-4 ----------
tocs = [x for x in root.iter(W + 'instrText') if (x.text or '').strip().startswith('TOC \\o "1-3"')]
assert len(tocs) == 1, len(tocs)
tocs[0].text = tocs[0].text.replace('\\o "1-3"', '\\o "1-4"')

# ---------- 6. Appendices ----------
refs = heading('References')
h2_model = heading('Recommendations')
body_model = h2_model.getnext()
while body_model.tag != W + 'p' or not vis_text(body_model).strip():
    body_model = body_model.getnext()


def clean_ppr(src):
    ppr = copy.deepcopy(src.find(W + 'pPr'))
    for x in ppr.findall(W + 'sectPr') + ppr.findall(W + 'pPrChange') + ppr.findall(W + 'numPr'):
        ppr.remove(x)
    rp = ppr.find(W + 'rPr')
    if rp is not None:
        for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
            rp.remove(x)
    return ppr


def run_rpr(src):
    for r in src.iter(W + 'r'):
        if r.find(W + 't') is not None and r.find(W + 'rPr') is not None:
            rp = copy.deepcopy(r.find(W + 'rPr'))
            for x in rp.findall(W + 'highlight'):
                rp.remove(x)
            return rp
    return etree.Element(W + 'rPr')


def new_para(model, text, page_break=False, yellow=False):
    p = etree.Element(W + 'p')
    ppr = clean_ppr(model)
    if page_break:
        # Schema order: pStyle, keepNext, keepLines, pageBreakBefore, ...
        pb = etree.Element(W + 'pageBreakBefore')
        if ppr.find(W + 'pageBreakBefore') is None:
            lead = [c for c in ppr if c.tag in (W + 'pStyle', W + 'keepNext', W + 'keepLines')]
            (lead[-1].addnext(pb) if lead else ppr.insert(0, pb))
    p.append(ppr)
    r = etree.Element(W + 'r')
    rp = run_rpr(model)
    if yellow:
        hl = etree.SubElement(rp, W + 'highlight')
        hl.set(W + 'val', 'yellow')
    r.append(rp)
    t = etree.SubElement(r, W + 't')
    t.text = text
    t.set(XML_SPACE, 'preserve')
    if TRACKED:
        rpm = ppr.find(W + 'rPr')
        if rpm is None:
            rpm = etree.SubElement(ppr, W + 'rPr')
        rpm.insert(0, ctx.mark('ins'))
        ins = ctx.mark('ins')
        ins.append(r)
        p.append(ins)
    else:
        p.append(r)
    return p


APPENDICES = [
    ('A', 'Respondents Letter', '[Insert the signed letter to respondents here.]'),
    ('B', 'Approval Letter', '[Insert the signed approval letter here.]'),
    ('C', 'Grammarian Certificate', '[Insert the grammarian certificate here.]'),
    ('D', 'ISO/IEC 25010:2023 Evaluation Tool',
     '[Insert the End-User and IT Expert ISO/IEC 25010:2023 questionnaires here.]'),
    ('E', 'Technology Acceptance Model', '[Insert the TAM questionnaire here.]'),
    ('F', 'Data Dictionary', '[Insert the data dictionary here.]'),
    ('G', 'Survey Questionnaire', '[Insert the survey questionnaire here.]'),
    ('H', 'Interview Guides', '[Insert the interview guides here.]'),
    ('I', 'Program Output', '[Insert program output screenshots here.]'),
    ('J', 'Source Code', '[Insert the source code (full or partial) here.]'),
    ('K', 'Curriculum Vitae', '[Insert each researcher\'s curriculum vitae here.]'),
]

new = [new_para(refs, 'APPENDICES', page_break=True)]
for letter, title, ph in APPENDICES:
    new.append(new_para(h2_model, 'Appendix %s. %s' % (letter, title), page_break=letter != 'A'))
    new.append(new_para(body_model, ph, yellow=True))

final_sect = body[-1]
assert final_sect.tag == W + 'sectPr'
for e in new:
    final_sect.addprevious(e)

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done, tracked=%s' % TRACKED)
