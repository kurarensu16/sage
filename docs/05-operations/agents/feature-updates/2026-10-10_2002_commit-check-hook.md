# Commit check: block commits with unrecorded code changes

- **Date:** 2026-10-10 20:02 (Philippine time)
- **AI tool:** Claude Code (Opus 5.5)
- **Approved by (device owner):** ghostbyte1014 (ghostbyte1014@gmail.com)
- **Type:** Polish (developer tooling; no system behavior change)
- **Migration:** None

## Files changed
- `.githooks/pre-commit`
- `package.json`
- `scripts/freezeAudit.js`
- `docs/05-operations/agents/CHANGE_FREEZE_GUIDE.md`

## What changed and why
The AI rules in `AGENTS.md` are guidance, so a manual edit or an agent that ignores them could still commit an undocumented change. A git pre-commit hook now runs `npm run audit:freeze` before every commit and **blocks the commit** when any code file changed since the freeze baseline has no change record in this folder. This applies whether an AI or a person made the change.

- `.githooks/pre-commit`: runs the audit and prints how to fix a blocked commit. It lets the commit through, with a notice, if Node.js is missing.
- `package.json`: a `prepare` script sets `git config core.hooksPath .githooks` on `npm install`, so every developer gets the hook automatically. It fails silently where git is unavailable.
- `scripts/freezeAudit.js`: passes immediately when `AGENTS.md` says `FREEZE: OFF`, so the audit and the hook follow the freeze switch.
- `CHANGE_FREEZE_GUIDE.md`: new §6.1 (plain-language explanation, activation, a sample blocked commit, how to fix it, limits), a fourth part in §2, new troubleshooting rows, and §9 marked optional, since the project does not use GitHub-side protection.

Activated on this device with `git config core.hooksPath .githooks`. Bypass is possible with `git commit --no-verify`, but the audit still lists such files afterwards.

## How to verify
- `git config --get core.hooksPath` prints `.githooks`.
- With all changes recorded, `sh .githooks/pre-commit` exits 0 ("No unlogged changes").
- Create a temporary unrecorded file under `src/`; `sh .githooks/pre-commit` prints "Commit blocked…" and exits 1. Delete the temporary file afterwards.
- Tested 2026-10-10: both cases behaved as expected, and the `FREEZE: OFF` detection matched only the OFF text.
