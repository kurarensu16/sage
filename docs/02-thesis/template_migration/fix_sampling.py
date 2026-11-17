"""Sampling technique: purposive-availability (purposive + convenience) sampling. Some Deans and
faculty members are away from their offices, so the 20/9/9/1/1 figures become intended targets
and actual participation is reported in Chapter 3. Confirmed in chat. New prose yellow.

Run: py fix_sampling.py <in.docx> <out.docx> [--tracked]
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
AUTHOR, DATE = 'Claude Code', '2026-11-17T10:00:00Z'
FONT = 'Times New Roman'
N = [133000]
CITE = '(Etikan, Musa, & Alkassim, 2016)'


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


def retext(p, text):
    runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None and live(r)]
    rpr = runs[0].find(W + 'rPr')
    rpr = copy.deepcopy(rpr) if rpr is not None else etree.Element(W + 'rPr')
    for x in rpr.findall(W + 'b') + rpr.findall(W + 'highlight'):
        rpr.remove(x)
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


def replace_in_text(p, old, new):
    """Replace a substring inside one <w:t>; tracked as a del/ins of just that text."""
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


def rpr_xml(bold=False):
    return ('<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>%s<w:sz w:val="24"/><w:szCs w:val="24"/>'
            '<w:highlight w:val="yellow"/></w:rPr>' % (FONT, FONT, FONT, '<w:b/>' if bold else ''))


def term(name, definition):
    p = etree.fromstring('<w:p xmlns:w="%s"><w:pPr><w:spacing w:after="160" w:line="480" w:lineRule="auto"/>'
                         '<w:ind w:firstLine="720"/><w:jc w:val="both"/>%s</w:pPr>'
                         '<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r><w:r>%s<w:t xml:space="preserve">, %s</w:t></w:r></w:p>'
                         % (WNS, rpr_xml(), rpr_xml(True), escape(name), rpr_xml(), escape(definition)))
    mark_para_inserted(p)
    return p


# 1-2. Research Subjects
retext(find_unique('End-user targets are finalized at 20 students'),
       "The study takes place at DYCI, Bulacan, Philippines, with respondents drawn from users of the five ASPIRE "
       "roles and a separate panel of IT experts. The intended targets are 20 students, 9 faculty members, 9 Deans, "
       "1 Registrar, and 1 administrator (40 end users in total), with 1-3 IT experts as a separate group. Because "
       "respondents are selected partly by availability, these are target numbers; actual participation is "
       "reported in Chapter 3.")
retext(find_unique('This study uses nonprobability purposive sampling'),
       "This study uses a combined purposive and convenience sampling technique, also called purposive-availability "
       "sampling, a form of nonprobability sampling " + CITE + ". First, purposive sampling identifies the qualified "
       "respondents: users of the five ASPIRE roles and IT experts who meet the inclusion criteria below, so that "
       "each respondent has the role and familiarity needed to evaluate the system meaningfully. Second, "
       "convenience sampling selects, from those qualified, the respondents who are available and willing to "
       "participate during the scheduled evaluation period. This applies chiefly to faculty members and Deans, some "
       "of whom may be away from their offices during that period, and to students, whose schedules vary. Roles "
       "held by a single person, the Registrar and the Administrator, include that person.")
replace_in_text(find_unique('conducted using this purposively selected sample'),
                'this purposively selected sample', 'this purposive-availability sample')

# 3. Definition of Terms
conceptual_hitl = [p for p in body.iter(W + 'p') if vis_text(p).startswith('Human-in-the-Loop (HITL), An approach')]
assert len(conceptual_hitl) == 1
conceptual_hitl[0].addprevious(term(
    'Convenience Sampling', 'A nonprobability sampling technique in which members of the target population who '
    'meet practical criteria, such as easy accessibility, availability at a given time, or willingness to '
    'participate, are included in the study ' + CITE + '.'))
replace_in_text(find_unique('Purposive Sampling, The selection of respondents from the five ASPIRE roles'),
                'The selection of respondents from', 'The identification of qualified respondents from')
op_data_flow = [p for p in body.iter(W + 'p') if vis_text(p).startswith('Data Flow, A named piece of data')]
assert len(op_data_flow) == 1
op_data_flow[0].addprevious(term(
    'Convenience Sampling', 'The selection, from the qualified respondents, of those available and willing to '
    'participate during the scheduled evaluation period.'))

# 4. Summary of the Study
replace_in_text(find_unique('Respondents were purposively selected: 40 targeted end users'),
                'Respondents were purposively selected: 40 targeted end users',
                'Respondents were selected through purposive-availability sampling from targets of 40 end users')

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done, tracked=%s' % TRACKED)
