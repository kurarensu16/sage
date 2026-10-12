# 06 · Future Enhancements

Planned improvements to ASPIRE that are **documented but not yet built**. This folder is the source for the thesis **Recommendations / Future Work** section (Chapter 5) and for defense answers about "what would you improve?".

**These enhancements are triggered by institutional adoption.** The research prototype is complete for its scope: it is demonstrated with synthetic data on free hosting tiers. The work here is what the school would need *if it adopts ASPIRE* for real classes and users. It is not unfinished work in the prototype.

## What belongs here
- Improvements to flows the system already has: scale, performance, reliability, maintainability, and user experience.
- Each enhancement explains the problem, the proposed design, its priority, and how it will be tested.

## What does not belong here
- **Changes already made.** Those are recorded in [`05-operations/agents/feature-updates/`](../05-operations/agents/feature-updates/README.md).
- **Bugs being fixed now.** A bug found in QA is fixed through the change-freeze process, not parked here. A problem that can lose or misreport data is documented here only so the fix is designed carefully, and it is marked **P0**.
- **The owner's deferred items** (RLS policies, the Gemini 2.5 Flash model, the hosted Supabase password policy). The thesis states these as already in place, and the owner tracks them separately. Never list them here.

## Priority scale
| Priority | Meaning |
|---|---|
| **P0** | Fix before wide rollout. Data can be lost, misread, or a page can fail at realistic size. |
| **P1** | Needed for many simultaneous users (hundreds to 1,000+). |
| **P2** | Polish: speed, cost, privacy hygiene, maintainability. |
| **P3** | Verification and capacity planning before institution-wide launch. |

## Status legend
| Status | Meaning |
|---|---|
| **Proposed** | Documented; not scheduled. |
| **Planned** | Approved for a future work cycle. |
| **In progress** | Being implemented (a change record exists in `feature-updates/`). |
| **Done** | Implemented; link the change record. |
| **Rejected** | Decided against; keep the reasoning. |

## File naming
`TOPIC_YYYY-MM-DD.md`, one file per enhancement area. Update [`docs/README.md`](../README.md) when adding a file.

## Contents
| Document | Status | Summary |
|---|---|---|
| [SCALABILITY_AND_DATA_HANDLING_2026-10-10.md](SCALABILITY_AND_DATA_HANDLING_2026-10-10.md) | Proposed | How ASPIRE reads, caches, and syncs data today; 13 findings; the target design for 1,000+ simultaneous users; phased roadmap (P0–P3) with tests and acceptance criteria. |
| [scalability/README.md](scalability/README.md) | Proposed | Implementation specs, one per roadmap item (E-01–E-04 written; E-05–E-15 to follow), plus the spec template. |
| [scalability/HOSTING_TIERS_AND_COST.md](scalability/HOSTING_TIERS_AND_COST.md) | Proposed | Free vs. paid hosting limits; which tier each adoption size needs; questions for the school. |
| [SECTION_TRANSFER_ENROLLMENTS_2026-10-10.md](SECTION_TRANSFER_ENROLLMENTS_2026-10-10.md) | Proposed | Moving a student to another section keeps their old class enrollments; proposed transfer handling that preserves academic records. |
| [LATE_JOINER_HANDLING_2026-10-10.md](LATE_JOINER_HANDLING_2026-10-10.md) | Proposed | How late joiners are handled today (code audit), four gaps, and improvements LJ-A–LJ-D (faculty notice, post-only-changed, clearer messages, term-aware duplicate check). |
