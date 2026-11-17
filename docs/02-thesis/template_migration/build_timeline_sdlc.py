"""Rebuild Capstone_Timeline.docx organized by SDLC phase (Iterative and Incremental Model):
an overview Gantt of the eight phases by iteration, then one section per phase with its own
activity Gantt and dates table. Keeps the original file's page setup, styles, and look.

Run: py build_timeline_sdlc.py <original.docx> <out.docx>
"""
import sys
import zipfile
from xml.sax.saxutils import escape
from lxml import etree
from timeline_data import (PHASES, ITERATIONS, ACTIVITIES, COLUMNS, ITER_COLOR, CAT_COLOR,
                           iterations_of, overlaps, phase_cell_iterations, date_range, fmt)

IN, OUT = sys.argv[1], sys.argv[2]
WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W = '{%s}' % WNS
LINE = 'C9D0D8'
INK, MUTED, HEAD_BG, SUB_BG = '1B2430', '5F6B7A', '1B2430', 'EEF1F5'
LABEL_W, COL_W = 2440, 500          # 2440 + 16 * 500 = 10440, the original table width


def rpr(sz=16, color=INK, bold=False):
    return ('<w:rPr><w:rFonts w:ascii="Arial" w:cs="Arial" w:eastAsia="Arial" w:hAnsi="Arial"/>%s'
            '<w:color w:val="%s"/><w:sz w:val="%d"/><w:szCs w:val="%d"/></w:rPr>'
            % ('<w:b/><w:bCs/>' if bold else '', color, sz, sz))


def run(text, **k):
    return '<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>' % (rpr(**k), escape(text))


def p(runs_xml, style=None, before=0, after=60, jc=None, keep=False):
    ppr = '<w:pPr>%s%s<w:spacing w:before="%d" w:after="%d"/>%s</w:pPr>' % (
        '<w:pStyle w:val="%s"/>' % style if style else '', '<w:keepNext/>' if keep else '', before, after,
        '<w:jc w:val="%s"/>' % jc if jc else '')
    return '<w:p>%s%s</w:p>' % (ppr, runs_xml)


def styled(style, text):
    return '<w:p><w:pPr><w:pStyle w:val="%s"/></w:pPr><w:r><w:t xml:space="preserve">%s</w:t></w:r></w:p>' % (
        style, escape(text))


def tc(text='', w=COL_W, fill=None, span=1, jc='center', bar=False, **k):
    borders = ''.join('<w:%s w:val="single" w:color="%s" w:sz="2"/>' % (s, LINE)
                      for s in ('top', 'left', 'bottom', 'right'))
    return ('<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="%d"/>%s<w:tcBorders>%s</w:tcBorders>%s'
            '<w:tcMar><w:top w:type="dxa" w:w="30"/><w:left w:type="dxa" w:w="%d"/>'
            '<w:bottom w:type="dxa" w:w="30"/><w:right w:type="dxa" w:w="%d"/></w:tcMar>'
            '<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:spacing w:before="0" w:after="0"/>'
            '<w:jc w:val="%s"/></w:pPr>%s</w:p></w:tc>'
            % (w * span, '<w:gridSpan w:val="%d"/>' % span if span > 1 else '', borders,
               '<w:shd w:val="clear" w:color="auto" w:fill="%s"/>' % fill if fill else '',
               0 if bar else 70, 0 if bar else 50, jc, run(text, **k) if text else ''))


def tbl(widths, rows_xml, header_rows=1):
    grid = ''.join('<w:gridCol w:w="%d"/>' % w for w in widths)
    borders = ''.join('<w:%s w:val="single" w:color="auto" w:sz="4"/>' % s
                      for s in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'))
    rows = []
    for i, r in enumerate(rows_xml):
        trpr = '<w:trPr><w:cantSplit/>%s</w:trPr>' % ('<w:tblHeader/>' if i < header_rows else '')
        rows.append('<w:tr>%s%s</w:tr>' % (trpr, r))
    return ('<w:tbl><w:tblPr><w:tblW w:type="dxa" w:w="%d"/><w:tblBorders>%s</w:tblBorders>'
            '<w:tblLayout w:type="fixed"/></w:tblPr><w:tblGrid>%s</w:tblGrid>%s</w:tbl>'
            % (sum(widths), borders, grid, ''.join(rows)))


def gantt_header(label):
    months, spans = [], []
    for m, *_ in COLUMNS:
        if months and months[-1] == m:
            spans[-1] += 1
        else:
            months.append(m)
            spans.append(1)
    r1 = tc('', LABEL_W, fill=SUB_BG) + ''.join(
        tc(m, COL_W, fill=SUB_BG, span=s, sz=16, bold=True) for m, s in zip(months, spans))
    r2 = tc(label, LABEL_W, fill=SUB_BG, jc='left', sz=15, bold=True) + ''.join(
        tc(c[1], COL_W, fill=SUB_BG, sz=13, color=MUTED) for c in COLUMNS)
    return [r1, r2]


def legend(items):
    out = ''
    for name, color in items:
        out += run('■ ', sz=18, color=color) + run(name + '   ', sz=16)
    return p(out, before=100, after=60)


def dates_table(acts):
    widths = [4440, 900, 1900, 2000, 1200]
    hdr = ''.join(tc(h, w, fill=HEAD_BG, jc='left', sz=17, bold=True, color='FFFFFF')
                  for h, w in zip(['Activity', 'Iteration', 'Category', 'Dates (2026)', 'Counted week'], widths))
    rows = [hdr]
    for i, (_, name, cat, s, e, wk) in enumerate(acts):
        its = '-'.join(str(x) for x in iterations_of(s, e))
        dr = 'From Nov 16, until approved' if name.startswith('Further consult') else date_range(s, e)
        fill = 'F5F7FA' if i % 2 else None
        rows.append(''.join(tc(t, w, fill=fill, jc='left', sz=16)
                            for t, w in zip([name, its, cat, dr, wk], widths)))
    return tbl(widths, rows)


body = []
body.append(styled('Title', 'Capstone Project Timeline by SDLC Phase'))
body.append(p(run('ASPIRE was developed with the Iterative and Incremental Model. This timeline separates '
                  'the project\'s activities into the model\'s eight phases across three iterations, '
                  'February to November 2026.', sz=19, color=MUTED)))

# ---- Overview
body.append(styled('Heading1', 'Overview: SDLC Phases by Iteration'))
body.append(p(run('Each shaded half-month shows when a phase was active; the number is the iteration. '
                  'Phases that recur, such as Implementation and Evaluation, show one bar per iteration. '
                  'Mid-June to mid-August (Jun 15 to Aug 16), the break between the capstones, is left out.',
                  sz=17, color=MUTED)))
rows = gantt_header('SDLC phase')
for i, (phase, _) in enumerate(PHASES, 1):
    cells = tc('%d. %s' % (i, phase), LABEL_W, jc='left', sz=16, bold=True)
    for col in COLUMNS:
        its = phase_cell_iterations(phase, col)
        if its:
            cells += tc('/'.join(map(str, its)), COL_W, fill=ITER_COLOR[its[-1]], bar=True, sz=14, bold=True, color='FFFFFF')
        else:
            cells += tc('', COL_W)
    rows.append(cells)
body.append(tbl([LABEL_W] + [COL_W] * len(COLUMNS), rows, header_rows=2))
body.append(legend([('Iteration %d' % n, ITER_COLOR[n]) for n, *_ in ITERATIONS]))

body.append(styled('Heading2', 'Iterations'))
widths = [1200, 5440, 3800]
rows = [''.join(tc(h, w, fill=HEAD_BG, jc='left', sz=17, bold=True, color='FFFFFF')
                for h, w in zip(['Iteration', 'Scope', 'Dates (2026)'], widths))]
for n, scope, s, e in ITERATIONS:
    rows.append(''.join(tc(t, w, jc='left', sz=16) for t, w in
                        zip([str(n), scope, '%s - %s' % (fmt(s), fmt(e)) if e else 'From %s, ongoing' % fmt(s)], widths)))
body.append(tbl(widths, rows))

# ---- One section per phase
for i, (phase, meaning) in enumerate(PHASES, 1):
    acts = [a for a in ACTIVITIES if a[0] == phase]
    body.append('<w:p><w:r><w:br w:type="page"/></w:r></w:p>' if i in (1, 5) else '')
    body.append(styled('Heading1', 'Phase %d: %s' % (i, phase)))
    body.append(p(run(meaning, sz=18, color=MUTED), after=80))
    rows = gantt_header('Activity')
    for _, name, cat, s, e, _ in acts:
        cells = tc(name, LABEL_W, jc='left', sz=15)
        for col in COLUMNS:
            cells += tc('', COL_W, fill=CAT_COLOR[cat], bar=True) if overlaps(s, e, col) else tc('', COL_W)
        rows.append(cells)
    body.append(tbl([LABEL_W] + [COL_W] * len(COLUMNS), rows, header_rows=2))
    body.append(legend(sorted({(a[2], CAT_COLOR[a[2]]) for a in acts})))
    body.append(dates_table(acts))

# ---- Throughout + notes
body.append(styled('Heading1', 'Throughout All Phases'))
body.append(p(run('Ad hoc consultations with other faculty and the capstone advisor took place as needed, '
                  'with no fixed dates, across every phase and iteration.', sz=18)))
body.append(styled('Heading1', 'Notes'))
for t in ('Three problems and three titles are defended at the title defense. One title is chosen during the '
          'major revision and presented at the re-defense, where the panel suggests changes and the scope and '
          'problem are scaled down. The final presentation ends Capstone 1.',
          'In Capstone 2, a technical advisor guides consultation and revision from October 1. The VPs for '
          'Academic Affairs and Operations were consulted on October 13, and the initial defense was on October 26.',
          'After the defense came a major system update, an updated questionnaire, consultation until the technical '
          'advisor approved it, and validation by 3 validators plus CREDO office ethics certification. Approval '
          'letters were gathered, and the IT expert and end users were contacted for the evaluation.',
          'Each activity is assigned to the one SDLC phase it mainly serves. The automated verification run is '
          'taken from Table 3.1 of the paper. Mid-June to mid-August is removed, and the break weeks are not '
          'counted in the week numbers. Dates from October on are actual; earlier phase lengths are estimates.'):
    body.append(p(run(t, sz=18), after=100))

zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
bd = root.find(W + 'body')
sect = bd.find(W + 'sectPr')
for e in list(bd):
    if e is not sect:
        bd.remove(e)
frag = etree.fromstring('<w:body xmlns:w="%s">%s</w:body>' % (WNS, ''.join(body)))
for e in list(frag):
    sect.addprevious(e)
files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done')
