# E-04: Dean department database functions

- **Priority:** P0
- **Fixes:** F-03, F-04, F-09
- **Status:** Proposed
- **Written:** 2026-10-10
- **Last revalidated:** never
- **Effort:** Large
- **Migration:** Yes (new database functions; the owner runs it manually)
- **Depends on:** E-01 (the paged helper reads the function results)

> Run "Before implementing a spec: audit and cross-check" in the [scalability README](README.md) before implementing.

## 1. Goal
Dean pages load a whole college (1,000+ students) correctly, without long ID lists in URLs and without downloading every raw score. The **database filters by department** and returns compact per-student inputs. The **risk formula stays in `src/lib/riskEngine.js`**, so there is still only one version of it.

## 2. Current behavior
| Page | What it reads today | Problem |
|---|---|---|
| `src/pages/dean/Dashboard.jsx` | `users` (**all**, unfiltered), `posted_grades` (**all**), `student_term_scores` (**all**), `class_grading_columns`, `student_risk_evaluations` (**all**), `remark_override_requests` (**all**); then `class_activities`, `attendance_records`, `student_activity_scores` for the college | Cut off at 1,000 rows; the whole school is downloaded; risk is computed in the browser |
| `src/pages/dean/AtRiskStudents.jsx` | Sections → students in college → `posted_grades` / `student_term_scores` `.in('student_id', all)` → `class_activities` → `student_activity_scores` `.in('activity_id', all).in('student_id', all)` | URL limit at about 300–400 students; 1,000-row cut-off |
| `src/pages/dean/SummaryReports.jsx` | `users`, `posted_grades`, `enrollments`: **all rows, `select('*')`** | 1,000-row cut-off; heavy download |
| `src/pages/dean/GradePostingStatus.jsx` | `posted_grades` (**all rows**) to see which classes have posted | Cut off; posting status becomes wrong as data grows |
| `src/pages/dean/GradeDistribution.jsx` | `posted_grades` filtered by one class and period | OK (bounded) |

## 3. Changes to existing files
| File | Change |
|---|---|
| `dean/Dashboard.jsx` | Replace the unfiltered reads with calls to the functions below. Keep the risk calculation in the app (`riskEngine.js` / `gradingMath.js`), fed by the function results. |
| `dean/AtRiskStudents.jsx` | Replace steps 2–3.5 (students, posted grades, term scores, activities, activity scores) with the functions; remove every `.in('student_id', …)` / `.in('activity_id', …)` list. |
| `dean/SummaryReports.jsx` | Use `get_department_posted_grades` and `get_department_student_roster` instead of `select('*')` on whole tables. |
| `dean/GradePostingStatus.jsx` | Use `get_department_posting_status` instead of reading all posted grades. |
| `src/lib/gradingMath.js` | Add `calculateWeightedTermRatingFromTotals({ formula, componentTotals })`: the same math as `calculateWeightedTermRating` (percentage = earned ÷ possible over entered items, completeness = entered count vs. expected count), but taking **totals** instead of item lists. The existing function stays unchanged. |
| `src/lib/deanAnalyticsService.js` (new; see §4) | Wraps the function calls and the paging. |

## 4. New files

### `src/lib/deanAnalyticsService.js`
```js
// All reads go through E-01's fetchAllRows (ordered), because function results
// are also limited to 1,000 rows per request.
export async function getDepartmentRoster(departmentId, termId);
export async function getDepartmentComponentTotals(departmentId, termId);
export async function getDepartmentPostedGrades(departmentId, termId);
export async function getDepartmentAttendanceTotals(departmentId, termId);
export async function getDepartmentPostingStatus(departmentId, termId);
```

### `scripts/verifyTotalsRating.js` (+ `npm run verify:totals-rating`)
Proves `calculateWeightedTermRatingFromTotals` gives **exactly** the same rating and completeness as `calculateWeightedTermRating` for many random item sets, including blanks (pending), zeros, multiple components, and missing components. This guarantees the Dean's numbers match the faculty's.

### Migration `supabase/migrations/<YYYYMMDDHHMMSS>_dean_department_analytics.sql`
See §5.

## 5. Database changes

All functions:
- are `STABLE`, `SECURITY DEFINER`, `SET search_path = public, pg_temp`;
- **authorize the caller** first, using the same pattern as existing functions: an active user who is `admin`, or `dean` with `department_id = p_department_id`. Otherwise `RAISE EXCEPTION`;
- filter through `sections.department_id = p_department_id` (via `class_records.section_id` or the student's `section_id`), and by `p_term_id` when given;
- return rows with a **stable sort key** so the client can page with `.range()`.

| Function | Returns (one row per …) | Replaces |
|---|---|---|
| `get_department_student_roster(p_department_id uuid, p_term_id uuid DEFAULT NULL)` | student: `student_id, first_name, last_name, user_number, email, section_id, section_name` | `users` + `sections` reads |
| `get_department_component_totals(p_department_id uuid, p_term_id uuid)` | student × class × term × component: `earned_sum, possible_sum, entered_count, expected_count, zero_count, pending_count` (from `class_activities` + `student_activity_scores`, entered = score not null) | Raw `student_activity_scores` and `class_activities` downloads |
| `get_department_legacy_term_scores(p_department_id uuid, p_term_id uuid)` | student × class × term: legacy `act1…act6, char_rating, exam` with column maxima | `student_term_scores` + `class_grading_columns` (only for classes still on legacy slots) |
| `get_department_posted_grades(p_department_id uuid, p_term_id uuid)` | posted grade row: `class_record_id, student_id, grade_period, computed_grade, effective_grade, remarks, is_locked, subject_code, subject_name` | All-rows `posted_grades` reads |
| `get_department_attendance_totals(p_department_id uuid, p_term_id uuid)` | student × class: `absences, lates, total_sessions` | `attendance_records` downloads |
| `get_department_posting_status(p_department_id uuid, p_term_id uuid)` | class × grade period: `class_record_id, grade_period, posted_count, locked_count, enrolled_count` | GradePostingStatus all-rows read |

SQL outline (one function shown):
```sql
CREATE OR REPLACE FUNCTION public.get_department_component_totals(
  p_department_id UUID, p_term_id UUID
) RETURNS TABLE (
  class_record_id UUID, student_id UUID, term TEXT, component_id UUID,
  earned_sum NUMERIC, possible_sum NUMERIC,
  entered_count INT, expected_count INT, zero_count INT, pending_count INT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- authorize: active admin, or active dean of p_department_id (raise otherwise)
  RETURN QUERY
  SELECT cr.class_record_id, e.student_id, ca.term, ca.component_id,
         COALESCE(SUM(sas.score) FILTER (WHERE sas.score IS NOT NULL), 0),
         COALESCE(SUM(ca.max_score) FILTER (WHERE sas.score IS NOT NULL), 0),
         COUNT(sas.score)::INT,
         COUNT(*)::INT,
         COUNT(*) FILTER (WHERE sas.score = 0)::INT,
         COUNT(*) FILTER (WHERE sas.score IS NULL)::INT
  FROM class_records cr
  JOIN sections s            ON s.section_id = cr.section_id AND s.department_id = p_department_id
  JOIN enrollments e         ON e.section_id = cr.section_id AND e.subject_id = cr.subject_id   -- same membership rule as the class roster
  JOIN class_activities ca   ON ca.class_record_id = cr.class_record_id
  LEFT JOIN student_activity_scores sas
         ON sas.activity_id = ca.activity_id AND sas.student_id = e.student_id
  WHERE cr.status = 'active' AND (p_term_id IS NULL OR cr.term_id = p_term_id)
    AND ca.max_score > 0   -- only configured activities, matching evaluationTracking.js
  GROUP BY cr.class_record_id, e.student_id, ca.term, ca.component_id
  ORDER BY e.student_id, cr.class_record_id, ca.term, ca.component_id;
END $$;
REVOKE ALL ON FUNCTION public.get_department_component_totals(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_department_component_totals(UUID, UUID) TO authenticated;
```
Notes for the implementer:
- **Roster membership rule.** The class roster is `enrollments` matched on the class's `section_id` **and** `subject_id` (`classRoomService.js`, step "Fetch enrolled students"). Irregular students join that way too, through join requests. Use exactly this rule, plus any status filter the roster applies at implementation time, and de-duplicate by student, so Dean totals match the faculty roster.
- **Pending vs. recorded zero** must match `countPendingActivities` / `countRecordedZeroScores` in `src/lib/evaluationTracking.js`, including only activities that are actually configured (max score > 0).
- **Rollback:** `DROP FUNCTION` for each new function. No tables or data change.
- Indexes: confirm with `EXPLAIN ANALYZE` on seeded data; candidates are listed in E-08.

## 6. Order of work
1. `calculateWeightedTermRatingFromTotals` + `verifyTotalsRating.js` (no database needed).
2. Write the migration; the owner applies it.
3. `deanAnalyticsService.js`.
4. Convert `GradePostingStatus.jsx` (simplest), then `SummaryReports.jsx`, `Dashboard.jsx`, `AtRiskStudents.jsx`.
5. Compare old and new numbers on the same data before removing the old code.

## 7. Risks and mitigations
| Risk | Mitigation |
|---|---|
| Dean numbers differ from faculty numbers | Same risk engine; totals-based rating proven equal by `verify:totals-rating`; side-by-side comparison in step 5. |
| Wrong enrollment rule (irregular students missing or duplicated) | Use the roster's `enrollments` match on `section_id` + `subject_id`, de-duplicated; test with an irregular student. |
| Unauthorized department access | The authorization check inside every function; test calling with another department's ID as a Dean (must fail). |
| Results above 1,000 rows | Read through E-01's paged helper with the function's sort key. |

## 8. Test plan
- `npm run verify:totals-rating` passes.
- Seed **1,000 students** across sections in one department. Dean Dashboard, At-Risk, Summary Reports, and Posting Status load without errors; counts equal SQL counts.
- For 20 random students, the Dean's risk score equals the faculty roster's risk score.
- A Dean calling the functions with another department's ID gets an error.
- An irregular student (enrolled in a class outside their home section) appears once, with the correct totals.

## 9. Paper and evaluation-tool impact
The documented Dean features are unchanged. If the thesis's technical description is updated, it can mention that department analytics are aggregated in the database while risk scoring stays in the shared risk engine.
