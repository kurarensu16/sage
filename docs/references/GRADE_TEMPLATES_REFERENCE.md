# SAGE — Official Grade Computation Templates Reference

This reference document catalogs the official institutional grading computation formulas and department-specific grading templates for **SAGE (Smart Academic Grading and Evaluation System)** at **Dr. Yanga's Colleges, Inc. (DYCI)**.

---

## 1. Institutional Grading Formulas & Math

### The Grading Progression Chain
* **Term Rating (out of 100 points):**
  $$\text{Term Rating} = \text{ROUND}(\text{Class Standing}_{50} + \text{Character}_{10} + \text{Exam}_{40}, 0)$$
* **Midterm Rating (MR):**
  $$\text{MR} = \text{ROUND}\left(\frac{\text{Prelim Grade} + \text{Midterm Grade}}{2}, 0\right)$$
* **Tentative Final Rating (TFR):**
  $$\text{TFR} = \text{ROUND}\left(\frac{\text{Semi-Final Grade} + \text{Final Grade}}{2}, 0\right)$$
* **Final Semestral Grade (SG):**
  $$\text{SG} = \text{ROUND}\left(\frac{\text{MR} + \text{TFR}}{2}, 0\right)$$

---

## 2. Institutional Transmutation Table (GWA Scale)

| Numerical Grade | Point Equivalent | Remarks |
| :---: | :---: | :---: |
| **98 – 100** | `1.00` | Passed |
| **95 – 97** | `1.25` | Passed |
| **92 – 94** | `1.50` | Passed |
| **89 – 91** | `1.75` | Passed |
| **86 – 88** | `2.00` | Passed |
| **83 – 85** | `2.25` | Passed |
| **80 – 82** | `2.50` | Passed |
| **77 – 79** | `2.75` | Passed |
| **75 – 76** | `3.00` | Passed |
| **Below 75** | `5.00` | Failed |
| *Special Remarks* | `INC` / `FDA` / `DRP` | Incomplete / Failure Due to Absences / Dropped |

---

## 3. Official Department Grading Templates

### 🌟 Template 1: General Education Core (Standard Institutional)
> **Recommended default template** for all standard lecture courses and general education subjects.

* **Template Name:** `General Education Core`
* **Description:** `Standard institutional lecture scale: 50% Class Standing, 40% Major Examination, 10% Character Rating.`

| # | Component Name | Weight % | Max Score | Multiple Entries? | Description |
| :-: | :--- | :---: | :---: | :---: | :--- |
| 1 | **Class Standing (Formative)** | `50` | `20` *(or `100`)* | `Yes` (Checked) | Quizzes, assignments, recitations, seatworks |
| 2 | **Major Examination** | `40` | `40` *(or `100`)* | `No` (Unchecked) | Term Major Periodic Examination |
| 3 | **Character Rating** | `10` | `100` | `No` (Unchecked) | Attendance, punctuality, and deportment |
| | **Total Sum:** | **`100%`** | | | |

---

### 🩺 Template 2: Health Sciences (Theory / Lecture)
> Designed for Nursing and Allied Health theoretical lecture courses.

* **Template Name:** `Health Sciences (Theory)`
* **Description:** `Theoretical lecture scale: 30% Class Standing, 60% Major Exams, 10% Character Rating.`

| # | Component Name | Weight % | Max Score | Multiple Entries? | Description |
| :-: | :--- | :---: | :---: | :---: | :--- |
| 1 | **Class Standing (Formative)** | `30` | `20` | `Yes` (Checked) | Formative quizzes, activities, and assignments |
| 2 | **Major Examination** | `60` | `100` | `No` (Unchecked) | Comprehensive Departmental Major Exam |
| 3 | **Character Rating** | `10` | `100` | `No` (Unchecked) | Professional decorum and attendance |
| | **Total Sum:** | **`100%`** | | | |

---

### 🏥 Template 3: Health Sciences (RLE / Clinical Practicum)
> Designed for Related Learning Experience (RLE), skills lab, and hospital clinical rotation duties.

* **Template Name:** `Health Sciences (RLE / Clinical Practicum)`
* **Description:** `Clinical practicum: 50% Checklist Rating, 20% NCP & Case Study, 20% Rubrics, 10% Quizzes.`

| # | Component Name | Weight % | Max Score | Multiple Entries? | Description |
| :-: | :--- | :---: | :---: | :---: | :--- |
| 1 | **Checklist Rating** | `50` | `100` | `Yes` (Checked) | Return demonstration and procedure checklists |
| 2 | **Nursing Care Plan & Case Study** | `20` | `100` | `Yes` (Checked) | NCP write-ups, drug studies, and patient case presentations |
| 3 | **Rubric Assessment** | `20` | `100` | `No` (Unchecked) | Clinical instructor holistic rubric evaluation |
| 4 | **Quizzes & Written Outputs** | `10` | `50` | `Yes` (Checked) | Pre/post duty quizzes and written reports |
| | **Total Sum:** | **`100%`** | | | |

---

### ⚓ Template 4: Maritime Studies (Lecture)
> Designed for theoretical maritime courses (BSMT / BSMarE).

* **Template Name:** `Maritime Studies (Lecture)`
* **Description:** `Maritime theoretical lecture scale: 60% Class Standing and 40% Major Examination.`

| # | Component Name | Weight % | Max Score | Multiple Entries? | Description |
| :-: | :--- | :---: | :---: | :---: | :--- |
| 1 | **Class Standing** | `60` | `100` | `Yes` (Checked) | Quizzes, practical exercises, and problem sets |
| 2 | **Major Examination** | `40` | `100` | `No` (Unchecked) | STCW-aligned periodic examination |
| | **Total Sum:** | **`100%`** | | | |

---

### 🚢 Template 5: Maritime Studies (Laboratory / Simulator)
> Designed for bridge simulator, engine simulator, and workshop competency assessments.

* **Template Name:** `Maritime Studies (Laboratory / Simulator)`
* **Description:** `Maritime simulator/practical scale: 40% Systematic Exercises, 60% Demonstration of Competence.`

| # | Component Name | Weight % | Max Score | Multiple Entries? | Description |
| :-: | :--- | :---: | :---: | :---: | :--- |
| 1 | **Systematic Exercises** | `40` | `100` | `Yes` (Checked) | Laboratory worksheets and simulator exercise tasks |
| 2 | **Demonstration of Competence** | `60` | `100` | `No` (Unchecked) | Final practical simulator evaluation and assessment |
| | **Total Sum:** | **`100%`** | | | |

---

## 4. Database Schema Mapping

When saving via the admin interface (`/admin/gradecomputationslist`), records are written to:

1. `grade_computations` table:
   * `computation_id` (UUID, primary key)
   * `name` (VARCHAR)
   * `description` (TEXT)

2. `grade_computation_components` table:
   * `component_id` (UUID, primary key)
   * `computation_id` (UUID, foreign key referencing `grade_computations`)
   * `name` (VARCHAR)
   * `weight` (DECIMAL, e.g. `50.00`)
   * `max_score` (DECIMAL, e.g. `20.00` or `100.00`)
   * `is_multiple` (BOOLEAN, `true` for formative collections like quizzes, `false` for single milestone exams)
