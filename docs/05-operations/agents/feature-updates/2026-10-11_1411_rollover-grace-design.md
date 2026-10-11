# Rollover and unposted grades: grace-period design approved

- **Date:** 2026-10-11 14:11 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish (documentation only; no system behavior change yet)
- **Migration:** None (planned for Batch 2)

## Files changed
- `docs/03-development/audits/ADMIN_SETUP_AUDIT_2026-10-11.md`

## What changed and why
The owner asked how unposted SGs should be handled when the admin rolls over the term. They considered two alternatives: the admin posting the SG for a non-compliant instructor, and auto-posting after one month. Both were set aside because grades must stay the instructor's (human-in-the-loop), and auto-posting would create unreviewed official grades.

Approved design (audit §5.11):
- The pre-rollover list of classes without a posted SG, with reminders. The rollover is refused without next-term sections.
- A **30-day grace period** per term. Unposted classes stay **open as previous-term Pending**, then **Overdue** (shown to the Dean).
- SG labels: **On time / Late / Late (overdue)**.
- The class is **archived when its SG is posted**. After that it's view-only, and SG changes go through SG correction (Dean approval).
- **Read-only history by term** for students (unposted stays in My Subjects marked *Grade not yet posted*; posted moves to history, with the existing New Grade Posted notification), faculty (Past Archives), and the Dean (term selector, Grade Submission Status).
- No admin-made or automatic grades.

Freeze classification for Batch 2: the grace period, the labels, and open-until-posted are **New feature (approved outside the documented flow)**; rollover safety, history views, and the pre-check are **Fix**.

## How to verify
Audit §5.11 contains the design; R3 in §4 points to it.
