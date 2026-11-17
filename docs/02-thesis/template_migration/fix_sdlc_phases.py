"""Add a 'meaning of the stage' opening sentence to each of the 8 SDLC phase
paragraphs (Phase 1 Initial Planning ... Phase 8 Planning (Next Iteration)) in
System Development Methodology, so each paragraph reads as: (1) what the stage
means in general SDLC terms, then (2) what the team specifically did for it.
No existing sentence is removed; the definition sentence is prepended, with the
original first sentence lightly adjusted to flow into it. Confirmed in chat.

Supports the same tracked/clean convention as the other fix_*.py scripts.
Run: py fix_sdlc_phases.py <in.docx> <out.docx> [--tracked]
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
AUTHOR, DATE = 'Claude Code', '2026-11-14T20:00:00Z'


class Ctx:
    def __init__(self, tracked):
        self.tracked = tracked
        self.n = 107000

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
    for r in runs:
        par = r.getparent()
        pos = list(par).index(r)
        par.remove(r)
        d = ctx.mark('del')
        d.append(r)
        par.insert(pos, d)
        for t_el in r.findall(W + 't'):
            t_el.tag = W + 'delText'
    ins = ctx.mark('ins')
    newr = etree.SubElement(ins, W + 'r')
    newr.append(copy.deepcopy(rpr))
    t = etree.SubElement(newr, W + 't')
    t.text = text
    t.set(XML_SPACE, 'preserve')
    p.append(ins)


zin = zipfile.ZipFile(IN)
files = {n: zin.read(n) for n in zin.namelist()}
root = etree.fromstring(files['word/document.xml'])
all_p = list(root.iter(W + 'p'))


def find_unique(snippet):
    hits = [p for p in all_p if snippet in vis_text(p)]
    assert len(hits) == 1, (snippet[:70], len(hits))
    return hits[0]


EDITS = [
    (
        "The researchers used preliminary faculty and student surveys to identify "
        "requirements for academic tracking",
        "Initial Planning establishes the project's overall goal, scope, and "
        "foundational decisions before any development cycle begins. The "
        "researchers used preliminary faculty and student surveys to identify "
        "requirements for academic tracking, then defined the five operational "
        "roles: Student, Faculty, Dean, Registrar, and Admin. The system stack "
        "consists of React/Vite, Supabase (PostgreSQL with authentication and "
        "applicable RLS policies), and Gemini 2.5 Flash for advisory diagnostics. "
        "Research evaluation adopts TAM and ISO/IEC 25010:2023 through separate "
        "Expert and End-User instruments; intervention outcome verification "
        "examines recorded GWA differences, risk transitions, and task "
        "completion calculations."
    ),
    (
        "At the start of each iteration, the researchers defined the goals, "
        "deliverables, and tasks for that increment",
        "At the start of each iteration, Planning defines that cycle's specific "
        "goals, deliverables, and tasks, scoping one increment out of the "
        "overall system. The researchers mapped these to ASPIRE's timeline. "
        "Modules were sequenced as single-tenant authentication and role-based "
        "routing, the grading engine, the Academic Risk Scoring Engine, and "
        "finally the HITL evaluation workflow and AI Study Advising pipeline."
    ),
    (
        "The requirements analysis considered DYCI's Student Handbook and COG "
        "templates, program-specific grade components, grading-period posting, "
        "authorized SG corrections",
        "Requirements for that iteration's increment are gathered and "
        "specified, covering both functional needs and quality attributes. The "
        "requirements analysis considered DYCI's Student Handbook and COG "
        "templates, program-specific grade components, grading-period posting, "
        "authorized SG corrections, attendance rules, and honors eligibility. "
        "The functional scope covers five-role RBAC, subject-assigned dynamic "
        "COG computation, student-specific score recording with required "
        "activity metadata, live risk-scoring explanations, and "
        "faculty-managed academic intervention. Quality considerations cover "
        "authenticated access, data security, correct grade arithmetic, "
        "interface responsiveness, and auditable modification workflows."
    ),
    (
        "The requirements were translated into a technical blueprint covering "
        "user-role workflows",
        "The specified requirements are translated into a technical blueprint "
        "that will guide implementation, covering user-role workflows, "
        "database schema, interface layouts, system architecture, and process "
        "flows. ERDs mapped the database layers: user identity, class records, "
        "activities with mandatory metadata, posted grades, attendance, risk "
        "evaluations with baseline and follow-up snapshots, intervention tasks "
        "and escalations, and the system activity log."
    ),
    (
        "Modules were built incrementally in this order: single-tenant and "
        "Supabase Auth",
        "The design is built into working code, producing one tested, "
        "functional increment per cycle. Modules were built incrementally in "
        "this order: single-tenant and Supabase Auth; the COG-compliant "
        "Scorebook module with mandatory Activity Title and Description "
        "metadata; the Grade Computation Preview; the four-factor Risk Scoring "
        "Engine; the HITL Evaluate Student modal with baseline snapshot "
        "capture; the AI Study Advising with domain-grounded prompts and a "
        "deterministic local fallback; the Faculty-Dean Collaboration Queue; "
        "the Intervention Results tracker; and the Audit Log and Grade "
        "Override workflows."
    ),
    (
        "Isolated grading-function checks covered all five COG weight sets",
        "Each increment is verified against its requirements before being "
        "integrated into the system, catching defects early rather than after "
        "full deployment. Isolated grading-function checks covered all five "
        "COG weight sets, component pooling, transmutation boundaries, "
        "regular/summer grading-period calculation, and NULL-versus-zero "
        "behavior. Risk-function checks covered score ceilings, "
        "classification boundaries, and percentage-point trajectory "
        "thresholds. Additional integration checks are required for the "
        "distinct grade-entry and persisted-roster behavior on partially "
        "entered grading periods and for database-level score constraints; "
        "code-level calculation checks alone are not proof of all end-to-end "
        "behaviors. Final analytics verification must also cover configured "
        "component averages, regular and Summer term progression, per-class "
        "attendance threshold counts, released-activity filtering, honors "
        "blockers, evidence-coverage and unavailable states, and equality "
        "between displayed and exported comparison values."
    ),
    (
        "TAM-based surveys measured Perceived Ease of Use (PEOU) and Perceived "
        "Usefulness (PU) and identified usability adjustments",
        "Completed increments are assessed by users against usability and "
        "effectiveness criteria, surfacing issues for the team to act on in "
        "later cycles. TAM-based surveys measured Perceived Ease of Use (PEOU) "
        "and Perceived Usefulness (PU) and identified usability adjustments "
        "and formula discrepancies for later cycles."
    ),
    (
        "Evaluation insights fed the next cycle's goals, prioritizing the AI "
        "Study Advising's deterministic fallback",
        "Findings from evaluation feed directly into planning the next "
        "iteration, closing the cycle so the system evolves from real "
        "feedback rather than assumptions. Evaluation insights fed the next "
        "cycle's goals, prioritizing the AI Study Advising's deterministic "
        "fallback, the risk triage roster auto-sort, and the Dean's dual-tier "
        "Risk and Honors Analytics Matrix."
    ),
]

for snippet, new_text in EDITS:
    p = find_unique(snippet)
    retext(p, new_text)

files['word/document.xml'] = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', files.pop('[Content_Types].xml'))
    for n, b in files.items():
        z.writestr(n, b)
print('done, tracked=%s, edits=%d' % (TRACKED, len(EDITS)))
