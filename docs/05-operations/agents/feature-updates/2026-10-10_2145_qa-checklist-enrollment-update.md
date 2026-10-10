# QA checklist updated for enrollment approval and roster notices

- **Date:** 2026-10-10 21:45 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish (documentation only; no system behavior change)
- **Migration:** None

## Files changed
- `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`

## What changed and why
The owner asked for the QA checklist to cover the new enrollment features before the team tests them. The cases themselves (B10a EJ-01 to EJ-14, B10b EN-01 to EN-08) and the migration preconditions were already added. This update makes them runnable and release-relevant:

- **Purpose summary:** Part B now lists the follow-up review rule, re-evaluation, mobile menu and install card, class-code join approval (B10a), and section enrollment with roster notices (B10b).
- **Setup:** test data for B10a/B10b (a block section with two active classes under different faculty, an irregular student, a non-enrolled student, a 5-student CSV, a non-assigned faculty account, a class with a posted MR, the class codes).
- **Android line:** test the **PWA** in this run, not the hosted APK (older build, rebuilt after QA), per the owner's PWA-first decision.
- **Release gates:** new gates for the follow-up review rule, re-evaluation, B10a, B10b, notification privacy and no-email, and the mobile menu and install card.
- **Execution order:** step 1 lists the applied migrations and the two to apply in order (`20261010150000` → `20261010160000`). B10b and B10a run before the B1–B4 intervention flow, and EJ-12 after a posted MR.

## How to verify
Open the checklist: the purpose, §0 Setup, Release Gates, and Recommended Execution Order reflect the items above.
