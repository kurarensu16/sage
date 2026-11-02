# Chapters 1–2 vs. the system — third pass, claim-by-claim

**Date:** 2026-10-30 · **Paper audited:** `ASPIRE_Chapters_1-2_Master_TRACKED_2026-10-30.docx`,
accepted view, after passes [1](THESIS_CODE_DIVERGENCE_2026-10-30.md) and
[2](THESIS_CODE_DIVERGENCE_2026-10-30_PASS2.md).

**The rule for this pass: the system is the source of truth and the paper follows
it.** Where the two disagree, the paper is wrong by definition — this is
documentation reverse-engineered from a working system, not a specification the
system failed to meet.

## What each pass could and could not find

| Pass | Direction | Finds | Blind to |
|---|---|---|---|
| 1 | paper → system | drift in what the paper already describes | anything the paper never mentions |
| 2 | system → paper | whole features with zero coverage | wrong *numbers* inside covered claims |
| **3** | **claim by claim** | **every checkable assertion, verified against code** | subjective wording |

Passes 1 and 2 compared *topics*. This one compares **values** — every number in
Tables 2.1–2.9, every module bullet against the live navigation, every security
claim against its implementation. That is where the remaining errors were.

**Method.** Nine numeric tables extracted from the document and diffed against
`riskEngine.js`, `academicPolicy.js`, `gradingMath.js` and
`officialGradingPresets.js`; all 50 sidebar-linked routes matched against the
paper text; all 65 module bullets matched back against the live navigation and
page files; `npm run verify:grading` run as an independent check.

---

## A. Numeric claims — verified against code

Every table checked value by value. **Six of nine are exactly right.**

| Table | Claim | Verdict |
|---|---|---|
| 2.1 COG templates | 5 templates, all component weights | ✅ exact match to `officialGradingPresets.js` |
| 2.2 Period computation | MR/TFR/SG formulas, Summer variant | ⚠️ formulas exact; **one rule missing** |
| 2.3 Transmutation scale | 98→1.00 … 75→3.00, below 75→5.00 | ⚠️ values exact; **presented as fixed, is configurable** |
| 2.4 Risk ceilings | 60 / 50 / 15 / 10, raw max 135, capped 100 | ✅ exact |
| 2.5 GWA deficit | 0 / 25–35 / 50–60 | ✅ exact |
| 2.6 Attendance | 0 / 10 / 25 / 50 at 0–1 / 2 / 3 / 4+ | ❌ **two rules missing** |
| 2.7 Recorded zeros | 0 / 10 / 15 at 0–1 / 2 / 3+ | ✅ exact |
| 2.8 Trajectory | 0 / 3 / 7 / 10 at ≤5 / >5–10 / >10–15 / >15 | ✅ exact |
| 2.9 Risk tiers | 0–24 / 25–49 / 50–74 / 75–100, labels | ✅ exact |

`npm run verify:grading` passes, confirming 5 presets, the policy scale,
attendance, honors, risk boundaries, milestone identity, Summer isolation and
**2,807 dynamic-threshold transmutations against the SQL twin**.

### A1. Table 2.6 omits the Summer amplifier — a published number is wrong

```js
// Summer term amplifier: absences are more impactful in compressed 6-week terms
if (isSummer && absenceCount >= attendancePolicy.warningAbsences && attendPoints < 50) {
  attendPoints = Math.min(50, Math.round(attendPoints * 1.5));
  attendDetail += " (Summer amplified)";
}
```

In a Summer term the attendance points in Table 2.6 are **multiplied by 1.5**,
capped at 50. So 2 absences scores 15, not 10, and 3 absences scores 38, not 25.
A reader computing a risk score by hand from the published table gets the wrong
answer for every Summer class.

This is the most consequential finding in the pass: it is not a missing feature
or loose wording, it is a **published number that does not match the system**.

### A2. Tables 2.3 and 2.6 are defaults, not constants

Both read as fixed institutional values. Both are configurable:

```js
export const PASSING_THRESHOLD_BOUNDS = Object.freeze({ min: 50, max: 94 });
export const FDA_ABSENCE_BOUNDS = Object.freeze({ min: 2, max: 10 });
export const DEFAULT_FDA_ABSENCES = 4;
```

The transmutation ladder is **built from** the passing threshold, not hard-coded,
and the attendance bands are derived as `fda − 2` / `fda − 1` / `fda`. Set the
FDA limit to 6 and Table 2.6 becomes 4 / 5 / 6. The published figures are the
DYCI defaults and should say so — the configurability is a design strength that
currently reads as a hard-coded limitation.

### A3. Table 2.2 omits the partial-milestone fallback

```js
const mr  = (p !== null && m !== null) ? Math.round((p + m) / 2) : (m ?? p);
const tfr = (sf !== null && f !== null) ? Math.round((sf + f) / 2) : (f ?? sf);
```

When only one of the two contributing periods is recorded, that one is used
alone rather than the milestone being withheld. Table 2.2 shows only the
two-period formulas, so the table cannot explain a milestone a reader sees
computed from a single period.

---

## B. Module inventory — 1:1

**50 sidebar-linked routes** checked against the paper: **48 covered.**
**65 module bullets** checked back against the live navigation and page files.

### B1. Admin → Student Account Requests is missing

`/admin/studentaccountrequests` is in the Admin sidebar under User Accounts and
has no bullet in the Scope. Pass 2 added it to the VTOC figure and the Admin DFD
but not to the module inventory, so the three disagree with each other.

### B2. The Dean now has two bullets for one page

Pass 2 added **Grade Change Requests** to the Dean's Grades module, which already
had **Grade Corrections**. They are the same page: `/dean/graderequests` and
`/dean/remarkoverriderequests` both render `DeanGradeChangeRequests`, and the old
`RemarkOverrideRequests.jsx` was deleted. The Dean's sidebar lists only Grade
Submission Status, Grade Change Requests and Grade Distribution — there is no
Grade Corrections link.

My own pass-2 edit created this duplicate. Merged in this pass.

### B3. Naming drift, for the owner to settle

The faculty workflow page the paper calls **Review and Post Grades** is titled
**Grade Computation Preview** in the running UI, and Figure 2.25's caption says
*Review & Post Grades*. Three names for one page.

Not changed here, because unlike everything else in this pass it is not a
question of fact: the page both previews and posts, so either name is defensible,
and changing it touches a figure caption and a screenshot. **The owner picks
one.** Every other module name in the paper matches either the page title or the
sidebar label — *Scorebook*, *Grade Columns Setup* and *Posted Grades and
Corrections* were each checked against the component and are correct.

---

## C. Confirmed accurate — recorded so the next audit does not redo it

- **Password policy** — 8+ characters with uppercase, lowercase, digit and
  symbol, matching `passwordPolicy.js` and the Supabase Auth setting.
- **Recovery code** — "time-limited 8-digit" is right; the code is 8 digits and
  `ForgotPassword.jsx` carries a comment about a past bug where hard-coding 6
  silently truncated real codes.
- **Risk engine** — all four weights, all four point bands, all four tiers and
  both tier label sets.
- **COG templates** — all five, every component weight.
- **Milestone formulas** — MR, TFR, SG and the Summer variant.
- **Transmutation values** — all nine rungs and the failing grade.
- All module bullets not listed in section B.

---

## D. Figures still outstanding

Updated and swapped in pass 3's companion work: 2.6, 2.8, 2.10, 2.11, 2.12,
2.14–2.17. **Still stale:**

| Figure | Why |
|---|---|
| 2.2 Student flowchart | join-by-code path; no grade change request; no Academic Insights |
| 2.3 Faculty flowchart | Create Classroom and Enrollment Requests, both retired |
| 2.4 Dean flowchart | no faculty loading; no dispute chain |
| 2.5 Admin flowchart | academic setup, which moved to the Registrar |
| 2.9 Faculty DFD | join codes; no grade change or consultation stores |
| 2.23 screenshot | shows the old *AI Study Tutor* label |

Six more are rendered and waiting for descriptions and numbers in
`docs/02-thesis/figures/rendered-pending-placement/`.

---

## E. Applied in this pass

A1, A2, A3, B1 and B2, as tracked changes. B3 is the owner's call. The AI
provider stays as the owner decided.
