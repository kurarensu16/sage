# SAGE Database Reset and Manual Seeding Guide

This step-by-step guide is designed to help you safely clean your Supabase database and re-seed SAGE with the correct data hierarchy for testing, development, and capstone defense demonstrations.

---

## ✅ Pre-Flight Status

| Item | Status | Notes |
|---|---|---|
| Institutional Email Domain | `@dyci.edu.ph` | Standardized across all accounts |
| `'office'` role added to `user_role` enum | ✅ Done | Department-scoped office accounts |
| `departments` table populated (11 colleges) | ✅ Done — **DO NOT truncate** | Root relational anchor for all colleges |
| `users_rows.csv` prepared with 301 users | ✅ Ready | Formatted for SAGE Batch CSV Import |
| RLS disabled for development | ✅ Confirmed | Bypasses permission overhead during testing |

---

## 🗺️ Clean Reset Flow Overview

```
departments (KEEP — already seeded with 11 colleges)
      │
      ▼
Phase 1: Truncate operational and user data (preserve departments + system admin)
      │
      ▼
Phase 2: Clean Supabase Auth Users (keep admin.system@dyci.edu.ph)
      │
      ▼
Phase 3: Seed academic_terms (1 active term for AY 2026-2027 1st Sem)
      │
      ▼
Phase 4: Create block sections via SAGE Admin UI (/admin/sections)
      │
      ▼
Phase 5: Batch Import 301 Users via SAGE Admin UI (/admin/users)
         (CSV → Supabase Auth + public.users via create-admin-user Edge Function)
      │
      ▼
Phase 6: Seed subjects & grade computation templates via SAGE UI
      │
      ▼
[System is operational — class records, enrollments, activities, and grades
 are managed dynamically through the Admin, Office, and Faculty portals]
```

---

## Phase 0.5: Department-Level Row Level Security (Optional / Future Update)

> [!NOTE]
> Currently, Row Level Security (RLS) is disabled for standard development tables. For production deployment or RBAC verification during defense presentations, you can enable department-scoped constraints using your migration script:
* **`supabase/migrations/20260826155500_enable_rbac_office_rls.sql`** (or relevant RBAC migration).

---

## Phase 1: Database Truncation (Supabase SQL Editor)

Run the following SQL in your **Supabase SQL Editor**. This clears all operational data, enrollments, grades, logs, and user profiles — **while preserving your existing `departments` rows and the System Admin profile**.

```sql
BEGIN;

-- 1. Wipe all grade, evaluation, and activity data (deepest dependencies first)
TRUNCATE TABLE 
    public.student_activity_scores,
    public.class_activities,
    public.posted_grades,
    public.student_term_scores,
    public.component_scores,
    public.grade_components,
    public.class_grading_columns,
    public.enrollments,
    public.class_records,
    public.attendance_records,
    public.student_term_details,
    public.evaluation_comments,
    public.evaluation_ratings,
    public.evaluation_responses,
    public.evaluation_windows
    RESTART IDENTITY CASCADE;

-- 2. Wipe logs, insights, and request history
TRUNCATE TABLE 
    public.activity_logs, 
    public.class_faculty_log,
    public.notifications,
    public.student_academic_insights,
    public.faculty_performance_insights,
    public.unlock_requests,
    public.remark_override_requests
    RESTART IDENTITY CASCADE;

-- 3. Wipe grading templates and academic structure
TRUNCATE TABLE 
    public.grade_computation_components,
    public.grade_computations
    RESTART IDENTITY CASCADE;

-- 4. Wipe sections and academic terms (sections depend on departments, which we KEEP)
TRUNCATE TABLE 
    public.sections,
    public.academic_terms
    RESTART IDENTITY CASCADE;

-- 5. Wipe subjects
TRUNCATE TABLE public.subjects RESTART IDENTITY CASCADE;

-- 6. Clear all user profiles EXCEPT the System Admin (to prevent admin lockout)
DELETE FROM public.users 
WHERE email NOT IN ('admin.system@dyci.edu.ph', 'admin@dyci.edu.ph');

COMMIT;
```

> [!CAUTION]
> **Do NOT truncate `departments`**. They are already populated with all 11 colleges and act as the root Foreign Key anchor for sections, subjects, user profiles, and office scope.

---

## Phase 2: Supabase Authentication Clean-Up (Dashboard)

After truncating the public tables, delete orphaned Auth accounts so re-importing users will not produce `"User already registered"` errors:

1. Open your [Supabase Dashboard](https://supabase.com/dashboard).
2. Navigate to **Authentication** → **Users**.
3. Select **all users except** your main system admin account (`admin.system@dyci.edu.ph` or `admin@dyci.edu.ph`).
4. Click **Delete Users**, leaving only the system admin account active.

> [!IMPORTANT]
> **Do NOT delete the admin account** from the Supabase Auth dashboard. Keeping it active ensures you can log in immediately to complete the subsequent phases.

---

## Phase 3: Seed Academic Term (Supabase SQL Editor)

Create the active academic term. This must exist before creating sections because sections require an active `term_id`.

```sql
INSERT INTO public.academic_terms (school_year, semester, is_active, is_evaluation_open)
VALUES ('2026-2027', '1st', TRUE, FALSE)
RETURNING term_id;
```

---

## Phase 4: Create Sections & Verify Departments (SAGE Admin UI)

Before importing student users, their assigned sections must exist in the database.

1. **Verify Departments:** Ensure all 11 colleges are visible under `/admin/departments`.
2. **Register Sections:** Log in as System Admin (`admin.system@dyci.edu.ph` / `DemoPassword123!`) and navigate to **Section Management** (`/admin/sections`).
3. **Add Block Sections:** Create the required block sections for the **2026-2027 1st Semester** (e.g., `BSIT-1A`, `BSIT-1B`, `BSA-1A`, `BSHM-2A`, `BSCS-3A`).
4. **Naming Consistency:** Ensure section names in the UI match the exact codes in your `users_rows.csv` so the batch importer can automatically resolve their `section_id` foreign keys.

---

## Phase 5: Batch Import Users via SAGE Admin Portal

SAGE includes a built-in **Batch CSV Import** engine in the Admin Portal. It reads your CSV file and calls the `create-admin-user` Supabase Edge Function to atomically create each account in **Supabase Auth** (`auth.users`) and populate their profile in **`public.users`**.

### 1. Required CSV Format (`users_rows.csv`)

The CSV file must contain the following 10 comma-separated columns:

```csv
LastName,FirstName,MiddleName,Email,Role,College,Program,Section,YearLevel,IDNumber
```

#### Example Rows:
```csv
Smith,Jane,A.,jenkins.sarahlee.college@dyci.edu.ph,student,College of Computer Studies,Bachelor of Science in Information Technology,BSIT-1A,1st Year,2026-00005
Valdes,Carlos,Mendoza,c.valdes@dyci.edu.ph,dean,College of Computer Studies,,,,DN-2026-00002
Rivera,Amanda,Santos,a.rivera@dyci.edu.ph,faculty,College of Computer Studies,Bachelor of Science in Information Technology,,,FAC-2026-00003
Office,CCS,Staff,office@dyci.edu.ph,office,College of Computer Studies,,,,OFC-2026-00008
```

### 2. Execution Steps in SAGE Admin UI

1. Log in to SAGE as **System Admin** (`admin.system@dyci.edu.ph` / `DemoPassword123!`).
2. Navigate to **User Management** (`/admin/users`).
3. Click the **`[Import Users]`** (or **`[Batch CSV Import]`**) button in the top-right toolbar.
4. Drag and drop your `users_rows.csv` file into the upload zone or paste the raw CSV content.
5. The importer will automatically parse and validate:
   - ✅ Email domain format (`@dyci.edu.ph`)
   - ✅ College department matching against existing database departments
   - ✅ Section matching against existing sections
   - ✅ ID Number format (`YYYY-XXXXX` for students, `ADM/FAC/DN/OFC-YYYY-XXXXX` for employees)
6. Review the parsed user list table and click **`Confirm & Import All`**.
7. The progress modal will process the 301 users sequentially via the Supabase Edge Function with auto-confirmed email verification.

---

## Phase 6: Seed Subjects + Grade Computation Templates (SAGE UI)

With all users, departments, terms, and sections populated, complete the operational setup through the SAGE web portals:

#### 1. Create Grade Computation Templates (Admin Portal)
* **Path:** `/admin/gradecomputations`
* Click **Create Template** (e.g. *"CCS Standard Lecture Scale"*).
* Add components:
  * **Class Standing (Formative):** `50%` (Weight: 50, Max Score: 20, Multiple Activities: `ON`)
  * **Major Examination:** `40%` (Weight: 40, Max Score: 40, Multiple Activities: `OFF`)
  * **Character Rating:** `10%` (Weight: 10, Max Score: 100, Multiple Activities: `OFF`)

#### 2. Add Subjects per College (Admin Portal)
* **Path:** `/admin/subjects`
* Add catalog subjects (e.g. `IT101 - Introduction to Computing`, `IT201 - Data Structures`, `IT401 - Capstone Project 1`) and link each subject to its grading computation template.

#### 3. Assign Faculty to Classes (College Office Portal)
* Log in as the College Office account (e.g. `office@dyci.edu.ph` for CCS).
* **Path:** `/office/subjectassignments`
* Assign professors to teach subjects in specific sections. This generates the official `class_records` rows.

#### 4. Enroll Students into Classes (College Office Portal)
* **Path:** `/office/studentsections` (or `/office/rosterimport`)
* Enroll students into their section classes. This populates `public.enrollments`.

#### 5. Grade Encoding & Activities (Faculty Portal)
* Log in as Faculty (e.g. `a.rivera@dyci.edu.ph` / `DemoPassword123!`).
* Navigate to **Class Records** (`/faculty/classes`) → Open a class record.
* Click **`[+ Add Activity]`** to dynamically add quizzes, machine problems, character evaluations, and prelim/midterm exam scores.

---

## 📌 College Office Accounts Reference

Each college has its dedicated departmental office account. These accounts are **department-scoped** — they can only view and manage sections, student loads, and faculty assignments within their assigned college.

| College / School | Email | Default Password | Role |
|---|---|---|---|
| College of Computer Studies | `office@dyci.edu.ph` | `DemoPassword123!` | `office` |
| College of Accountancy | `office.accountancy@dyci.edu.ph` | `DemoPassword123!` | `office` |
| College of Art and Sciences | `office.artsciences@dyci.edu.ph` | `DemoPassword123!` | `office` |
| College of Business Administration | `office.business@dyci.edu.ph` | `DemoPassword123!` | `office` |
| College of Education | `office.education@dyci.edu.ph` | `DemoPassword123!` | `office` |
| College of Health Sciences | `office.health@dyci.edu.ph` | `DemoPassword123!` | `office` |
| College of Hospitality Management and Tourism | `office.hospitality@dyci.edu.ph` | `DemoPassword123!` | `office` |
| College of Maritime Education | `office.maritime@dyci.edu.ph` | `DemoPassword123!` | `office` |
| Department of General Education | `office.gened@dyci.edu.ph` | `DemoPassword123!` | `office` |
| School of Mechanical Engineering | `office.engineering@dyci.edu.ph` | `DemoPassword123!` | `office` |
| School of Psychology | `office.psychology@dyci.edu.ph` | `DemoPassword123!` | `office` |

---

## 📌 APPENDIX: LEGACY & UNUSED TABLES AUDIT

The following tables exist in older SQL schema migrations but are **completely unused** by the current SAGE React codebase. You can safely ignore them during seeding:

### 1. `public.grade_components` & `public.component_scores`
* **Why they exist:** Originally designed for static grade component rows per class.
* **Why unused now:** SAGE was refactored to use dynamic grading via **`public.class_activities`** (custom activities created by faculty) and **`public.student_activity_scores`** (scores per activity). The old static tables are obsolete.

### 2. `public.class_faculty_log`
* **Why it exists:** Created to fulfill FR30 (Faculty Reassignment Auditing).
* **Why unused now:** Reassignment audit logging is handled by the centralized **`public.activity_logs`** table, making a separate log table redundant.

### 3. `public.student_term_details`
* **Why it exists:** Originally planned to store historical section and year level mappings per term.
* **Why unused now:** Active section and year level are maintained directly on `public.users` (`section_id`, `year_level`). Historical enrollment is derived by querying `public.enrollments`.
