"""Remove the ANOVA/t-test exclusion paragraph (reads as opinion rather than a plan,
and duplicates the existing Cronbach/ICC paragraph) and firm up that existing paragraph
into a direct commitment instead of a hedged "may be used if sufficient" one. Confirmed
in chat before this script was written.

Supports the same tracked/clean convention as the other fix_*.py scripts.
Run: py fix_concrete_stats.py <in.docx> <out.docx> [--tracked]
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
AUTHOR, DATE = 'Claude Code', '2026-11-14T18:00:00Z'


class Ctx:
    def __init__(self, tracked):
        self.tracked = tracked
        self.n = 103000

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
    for r in runs:
        par = r.getparent()
        pos = list(par).index(r)
        par.remove(r)
        d = ctx.mark('del')
        d.append(r)
        par.insert(pos, d)
        # A run can hold more than one <w:t> split by a page-break marker; every one
        # of them must become <w:delText>, not just the first .find() happens to hit.
        for t_el in r.findall(W + 't'):
            t_el.tag = W + 'delText'
    # The new run must be a direct child of the paragraph, never nested inside an
    # existing <w:ins>/<w:del> wrapper (e.g. when this whole paragraph was itself
    # inserted by an earlier pass) -- <w:ins> cannot legally contain another <w:ins>.
    ins = ctx.mark('ins')
    newr = etree.SubElement(ins, W + 'r')
    newr.append(copy.deepcopy(rpr))
    t = etree.SubElement(newr, W + 't')
    t.text = text
    t.set(XML_SPACE, 'preserve')
    p.append(ins)


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
        for t in r.findall(W + 't'):
            t.tag = W + 'delText'
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
all_p = list(root.iter(W + 'p'))


def find_unique(snippet):
    hits = [p for p in all_p if snippet in vis_text(p)]
    assert len(hits) == 1, (snippet[:70], len(hits))
    return hits[0]


# 1. Delete the ANOVA/t-test paragraph (opinionated, and duplicates the paragraph below it)
anova_para = find_unique("ASPIRE's evaluation therefore relies on descriptive and criterion-referenced")
delete_paragraph(anova_para)

# 2. Firm up the existing Cronbach/ICC paragraph into a direct commitment, no hedging
hedged = find_unique("Cronbach's alpha may be used to assess internal consistency")
old_full = vis_text(hedged)
new_full = old_full.replace(
    "Cronbach's alpha may be used to assess internal consistency where sufficient responses "
    "are available (Cronbach, 1951). Inter-rater agreement among IT experts may be analyzed "
    "using ICC if the achieved panel size is sufficient and the estimation method is "
    "appropriate (Koo & Li, 2016); neither coefficient is assumed in advance.",
    "Cronbach's alpha is computed to assess the internal consistency of the TAM and "
    "ISO/IEC 25010:2023 instruments (Cronbach, 1951). Inter-rater agreement among the IT "
    "expert panel is assessed using the intraclass correlation coefficient across the 36 "
    "Expert ISO/IEC 25010:2023 items (Koo & Li, 2016)."
)
assert new_full != old_full, 'hedged sentence not found verbatim'
retext(hedged, new_full)

# 3. Same pattern, second instance: drop the named-but-unused-tests clause (Wilcoxon,
# McNemar's) and the two citations that exist only to support it.
longitudinal = find_unique('Longitudinal inference about changes in academic standing')
old_long = vis_text(longitudinal)
new_long = old_long.replace(
    "Longitudinal inference about changes in academic standing is outside the scope of "
    "this artifact-verification dataset. Statistical procedures such as the Wilcoxon "
    "signed-rank test for paired GWA observations or McNemar's test for categorical risk "
    "transitions may be appropriate for a separate longitudinal evaluation, but they are "
    "not used in the present developmental evaluation (Field, 2018; Corder & Foreman, "
    "2014).",
    "Longitudinal inference about changes in academic standing is outside the scope of "
    "this artifact-verification dataset; the present developmental evaluation is limited "
    "to the paired baseline-and-follow-up comparison described above."
)
assert new_long != old_long, 'longitudinal sentence not found verbatim'
retext(longitudinal, new_long)

for ref_snippet in ("Corder, G. W., & Foreman, D. I. (2014)",
                     "Field, A. (2018). Discovering statistics"):
    ref_p = find_unique(ref_snippet)
    delete_paragraph(ref_p)

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done, tracked=%s' % TRACKED)
