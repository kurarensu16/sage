"""Apply the ERD regrouping: refreshed schema data (10 partial tables + the new 'rooms'
table), and collapsing Grading Outcomes (4->2 parts), Evaluation and Intervention (3->2),
Notifications and System (3->2), and AI Study Advising (2->1) to kill dead space, all
confirmed in chat before this script was written.

For each regrouped category: keep the first N old picture+caption+description trios (one
per new part), swap in the freshly rendered image, rewrite the caption and description;
delete the now-unused trailing trios. For categories whose table set didn't move parts
(2.15, 2.16b) or only gained one table (2.14a/b), just swap the image (if changed) and
patch the description in place.

Supports the same tracked/clean convention as the other fix_*.py scripts.
Run: py fix_erd_regroup.py <in.docx> <out.docx> [--tracked]
"""
import copy
import os
import re
import struct
import sys
import zipfile
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
TRACKED = '--tracked' in sys.argv[3:]
NS = {
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
}
W = '{%s}' % NS['w']
R = '{%s}' % NS['r']
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
AUTHOR, DATE = 'Claude Code', '2026-11-11T18:00:00Z'
FIG_DIR = r'C:\Users\JC Gabriel\Downloads\New ASPIRE\sage\docs\02-thesis\figures\erd_system\out'
MAXW, MAXH = 5852160, 7497960  # 6.4in x 8.2in in EMU, matching build_erd_docx.py


class Ctx:
    def __init__(self, tracked):
        self.tracked = tracked
        self.n = 99000

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


def base_rpr(p):
    for r in p.iter(W + 'r'):
        if r.find(W + 't') is not None:
            rp = r.find(W + 'rPr')
            return copy.deepcopy(rp) if rp is not None else etree.Element(W + 'rPr')
    return etree.Element(W + 'rPr')


def set_text(p, text):
    runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None]
    assert runs, vis_text(p)[:40]
    runs[0].find(W + 't').text = text
    runs[0].find(W + 't').set(XML_SPACE, 'preserve')
    for r in runs[1:]:
        r.getparent().remove(r)


def retext(p, text):
    if not ctx.tracked:
        set_text(p, text)
        return
    runs = [r for r in p.iter(W + 'r')
            if r.find(W + 't') is not None
            and not any(a.tag == W + 'del' for a in r.iterancestors())]
    assert runs, vis_text(p)[:40]
    rpr = base_rpr(p)
    last = runs[-1]
    idx_parent, idx = last.getparent(), list(last.getparent()).index(last)
    for r in runs:
        par = r.getparent()
        pos = list(par).index(r)
        par.remove(r)
        d = ctx.mark('del')
        d.append(r)
        par.insert(pos, d)
        r.find(W + 't').tag = W + 'delText'
    ins = ctx.mark('ins')
    newr = etree.SubElement(ins, W + 'r')
    newr.append(copy.deepcopy(rpr))
    t = etree.SubElement(newr, W + 't')
    t.text = text
    t.set(XML_SPACE, 'preserve')
    idx_parent.insert(idx + 1, ins)


def delete_paragraph(p):
    if not ctx.tracked:
        p.getparent().remove(p)
        return
    for r in [r for r in p.iter(W + 'r') if not any(a.tag == W + 'del' for a in r.iterancestors())
              and r.find(W + 't') is not None]:
        par = r.getparent()
        idx = par.index(r)
        par.remove(r)
        d = ctx.mark('del')
        d.append(r)
        par.insert(idx, d)
        for t in r.findall(W + 't'):
            t.tag = W + 'delText'
    # also strip any drawing/picture content (nothing to delText-wrap there; tracked
    # deletion of picture runs is represented as an ordinary run delete above since the
    # picture lives inside a <w:r> like a text run)
    ppr = p.find(W + 'pPr')
    if ppr is None:
        ppr = etree.Element(W + 'pPr')
        p.insert(0, ppr)
    rp = ppr.find(W + 'rPr')
    if rp is None:
        rp = etree.SubElement(ppr, W + 'rPr')
    for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
        rp.remove(x)
    rp.insert(0, ctx.mark('del'))


def png_size(path):
    with open(path, 'rb') as f:
        b = f.read(24)
    return struct.unpack('>II', b[16:24])


def fit(w, h):
    s = min(MAXW / w, MAXH / h)
    return int(w * s), int(h * s)


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
rels_xml = files['word/_rels/document.xml.rels'].decode('utf-8')
all_p = list(root.iter(W + 'p'))


def find_cap(prefix):
    hits = [p for p in all_p if vis_text(p).strip().startswith(prefix) and '| ERD:' in vis_text(p)]
    assert len(hits) == 1, (prefix, len(hits))
    return hits[0]


def swap_image(img_p, png_name):
    blips = list(img_p.iter('{%s}blip' % NS['a']))
    assert len(blips) == 1
    rid = blips[0].get(R + 'embed')
    m = re.search(r'<Relationship[^>]*Id="%s"[^>]*Target="([^"]+)"' % rid, rels_xml)
    if not m:
        m = re.search(r'<Relationship[^>]*Target="([^"]+)"[^>]*Id="%s"' % rid, rels_xml)
    assert m, rid
    media_path = 'word/' + m.group(1)
    path = os.path.join(FIG_DIR, png_name)
    files[media_path] = open(path, 'rb').read()
    w, h = png_size(path)
    cx, cy = fit(w, h)
    for e in img_p.iter('{%s}extent' % NS['wp']):
        e.set('cx', str(cx))
        e.set('cy', str(cy))
    for e in img_p.iter('{%s}ext' % NS['a']):
        e.set('cx', str(cx))
        e.set('cy', str(cy))


def remove_trailing_partial_note(text, table_names_upper):
    """Drop the trailing '<TABLE> was created before the tracked migrations...' sentence
    for any table named in table_names_upper, now that its data is confirmed."""
    for name in table_names_upper:
        pat = re.compile(
            r' ' + re.escape(name) +
            r' was created before the tracked migrations began, so its columns come from '
            r'the original schema document plus later changes and should be confirmed '
            r'against the live database\.')
        text = pat.sub('', text)
        pat2 = re.compile(
            r' ' + re.escape(name) + r'(, [A-Z_]+)* were created before the tracked '
            r'migrations began, so (?:their|its) columns come from the original schema '
            r'document plus later changes and should be confirmed against the live '
            r'database\.')
        text = pat2.sub('', text)
    return text.rstrip()


# ========================= intro: table count 54 -> 55 (the new 'rooms' table) ============
intro_p = find_unique_simple = [p for p in all_p if "ASPIRE's database holds 54 tables." in vis_text(p)]
assert len(intro_p) == 1
retext(intro_p[0], vis_text(intro_p[0]).replace(
    "ASPIRE's database holds 54 tables.", "ASPIRE's database holds 55 tables."))

# ========================= 2.14a: add ROOMS cross-ref, drop partial note =================
cap_14a = find_cap('Figure 2.14a')
desc_14a = cap_14a.getnext()
img_14a = cap_14a.getprevious()
swap_image(img_14a, 'ERD-14a-Academic-Structure.png')
t = vis_text(desc_14a)
t = t.replace(
    "CLASS_RECORDS.term_id refers to ACADEMIC_TERMS (optional) and ENROLLMENTS.section_id refers to SECTIONS (optional).",
    "CLASS_RECORDS.term_id refers to ACADEMIC_TERMS (optional), CLASS_RECORDS.room_id refers to ROOMS (optional) and ENROLLMENTS.section_id refers to SECTIONS (optional).")
t = t.replace("The dashed boxes mark SUBJECTS and USERS,", "The dashed boxes mark SUBJECTS, ROOMS and USERS,")
t = remove_trailing_partial_note(t, [
    'SECTIONS, DEPARTMENTS, CLASS_RECORDS and ENROLLMENTS'])
retext(desc_14a, t)

# ========================= 2.14b: add ROOMS table, drop partial note =====================
cap_14b = find_cap('Figure 2.14b')
desc_14b = cap_14b.getnext()
img_14b = cap_14b.getprevious()
swap_image(img_14b, 'ERD-14b-Academic-Structure.png')
t = vis_text(desc_14b)
t = t.replace("Figure 2.14b shows PROGRAMS and SUBJECTS.", "Figure 2.14b shows PROGRAMS, SUBJECTS and ROOMS.")
t = t.replace(
    "SUBJECTS is the subject catalog, with units and the grading template each subject uses.",
    "SUBJECTS is the subject catalog, with units and the grading template each subject uses. "
    "ROOMS is the catalog of physical rooms available for class scheduling, each with a room "
    "type and an active flag.")
t = remove_trailing_partial_note(t, ['SUBJECTS'])
retext(desc_14b, t)

# ========================= 2.15: drop partial note only ===================================
cap_15 = find_cap('Figure 2.15')
desc_15 = cap_15.getnext()
t = remove_trailing_partial_note(vis_text(desc_15), ['USERS'])
retext(desc_15, t)

# ========================= 2.16b: drop partial note only ==================================
cap_16b = find_cap('Figure 2.16b')
desc_16b = cap_16b.getnext()
t = remove_trailing_partial_note(vis_text(desc_16b), ['CLASS_GRADING_COLUMNS'])
retext(desc_16b, t)

# ========================= 2.17: 4 parts -> 2 ==============================================
# Keep the part-1 trio (posted_grades alone) and the part-3 trio (4 tables -- the biggest
# existing picture, closest in size to the new 7-table part 2) in place, repurposed as the
# new part 1 and part 2; delete the part-2 (remark_override_requests alone) and part-4 trios.
cap_17a, cap_17b, cap_17c, cap_17d = (find_cap('Figure 2.17a'), find_cap('Figure 2.17b'),
                                      find_cap('Figure 2.17c'), find_cap('Figure 2.17d'))
desc_17a, desc_17b, desc_17c, desc_17d = (cap_17a.getnext(), cap_17b.getnext(),
                                          cap_17c.getnext(), cap_17d.getnext())
img_17a, img_17b, img_17c, img_17d = (cap_17a.getprevious(), cap_17b.getprevious(),
                                      cap_17c.getprevious(), cap_17d.getprevious())

retext(cap_17a, 'Figure 2.17a | ERD: Grading Outcomes (part 1 of 2)')
swap_image(img_17a, 'ERD-17a-Grading-Outcomes.png')
new_17a = (
    "Figure 2.17a shows POSTED_GRADES, REMARK_OVERRIDE_REQUESTS and POSTED_GRADE_REVISIONS. "
    "POSTED_GRADES stores the official grading-period results, with effective grades, "
    "remarks, and lock state. REMARK_OVERRIDE_REQUESTS carries the grade change request "
    "chain, with reasons, evidence references, and the decision at each step. "
    "POSTED_GRADE_REVISIONS keeps the immutable revision trail behind every posted or "
    "corrected grade. Within this figure, POSTED_GRADES.last_correction_request_id refers "
    "to REMARK_OVERRIDE_REQUESTS (optional), REMARK_OVERRIDE_REQUESTS.posted_grade_id "
    "refers to POSTED_GRADES (optional), REMARK_OVERRIDE_REQUESTS.applied_posted_grade_id "
    "refers to POSTED_GRADES (optional), POSTED_GRADE_REVISIONS.posted_grade_id refers to "
    "POSTED_GRADES and POSTED_GRADE_REVISIONS.correction_request_id refers to "
    "REMARK_OVERRIDE_REQUESTS (optional). The dashed boxes mark CLASS_RECORDS and USERS, "
    "which are drawn in full in another figure and appear here only to show the links that "
    "reach them.")
retext(desc_17a, new_17a)
delete_paragraph(cap_17b)
delete_paragraph(desc_17b)
delete_paragraph(img_17b)

retext(cap_17c, 'Figure 2.17b | ERD: Grading Outcomes (part 2 of 2)')
swap_image(img_17c, 'ERD-17b-Grading-Outcomes.png')
new_17b = (
    "Figure 2.17b shows GRADE_CORRECTION_HISTORY, SG_CORRECTION_OPERATIONS, "
    "ADMIN_GRADE_OVERRIDE_OPERATIONS, GRADE_CHANGE_EVIDENCE, GRADE_CONSULTATION_WINDOWS, "
    "GRADE_CONSULTATION_NOTES and GRADE_POSTING_OPERATIONS. GRADE_CORRECTION_HISTORY "
    "records each applied correction with the previous and final values. "
    "SG_CORRECTION_OPERATIONS logs each staged SG correction applied under an approved "
    "request. ADMIN_GRADE_OVERRIDE_OPERATIONS logs each Registrar override of an official "
    "grade, with the Dean's acknowledgment. GRADE_CHANGE_EVIDENCE records the one to three "
    "evidence files attached to a grade change request in private storage. "
    "GRADE_CONSULTATION_WINDOWS holds one consultation window per class and milestone, open "
    "until the assigned faculty member finalizes it. GRADE_CONSULTATION_NOTES holds the "
    "consultations logged inside a window. GRADE_POSTING_OPERATIONS logs each server-side "
    "grade posting as a durable, repeat-safe operation. Within this figure, "
    "GRADE_CONSULTATION_NOTES.window_id refers to GRADE_CONSULTATION_WINDOWS. The dashed "
    "boxes mark CLASS_RECORDS, POSTED_GRADES, REMARK_OVERRIDE_REQUESTS and USERS, which are "
    "drawn in full in another figure and appear here only to show the links that reach "
    "them.")
retext(desc_17c, new_17b)
delete_paragraph(cap_17d)
delete_paragraph(desc_17d)
delete_paragraph(img_17d)

# ========================= 2.18: 3 parts -> 2 ==============================================
cap_18a, cap_18b, cap_18c = find_cap('Figure 2.18a'), find_cap('Figure 2.18b'), find_cap('Figure 2.18c')
desc_18a, desc_18b, desc_18c = cap_18a.getnext(), cap_18b.getnext(), cap_18c.getnext()
img_18a, img_18b, img_18c = cap_18a.getprevious(), cap_18b.getprevious(), cap_18c.getprevious()

retext(cap_18a, 'Figure 2.18a | ERD: Evaluation and Intervention (part 1 of 2)')
swap_image(img_18a, 'ERD-18a-Evaluation-and-Intervention.png')
new_18a = (
    "Figure 2.18a shows STUDENT_RISK_EVALUATIONS, STUDENT_RISK_PRIVATE_NOTES, "
    "STUDENT_EVALUATION_REFERRALS and FACULTY_INTERVENTION_DRAFTS. STUDENT_RISK_EVALUATIONS "
    "is the core of the closed-loop pipeline, storing the risk score, advising plan, and "
    "frozen baseline and follow-up snapshots. STUDENT_RISK_PRIVATE_NOTES keeps faculty "
    "observations away from every student-facing query. STUDENT_EVALUATION_REFERRALS "
    "records each referral to the Dean with its rationale and the Dean's disposition. "
    "FACULTY_INTERVENTION_DRAFTS keeps AI-generated task drafts with their model and prompt "
    "version. Within this figure, STUDENT_RISK_PRIVATE_NOTES.evaluation_id refers to "
    "STUDENT_RISK_EVALUATIONS, STUDENT_EVALUATION_REFERRALS.evaluation_id refers to "
    "STUDENT_RISK_EVALUATIONS and FACULTY_INTERVENTION_DRAFTS.accepted_evaluation_id refers "
    "to STUDENT_RISK_EVALUATIONS (optional). The dashed boxes mark CLASS_RECORDS and USERS, "
    "which are drawn in full in another figure and appear here only to show the links that "
    "reach them.")
retext(desc_18a, new_18a)

retext(cap_18b, 'Figure 2.18b | ERD: Evaluation and Intervention (part 2 of 2)')
swap_image(img_18b, 'ERD-18b-Evaluation-and-Intervention.png')
new_18b = (
    "Figure 2.18b shows FACULTY_INTERVENTION_WORKING_DRAFTS, "
    "STUDENT_EVALUATION_REFERRAL_REQUESTS, STUDENT_ACADEMIC_INSIGHTS, ATTENDANCE_RECORDS "
    "and STUDENT_CONSULTATION_REQUESTS. FACULTY_INTERVENTION_WORKING_DRAFTS keeps "
    "unpublished faculty work on an intervention. STUDENT_EVALUATION_REFERRAL_REQUESTS "
    "remembers every referral request so that a retry cannot reopen a resolved case. "
    "STUDENT_ACADEMIC_INSIGHTS holds the advisory log shown in Academic Insights. "
    "ATTENDANCE_RECORDS feeds the attendance factor and the FDA warning. "
    "STUDENT_CONSULTATION_REQUESTS remains as the historical record of consultation "
    "requests, although no page creates rows in it. The dashed boxes mark ACADEMIC_TERMS, "
    "CLASS_RECORDS, STUDENT_EVALUATION_REFERRALS, STUDENT_RISK_EVALUATIONS and USERS, which "
    "are drawn in full in another figure and appear here only to show the links that reach "
    "them.")
retext(desc_18b, new_18b)
delete_paragraph(cap_18c)
delete_paragraph(desc_18c)
delete_paragraph(img_18c)

# ========================= 2.19: 2 parts -> 1 ===============================================
cap_19a, cap_19b = find_cap('Figure 2.19a'), find_cap('Figure 2.19b')
desc_19a, desc_19b = cap_19a.getnext(), cap_19b.getnext()
img_19a, img_19b = cap_19a.getprevious(), cap_19b.getprevious()

retext(cap_19a, 'Figure 2.19 | ERD: AI Study Advising')
swap_image(img_19a, 'ERD-19-AI-Study-Advising.png')
new_19 = (
    "Figure 2.19 shows STUDENT_TUTOR_PRACTICE_SETS, STUDENT_TUTOR_PRACTICE_ATTEMPTS, "
    "STUDENT_TUTOR_PLANS, STUDENT_TUTOR_LOG and SEARCH_DESTINATIONS. "
    "STUDENT_TUTOR_PRACTICE_SETS holds generated practice, with answers withheld from the "
    "client. STUDENT_TUTOR_PRACTICE_ATTEMPTS stores the answers a student submits to a "
    "practice set. STUDENT_TUTOR_PLANS holds at most one active study plan per subject per "
    "term and is archived when the term rolls over. STUDENT_TUTOR_LOG meters every model "
    "call, recording the model served and the tokens used against the budget. "
    "SEARCH_DESTINATIONS is the approved list of further-reading links the model may offer. "
    "Within this figure, STUDENT_TUTOR_PRACTICE_ATTEMPTS.set_id refers to "
    "STUDENT_TUTOR_PRACTICE_SETS (optional). The dashed boxes mark ACADEMIC_TERMS, SUBJECTS "
    "and USERS, which are drawn in full in another figure and appear here only to show the "
    "links that reach them.")
retext(desc_19a, new_19)
delete_paragraph(cap_19b)
delete_paragraph(desc_19b)
delete_paragraph(img_19b)

# ========================= 2.20: 3 parts -> 2 ==============================================
cap_20a, cap_20b, cap_20c = find_cap('Figure 2.20a'), find_cap('Figure 2.20b'), find_cap('Figure 2.20c')
desc_20a, desc_20b, desc_20c = cap_20a.getnext(), cap_20b.getnext(), cap_20c.getnext()
img_20a, img_20b, img_20c = cap_20a.getprevious(), cap_20b.getprevious(), cap_20c.getprevious()

retext(cap_20a, 'Figure 2.20a | ERD: Notifications and System (part 1 of 2)')
swap_image(img_20a, 'ERD-20a-Notifications-and-System.png')
new_20a = (
    "Figure 2.20a shows SYSTEM_SETTINGS, HOSTING_PLAN_TIERS, MAINTENANCE_REASONS, "
    "MAINTENANCE_NOTE_PRESETS, NOTIFICATIONS and FACULTY_LOAD_DRAFTS. SYSTEM_SETTINGS holds "
    "the single row of maintenance state and system configuration. HOSTING_PLAN_TIERS holds "
    "the published hosting plan limits as reference data. MAINTENANCE_REASONS holds the "
    "reasons a maintenance window can be opened, with the message users see. "
    "MAINTENANCE_NOTE_PRESETS holds optional sentences an administrator can add to a "
    "maintenance notice. NOTIFICATIONS stores the application notices addressed to users. "
    "FACULTY_LOAD_DRAFTS holds each faculty loading assignment from draft to finalization "
    "and keeps superseded rows. Within this figure, SYSTEM_SETTINGS.hosting_plan_tier "
    "refers to HOSTING_PLAN_TIERS (optional), SYSTEM_SETTINGS.maintenance_reason_id refers "
    "to MAINTENANCE_REASONS (optional) and MAINTENANCE_NOTE_PRESETS.reason_id refers to "
    "MAINTENANCE_REASONS (optional). The dashed boxes mark CLASS_RECORDS, DEPARTMENTS, "
    "SECTIONS, SUBJECTS and USERS, which are drawn in full in another figure and appear "
    "here only to show the links that reach them.")
retext(desc_20a, new_20a)
delete_paragraph(cap_20c)
delete_paragraph(desc_20c)
delete_paragraph(img_20c)

retext(cap_20b, 'Figure 2.20b | ERD: Notifications and System (part 2 of 2)')
swap_image(img_20b, 'ERD-20b-Notifications-and-System.png')
t = remove_trailing_partial_note(vis_text(desc_20b), ['ACTIVITY_LOGS'])
retext(desc_20b, t)

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done, tracked=%s' % TRACKED)
