"""(1) Table 3.4: Verbal Interpretation uses the questionnaire's own labels (Strongly Agree ...
Strongly Disagree); Descriptive Equivalent carries Highly Acceptable ... Not Acceptable, matching
Table 2.2 and the 2.51 hypothesis threshold. (2) Every table/figure caption sits BELOW its table or
image, like the rest of the paper. Confirmed in chat. With --audit, only reports positions.

Run: py fix_captions_scale.py <in.docx> <out.docx> [--tracked] [--audit]
"""
import copy
import re
import sys
import zipfile
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
TRACKED = '--tracked' in sys.argv[3:]
AUDIT = '--audit' in sys.argv[3:]
W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
A = '{http://schemas.openxmlformats.org/drawingml/2006/main}'
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
AUTHOR, DATE = 'Claude Code', '2026-11-17T20:00:00Z'
N = [145000]
CAP = re.compile(r'^(Table|Figure) (\d+\.\d+[a-z]?) \|')


def mark(tag):
    N[0] += 1
    e = etree.Element(W + tag)
    e.set(W + 'id', str(N[0]))
    e.set(W + 'author', AUTHOR)
    e.set(W + 'date', DATE)
    return e


def live(e):
    return not any(a.tag == W + 'del' for a in e.iterancestors())


def vis(e):
    return ''.join(t.text or '' for t in e.iter(W + 't') if live(t)).strip()


def is_object(e):
    return e is not None and (e.tag == W + 'tbl' or (e.tag == W + 'p' and list(e.iter(A + 'blip'))))


def deleted_para(e):
    """A paragraph that is wholly tracked-deleted (still physically present in TRACKED)."""
    return e.tag == W + 'p' and not vis(e) and any(True for _ in e.iter(W + 'delText'))


def neighbor(e, step):
    cur = e.getprevious() if step < 0 else e.getnext()
    while cur is not None:
        if cur.tag == W + 'tbl':
            if all(not live(t) for t in cur.iter(W + 't')) and list(cur.iter(W + 'delText')):
                cur = cur.getprevious() if step < 0 else cur.getnext()   # wholly deleted table
                continue
            return cur
        if cur.tag == W + 'p' and (vis(cur) or is_object(cur)):
            return cur
        if cur.tag != W + 'p' or not deleted_para(cur) and vis(cur) == '' and not is_object(cur):
            cur = cur.getprevious() if step < 0 else cur.getnext()
            continue
        cur = cur.getprevious() if step < 0 else cur.getnext()
    return None


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
body = root.find(W + 'body')

above = []
for p in list(body):
    if p.tag != W + 'p':
        continue
    m = CAP.match(vis(p))
    if not m:
        continue
    prev, nxt = neighbor(p, -1), neighbor(p, +1)
    if is_object(nxt) and not is_object(prev):
        above.append((p, nxt, '%s %s' % m.groups()))
print('captions ABOVE their object:', [a[2] for a in above])

if not AUDIT:
    for p, obj, label in above:
        p.getparent().remove(p)
        obj.addnext(p)

    # Table 3.4 relabel
    tbl = None
    for t in body.iter(W + 'tbl'):
        rows = t.findall(W + 'tr')
        if [vis(c) for c in rows[0].findall(W + 'tc')] == ['Mean Range', 'Verbal Interpretation', 'Descriptive Equivalent']:
            tbl = t
    assert tbl is not None
    NEW = {'3.26 - 4.00': ('Strongly Agree', 'Highly Acceptable'),
           '2.51 - 3.25': ('Agree', 'Acceptable'),
           '1.76 - 2.50': ('Disagree', 'Moderately Acceptable'),
           '1.00 - 1.75': ('Strongly Disagree', 'Not Acceptable')}
    for tr in tbl.findall(W + 'tr')[1:]:
        cells = tr.findall(W + 'tc')
        verbal, desc = NEW[vis(cells[0])]
        for tc, text in ((cells[1], verbal), (cells[2], desc)):
            p = tc.find(W + 'p')
            runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None and live(r)]
            rpr = runs[0].find(W + 'rPr')
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
            if rpr is not None:
                nr.append(copy.deepcopy(rpr))
            te = etree.SubElement(nr, W + 't')
            te.text = text
            te.set(XML_SPACE, 'preserve')
            if TRACKED:
                ins = mark('ins')
                ins.append(nr)
                p.append(ins)
            else:
                p.append(nr)
    print('Table 3.4 relabeled')

    files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
        for n, b in files.items():
            z.writestr(n, b)
    print('done, tracked=%s' % TRACKED)
