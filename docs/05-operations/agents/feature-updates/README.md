# Feature updates: change records

Every change made to ASPIRE while the change freeze is **ON** gets its own file in this folder. Rules: `AGENTS.md` (change freeze, rule 4). How the freeze works: [`../CHANGE_FREEZE_GUIDE.md`](../CHANGE_FREEZE_GUIDE.md).

## Rules
- **One file per change topic**, created in the same change as the code it describes. If a session touches several unrelated things, create one file per topic.
- **File name:** `YYYY-MM-DD_short-topic.md` (lowercase, hyphens), e.g., `2026-10-12_fix-attendance-count.md`. If the name is taken, add `-2`.
- **Files changed:** list every path in backticks. `npm run audit:freeze` matches on these exact paths.
- **AI tool:** `Claude Code`, `Codex`, `Gemini CLI`, `Cursor`, etc. (plus model if known), or `Manual` when no AI was used.
- **Approved by (device owner):** the output of `git config user.name` and `git config user.email` on the device where the change was approved. If either is empty, ask the developer; never guess.
- **Type:** `Fix`, `Polish`, or `New feature (approved outside the documented flow)`.
- **Records are permanent.** Don't edit or delete an existing record; a correction is a new file that references the earlier one.

**Audit baseline:** commit `b977c7d` (2026-10-09), the last commit before the freeze. Every code file changed after it must appear in a record here.

## Template

Copy this into a new file:

```markdown
# <Short title>

- **Date:** YYYY-MM-DD
- **AI tool:** Claude Code (model) | Codex | Gemini CLI | Cursor | Manual
- **Approved by (device owner):** <git user.name> (<git user.email>)
- **Type:** Fix | Polish | New feature (approved outside the documented flow)
- **Migration:** `<file>.sql` (applied / to apply) | None

## Files changed
- `path/to/file`

## What changed and why
<Which documented flow it fixes, what was wrong, and what changed.>

## How to verify
<Test-checklist case IDs, or short steps.>
```
