"""Extend the Faculty Loading RRS paragraph (para 63) with the real, DYCI-specific finding
(loading responsibility has shifted from solely the Dean's/College Office to a current mix
of Registrar and Dean's Office, per follow-up inquiries with DYCI's Registrar's Office and
college Deans) plus Hartwick College as a verified external parallel, replacing the closing
"ASPIRE reflects this same division of authority" sentence with one that justifies the
interlocking, mutually exclusive access control design. Adds one new reference entry
(Hartwick College). All confirmed in chat before this script was written.

Supports the same tracked/clean convention as the other fix_*.py scripts.
Run: py fix_faculty_loading_dyci.py <in.docx> <out.docx> [--tracked]
"""
import copy
import sys
import zipfile
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
TRACKED = '--tracked' in sys.argv[3:]
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{%s}' % NS['w']
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
AUTHOR, DATE = 'Claude Code', '2026-11-11T12:00:00Z'


class Ctx:
    def __init__(self, tracked):
        self.tracked = tracked
        self.n = 97000

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


def base_rpr(p):
    for r in p.iter(W + 'r'):
        if r.find(W + 't') is not None:
            rp = r.find(W + 'rPr')
            return copy.deepcopy(rp) if rp is not None else etree.Element(W + 'rPr')
    return etree.Element(W + 'rPr')


def set_text(p, text):
    runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None]
    assert runs, vis_text(p)[:40]
    runs[0].find(W + 't').text = text
    runs[0].find(W + 't').set(XML_SPACE, 'preserve')
    for r in runs[1:]:
        r.getparent().remove(r)


def retext(p, text):
    if not ctx.tracked:
        set_text(p, text)
        return
    runs = [r for r in p.iter(W + 'r')
            if r.find(W + 't') is not None
            and not any(a.tag == W + 'del' for a in r.iterancestors())]
    assert runs, vis_text(p)[:40]
    rpr = base_rpr(p)
    last = runs[-1]
    idx_parent, idx = last.getparent(), list(last.getparent()).index(last)
    for r in runs:
        par = r.getparent()
        pos = list(par).index(r)
        par.remove(r)
        d = ctx.mark('del')
        d.append(r)
        par.insert(pos, d)
        r.find(W + 't').tag = W + 'delText'
    ins = ctx.mark('ins')
    newr = etree.SubElement(ins, W + 'r')
    newr.append(copy.deepcopy(rpr))
    t = etree.SubElement(newr, W + 't')
    t.text = text
    t.set(XML_SPACE, 'preserve')
    idx_parent.insert(idx + 1, ins)


def mark_para_inserted(p):
    if not ctx.tracked:
        return
    ppr = p.find(W + 'pPr')
    if ppr is None:
        ppr = etree.Element(W + 'pPr')
        p.insert(0, ppr)
    rp = ppr.find(W + 'rPr')
    if rp is None:
        rp = etree.SubElement(ppr, W + 'rPr')
    for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
        rp.remove(x)
    rp.insert(0, ctx.mark('ins'))
    for r in [c for c in p if c.tag == W + 'r']:
        i = ctx.mark('ins')
        idx = p.index(r)
        p.remove(r)
        i.append(r)
        p.insert(idx, i)


def new_para_like(template, text):
    p = etree.fromstring(etree.tostring(template))
    set_text(p, text)
    mark_para_inserted(p)
    return p


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
all_p = list(root.iter(W + 'p'))


def find_exact(snippet):
    hits = [p for p in all_p if vis_text(p).strip() == snippet]
    assert len(hits) == 1, (snippet[:70], len(hits))
    return hits[0]


def find_unique(snippet):
    hits = [p for p in all_p if snippet in vis_text(p)]
    assert len(hits) == 1, (snippet[:70], len(hits))
    return hits[0]


# ========== 1. Reference list: Hartwick College (alphabetical, before HRMO/Imundo range) ======
ref_hartwick = ("Hartwick College. (n.d.). Faculty course scheduling policy. Office of the "
                "Registrar. https://www.hartwick.edu/?p=71127")
google_ref = find_unique('Gemini 2.5 Flash. Vertex AI generative AI documentation')
google_ref.addnext(new_para_like(google_ref, ref_hartwick))

# ========== 2. Faculty Loading paragraph (para 63): replace the closing sentence ==============
para = find_unique('How this work is organizationally assigned also varies by institution')
old_close = ("ASPIRE reflects this same division of authority: Faculty Loading is scoped per "
             "college under the Dean, who works under an exclusive edit lock limited to their "
             "own college, while the Registrar's Enrollment and Loading module operates "
             "institution-wide, with full visibility of conflicts across every college.")
full = vis_text(para)
assert old_close in full, 'closing sentence not found verbatim'
new_close = (
    "Who holds this responsibility has also shifted within DYCI itself: follow-up inquiries "
    "with the Registrar's Office and several college Deans found that faculty loading was "
    "previously handled solely by the Dean's/College Office, while current practice is a mix "
    "of both the Registrar and the Dean's Office, with no single office consistently owning "
    "the task. This inconsistency is not unique to DYCI; other institutions document both "
    "offices holding a real stake in the same decision: at Hartwick College, department "
    "chairs supply instructor assignments, but the Registrar's Office can refuse a submitted "
    "schedule outright rather than simply recording it (Hartwick College, n.d.). ASPIRE's "
    "design reflects this same shared stake rather than resolving it by fiat: both the Dean "
    "and the Registrar can assign faculty loading, scoped per college, under an interlocking, "
    "mutually exclusive access control that lets whichever office is actually performing the "
    "task act without colliding with the other.")
retext(para, full.replace(old_close, new_close))

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done, tracked=%s' % TRACKED)
