# ASPIRE — Student Running GWA (Tentative): Decision Record
> **Document Type**: Decision Record
> **Audience**: ASPIRE Capstone Team
> **Date**: October 11, 2026
> **Status**: Approved by the owner and implemented

---

## 1. Decision

Students see a **tentative running GWA** before their grades are posted. It is computed from the scores their instructors have recorded, using each subject's COG template. Posted milestones always replace the live values, and the number is labeled **Tentative** until every subject's Semestral Grade (SG) is posted, after which it shows as **Official**.

This supersedes the Capstone 1 panel note recorded in [CAPSTONE_DEFENSE_TRANSCRIPT_ANALYSIS.md](../defense/CAPSTONE_DEFENSE_TRANSCRIPT_ANALYSIS.md), §2.2 item 1: "Continuous real-time daily term grade recalculations will be removed from the student portal." That document is kept unchanged as the historical record of the ruling.

---

## 2. Why

- **The student side of early warning was empty.** Faculty can post only three milestones (MR, TFR, SG; enforced by `post_grade_milestone_atomic`). Until the MR was posted, about half the semester, students saw "—" on the dashboard, the Grade Report, the Score Breakdown, and the AI Study Tutor. An early warning system cannot warn a student who sees no standing.
- **The paper already describes it.** Chapters 1–2 say the dashboard shows "the student's current available GWA", "the running GWA", and "a live Risk Indicator Badge". The grading rules say "A running milestone derived from one available period is provisional." Only the "posted or released data only" sentences described the stricter behavior.
- **Faculty already see it.** The faculty roster computes the same live grade (`computeTentativeGradeDetails` in `src/lib/riskEngine.js`). Students now see the same number their instructor sees.

---

## 3. How it works

### 3.1 Label stages

| State of the student's subjects | Dashboard label | Status line |
|---|---|---|
| Nothing posted, scores recorded | Current Running GWA · **Tentative** | No grades posted yet |
| MR posted in a subject | Current Running GWA · **Tentative** | Midterm Rating posted · later terms live |
| MR and TFR posted, SG pending | Current Running GWA · **Tentative** | Awaiting Semestral Grade |
| SG posted in every subject | **Official GWA** | the standing (e.g., Satisfactory) |
| No scores recorded | Current Running GWA | No scores recorded yet |

### 3.2 Safeguards

1. **Posted milestones override live terms.** A posted MR replaces the live Prelim and Midterm, and a posted TFR replaces the live Semi-Final and Final. A posted SG is the official grade, including any audited admin override (`effective_grade`).
2. **Blank activities are not counted yet.** The live grade uses recorded scores only. At posting, faculty may convert remaining blanks to zero, which can lower the official grade. Every place that shows the tentative GWA says so and shows how many activities are still blank.

### 3.3 Where it appears

| Page | What the student sees |
|---|---|
| Dashboard | GWA card with a Tentative or Official pill; the ⓘ explains both safeguards and the repost rule |
| Grade Report | Unposted MR, TFR and SG shown live and marked Tentative; cumulative running GWA with a note. **The printed grade slip shows posted grades only.** |
| Score Breakdown | Live period grade, Sum Total and Semestral Summary, each marked Tentative; a period inside a posted MR or TFR is marked "Included in the posted …" |
| AI Study Tutor | Hero card, honors check and Ask ASPIRE context use the running grade |

The shared computation is `src/lib/studentRunningGrade.js`.

---

## 4. Related decisions made with it

- **AI Standing is computed live.** The dashboard verdict (Safe, Struggling, At Risk) uses the same deterministic rule as the AI Study Tutor (`computeAcademicVerdict` in `src/lib/academicPolicy.js`), from the running GWA and attendance, with no AI call. It is marked "tentative" until every SG is posted.
- **FDA is counted per subject.** Only a subject with 4 or more absences of its own counts as FDA risk. The earlier "4 absences across all subjects" condition was removed (`countFdaSubjects`).
- **AI insights limit AI usage.** The overall AI insight is created on first use and regenerates automatically only when a grade is posted (or the insight format changes). Newer activity scores alone wait for the student to click **Refresh**. The dashboard's Academic Insights ⓘ explains how to refresh.
- **Ask ASPIRE uses the running data:**
  - It quotes the running GWA as tentative and cites actual scores, weakest first, in plain-text numbered lists.
  - It receives up to 40 activities per subject, plus class standing, exam and character averages.
  - Insights use a short format: one sentence and up to 3 steps.
  - It now uses backup models like the faculty AI drafts, and the President's List subject floor is stated unambiguously (worse than 2.00 fails).
- **Admin override email.** An SG override now sends a `grade_changed` notification with full details, so the student and guardian emails read "Grade updated — <subject>".

---

## 5. Known difference (accepted)

After an admin overrides a posted SG, the faculty roster and Dean pages keep showing the grade computed from scores, while the student sees the official override. The student and the instructor are both notified, and the Activity Log keeps the reason. Before an SG is posted, faculty and Dean pages intentionally show live scores so they react to corrections immediately.

---

## 6. Defense answer

> "Students see a **tentative** running GWA computed by the same engine the faculty roster uses. It is always labeled unofficial and warns that blank activities are not counted yet. It is replaced by the posted milestone the moment faculty post. Without it, students would have no standing for half the semester, and an early warning system could not warn them. Official grades remain faculty-posted milestones only, and the printed grade slip shows posted grades only."

---

## 7. Change records

- [2026-10-11_1952-01_student-running-gwa.md](../../05-operations/agents/feature-updates/2026-10-11_1952-01_student-running-gwa.md)
- [2026-10-11_1952-02_admin-override-email.md](../../05-operations/agents/feature-updates/2026-10-11_1952-02_admin-override-email.md)
- [2026-10-11_2003-01_ask-aspire-reply-length.md](../../05-operations/agents/feature-updates/2026-10-11_2003-01_ask-aspire-reply-length.md)
- [2026-10-11_2003-02_ask-aspire-fallback-models.md](../../05-operations/agents/feature-updates/2026-10-11_2003-02_ask-aspire-fallback-models.md)
- [2026-10-11_2023_live-ai-standing-per-subject-fda.md](../../05-operations/agents/feature-updates/2026-10-11_2023_live-ai-standing-per-subject-fda.md)
- [2026-10-11_2039_academic-insight-format-and-refresh.md](../../05-operations/agents/feature-updates/2026-10-11_2039_academic-insight-format-and-refresh.md)
- [2026-10-11_2045_ask-aspire-subject-floor-wording.md](../../05-operations/agents/feature-updates/2026-10-11_2045_ask-aspire-subject-floor-wording.md)
