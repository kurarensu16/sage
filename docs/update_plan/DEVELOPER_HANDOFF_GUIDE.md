# SAGE — Developer Database Migration & Integration Guide

This guide is prepared for the backend developer to complete **Phase 5 (Database Migration)**. It is organized by portal roles to help you easily locate, deploy, and integrate the frontend component states with Supabase.

---

## 🛠️ Step 1: Deploy SQL Migration Schema

> [!CAUTION]
> **PREVENT DATA MISMATCHES:** Because this update introduces significant structural changes to grading workflows (e.g., dynamic `class_activities` replacing hardcoded columns, and the `is_multiple` boolean in `grade_computation_components`), you **MUST wipe/delete existing related data** (or execute a fresh database reset) before applying these schema updates. Attempting to run this migration on top of legacy mock data will result in constraint violations and silent data mismatches in the UI.

Run the complete SQL commands inside **[`database_migration_2026-08-19.sql`](file:///c:/Users/JC%20Gabriel/Downloads/SAGE/SAGE_UPDATE_PLAN_2026-08-19/database_migration_2026-08-19.sql)** in your Supabase SQL editor. This creates:
1. `public.class_activities`: Tracks dynamic columns created per course and term.
2. `public.grade_computation_components`: Added `is_multiple` boolean column to specify if a component type allows multiple column additions (e.g. Class Standing = true, Major Exam = false).
3. `public.student_activity_scores`: Holds individual student scores mapping to activities.
4. Alters `public.enrollments` table to append the `status` verification column.
5. Appropriate query performance database indexes.

---

## 💾 Step 2: Seed Mock Datasets for Testing

For a cleaner integration environment, it is highly recommended to populate mock records (including clean user accounts, section assignments, and grading computation templates):
1. **Mock Seed Execution**: Ask the system administrator for the matching test seeds or write custom insert statements populating:
   * **Users**: Faculty accounts (role `'faculty'`) and student profiles (role `'student'`).
   * **Templates**: Configured `grade_computations` templates mapping `is_multiple` component behaviors.
   * **Enrollments**: Student records with `'pending_verification'` status to populate the verification queue for testing.

---

## 🎓 1. Faculty Portal Integrations

### 1. Log Class Scores Spreadsheet (`ScoreInput.jsx`)
* **URL Parameter Required**: Expects a valid class record ID query parameter: `/faculty/scoreinput?id=[class_record_id]`. If loaded without it, metadata and student lists will remain blank (`0 Students` enrolled).
* **Load Columns**: Currently custom columns load from `localStorage` placeholder:
  ```javascript
  const localActs = localStorage.getItem(`sage_activities_${classRecordId}`);
  ```
  Replace this with a Supabase query fetching rows from `class_activities` where `class_record_id = classRecordId`.
* **Save/Create Columns**: Inside `handleAddActivitySubmit`, instead of saving to `localStorage`:
  ```javascript
  localStorage.setItem(`sage_activities_${classRecordId}`, JSON.stringify(updated));
  ```
  Perform a Supabase `.insert()` into the `class_activities` table.
* **Auto-Save Draft Scores**: Inside `StudentRow.jsx` auto-save effect, map the dynamic activity scores object and `.upsert()` into `student_activity_scores` matching `(student_id, activity_id)`.
* **Goal State behavior**: Renders a dynamic student roster loaded alphabetically. Instructors can use the `[+ Add Activity]` button to append columns (e.g. "Quiz 3", "Lab Task 2") with custom max scores, which instantly recalculates student averages.

### 2. Roster Verification Queue (`VerificationQueue.jsx`)
* **Load**: Fetches pending requests from Supabase `enrollments` matching the logged-in faculty member's classes:
  ```javascript
  .eq('status', 'pending_verification')
  .eq('class_records.faculty_id', user.id);
  ```
* **Goal State Behavior**:
  * **Pending Approval List (Left Panel)**: Shows card items for students whose enrollment status is `'pending_verification'`. Displays their name, year level, and target section.
  * **Verification Detail & COR PDF (Right Panel)**: Clicking a student loads their profile information and opens an embedded iframe showing their uploaded Certificate of Registration (COR) PDF.
  * **Approvals**: Green **`[ Approve Roster Entry ]`** updates their status to `'active'`, which automatically populates them in the Log Class Scores spreadsheet roster. Red **`[ Reject Request ]`** declines their request.

---

## 👤 2. Student Portal Integrations

### 1. Grade Breakdown Ledger (`MyGradesDetail.jsx`)
* **Load**: Change the local activities reader:
  ```javascript
  const localActsRaw = localStorage.getItem(`sage_activities_${targetClassRecordId}`);
  ```
  To query `class_activities` and match the student's earned scores from `student_activity_scores` in a single joined select.
* **Goal State Behavior**: Renders a dynamic Schoology-Style ledger looping over active columns fetched from the database for the selected subject. Renders individual activity rows containing names and fractional scores.
* **Semestral Summary Widget**: A dedicated light-themed summary card aggregating Midterm and Final ratings to compute the overall Semestral Grade (SG), transmuted GWA, and final clearance status remarks.

### 2. Student Attendance Log (`Attendance.jsx`)
* **Load**: Queries meeting logs from the database to render dates and statuses.
* **Goal State Behavior**: Displays a vertical card list of all course meetings logged by the professor, indicating whether the student was marked Present, Tardy, or Absent. Displays total accumulated absences; if absences reach 3 or more, a warning banner alerts automatic FDA (Failure Due to Absences) risk flags.

---

## 🔑 3. Admin Portal Integrations

### 1. Subject Grading scale mapping (`SubjectForm.jsx`)
* **Integration**: Drops down listing active grade computation templates from `grade_computations`. Connect `computation_id` foreign key updates on subject submission.

### 2. Grade Computations lists (`GradeComputationsList.jsx`)
* **Integration**: Connect components inserts and template deletions to Supabase tables `grade_computations` and `grade_computation_components`.

---

## ☀️ 4. Summer Term Period Compression Guidelines

To support subjects offered during the **Summer term** (which only utilize **2 grading periods**: `Midterm` and `Final`) instead of the standard **4 periods** (`Prelim`, `Midterm`, `Semi-Final`, and `Final`):

### 1. Identify Semester Type
Read the matching class record's section semester field (e.g. `sections.semester = 'Summer'`). 

### 2. Make Periods Dynamic
Instead of hardcoding `const periodsList = ['Prelim', 'Midterm', 'Semi-Final', 'Final']` across the files (`ScoreInput.jsx`, `MyGradesDetail.jsx`, `StudentRow.jsx`, `GradeComponentsSetup.jsx`, `GradeComputationPreview.jsx`):
* **Dynamic Definition**:
  ```javascript
  const isSummer = classInfo?.sections?.semester === 'Summer' || classInfo?.sections?.semester?.toLowerCase().includes('summer');
  const periodsList = isSummer ? ['Midterm', 'Final'] : ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
  ```

### 3. Adjust Calculations
When `isSummer` is active, the **Semestral Grade (SG)** average must scale to average only Midterm and Final:
$$\text{Semestral Grade (SG)} = \frac{\text{Midterm Rating} + \text{Final Rating}}{2}$$
(The `Prelim` and `Semi-Final` steps are bypassed).
* Update `gradingMath.js` and student summaries to handle this conditional fallback branch based on the loaded class record semester metadata.

---

## 🏫 5. Dean Portal Integrations

Currently, the Dean Portal relies heavily on aggregating live data across several entities (Faculty Evaluations, Grade Distribution, At-Risk Students). Since the database is not fully populated, temporary **mock fallbacks** have been injected into `catch (err)` blocks in several components.

### 1. Mock Fallback Data Location
The mock datasets have been added to the bottom of `src/lib/mockdb.js`:
- `mockDeanFacultyData`
- `mockDeanAtRiskStudents`
- `mockDeanGradeDistribution`
- `mockDeanGradePostingStatus`
- `mockDeanRemarkRequests`

### 2. Required Backend Action
To remove these fallbacks and restore live functionality:
1. Ensure the migration for `evaluation_windows`, `evaluation_responses`, and `evaluation_ratings` is executed and seeded.
2. Ensure Row Level Security (RLS) policies permit the Dean role to query users and records matching their `department_id`.
3. In `src/pages/dean/EvalResultsOverview.jsx` (and similarly in `AtRiskStudents.jsx`, `GradeDistribution.jsx`), you can remove the following temporary override in the catch blocks:
   ```javascript
   } catch (err) {
       console.warn('Database query failed, falling back to mock dataset:', err);
       setFacultyList(mockDeanFacultyData); // <-- REMOVE THIS OVERRIDE
       setError(null);
   }
   ```
4. Once the overrides are removed, the components will correctly render the `"Could not load evaluation data from the database."` banner if the query fails, or the actual live Supabase data if successful.

---

## 🧪 6. Testing & Audit Guide

When testing these integrations, use the following mock accounts and navigate to the specified pages to verify the UI and data binding behaviors:

### 🎓 Student Portal
**Account:** `s.jenkins@student.sage.edu`
* **My Grades (`/student/grades` -> "View Details"):** Verify the Schoology-style grade ledger, the Semestral Grade summary card, and Summer term tab behavior.
* **Attendance (`/student/attendance`):** Check the vertical meeting logs and the Warning Banner for excessive absences (3+).

### 👨‍🏫 Faculty Portal
**Account:** `a.rivera@sage.edu.ph`
* **Log Class Scores (`/faculty/scoreinput`):** Test adding dynamic activities ("+ Add Activity") and verify the columns append and calculate the running average.
* **Verification Queue (`/faculty/verification`):** Verify the split-panel UI loads pending students (left) and displays their details/COR PDF (right).

### 🏢 College Office
**Account:** `admin@sage.edu.ph` *(or dedicated office admin)*
* **Clearance & Eval Audit (`/office/compliance`):** Click **View Details**. Verify the two-layer modal (Pending above, Completed below) and the progress bar.
* **Subject Reassignment (`/office/subjects/assign`):** Try assigning a professor to a subject outside their department to trigger the yellow **Department Mismatch Warning**.

### 🏫 Dean Portal
**Account:** `c.valdes@sage.edu.ph`
* **Dashboard (`/dean/dashboard`):** Verify summary cards and recent activity.
* **Faculty Evaluations (`/dean/evalresultsoverview`):** Verify the grid of faculty cards loads the `mockdb.js` fallback data. Drill down into individual results to check criteria breakdowns.
* **At-Risk Students (`/dean/atriskstudents`):** Verify the data table and AI advisories load.
* **Grade Distribution (`/dean/gradedistribution`):** Select a period to view the generated histogram.

### ⚙️ System Admin
**Account:** `admin@sage.edu.ph`
* **Grade Computations (`/admin/gradecomputations`):** Verify the `is_multiple` checkbox feature on templates.
* **Departments & Colleges (`/admin/departments`):** Verify the new route allows viewing departments and assigning Deans.
