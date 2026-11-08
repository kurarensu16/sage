"""Fix two real content bugs about ASPIRE's role count, found by the user:
1. Para ~49 (Introduction): says "four-role RBAC", omits the Registrar entirely, and wrongly
   gives the Registrar's grade-override authority to Admin (stale, pre-dates the Admin/Registrar
   split; AGENTS.md: admin = accounts + system maintenance only, registrar = grade override).
2. Para ~318 (Requirements Analysis, System Development Methodology): "four-role RBAC" -> "five".
"This is about ASPIRE itself, which has five roles -- not the existing manual system, which
correctly has four (Student, Faculty, Dean, Registrar; only Admin has no manual counterpart) and
is left alone."

Run: py fix_role_count.py <in.docx> <out.docx>
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


OLD_49 = (
    "ASPIRE's four-role RBAC follows least privilege: students access their own academic "
    "records and approved guidance; faculty access assigned class and intervention records; "
    "Deans oversee their college, evaluate escalation requests, and approve or reject faculty "
    "SG correction requests without editing grades themselves; and administrators handle "
    "provisioning, system configuration, audit inspection, and separately authorized direct "
    "posted-grade overrides. Sensitive records are additionally protected through applicable "
    "Supabase Row Level Security policies.")
NEW_49 = (
    "ASPIRE's five-role RBAC follows least privilege: students access their own academic "
    "records and approved guidance; faculty access assigned class and intervention records; "
    "Deans oversee their college, evaluate escalation requests, and approve or reject faculty "
    "SG correction requests without editing grades themselves; the Registrar maintains "
    "academic setup, academic terms, enrollment, and faculty loading, and alone may authorize "
    "an official grade override or a late grade change after the dispute window has closed; "
    "and administrators handle account provisioning, system configuration, and audit "
    "inspection. Sensitive records are additionally protected through applicable Supabase Row "
    "Level Security policies.")

zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])

fixed = 0
for p in root.iter(W + 'p'):
    t = vis_text(p)
    if t.strip() == OLD_49:
        runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None
                and not any(a.tag == W + 'del' for a in r.iterancestors())]
        assert len(runs) >= 1
        runs[0].find(W + 't').text = NEW_49
        for r in runs[1:]:
            r.getparent().remove(r)
        fixed += 1
    elif 'four-role RBAC' in t:
        for tnode in p.iter(W + 't'):
            if tnode.text and 'four-role RBAC' in tnode.text:
                tnode.text = tnode.text.replace('four-role RBAC', 'five-role RBAC')
                fixed += 1

assert fixed >= 2, 'expected at least 2 fixes, got %d' % fixed
print('fixed %d occurrence(s)' % fixed)

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
