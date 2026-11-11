"""Apply the confirmed RRL/RRS additions (Faculty Loading literature, Gemini 2.5 Flash
justification, DYCI Handbook as a literature source) and the finalized Table 2.11 / Table 3.3
respondent counts (20 students, 9 faculty, 9 Deans, 1 Registrar, 1 Administrator, 1-3 IT
experts), all confirmed in chat before this script was written.

Supports the same tracked/clean two-file convention as the other fix_*.py scripts: pass
--tracked to wrap every change in Word's <w:ins>/<w:del> revision markup (for the TRACKED
file); omit it for a plain, already-accepted edit (for the UPDATED file).

Run: py fix_rrl_rrs_and_table.py <in.docx> <out.docx> [--tracked]
"""
import copy
import sys
import zipfile
from lxml import etree

IN, OUT = sys.argv[1], sys.argv[2]
TRACKED = '--tracked' in sys.argv[3:]
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{%s}' % NS['w']
XML_SPACE = '{http://www.w3.org/XML/1998/namespace}space'
AUTHOR, DATE = 'Claude Code', '2026-11-09T12:00:00Z'


class Ctx:
    def __init__(self, tracked):
        self.tracked = tracked
        self.n = 95000

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
    """Plain (untracked) full-text replacement, keeping the first run's formatting."""
    runs = [r for r in p.iter(W + 'r') if r.find(W + 't') is not None]
    assert runs, vis_text(p)[:40]
    runs[0].find(W + 't').text = text
    runs[0].find(W + 't').set(XML_SPACE, 'preserve')
    for r in runs[1:]:
        r.getparent().remove(r)


def set_cell_text(tc, text):
    set_text(tc.find(W + 'p'), text)


def retext(container, text):
    """Replace a <w:p>'s (or a cell paragraph's) full visible text, tracked or not."""
    p = container if container.tag == W + 'p' else container.find(W + 'p')
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


def mark_para_inserted(p):
    if not ctx.tracked:
        return
    ppr = p.find(W + 'pPr')
    if ppr is None:
        ppr = etree.Element(W + 'pPr')
        p.insert(0, ppr)
    rp = ppr.find(W + 'rPr')
    if rp is None:
        rp = etree.SubElement(ppr, W + 'rPr')
    for x in rp.findall(W + 'ins') + rp.findall(W + 'del'):
        rp.remove(x)
    rp.insert(0, ctx.mark('ins'))
    for r in [c for c in p if c.tag == W + 'r']:
        i = ctx.mark('ins')
        idx = p.index(r)
        p.remove(r)
        i.append(r)
        p.insert(idx, i)


def new_para_like(template, text):
    p = etree.fromstring(etree.tostring(template))
    set_text(p, text)
    mark_para_inserted(p)
    return p


def mark_row_inserted(tr):
    if not ctx.tracked:
        return
    for tc in tr.findall(W + 'tc'):
        for p in tc.findall(W + 'p'):
            mark_para_inserted(p)
    tcpr_parent = tr.find(W + 'trPr')
    if tcpr_parent is None:
        tcpr_parent = etree.Element(W + 'trPr')
        tr.insert(0, tcpr_parent)
    ins = ctx.mark('ins')
    tcpr_parent.append(ins)


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
all_p = list(root.iter(W + 'p'))


def find_unique(snippet):
    hits = [p for p in all_p if snippet in vis_text(p)]
    assert len(hits) == 1, (snippet[:70], len(hits))
    return hits[0]


def find_exact(snippet):
    hits = [p for p in all_p if vis_text(p).strip() == snippet]
    assert len(hits) == 1, (snippet[:70], len(hits))
    return hits[0]


# ================= 1. References: add 3 new entries in alphabetical order ==================
ref_austero = ("Austero, L. D., Medina, R. P., Sison, A. M., & Matias, J. B. (2022). "
               "Optimizing faculty workloads and room utilization using heuristically "
               "enhanced WOA. International Journal of Advanced Computer Science and "
               "Applications, 13(11), 554–562. https://thesai.org/Downloads/Volume13No11/"
               "Paper_64-Optimizing_Faculty_Workloads_and_Room_Utilization.pdf")
ref_google = ("Google. (2026). Gemini 2.5 Flash. Vertex AI generative AI documentation. "
              "https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/"
              "2-5-flash")
ref_usep = ("University of Southeastern Philippines. (2016). Student handbook (2016 ed.) "
            "[Institutional handbook]. https://www.usep.edu.ph/wp-content/uploads/2020/03/"
            "Student-Handbook-2016-EDITION.pdf")

atalla = find_unique('Atalla, S., Daradkeh, M., Gawanmeh, A.')
atalla.addnext(new_para_like(atalla, ref_austero))

geeks = find_unique('GeeksforGeeks. (2024, March 18)')
geeks.addnext(new_para_like(geeks, ref_google))

un_b = find_unique('United Nations Department of Economic and Social Affairs. (n.d.-b)')
un_b.addnext(new_para_like(un_b, ref_usep))

# ================= 2. DYCI Handbook as a literature source (Chapter 1 RRL) =================
rbac_para = find_unique("ASPIRE's five-role RBAC follows least privilege")
dyci_lit = ("ASPIRE's grading, attendance, and honors rules are not independently defined; "
            "they implement DYCI's own institutional policy as published in the Student "
            "Handbook (Dr. Yanga's Colleges, Inc., 2025). Specifically, the Handbook is the "
            "source for the Computation of Grades (COG) templates, the grading-period "
            "progression, the transmutation scale, the Grace Pass provision, the "
            "attendance-based FDA threshold, and President's Lister eligibility criteria, "
            "all of which ASPIRE implements as configurable, auditable system rules rather "
            "than as researcher-defined policy.")
rbac_para.addnext(new_para_like(rbac_para, dyci_lit))

# ================= 3. Automated Faculty Loading and Scheduling (new RRS subsection) ========
grading_platforms_body = find_unique('Philippine institutions have developed automated '
                                     'grading systems')
loading_heading_template = find_exact('Automated Grade Computation and Transmutation Platforms')
loading_heading = new_para_like(loading_heading_template, 'Automated Faculty Loading and Scheduling')
loading_body = (
    "Manual, conflict-free faculty scheduling is a recurring burden for institutions each "
    "academic term (Austero et al., 2022). In their study of Philippine higher education "
    "timetabling, Austero et al. (2022) proposed a heuristically enhanced optimization "
    "algorithm that generated a conflict-free timetable for 1,700 events in under 15 seconds "
    "on average. How this work is organizationally assigned also varies by institution: at "
    "the University of Southeastern Philippines, for instance, the schedule of classes “is "
    "prepared by the Deans... and furnishes a copy to the Office of the University "
    "Registrar” (University of Southeastern Philippines, 2016), placing primary assignment "
    "with each college's Dean and record consolidation with the Registrar. ASPIRE reflects "
    "this same division of authority: Faculty Loading is scoped per college under the Dean, "
    "who works under an exclusive edit lock limited to their own college, while the "
    "Registrar's Enrollment and Loading module operates institution-wide, with full "
    "visibility of conflicts across every college.")
loading_body_p = new_para_like(grading_platforms_body, loading_body)
grading_platforms_body.addnext(loading_heading)
loading_heading.addnext(loading_body_p)

# ================= 4. Gemini 2.5 Flash justification (extends AI advising subsection) =======
gemini_para = find_unique('the AI Study Advising uses Gemini 2.5 Flash')
gemini_just = (
    "Google's own documentation describes Gemini 2.5 Flash as “our best model in terms "
    "of price and performance, [that] offers well-rounded capabilities” (Google, 2026), "
    "with a 1,048,576-token context window and native support for structured output, system "
    "instructions, and grounding. ASPIRE selects this model for AI Study Advising "
    "specifically for its structured-output support, which lets the model return the task "
    "drafts and diagnostics ASPIRE's advising pipeline expects in a fixed, parseable shape, "
    "and for its price-performance balance, which keeps per-call cost low enough for "
    "routine use across a student population without a dedicated AI budget.")
gemini_para.addnext(new_para_like(gemini_para, gemini_just))

# ================= 5. Table 2.11 + surrounding text: final respondent counts ===============
intro_old = find_exact(
    "The study takes place at DYCI, Bulacan, Philippines, with respondents recruited "
    "purposively from users of the five ASPIRE roles and a separate panel of IT experts. "
    "Proposed end-user targets are 40 students, 8 faculty members, and 1–3 Dean, "
    "Registrar, or administrator respondents (approximately 49–51 end users), with "
    "1–3 IT experts as a separate proposed group. These figures are recruitment "
    "targets, not finalized participation totals; actual numbers will be reported with the "
    "evaluation results.")
retext(intro_old, (
    "The study takes place at DYCI, Bulacan, Philippines, with respondents recruited "
    "purposively from users of the five ASPIRE roles and a separate panel of IT experts. "
    "End-user targets are finalized at 20 students, 9 faculty members, 9 Deans, 1 "
    "Registrar, and 1 administrator (40 end users total), with 1–3 IT experts as a "
    "separate group. These are the study's finalized respondent targets; actual "
    "participation will be reported with the evaluation results."))

crit_c = find_exact(
    "• (c) Deans, Registrars, and Administrators — academic administrators who "
    "have used the Dean Portal's Risk and Honors Overview, Escalated Cases, and "
    "Intervention Results modules; the Registrar Portal's Academic Setup, Enrollment and "
    "Loading, or Grade Records modules; or the Admin Portal's user provisioning and "
    "activity log modules, during the trial period.")
crit_d_itexperts = find_exact(
    "• (d) IT experts — IT faculty members, systems analysts, or professional "
    "software developers not involved in ASPIRE's development, qualified to assess the "
    "system's architecture, maintainability, and interoperability in addition to its "
    "user-facing behavior.")
new_c = ("• (c) Deans — academic administrators who have used the Dean Portal's "
         "Risk and Honors Overview, Escalated Cases, and Intervention Results modules "
         "during the trial period.")
new_d = ("• (d) Registrars — academic administrators who have used the Registrar "
         "Portal's Academic Setup, Enrollment and Loading, or Grade Records modules during "
         "the trial period.")
new_e = ("• (e) Administrators — academic administrators who have used the Admin "
         "Portal's user provisioning and activity log modules during the trial period.")
crit_f_text = ("• (f) IT experts — IT faculty members, systems analysts, or "
               "professional software developers not involved in ASPIRE's development, "
               "qualified to assess the system's architecture, maintainability, and "
               "interoperability in addition to its user-facing behavior.")

d_para = new_para_like(crit_c, new_d)
e_para = new_para_like(crit_c, new_e)
retext(crit_c, new_c)
retext(crit_d_itexperts, crit_f_text)
crit_c.addnext(d_para)
d_para.addnext(e_para)
# final order: crit_c(c) -> d_para(d, new) -> e_para(e, new) -> crit_d_itexperts(f)

# Table 2.11 (real) and Table 3.3 (Chapter 3 placeholder twin)
for tbl in root.iter(W + 'tbl'):
    rows = tbl.findall(W + 'tr')
    if not rows:
        continue
    header_cells = [vis_text(c) for c in rows[0].findall(W + 'tc')]
    if header_cells[:2] == ['Respondent Group', 'Proposed Target (N)']:
        for tr in rows[1:]:
            tcs = tr.findall(W + 'tc')
            label = vis_text(tcs[0]).strip()
            if label == 'Students':
                retext(tcs[1], '20')
            elif label == 'Faculty members':
                retext(tcs[1], '9')
            elif label == 'Deans, Registrars, and Administrators':
                reg_tr = etree.fromstring(etree.tostring(tr))
                admin_tr = etree.fromstring(etree.tostring(tr))
                retext(tcs[0], 'Deans')
                retext(tcs[1], '9')
                reg_tcs = reg_tr.findall(W + 'tc')
                set_cell_text(reg_tcs[0], 'Registrars')
                set_cell_text(reg_tcs[1], '1')
                admin_tcs = admin_tr.findall(W + 'tc')
                set_cell_text(admin_tcs[0], 'Administrators')
                set_cell_text(admin_tcs[1], '1')
                mark_row_inserted(reg_tr)
                mark_row_inserted(admin_tr)
                tr.addnext(reg_tr)
                reg_tr.addnext(admin_tr)
    elif header_cells[:3] == ['Respondent Group', 'Target', 'Actual']:
        for tr in rows[1:]:
            tcs = tr.findall(W + 'tc')
            label = vis_text(tcs[0]).strip()
            if label == 'Deans, Registrars, and Administrators':
                reg_tr = etree.fromstring(etree.tostring(tr))
                admin_tr = etree.fromstring(etree.tostring(tr))
                retext(tcs[0], 'Deans')
                reg_tcs = reg_tr.findall(W + 'tc')
                set_cell_text(reg_tcs[0], 'Registrars')
                admin_tcs = admin_tr.findall(W + 'tc')
                set_cell_text(admin_tcs[0], 'Administrators')
                mark_row_inserted(reg_tr)
                mark_row_inserted(admin_tr)
                tr.addnext(reg_tr)
                reg_tr.addnext(admin_tr)

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done, tracked=%s' % TRACKED)
