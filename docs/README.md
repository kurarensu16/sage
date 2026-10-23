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
| Code audit of a system area, with its fix plan (work in progress) | `03-development/audits/` | `TOPIC_YYYY-MM-DD.md` |
| Test checklist, QA runbook, evidence | `04-testing/` | `TOPIC_YYYY-MM-DD.md` |
| Setup, DB reset/seed, deployment, PWA/APK | `05-operations/<topic>/` | `TOPIC.md` |
| Planned improvements, documented but not built | `06-future-enhancements/` | `TOPIC_YYYY-MM-DD.md` |
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
| [figures/](02-thesis/figures/) | Current | Sources for the 2026-10-10 thesis figures, including the evening revision (2.2, 2.3, 2.5, 2.8, 2.9, 2.11, and the rebuilt 2.14 ERD Layer 2), plus the 2026-10-11 running-GWA revision of 2.2 and 2.8 (Mermaid `.mmd`, `make_figure_2_7.py`, `compose_columns.py`). `render-config/` holds the shared grayscale style. |
| [figures/USER_INTERFACE_SCREEN_CAPTURE_GUIDE_2026-10-21.docx](02-thesis/figures/USER_INTERFACE_SCREEN_CAPTURE_GUIDE_2026-10-21.docx) | Current | Revised Figure 2.18–2.22 descriptions and the navigation path for each screen capture. |
| [defense/ASPIRE_GRADING_AND_RISK_RULES_DEFENSE_GUIDE.md](02-thesis/defense/ASPIRE_GRADING_AND_RISK_RULES_DEFENSE_GUIDE.md) | Reference | Defense prep on grading and risk rules. |
| [defense/CAPSTONE_DEFENSE_TRANSCRIPT_ANALYSIS.md](02-thesis/defense/CAPSTONE_DEFENSE_TRANSCRIPT_ANALYSIS.md) | Reference | Capstone 1 panel rulings and policy specs. Rule 2.2.1 (no real-time grades for students) is superseded by the running-GWA decision below. |
| [decisions/COLLEGE_OFFICE_PORTAL_DISCARD_ANALYSIS.md](02-thesis/decisions/COLLEGE_OFFICE_PORTAL_DISCARD_ANALYSIS.md) | Current | Why the Office portal was dropped (4 portals). |
| [decisions/ROSTER_IMPORT_VS_USER_MANAGEMENT_ANALYSIS.md](02-thesis/decisions/ROSTER_IMPORT_VS_USER_MANAGEMENT_ANALYSIS.md) | Current | Import Users (CSV/Excel) vs. user management. |
| [decisions/LATE_JOINER_MISSING_ACTIVITIES_2026-10-10.md](02-thesis/decisions/LATE_JOINER_MISSING_ACTIVITIES_2026-10-10.md) | Current | Late joiners get `0` for missing posted-term work so the risk is visible; corrected after make-up. |
| [decisions/STUDENT_RUNNING_GWA_2026-10-11.md](02-thesis/decisions/STUDENT_RUNNING_GWA_2026-10-11.md) | Current | Students see a tentative running GWA before posting (posted milestones replace it); live AI Standing, per-subject FDA, AI insight refresh rules. Supersedes panel rule 2.2.1. |
| [defense/SCALABILITY_DEFENSE_QA_2026-10-10.md](02-thesis/defense/SCALABILITY_DEFENSE_QA_2026-10-10.md) | Current | Panel answers on 1,000-user scale, data handling, caching, and late joiners. |
| [defense/ASPIRE_DEFENSE_AUDIT_2026-10-19.md](02-thesis/defense/ASPIRE_DEFENSE_AUDIT_2026-10-19.md) | Current | Evidence-cited defense audit: role/feature inventory with status labels, data lifecycle and hand-off tables, 16-step cross-role workflow, live-demo script with fallbacks, swimlane, 10 panel Q&A, pre-demo checklist, the hard-coded-data fix plan (Tiers 1 and 5 applied 2026-10-19), a migration-vs-code consistency audit (RPCs, tables, type constraints), and a notification lock-screen policy review. Source-verified only; app not run in a browser. |

## 03 · Development: audits and implementation reports

### Audits and fix plans (work in progress)

| Document | Status | Notes |
|---|---|---|
| [audits/GRADE_POSTING_WORKFLOW_MAJOR_AUDIT_2026-10-22.md](03-development/audits/GRADE_POSTING_WORKFLOW_MAJOR_AUDIT_2026-10-22.md) | Current (P0 code complete; live QA pending) | End-to-end audit of score entry, MR/TFR/SG posting, corrections, admin overrides, locks/archive, audit/notifications, reports/exports, RLS, failure recovery, and tests; P0 implementation is linked below, while P1 remains planned. |
| [audits/SERVER_AUTHORITATIVE_GRADING_MAJOR_AUDIT_2026-10-21.md](03-development/audits/SERVER_AUTHORITATIVE_GRADING_MAJOR_AUDIT_2026-10-21.md) | Current (design audit) | Major Phase 2 architecture and impact audit for server-calculated tentative, MR, TFR, and official SG results; includes database/API/files, rollout, rollback, risks, and approval decisions. |
| [audits/PHASED_QA_AND_CODEBASE_REMEDIATION_PLAN_2026-10-21.md](03-development/audits/PHASED_QA_AND_CODEBASE_REMEDIATION_PLAN_2026-10-21.md) | Phase 1 code ready | QA defects implemented locally; migration application and live Maritime/IT acceptance QA remain before release. |
| [audits/ADMIN_SETUP_AUDIT_2026-10-11.md](03-development/audits/ADMIN_SETUP_AUDIT_2026-10-11.md) | Current (fixes planned) | Admin functions: colleges, programs, sections, terms, users, import, classrooms, COG, Grade Override, Activity Logs. QA bug BSIT-1A → ACT-1A, hard-coded colleges, 320 students without home section, cascading deletes; fix plan in 3 batches plus a data repair. |
| [audits/ASPIRE_CONSULTATION_AUDIT_2026-10-14.md](03-development/audits/ASPIRE_CONSULTATION_AUDIT_2026-10-14.md) | Current (fixes planned) | Read-only audit of the 13 Dean Lim consultation items (ASPIRE-C01–C13) plus a critical-issue sweep: `users` RLS disabled enabling student→admin self-escalation, which chains into an untraceable admin bypass of the SG-correction approval workflow, and an unguarded `class_activities` DELETE that can destroy real student scores. All open decisions resolved 2026-10-14; see the paired implementation plan. |
| [audits/ASPIRE_CONSULTATION_IMPLEMENTATION_PLAN_2026-10-14.md](03-development/audits/ASPIRE_CONSULTATION_IMPLEMENTATION_PLAN_2026-10-14.md) | Current (execution in progress) | Execution plan for the audit above: 6 phases, every decision locked in (admin override → secured RPC, legacy tables dropped, COG snapshot moved to class-creation time, home-section masterlist, consultation scheduling + student acknowledgment, At-Risk 'Covered'-state fix, CCS→TECH with a dynamic `short_name` column). Checklist tracks implementation status. |

### Implementation reports (finished work)

| Document | Status | Notes |
|---|---|---|
| [GRADE_POSTING_P0_HARDENING_2026-10-22.md](03-development/implementation-reports/GRADE_POSTING_P0_HARDENING_2026-10-22.md) | Code complete; migrations/live QA pending | Server-authoritative official posting, locked one-use SG corrections, immutable revisions, idempotency, full-roster enforcement, transactional notifications, backend admin validation, and official-remark consumer fixes. |
| [ACADEMIC_RULES_UNIFICATION_IMPLEMENTATION_REPORT_2026-10-01.md](03-development/implementation-reports/ACADEMIC_RULES_UNIFICATION_IMPLEMENTATION_REPORT_2026-10-01.md) | Reference | Academic rules unification. |
| [ACADEMIC_RULES_VERIFICATION_RESPONSE_2026-10-01.md](03-development/implementation-reports/ACADEMIC_RULES_VERIFICATION_RESPONSE_2026-10-01.md) | Reference | Verification response to the above. |
| [ANALYTICS_STRONGEST_ADDITIONS.md](03-development/implementation-reports/ANALYTICS_STRONGEST_ADDITIONS.md) | Reference | Analytics upgrade outcome; its verification items are not yet merged into the system test checklist. |
| [ASPIRE-AI-Advisor-Implementation-Log.md](03-development/implementation-reports/ASPIRE-AI-Advisor-Implementation-Log.md) | Reference | AI Study Tutor build log (earlier name "AI Advisor"). |
| [FACULTY_TRACKER_AND_GHOST_STUDENT_IMPLEMENTATION_REPORT.md](03-development/implementation-reports/FACULTY_TRACKER_AND_GHOST_STUDENT_IMPLEMENTATION_REPORT.md) | Reference | Faculty tracker and ghost-student handling. |
| [IRREGULAR_STUDENT_AUDIT_CURRENT_STATE_REVIEW.md](03-development/implementation-reports/IRREGULAR_STUDENT_AUDIT_CURRENT_STATE_REVIEW.md) | Reference | Irregular-student handling review. |
| [CLASS_JOIN_APPROVAL_2026-10-10.md](03-development/implementation-reports/CLASS_JOIN_APPROVAL_2026-10-10.md) | Current | Class-code joins require faculty approval (pending requests, one-step faculty-only approval, locked request cards, late-join hint, in-app notifications). Also block-section enrollment on section assignment and *Class Roster Update* notices (§8). Migrations `20261010150000`, `20261010160000`. |
| [FACULTY_IRREGULAR_ENROLLEE_EXPORT_2026-10-19.md](03-development/implementation-reports/FACULTY_IRREGULAR_ENROLLEE_EXPORT_2026-10-19.md) | Current | Faculty Excel export separates the block section from students who joined by code: official sheets are block-only so they match the registrar’s masterlist, with a parallel `(Irregular)` sheet set for cross-enrolled students. No migration. |

## 04 · Testing

| Document | Status | Notes |
|---|---|---|
| [PHASE_1_SG_CORRECTION_AND_REPORT_EXPORT_QA_2026-10-21.md](04-testing/PHASE_1_SG_CORRECTION_AND_REPORT_EXPORT_QA_2026-10-21.md) | Current: pending live QA | Maritime and IT acceptance runbook for strict SG corrections, atomic batches, official grade export alignment, and formatted report workbooks. |
| [EXCEL_GRADE_EXPORT_CHECKLIST_2026-10-20.md](04-testing/EXCEL_GRADE_EXPORT_CHECKLIST_2026-10-20.md) | Current | Manual release checklist for posted-SG Excel export alignment: official values, unposted blanks, metadata, Report of Grades, and sheet layout. |
| [QA_CHECKLIST_2026-10-19.md](04-testing/QA_CHECKLIST_2026-10-19.md) | Current | Manual QA for the 2026-10-19 batch: faculty export split, hard-coded identity removal, notification privacy and dean scoping. 40 checks in 5 sections, with the verified live demo accounts and COG templates. |
| [SYSTEM_TEST_CHECKLIST_2026-10-10.md](04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md) | **Current: active runbook** | Combined runbook: remediation cases plus every 2026-10-10 update. |
| [CONSULTATION_REMEDIATION_TEST_GUIDE_2026-10-14.md](04-testing/CONSULTATION_REMEDIATION_TEST_GUIDE_2026-10-14.md) | **Current** | Manual UI cases for the consultation remediation and security hardening (Phases 0–6), the RLS login check, the grading-formula freeze regression test, and §14 caching: deploy-over-deploy, offline, clock-skew score drafts, and shared-browser sign-out. |
| [GRADING_WORKFLOW_REMEDIATION_CHECKLIST.md](04-testing/GRADING_WORKFLOW_REMEDIATION_CHECKLIST.md) | Reference | Remediation design; its §12 tests now live in the runbook above. |
| [FRONTEND_QA_CHECKLIST_OCTOBER_2026.md](04-testing/FRONTEND_QA_CHECKLIST_OCTOBER_2026.md) | Pending merge | Frontend QA items not yet folded into the active runbook. |
| [evidence/](04-testing/evidence/) | Reference | Test evidence (faculty tracker). |

## 05 · Operations

| Document | Status | Notes |
|---|---|---|
| [database/ASPIRE_DATABASE_RESET_AND_MANUAL_SEEDING.md](05-operations/database/ASPIRE_DATABASE_RESET_AND_MANUAL_SEEDING.md) | Reference | Reset and seed the database. |
| [database/TEST_YEAR_SEED_2026-2027.md](05-operations/database/TEST_YEAR_SEED_2026-2027.md) | Current | Test-year seed after the 2026-10-11 reset: BSIT and BSMarE, 40 students, sections and classes for 1st, 2nd, and Summer, with the rollover tests. |
| [database/DEV_HANDOFF_SQL_SETUP_2026-10-03.md](05-operations/database/DEV_HANDOFF_SQL_SETUP_2026-10-03.md) | Reference | SQL setup handoff (2026-10-03). Migrations added since then are in `supabase/migrations/`. |
| [setup/SUPABASE_SMTP_AND_OTP_EMAIL_2026-10-14.md](05-operations/setup/SUPABASE_SMTP_AND_OTP_EMAIL_2026-10-14.md) | **Current** | Custom SMTP settings and the HTML Reset Password template for the OTP password reset. Required: without both, the code never arrives. |
| [mobile-pwa/WALKTHROUGH_PWA.md](05-operations/mobile-pwa/WALKTHROUGH_PWA.md) | Reference | PWA install and mobile walkthrough. |
| [agents/CHANGE_FREEZE_GUIDE.md](05-operations/agents/CHANGE_FREEZE_GUIDE.md) | Current | How the AI-agent change freeze works and how to switch it ON/OFF (`FREEZE:` line in `AGENTS.md` + `.claude/settings.json`). |
| [agents/feature-updates/](05-operations/agents/feature-updates/README.md) | Current | One change record per change made while the freeze is ON (AI tool, device owner, type, migration, files, reason, how to verify). Template in its README. Checked by `npm run audit:freeze`. |
| [Phase 1 SG correction and report-export remediation](05-operations/agents/feature-updates/2026-10-21_2006_phase-1-sg-correction-and-report-exports.md) | Code ready; migration to apply | Shared strict SG correction planning/preflight, formatted faculty report workbooks, and Maritime/IT regression verification. |
| [Phase 1 QA checklist](05-operations/agents/feature-updates/2026-10-21_2018_phase-1-qa-checklist.md) | Current: pending live QA | Adds the Maritime/IT manual acceptance runbook required before Phase 1 release. |
| [Free AI fallback setup and reasoning fix](05-operations/agents/feature-updates/2026-10-12_0910_free-ai-fallback-reasoning.md) | Current: hosted fallbacks verified | Tested fallback lists for Ask ASPIRE and faculty drafts, reasoning configuration, manual Supabase deployment steps, and a [record time correction](05-operations/agents/feature-updates/2026-10-12_0913_free-ai-fallback-record-time-correction.md). Live student tests and supplied function logs confirmed Apodex and Dots answered after primary-model failures. |
| [President's List GWA wording fix](05-operations/agents/feature-updates/2026-10-12_0952_presidents-list-gwa-wording.md) | Current: redeployment confirmed by developer | Labels 1.75 as the maximum allowed GWA; prompt verification and redeployment steps. |

## 06 · Future enhancements: documented, not built

| Document | Status | Notes |
|---|---|---|
| [README.md](06-future-enhancements/README.md) | Current | What belongs here, priority scale (P0–P3), status legend. Never lists the owner's deferred items. |
| [SCALABILITY_AND_DATA_HANDLING_2026-10-10.md](06-future-enhancements/SCALABILITY_AND_DATA_HANDLING_2026-10-10.md) | Proposed | Data handling, caching, and 1,000+ concurrent users: 13 findings, target design, roadmap E-01–E-15 with acceptance tests. |
| [scalability/README.md](06-future-enhancements/scalability/README.md) | Proposed | Implementation-spec index and template. Written: E-01 paged reads, E-02 grade-sheet safe save, E-03 remove mock seed, E-04 Dean database functions. |
| [scalability/HOSTING_TIERS_AND_COST.md](06-future-enhancements/scalability/HOSTING_TIERS_AND_COST.md) | Proposed | Free vs. paid hosting limits and the tier needed per adoption size (prototype / department / institution). |
| [SECTION_TRANSFER_ENROLLMENTS_2026-10-10.md](06-future-enhancements/SECTION_TRANSFER_ENROLLMENTS_2026-10-10.md) | Proposed | Section transfers keep old class enrollments; proposed record-preserving transfer handling. |
| [LATE_JOINER_HANDLING_2026-10-10.md](06-future-enhancements/LATE_JOINER_HANDLING_2026-10-10.md) | Proposed | Late joiners: current behavior (audited), gaps, and planned improvements LJ-A–LJ-D. |

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
