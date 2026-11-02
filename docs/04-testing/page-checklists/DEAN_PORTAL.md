# Dean portal — page checklists

**First page checklisted:** Phase 4 (Faculty Loading and Provisioning), 2026-10-29

Only the pages that the post-defense phases created or changed are listed here.
The Dean portal's pre-existing pages (Dashboard, At-Risk Students, Evaluations,
Reports) are covered by the main runbook,
[`../SYSTEM_TEST_CHECKLIST_2026-10-10.md`](../SYSTEM_TEST_CHECKLIST_2026-10-10.md).

> **Before running anything:** restart the dev server (`npm run dev`, port
> **5175**).

---

## Faculty Loading & Provisioning (Dean scope)

**ID:** `DEAN-LOADING` · **Route:** `/dean/facultyloading` · **File:** `src/pages/dean/FacultyLoadingAndProvisioning.jsx`
**Last touched by:** Phase 4

The shared workspace behaviour — lock, scheduling, conflict detection, drafts,
roster — is checklisted once in
[`FACULTY_LOADING.md`](FACULTY_LOADING.md) (`LOAD-LOCK`, `LOAD-SCHED`,
`LOAD-CONFLICT`, `LOAD-DRAFT`, `LOAD-ROSTER`). **Run that file as dean**, then
the dean-only cases below.

- [ ] The page opens already scoped to the dean's own college. There is **no**
      college picker.
- [ ] The scope is taken from the dean's `department_id`, and a dean with no
      department set gets a plain explanation rather than an empty workspace.
- [ ] Faculty offered for assignment are the dean's own college's faculty.
- [ ] Sections and subjects offered are the dean's own college's.
- [ ] **Conflict redaction:** a conflict caused by a load in *another* college is
      reported as college + program + days + time only. No subject code, no
      section name. The dean must be able to act on the clash without reading
      another college's class list.
- [ ] A conflict *within the dean's own college* is also redacted — the rule is
      role-based, not college-based, so the dean sees the same shape either way.
- [ ] **Security:** signing in as dean and calling `find_schedule_conflict()`
      directly still returns the stripped payload. The redaction lives in the
      data function, so bypassing the UI must not reveal the specifics.
- [ ] **Security:** a dean cannot assign a load in a college other than their own,
      even by editing the request. Confirm the server refuses it, not just the UI.
- [ ] Lock contention with the Registrar works in both directions: a registrar
      holding this dean's college locks the dean out, and vice versa.
- [ ] Breadcrumb reads as the Dean portal.
