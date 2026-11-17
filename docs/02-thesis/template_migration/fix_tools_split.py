"""Tools and Technologies Used split into the template's two sub-headings. Confirmed in chat.
- Hardware Development Tools: Table 2.13 (hardware rows from both old tables).
- Software Development Tools: Table 2.14 (both old tables merged, duplicates removed; the AI
  row names Gemini 2.5 Flash only).
- The Gantt chart becomes Table 2.15; Physical Specifications points to Tables 2.13 and 2.14.
New prose yellow; the unconfirmed development-machine specs stay flagged.

Run: py fix_tools_split.py <in.docx> <out.docx> [--tracked]
"""
import copy
import sys
import zipfile
from xml.sax.saxutils import escape
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
TRACKED = '--tracked' in sys.argv[3:]
WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W = '{%s}' % WNS
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
AUTHOR, DATE = 'Claude Code', '2026-11-17T03:00:00Z'
FONT = 'Times New Roman'
N = [129000]


def mark(tag):
    N[0] += 1
    e = etree.Element(W + tag)
    e.set(W + 'id', str(N[0]))
    e.set(W + 'author', AUTHOR)
    e.set(W + 'date', DATE)
    return e


def live(e):
    return not any(a.tag == W + 'del' for a in e.iterancestors())


def vis_text(p):
    return ''.join(t.text or '' for t in p.iter(W + 't') if live(t))


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
        rp = etree.Element(W + 'rPr')
        ch = ppr.find(W + 'pPrChange')
        (ch.addprevious(rp) if ch is not None else ppr.append(rp))
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


def replace_in_text(p, old, new):
    """Replace one substring that sits inside a single <w:t>; tracked as del/ins of just that text."""
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


def rpr_xml(bold=False, yellow=True, sz=24, italic=False):
    return ('<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>%s%s<w:sz w:val="%d"/><w:szCs w:val="%d"/>%s</w:rPr>'
            % (FONT, FONT, FONT, '<w:b/>' if bold else '', '<w:i/>' if italic else '', sz, sz,
               '<w:highlight w:val="yellow"/>' if yellow else ''))


def para(text, yellow=True):
    p = etree.fromstring('<w:p xmlns:w="%s"><w:pPr><w:spacing w:after="160" w:line="480" w:lineRule="auto"/>'
                         '<w:ind w:firstLine="720"/><w:jc w:val="both"/>%s</w:pPr><w:r>%s<w:t xml:space="preserve">'
                         '%s</w:t></w:r></w:p>' % (WNS, rpr_xml(yellow=yellow), rpr_xml(yellow=yellow), escape(text)))
    mark_para_inserted(p)
    return p


def caption(text):
    p = etree.fromstring('<w:p xmlns:w="%s"><w:pPr><w:spacing w:after="160" w:line="480" w:lineRule="auto"/>'
                         '<w:jc w:val="center"/>%s</w:pPr><w:r>%s<w:t xml:space="preserve">%s</w:t></w:r></w:p>'
                         % (WNS, rpr_xml(yellow=False, italic=True), rpr_xml(yellow=False, italic=True), escape(text)))
    mark_para_inserted(p)
    return p


def heading_like(model, text):
    p = etree.Element(W + 'p')
    ppr = copy.deepcopy(model.find(W + 'pPr'))
    for x in ppr.findall(W + 'sectPr') + ppr.findall(W + 'pPrChange') + ppr.findall(W + 'numPr'):
        ppr.remove(x)
    rp = ppr.find(W + 'rPr')
    if rp is not None:
        for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
            rp.remove(x)
    p.append(ppr)
    r = etree.SubElement(p, W + 'r')
    for mr in model.iter(W + 'r'):
        if mr.find(W + 't') is not None and mr.find(W + 'rPr') is not None:
            m = copy.deepcopy(mr.find(W + 'rPr'))
            for x in m.findall(W + 'highlight'):
                m.remove(x)
            r.append(m)
            break
    t = etree.SubElement(r, W + 't')
    t.text = text
    t.set(XML_SPACE, 'preserve')
    mark_para_inserted(p)
    return p


def table(header, rows, widths, yellow_cells=()):
    b = ''.join('<w:%s w:val="single" w:sz="4" w:space="0" w:color="auto"/>' % s
                for s in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'))

    def cell(t, w, bold=False, yellow=False):
        return ('<w:tc><w:tcPr><w:tcW w:w="%d" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:spacing w:before="20" '
                'w:after="20" w:line="240" w:lineRule="auto"/>%s</w:pPr><w:r>%s<w:t xml:space="preserve">%s</w:t>'
                '</w:r></w:p></w:tc>' % (w, rpr_xml(bold, yellow, 20), rpr_xml(bold, yellow, 20), escape(t)))
    trs = ['<w:tr><w:trPr><w:tblHeader/></w:trPr>%s</w:tr>' % ''.join(cell(h, w, True) for h, w in zip(header, widths))]
    for ri, r in enumerate(rows):
        trs.append('<w:tr><w:trPr><w:cantSplit/></w:trPr>%s</w:tr>' % ''.join(
            cell(c, w, ci == 0, (ri, ci) in yellow_cells) for ci, (c, w) in enumerate(zip(r, widths))))
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


# ------------------------------------------------------------------ anchors
h_tools = heading('Tools and Technologies Used')
h_sched = heading('Schedule Timeline')
H3_MODEL = copy.deepcopy(heading('Requirements Specifications'))
old = []
cur = h_tools.getnext()
while cur is not h_sched:
    old.append(cur)
    cur = cur.getnext()
assert [e.tag for e in old] == [W + 'tbl', W + 'p', W + 'tbl'], [e.tag for e in old]

def number_run(p, num):
    """The live <w:t> holding exactly the table number (left split off by the earlier tracked
    renumbering pass, inside its own pending insertion)."""
    ts = [t for t in p.iter(W + 't') if live(t) and t.text == num]
    assert len(ts) == 1, (num, len(ts))
    return ts[0]


# Gantt chart 2.14 -> 2.15 first, before the new 2.14 exists
for snip in ('Table 2.14 presents the development timeline', 'Table 2.14 | Development Timeline'):
    p = find_unique(snip)
    if any('Table 2.14' in (t.text or '') for t in p.iter(W + 't') if live(t)):
        replace_in_text(p, 'Table 2.14', 'Table 2.15')
    else:
        number_run(p, '14').text = '15'
p = find_unique('Table 2.13 details each component.')
if any('Table 2.13 details each component.' in (t.text or '') for t in p.iter(W + 't') if live(t)):
    replace_in_text(p, 'Table 2.13 details each component.',
                    'Tables 2.13 and 2.14 detail the hardware and software components.')
else:
    replace_in_text(p, 'Table 2.', 'Tables 2.')
    replace_in_text(p, ' details each component.', ' and 2.14 detail the hardware and software components.')

for e in old:
    delete_element(e)

HW = [
    ['Development computer',
     '[Confirm against the team\'s actual machines] Laptop or desktop with a multi-core processor (Intel Core i5 / '
     'AMD Ryzen 5 or better), at least 8 GB RAM (16 GB recommended for the Android build), and an SSD',
     'Writing, building, and testing the web application and the Android build'],
    ['Android test device or emulator', 'Device or emulator meeting Capacitor\'s minimum supported Android version',
     'Installing and testing the Android build'],
    ['End-user devices', 'Desktop, laptop, or tablet with a modern web browser and an internet connection, or an '
     'Android device running a Capacitor-supported Android version; no specialized or proprietary hardware',
     'Using ASPIRE in all five roles; server-side computation runs on Supabase\'s managed infrastructure'],
]
SW = [
    ['Frontend', 'React 19, Vite, Tailwind CSS, Lucide React',
     'Builds the interface of all five portals; Vite is the build tool and Lucide React provides the icons'],
    ['Backend and database', 'Supabase: PostgreSQL, Supabase Auth, Row Level Security',
     'Managed database with row-level security, email and password authentication, and real-time synchronization'],
    ['Server-side functions', 'Supabase Edge Functions (Deno)',
     'Seven functions carry every privileged action: administrator account creation and deletion, outbound email, '
     'the AI advising and study-advising calls, AI intervention drafting, and the object-storage broker; keys and '
     'credentials stay server-side'],
    ['AI', 'Gemini 2.5 Flash', 'Structured diagnostic output for the AI Study Advising module'],
    ['File storage', 'Supabase Storage (two private buckets); Cloudflare R2',
     'Profile photos (2 MB, owner-only path) and grade-dispute evidence (participants only, purged on a retention '
     'schedule); R2 is reached only through a server function; usage is shown on Storage Health'],
    ['Notifications', 'Supabase real-time; Capacitor push and local notifications; email',
     'In-app notices, device alerts, and email for grade postings and Dean referrals'],
    ['Mobile packaging', 'Capacitor',
     'Wraps the production web build as an installable Android application (APK), with plugins for push and local '
     'notifications, filesystem access, network status, and sharing'],
    ['Deployment and hosting', 'Vercel; Capacitor Android toolchain',
     'Production web hosting with continuous deployment from the GitHub main branch; Android builds from the same '
     'codebase'],
    ['Development environment', 'Visual Studio Code, Node.js, npm', 'Code editing, local development, and package management'],
    ['Version control', 'Git, hosted on GitHub', 'Source history and the deployment source'],
]
new = [
    para('The tools and technologies used to develop and run ASPIRE are grouped into hardware (Table 2.13) and '
         'software (Table 2.14).'),
    heading_like(H3_MODEL, 'Hardware Development Tools'),
    para('Table 2.13 lists the hardware used to develop and test ASPIRE and the hardware its users need.'),
    table(['Hardware', 'Specification', 'Use'], HW, [1800, 3700, 2900], yellow_cells={(0, 1)}),
    caption('Table 2.13 | Hardware Development Tools'),
    heading_like(H3_MODEL, 'Software Development Tools'),
    para('Table 2.14 lists the software used to build, host, and run ASPIRE.'),
    table(['Category', 'Tools', 'Purpose'], SW, [1800, 2600, 4000]),
    caption('Table 2.14 | Software Development Tools'),
]
for e in new:
    h_sched.addprevious(e)

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done, tracked=%s' % TRACKED)
