what 

# Test Year Seed: School Year 2026-2027 (BSIT and BSMarE)

**Status:** Current. **Purpose:** rebuild a small, clean data set after the 2026-10-11 reset and run one full school year (1st → 2nd → Summer) to test grading, the term rollover, the SG grace period, and term history for every role.

Run every SQL block in the **Supabase SQL editor**. Everything else is done in the app as the admin. Do the stages in order.

## Progress (update as you go)

| Stage | What                                               | Status                                         |
| ----- | -------------------------------------------------- | ---------------------------------------------- |
| Reset | Students, terms, sections, classes, grades removed | Done 2026-10-11                                |
| 0     | 7 new subjects, first term, 4 sections             | Done                                           |
| 0b    | Keep only the 10 seed subjects                     | Done (10 subjects)                             |
| 0b    | Duplicate-subject migration                        | Done 2026-10-11                                |
| 1     | Import 40 students                                 | Done (10 per section)                          |
| 1b    | Create 8 classes                                   | **To do** (class check returned no rows) |
| 1c    | Grade the 1st semester                             | Not started                                    |
| 2     | 2nd semester and rollover                          | Not started                                    |
| 3     | Summer and rollover                                | Not started                                    |

## Reset done before this seed (2026-10-11)

- **Kept:** the admin, 10 deans, and 40 faculty accounts; colleges; programs; subjects; COG templates; `activity_logs` (the reset itself is recorded there).
- **Removed:** all 320 students and their logins, terms, sections, classes and everything under them, enrollments, term history, notifications, and AI insights.
- **Subjects trimmed (Stage 0b):** only the 10 subjects used here are kept (ITC113, ITP113, ITP123, DSA123, NAV113, MSH111, AUX123, MSH122, SEA103, SST103). Migration `20261011150000_unique_subjects.sql` then makes the database refuse duplicate subject codes and duplicate subject names within a college.
- **Student emails** use `@dyci.edu.ph` (Stage 1 CSV).

## Test design

|          | **BSIT** (Technology and Engineering College for Humanity)               | **BSMarE** (College of Maritime Education)                                   |
| -------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| COG      | General Education Core (regular)                                               | Maritime Lecture Scale and Maritime Laboratory Scale                               |
| Sections | `BSIT-1A`, `BSIT-1B` (10 students each)                                    | `BSMARE-1A`, `BSMARE-1B` (10 students each)                                    |
| Faculty  | Amanda Rivera (`a.rivera@sage.edu.ph`), Marcus Cruz (`m.cruz@sage.edu.ph`) | Ricardo Aquino (`r.aquino@sage.edu.ph`), Maria Garcia (`m.garcia@sage.edu.ph`) |
| Dean     | `tech.dean@dyci.edu.ph`                                                      | `maritime.dean@dyci.edu.ph`                                                      |

**Classes per term** (each subject is taught in both sections of its program by the same instructor):

| Term    | BSIT subjects (instructor)                         | BSMarE subjects (instructor)                                            | Classes |
| ------- | -------------------------------------------------- | ----------------------------------------------------------------------- | ------- |
| 1st Sem | ITC113 (Rivera), ITP113 (Cruz)                     | NAV113 Lecture (Aquino),**MSH111** Laboratory (Garcia)            | 8       |
| 2nd Sem | **ITP123** (Rivera), **DSA123** (Cruz) | **AUX123** Lecture (Aquino), **MSH122** Laboratory (Garcia) | 8       |
| Summer  | none: no Summer section                            | **SEA103** Lecture (Aquino), **SST103** Laboratory (Garcia) | 4       |

Bold subjects are new (Stage 0). BSIT students have **no Summer section on purpose**: at the 2nd → Summer rollover they must **keep** their 2nd-semester section and year level.

**Rollover tests built into the year:**

- **1st → 2nd:** leave **one class** without a posted SG (suggested: ITP113 in BSIT-1B); grace **30 days**. Expect it under the instructor's Past Archives as *Pending*; posting it afterwards is labelled **Late**.
- **2nd → Summer:** leave **one class** without a posted SG (suggested: MSH122 in BSMARE-1A); grace **0 days**. Expect **Overdue** for the faculty and the Dean; posting it afterwards is labelled **Late (overdue)**.
- **Anytime after an archive:** one SG correction on an archived class (checklist AS-38).

Checklist cases: B10c–B10e (AS-01 to AS-51) in `docs/04-testing/SYSTEM_TEST_CHECKLIST_2026-10-10.md`.

## Stage 0: subjects, first term, 1st-semester sections (SQL, once)

The first term is created here because Term Settings can only create the *next* term of an active one.

```sql
BEGIN;

-- 7 new subjects (code = prefix + year + semester + units; semester 0 = Summer).
INSERT INTO public.subjects (code, name, units, department_id, computation_id)
SELECT v.code, v.name, v.units, d.department_id, gc.computation_id
FROM (VALUES
  ('ITP123', 'Intermediate Programming',       3, 'Technology and Engineering College for Humanity', 'General Education Core'),
  ('DSA123', 'Data Structures and Algorithms', 3, 'Technology and Engineering College for Humanity', 'General Education Core'),
  ('MSH111', 'Marine Shop Practice 1',         1, 'College of Maritime Education', 'Maritime Laboratory Scale'),
  ('AUX123', 'Auxiliary Machinery 1',          3, 'College of Maritime Education', 'Maritime Lecture Scale'),
  ('MSH122', 'Marine Shop Practice 2',         2, 'College of Maritime Education', 'Maritime Laboratory Scale'),
  ('SEA103', 'Seamanship',                     3, 'College of Maritime Education', 'Maritime Lecture Scale'),
  ('SST103', 'Basic Safety Training',          3, 'College of Maritime Education', 'Maritime Laboratory Scale')
) AS v(code, name, units, college, cog)
JOIN public.departments d ON d.name = v.college
JOIN public.grade_computations gc ON gc.name = v.cog
WHERE NOT EXISTS (SELECT 1 FROM public.subjects s WHERE s.code = v.code);

-- First term, active, 30-day SG grace period.
INSERT INTO public.academic_terms (school_year, semester, is_active, sg_grace_days)
VALUES ('2026-2027', '1st'::semester_period, TRUE, 30);

-- 1st-semester sections (term_id is filled automatically).
INSERT INTO public.sections (name, school_year, semester, department_id)
SELECT v.name, '2026-2027', '1st'::semester_period, d.department_id
FROM (VALUES
  ('BSIT-1A',   'Technology and Engineering College for Humanity'),
  ('BSIT-1B',   'Technology and Engineering College for Humanity'),
  ('BSMARE-1A', 'College of Maritime Education'),
  ('BSMARE-1B', 'College of Maritime Education')
) AS v(name, college)
JOIN public.departments d ON d.name = v.college;

COMMIT;
```

**Check (read-only):**

```sql
SELECT code, name, units FROM subjects
WHERE code IN ('ITC113','ITP113','ITP123','DSA123','NAV113','MSH111','AUX123','MSH122','SEA103','SST103')
ORDER BY code;                                   -- expect 10 rows
SELECT school_year, semester, is_active, sg_grace_days FROM academic_terms;   -- 1 row, active
SELECT name, school_year, semester, term_id IS NOT NULL AS has_term FROM sections ORDER BY name;  -- 4 rows, has_term = true
```

## Stage 0b: keep only the 10 seed subjects, then refuse duplicates (SQL, once)

The old subject list had the same subject twice in one college under different codes (e.g. "Data Structures and Algorithms" as DSA123 and DSA213). This stage removes every subject the test year does not use, then turns on the duplicate guard.

**1. Preview (read-only):**

```sql
SELECT COUNT(*) FILTER (WHERE code IN ('ITC113','ITP113','ITP123','DSA123','NAV113','MSH111','AUX123','MSH122','SEA103','SST103')) AS keep,
       COUNT(*) FILTER (WHERE code NOT IN ('ITC113','ITP113','ITP123','DSA123','NAV113','MSH111','AUX123','MSH122','SEA103','SST103')) AS delete,
       (SELECT COUNT(*) FROM class_records) AS classes,
       (SELECT COUNT(*) FROM enrollments) AS enrollments
FROM subjects;
```

Expected: keep 10, delete 55, classes 0, enrollments 0. Stop if classes or enrollments are not 0.

**2. Delete the other subjects:**

```sql
BEGIN;
DELETE FROM public.subjects
WHERE code NOT IN ('ITC113','ITP113','ITP123','DSA123','NAV113','MSH111','AUX123','MSH122','SEA103','SST103');
COMMIT;
```

All or nothing: if anything still used one of these subjects, the database refuses and nothing is deleted. The deletions are recorded in the activity logs. The Health Sciences COG templates stay, unused.

**3. Run migration** `supabase/migrations/20261011150000_unique_subjects.sql`: open the file, paste all of it into the SQL editor, and run it once. It refuses a duplicate subject code (any case or spacing) and the same subject name twice within a college. The same name in another college is still allowed. If duplicates remain, it stops and lists them without changing anything. It adds two rules and changes no data, so a "destructive operation" warning from the editor is safe to accept.

**Check (read-only):**

```sql
SELECT code, name FROM subjects ORDER BY code;    -- 10 rows
SELECT indexname FROM pg_indexes
WHERE tablename = 'subjects' AND indexname LIKE 'uq_subjects_%';   -- 2 rows
```

If the second query returns **no rows**, the migration has not been run yet: run step 3.

## Stage 1: 40 students (app: Manage Users → Import)

Paste the CSV below into the import (or save it as a `.csv` file). ID numbers are left blank so the system generates them. New accounts get the import's default password `SagePassword123!`. Every row must show **ready**. A row with an error means a section or college name does not match; fix it before importing.

```csv
LastName,FirstName,MiddleName,Email,Role,College,Program,Section,YearLevel,IDNumber
Abad,Joshua,Reyes,j.abad@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1A,1st Year,
Bautista,Kyla,Santos,k.bautista@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1A,1st Year,
Cabrera,Miguel,Lopez,m.cabrera@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1A,1st Year,
Dizon,Andrea,Cruz,a.dizon@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1A,1st Year,
Enriquez,Paolo,Garcia,p.enriquez@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1A,1st Year,
Flores,Bianca,Mendoza,b.flores@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1A,1st Year,
Gatchalian,Renz,Torres,r.gatchalian@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1A,1st Year,
Hernandez,Camille,Ramos,c.hernandez@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1A,1st Year,
Ignacio,Lance,Navarro,l.ignacio@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1A,1st Year,
Javier,Trisha,Castro,t.javier@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1A,1st Year,
Lacson,Gabriel,Ocampo,g.lacson@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1B,1st Year,
Manalo,Denise,Villanueva,d.manalo@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1B,1st Year,
Natividad,Carlo,Aquino,c.natividad@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1B,1st Year,
Olivares,Hannah,Dela Cruz,h.olivares@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1B,1st Year,
Pascual,Ivan,Bernardo,i.pascual@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1B,1st Year,
Quiambao,Mae,Soriano,m.quiambao@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1B,1st Year,
Robles,Nathan,Fernandez,n.robles@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1B,1st Year,
Salazar,Erika,Tolentino,e.salazar@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1B,1st Year,
Tan,Jerome,Valdez,j.tan@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1B,1st Year,
Uy,Sofia,Marquez,s.uy@dyci.edu.ph,student,Technology and Engineering College for Humanity,Bachelor of Science in Information Technology,BSIT-1B,1st Year,
Valencia,Mark,Domingo,m.valencia@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1A,1st Year,
Yap,Kevin,Salvador,k.yap@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1A,1st Year,
Zamora,Rafael,Cortez,r.zamora@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1A,1st Year,
Agustin,Bryan,Padilla,b.agustin@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1A,1st Year,
Bernal,Christian,Lim,c.bernal@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1A,1st Year,
Concepcion,Dennis,Rosales,d.concepcion@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1A,1st Year,
De Guzman,Elijah,Manalang,e.deguzman@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1A,1st Year,
Estrada,Francis,Pineda,f.estrada@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1A,1st Year,
Fajardo,Gerald,Medina,g.fajardo@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1A,1st Year,
Galang,Harold,Santiago,h.galang@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1A,1st Year,
Ilagan,Jasper,Reyes,j.ilagan@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1B,1st Year,
Jimenez,Karl,Morales,k.jimenez@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1B,1st Year,
Laurel,Leo,Gonzales,l.laurel@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1B,1st Year,
Macaraeg,Noel,Pangilinan,n.macaraeg@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1B,1st Year,
Nepomuceno,Oscar,Aguilar,o.nepomuceno@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1B,1st Year,
Ortega,Patrick,Samonte,p.ortega@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1B,1st Year,
Pangan,Ramon,Villegas,r.pangan@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1B,1st Year,
Quizon,Samuel,Bautista,s.quizon@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1B,1st Year,
Rivera,Tristan,Lacsamana,t.rivera@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1B,1st Year,
Sison,Vincent,Abella,v.sison@dyci.edu.ph,student,College of Maritime Education,Bachelor of Science in Marine Engineering,BSMARE-1B,1st Year,
```

**Check (read-only):**

```sql
SELECT s.name AS section, COUNT(u.*) AS students
FROM sections s LEFT JOIN users u ON u.section_id = s.section_id AND u.role::TEXT = 'student'
GROUP BY s.name ORDER BY s.name;                 -- expect 10 per section
```

## Stage 1b: 1st-semester classes (app: Admin → Classrooms → Create)

Log in as the admin and create these 8 classes, one at a time. In the form, choose the college first, then the subject, section, and instructor; only active-term sections and that college's subjects and faculty are offered. Creating a class enrolls its section's 10 students automatically, and the instructor gets one roster notice per class.

| # | Subject                            | Section   | Instructor     |
| - | ---------------------------------- | --------- | -------------- |
| 1 | ITC113 Introduction to Computing   | BSIT-1A   | Amanda Rivera  |
| 2 | ITC113 Introduction to Computing   | BSIT-1B   | Amanda Rivera  |
| 3 | ITP113 Introduction to Programming | BSIT-1A   | Marcus Cruz    |
| 4 | ITP113 Introduction to Programming | BSIT-1B   | Marcus Cruz    |
| 5 | NAV113 Navigation 1                | BSMARE-1A | Ricardo Aquino |
| 6 | NAV113 Navigation 1                | BSMARE-1B | Ricardo Aquino |
| 7 | MSH111 Marine Shop Practice 1      | BSMARE-1A | Maria Garcia   |
| 8 | MSH111 Marine Shop Practice 1      | BSMARE-1B | Maria Garcia   |

**Check (read-only):**

```sql
SELECT sub.code, sec.name AS section, f.last_name AS instructor,
       (SELECT COUNT(*) FROM enrollments e WHERE e.section_id = c.section_id AND e.subject_id = c.subject_id) AS enrolled,
       c.term_id IS NOT NULL AS has_term
FROM class_records c
JOIN subjects sub ON sub.subject_id = c.subject_id
JOIN sections sec ON sec.section_id = c.section_id
JOIN users f ON f.user_id = c.faculty_id
ORDER BY sec.name, sub.code;                     -- expect 8 rows, enrolled = 10, has_term = true
```

If it returns **no rows**, the classes have not been created yet.

## Stage 1c: run the 1st semester (app, as each instructor)

Finish the semester **before** the rollover; the rollover tests depend on these grades. In each of the 8 classes, logged in as its instructor (Rivera, Cruz, Aquino, Garcia):

1. **Scores:** add activities and enter scores in Input Scores, so the General Education Core and both Maritime COGs each get real computations.
2. **Attendance:** take a few sessions; give one or two students absences to test the attendance warnings.
3. **Post MR → TFR → SG.** Mix the results: mostly passing, a few failing, maybe one INC. This gives the Dean, the risk list, and the AI Study Tutor something to show.
4. **Leave one class without its SG:** **ITP113, BSIT-1B** (Cruz). This is the 30-day grace test.
5. **Check before the rollover:** a student sees their grades in My Grades; the Dean's Grade Posting Status for 2026-2027 1st shows *Posted · On time* for the posted classes and *Pending* for ITP113 BSIT-1B.

## Stage 2: 2nd semester (after Stage 1c is finished)

Steps 1 and 2 may be done early (an inactive next term with its sections does not affect the current semester). Do **not** type CONFIRM in step 3 until Stage 1c is complete: the rollover cannot be undone.

1. **Term Settings → Start Next Semester:** the pre-check should list **only ITP113 BSIT-1B** as without a posted SG. Click **Create AY 2026-2027 (2nd)**.
2. Run this SQL to add the 2nd-semester sections (same names, so students move automatically):

```sql
INSERT INTO public.sections (name, school_year, semester, department_id)
SELECT v.name, '2026-2027', '2nd'::semester_period, d.department_id
FROM (VALUES
  ('BSIT-1A',   'Technology and Engineering College for Humanity'),
  ('BSIT-1B',   'Technology and Engineering College for Humanity'),
  ('BSMARE-1A', 'College of Maritime Education'),
  ('BSMARE-1B', 'College of Maritime Education')
) AS v(name, college)
JOIN public.departments d ON d.name = v.college;
```

3. **Term Settings → Start Next Semester:** the next term shows 4 sections. Grace **30** days, type CONFIRM. Expected summary: **40 students moved**, 0 kept, 7 classes archived, 1 open until its SG is posted.
4. **Admin → Classrooms:** create the 8 2nd-semester classes.

## Stage 3: Summer (before the 2nd → Summer rollover)

1. **Term Settings → Start Next Semester →** choose **Summer** → **Create AY 2026-2027 (Summer)**.
2. Run this SQL. It adds BSMarE Summer sections only:

```sql
INSERT INTO public.sections (name, school_year, semester, department_id)
SELECT v.name, '2026-2027', 'Summer'::semester_period, d.department_id
FROM (VALUES
  ('BSMARE-1A', 'College of Maritime Education'),
  ('BSMARE-1B', 'College of Maritime Education')
) AS v(name, college)
JOIN public.departments d ON d.name = v.college;
```

3. **Term Settings → Start Next Semester:** grace **0** days, type CONFIRM. Expected summary: **20 students moved** (BSMarE), **20 kept** (BSIT keep their 2nd-semester section and stay 1st Year), 7 classes archived, 1 open (shown as Overdue).
4. **Admin → Classrooms:** create the 4 Summer classes (SEA103 and SST103 for both BSMarE sections). Summer classes grade **Midterm and Final only**.

## After the year

- Students: My Subjects and My Grades show each term (1st, 2nd, Summer) with its posted grades.
- Faculty: Past Archives shows the 1st- and 2nd-semester classes.
- Dean: Grade Posting Status for each term shows On time, Late, and Late (overdue).

The data now ends in Summer 2026-2027. For a clean 1st-semester start (e.g., for the defense), plan another reset.
