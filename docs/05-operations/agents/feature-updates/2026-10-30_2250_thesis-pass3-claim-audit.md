# Thesis pass 3 — claim-by-claim audit against the code

- **Date:** 2026-10-30 22:50 (Philippine time)
- **AI tool:** Claude Code (Opus 5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Fix
- **Migrations:** none

## Files changed

- `docs/02-thesis/audits/THESIS_CODE_DIVERGENCE_2026-10-30_PASS3.md` (new)
- `docs/README.md`
- `ASPIRE_Chapters_1-2_Master_TRACKED_2026-10-30.docx`
- `ASPIRE_Chapters_1-2_UPDATES_ONLY_2026-10-30.docx`

## Why a third pass found anything at all

Passes 1 and 2 compared **topics** — what the paper describes, and what it fails
to mention. Neither could catch a claim that is present, on the right subject,
and numerically wrong. This pass compared **values**: every number in Tables
2.1–2.9 against `riskEngine.js`, `academicPolicy.js`, `gradingMath.js` and
`officialGradingPresets.js`; all 50 sidebar-linked routes against the text; all
65 module bullets back against the live navigation.

Six of the nine tables are exactly right. The ones that were not are below.

## The finding that matters

**Table 2.6 is wrong for every Summer class.** The risk engine multiplies
attendance points by 1.5 in a Summer term, capped at 50:

```js
if (isSummer && absenceCount >= attendancePolicy.warningAbsences && attendPoints < 50) {
  attendPoints = Math.min(50, Math.round(attendPoints * 1.5));
}
```

Two absences score 15, not the published 10. Three score 38, not 25. A reader
recomputing a risk score by hand from the table gets the wrong answer. This is
not a missing feature or loose wording — it is a published number that does not
match the system, and it is exactly what a panel would check.

## The rest

**Tables 2.3 and 2.6 read as institutional constants; both are derived from
configurable settings.** The transmutation ladder is built from a passing
threshold settable between 50 and 94, and the attendance bands from an FDA limit
settable between 2 and 10 (`PASSING_THRESHOLD_BOUNDS`, `FDA_ABSENCE_BOUNDS`).
The published figures are DYCI's defaults. Worth saying plainly: the
configurability is a design strength that currently reads as a hard limit.

**Table 2.2 omits the single-period fallback.** `(m ?? p)` and `(f ?? sf)` — when
only one contributing period is recorded the milestone uses that one rather than
being withheld, which is why a milestone can appear before both its periods
exist.

**Admin → Student Account Requests** was in the sidebar, in the VTOC figure and
in the Admin DFD, but had no bullet in the Scope, so the three disagreed.

**The Dean had two bullets for one page** — *Grade Corrections* and *Grade Change
Requests*. `/dean/graderequests` and `/dean/remarkoverriderequests` both render
`DeanGradeChangeRequests`, and the old page was deleted. **My own pass-2 edit
created that duplicate**; it is now merged with a sentence saying the two arrive
in one queue.

## Left for the owner

The faculty page the paper calls **Review and Post Grades** is titled **Grade
Computation Preview** in the UI, and Figure 2.25's caption says *Review & Post
Grades*. Three names for one page. Not changed, because unlike everything else
in this pass it is not a question of fact — the page both previews and posts, so
either name is defensible, and changing it touches a caption and a screenshot.

*Scorebook*, *Grade Columns Setup* and *Posted Grades and Corrections* were each
checked against their components and are correct.

## Recorded as verified

So a later audit does not redo it: the password policy and the 8-digit recovery
code, all four risk weights, all four point bands, all four tiers and both label
sets, all five COG templates with every component weight, the MR/TFR/SG formulas
and the Summer variant, and all nine transmutation rungs.

`npm run verify:grading` passes, checking 2,807 generated transmutations against
an independent SQL implementation.

## Verification

Paragraphs 785 → 833. Both documents validate clean, and the full document still
passes `--author "Claude Code"`: every text difference inside a revision mark.
