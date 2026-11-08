"""Fill in Schedule Timeline (sample Gantt table), Responsibilities (real role assignments
given by the user), and the Hardware Development Tools row (suggested specs) -- removing the
yellow highlight from each since they're no longer empty, except where content is a suggestion
rather than a confirmed fact (kept italic, no highlight, with a "(suggested...)" note).

Run: py fix_schedule_resp_tools.py <in.docx> <out.docx>
"""
import sys
import zipfile
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{%s}' % NS['w']


def vis_text(p):
    return ''.join(t.text or '' for t in p.iter(W + 't')
                    if not any(a.tag == W + 'del' for a in t.iterancestors()))


def clear_highlight(el):
    for h in el.iter(W + 'highlight'):
        h.getparent().remove(h)


def set_first_run(p, text, italic=None, highlight=False):
    runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None]
    assert runs
    rpr = runs[0].find(W + 'rPr')
    if rpr is not None:
        for tag in ('i', 'iCs'):
            for x in rpr.findall(W + tag):
                rpr.remove(x)
        if italic:
            rpr.insert(0, etree.fromstring('<w:i xmlns:w="%s"/>' % NS['w']))
        for x in rpr.findall(W + 'highlight'):
            rpr.remove(x)
        if highlight:
            h = etree.Element(W + 'highlight')
            h.set(W + 'val', 'yellow')
            rpr.insert(0, h)
    runs[0].find(W + 't').text = text
    runs[0].find(W + 't').set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    for r in runs[1:]:
        r.getparent().remove(r)


def tc_text(tc, text, bold=False, italic=False, highlight=False, shade=None):
    """Rebuild a <w:tc>'s single-paragraph content."""
    for p in tc.findall(W + 'p'):
        tc.remove(p)
    tcpr = tc.find(W + 'tcPr')
    if shade is not None:
        for s in tcpr.findall(W + 'shd'):
            tcpr.remove(s)
        shd = etree.SubElement(tcpr, W + 'shd')
        shd.set(W + 'val', 'clear')
        shd.set(W + 'fill', shade)
    p = etree.SubElement(tc, W + 'p')
    r = etree.SubElement(p, W + 'r')
    rpr = etree.SubElement(r, W + 'rPr')
    if bold:
        etree.SubElement(rpr, W + 'b')
    if italic:
        etree.SubElement(rpr, W + 'i')
    if highlight:
        h = etree.SubElement(rpr, W + 'highlight')
        h.set(W + 'val', 'yellow')
    t = etree.SubElement(r, W + 't')
    t.text = text
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')


def gantt_table():
    phases = [
        ('Initial Planning', 0, 1), ('Planning', 0, 1), ('Requirements', 1, 2),
        ('Analysis and Design', 2, 2), ('Implementation', 2, 4), ('Testing', 5, 2),
        ('Evaluation', 6, 2), ('Planning (Next Iteration)', 7, 1),
    ]
    months = 8
    gw = 2400
    mw = (9000 - gw) // months
    cols = ''.join('<w:gridCol w:w="%d"/>' % w for w in [gw] + [mw] * months)
    rows = []

    def row_xml(cells):
        return '<w:tr>' + ''.join(cells) + '</w:tr>'

    def cell(w, text, bold=False, shade=None):
        shd = ('<w:shd w:val="clear" w:fill="%s"/>' % shade) if shade else ''
        rpr = '<w:rPr>%s</w:rPr>' % ('<w:b/>' if bold else '') if (bold or text) else ''
        return ('<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/>%s</w:tcPr>'
                '<w:p><w:r>%s<w:t xml:space="preserve">%s</w:t></w:r></w:p></w:tc>') % (w, shd, rpr, text)

    header = [cell(gw, 'Phase', True)] + [cell(mw, 'M%d' % (i + 1), True) for i in range(months)]
    rows.append(row_xml(header))
    for name, start, dur in phases:
        cells = [cell(gw, name, True)]
        for m in range(months):
            active = start <= m < start + dur
            cells.append(cell(mw, '', shade='FFF2A8' if active else None))
        rows.append(row_xml(cells))
    xml = ('<w:tbl xmlns:w="%s"><w:tblPr><w:tblStyle w:val="TableGrid"/>'
           '<w:tblW w:w="0" w:type="auto"/><w:tblBorders>'
           '<w:top w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
           '<w:left w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
           '<w:bottom w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
           '<w:right w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
           '<w:insideH w:val="single" w:sz="4" w:space="0" w:color="auto"/>'
           '<w:insideV w:val="single" w:sz="4" w:space="0" w:color="auto"/></w:tblBorders>'
           '</w:tblPr><w:tblGrid>%s</w:tblGrid>%s</w:tbl>') % (NS['w'], cols, ''.join(rows))
    return etree.fromstring(xml)


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
all_p = list(root.iter(W + 'p'))


def heading(text):
    hits = [p for p in all_p if vis_text(p).strip() == text]
    assert len(hits) == 1, (text, len(hits))
    return hits[0]


# ---- 1. Schedule Timeline: un-highlight the heading, replace placeholder with intro + Gantt table
sched_h = heading('Schedule Timeline')
clear_highlight(sched_h)
placeholder = sched_h.getnext()
assert vis_text(placeholder).startswith('[To complete: insert a Gantt chart')
set_first_run(placeholder, (
    "Table 2.13 presents a sample development timeline, covering one pass of the iterative "
    "cycle described under System Development Methodology above. It illustrates the planned "
    "sequence rather than confirmed calendar dates; the team replaces the month labels with "
    "actual dates once the schedule is finalized."), italic=False, highlight=False)
gantt = gantt_table()
placeholder.addnext(gantt)
caption = etree.fromstring(
    '<w:p xmlns:w="%s"><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/></w:rPr>'
    '<w:t xml:space="preserve">Table 2.13 | Sample Development Timeline (Gantt Chart)</w:t>'
    '</w:r></w:p>' % NS['w'])
gantt.addnext(caption)

# ---- 2. Responsibilities: un-highlight the heading and fill in the real role assignments ----
resp_h = heading('Responsibilities')
clear_highlight(resp_h)
tbl = resp_h.getnext()
while tbl.tag != W + 'tbl':
    tbl = tbl.getnext()
rows = tbl.findall(W + 'tr')
roles = {
    'Abalos, Carl Jerome F.': 'Review of Related Literature (RRL) and Review of Related Studies (RRS).',
    'Gabriel, John Christian C.': 'Team Lead; oversees the project.',
    'Sadiaza, Clarence Timothy G.': 'Database design and the initial system.',
}
filled = 0
for tr in rows[1:]:
    tcs = tr.findall(W + 'tc')
    name = vis_text(tr).split('[To complete')[0].strip()
    # name is in the first cell only; read it directly
    name_text = ''.join(t.text or '' for t in tcs[0].iter(W + 't'))
    if name_text in roles:
        tc_text(tcs[1], roles[name_text], bold=False, italic=False, highlight=False)
        filled += 1
assert filled == 3, filled

# ---- 3. Hardware Development Tools: suggested specs, italic (suggestion), no highlight -------
ttu_tbl = None
for t in root.iter(W + 'tbl'):
    txt = vis_text(t)
    if 'Hardware Development' in txt and 'Category' in txt:
        ttu_tbl = t
        break
assert ttu_tbl is not None
for tr in ttu_tbl.findall(W + 'tr'):
    tcs = tr.findall(W + 'tc')
    label = ''.join(x.text or '' for x in tcs[0].iter(W + 't'))
    if label.strip() == 'Hardware Development Tools':
        tc_text(tcs[1], (
            "Suggested (confirm against the team's actual machines): a laptop or desktop with "
            "a multi-core processor (Intel Core i5 / AMD Ryzen 5 or better), at least 8 GB RAM "
            "(16 GB recommended for running the Android build), and an SSD for faster builds. "
            "The Android build and testing used an Android device or emulator meeting "
            "Capacitor's minimum supported Android version."), italic=True, highlight=False)
        break

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done')
