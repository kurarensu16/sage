"""Second audit pass, found by searching the whole paper for two known-risky patterns:
1. "OpenRouter" named in body text or citations (should say "Gemini 2.5 Flash" only).
2. Grade-override authority attributed to the Administrator (it belongs to the Registrar,
   since the Admin/Registrar role split; AGENTS.md: admin = accounts + system maintenance
   only, registrar = academic setup, academic terms, student records, grade override).
Plus one structural gap: "Proposed System for the Registrar" content exists (it was written
correctly already) but has no heading of its own, so it reads as part of the Dean's section.

Run: py fix_audit_pass.py <in.docx> <out.docx>
"""
import copy
import sys
import zipfile
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{%s}' % NS['w']


def vis_text(p):
    return ''.join(t.text or '' for t in p.iter(W + 't')
                    if not any(a.tag == W + 'del' for a in t.iterancestors()))


def set_first_run_text(p, new_text):
    """Collapse a paragraph to one run carrying new_text, keeping the first run's formatting."""
    runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None
            and not any(a.tag == W + 'del' for a in r.iterancestors())]
    assert runs, 'no live runs in paragraph'
    runs[0].find(W + 't').text = new_text
    runs[0].find(W + 't').set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    for r in runs[1:]:
        r.getparent().remove(r)


def replace_in_text_nodes(p, old, new):
    """In-place substring replace across a paragraph's <w:t> nodes (handles a split run)."""
    nodes = [t for t in p.iter(W + 't')]
    joined = ''.join(n.text or '' for n in nodes)
    if old not in joined:
        return False
    fixed = joined.replace(old, new)
    # simplest safe approach: put it all in the first node, clear the rest
    if nodes:
        nodes[0].text = fixed
        nodes[0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        for n in nodes[1:]:
            n.text = ''
    return True


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])

report = []
all_p = list(root.iter(W + 'p'))


def find_unique(snippet):
    hits = [p for p in all_p if snippet in vis_text(p)]
    assert len(hits) == 1, (snippet[:60], len(hits))
    return hits[0]


# ---- 1. OpenRouter -> Gemini 2.5 Flash, drop the orphaned citation -----------------------
p = find_unique('AI Study Advising uses a configurable model accessed through OpenRouter')
old = vis_text(p)
new = old.replace(
    'the AI Study Advising uses a configurable model accessed through OpenRouter, with '
    'Google Gemini 2.5 Flash as the designated model (OpenRouter, n.d.).',
    'the AI Study Advising uses Gemini 2.5 Flash.')
assert new != old
set_first_run_text(p, new)
report.append('Removed "accessed through OpenRouter" + orphaned (OpenRouter, n.d.) citation from the AI/risk-score hybrid-pattern paragraph')

p = find_unique('an OpenRouter-accessed language model for advisory diagnostics')
replace_in_text_nodes(p, 'an OpenRouter-accessed language model for advisory diagnostics',
                      'Gemini 2.5 Flash for advisory diagnostics')
report.append('Reworded "OpenRouter-accessed language model" to "Gemini 2.5 Flash" in the requirements-gathering paragraph')

p = find_unique('OpenRouter. (n.d.). Google: Gemini 2.5 Flash')
p.getparent().remove(p)
report.append('Removed the now-orphaned OpenRouter reference-list entry (no in-text citation points to it anymore)')

# ---- 2. Admin -> Registrar grade-override misattributions ---------------------------------
word_fixes = [
    ('controlled grade-posting and correction workflows, administrator-authorized overrides, '
     'notifications, and audit trails?',
     'controlled grade-posting and correction workflows, Registrar-authorized overrides, '
     'notifications, and audit trails?'),
    ('Implement controlled grade correction, administrator override, role-based notification, '
     'and audit-trail workflows that preserve accountability.',
     'Implement controlled grade correction, Registrar override, role-based notification, '
     'and audit-trail workflows that preserve accountability.'),
    ('Dean-approved student-scoped SG correction authority, separately audited administrator '
     'overrides, and activity logging.',
     'Dean-approved student-scoped SG correction authority, separately audited Registrar '
     'overrides, and activity logging.'),
    ('approval does not unlock the ordinary gradebook or directly alter a grade. '
     'Administrators retain separately authorized and audited override authority.',
     'approval does not unlock the ordinary gradebook or directly alter a grade. The '
     'Registrar retains separately authorized and audited override authority.'),
    ('one-use student-scoped SG correction authority after Dean approval, separate '
     'administrator-authorized grade overrides, and relevant activity and audit records.',
     'one-use student-scoped SG correction authority after Dean approval, separate '
     'Registrar-authorized grade overrides, and relevant activity and audit records.'),
    ('Administrators can review and export entries related to account operations, grade and '
     'correction actions, intervention activity, administrative overrides, and '
     'configuration-related events.',
     'Administrators can review and export entries related to account operations, grade and '
     'correction actions, Registrar overrides, intervention activity, and configuration-'
     'related events.'),
    ('maintaining the developer-defined risk parameters. Formula snapshots preserve each '
     "classroom's assigned computation rules against later shared-template edits. After SG "
     'posting, ordinary faculty editing remains locked; correction requires a student-scoped '
     'request, Dean authorization, and one dedicated full-row application by the assigned '
     'faculty member. Authorized administrator overrides remain a separate, reasoned, and '
     'audited workflow.',
     'maintaining the developer-defined risk parameters. Formula snapshots preserve each '
     "classroom's assigned computation rules against later shared-template edits. After SG "
     'posting, ordinary faculty editing remains locked; correction requires a student-scoped '
     'request, Dean authorization, and one dedicated full-row application by the assigned '
     'faculty member. Authorized Registrar overrides remain a separate, reasoned, and '
     'audited workflow.'),
    ('Dean review of student-scoped SG correction requests and escalated cases, and '
     'administrator-authorized direct grade overrides.',
     'Dean review of student-scoped SG correction requests and escalated cases, and '
     'Registrar-authorized direct grade overrides.'),
]
for old, new in word_fixes:
    p = find_unique(old)
    full_old = vis_text(p)
    full_new = full_old.replace(old, new)
    assert full_new != full_old
    set_first_run_text(p, full_new)
report.append('Reattributed grade-override authority from "administrator" to "Registrar" in 8 body paragraphs '
              '(Statement of the Problem, Objectives, Scope security bullet, Conceptual Framework, ISO security '
              'criterion, Audit Logs screen description, System Maintenance, and the Verification/Testing summary)')

# ---- 3. "Proposed System for the Admin" rewritten to match the real, split Admin Portal ---
p = find_unique('The Admin Portal supports account provisioning, academic setup, section rosters')
set_first_run_text(p, (
    "The Admin Portal is narrowed to account provisioning and system maintenance by the "
    "Admin/Registrar role split; academic setup, academic terms, section rosters, and grade "
    "override now belong to the Registrar Portal, described above. User Accounts supports "
    "creating, editing, and deactivating accounts, including bulk account creation by CSV or "
    "Excel import, and reviewing pending student account requests submitted by the Registrar. "
    "System Maintenance provides audit-log inspection, system and storage health monitoring, "
    "maintenance-window scheduling, and encrypted backup and restore."))
report.append('Rewrote "Proposed System for the Admin" to describe only accounts and system maintenance, '
              'removing the stale pre-split claim that Admin handles academic setup, terms, and grade override')

# ---- 4. remove the stray Registrar-override sentence duplicated at the end of the Dean para
p = find_unique('Authorized administrators retain a distinct, reasoned, and audited direct-grade '
                 'override mechanism.')
full_old = vis_text(p)
full_new = full_old.replace(
    ' Authorized administrators retain a distinct, reasoned, and audited direct-grade '
    'override mechanism.', '')
assert full_new != full_old
set_first_run_text(p, full_new)
report.append('Removed a misattributed, now-redundant sentence about direct-grade override from the end of '
              '"Proposed System for the Dean" (the Registrar\'s override authority is correctly described in '
              'its own new section, see next)')

# ---- 5. give the already-written Registrar content its own heading -----------------------
dean_body = find_unique('In Grade Corrections, the Dean approves or rejects a faculty request')
registrar_body = find_unique('The Registrar Portal is the fifth portal and the one created by '
                             'separating registrar work from system administration')
assert dean_body.getnext() is registrar_body, 'Registrar content is not immediately after the Dean paragraph'
def para_style(p):
    ppr = p.find(W + 'pPr')
    if ppr is None:
        return None
    st = ppr.find(W + 'pStyle')
    return st.get(W + 'val') if st is not None else None


heading_hits = [p for p in all_p if vis_text(p).strip() == 'Proposed System for the Dean'
               and para_style(p) == 'Heading3']
assert len(heading_hits) == 1, len(heading_hits)
heading_tmpl = heading_hits[0]
new_heading = copy.deepcopy(heading_tmpl)
for t in new_heading.iter(W + 't'):
    t.text = ''
first_t = next(new_heading.iter(W + 't'))
first_t.text = 'Proposed System for the Registrar'
dean_body.addnext(new_heading)
report.append('Inserted a "Proposed System for the Registrar" heading (Heading 3, matching its siblings) before '
              'existing, already-accurate Registrar content that had no heading of its own and was reading as '
              'part of the Dean\'s section')

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)

print('%d changes applied:' % len(report))
for r in report:
    print(' -', r)
