# SAGE Database Reset and Manual Seeding Guide

This step-by-step guide is designed to help you safely clean your Supabase database and manually seed SAGE through the User Interface to familiarize yourself with the academic workflows.

---

## 💡 Why a Clean Database Wipe & Manual Seeding is the Better Approach

Before your final capstone defense, executing a complete database wipe and manually seeding your data through the SAGE user interface provides critical advantages:

### 1. Why Wiping the Database is Necessary
* **Avoid Schema Violations & Constraints Mismatches:** The new database migration introduces structural shifts (such as dynamic `class_activities` and templates). Leaving old mock data in place will result in constraint crashes (e.g. subjects missing `computation_id` links, or grades mapping to non-existent hardcoded columns).
* **Eliminate Dirty Data Leaks:** Legacy audit logs, notifications, and AI recommendation snapshots are linked to old users and subjects. Keeping them will pollute your dashboards with stale histories and irrelevant recommendations.
* **Guaranteed Demo Predictability:** Starting with a blank slate ensures that all charts, histograms, and at-risk notifications reflect the actual entries you input during your testing or panel evaluation runs, rather than showing ghost data from earlier test phases.

### 2. Why Seeding Manually via the UI is Beneficial
* **UX and Workflow Familiarization:** Walking through the creation of templates, departments, users, and student loads step-by-step forces you to experience SAGE exactly as its target end-users (Administrators, Deans, and Faculty) will.
* **Form and Frontend Validation Testing:** Doing this manually exercises all client-side checks, warnings, input masks, and cascading filters (like the program-to-section selection limits) in a realistic setting.
* **Database Constraints Integrity Verification:** Inserting data directly through UI API requests ensures that database triggers, foreign keys, constraints, and Row Level Security (RLS) configurations are fully operational and integrated with the React frontend.
* **Capstone Defense Readiness:** A live demo or unexpected panelist question is much easier to handle if you have personally clicked through the configuration of grading scales, subject assignments, and student load assemblies from scratch.

---

## ⚠️ CRITICAL: Supabase Authentication Clean-Up
In Supabase, user logins are managed by the **Auth Module** (`auth.users`), which is separate from your database profile table (`public.users`). 

* **Yes, you should delete users from the Supabase Authentication dashboard.**
* If you wipe the `public.users` table but leave the accounts in Supabase Auth, you will get **"User already registered"** errors when trying to register those same email addresses manually in the UI.
* **Keep only one account:** Do not delete **`admin@sage.edu.ph`** from the Auth dashboard, as you need it to log in and start the manual seeding process.

---

## 🗺️ Step-by-Step Phasing Guide

```
┌────────────────────────────────────────────────────────┐
│ Phase 1: Database Truncation (Clear legacy tables)     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Phase 2: Supabase Auth Cleanup (Remove user accounts)  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Phase 3: Admin Account Verification (Ensure login)     │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ Phase 4: Manual UI Seeding & Workflow Testing           │
└────────────────────────────────────────────────────────┘
```

---

### Phase 1: Database Truncation (Supabase SQL Editor)
Run the following SQL commands in your Supabase SQL editor to clear all operational data, dynamic grading columns, logs, and legacy records:

```sql
BEGIN;

-- 1. Wipe all operational academic, grades, and evaluation data
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

-- 2. Wipe logs and request history
TRUNCATE TABLE 
    public.activity_logs, 
    public.class_faculty_log,
    public.notifications,
    public.student_academic_insights,
    public.faculty_performance_insights,
    public.unlock_requests,
    public.remark_override_requests
    RESTART IDENTITY CASCADE;

-- 3. Clear subjects, sections, academic terms, and custom computations
TRUNCATE TABLE 
    public.subjects,
    public.sections,
    public.academic_terms,
    public.grade_computation_components,
    public.grade_computations
    RESTART IDENTITY CASCADE;

-- 4. Clear all user profiles EXCEPT the Admin (to prevent login lockout)
DELETE FROM public.users 
WHERE email != 'admin@sage.edu.ph';

COMMIT;
```

---

### Phase 2: Supabase Authentication Clean-Up (Console Dashboard)
1. Go to your [Supabase Console](https://supabase.com/dashboard).
2. Open your project and click **Authentication** in the left sidebar.
3. In the **Users** tab, locate all accounts *except* `admin@sage.edu.ph`.
4. Click the three dots `...` next to each user and select **Delete User**.

---

### Phase 3: Verify Admin Account Integrity
Ensure your Admin account exists in both locations so you can log in:
1. In **Supabase Authentication**, verify that `admin@sage.edu.ph` is listed.
2. In the SQL Editor, run this command to make sure the Admin user profile matches in your public database:
   ```sql
   SELECT * FROM public.users WHERE email = 'admin@sage.edu.ph';
   ```
   *(If it's empty, create it using `seedDatabase.js` or insert it manually).*

---

### Phase 4: Manual Seeding via the SAGE UI
Log in with your Admin account (`admin@sage.edu.ph` / password: `DemoPassword123!`) and execute the following steps in order:

#### 1. Create Grade Computation Templates
* **Path:** `/admin/gradecomputations`
* **Action:** Click **Create Template** (e.g. name: *"CCS Lecture Scale"*).
* Add your weights (e.g. Class Standing = 50% [check `Allow Multiple`], Major Exam = 40%, Character = 10%).

#### 2. Create the Dean Account & Department
* **Path:** `/admin/users` $\rightarrow$ `/admin/departments`
* **Action:** 
  1. Create a user account with the role **Dean** (e.g., Carlos Valdes).
  2. Navigate to **Departments & Colleges** and click **Add Department** (e.g., *"College of Computer Studies"*). Assign the Dean account you just created.

#### 3. Add Subjects & Sections
* **Path:** `/admin/subjects` $\rightarrow$ `/admin/sections`
* **Action:**
  1. Add subjects (e.g., `IT101 - Introduction to Computing`) and select your **CCS Lecture Scale** grading template in the dropdown.
  2. Register your block sections (e.g., `BSIT-1A`) under the College of Computer Studies department.

#### 4. Add Faculty & Students
* **Path:** `/admin/users`
* **Action:**
  * Register a **Faculty** user (e.g. Amanda Rivera) and bind them to the CCS department.
  * Register a **Student** user (e.g. Sarah Jenkins) and bind them to CCS and the `BSIT-1A` section.

#### 5. Assign Subjects & Build Student Loads (College Office Portal)
* **Path:** Log in as **Office Admin** (or use Admin account)
* **Action:**
  1. Navigate to **Subject Assignment** (`/office/subjectassignments`). Assign the professor to teach `IT101` to `BSIT-1A`. *(This creates the dynamic class records)*.
  2. Navigate to **Subject Load Builder** (`/office/studentsections`). Look up your student, assign their block section, and enroll them in `IT101`.

#### 6. Enter Grades (Faculty Portal)
* **Path:** Log in as **Faculty**
* **Action:** Navigate to Class Records, open `IT101`, and click **`[+ Add Activity]`** to append quizzes, exams, or attendance and verify that calculations update instantly.
