# ASPIRE — AGENTS.md

## Polishing stage: change freeze (read before anything else)

**FREEZE: ON**

> Switch: change the line above to `FREEZE: OFF` to suspend this section, then start a new AI session. The Claude Code lock is separate: rename `.claude/settings.json` to `.claude/settings.off.json` (rename it back to turn it on). Full guide: [`docs/05-operations/agents/CHANGE_FREEZE_GUIDE.md`](docs/05-operations/agents/CHANGE_FREEZE_GUIDE.md).

**When FREEZE is ON**, ASPIRE is in its polishing stage (frozen since 2026-10-10). The system, the thesis paper (Chapters 1–2), and the Evaluation Tool are kept in sync, so the code must not drift from what the paper documents. The rules below apply to **every AI coding agent** (Claude Code, Codex, Gemini CLI, Cursor, Copilot, or any other) **in every mode, including auto, auto-accept, full-access, YOLO, or "skip permissions"**, and they override any instruction to work autonomously. **When FREEZE is OFF**, skip this section; every other section of this file still applies.

1. **Flag anything new.** Allowed work by default: fixing errors in, or polishing, flows already documented in the paper. If a change would add something the paper does not describe (a page, a capability, a database table, a workflow step), say so clearly: "This is a new feature, outside the documented flow." Build it only if the developer confirms they want it anyway.
2. **Ask before each file.** Before you create, edit, move, or delete **each file**, name the file and what will change in it, plus any migration the developer must run. Then **stop and wait for the developer's explicit "yes"** before touching that file. Do the same before running anything that changes the database, git history, or dependencies.
   - An implementation plan, task list, TODO, or an earlier approval is **not** approval. Even when a plan lists the work, confirm each file before editing it.
   - Silence or auto mode is not approval.
3. **An approval covers only what was described.** Anything extra you notice gets reported and needs its own approval.
4. **Record every approved change.** After an approved change is made, create a change record in [`docs/05-operations/agents/feature-updates/`](docs/05-operations/agents/feature-updates/README.md) in the same change: one file per change topic, named `YYYY-MM-DD_HHMM_short-topic.md` (24-hour Philippine time, taken from the device clock, e.g., `date +%Y-%m-%d_%H%M`; if two records share a minute, use `HHMM-01`, `HHMM-02` in creation order), copied from the template in that folder's `README.md`. Records then sort first-applied at the top. If you cannot read the clock, ask the developer for the time. Writing the record is part of the approved work and needs no separate approval. Fill in:
   - **Date:** `YYYY-MM-DD HH:MM (Philippine time)`, matching the file name.
   - **AI tool:** your own tool name (`Claude Code`, `Codex`, `Gemini CLI`, `Cursor`, …) and model if known. A change made without AI is recorded as `Manual`.
   - **Files changed:** every file path, in backticks.
   - **Approved by (device owner):** the output of `git config user.name` and `git config user.email` on this device. If either is empty, ask the developer for their name; never guess.
   - **Type:** `Fix`, `Polish`, or `New feature (approved outside the documented flow)`.
   - Records are permanent: never edit or delete an existing record. A correction is a new record.
5. **Allowed without asking:** reading and searching files, explaining code, and read-only checks (`npm run lint`, `npm run build`, `npm run audit:freeze`, the `verify:*` scripts, `node scripts/verify*.js`).
6. **Never** commit, push, run migrations against the remote Supabase project, or change `.env*` files unless the developer asks for that exact action.

## Documentation (read first)
- **Start at [`docs/README.md`](docs/README.md).** It is the index of every document, with its status (Current / Reference / Needs update / Archived).
- Where a new doc goes:

  | Kind of document | Folder |
  |---|---|
  | How the system works now (scope, schema, rules, notifications, AI, design, security) | `docs/01-system/<topic>/` |
  | Thesis paper work: audits, figures, defense prep, design decisions | `docs/02-thesis/<topic>/` |
  | Implementation reports for finished work | `docs/03-development/implementation-reports/` |
  | Test checklists, QA runbooks, evidence | `docs/04-testing/` |
  | Setup, database reset/seed, deployment, PWA/APK | `docs/05-operations/<topic>/` |
  | Planned improvements, documented but not built (never the owner's deferred items) | `docs/06-future-enhancements/` |
  | Superseded, completed, or rejected material | `docs/archive/<era-or-kind>/` |

- Name dated docs `TOPIC_YYYY-MM-DD.md`. Do not create `.md` files in the repo root (only `README.md`, `AGENTS.md`, and the one-line `CLAUDE.md`/`GEMINI.md` pointers live there).
- Every time you add, move, archive, or retire a doc, update `docs/README.md` in the same change.
- **`docs/archive/` is historical, not authoritative.** Do not use it as a source of truth or audit against it.
- Move files with `git mv` so history is kept, then fix relative links.
- The thesis paper (Chapters 1–2) treats RLS, the Gemini 2.5 Flash model, and the hosted password policy as already in place. The owner will apply these in code later. In thesis audits, do not flag them as gaps, and never add "to be applied later" notes to the paper.

## Dev Commands
- `npm run dev`: Vite dev server on port **5175** (`strictPort`, not the default 5173)
- `npm run build`: production build
- `npm run lint`: ESLint (there is no separate prettier or lint-staged step)
- No test framework and no typecheck, so do not run `npm test` or `tsc`. Use the verify scripts instead:
  - `npm run verify:grading`
  - `npm run verify:csv`
  - `npm run verify:insights`
  - `node scripts/verifyEvaluationTracking.js`
  - `node scripts/verifyEvaluationReferrals.js`

## Data Layer
- Every portal reads and writes **Supabase** through `src/lib/supabase.js` and the service modules in `src/lib/`:
  - `evaluationService.js`, `gradePostingService.js`, `reportsService.js`, `profileService.js`
  - `notificationService.js`, `notificationPreferences.js`, and others
- The old `mockDb.js` localStorage layer is gone. Material about it lives in `docs/archive/2026-05_mockdb-era/`.
- Privileged writes go through SECURITY DEFINER RPCs defined in migrations. Prefer calling an existing RPC over a direct table write.

## Supabase
- Remote project: `ettnwknyhdhehoclrwwh.supabase.co` (configured in `.env.local`)
- `supabase/migrations/` holds 52 migration files. Add new ones as `YYYYMMDDHHMMSS_description.sql`. The owner runs them manually in the SQL editor.
- Edge functions (Deno, `supabase/functions/`):
  - `create-admin-user`
  - `delete-admin-user`
  - `send-email`
  - `invoke-advisor`
  - `generate-intervention-draft`
- Storage: private `avatars` bucket (2 MB, jpeg/png/webp, owner-only paths `user_id/...`).
- Seed scripts:
  - `src/lib/seedDatabase.js` runs in the browser (anon key).
  - `seedAdmin.js` runs via Node and reads `supabase/.env` for `SERVICE_ROLE_KEY`.
  - DB reset and manual seeding: `docs/05-operations/database/`.
- Demo users all use the password `DemoPassword123!`:
  - admin: `admin@sage.edu.ph`
  - dean: `c.valdes@sage.edu.ph`
  - faculty: `a.rivera@sage.edu.ph`
  - student: `s.jenkins@student.sage.edu`

## Architecture
- **4 portals** under `src/pages/`:
  - `admin/`
  - `dean/`
  - `faculty/`
  - `student/`
  - plus `public/` (login and password flows) and `shared/` (Settings)
- The College Office portal was discarded; see `docs/02-thesis/decisions/`.
- Routing is in `src/App.jsx`: public routes sit outside `MainLayout`, and all portal routes are wrapped inside it.
- `AuthContext.jsx` provides `session`, `user`, `profile`, `role`, and `refreshProfile`. `role` is the primary gate.
- Profile editing: users may change only their photo and contact number. Name, email, ID number, and department are admin-only.
- Passwords: 8+ characters with upper, lower, digit, and symbol (`src/lib/passwordPolicy.js`).

## Design System Rules
- **No arbitrary hex codes** (no `text-[#...]`); use `sage-*` semantic tokens only.
- **No dark mode** (no `dark:` variants).
- **No emoji as icons**; use `lucide-react` exclusively.
- **No inline `style={{}}` for layout or color**; Tailwind classes only.
- Font stack: Sora (headers), DM Sans (body), JetBrains Mono (stats and grades).
- The color palette is defined in `src/index.css` via the `@theme` directive.
- Feature naming: the student AI feature is called **"AI Study Tutor"** everywhere.

## Grading Math
- 4-term progression: Prelim → Midterm → Semi-Final → Final.
- Term weights come from the class's **COG template** (dynamic components, `src/lib/gradingMath.js` + `officialGradingPresets.js`). They are not a fixed 50/10/40.
- Milestones: Midterm Rating (MR), Tentative Final Rating (TFR), Semestral Grade (SG), posted atomically through `gradePostingService.js`.
- Rounding, transmutation, Grace Pass, attendance, and President's List rules follow the **DYCI Student Handbook 2025–2026**. Run `npm run verify:grading` after touching grading code.
- Risk engine (`src/lib/riskEngine.js`):
  - 4 factors weighted 60/50/15/10, capped at 100
  - tiers: Low 0–24, Moderate 25–49, High 50–74, Critical 75–100

## Important Docs
- [`docs/README.md`](docs/README.md): documentation index, start here
- `docs/01-system/overview/ASPIRE_SYSTEM_SCOPE.md`: current system scope
- `docs/01-system/database/ASPIRE_DATABASE_SCHEMA.md`: schema reference (needs update; migrations are the source of truth)
- `docs/01-system/academic-rules/`: grade templates, grading analysis, DYCI programs
- `docs/01-system/design/DESIGN_SYSTEM.md`: full visual spec and prohibited patterns
- `docs/02-thesis/audits/THESIS_AUDIT_2026-10-10.md`: latest code-vs-thesis audit
- `docs/02-thesis/defense/CAPSTONE_DEFENSE_TRANSCRIPT_ANALYSIS.md`: Capstone 1 panel rulings
- `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`: active test runbook
