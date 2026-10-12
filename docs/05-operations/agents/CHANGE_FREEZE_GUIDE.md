# Change Freeze Guide: turning AI-agent safeguards on and off

**Audience:** the ASPIRE owner and developers who use AI coding tools (Claude Code, Codex, Gemini CLI, Cursor, Copilot).
**Status:** Current. The freeze has been **ON** since 2026-10-10.

---

## 1. What the change freeze is

ASPIRE is in its **polishing stage**. The system, the thesis paper (Chapters 1–2), and the Evaluation Tool describe the same flows, so the code must not drift from the paper.

The freeze is a **safety gate for AI agents**, not a restriction on developers. While it is ON, an AI agent:

- **asks before each file** it creates, edits, moves, or deletes, and waits for your "yes";
- **does not treat an implementation plan or task list as permission**, so it confirms every file even when the work is already planned;
- **warns you** when a change would add something the paper doesn't describe ("This is a new feature, outside the documented flow"), and builds it only if you confirm;
- **records every approved change** as its own file in [`feature-updates/`](feature-updates/README.md), with the AI tool used and the device owner who approved it;
- **never** commits, pushes, runs remote migrations, or edits `.env*` files unless you ask for that exact action.

Developers can still change anything. The freeze only stops an AI from changing things **on its own**, and it makes every change traceable.

## 2. How it works: four parts

| Part | File | Applies to | How strong |
|---|---|---|---|
| **1. Written rules** | `AGENTS.md`, section "Polishing stage: change freeze", controlled by the line `FREEZE: ON` | Every AI tool that reads project instructions | A strong instruction. Agents follow it, but it is not a technical lock. |
| **2. Claude Code lock** | `.claude/settings.json` | Claude Code only | Enforced by the tool: every file edit and every risky command (git commit/push/reset/checkout, npm install, supabase CLI) asks for approval, and "skip all permissions" mode is disabled. |
| **3. Change records + audit** | [`feature-updates/`](feature-updates/README.md) (one file per change) and `npm run audit:freeze` | Every change, whatever tool made it | Each record captures the "why". The audit compares the records against git and lists any code file changed but **not** recorded, so a missed rule shows up instead of staying hidden. |
| **4. Commit check** | `.githooks/pre-commit` (switched on by `npm install`) | Every commit on a machine where it's active, by AI **or by hand** | Enforced by git: a commit is **blocked** while any code change has no change record. Skippable only with `git commit --no-verify` (see §6.1). |

How each tool finds the rules:

| Tool | Reads |
|---|---|
| Codex, Cursor, and most other agents | `AGENTS.md` directly |
| Claude Code | `CLAUDE.md`, which imports `AGENTS.md` |
| Gemini CLI | `GEMINI.md`, which imports `AGENTS.md` |

**When the AI sees the switch:** instruction files are loaded **once, at the start of each AI session**, and stay in the AI's context for that whole conversation. If you flip the switch in the middle of a session, the AI will not notice. **Start a new session after every change**, or tell the AI directly ("the freeze is now off").

## 3. A normal change while the freeze is ON

1. You ask the AI for a fix, e.g., "the student badge shows the wrong count".
2. The AI investigates (reading is allowed), then proposes: *"I'd edit `src/pages/student/FacultyAdvisingInbox.jsx` to count verified tasks. No migration. OK?"*
3. You answer **yes**. The AI edits that file only.
4. If it needs another file, it asks again for that file.
5. The AI creates a change record, e.g., `feature-updates/2026-10-12_1430_student-badge-count.md` (date and time, so a day's records stay in order), from the template, with the date, its tool name, your git name and email, the type, any migration, the files, what changed and why, and how to verify.
6. Commit. The commit check (§6.1) runs the audit automatically and blocks the commit if a change record is missing. You can also run `npm run audit:freeze` yourself first.

If you edit code yourself without AI, create a record with AI tool `Manual`.

## 4. Turning the freeze OFF

Do this when you deliberately want AI agents to work without asking per file, for example during a planned feature sprint.

1. **Written rules.** Open `AGENTS.md` and change
   ```
   **FREEZE: ON**
   ```
   to
   ```
   **FREEZE: OFF**
   ```
2. **Claude Code lock.** Rename the settings file:
   ```bash
   git mv .claude/settings.json .claude/settings.off.json
   ```
   (Without git: rename the file in your file explorer.)
3. **Record it** in section 8 (Freeze switch history) below.
4. **Commit and push** so everyone on the team gets the same state:
   ```bash
   git commit -am "chore: turn change freeze OFF (reason)"
   git push
   ```
5. **Restart your AI sessions.** Close and reopen Claude Code, Codex, or Gemini CLI, or start a new chat.

While OFF, agents don't have to write change records, and the audit and commit check pass automatically (they read the same `FREEZE:` line). Changes still appear in `git log`.

## 5. Turning the freeze ON

1. **Written rules.** In `AGENTS.md`, change `**FREEZE: OFF**` back to `**FREEZE: ON**`.
2. **Claude Code lock.** Rename the settings file back:
   ```bash
   git mv .claude/settings.off.json .claude/settings.json
   ```
3. **Record it** in section 8 below.
4. **Commit and push:**
   ```bash
   git commit -am "chore: turn change freeze ON (reason)"
   git push
   ```
5. **Restart your AI sessions.**
6. **New baseline (optional).** If you want the audit to ignore everything done while the freeze was OFF, set `FREEZE_BASE` in `scripts/freezeAudit.js` to the commit you just made.

## 6. The audit check

```bash
npm run audit:freeze
```

- Compares all **code** files changed since the freeze baseline (committed, uncommitted, and new) against the file paths listed in every record in `feature-updates/`.
- Code means `src/`, `supabase/`, `scripts/`, `public/`, `package.json`, `index.html`, `vite.config.js`, `capacitor.config.*`. Documentation in `docs/` is not audited.
- Prints **"No unlogged changes"**, or lists each unlogged file with its last git author, and exits with an error.
- To fix an unlogged file, create a change record that lists it, or revert the change.
- Passes automatically when `AGENTS.md` says `FREEZE: OFF`.

### 6.1 The commit check (pre-commit hook)

**In plain terms:** before git saves a commit, it runs the audit above. If any code change has no change record, the commit is refused. This works whoever made the change, whether an AI tool or a person typing, so it covers the cases where the written rules aren't followed.

**How it is switched on**
- The hook lives in `.githooks/pre-commit` (part of the repository).
- `npm install` runs the `prepare` script, which sets `git config core.hooksPath .githooks` on that machine. After pulling and running `npm install`, every developer has it with no extra steps.
- To switch it on by hand: `git config core.hooksPath .githooks`. To check: `git config --get core.hooksPath` should print `.githooks`.

**What a blocked commit looks like**
```
1 unlogged change(s). Add a change record in docs/05-operations/agents/feature-updates/ (see its README.md) or revert:
  - src/pages/student/Dashboard.jsx  (last commit by: not committed yet)

Commit blocked: add a change record in docs/05-operations/agents/feature-updates/
(copy the template in its README.md), or undo the unrecorded change.
```
**To fix it:** create a record from the template in `feature-updates/README.md` that lists the file (AI tool `Manual` if you changed it yourself), then commit again. Or undo the change.

**Good to know**
- **Only code files are checked** (same list as the audit). Commits that only touch `docs/` always pass.
- **It checks everything you have changed, not only what you are committing.** An unrecorded code change sitting in your working folder blocks the commit even if you didn't stage it. Record it, or undo it, first.
- **It follows the switch:** with `FREEZE: OFF` in `AGENTS.md`, it passes immediately.
- **It needs Node.js.** On a machine without Node.js it prints a notice and lets the commit through.
- **It can be skipped** with `git commit --no-verify`. That is for emergencies only. A skipped check is still caught later: the next `npm run audit:freeze`, on any machine, lists the unrecorded files with their git author.
- **It is local.** This project does not use a GitHub-side check, so the hook (plus the audit) is the enforcement layer for manual changes.

## 7. Checking that it works

After switching **ON**, open a new AI session and ask for a small, harmless change (for example, "fix a typo in docs/README.md"). The agent should name the file and the change, then wait for your "yes" before editing. In Claude Code you also get a permission prompt for the edit itself.

After switching **OFF**, the same request should go ahead without the per-file question. Claude Code then falls back to your personal permission settings.

| Symptom | Cause | Fix |
|---|---|---|
| The agent still asks per file after you turned the freeze OFF | The old session still holds the old `AGENTS.md` | Start a new session |
| Claude Code still prompts for every edit after OFF | `.claude/settings.json` was not renamed | Rename it to `settings.off.json` |
| Gemini CLI ignores the rules | `GEMINI.md` is missing, or Gemini is set to read another context file | Restore `GEMINI.md`, or set Gemini's context file name to `AGENTS.md` |
| An agent edited files without asking while ON | Written rules are guidance, not a lock | The commit check blocks committing it without a record (§6.1); `npm run audit:freeze` lists the files. Keep tools in "ask"/"suggest" mode |
| A commit is blocked with "Commit blocked: add a change record…" | A code file you changed has no change record | Add a record in `feature-updates/` listing the file, or undo the change (§6.1) |
| A commit is blocked by a file you didn't mean to commit | The check looks at all changed code files, staged or not | Record that change, or undo it (`git restore <file>`, or delete a new file) |
| Commits go through even with unrecorded changes | The hook isn't active on that machine | Run `npm install`, or `git config core.hooksPath .githooks`; confirm with `git config --get core.hooksPath` |
| "Approved by" is blank or wrong in a record | The device has no git identity | Run `git config --global user.name "Your Name"` and `git config --global user.email "you@example.com"` on that device |

## 8. Freeze switch history

| Date | Switched to | Device owner (git user) | Reason |
|---|---|---|---|
| 2026-10-10 | ON | ghostbyte1014 (ghostbyte1014@gmail.com) | Polishing stage: system, thesis paper, and Evaluation Tool aligned; no unrequested features. |

## 9. Extra protection outside this repo (optional)

These settings live outside the repository. This project currently relies on the local commit check (§6.1) and does **not** use them:

- **GitHub branch protection** on `main` (Settings → Branches): require a pull request with the owner's approval before merging. Combined with a GitHub-side audit, it would block even `--no-verify` commits from reaching `main`.
- **Codex / Gemini CLI approval modes:** keep them on "ask" or "suggest", not full-auto or YOLO, while the freeze is ON. These are per-machine settings.

## 10. Not affected by the switch

These rules in `AGENTS.md` apply whether the freeze is ON or OFF:

- Documentation rules (start at `docs/README.md`, folder layout, update the index).
- Design system rules and grading math references.
- The owner's deferred items: **RLS policies, the Gemini 2.5 Flash model, and the hosted Supabase password policy** are not to be changed or flagged; the owner applies them before real-world rollout.
