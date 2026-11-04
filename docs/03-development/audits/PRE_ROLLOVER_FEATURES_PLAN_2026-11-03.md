# Hardening the grade change chain, and two AI features — implementation plan

**Date:** 2026-11-03 · **Status:** Plan, not implemented
**Blocks:** Pass B, the 1st → 2nd semester rollover

## Why this exists

Every piece here answers one question: **can a single person change a student's
grade, or let a student's intervention lapse, without anyone else seeing it?**

Until 2026-11-02 a Registrar could override an official grade with nobody else
ever being told. That is fixed. This plan closes the two remaining soft edges —
a dispute window with no real expiry, and an intervention that quietly outlives
the grading period it belongs to — and then adds the deterministic fallback
Objective 6 promises.

| | Phase | Blocks the rollover? | Size |
| - | ----- | -------------------- | ---- |
| 1 | An evaluation ends with its grading period, visibly | **Yes** | large |
| 2 | Every dispute closes 22 working days after rollover | **Yes** | small |
| 3 | Backup | — | — |
| 4 | Roll over | — | — |
| 5 | Deterministic AI fallback | no | large |
| 6 | AI unavailable message | no | small |
| — | Dean acknowledgement of Registrar overrides | — | **done, live** |

**Agreed order:** build 1 and 2 → roll over → then 5 and 6 once the rollover is
known good.

---

## The shape being built

| After the term closes | Editable? | Bounded by |
| --------------------- | --------- | ---------- |
| Intervention, and the referral raised from it | **No** | its own grading period being finalized |
| Grade change request on MR, TFR or SG | only inside the window | rollover + 22 working days |
| **Registrar override** | **Yes, always** | Dean acknowledgement, audit trail, outstanding count |

Each route is bounded by something one person cannot quietly move: a
finalization, an announced clock, or another role's signature.

**Why the rollover anchors the dispute window.** It is an announced event that
notifies every user, so the clock visibly starts for everyone at once. SG
posting was considered and rejected: it happens per class and quietly, so two
students in different classes would be on different clocks without either being
told.

**Why the override is never capped.** Once the term closes and the window
expires, it is the only remaining way to change an official record. Correcting
records months or years later is the Registrar's job. Capping it would not make
the system stricter — it would make it unable to fix its own mistakes.

---

## Phase 1 — An evaluation ends with its grading period, visibly

An intervention is scoped to a grading period. What ends it is that period being
**finalized** — not the rollover, which is only the backstop for anything never
finalized at all.

| Point | Scores | Evaluation |
| ----- | ------ | ---------- |
| MR **posted**, consultation window open | editable | **editable** — and the student is told to finish now |
| MR **finalized** | frozen by `trg_block_frozen_term_scores` | **read-only**, for student and faculty alike |
| Term **rollover** | class archived | anything still open is closed as the backstop |

### 1a. Warn the student when the milestone is POSTED

**The problem this solves.** Finalization has no fixed date — an instructor may
finalize an hour after posting or three weeks later. A student cannot plan
around a deadline nobody has told them about. So the warning goes out at
**posting**, which does have a date, giving them the whole posted-to-finalized
window to act.

**Only the two combined milestones exist.** There is no separate posting for
Prelim or for Semi-Final. MR covers **Prelim + Midterm** together, TFR covers
**Semi-Final + Final** together — `aspire_milestone_terms()` is that mapping —
so an evaluation is matched to its milestone by the `term` it targets.

**Targeted, never broadcast.** Only students who actually have an evaluation
that is unfinished, unverified or unfinalized on a period behind that milestone.
A student whose plan is complete hears nothing.

**Two messages, because two different people are being waited on.** Telling a
student to "complete it" when they have already done everything and are waiting
on their instructor would be both wrong and annoying:

| Student's state | Message |
| --------------- | ------- |
| Tasks still outstanding | *Your **Midterm Rating** has been posted and you still have unfinished tasks in your action plan. Complete them before your instructor finalizes this period. Once it is final the plan closes, and any question about your grade has to go through a formal grade change request instead.* |
| All reported, awaiting verification | *Your **Midterm Rating** has been posted. You have reported every task in your action plan and your instructor still has to verify them. Nothing more is needed from you.* |

Deduped per evaluation per milestone. The student's Faculty Action Plans page
also carries a persistent banner while the window is open, because a single
notification over a three-week window is easy to miss.

### 1b. Warn the faculty at FINALIZE

The finalize dialog lists the evaluations that will be closed:

> **3 action plans on this period are unfinished.** Finalizing closes them and
> records them as unfinished. Review them first, or finalize anyway.

**It warns, it does not block.** One unresolved intervention must not be able to
hold up a whole class's grade milestone — but the instructor should not find out
afterwards either.

### 1c. The lock

`aspire_frozen_terms(class_record_id)` already returns the terms behind every
finalized milestone, and an evaluation carries the `term` it targets. **Lock
when the target term appears in that list** — the same function the score guard
uses, so a grade and an intervention can never disagree about whether a period
is closed.

The lock applies to **student and faculty alike**: the student can no longer
tick tasks or attach evidence, the faculty can no longer verify or return. The
record stays fully readable — tasks, evidence, who verified what.

The **Dean referral** raised from that evaluation closes with it. A referral is
about a period's intervention, so it does not outlive it.

> Precedent: the evaluation period selector was already changed during pass A to
> offer only periods that are still open.

### 1d. What gets recorded, and for whom

Two outcomes, not one. The distinction matters because the label is visible to
the student, and *"unfinished"* against a student who did everything asked would
blame them for an instructor's omission.

| Situation | Recorded as |
| --------- | ----------- |
| Tasks outstanding, or reported but unverified | **Unfinished** |
| Every task verified, but no follow-up snapshot recorded | **Closed — tasks verified** |
| Follow-up snapshot recorded | unchanged; a real outcome exists |

**Never auto-complete.** An intervention nobody verified, recorded as verified,
is a **functional-correctness** defect — and functional correctness is one of
the ISO/IEC 25010 characteristics the Expert instrument scores against the
study's **80% threshold**. It is a threshold the study has to clear in front of
a reviewer, not a hypothesis question.

On close, notify the **student, the instructor and the Dean**. The Dean owns
intervention oversight and the Intervention Results dashboard.

### 1e. The rollover backstop

**Migration** `YYYYMMDDHHMMSS_close_unfinished_evaluations_on_rollover.sql`

- `AFTER UPDATE ON academic_terms`, guarded on `NEW.ended_at IS NOT NULL AND
  OLD.ended_at IS NULL` — mirroring `trg_archive_tutor_plans_on_rollover`.
- Scope: published evaluations (`status IN ('submitted',
  'acknowledged_by_student')`) in the ending term with no recorded closure.
  Drafts are left alone; a draft was never real.
- Applies the same two-outcome rule as 1d.

This catches evaluations on a milestone that was **posted but never finalized** —
exactly the MR-only and MR+TFR classes being carried into Pass B.

### 1f. Client

`src/pages/faculty/EvaluatedStudents.jsx` — `managementBlock()` returns
`'Class is inactive'` for any non-active class, which reads like a fault. It
should distinguish:

- archived class → **"Closed — the term has ended"**
- frozen period → **"This grading period is final"**

---

## Integration audit — how phase 1 lands without breaking what works

Phase 1 touches the most interconnected part of the system. This section is the
survey done before writing any of it.

### Where it hooks, and what it must not touch

| Hook | Why there |
| ---- | --------- |
| **INSERT on `grade_consultation_windows`** → the posting warning | A window is opened automatically by a trigger when MR or TFR is posted. That insert *is* "a milestone was posted", and it carries `class_record_id` and `grade_period` already. |
| **UPDATE of `finalized_at` on `grade_consultation_windows`** → the lock and closure | `finalize_grade_milestone()` sets exactly this. Hooking the column rather than the function means a future second finalize path cannot bypass it. |
| **UPDATE of `ended_at` on `academic_terms`** → the backstop | Mirrors `trg_archive_tutor_plans_on_rollover`, already proven. |

**`post_grade_milestone_v2` is not edited.** It is 180 lines and has already been
rewritten in place once, by `20261029040940`'s live-definition substitution —
which is exactly how the repo's source came to disagree with the deployed
database and cost an afternoon on 2026-10-31. The consultation-window insert
gives the same signal without opening that function.

### The risk that nearly broke the design

`record_intervention_followup` requires a milestone **posted after** the
evaluation was published, and `followupBlock()` currently says *"Available after
the next grading period (MR, TFR, or SG) is posted."* The lock fires at
**finalization**. So the only window in which a follow-up can ever be recorded
is **posted → finalized**.

That is intended — it is why 1a and 1b exist — but it has two consequences:

- `followupBlock()`'s message must change once the period is frozen. *"Available
  after the next grading period is posted"* would be a lie: it will never
  become available. It must read **"This grading period is final — the plan
  closed without a recorded outcome."**
- `scripts/verifyEvaluationTracking.js` asserts follow-up eligibility and must
  be extended, not left to pass by accident.

### Eleven readers of `student_risk_evaluations`

`auditLogPresentation`, `classRoomService`, `evaluationService`, the Dean's
`AtRiskStudents` / `Dashboard` / `SummaryReports`, faculty `Dashboard`, student
`AcademicInsights` / `Dashboard` / `FacultyAdvisingInbox`, and
`verifyEvaluationReferrals.js`.

- **Columns are additive and nullable**, so every existing read keeps working.
- **`status` is NOT extended.** Its three values (`draft`, `submitted`,
  `acknowledged_by_student`) are checked in RLS policies, RPC guards and client
  filters. Adding a fourth would silently drop closed evaluations out of every
  one of those filters — a hidden-row failure, which this codebase has already
  produced four times (B-01, B-02, B-04, B-11) and which reads on screen as
  absence rather than as an error.
- `summarizeInterventionOutcome()` reports **"In intervention"** whenever there
  is no follow-up snapshot. A closed evaluation would sit there forever saying
  it is ongoing, so it must learn the two closure states.

### Four RPCs need the lock

`set_advising_task_completion_with_evidence` (student), `verify_intervention_task`
and `record_intervention_followup` (faculty), `refer_student_evaluation_to_dean`.

The check is one shared expression — the evaluation's `term` appearing in
`aspire_frozen_terms(class_record_id)` — so there is **one definition**, the same
one the score guard uses. A disabled button is a courtesy; these are the control.

### Notifications are transactional, deliberately

The closure and its notifications go in the **same transaction** as the
finalization. A swallowed notification is precisely the shape of B-02 and B-04,
where an action reported success while its side effect had been refused. Dedupe
is handled by `ON CONFLICT (dedupe_key) DO NOTHING`, which is the only realistic
conflict.

The trade-off is explicit: a finalization can fail because a notification could
not be written. That is the right way round — a student silently never told
their plan closed is worse than an instructor retrying a finalize.

### Order of work

1. Columns, constraint, and the closure-state helper — inert on their own.
2. The two guards (finalization lock, four RPCs) — behaviour change, no data change.
3. The closure trigger and its notifications.
4. The posting warning.
5. The rollover backstop.
6. Client: finalize dialog, `followupBlock` wording, `managementBlock` wording, student banner.

Steps 1–2 are reversible without data loss. Step 3 writes closure rows for the
first time, so it is the point of no easy return and runs on a backed-up database.

### Verification

Catalog assertions in each migration: trigger attached, both outcome values
accepted, drafts provably out of scope, and the four RPCs provably carrying the
frozen-term check. `verifyEvaluationTracking.js` extended for the two closure
states. Then Pass B checks for the posted warning, the finalize warning, the
lock on both sides, and the two outcomes.

> **Pass B check to amend.** *"Unresolved 1st-semester work — an open referral,
> an unfinalized window — stays actionable"* no longer matches: a referral now
> closes with its evaluation. The unfinalized-window half still stands.

---

## Phase 2 — Every dispute closes 22 working days after the rollover

A value change, not a code change. `aspire_dispute_deadline()` already anchors
exactly where it should:

```sql
SELECT public.aspire_add_school_days(t.ended_at, t.dispute_grace_days)
```

So the whole phase is:

```sql
UPDATE academic_terms SET dispute_grace_days = 22;
ALTER TABLE academic_terms ALTER COLUMN dispute_grace_days SET DEFAULT 22;
```

**Every term, and the default too** — otherwise 2nd semester, the term the panel
sees in Pass C, quietly runs on a different clock from the archived one.

### The shape this produces

Every milestone is posted at a different time but they all expire together, so
**the earlier a grade was posted, the longer a student has to question it** —
proportionate to how long that grade has been affecting them.

| Milestone | Posted | Total window |
| --------- | ------ | ------------ |
| **MR** | around mid-term | longest |
| **TFR** | later in the term | shorter |
| **SG** | at the end | **22 working days**, the floor |

`aspire_add_school_days` guarantees the deadline lands Mon–Fri, so a window
never expires on a day nobody can act on. 22 working days is roughly 30 calendar
days from a Monday.

`DISPUTABLE_MILESTONES` admits MR, TFR and SG; all three share this deadline.
None is special-cased and none is left unbounded.

### Pass B note

`pending_registrar_review` has never been reached in the system's history. To
exercise it, one dispute needs a term with `dispute_grace_days = 0`, or a window
that has genuinely closed.

---

## Phase 3 — Backup

Stage 9d, encrypted, no plain-text option. The rollover is the least reversible
action in the whole plan.

---

## Phase 4 — Roll over · the owner runs this

Pass B, with the 1st semester in the agreed shape: every class fully scored,
posted to **three different depths** (MR only; MR+TFR; MR+TFR+SG), one
consultation window unfinalized, one Dean referral unresolved, and at least one
open dispute.

Phase 1's backstop trigger gets exactly **one** real test here. Pass D is a
second chance, but it falls after the defense.

---

## Phase 5 — Deterministic AI fallback

### This is the real Objective 6

Objective 6 promises *"non-binding AI Study Advising that uses authorized
academic evidence available to the student **and a deterministic fallback**"*.
Neither AI path has one — QA bug **B-06**. A retry message does not satisfy that
wording; this does.

### Every input already exists

| Source | Gives |
| ------ | ----- |
| `class_activities` | `name`, `description`, `topic_tag`, `activity_type` |
| `activity_resources` | faculty-attached links/files, `label` + note, `https` enforced at the column |
| `search_destinations` | admin-curated `url_template` with `{q}`; `CHECK` forces `https` and the placeholder |
| `student_activity_scores`, `student_term_scores` | which activities this student actually did badly on |

Nothing new is stored. The fallback reads the same evidence the AI reads, which
is what makes it defensible rather than a consolation prize. The tutor edge
function already states the rule: *"Links reach students only from
faculty-attached resources and from search URLs this system builds out of the
admin-curated `search_destinations` table."*

### The rules

1. **Rank** scored activities by `score / max_score`, weakest first, within
   periods that are still open.
2. **Group** by `topic_tag`. A tag carrying two weak activities outranks a tag
   carrying one — a pattern beats a single slip.
3. For the top three topics emit:
   - **What to study** — the `topic_tag` and the instructor's own `description`.
   - **What your instructor gave you** — `activity_resources`, listed first,
     because a human chose them.
   - **Where to look** — `search_destinations` templates with `{q}` filled from
     the topic tag and subject code.

Same inputs, same output, every time. No provider and no generation, so
**nothing in it can be wrong**: every link is faculty-attached or
administrator-sanctioned. A panelist asking *"what if the AI hallucinates a
resource?"* gets a concrete answer — the fallback cannot, and here it is.

### Decided: it renders always

Beside the AI answer, not only on failure. More useful, never first exercised at
the worst possible moment, and demonstrable in Pass C without breaking the AI to
show it.

### Shape

- `src/lib/deterministicAdvice.js` — pure rules, **no Supabase import**, so a
  verify script can load it in Node.
- `scripts/verifyDeterministicAdvice.js` + `npm run verify:advice`. Fixtures:
  no scores; all perfect; a tie between tags; an activity with no `topic_tag`;
  a topic with no resources; a student enrolled in nothing.
- A service function fetching the four sources and feeding the rules.
- One shared panel on **AI Study Advising** and on **Academic Insights**.
- Close **B-06**; update Objective 6's line in the QA checklist.

---

## Phase 6 — AI unavailable message

`src/lib/aiFallbackMessage.js` already exists in the working tree, **unwired**.
It normalises any AI failure into a title, a plain-English message, a hint and a
retry flag, and guarantees no status code, provider name, model id or function
name reaches a user.

Under phase 5 it becomes the last layer: what shows when even the deterministic
fallback cannot load. Three consumers — `AskAspirePanel`, `StudentRisk` and
`StudyTutor`. Server-side messages are already student-safe and are preserved
when they read like prose; the helper only replaces text carrying a status code,
an `underscore_identifier` or a stack-ish fragment.

---

## Definition of done

- `npm run lint` at **0 errors**, `npm run build` passes, every `verify:*`
  script passes including the new one.
- Each migration carries catalog verification that fails loudly.
- The QA checklist gains checks for phases 1, 5 and 6; the referral line in
  Pass B is amended; **B-06** is closed.
- No user-facing string anywhere carries a status code, provider name, model id
  or function name.
- No route can change a grade without either a second person or an **announced**
  clock that a single person cannot move.
- No intervention closes without the student having been told, in advance, that
  it was about to.
