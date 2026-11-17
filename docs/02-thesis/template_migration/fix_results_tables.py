"""Insert the Chapter 3 Results and Discussion tables (TAM by respondent group, ISO
compliance for End-User and Expert tracks) as a fill-in template, with sample numbers
modeling the raw-total -> mean -> percentage/interpretation conversion, all highlighted
yellow. Confirmed in chat before this script was written.

Supports the same tracked/clean convention as the other fix_*.py scripts.
Run: py fix_results_tables.py <in.docx> <out.docx> [--tracked]
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
AUTHOR, DATE = 'Claude Code', '2026-11-14T12:00:00Z'
FONT = 'Times New Roman'


class Ctx:
    def __init__(self, tracked):
        self.tracked = tracked
        self.n = 101000

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


def mark_table_inserted(tbl):
    if not ctx.tracked:
        return
    for tr in tbl.findall(W + 'tr'):
        for tc in tr.findall(W + 'tc'):
            for p in tc.findall(W + 'p'):
                mark_para_inserted(p)
        trpr = tr.find(W + 'trPr')
        if trpr is None:
            trpr = etree.Element(W + 'trPr')
            tr.insert(0, trpr)
        trpr.append(ctx.mark('ins'))


def caption_para(text):
    xml = (f'<w:p xmlns:w="{NS["w"]}"><w:pPr><w:spacing w:after="160" w:line="480" '
           f'w:lineRule="auto"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="{FONT}" '
           f'w:hAnsi="{FONT}" w:cs="{FONT}"/><w:i/><w:sz w:val="24"/><w:szCs w:val="24"/>'
           f'</w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" '
           f'w:cs="{FONT}"/><w:i/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'
           f'<w:t xml:space="preserve">{text}</w:t></w:r></w:p>')
    p = etree.fromstring(xml)
    mark_para_inserted(p)
    return p


def plain_para(text):
    xml = (f'<w:p xmlns:w="{NS["w"]}"><w:pPr><w:spacing w:after="160" w:line="480" '
           f'w:lineRule="auto"/><w:ind w:firstLine="720"/><w:jc w:val="both"/><w:rPr>'
           f'<w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}"/>'
           f'<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>'
           f'<w:r><w:rPr><w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}"/>'
           f'<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'
           f'<w:t xml:space="preserve">{text}</w:t></w:r></w:p>')
    p = etree.fromstring(xml)
    mark_para_inserted(p)
    return p


def body_para(text):
    xml = (f'<w:p xmlns:w="{NS["w"]}"><w:pPr><w:spacing w:after="160" w:line="480" '
           f'w:lineRule="auto"/><w:ind w:firstLine="720"/><w:jc w:val="both"/><w:rPr>'
           f'<w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}"/><w:highlight '
           f'w:val="yellow"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:pPr>'
           f'<w:r><w:rPr><w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" w:cs="{FONT}"/>'
           f'<w:highlight w:val="yellow"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>'
           f'<w:t xml:space="preserve">{text}</w:t></w:r></w:p>')
    p = etree.fromstring(xml)
    mark_para_inserted(p)
    return p


def cell(text, w, bold=False, highlight=True):
    hl = '<w:highlight w:val="yellow"/>' if highlight else ''
    b = '<w:b/>' if bold else ''
    return (f'<w:tc><w:tcPr><w:tcW w:w="{w}" w:type="dxa"/><w:vAlign w:val="center"/>'
            f'</w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="{FONT}" '
            f'w:hAnsi="{FONT}" w:cs="{FONT}"/>{hl}<w:sz w:val="22"/><w:szCs w:val="22"/>'
            f'</w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="{FONT}" w:hAnsi="{FONT}" '
            f'w:cs="{FONT}"/>{b}{hl}<w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr>'
            f'<w:t xml:space="preserve">{text}</w:t></w:r></w:p></w:tc>')


def make_table(header, rows, widths, header_highlight=False):
    cols = ''.join(f'<w:gridCol w:w="{w}"/>' for w in widths)
    hdr_cells = ''.join(cell(t, w, bold=True, highlight=header_highlight)
                         for t, w in zip(header, widths))
    body_rows = []
    for row in rows:
        row_cells = ''.join(cell(t, w, bold=bold, highlight=hl)
                             for (t, bold, hl), w in zip(row, widths))
        body_rows.append(f'<w:tr>{row_cells}</w:tr>')
    xml = (f'<w:tbl xmlns:w="{NS["w"]}"><w:tblPr><w:tblStyle w:val="TableGrid"/>'
           f'<w:tblW w:w="0" w:type="auto"/><w:tblBorders>'
           f'<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
           f'<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
           f'<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
           f'<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
           f'<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
           f'<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders>'
           f'</w:tblPr><w:tblGrid>{cols}</w:tblGrid><w:tr>{hdr_cells}</w:tr>'
           f'{"".join(body_rows)}</w:tbl>')
    tbl = etree.fromstring(xml)
    mark_table_inserted(tbl)
    return tbl


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
all_p = list(root.iter(W + 'p'))


def find_unique(snippet):
    hits = [p for p in all_p if snippet in vis_text(p)]
    assert len(hits) == 1, (snippet[:70], len(hits))
    return hits[0]


anchor = find_unique('(5) discuss the findings against the related literature')
formula_anchor = find_unique('The common 4-point interpretation ranges are presented in Table 2.12.')

SAMPLE = ('[Sample only -- replace with your computed values. '
          'Mean = raw total / number of items (4 for TAM, 4 for ISO per characteristic), '
          'NOT raw total / the score sheet\'s maximum (16, 20, 40, 112, 144). '
          'Compliance % = (mean / 4) x 100. Interpretation uses Table 2.12.]')

tam_rows = [
    [('Students', False, True), ('3.42', False, True), ('Agree / Acceptable', False, True),
     ('3.55', False, True), ('Strongly Agree / Highly Acceptable', False, True)],
    [('Faculty', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True), ('[ ]', False, True)],
    [('Deans', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True), ('[ ]', False, True)],
    [('Registrars', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True), ('[ ]', False, True)],
    [('Administrators', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True), ('[ ]', False, True)],
    [('IT Experts', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True), ('[ ]', False, True)],
]
tam_table = make_table(
    ['Respondent Group', 'PU Mean', 'PU Interpretation', 'PEOU Mean', 'PEOU Interpretation'],
    tam_rows, [2200, 1300, 2800, 1300, 2800])

iso_end_rows = [
    [('Functional Suitability', False, True), ('3.30', False, True), ('82.5%', False, True),
     ('Agree / Acceptable', False, True)],
    [('Performance Efficiency', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True)],
    [('Interaction Capability', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True)],
    [('Reliability', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True)],
    [('Security', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True)],
    [('Flexibility', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True)],
    [('Safety', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True)],
    [('Overall End-User Compliance', True, True), ('[ ]', True, True), ('[ ]', True, True),
     ('[ ]', True, True)],
]
iso_end_table = make_table(
    ['ISO/IEC 25010:2023 Characteristic', 'Mean (1-4)', 'Compliance (%)', 'Interpretation'],
    iso_end_rows, [3600, 1500, 1800, 2900])

iso_exp_rows = [
    [('Functional Suitability', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True)],
    [('Performance Efficiency', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True)],
    [('Compatibility', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True)],
    [('Interaction Capability', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True)],
    [('Reliability', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True)],
    [('Security', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True)],
    [('Maintainability', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True)],
    [('Flexibility', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True)],
    [('Safety', False, True), ('[ ]', False, True), ('[ ]', False, True),
     ('[ ]', False, True)],
    [('Overall Expert Compliance (criterion: 80% / 3.20 mean)', True, True), ('[ ]', True, True),
     ('[ ]', True, True), ('[ ]', True, True)],
]
iso_exp_table = make_table(
    ['ISO/IEC 25010:2023 Characteristic', 'Mean (1-4)', 'Compliance (%)', 'Interpretation'],
    iso_exp_rows, [3600, 1500, 1800, 2900])

intro_note = body_para(SAMPLE)
tam_cap = caption_para('Table 3.4 | TAM Results by Respondent Group (sample)')
tam_disc = body_para('[Sample discussion: Students rated ASPIRE’s perceived usefulness '
                      'as Agree/Acceptable (M = 3.42) and perceived ease of use as Strongly '
                      'Agree/Highly Acceptable (M = 3.55), both above the 2.51 acceptability '
                      'threshold. Replace with your own computed means and write one such '
                      'sentence per respondent group.]')
iso_end_cap = caption_para('Table 3.5 | ISO/IEC 25010:2023 Compliance — End-User (sample)')
iso_end_disc = body_para('[Sample discussion: End-user Functional Suitability reached 82.5% '
                          'compliance (M = 3.30), interpreted as Agree/Acceptable. Replace '
                          'with your own computed values for all seven characteristics and '
                          'the overall end-user compliance figure.]')
iso_exp_cap = caption_para('Table 3.6 | ISO/IEC 25010:2023 Compliance — IT Expert (sample)')
iso_exp_disc = body_para('[Sample discussion: report all nine expert characteristics and the '
                          'overall expert compliance percentage against the 80% '
                          '(3.20-mean-equivalent) criterion stated in Chapter 2.]')

for node in [iso_exp_disc, iso_exp_table, iso_exp_cap,
             iso_end_disc, iso_end_table, iso_end_cap,
             tam_disc, tam_table, tam_cap, intro_note]:
    anchor.addnext(node)

# ========== Chapter 2: the actual formulas behind Table 2.12 / Tables 3.4-3.6 ==========
formula_1 = plain_para(
    "Each item's weighted mean (WM) is computed as WM = Σ(f × w) / N, where f is "
    "the number of respondents who selected a given rating, w is that rating's scale "
    "weight (1 for Strongly Disagree through 4 for Strongly Agree), and N is the total "
    "number of respondents who rated that item. A construct's (TAM's PU or PEOU) or an "
    "ISO/IEC 25010:2023 characteristic's mean is the average of its own items' weighted "
    "means (five items for each TAM construct, four items for each ISO characteristic). "
    "The standard deviation of each item and construct is computed as "
    "SD = √[Σf(w − WM)² / N] and reported alongside the mean to show "
    "response dispersion.")
formula_2 = plain_para(
    "For ISO/IEC 25010:2023, percentage compliance per characteristic is "
    "Compliance (%) = (characteristic mean / 4) × 100. Overall End-User compliance and "
    "overall Expert compliance are each the simple average of their own track's "
    "characteristic-level compliance percentages (seven characteristics for End-User, nine "
    "for Expert). Every mean, TAM or ISO, is interpreted against the four-point descriptive "
    "ranges in Table 2.12 and checked against the two decision thresholds already set in "
    "this chapter: the 2.51 mean for TAM acceptability, and the 80% criterion (equivalent "
    "to a 3.20 mean) for ISO compliance.")
formula_3 = plain_para(
    "ASPIRE's evaluation therefore relies on descriptive and criterion-referenced "
    "statistics rather than between-group significance testing. Weighted means and "
    "standard deviations describe each item, construct, and characteristic; Cronbach's "
    "alpha, and the intraclass correlation coefficient where the achieved IT expert panel "
    "size and estimation method allow it, assess instrument reliability and expert "
    "inter-rater agreement (see Research Instruments). The hypothesis itself (Chapter 1, "
    "Hypothesis of the Study) is tested by directly comparing each respondent group's "
    "computed means and the Expert ISO/IEC 25010:2023 compliance percentage against the "
    "researcher-defined 2.51 and 80% criteria, not by a between-group comparison. Tests "
    "such as ANOVA or the independent-samples t-test, which test whether two or more "
    "groups' means differ from each other, do not fit this study: it does not hypothesize "
    "a difference between respondent groups, and each group's acceptability is assessed "
    "separately against the same fixed criterion, consistent with the decision rule "
    "stated under Hypothesis of the Study.")
formula_anchor.addnext(formula_1)
formula_1.addnext(formula_2)
formula_2.addnext(formula_3)

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done, tracked=%s' % TRACKED)
