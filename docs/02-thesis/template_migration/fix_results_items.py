"""Chapter 3 Results and Discussion rebuilt per questionnaire item, approved in chat:
IT Expert and Non-IT Expert (End Users) reported as one set each (no per-role table).

  3.5  ISO/IEC 25010:2023 Results - IT Expert          (sub-characteristic | mean | interpretation)
  3.6  ISO/IEC 25010:2023 Compliance Summary - IT Expert (characteristic | mean | compliance % | interp.)
  3.7  ISO/IEC 25010:2023 Results - End Users
  3.8  ISO/IEC 25010:2023 Compliance Summary - End Users
  3.9  TAM Results - IT Expert                           (full statement | mean | interpretation)
  3.10 TAM Results - End Users
  Comparison matrix 3.8 -> 3.11; hypothesis drops the per-role sentence.

Items are read word for word from the two questionnaires. Values are yellow [ ] placeholders.

Run: py fix_results_items.py <in.docx> <out.docx> <expert_q.docx> <enduser_q.docx> [--tracked]
"""
import copy
import re
import sys
import zipfile
from xml.sax.saxutils import escape
from lxml import etree

IN, OUT, QX, QE = sys.argv[1:5]
TRACKED = '--tracked' in sys.argv[5:]
WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W = '{%s}' % WNS
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
AUTHOR, DATE = 'Claude Code', '2026-11-17T18:00:00Z'
FONT = 'Times New Roman'
N = [141000]
PH = '[ ]'


def mark(tag):
    N[0] += 1
    e = etree.Element(W + tag)
    e.set(W + 'id', str(N[0]))
    e.set(W + 'author', AUTHOR)
    e.set(W + 'date', DATE)
    return e


def live(e):
    return not any(a.tag == W + 'del' for a in e.iterancestors())


def vis_text(e):
    return ''.join(t.text or '' for t in e.iter(W + 't') if live(t))


def style(p):
    ppr = p.find(W + 'pPr')
    s = ppr.find(W + 'pStyle') if ppr is not None else None
    return s.get(W + 'val', '') if s is not None else ''


# ------------------------------------------------------------------ read the questionnaires
def read_q(path):
    body = etree.fromstring(zipfile.ZipFile(path).read('word/document.xml')).find(W + 'body')
    iso, tam, cur = [], [], None
    for tr in body.iter(W + 'tr'):
        cells = [' '.join(vis_text(c).split()) for c in tr.findall(W + 'tc')]
        cells = [c for c in cells if c]
        if not cells:
            continue
        m = re.match(r'^(\d)\. (PERCEIVED [A-Z ]+?) \((PU|PEOU)\)', cells[0])
        if m:
            cur = (tam, '%s (%s)' % (m.group(2).title().replace(' Of ', ' of '), m.group(3)), [])
            tam.append(cur[1:])
            continue
        m = re.match(r'^(\d)\. ([A-Z][A-Z ]+?) —', cells[0])
        if m:
            cur = (iso, m.group(2).title(), [])
            iso.append(cur[1:])
            continue
        if cur and re.match(r'^\d\.\d$', cells[0]):
            if cur[0] is iso:
                cur[2].append('%s %s' % (cells[0], cells[1]))
            else:
                cur[2].append('%s %s' % (cells[0], cells[1]))
    return iso, tam


ISO_X, TAM_X = read_q(QX)
ISO_E, TAM_E = read_q(QE)
assert [len(i) for _, i in ISO_X] == [4] * 9 and [len(i) for _, i in ISO_E] == [4] * 7, (ISO_X, ISO_E)
assert [len(i) for _, i in TAM_X] == [5, 5] and [len(i) for _, i in TAM_E] == [5, 5]

# ------------------------------------------------------------------ document helpers
zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
body = root.find(W + 'body')


def find(snippet, start=False):
    hits = [p for p in body.iter(W + 'p') if (vis_text(p).strip().startswith(snippet) if start else snippet in vis_text(p))]
    assert len(hits) == 1, (snippet[:60], len(hits))
    return hits[0]


def heading(text):
    hits = [p for p in body.iter(W + 'p') if style(p).startswith('Heading') and vis_text(p).strip() == text]
    assert len(hits) == 1, (text, len(hits))
    return hits[0]


def mark_para_inserted(p):
    if not TRACKED:
        return
    ppr = p.find(W + 'pPr')
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
    for r in [r for r in p.iter(W + 'r') if live(r)]:
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


def delete_element(e):
    if not TRACKED:
        e.getparent().remove(e)
        return
    if e.tag == W + 'p':
        mark_para_deleted(e)
        return
    for tr in e.findall(W + 'tr'):
        for p in tr.iter(W + 'p'):
            mark_para_deleted(p)
        trpr = tr.find(W + 'trPr')
        if trpr is None:
            trpr = etree.Element(W + 'trPr')
            tr.insert(0, trpr)
        trpr.append(mark('del'))


def rpr_xml(bold=False, yellow=False, sz=24, italic=False):
    return ('<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>%s%s<w:sz w:val="%d"/><w:szCs w:val="%d"/>%s</w:rPr>'
            % (FONT, FONT, FONT, '<w:b/>' if bold else '', '<w:i/>' if italic else '', sz, sz,
               '<w:highlight w:val="yellow"/>' if yellow else ''))


def para(text, yellow=True, italic=False, center=False, indent=True):
    p = etree.fromstring(
        '<w:p xmlns:w="%s"><w:pPr><w:spacing w:after="160" w:line="480" w:lineRule="auto"/>%s<w:jc w:val="%s"/>%s'
        '</w:pPr><w:r>%s<w:t xml:space="preserve">%s</w:t></w:r></w:p>'
        % (WNS, '<w:ind w:firstLine="720"/>' if indent else '', 'center' if center else 'both',
           rpr_xml(yellow=yellow, italic=italic), rpr_xml(yellow=yellow, italic=italic), escape(text)))
    mark_para_inserted(p)
    return p


def caption(text):
    return para(text, yellow=False, italic=True, center=True, indent=False)


def table(header, rows, widths):
    """rows: list of (cells, bold). Value cells (all but the first) are yellow placeholders."""
    b = ''.join('<w:%s w:val="single" w:sz="4" w:space="0" w:color="auto"/>' % s
                for s in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'))

    def cell(t, w, bold=False, yellow=False, center=False, shade=False):
        return ('<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/>%s<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr>'
                '<w:spacing w:before="20" w:after="20" w:line="240" w:lineRule="auto"/><w:jc w:val="%s"/>%s</w:pPr>'
                '<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r></w:p></w:tc>'
                % (w, '<w:shd w:val="clear" w:color="auto" w:fill="F2F2F2"/>' if shade else '',
                   'center' if center else 'left', rpr_xml(bold, yellow, 20), rpr_xml(bold, yellow, 20), escape(t)))
    trs = ['<w:tr><w:trPr><w:tblHeader/></w:trPr>%s</w:tr>' % ''.join(
        cell(h, w, True, center=i > 0, shade=True) for i, (h, w) in enumerate(zip(header, widths)))]
    for cells, bold in rows:
        trs.append('<w:tr><w:trPr><w:cantSplit/></w:trPr>%s</w:tr>' % ''.join(
            cell(c, w, bold, yellow=i > 0, center=i > 0, shade=bold) for i, (c, w) in enumerate(zip(cells, widths))))
    tbl = etree.fromstring('<w:tbl xmlns:w="%s"><w:tblPr><w:tblW w:w="%d" w:type="dxa"/><w:jc w:val="center"/>'
                           '<w:tblBorders>%s</w:tblBorders><w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>%s'
                           '</w:tblGrid>%s</w:tbl>' % (WNS, sum(widths), b,
                                                        ''.join('<w:gridCol w:w="%d"/>' % w for w in widths), ''.join(trs)))
    if TRACKED:
        for tr in tbl.findall(W + 'tr'):
            for p in tr.iter(W + 'p'):
                mark_para_inserted(p)
            tr.find(W + 'trPr').append(mark('ins'))
    return tbl


def replace_run(p, old, new):
    ts = [t for t in p.iter(W + 't') if live(t) and old in (t.text or '')]
    assert len(ts) == 1, (old, len(ts))
    t = ts[0]
    r = t.getparent()
    if not TRACKED:
        t.text = t.text.replace(old, new, 1)
        return
    rpr = r.find(W + 'rPr')
    kids = [c for c in r if c.tag != W + 'rPr']
    ti = kids.index(t)
    for side, group in (('before', kids[:ti]), ('after', kids[ti + 1:])):
        if group:
            xr = etree.Element(W + 'r')
            if rpr is not None:
                xr.append(copy.deepcopy(rpr))
            for c in group:
                xr.append(c)
            (r.addprevious(xr) if side == 'before' else r.addnext(xr))
    s = t.text
    a = s.index(old)
    parent, idx = r.getparent(), r.getparent().index(r)
    parent.remove(r)
    for kind, txt in (('keep', s[:a]), ('del', old), ('ins', new), ('keep', s[a + len(old):])):
        if not txt:
            continue
        nr = etree.Element(W + 'r')
        if rpr is not None:
            nr.append(copy.deepcopy(rpr))
        te = etree.SubElement(nr, W + ('delText' if kind == 'del' else 't'))
        te.text = txt
        te.set(XML_SPACE, 'preserve')
        node = nr
        if kind != 'keep':
            node = mark(kind)
            node.append(nr)
        parent.insert(idx, node)
        idx += 1


# ------------------------------------------------------------------ 1. remove the old 3.5-3.7 block
start = find('Table 3.5 | TAM Results by Respondent Group', start=True)
end = heading('Comparison with Related Systems')
old, cur = [], start
while cur is not end:
    old.append(cur)
    cur = cur.getnext()
assert len(old) == 9, [e.tag[-3:] for e in old]   # 3 x (caption, table, sample discussion)
for e in old:
    delete_element(e)

# ------------------------------------------------------------------ 2. build the new tables
ISO_W = [5400, 1300, 1700]
CMP_W = [3800, 1300, 1500, 1800]
TAM_W = [5900, 1000, 1500]


def iso_items(sections):
    rows = []
    for i, (name, items) in enumerate(sections, 1):
        rows.append((['%d. %s' % (i, name), PH, PH], True))
        rows += [(['    ' + it, PH, PH], False) for it in items]
    rows.append((['Overall Mean', PH, PH], True))
    return rows


def iso_summary(sections, overall):
    rows = [(['%d. %s' % (i, name), PH, PH, PH], False) for i, (name, _) in enumerate(sections, 1)]
    rows.append(([overall, PH, PH, PH], True))
    return rows


def tam_rows(constructs):
    rows = []
    for name, items in constructs:
        rows.append(([name, PH, PH], True))
        rows += [(['    ' + it, PH, PH], False) for it in items]
    rows.append((['Overall Mean', PH, PH], True))
    return rows


def disc(text):
    return para('[Discussion: %s Replace with your own computed values.]' % text)


new = [
    caption('Table 3.5 | ISO/IEC 25010:2023 Results — IT Expert'),
    table(['Quality Characteristic / Sub-characteristic', 'Mean', 'Interpretation'], iso_items(ISO_X), ISO_W),
    disc('summarize the IT experts\' ratings across the nine characteristics, naming the highest- and lowest-rated '
         'sub-characteristics and the overall mean.'),
    caption('Table 3.6 | ISO/IEC 25010:2023 Compliance Summary — IT Expert'),
    table(['Quality Characteristic', 'Mean', 'Compliance (%)', 'Interpretation'],
          iso_summary(ISO_X, 'Overall Expert Compliance (criterion: 80% / 3.20 mean)'), CMP_W),
    disc('state the overall expert compliance percentage and whether it meets the 80% (3.20-mean-equivalent) '
         'criterion stated in Chapter 2.'),
    caption('Table 3.7 | TAM Results — IT Expert'),
    table(['Statement', 'Mean', 'Interpretation'], tam_rows(TAM_X), TAM_W),
    disc('report the IT experts\' Perceived Usefulness and Perceived Ease of Use means against the 2.51 '
         'acceptability threshold.'),
    caption('Table 3.8 | ISO/IEC 25010:2023 Results — Non-IT Expert (End Users)'),
    table(['Quality Characteristic / Sub-characteristic', 'Mean', 'Interpretation'], iso_items(ISO_E), ISO_W),
    disc('summarize the end users\' ratings across the seven characteristics, naming the highest- and lowest-rated '
         'sub-characteristics and the overall mean.'),
    caption('Table 3.9 | ISO/IEC 25010:2023 Compliance Summary — Non-IT Expert (End Users)'),
    table(['Quality Characteristic', 'Mean', 'Compliance (%)', 'Interpretation'],
          iso_summary(ISO_E, 'Overall End-User Compliance'), CMP_W),
    disc('report the overall end-user compliance percentage and the characteristics with the highest and lowest '
         'compliance.'),
    caption('Table 3.10 | TAM Results — Non-IT Expert (End Users)'),
    table(['Statement', 'Mean', 'Interpretation'], tam_rows(TAM_E), TAM_W),
    disc('report the end users\' Perceived Usefulness and Perceived Ease of Use means, all five roles combined, '
         'against the 2.51 acceptability threshold.'),
]
for e in new:
    end.addprevious(e)

# ------------------------------------------------------------------ 3. renumber comparison, hypothesis
replace_run(find('Table 3.8 compares ASPIRE with five related systems'), 'Table 3.8', 'Table 3.11')
replace_run(find('Table 3.8 | Comparison Matrix', start=True), 'Table 3.8', 'Table 3.11')
hp = find('The means of each individual role are reported descriptively in Chapter 3.')
replace_run(hp, ' The means of each individual role are reported descriptively in Chapter 3.', '') \
    if TRACKED else replace_run(hp, ' The means of each individual role are reported descriptively in Chapter 3.', '')

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('ISO expert:', [n for n, _ in ISO_X])
print('ISO end-user:', [n for n, _ in ISO_E])
print('TAM:', [n for n, _ in TAM_X])
print('done, tracked=%s' % TRACKED)
