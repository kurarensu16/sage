# SAGE — AGENTS.md

## Dev Commands
- `npm run dev` — Vite dev server (port **5175**, strict, not default 5173)
- `npm run build` — production build
- `npm run lint` — ESLint (**not** a separate lint-staged or prettier step)
- no test framework, no typecheck — do not run `npm test` or `tsc`

## Data Layer (critical)
**Two parallel backends exist:**
1. **`mockDb.js` (localStorage)** — current runtime DB. 26 functions used by Admin/Dean pages. Faculty and Student pages use hardcoded inline data, not mockDb.
2. **`supabase.js` + `AuthContext.jsx` + `seedDatabase.js`** — Supabase integration exists but migration is **NOT started** per `docs/workflows/Supabase-Migration.md`.

When editing a page, check whether it imports from `mockDb` (Admin/Dean) or uses hardcoded arrays (Faculty/Student) before modifying data access.

## Supabase
- Remote project: `ettnwknyhdhehoclrwwh.supabase.co` (configured in `.env.local`)
- **All 22 tables have RLS disabled** (`supabase/migrations/20260531081149_disable_rls_for_now.sql`)
- 2 edge functions: `create-admin-user`, `delete-admin-user` (Deno, `supabase/functions/`)
- 5 migration files in `supabase/migrations/`
- Seed scripts:
  - `src/lib/seedDatabase.js` — runs in browser (uses anon key)
  - `seedAdmin.js` — runs via Node (reads `supabase/.env` for `SERVICE_ROLE_KEY`)
- Demo users all use password: `DemoPassword123!`
  - admin: `admin@sage.edu.ph`
  - dean: `c.valdes@sage.edu.ph`
  - faculty: `a.rivera@sage.edu.ph`
  - student: `s.jenkins@student.sage.edu`

## Architecture
- **4 portals** under `src/pages/`: `admin/` (15 pages), `dean/` (8 pages), `faculty/` (9 pages), `student/` (7 pages), plus `public/` (3) and `shared/` (1 Settings)
- Routing in `src/App.jsx`: public routes outside `MainLayout`, all portal routes wrapped inside it
- `AuthContext.jsx` provides `session`, `user`, `profile`, `role` — role is the primary gate

## Design System Rules
- **No arbitrary hex codes** (no `text-[#...]`), use `sage-*` semantic tokens only
- **No dark mode** — no `dark:` variants
- **No emoji as icons** — use `lucide-react` exclusively
- **No inline `style={{}}` for layout/color** — Tailwind classes only
- Font stack: Sora (headers), DM Sans (body), JetBrains Mono (stats/grades)
- Color palette defined in `src/index.css` via `@theme` directive

## Grading Math
- 4-term progression: Prelim → Midterm → Semi-Final → Final
- Weight formula per term: 50% Class Standing + 10% Character + 40% Exam
- Term Rating = `ROUND(CS_50 + Char_10 + Exam_40, 0)`
- Midterm Rating = `ROUND(AVG(Prelim, Midterm), 0)`
- All rounding must match DYCI Excel standards (see `SAGE_CONTEXT.md`)

## Important Docs
- `SAGE_CONTEXT.md` — full agent context, grading formulas, DB tables
- `SAGE_DATABASE_SCHEMA.md` — ERD, 19-table DDL, SQL types
- `docs/workflows/Supabase-Migration.md` — migration plan with page-by-page mapping
- `docs/agents/AI-Agent-Architecture.md` — AI features plan (Student Advisor, Faculty Predictor etc.)
- `docs/design/DESIGN_SYSTEM.md` — full visual spec and prohibited patterns
- `docs/design/capstone-system-design-v2.md` — master capstone design doc
