# Defense Q&A: Scalability, Data Handling, and Late Joiners

**Audience:** the ASPIRE team, preparing for panel questions.
**Use:** short, honest answers. Details are in [`06-future-enhancements/SCALABILITY_AND_DATA_HANDLING_2026-10-10.md`](../../06-future-enhancements/SCALABILITY_AND_DATA_HANDLING_2026-10-10.md).

> Answer honestly: these are planned enhancements, not features already built. Saying "we identified this and designed the fix" is stronger than claiming something the panel can disprove in a demo.

---

### Q1. Can ASPIRE handle 1,000 students using it at the same time?
**At its current stage, ASPIRE is built and tested for pilot scale.** We audited it for institution-wide use and identified what limits it: notification polling, realtime connection limits, email sending limits, and pages that load large data in a single request. We designed a phased plan: paged reads, database-side aggregation for Dean pages, realtime without constant polling, pre-computed per-student summaries, and a load test with 1,000 simulated users before launch.

### Q2. Where is the data processed: in the browser or on the server?
Grade calculations and risk scoring currently run in the browser, using one shared risk engine, so every portal computes the same result. For large-scale use, the plan moves **data gathering** into the database (department-scoped database functions and per-student summaries) while keeping the **risk formula** in one place, so there are never two versions that could disagree.

### Q3. How do you handle large amounts of data, e.g., a class with many activities?
The database API returns at most 1,000 rows per request. The enhancement plan reads large results in **batches of 1,000 rows** with a fixed order, splits long ID lists into batches, and checks that the loaded count matches the database count before allowing a save. The grade sheet will save **only edited cells**, so a score that didn't load can never be overwritten.

### Q4. How is caching handled? Can one user see another user's data?
The browser cache is **per user and per tab**: keys include the user ID, it expires after 2 minutes, and it is cleared on sign-out. The offline cache (service worker) stores only the app's own files, never grade data. A planned enhancement also clears grade-sheet drafts and AI results on sign-out, for shared lab computers.

### Q5. What happens to a student who joins the class late, after the Midterm Rating was posted?
Missing work from an already-posted term is entered as **0**, so the student and faculty see the gap and the student is flagged as at risk instead of looking safe. When the student completes make-up work, the faculty replaces the 0 with the real score; grades stay correctable until the Semestral Grade is posted. We rejected leaving those cells blank because, in an early-warning system, a hidden risk is worse than a visible one. (Decision record: [`02-thesis/decisions/LATE_JOINER_MISSING_ACTIVITIES_2026-10-10.md`](../decisions/LATE_JOINER_MISSING_ACTIVITIES_2026-10-10.md).)

### Q6. Do notifications scale?
Notifications are stored in the database and delivered in-app, as device alerts, and by email. For scale, the plan removes the frequent background check, relies on realtime updates only while the app is open, and moves email to a transactional provider that sends one summary email per student per grade posting.

### Q7. What would you improve if you had more time?
In priority order:
1. Make every large data read paged and every grade-sheet save edit-only.
2. Move Dean analytics into database functions.
3. Remove notification polling.
4. Pre-compute per-student summaries.
5. Store AI Study Tutor results in the database.
6. Split the app so each portal loads only its own pages.
7. Run a 1,000-user load test.

### Q8. How do you know it will work at scale?
Each enhancement has written acceptance criteria and a test, e.g., a seeded class with 1,500 score rows, a 1,000-student department, and a load test with 1,000 simulated users. Launch would follow those tests passing.
