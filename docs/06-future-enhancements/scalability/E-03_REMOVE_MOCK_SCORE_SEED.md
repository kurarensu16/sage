# E-03: Remove the hard-coded mock score seed

- **Priority:** P0
- **Fixes:** F-12
- **Status:** Proposed
- **Written:** 2026-10-10
- **Last revalidated:** never
- **Effort:** Small
- **Migration:** No
- **Depends on:** None

> Run "Before implementing a spec: audit and cross-check" in the [scalability README](README.md) before implementing.

## 1. Goal
The grade sheet shows only real data from the database. No class ID, student ID, or score is hard-coded in page code.

## 2. Current behavior
`src/pages/faculty/ScoreInput.jsx`, inside the data-loading effect, right after the activity scores are read (around line 683 on 2026-10-10):

```js
if (classRecordId === '35d248d1-ef72-4569-8f40-ca0dfe141941') {
  // Seed mock scores for Ocampo, Julia
  const studentId = 'cc5d7178-5d2b-45b2-b5b2-a40e5184c22d';
  …  // writes fixed Prelim (and possibly other) scores into scoresByStudent
}
```
When that class opens, fixed scores are injected into the draft. Because drafts are saved (see E-02), they can be **written to the database** as if the faculty had entered them.

## 3. Changes to existing files
| File | Change |
|---|---|
| `src/pages/faculty/ScoreInput.jsx` | Delete the whole `if (classRecordId === '35d248d1-…') { … }` block. |

## 4. New files
None. If demo data is needed, use the seed scripts (`src/lib/seedDatabase.js`, `seedAdmin.js`) or the procedures in `docs/05-operations/database/`, which write to a demo database rather than the page code.

## 5. Database changes
None in code. **Data check before removing:** if that class exists in the live database, compare its stored scores for the student `cc5d7178-…` with what the faculty actually recorded. Mock values may already have been saved, and the owner should decide whether to correct them.

```sql
-- Read-only check
SELECT ca.term, ca.name, sas.score, sas.updated_at
FROM public.student_activity_scores sas
JOIN public.class_activities ca ON ca.activity_id = sas.activity_id
WHERE ca.class_record_id = '35d248d1-ef72-4569-8f40-ca0dfe141941'
  AND sas.student_id = 'cc5d7178-5d2b-45b2-b5b2-a40e5184c22d'
ORDER BY ca.term, ca.name;
```

## 6. Order of work
1. Run the read-only check.
2. Remove the block.
3. Search for leftovers: `grep -rn "35d248d1\|cc5d7178\|mock" src/` should find nothing relevant.

## 7. Risks and mitigations
| Risk | Mitigation |
|---|---|
| A demo relied on these fake scores | Re-create them as proper seed data in a demo database. |
| Mock values already saved | The read-only check above; the owner decides on corrections. |

## 8. Test plan
- Open that class (if it exists): only database scores appear.
- `npm run lint` passes; the code search finds no hard-coded IDs.

## 9. Paper and evaluation-tool impact
None.
