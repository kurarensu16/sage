"""Schedule Timeline and related fixes, from Capstone_Timeline.pdf. Confirmed in chat.

1. Table 2.13 rebuilt as the eight SDLC phases by half-month, numbered/colored by iteration
   (same data as Capstone_Timeline_SDLC.docx); intro and caption updated; iteration note added.
2. Appendix N placeholder points to the per-phase timeline document.
3. Instrument validity paragraph describes the actual process (3 validators, technical
   adviser approval, CREDO ethics certification); the unconfirmed pilot test is flagged.
4. Ethical Considerations gains an Ethical Approval paragraph.
New prose is highlighted yellow.

Run: py fix_schedule_timeline.py <in.docx> <out.docx> [--tracked]
"""
import copy
import sys
import zipfile
from xml.sax.saxutils import escape
from lxml import etree
from timeline_data import PHASES, COLUMNS, ITER_COLOR, phase_cell_iterations

IN, OUT = sys.argv[1], sys.argv[2]
TRACKED = '--tracked' in sys.argv[3:]
WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W = '{%s}' % WNS
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
AUTHOR, DATE = 'Claude Code', '2026-11-16T21:00:00Z'
FONT = 'Times New Roman'
N = [113000]


def mark(tag):
    N[0] += 1
    e = etree.Element(W + tag)
    e.set(W + 'id', str(N[0]))
    e.set(W + 'author', AUTHOR)
    e.set(W + 'date', DATE)
    return e


def vis_text(p):
    return ''.join(t.text or '' for t in p.iter(W + 't')
                    if not any(a.tag == W + 'del' for a in t.iterancestors()))


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
body = root.find(W + 'body')


def find_unique(snippet):
    hits = [p for p in body.iter(W + 'p') if snippet in vis_text(p)]
    assert len(hits) == 1, (snippet[:70], len(hits))
    return hits[0]


def mark_para_inserted(p):
    if not TRACKED:
        return
    ppr = p.find(W + 'pPr')
    if ppr is None:
        ppr = etree.Element(W + 'pPr')
        p.insert(0, ppr)
    rp = ppr.find(W + 'rPr')
    if rp is None:
        rp = etree.SubElement(ppr, W + 'rPr')
    rp.insert(0, mark('ins'))
    for r in [c for c in p if c.tag == W + 'r']:
        i = mark('ins')
        idx = p.index(r)
        p.remove(r)
        i.append(r)
        p.insert(idx, i)


def mark_para_deleted(p):
    for r in [r for r in p.iter(W + 'r') if not any(a.tag == W + 'del' for a in r.iterancestors())]:
        par = r.getparent()
        i = par.index(r)
        par.remove(r)
        d = mark('del')
        d.append(r)
        par.insert(i, d)
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
    rp.insert(0, mark('del'))


def retext(p, text, yellow=True, rpr_override=None):
    runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None
            and not any(a.tag == W + 'del' for a in r.iterancestors())]
    rpr = runs[0].find(W + 'rPr')
    rpr = copy.deepcopy(rpr) if rpr is not None else etree.Element(W + 'rPr')
    if rpr_override is not None:
        rpr = etree.fromstring('<w:root xmlns:w="%s">%s</w:root>' % (WNS, rpr_override))[0]
    for x in rpr.findall(W + 'b') + rpr.findall(W + 'highlight'):
        rpr.remove(x)
    if yellow:
        hl = etree.Element(W + 'highlight')
        hl.set(W + 'val', 'yellow')
        anchor = rpr.find(W + 'szCs') if rpr.find(W + 'szCs') is not None else rpr.find(W + 'sz')
        (anchor.addnext(hl) if anchor is not None else rpr.append(hl))
    for r in runs:
        if TRACKED:
            par = r.getparent()
            i = par.index(r)
            par.remove(r)
            d = mark('del')
            d.append(r)
            par.insert(i, d)
            for t in r.findall(W + 't'):
                t.tag = W + 'delText'
        else:
            r.getparent().remove(r)
    nr = etree.Element(W + 'r')
    nr.append(rpr)
    t = etree.SubElement(nr, W + 't')
    t.text = text
    t.set(XML_SPACE, 'preserve')
    if TRACKED:
        ins = mark('ins')
        ins.append(nr)
        p.append(ins)
    else:
        p.append(nr)


def rpr_xml(sz=24, bold=False, italic=False, yellow=False, color=None):
    return ('<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>%s%s%s<w:sz w:val="%d"/>'
            '<w:szCs w:val="%d"/>%s</w:rPr>' % (FONT, FONT, FONT, '<w:b/>' if bold else '',
                                               '<w:i/>' if italic else '',
                                               '<w:color w:val="%s"/>' % color if color else '', sz, sz,
                                               '<w:highlight w:val="yellow"/>' if yellow else ''))


def body_para(runs, yellow=True, indent=True):
    xml = ('<w:p xmlns:w="%s"><w:pPr><w:spacing w:after="160" w:line="480" w:lineRule="auto"/>%s'
           '<w:jc w:val="both"/>%s</w:pPr>%s</w:p>'
           % (WNS, '<w:ind w:firstLine="720"/>' if indent else '', rpr_xml(yellow=yellow),
              ''.join('<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>' % (rpr_xml(bold=b, yellow=yellow), escape(t))
                      for t, b in runs)))
    p = etree.fromstring(xml)
    mark_para_inserted(p)
    return p


# ---------------------------------------------------------------- 1. Table 2.13
intro = find_unique('Table 2.13 presents a sample development timeline')
old_tbl = intro.getnext()
assert old_tbl.tag == W + 'tbl'
caption = find_unique('Table 2.13 | Sample Development Timeline')

LABEL_W, COL_W = 1700, 420   # 1700 + 16 * 420 = 8420 <= 8468 text width
LINE = 'A6A6A6'


def cell(text, w, fill=None, span=1, jc='center', sz=16, bold=False, color=None):
    b = ''.join('<w:%s w:val="single" w:sz="4" w:space="0" w:color="%s"/>' % (s, LINE)
                for s in ('top', 'left', 'bottom', 'right'))
    return ('<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/>%s<w:tcBorders>%s</w:tcBorders>%s'
            '<w:tcMar><w:left w:w="%d" w:type="dxa"/><w:right w:w="%d" w:type="dxa"/></w:tcMar>'
            '<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20" w:line="240" '
            'w:lineRule="auto"/><w:jc w:val="%s"/>%s</w:pPr>%s</w:p></w:tc>'
            % (w * span, '<w:gridSpan w:val="%d"/>' % span if span > 1 else '', b,
               '<w:shd w:val="clear" w:color="auto" w:fill="%s"/>' % fill if fill else '',
               0 if fill and not span > 1 and jc == 'center' and text and len(text) < 4 else 60,
               0 if fill and not span > 1 and jc == 'center' and text and len(text) < 4 else 40,
               jc, rpr_xml(sz=sz),
               '<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>' % (rpr_xml(sz=sz, bold=bold, color=color), escape(text))
               if text else ''))


months, spans = [], []
for m, *_ in COLUMNS:
    if months and months[-1] == m:
        spans[-1] += 1
    else:
        months.append(m)
        spans.append(1)
rows = ['<w:tr><w:trPr><w:tblHeader/></w:trPr>%s%s</w:tr>' % (
            cell('SDLC Phase', LABEL_W, fill='F2F2F2', jc='left', sz=18, bold=True),
            ''.join(cell(m, COL_W, fill='F2F2F2', span=s, sz=16, bold=True) for m, s in zip(months, spans))),
        '<w:tr><w:trPr><w:tblHeader/></w:trPr>%s%s</w:tr>' % (
            cell('(2026)', LABEL_W, fill='F2F2F2', jc='left', sz=14),
            ''.join(cell(c[1], COL_W, fill='F2F2F2', sz=12) for c in COLUMNS))]
for phase, _ in PHASES:
    cs = cell(phase, LABEL_W, jc='left', sz=18)
    for col in COLUMNS:
        its = phase_cell_iterations(phase, col)
        cs += (cell('/'.join(map(str, its)), COL_W, fill=ITER_COLOR[its[-1]], sz=14, bold=True, color='FFFFFF')
               if its else cell('', COL_W))
    rows.append('<w:tr><w:trPr><w:cantSplit/></w:trPr>%s</w:tr>' % cs)
borders = ''.join('<w:%s w:val="single" w:sz="4" w:space="0" w:color="%s"/>' % (s, LINE)
                  for s in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'))
new_tbl = etree.fromstring(
    '<w:tbl xmlns:w="%s"><w:tblPr><w:tblW w:w="%d" w:type="dxa"/><w:jc w:val="center"/>'
    '<w:tblBorders>%s</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>%s</w:tblGrid>%s</w:tbl>'
    % (WNS, LABEL_W + COL_W * len(COLUMNS), borders,
       ''.join('<w:gridCol w:w="%d"/>' % w for w in [LABEL_W] + [COL_W] * len(COLUMNS)), ''.join(rows)))

if TRACKED:
    for tr in new_tbl.findall(W + 'tr'):
        for p in tr.iter(W + 'p'):
            mark_para_inserted(p)
        tr.find(W + 'trPr').append(mark('ins'))
    for tr in old_tbl.findall(W + 'tr'):
        for p in tr.iter(W + 'p'):
            mark_para_deleted(p)
        trpr = tr.find(W + 'trPr')
        if trpr is None:
            trpr = etree.Element(W + 'trPr')
            tr.insert(0, trpr)
        trpr.append(mark('del'))
    old_tbl.addnext(new_tbl)
else:
    old_tbl.addprevious(new_tbl)
    body.remove(old_tbl)

retext(intro, 'Table 2.13 presents the development timeline by SDLC phase across the three iterations of the '
              'Iterative and Incremental Model, from February to November 2026. Each shaded half-month shows when a '
              'phase was active, and its number gives the iteration; phases that recur, such as Implementation and '
              'Evaluation, show one bar per iteration. The activities under each phase, with their dates, are listed '
              'in Appendix N.')
retext(caption, 'Table 2.13 | Development Timeline by SDLC Phase and Iteration (Gantt Chart)', yellow=False,
       rpr_override=rpr_xml(italic=True))
caption.addnext(body_para([('Note. ', True), (
    'Iteration 1 (blue) is Capstone 1, February 2 to June 14; Iteration 2 (purple) is Capstone 2 from August 17 '
    'to the initial defense on November 1; Iteration 3 (green) runs from the initial defense on October 26 '
    'through the evaluation. A cell marked 2/3 holds work from both. Mid-June to mid-August (June 15 to '
    'August 16), the break between the capstones, is omitted.', False)], indent=False))

# ---------------------------------------------------------------- 2. Appendix N
retext(find_unique('[Insert the full Gantt chart here'),
       '[Insert the per-phase timeline (Capstone_Timeline_SDLC.docx) here: the overview by iteration, then each '
       'SDLC phase\'s activities and dates.]')

# ---------------------------------------------------------------- 3. Instrument validity
retext(find_unique('Content validity is established through review by an IT subject-matter expert'),
       'Content validity is established through review by three validators, who confirm that all items '
       'appropriately reflect ASPIRE\'s actual functionality. The instrument is revised from the initial-defense '
       'recommendations and approved by the technical adviser before use, and the study received ethics '
       'certification from the CREDO office before data collection. The instrument\'s internal consistency is '
       'assessed using Cronbach\'s alpha (Cronbach, 1951), computed with the assistance of a statistician.')

# ---------------------------------------------------------------- 3b. SDLC Phase 6: full-cycle testing
find_unique('Each increment is verified against its requirements before being integrated').addnext(body_para([(
    'After the major system update that followed the initial defense, the researchers ran eight full-cycle '
    'tests from November 2 to November 15, 2026, during the technical adviser consultations. Each cycle '
    'covered the complete workflow, from creating user accounts to rolling over an academic term, and each '
    'group member performed the tests across the five user roles. The tests used mock data rather than actual '
    'student records, because the Data Privacy Act of 2012 does not permit the use of real student grades for '
    'this purpose (Republic of the Philippines, 2012). Each cycle surfaced bugs and opportunities to optimize '
    'existing functionality, which were resolved before the next cycle; no features were added or changed as '
    'a result.', False)]))

# ---------------------------------------------------------------- 4. Ethical Approval
first_ethics = find_unique('Participation in the research is voluntary, with informed consent')
first_ethics.addprevious(body_para([('Ethical Approval. ', True), (
    'Before data collection, the study received ethics certification from the CREDO office of Dr. Yanga\'s '
    'Colleges, Inc., and approval letters to conduct the evaluation were obtained before any respondent was '
    'contacted (Appendix E).', False)]))

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done, tracked=%s' % TRACKED)
