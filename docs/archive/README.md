# Archive: historical, not authoritative

Everything under `docs/archive/` describes an **earlier state** of ASPIRE: plans already carried out, superseded scopes, retired trackers, and rejected proposals. It is kept for history and for tracing why decisions were made.

- **Do not** treat these files as a description of the current system, and do not audit the code or the thesis against them.
- **Do not** edit archived files to "fix" them. If a topic needs a current document, write it in the right active folder (see [`../README.md`](../README.md)).
- Links inside archived files may point to old paths; they are left as they were.

| Folder | What it holds | Superseded by |
|---|---|---|
| `2026-05_mockdb-era/` | mockDb/localStorage master documentation, development phases and changelog, Supabase migration plan, component audits | Supabase-backed system; `01-system/` |
| `2026-08_old-thesis-design/` | Older chapter text and comparisons, data-privacy and tech-spec briefs, AI agent architecture, phase defense notes | `02-thesis/` and the updated Chapters 1–2 |
| `2026-08_update-handoff/` | 2026-08-18/19 system audit, implementation plan, checklist, developer handoff, SQL | Later migrations and reports |
| `2026-09_v3.1-scope/` | v3.1 SRS, updated scope, cross-document feature audit, BG/RRL copy | `01-system/overview/ASPIRE_SYSTEM_SCOPE.md` (v5.0) |
| `2026-10-04_paper-audit/` | Oct 4 paper audit and required changes, an earlier draft (`earlier-draft/`), Oct 4 figure sources | `02-thesis/audits/THESIS_AUDIT_2026-10-10.md`, `02-thesis/figures/` |
| `completed-plans/` | AI advisor, student risk, analytics, reports, PWA/Capacitor, audit-log, dean insight, and unify-academic-rules plans | `03-development/implementation-reports/` and the code |
| `changelogs/` | Ghost update report, system updates report, retired `TASKS.md` tracker | Git history and `04-testing/` |
| `rejected/` | Faculty grade-weight customization spec (not adopted; COG templates are used instead) | n/a |
