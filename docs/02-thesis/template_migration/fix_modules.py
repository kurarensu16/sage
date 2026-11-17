"""Panel recommendation: present Scope, Proposed System, and the Visual Table of Contents
by MODULE instead of by user portal. Confirmed in chat (15 modules; Proposed System also
regrouped; module text rewritten). New prose is highlighted yellow.

1. Ch. 1 Scope: per-portal sections (and the Grade Change Request Chain / Academic Period
   sections) replaced by 15 module sections, each listing every role's functions.
2. Ch. 2 Proposed System: per-role sections replaced by 15 module workflow sections.
3. Figure 2.13 (VTOC) parts 1-2 swapped for the module-based figure; captions and the two
   description paragraphs updated.
4. Requirements Specifications and the System Design intro no longer describe portals.

Run: py fix_modules.py <in.docx> <out.docx> <vtoc_png_dir> [--tracked]
"""
import copy
import os
import re
import sys
import zipfile
from xml.sax.saxutils import escape
from lxml import etree
import fitz
from module_content import (SCOPE_INTRO, SCOPE, PROPOSED_INTRO, PROPOSED, REQ_SPEC, VTOC_P1, VTOC_P2)

IN, OUT, PNG_DIR = sys.argv[1], sys.argv[2], sys.argv[3]
TRACKED = '--tracked' in sys.argv[4:]
WNS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
W = '{%s}' % WNS
R_EMBED = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}embed'
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
AUTHOR, DATE = 'Claude Code', '2026-11-16T23:00:00Z'
FONT = 'Times New Roman'
N = [117000]


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


def delete_paragraph(p):
    if not TRACKED:
        p.getparent().remove(p)
        return
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
        rp = etree.Element(W + 'rPr')
        ch = ppr.find(W + 'pPrChange')
        (ch.addprevious(rp) if ch is not None else ppr.append(rp))
    for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
        rp.remove(x)
    rp.insert(0, mark('del'))


def retext(p, text, yellow=True):
    runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None
            and not any(a.tag == W + 'del' for a in r.iterancestors())]
    rpr = runs[0].find(W + 'rPr')
    rpr = copy.deepcopy(rpr) if rpr is not None else etree.Element(W + 'rPr')
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


def rpr_xml(bold=False, yellow=True):
    return ('<w:rPr><w:rFonts w:ascii="%s" w:hAnsi="%s" w:cs="%s"/>%s<w:sz w:val="24"/><w:szCs w:val="24"/>%s</w:rPr>'
            % (FONT, FONT, FONT, '<w:b/>' if bold else '', '<w:highlight w:val="yellow"/>' if yellow else ''))


def para(runs, yellow=True):
    xml = ('<w:p xmlns:w="%s"><w:pPr><w:spacing w:after="160" w:line="480" w:lineRule="auto"/>'
           '<w:ind w:firstLine="720"/><w:jc w:val="both"/>%s</w:pPr>%s</w:p>'
           % (WNS, rpr_xml(yellow=yellow),
              ''.join('<w:r>%s<w:t xml:space="preserve">%s</w:t></w:r>' % (rpr_xml(b, yellow), escape(t))
                      for t, b in runs)))
    p = etree.fromstring(xml)
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


def replace_between(start, end, new_elements):
    cur = start.getnext()
    old = []
    while cur is not None and cur is not end:
        old.append(cur)
        cur = cur.getnext()
    for e in old:
        assert e.tag == W + 'p', 'unexpected %s between headings' % e.tag
        delete_paragraph(e)
    for e in new_elements:
        end.addprevious(e)
    return len(old)


H4 = copy.deepcopy(heading('Proposed System for the Student'))

# ---------------------------------------------------------------- 1. Scope
scope_new = [para([(SCOPE_INTRO, False)])]
for name, purpose, items in SCOPE:
    scope_new.append(heading_like(H4, name + ' Module'))
    scope_new.append(para([(purpose, False)]))
    for role, func, desc in items:
        scope_new.append(para([('%s – %s. ' % (role, func), True), (desc, False)]))
n_scope = replace_between(heading('Scope'), heading('Delimitations'), scope_new)

# ---------------------------------------------------------------- 2. Proposed System
prop_new = [para([(PROPOSED_INTRO, False)])]
for name, text in PROPOSED:
    prop_new.append(heading_like(H4, name + ' Module'))
    prop_new.append(para([(text, False)]))
n_prop = replace_between(heading('Proposed System'), heading('Grading Engine Specification'), prop_new)

# ---------------------------------------------------------------- 3. VTOC figure + text
rels = files['word/_rels/document.xml.rels'].decode('utf8')
EMU_PER_IN = 914400
for part, cap_old in ((1, '(part 1 of 2)'), (2, '(part 2 of 2)')):
    cap = find_unique('Figure 2.13 | ASPIRE Visual Table of Contents (VTOC) ' + cap_old)
    img_p = cap.getprevious()
    while not list(img_p.iter('{http://schemas.openxmlformats.org/drawingml/2006/main}blip')):
        img_p = img_p.getprevious()
    blip = next(img_p.iter('{http://schemas.openxmlformats.org/drawingml/2006/main}blip'))
    rid = blip.get(R_EMBED)
    target = re.search(r'<Relationship[^>]*Id="%s"[^>]*>' % rid, rels).group(0)
    target = re.search(r'Target="([^"]+)"', target).group(1)
    png = open(os.path.join(PNG_DIR, 'Figure-2.13-VTOC-Module-part%d.png' % part), 'rb').read()
    files['word/' + target] = png
    pm = fitz.Pixmap(png)
    ext = next(img_p.iter('{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}extent'))
    cx = int(ext.get('cx'))
    cy = int(cx * pm.height / pm.width)
    ext.set('cy', str(cy))
    for a_ext in img_p.iter('{http://schemas.openxmlformats.org/drawingml/2006/main}ext'):
        if a_ext.get('cx') is not None:
            a_ext.set('cx', str(cx))
            a_ext.set('cy', str(cy))
    retext(cap, 'Figure 2.13 | ASPIRE Visual Table of Contents (VTOC) by Module ' + cap_old, yellow=False)
    print('VTOC part %d -> %s, %.2f x %.2f in' % (part, target, cx / EMU_PER_IN, cy / EMU_PER_IN))

retext(find_unique("Figure 2.13 presents ASPIRE's role-based menu hierarchy"), VTOC_P1)
retext(find_unique('The Dean Portal has Faculty Loading, Grades (submission status'), VTOC_P2)

# ---------------------------------------------------------------- 4. Stale per-portal references
retext(find_unique('functional requirements are organized by portal and module'), REQ_SPEC)
sd = find_unique('The Visual Table of Contents maps every portal')
retext(sd, vis_text(sd).replace(
    "The Visual Table of Contents maps every portal's modules to its menu hierarchy ahead of these diagrams.",
    "The Visual Table of Contents maps ASPIRE's modules, and each user role's functions within them, ahead of "
    "these diagrams."))

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done, tracked=%s, scope old paras=%d, proposed old paras=%d' % (TRACKED, n_scope, n_prop))
