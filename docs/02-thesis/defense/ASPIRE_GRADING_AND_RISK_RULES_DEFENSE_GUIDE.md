# ASPIRE v4.0 Institutional Defense Review Guide: Grading & Risk Engine

**System**: ASPIRE Student Academic Growth & Evaluation Platform  
**Target Repository**: `c:\Users\JC Gabriel\Downloads\New ASPIRE\sage`  
**Purpose**: Official Capstone / Thesis Defense Reference & Panelist Q&A Cheatsheet  
**Engine Version**: V4 Risk Matrix (September 2026)

---

## 1. DYCI Institutional Grading Engine Specification

### 1.1 Component Breakdown & Percentage Allocation
Each academic term period (Prelim, Midterm, Semi-Final, Final) calculates student term ratings using the institutional 50-10-40 formula:

$$\text{Term Rating} = \text{Class Standing}_{50\%} + \text{Character Rating}_{10\%} + \text{Term Exam}_{40\%}$$

* **Class Standing (50%)**:
  $$\text{CS \%} = \left(\frac{\sum \text{Obtained Scores in Configured Activities}}{\sum \text{Max Scores of Configured Activities}}\right) \times 50\%$$
* **Character / Values Rating (10%)**:
  $$\text{Char \%} = \left(\frac{\text{Character Rating}}{100}\right) \times 10\%$$
* **Term Exam (40%)**:
  $$\text{Exam \%} = \left(\frac{\text{Exam Score}}{\text{Exam Max Points}}\right) \times 40\%$$

---

### 1.2 Milestone Progression & Available-Term Non-Null Averaging
Unencoded future term periods evaluate to `null` and are **excluded** from term averages. Future terms **NEVER** default to 0%.

$$\text{Midterm Rating (MR)} = \begin{cases} 
\frac{\text{Prelim} + \text{Midterm}}{2} & \text{if both exist} \\
\text{Prelim} & \text{if Midterm unencoded} \\
\text{Midterm} & \text{if Prelim unencoded}
\end{cases}$$

$$\text{Tentative Final Rating (TFR)} = \begin{cases} 
\frac{\text{SemiFinal} + \text{Final}}{2} & \text{if both exist} \\
\text{SemiFinal} & \text{if Final unencoded} \\
\text{Final} & \text{if SemiFinal unencoded}
\end{cases}$$

$$\text{Official Semestral Grade (SG)} = \frac{\text{MR} + \text{TFR}}{2}$$

---

### 1.3 DYCI Institutional Transmutation Scale ($1.00$ to $5.00$)

| Percentage Grade Range | Transmuted GWA | Institutional Rating |
| :--- | :--- | :--- |
| **98.00% – 100.00%** | **1.00** | Excellent / Highest Honors |
| **95.00% – 97.99%** | **1.25** | Excellent |
| **92.00% – 94.99%** | **1.50** | Very Good |
| **89.00% – 91.99%** | **1.75** | Good (Honor Limit) |
| **86.00% – 88.99%** | **2.00** | Satisfactory (Scholarship Floor Limit) |
| **83.00% – 85.99%** | **2.25** | Fair |
| **80.00% – 82.99%** | **2.50** | Fair |
| **77.00% – 79.99%** | **2.75** | Passing |
| **75.00% – 76.99%** | **3.00** | Passing (Cut-off) |
| **Below 75.00%** | **5.00** | Failed |

---

## 2. Official Student Handbook Regulations

### 2.1 Section 3.8: The President's List (PL)
* **3.8.1**: Bestowed upon DYClans with exceptionally high General Weighted Average (GWA).
* **3.8.2**: Minimum GWA requirement of **1.75**.
  * **3.8.2.1 Sapientia**: $1.00$ to $1.25$ GWA (Highest Honor)
  * **3.8.2.2 Excellentia**: $1.26$ to $1.50$ GWA (High Honor)
  * **3.8.2.3 Virtus**: $1.51$ to $1.75$ GWA (Honor)
* **3.8.3**: Regular academic course load (CHED curriculum) or $\ge 18$ units for irregular students (Sec 3.8.6).
* **3.8.4 Grade Floor**: No grades lower than **2.00** in any subject.
* **3.8.5 Incomplete Rule**: No `INC` / Incomplete grades allowed.

### 2.2 Section 5.2.5.1: Academic Scholarships (Tuition Fee Grants)
* **5.2.5.1.1**: Minimum 1-year residency in DYCI College (2 consecutive semesters).
* **5.2.5.1.2**: Minimum 18 units for irregular students.
* **5.2.5.1.3 Full Scholarship (100% Tuition)**: GWA $\le 1.50$ across 2 semesters, no subject grade $> 2.00$.
* **5.2.5.1.4 Partial Scholarship (50% Tuition)**: GWA $\le 1.75$ across 2 semesters, no subject grade $> 2.00$.
* **5.2.5.1.5 Consecutive Streak**: Student must be on the President's List for **2 consecutive terms** before availing of the scholarship grant.

### 2.3 Absence & FDA Regulation
* Absences do **NOT** deduct numerical points from student grades.
* **1 – 3 Absences**: Triggers visual Risk Flagging & Warnings.
* **4+ Absences**: Triggers **FDA Warning Badge (Faculty Choice)**. Faculty retains full discretion to assign `FDA` remark or accommodate validated excuses. ASPIRE acts as a recommendation trigger, not an automatic override.

---

## 3. V4 Risk Evaluation Matrix (DYCI Transmutation Scale-Anchored)

### 3.1 Architecture: Single Source of Truth
All risk computation logic resides in **one file**: `src/lib/riskEngine.js`.
All portals (Dean, Faculty, Admin, Student) import from this single engine.
There is no duplicated risk logic anywhere in the codebase.

### 3.2 Composite Risk Score Formula

$$\text{Risk Score} = \min\left(100,\; \underbrace{\text{GWA Points}}_{\text{max 60}} + \underbrace{\text{Attendance Points}}_{\text{max 50}} + \underbrace{\text{Missing Work Points}}_{\text{max 15}} + \underbrace{\text{Trajectory Points}}_{\text{max 10}}\right)$$

> **Design Note**: Individual components sum to a **maximum of 135 points**, but the final score is **capped at 100**. This intentional over-provisioning creates **multiple independent escalation paths** to Critical Risk. A student can reach Critical purely through failing grades, or purely through excessive absences, or through a combination of moderate factors.

### 3.3 Factor 1: GWA Deficit (0 to 60 Points)

Directly anchored to the DYCI Institutional Transmutation Scale (Section 1.3).

| GWA Range | Points | Risk Zone | Rationale |
| :--- | :--- | :--- | :--- |
| **1.00 – 2.00** | **0** | LOW (Safe) | On track. Eligible for Dean's List / President's List. |
| **2.01 – 3.00** | **1 – 25** (linear scale) | MODERATE (Watch) | Passing, but falling below DL/PL eligibility. Faculty mentoring advised. |
| **3.01 – 5.00** | **26 – 60** (linear scale) | HIGH (Failing) | Below 75% cut-off. Automatic HIGH RISK flag. Faculty intervention required. |

> **Panel Defense**: *"The ASPIRE Risk Engine uses the official DYCI Transmutation Scale as its primary anchor. If a student's GWA drops to 5.00 (Failed), the engine assigns 60 risk points — guaranteeing an immediate HIGH RISK flag even with perfect attendance. Meanwhile, a student with GWA 2.25 is still passing, but the engine flags them as Moderate because they've dropped below the 1.75 DL Honor Limit, giving the faculty advisor time to intervene before it's too late."*

### 3.4 Factor 2: Attendance / FDA Trigger (0 to 50 Points)

| Absences | Points | Alert Level | System Behavior |
| :--- | :--- | :--- | :--- |
| **0 – 1** | **0** | None | Normal attendance |
| **2** | **10** | Early Warning | Yellow flag appears |
| **3** | **25** | Approaching FDA | Strong warning — one more triggers FDA recommendation |
| **4+** | **50** | FDA Recommendation | System forces the student onto the faculty's Critical attention list. Faculty manually decides whether to mark FDA or accept excuse. |

> **Panel Defense**: *"Because FDA requires human judgment, ASPIRE acts as the trigger, not the judge. The moment a student hits 4 absences, the AI injects 50 risk points. A borderline passing student (25 pts from GWA) plus 4 absences (50 pts) = 75 points (Critical Risk), immediately surfacing them on the Dean's radar for mandatory faculty evaluation."*

### 3.5 Factor 3: Missing Work / Ghost Student Detection (0 to 15 Points)

| Missing Submissions | Points | Alert |
| :--- | :--- | :--- |
| **0 – 1** | **0** | None |
| **2** | **10** | Warning |
| **3+** | **15** | Ghost Student Alert |

> Only counts zeros on activities that are **actually configured** (max > 0). Unconfigured activity columns are excluded from this calculation.

### 3.6 Factor 4: Grade Velocity Decline (0 to 10 Points)

| Grade Drop Between Terms | Points | Alert |
| :--- | :--- | :--- |
| **0% or Improved** | **0** | Stable / Improving |
| **> 5% decline** | **3** | Mild decline |
| **> 10% decline** | **7** | Moderate decline |
| **> 15% decline** | **10** | Severe decline |

### 3.7 Classification Tiers

| Composite Score | Tier | Badge Color | Action Required |
| :--- | :--- | :--- | :--- |
| **0 – 24** | LOW | 🟢 Green | On track. No intervention needed. |
| **25 – 49** | MODERATE | 🟡 Amber | Watch zone. Peer tutoring or faculty mentoring recommended. |
| **50 – 74** | HIGH | 🔴 Red | At-risk. Academic counselor intervention advised. |
| **75 – 100** | CRITICAL | 🔴 Red (Pulsing) | Immediate Dean/Guidance intervention required. |

---

## 4. Defense Panelist Q&A Cheatsheet

### Q1: "Why doesn't an unencoded future term default to 0% in your system?"
> **Answer**: In real-world academic workflows, unencoded future terms (such as Midterm or Finals during Week 4) represent **unadministered assessments**, not student failures. Defaulting unencoded terms to 0% creates false failing alerts (e.g., a student with 97% in Prelim being flagged as 5.00 Failed). ASPIRE uses **Available-Term Non-Null Averaging**, giving faculty and students accurate running GWAs throughout the semester.

### Q2: "Does your system automatically fail students when they hit 4 absences?"
> **Answer**: No. While 4 absences triggers an **FDA Warning Badge**, ASPIRE respects **Faculty Academic Discretion**. The system alerts the faculty and injects 50 risk points to force the student onto the Critical Risk radar, but permits the faculty to evaluate valid medical certificates or institutional representation leaves before assigning official remarks. FDA is a recommendation, not an override.

### Q3: "How does ASPIRE help students maintain their scholarships?"
> **Answer**: ASPIRE tracks DYCI Handbook Section 5.2.5.1 regulations in real-time. It monitors the 2-term President's List streak and alerts students whenever a subject grade threatens the **2.00 grade floor limit**, calculating the exact exam score needed to retain 100% or 50% tuition grants.

### Q4: "Why does a student with GWA 2.25 (passing) still get flagged as Moderate Risk?"
> **Answer**: ASPIRE doesn't just catch failing students — it also monitors academic trajectory for Dean's List and President's List candidates. A student with GWA 2.25 is still passing, but they've dropped below the 1.75 Honor Limit. Flagging them as Moderate Risk gives the faculty advisor time to provide mentoring before the student falls further. The system serves a dual purpose: preventing failures AND protecting academic honors.

### Q5: "Can a student's risk score exceed 100?"
> **Answer**: The individual risk factors can sum to 135 points (60 + 50 + 15 + 10), but the displayed composite score is **capped at 100**. This over-provisioning is intentional — it creates multiple independent escalation paths. A student can reach Critical Risk purely through failing grades (60 pts), purely through excessive absences (50 pts), or through a dangerous combination. Once a student hits 100, they are at maximum alert; the system doesn't need to display higher numbers.
