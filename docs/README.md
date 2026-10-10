# ASPIRE Documentation Index

Every document in `docs/` is listed here with its status. **Agents and contributors: read this first**, and update this index in the same change whenever a doc is added, moved, archived, or retired.

**Status legend**
- **Current**: matches the code as of the date shown and is authoritative.
- **Reference**: still useful and accurate in principle, but not the primary source.
- **Needs update**: still the right place for this topic, but parts are out of date. Trust the code and migrations over it.
- **Archived**: historical only (see [`archive/README.md`](archive/README.md)).

**Where a new doc goes**

| Kind of document | Folder | Naming |
|---|---|---|
| How the system works now | `01-system/<topic>/` | `TOPIC.md` (living doc) |
| Thesis work: audits, figures, defense, decisions | `02-thesis/<topic>/` | `TOPIC_YYYY-MM-DD.md` |
| Report on finished implementation work | `03-development/implementation-reports/` | `TOPIC_YYYY-MM-DD.md` |
| Test checklist, QA runbook, evidence | `04-testing/` | `TOPIC_YYYY-MM-DD.md` |
| Setup, DB reset/seed, deployment, PWA/APK | `05-operations/<topic>/` | `TOPIC.md` |
| Superseded, completed, or rejected | `archive/<era-or-kind>/` | keep original name |

Do not add `.md` files to the repository root. The root holds only `README.md`, `AGENTS.md` (all agent rules, including the change freeze), and the one-line `CLAUDE.md`/`GEMINI.md` pointers to it.

---

## 01 · System: how ASPIRE works now

| Document | Status | Notes |
|---|---|---|
| [overview/ASPIRE_SYSTEM_SCOPE.md](01-system/overview/ASPIRE_SYSTEM_SCOPE.md) | Current (v5.0) | System scope and technical specification. |
| [overview/ASPIRE_CONTEXT.md](01-system/overview/ASPIRE_CONTEXT.md) | Needs update | Agent context; still describes fixed 50/10/40 weights (now dynamic COG templates). |
| [overview/capstone-system-design-v2.md](01-system/overview/capstone-system-design-v2.md) | Reference | Master capstone design doc. |
| [database/ASPIRE_DATABASE_SCHEMA.md](01-system/database/ASPIRE_DATABASE_SCHEMA.md) | Needs update | Says "21 tables". `supabase/migrations/` is the source of truth. |
| [academic-rules/GRADE_TEMPLATES_REFERENCE.md](01-system/academic-rules/GRADE_TEMPLATES_REFERENCE.md) | Needs update | Predates dynamic COG templates; see `src/lib/officialGradingPresets.js`. |
| [academic-rules/ASPIRE_Grading_System_Analysis.md](01-system/academic-rules/ASPIRE_Grading_System_Analysis.md) | Reference | Grading system analysis (DYCI Handbook 2025–2026 rules). |
| [academic-rules/Academic-Programs-DYCI.md](01-system/academic-rules/Academic-Programs-DYCI.md) | Reference | DYCI programs list. |
| [notifications/NOTIFICATION_SYSTEM_CATALOG.md](01-system/notifications/NOTIFICATION_SYSTEM_CATALOG.md) | Needs update | Lists 5 roles (Office portal discarded); predates the notification-preferences panel. |
| [notifications/NOTIFICATION_DELIVERY_ARCHITECTURE.md](01-system/notifications/NOTIFICATION_DELIVERY_ARCHITECTURE.md) | Reference | Delivery-channel design (in-app, push, email). |
| [ai/OPENROUTER_FREE_MODELS_GUIDE.md](01-system/ai/OPENROUTER_FREE_MODELS_GUIDE.md) | Reference | Model options for the AI Study Tutor and intervention drafts. |
| [design/DESIGN_SYSTEM.md](01-system/design/DESIGN_SYSTEM.md) | Current | Visual spec and prohibited patterns. |
| [design/USER_JOURNEY_FLOW.md](01-system/design/USER_JOURNEY_FLOW.md) | Reference | Per-role user journeys. |
| [security-privacy/ROLE_CONNECTION_AND_RLS_HARDENING_GUIDE.md](01-system/security-privacy/ROLE_CONNECTION_AND_RLS_HARDENING_GUIDE.md) | Reference | Role-to-table access and RLS policy guide. |

## 02 · Thesis: paper audits, figures, defense

| Document | Status | Notes |
|---|---|---|
| [audits/THESIS_AUDIT_2026-10-10.md](02-thesis/audits/THESIS_AUDIT_2026-10-10.md) | Current | Latest code-vs-Chapters 1–2 audit and action checklist. |
| [figures/](02-thesis/figures/) | Current | Sources for the 2026-10-10 thesis figures (Mermaid `.mmd`, `make_figure_2_7.py`, `compose_columns.py`). `render-config/` holds the shared grayscale style. |
| [defense/ASPIRE_GRADING_AND_RISK_RULES_DEFENSE_GUIDE.md](02-thesis/defense/ASPIRE_GRADING_AND_RISK_RULES_DEFENSE_GUIDE.md) | Reference | Defense prep on grading and risk rules. |
| [defense/CAPSTONE_DEFENSE_TRANSCRIPT_ANALYSIS.md](02-thesis/defense/CAPSTONE_DEFENSE_TRANSCRIPT_ANALYSIS.md) | Reference | Capstone 1 panel rulings and policy specs. |
| [decisions/COLLEGE_OFFICE_PORTAL_DISCARD_ANALYSIS.md](02-thesis/decisions/COLLEGE_OFFICE_PORTAL_DISCARD_ANALYSIS.md) | Current | Why the Office portal was dropped (4 portals). |
| [decisions/ROSTER_IMPORT_VS_USER_MANAGEMENT_ANALYSIS.md](02-thesis/decisions/ROSTER_IMPORT_VS_USER_MANAGEMENT_ANALYSIS.md) | Current | Import Users (CSV/Excel) vs. user management. |

## 03 · Development: implementation reports

| Document | Status | Notes |
|---|---|---|
| [ACADEMIC_RULES_UNIFICATION_IMPLEMENTATION_REPORT_2026-10-01.md](03-development/implementation-reports/ACADEMIC_RULES_UNIFICATION_IMPLEMENTATION_REPORT_2026-10-01.md) | Reference | Academic rules unification. |
| [ACADEMIC_RULES_VERIFICATION_RESPONSE_2026-10-01.md](03-development/implementation-reports/ACADEMIC_RULES_VERIFICATION_RESPONSE_2026-10-01.md) | Reference | Verification response to the above. |
| [ANALYTICS_STRONGEST_ADDITIONS.md](03-development/implementation-reports/ANALYTICS_STRONGEST_ADDITIONS.md) | Reference | Analytics upgrade outcome; its verification items are not yet merged into the system test checklist. |
| [ASPIRE-AI-Advisor-Implementation-Log.md](03-development/implementation-reports/ASPIRE-AI-Advisor-Implementation-Log.md) | Reference | AI Study Tutor build log (earlier name "AI Advisor"). |
| [FACULTY_TRACKER_AND_GHOST_STUDENT_IMPLEMENTATION_REPORT.md](03-development/implementation-reports/FACULTY_TRACKER_AND_GHOST_STUDENT_IMPLEMENTATION_REPORT.md) | Reference | Faculty tracker and ghost-student handling. |
| [IRREGULAR_STUDENT_AUDIT_CURRENT_STATE_REVIEW.md](03-development/implementation-reports/IRREGULAR_STUDENT_AUDIT_CURRENT_STATE_REVIEW.md) | Reference | Irregular-student handling review. |

## 04 · Testing

| Document | Status | Notes |
|---|---|---|
| [SYSTEM_TEST_CHECKLIST_2026-10-10.md](04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md) | **Current: active runbook** | Combined runbook: remediation cases plus every 2026-10-10 update. |
| [GRADING_WORKFLOW_REMEDIATION_CHECKLIST.md](04-testing/GRADING_WORKFLOW_REMEDIATION_CHECKLIST.md) | Reference | Remediation design; its §12 tests now live in the runbook above. |
| [FRONTEND_QA_CHECKLIST_OCTOBER_2026.md](04-testing/FRONTEND_QA_CHECKLIST_OCTOBER_2026.md) | Pending merge | Frontend QA items not yet folded into the active runbook. |
| [evidence/](04-testing/evidence/) | Reference | Test evidence (faculty tracker). |

## 05 · Operations

| Document | Status | Notes |
|---|---|---|
| [database/ASPIRE_DATABASE_RESET_AND_MANUAL_SEEDING.md](05-operations/database/ASPIRE_DATABASE_RESET_AND_MANUAL_SEEDING.md) | Reference | Reset and seed the database. |
| [database/DEV_HANDOFF_SQL_SETUP_2026-10-03.md](05-operations/database/DEV_HANDOFF_SQL_SETUP_2026-10-03.md) | Reference | SQL setup handoff (2026-10-03). Migrations added since then are in `supabase/migrations/`. |
| [mobile-pwa/WALKTHROUGH_PWA.md](05-operations/mobile-pwa/WALKTHROUGH_PWA.md) | Reference | PWA install and mobile walkthrough. |
| [agents/CHANGE_FREEZE_GUIDE.md](05-operations/agents/CHANGE_FREEZE_GUIDE.md) | Current | How the AI-agent change freeze works and how to switch it ON/OFF (`FREEZE:` line in `AGENTS.md` + `.claude/settings.json`). |
| [agents/feature-updates/](05-operations/agents/feature-updates/README.md) | Current | One change record per change made while the freeze is ON (AI tool, device owner, type, migration, files, reason, how to verify). Template in its README. Checked by `npm run audit:freeze`. |

## Archive

Historical material, not authoritative. See [`archive/README.md`](archive/README.md) for what each folder holds.

| Folder | Contents |
|---|---|
| [archive/2026-05_mockdb-era/](archive/2026-05_mockdb-era/) | localStorage/mockDb-era docs, the old changelog, and the Supabase migration plan |
| [archive/2026-08_old-thesis-design/](archive/2026-08_old-thesis-design/) | Earlier thesis text, chapter comparisons, old AI agent architecture, early defense prep |
| [archive/2026-08_update-handoff/](archive/2026-08_update-handoff/) | 2026-08-18/19 update plan, handoff guide, and SQL |
| [archive/2026-09_v3.1-scope/](archive/2026-09_v3.1-scope/) | v3.1 scope/SRS documents and the cross-document feature audit |
| [archive/2026-10-04_paper-audit/](archive/2026-10-04_paper-audit/) | Oct 4 paper audit, its earlier draft, and its figure sources (replaced by the 2026-10-10 audit) |
| [archive/completed-plans/](archive/completed-plans/) | Implementation plans that have been carried out |
| [archive/changelogs/](archive/changelogs/) | Old update reports and the retired `TASKS.md` tracker |
| [archive/rejected/](archive/rejected/) | Proposals that were not adopted (e.g., faculty-customized grade weights) |
