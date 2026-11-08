"""Fix the evaluation/respondent plan: it was written before the Admin/Registrar split and
never updated, so Registrar is entirely absent as a respondent group, and the IT Experts
label's "(faculty, ...)" reads as if it overlaps with the separate Faculty respondent group.
Found by the user reviewing Table 2.11.

Also fixes the Admin Portal inclusion-criteria clause, which still claimed "academic setup"
as an Admin function (that belongs to the Registrar since the split -- same class of bug
found and fixed earlier in Proposed System for the Admin).

Run: py fix_registrar_respondents.py <in.docx> <out.docx>
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


def set_text(p, text):
    runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None]
    assert runs, vis_text(p)[:40]
    runs[0].find(W + 't').text = text
    runs[0].find(W + 't').set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    for r in runs[1:]:
        r.getparent().remove(r)


def set_cell_text(tc, text):
    runs = [r for r in tc.iter(W + 'r') if r.find(W + 't') is not None]
    assert runs
    runs[0].find(W + 't').text = text
    for r in runs[1:]:
        r.getparent().remove(r)


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
all_p = list(root.iter(W + 'p'))

replacements = [
    ("The study takes place at DYCI, Bulacan, Philippines, with respondents recruited "
     "purposively from users of the five ASPIRE roles and a separate panel of IT experts. "
     "Proposed end-user targets are 40 students, 8 faculty members, and 1–2 "
     "Dean/administrator respondents (approximately 49–50 end users), with 1–3 IT "
     "experts as a separate proposed group. These figures are recruitment targets, not "
     "finalized participation totals; actual numbers will be reported with the evaluation "
     "results.",
     "The study takes place at DYCI, Bulacan, Philippines, with respondents recruited "
     "purposively from users of the five ASPIRE roles and a separate panel of IT experts. "
     "Proposed end-user targets are 40 students, 8 faculty members, and 1–3 Dean, "
     "Registrar, or administrator respondents (approximately 49–51 end users), with "
     "1–3 IT experts as a separate proposed group. These figures are recruitment "
     "targets, not finalized participation totals; actual numbers will be reported with the "
     "evaluation results."),

    ("• (c) Deans and Administrators — academic administrators who have used the "
     "Dean Portal's Risk and Honors Overview, Escalated Cases, and Intervention Results "
     "modules, or the Admin Portal's user provisioning, academic setup, and activity log "
     "modules, during the trial period.",
     "• (c) Deans, Registrars, and Administrators — academic administrators who "
     "have used the Dean Portal's Risk and Honors Overview, Escalated Cases, and "
     "Intervention Results modules; the Registrar Portal's Academic Setup, Enrollment and "
     "Loading, or Grade Records modules; or the Admin Portal's user provisioning and "
     "activity log modules, during the trial period."),

    ("Students, faculty, Deans, and administrators receive the End-User Questionnaire. IT "
     "experts receive the Expert Questionnaire.",
     "Students, faculty, Deans, Registrars, and administrators receive the End-User "
     "Questionnaire. IT experts receive the Expert Questionnaire."),

    ("Following institutional authorization, students, faculty, Dean/administrator users, "
     "and IT experts will be oriented to ASPIRE's relevant portals or review activities.",
     "Following institutional authorization, students, faculty, Dean/Registrar/administrator "
     "users, and IT experts will be oriented to ASPIRE's relevant portals or review "
     "activities."),
]

done = 0
for old, new in replacements:
    hits = [p for p in all_p if old in vis_text(p)]
    assert len(hits) == 1, (old[:60], len(hits))
    p = hits[0]
    full = vis_text(p)
    set_text(p, full.replace(old, new))
    done += 1

# Table 2.11: rename the combined staff row, and de-ambiguate the IT Experts label
table_fixes = 0
for tbl in root.iter(W + 'tbl'):
    rows = tbl.findall(W + 'tr')
    if not rows:
        continue
    header_cells = [vis_text(c) for c in rows[0].findall(W + 'tc')]
    if header_cells[:2] == ['Respondent Group', 'Proposed Target (N)']:
        for tr in rows[1:]:
            tcs = tr.findall(W + 'tc')
            label = vis_text(tcs[0])
            if label.strip() == 'Deans / Administrators':
                set_cell_text(tcs[0], 'Deans, Registrars, and Administrators')
                set_cell_text(tcs[1], '1-3')
                table_fixes += 1
            elif label.strip().startswith('IT experts (faculty,'):
                set_cell_text(tcs[0], 'IT experts (IT faculty members, systems analysts, or '
                              'professional developers)')
                table_fixes += 1
    elif header_cells[:3] == ['Respondent Group', 'Target', 'Actual']:
        for tr in rows[1:]:
            tcs = tr.findall(W + 'tc')
            label = vis_text(tcs[0])
            if label.strip() == 'Dean / Administrators':
                set_cell_text(tcs[0], 'Deans, Registrars, and Administrators')
                table_fixes += 1

assert done == 4, done
assert table_fixes == 3, table_fixes

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('text replacements:', done, '| table cell fixes:', table_fixes)
