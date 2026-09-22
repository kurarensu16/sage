# Introduction

The efficiency of academic administration directly dictates the quality of support provided to both students and educators. When faculty members are overwhelmed by manual administrative tasks, the time available for actual teaching and student mentorship is severely compromised. This project was developed to eliminate these bottlenecks by automating grading processes and deploying proactive intervention tools, ultimately fostering a more transparent and proactive academic environment. Guided by the core institutional values of excellence and compassion, this initiative directly aligns with the United Nations Sustainable Development Goal (SDG) 4: Quality Education, which seeks to ensure inclusive and equitable quality education and promote lifelong learning opportunities for all.

Globally, the trend in educational technology is rapidly shifting from static Learning Management Systems toward predictive learning analytics, early warning systems (EWS), and proactive academic intervention frameworks. Real-time learning analytics and AI-driven platforms can significantly enhance academic performance by processing multidimensional datasets (Tlili et al., 2025). Furthermore, modern performance tracking has shifted from merely recording grades to deploying proactive, data-driven retention frameworks. Research demonstrates that early detection combined with structured catch-up plans significantly improves student retention (Engineerica, 2024; Yousefi & Lim, 2025). Locally, early digitization efforts in the Philippines improved data management, but decentralized systems remained vulnerable (Pangcatan & Prado, 2019). However, recent studies demonstrate that centralized automated platforms significantly improve grading speed, accuracy, and transparency (Bacongol & Durango, 2025).

This limitation is highly evident at Dr. Yanga's Colleges, Inc. (DYCI), where performance tracking remains largely traditional, fragmented, and reactive. Faculty members primarily rely on periodic, manual grade evaluations, spreadsheet-based tracking, and consultationbased identification of struggling students. A faculty pre-survey conducted for this study validates these inefficiencies: early identification of students needing support was rated only moderately effective (M = 3.25), while the administrative workload was perceived as high (M = 3.75) due to repetitive data consolidation and verification tasks. Furthermore, qualitative responses indicated that even minimal delays in data availability—often caused by part-time faculty schedules and late submissions—significantly hinder the timeliness of interventions. Reflecting this urgency, respondents strongly agreed on the need for a centralized performance tracking system (M = 4.00), an automated warning mechanism (M = 4.13), and strict accountability and transparency in data handling (M = 4.63).

Despite the clear need for timely, data-informed interventions, existing performance tracking systems present critical gaps. Current solutions primarily rely on faculty-recorded grades and attendance, which function strictly as lagging indicators. Furthermore, they lack the integration of multiple data sources—specifically, the combination of official faculty gradebook telemetry alongside student consultation inquiries and intervention task tracking. Methodologically, structured rule-based approaches for evaluating academic risk are scarce,

and Human-in-the-Loop (HITL) mechanisms are rarely implemented, leaving systems either fully manual or entirely automated without necessary faculty oversight and validation.

Traditional academic monitoring often relies on delayed indicators, rendering interventions ineffective because alerts trigger only after the student has already disengaged or failed (Engineerica, 2024). Furthermore, existing grading portals lack performance trajectory analysis, failing to catch high-performing students who experience sudden grade dips (e.g., from 88% to 80%) before they hit failing thresholds.

To address these institutional bottlenecks and technological limitations, this study aims to develop ASPIRE, an intelligent, proactive, and integrated performance tracking system grounded in the principles of academic analytics and educational data mining (EDM). This study specifically aims to address the limitations of existing performance tracking systems by developing an intelligent solution that supports the timely identification of students needing academic assistance and enables structured, data-driven intervention strategies for improved academic outcomes. The development of this system directly reflects the institutional core values of DYCI, particularly academic excellence, accountability, and student-centered learning. By establishing transparent performance tracking and clear intervention processes, the system promotes accountability among stakeholders while placing student success at the center of the educational experience.

Furthermore, this research aligns with and contributes to broader global initiatives, specifically the United Nations Sustainable Development Goals. By strengthening academic retention through the early identification of struggling students and the deployment of timely, structured intervention support, ASPIRE directly supports SDG 4 (Quality Education) in fostering inclusive and equitable quality education. Concurrently, the system drives progress toward SDG 9 (Industry, Innovation, and Infrastructure) by fostering innovation in educational infrastructure, effectively transitioning traditional, manual performance tracking into a structured, rule-based, and AI-assisted academic tracking system that reinforces datadriven institutional decision-making.

While current literature heavily supports automated grade calculation and static at-risk alert badges, a distinct research gap exists regarding closed-loop intervention platforms that integrate explainable multi-factor risk assessment, human-in-the-loop (HITL) faculty action planning, and baseline versus follow-up outcome evaluation to empirically prove whether atrisk students actually improved after receiving academic support.

By deploying this modernized framework, the study offers substantial practical value to the institution. Specifically, it reduces institutional reliance on manual and fragmented tracking processes, improves early risk identification through structured evaluation, and enhances student engagement via proactive performance self-monitoring. Additionally, it empowers faculty members with data-driven academic insights and strengthens DYCI's overarching institutional retention strategies through timely, automated intervention mechanisms.

The importance of this study lies in its dual capability to empower both students and academic leaders. First, it empowers students by delivering grounded, topic-specific AI study diagnostics—enabled by mandatory activity title and scope metadata—and providing realtime GWA/PL target forecasts so students can course-correct early. Second, it empowers Faculty and Deans by auto-sorting class rosters by risk severity, with High Risk students pinned to the top. This allows professors to selectively evaluate the top 2–3 struggling students without administrative burnout, while Deans monitor college-wide risk rosters and collaboration queues (refer_to_dean).

Finally, this research contributes to the broader field of educational data mining and performance tracking by introducing a novel hybrid design architecture. Unlike fully automated systems or strictly manual workflows, ASPIRE introduces a Human-in-the-Loop (HITL) validation framework that couples student task and consultation tracking with faculty-verified grade records, ensuring absolute academic accuracy while maintaining crucial human oversight. By bridging the coordination gap among students, faculty, and academic support personnel, this study provides a scalable, structured model for real-time monitoring and timely academic assistance within Philippine higher education. Therefore, the purpose of this study is to develop ASPIRE, a comprehensive, AI-driven academic grading and intervention portal, ensuring proactive, data-driven student support.

Review of Related Literature and Studies

# Related Literature

This section explores the conceptual and theoretical frameworks that underpin the development of an integrated academic management system for higher education. It reviews established literature on explainable multi-factor risk scoring, human-in-the-loop AI governance, pedagogical prompt grounding, and closed-loop intervention lifecycles. Collectively, these concepts provide the structural and theoretical foundation for designing a comprehensive, reliable, and evidence-based academic system.

# Theoretical Frameworks

Davis (1989) introduced the Technology Acceptance Model (TAM) as a theoretical framework for explaining how users decide to adopt and use information technology systems. TAM posits that two primary constructs govern user acceptance: Perceived Usefulness (PU) — the degree to which a user believes a system will improve their job performance — and Perceived Ease of Use (PEOU) — the degree to which using the system is expected to require minimal effort. Davis demonstrated that both constructs are strong predictors of actual system use, with PU having a direct effect on behavioral intention and PEOU having both direct and indirect effects through its influence on PU (Davis, 1989).

In the context of ASPIRE, TAM provides the foundational theoretical justification for the system's dual-user design. Faculty members are expected to perceive high Usefulness because ASPIRE's automated risk scoring and triage roster eliminate manual data consolidation tasks, directly reducing their administrative workload. Students are expected to perceive high Ease of Use because the self-monitoring dashboard and AI Academic Advisor present information in an intuitive, non-technical format. TAM is operationalized in this study through a structured forced-choice questionnaire evaluating Perceived Usefulness, Perceived Ease of Use, and Behavioral Intention among student and faculty respondents at DYCI (Davis, 1989).

DeLone and McLean (2003) updated their original IS Success Model to propose six interdependent dimensions for measuring the overall success of an information system: Information Quality, System Quality, Service Quality, Intention to Use and Use, User Satisfaction, and Net Benefits. Their updated model argues that a system can only be declared genuinely successful when it achieves high performance across all six dimensions simultaneously — a system with superior technical performance but poor information quality will still fail to deliver institutional value (DeLone & McLean, 2003).

Applied to ASPIRE, the DeLone and McLean model provides the theoretical rationale for evaluating the system against both the Technology Acceptance Model and the ISO/IEC 25010:2023 standard simultaneously. The ISO characteristics of functional suitability and reliability map directly to System Quality and Information Quality in the DeLone and McLean framework; TAM's Perceived Usefulness maps to User Satisfaction and Net Benefits; and ASPIRE's role-based access controls and real-time data synchronization architecture address Service Quality. This dual-evaluation methodology, anchored in DeLone and McLean's multi-dimensional success model, ensures that ASPIRE is assessed holistically rather than through a single narrow lens (DeLone & McLean, 2003).

Sweller (1988) proposed Cognitive Load Theory (CLT), which holds that human working memory has a finite, limited capacity for processing new information. CLT identifies three types of cognitive load: intrinsic load (inherent complexity of the task), extraneous load (complexity introduced by poor interface design), and germane load (mental effort directed toward meaningful decision-making). The theory argues that effective system design must minimize extraneous cognitive load so that users can direct their limited working memory resources toward meaningful processing (Sweller, 1988).

ASPIRE's educator triage interface directly operationalizes CLT principles. Rather than presenting faculty with an unordered full class roster requiring manual at-risk identification, ASPIRE auto-sorts students by composite risk score with High and Critical Risk students pinned to the top. This design eliminates the extraneous cognitive load of manual roster scanning, enabling professors to focus their limited attentional resources on the two to three students requiring immediate support. The clickable risk breakdown panel — displaying each factor's point contribution — further eliminates the cognitive effort of inferring why a student was flagged, providing faculty with structured, pre-organized decision context (Sweller, 1988).

# Explainable Multi-Factor Risk Scoring & Trajectory Analysis

To address concerns that risk identification is arbitrary, contemporary Early Warning Systems (EWS) rely on strict mathematical weighting and algorithm-based scoring mechanisms. A 2025 study on predicting academic risk demonstrated the effectiveness of utilizing a composite risk score scaled from 0-100 that assigns specific statistical weights to indicators: w1(GWA) + w2(Assessment) + w3(Attendance) + w4(Trajectory). Explaining why composite mathematical formulas are superior to single-threshold badges (e.g., GWA > 3.00), Hussain et al. (2025) note that generating a final risk score from a weighted formula guarantees objective and highly accurate risk evaluations. Furthermore, monitoring performance decline across grading periods (e.g., Prelim to Midterm) identifies endangered students before they reach failing thresholds (Hussain et al., 2025).

The effectiveness of trajectory monitoring — detecting a performance decline trend across consecutive grading periods (e.g., Prelim 85% -> Midterm 74%) — has been validated as a significantly stronger early warning signal than any single-period grade snapshot. Jayaprakash et al. (2014) demonstrated in their large-scale open-source EWS deployment that multi-factor composite indicators incorporating both current academic standing and performance velocity across grading periods are substantially more predictive of dropout risk than GWA threshold triggers alone. This longitudinal trajectory component allows institutions to identify students who are trending toward failure well before they cross the failing threshold — enabling earlier, less intensive interventions. Haron and Ismail (2024) further validated this approach using RepTree classification models, finding that incorporating trajectory features into a composite risk model improved predictive accuracy by approximately 18% over static, grade-only models (Jayaprakash et al., 2014; Haron & Ismail, 2024).

These converging findings directly inform ASPIRE's four-factor weighted Academic Risk Score formula — combining GWA Factor, Assessment Factor, Attendance Factor, and Trajectory Factor — which surfaces clickable, factor-level point breakdowns to faculty rather than opaque, single-score black-box alerts.

# Human-in-the-Loop (HITL) AI Governance in Education

Gil and Selman (2025) conducted a systematic review of Human-in-the-Loop AI systems across high-stakes domains including education, establishing that HITL frameworks are defined by three essential properties: (1) explicit human oversight at designated critical decision points, (2) structured mechanisms that allow humans to review, correct, and override AI outputs, and (3) audit trails documenting all human-AI collaborative decisions. Their review confirmed that HITL architectures consistently outperform both fully autonomous AI systems and purely manual workflows on decision accuracy, stakeholder trust, and institutional accountability — and that the single greatest predictor of HITL system success is the clarity and enforceability of human intervention points (Gil & Selman, 2025).

Lin et al. (2025), developing the AdvisingWise multi-agent AI advising system, operationalized the HITL framework specifically in the academic advising context. Their study validated that while LLMs excel at rapidly drafting personalized advising materials, human faculty review remains non-negotiable for reliability and institutional accountability. AdvisingWise places all AI-generated advising outputs in a structured pending-review queue where faculty can accept, modify, or reject each recommendation before delivery to the student — a design pattern directly mirrored in ASPIRE's "Pending Professor Validation" workflow. Al-Barrak and Al-Razgan (2023) further support this, demonstrating that even algorithmically superior early warning systems must preserve faculty authority to contextualize and override AI risk designations, because student circumstances frequently contain qualitative nuance that quantitative risk scoring cannot capture (Lin et al., 2025; AlBarrak & Al-Razgan, 2023).

ASPIRE operationalizes these HITL governance principles through its three-layer architecture: a Deterministic Math Engine producing objective risk scores; an AI Advisory Layer generating topic-specific diagnostics in a purely non-binding capacity; and a Faculty Authoritative Layer requiring explicit professor review and task assignment approval before any intervention content is activated for student access.

Pedagogical Prompt Grounding & Mandatory Metadata Enforcement

Srinivasan and Kumar (2026), developing the Aurora neuro-symbolic AI academic advising agent, demonstrated that the single most effective technique for eliminating AI hallucination in high-stakes academic advisory contexts is domain-grounded prompting — the practice of injecting precise institutional parameters directly into the AI system's context window before generation. Aurora injects student-specific academic logs, curriculum codes, subject prerequisite mappings, and institutional GWA scale definitions as structured context, producing recommendations verifiably grounded in the student's actual academic profile rather than generalized training data. Their evaluation confirmed that grounded advising agents produced recommendations that were significantly more accurate, institution-specific, and actionable compared to ungrounded LLM-based advising outputs (Srinivasan & Kumar, 2026).

When AI advisory systems lack specific context about what topic a student struggled on, they are forced to generate generic study advice that students consistently rate as irrelevant and discard. Ouatiq et al. (2025) identified this as a critical limitation in EDM-based prediction models, noting that systems incorporating granular academic activity metadata — such as assessment topic labels, learning objectives, and subject scope descriptions — produce substantially more targeted and actionable intervention recommendations than models relying solely on cumulative GWA data. Tlili et al. (2025) confirmed in their systematic review of AI in higher education that the quality, specificity, and student uptake of AI-generated educational interventions are directly correlated with the richness and precision of the contextual input provided to the AI model at generation time (Ouatiq et al., 2025; Tlili et al., 2025).

ASPIRE addresses this context-grounding requirement by making both Activity Title and Activity Scope/Description mandatory fields in the Score Input module — this structured metadata is injected directly into the AI Academic Advisor's context window, enabling it to generate subject-specific diagnostic cards and targeted study resource recommendations rather than generic academic advice.

Closed-Loop Intervention Lifecycles & Outcome Evaluation

Modern performance tracking in higher education has shifted from merely recording grades to deploying proactive, data-driven intervention lifecycles. Evaluating outcome effectiveness in higher education relies on a 6-stage lifecycle: Detect -> Evaluate -> Intervene -> Monitor -> Measure Outcome -> Reassess. Highlighting this closed-loop pipeline, researchers emphasize the use of baseline versus follow-up snapshots to quantify academic recovery, risk-level transitions, and task completion rates. A targeted student retention strategy, powered by continuous monitoring and outcome measurement, enables institutions to identify and aid students needing support effectively (Engineerica, 2024).

Imundo et al. (2025) identified a critical accountability gap in most deployed early warning systems: institutions reliably send risk alerts but have no mechanism for tracking whether students acted on those alerts or whether recommended interventions produced measurable academic improvement. Their study proposed that EWS must be architecturally extended beyond the detection phase into a structured action-tracking and outcome-measurement pipeline — where intervention tasks are assigned, student completion is logged, and postintervention academic standing is formally compared to pre-intervention baselines. Chang et al. (2025), testing a personalized EWS in Taiwanese higher education, provided empirical validation of this closed-loop model: students who received structured faculty-assigned intervention tasks with follow-up performance tracking showed a 23% higher academic recovery rate compared to students who received only alert notifications without structured follow-up (Imundo et al., 2025; Chang et al., 2025).

In the Philippine higher education context specifically, Follo (2025) found that retention intervention programs consistently underperform when follow-up accountability mechanisms are absent. Students rarely followed through on non-structured, open-ended recommendations, whereas cohorts receiving formal faculty-assigned task lists with specific completion deadlines demonstrated significantly higher intervention completion rates and improved academic standings by the subsequent grading period. This finding supports the design principle of embedding checklist-style catch-up plans with trackable, milestone-level items directly within the student's academic dashboard rather than communicating intervention plans through informal channels such as verbal consultation or email (Follo, 2025).

ASPIRE's closed-loop pipeline directly operationalizes these research findings through its baseline_snapshot and followup_snapshot capture mechanism in the student_risk_evaluations

table — systematically recording pre- and post-intervention academic standing to empirically quantify GWA change, risk-level transition rate, and catch-up task completion rate as primary outcome metrics.

Student Engagement and Self-Monitoring Systems

Student self-monitoring is a critical component of academic success, fostering autonomy and proactive learning behaviors. Recent exploratory studies on student learning support emphasize that systems allowing students to track their own performance serve as a "nudge," motivating them to adjust their study habits. Students who engage in self-monitoring show a greater sense of responsibility and are more aware of their academic trajectories compared to those who only receive delayed institutional feedback (Mthethwa & Nkosi, 2025). This is further supported by research indicating that giving students access to their own academic performance analytics directly influences their engagement, enabling them to recognize their own academic risk before formal intervention is even necessary (Mhakure et al., 2025).

ASPIRE responds to this body of evidence by providing students with a real-time GWA tracker, a President's Lister (PL) target forecasting tool, and subject-specific academic diagnostic cards generated by the AI Academic Advisor — transforming passive end-ofperiod grade viewing into an active, continuous, and self-directed academic monitoring and recovery experience.

# Artificial Intelligence in Education

Artificial Intelligence is increasingly being utilized to close the gap between data collection and student intervention. Modern AI-powered student success modules analyze academic standing and behavioral signals in real-time to generate dynamic risk scores. When these scores rise, the AI automatically recommends targeted interventions, shifting the retention strategy from reactive triaging to proactive coaching, thereby saving administrative workload (EnrollOps, 2024). Moreover, a 2025 systematic review of AI in higher education demonstrates that real-time learning analytics and AI-driven platforms can significantly enhance academic performance by processing multidimensional datasets, generating tailored study strategies based on behavioral and engagement patterns (Tlili et al., 2025).

The frontier of AI application in academic advising is represented by systems combining symbolic rule-based logic with LLM-generated natural language outputs to produce recommendations that are simultaneously algorithmically grounded and contextually intelligible. Srinivasan and Kumar (2026), with Aurora, and Lin et al. (2025), with AdvisingWise, both demonstrated that hybrid neuro-symbolic advising architectures — where a deterministic rules engine sets the boundaries and a generative AI layer produces human-readable explanations — outperform both pure rule-based and pure LLM-based systems on recommendation accuracy, student uptake, and faculty trust. Lim et al. (2026), in a comprehensive institutional review of AI-driven analytics in higher education, further

confirmed that hybrid AI architectures combining deterministic computation with generative advisory output achieve the highest rates of institutional adoption and produce the strongest measurable improvements in student academic outcomes.

ASPIRE adopts precisely this validated hybrid design: the Academic Risk Engine operates as a fully deterministic mathematical layer producing reproducible, auditable risk scores, while the AI Academic Advisor — powered by Google Gemini 2.5 Flash via OpenRouter — operates in a strictly non-binding advisory capacity, generating topic-specific study diagnostics grounded in mandatory activity metadata injected at prompt construction time.

Data Privacy & Ethical Governance in Academic AI

The deployment of AI-assisted academic systems in Philippine higher education institutions must operate within the legal and ethical boundaries established by Republic Act No. 10173, known as the Data Privacy Act of 2012. This legislation mandates that all personal information controllers — including academic institutions — implement reasonable and appropriate security measures to protect personal data against unauthorized access, disclosure, and misuse. In the context of academic information systems, this translates to strict requirements for role-based data access controls, data minimization, and informed consent procedures, particularly when student academic records are processed or used as inputs to automated decision-support tools.

The intersection of AI-generated content and student academic data creates a particularly complex ethical governance challenge. AI systems that generate personalized academic recommendations based on student grade records must navigate the dual obligation of leveraging data to produce useful interventions while ensuring that data handling remains transparent, consented, and auditable. Academic institutions are increasingly required to inform students that AI has been used in their academic support pathway and to preserve human override authority at every decision point where AI output may influence academic standing or institutional action.

ASPIRE addresses these ethical governance requirements through multiple architectural safeguards. Supabase Row Level Security (RLS) policies are implemented across all database tables, enforcing strict role-based data access so that each user type can only interact with data within their authorized scope. All AI-generated catch-up plans are classified as pending until explicitly reviewed and approved by the assigned faculty member, ensuring that no AI output reaches a student without human validation. Furthermore, all grade modifications within the system are routed through a Dean-approval audit workflow logged in the audit_logs table, maintaining a transparent, chronological accountability trail that satisfies R.A. 10173's data integrity requirements.

These design decisions collectively ensure that ASPIRE operates not only as a technically capable academic intervention platform but as an ethically governed one — compliant with

R.A. 10173, transparent in its AI advisory function, and accountable in every data handling operation.

Role-Based Access Control (RBAC) in Academic Systems

Role-Based Access Control (RBAC) is a widely adopted access control paradigm in information systems that restricts system access based on the roles of individual users within an organization. Under RBAC, permissions are assigned to roles rather than directly to individual users, and users acquire permissions by being assigned to appropriate roles. In academic information systems specifically, RBAC is critical for ensuring that sensitive data — including student grade records, risk assessments, and intervention documentation — is accessible only to the stakeholders with a legitimate institutional need and authority to view or modify it.

The failure to implement strict role-based boundaries in academic systems has been shown to produce a range of institutional risks: faculty accessing other faculty members' gradebook data, students viewing unapproved intervention notes, and administrative personnel modifying grade records without an audit trail. ASPIRE's four-role RBAC architecture — enforcing distinct permission scopes for Students, Faculty, Deans, and Administrators — directly addresses each of these risks. Students are restricted to their own academic records and AI-advisory outputs. Faculty access only their assigned sections' gradebook and risk evaluation data. Deans access college-wide risk analytics and faculty evaluation status without the ability to modify grade records directly. Administrators manage system configuration, user provisioning, and audit log access exclusively.

From a data governance perspective, RBAC in ASPIRE enforces the principle of least privilege — each user role is granted the minimum data access rights necessary to perform their institutional function, and nothing more. This architectural decision ensures that even in the event of a compromised account, potential data exposure is constrained to the permissions of that specific role. Combined with Supabase Row Level Security policies applied at the database layer, ASPIRE's RBAC implementation provides a defense-in-depth data protection architecture that aligns with both R.A. 10173 and ISO/IEC 25010:2023 security quality standards.

The implementation of a strict four-role RBAC architecture in ASPIRE is therefore not a discretionary design preference but a direct institutional and legal requirement — one grounded in established IS security literature and the Philippine academic data governance framework.

Related Studies

Early Warning Systems (EWS) & Student Retention Systems

Research conducted in 2026 on university student retention evaluated the influence of academic and behavioral integration on student continuity. By applying supervised classification models and composite risk scoring to student records, the study categorized retention probabilities. It concluded that data mining is essential for understanding the specific determinants of attrition, allowing universities to transition from generalized support to precise, individualized intervention plans (Aborokbah et al., 2026). In the Philippine context, a 2025 study developed a data-driven model specifically for student retention in a Philippine Higher Education Institution. The study emphasized that providing HEI policymakers with predictive, localized data is crucial for creating effective, culturally contextualized early intervention plans (Quizon et al., 2025).

Singh (2026) extended EWS research to Philippine-comparable institutional contexts, investigating how machine learning models can predict student academic success using behavioral and academic signals captured early in the semester. The study found that composite academic signals recorded within the first four to six weeks — equivalent to the Prelim grading period in Philippine HEIs — were sufficient to predict final-semester academic outcomes with approximately 78% accuracy. This finding critically affirms that the most impactful window for academic intervention is the earliest grading period, not the midpoint of the semester when traditional monitoring systems typically surface their first alerts.

Collectively, these studies establish that early, data-driven, and institutionally localized intervention pipelines are essential for Philippine higher education contexts — a need ASPIRE directly addresses through its grading-period-aware, multi-factor risk detection system that activates risk classification from the Prelim period onward.

# Educational Data Mining (EDM) & Performance Prediction

A 2025 in-depth analysis published in Computers synthesized findings on how Educational Data Mining (EDM) and predictive modeling facilitate the early identification of academic struggles. The study provided a comprehensive framework demonstrating that predictive models leverage historical and real-time academic activity metadata and semester-based timeseries data to accurately forecast student trajectories (Ouatiq et al., 2025). Another 2025 study focused on predicting student performance by applying EDM techniques to learning management system data, finding that such analysis categorizes retention probabilities effectively and notifies students of specific academic gaps (Mhakure et al., 2025).

Hellas et al. (2019), in a systematic literature review of academic performance prediction spanning over 50 empirical studies, found that the most consistently accurate prediction models universally incorporated both static academic indicators — cumulative GWA, attendance records, and assessment scores — and dynamic behavioral indicators, such as performance trends across consecutive grading periods. Their synthesis concluded that single-indicator models are inherently unreliable for real-world deployment and that multi-

source, multi-dimensional EDM approaches are the established standard for effective academic risk prediction. Crucially, they also found that models providing interpretable, factor-level explanations of risk predictions are significantly more likely to be acted upon by faculty than black-box models — even when black-box models achieve marginally higher technical accuracy.

These findings directly justify ASPIRE's multi-factor design philosophy: by synthesizing official faculty-uploaded gradebook data, attendance records, and cross-period performance trajectory into a single explainable composite risk score, ASPIRE ensures that its risk predictions are both accurate and actionable by the faculty members who must translate them into intervention decisions.

Real-Time Academic Analytics & Advising Dashboards

While data-driven leadership enhances educational outcomes, manual data retrieval often creates operational bottlenecks. A 2025 study by Secreto, Ofrin, and Tabo at a Philippine state university emphasized data-driven early warning models tailored for Filipino college students. The study found that real-time student progress monitoring resolves these delays by improving decision accuracy and enabling timely interventions. Administrators strongly advocated for integrating Artificial Intelligence into Student Information Systems to proactively identify at-risk students, directly supporting the AI-based recommendation module designed to advise students on course continuation (Secreto et al., 2025).

At the institutional leadership level, Lim and Yousefi (2026) demonstrated that deans and academic directors with access to macro-level, program-wide risk analytics are significantly more effective at deploying institutional support resources — capable of intervening at the program level before individual student failures cascade into departmental attrition trends. Their study specifically recommended that academic administration dashboards present risk rosters segmented by college, program, and risk severity level as the most operationally actionable format for administrators responsible for institutional retention outcomes. Yousefi and Lim (2025) complemented this finding by validating that dashboards providing simultaneous visibility into both at-risk student identification and honors-tier student tracking — distinguishing students in academic danger from high-performing students at risk of dropping below honors thresholds — provide the most complete and decision-relevant institutional picture.

ASPIRE's Dean Risk and Honors Analytics Matrix directly operationalizes these evidencebased dashboard design principles — presenting a dual-tier roster of At-Risk students alongside President's Lister (PL) students at honors risk, segmented by faculty evaluation compliance status (Evaluated vs. Pending), and equipped with a Faculty-Dean Collaboration Queue for escalated case discussion.

Automated Grade Computation & Transmutation Platforms

Manual academic record-keeping is notoriously time-consuming and prone to errors. A 2025 study by Bacongol and Durango demonstrated that centralized automated platforms significantly improve grading speed, accuracy, and transparency. Validating centralized digital gradebooks that eliminate spreadsheet errors while preserving transparency, these systems ensure accurate, real-time grade accessibility for students without adding administrative burdens. These insights support the proposed system's foundational grading capability, enabling a transparent pipeline from automated grade computation directly into the intervention risk engines (Bacongol & Durango, 2025).

Beyond operational efficiency, grade transparency has been identified as a critical factor in student academic engagement and perceived institutional fairness. Alipour and Khosravi (2024) examined student trust in automated evaluation systems and found that the ability to view not only final grades but the step-by-step computation process — including component weights, intermediate averages, and transmutation mapping — is a significant predictor of both academic engagement and students' willingness to act on performance feedback. Their study recommended that automated grading platforms expose computation logic through visual breakdowns rather than displaying only terminal scores, as transparency directly correlates with student motivation to seek improvement. Rino and Daing (2022) further documented that Philippine HEIs relying on decentralized, faculty-managed grading sheets experienced disproportionately high rates of grade disputes, administrative delays, and interfaculty computation inconsistencies — institutional inefficiencies that a centralized platform with locked, template-driven computation logic and role-based access controls eliminates structurally.

At the technical architecture level, real-time data synchronization between faculty grade input interfaces and student-facing performance dashboards eliminates the data availability lag that traditional end-of-period grade release practices create. Haron and Ismail (2024) identified this data lag — the delay between when a faculty member records a grade and when it becomes available to the student and institutional risk systems — as one of the most significant structural barriers to timely academic intervention. Their study demonstrated that grading systems implementing real-time database synchronization reduce this lag from days or weeks to seconds, enabling risk scoring engines to incorporate the latest available grade data at all times rather than operating on stale or incomplete records.

ASPIRE addresses all three dimensions validated in the literature: its COG-templatecompliant automated grading engine eliminates computation errors and inconsistencies, its transparent grade computation dashboard builds student trust and engagement, and its realtime Supabase database synchronization pipeline ensures that faculty-uploaded grade data is immediately propagated to the Academic Risk Scoring Engine — eliminating the data lag that has historically been one of the primary structural barriers to timely academic intervention.

Human-in-the-Loop Systems in Academic Decision-Making

Gil and Selman (2025) conducted a large-scale systematic review of Human-in-the-Loop AI systems across multiple high-stakes domains, finding that HITL architectures consistently outperform both fully autonomous AI systems and purely manual human workflows on three critical performance dimensions: decision accuracy, stakeholder trust, and institutional auditability. Their analysis identified that the primary determinant of HITL system effectiveness is the precision and enforceability of designated human intervention points — specifically, the clarity of what the human reviews, what the human can modify, and what the system locks from unilateral AI modification. Systems with vague or bypassed intervention points consistently failed to achieve the stakeholder trust necessary for institutional adoption, regardless of their technical performance metrics (Gil & Selman, 2025).

Lin et al. (2025) operationalized the HITL framework specifically for academic advising contexts in the development of AdvisingWise. Their empirical evaluation demonstrated that faculty members who reviewed and approved AI-generated advising plans — even when they accepted recommendations without modification — reported significantly higher confidence in the quality and institutional appropriateness of those plans compared to faculty who received fully automated outputs. Students reported higher satisfaction and higher rates of plan engagement when they knew their plan had been reviewed and approved by their assigned faculty member. This finding confirmed that HITL review generates institutional trust value independent of whether the human reviewer makes substantive changes to the AI output (Lin et al., 2025).

Imundo et al. (2025) provided complementary empirical evidence from the student perspective. Their study found that students who were explicitly informed that an AIgenerated academic alert had been reviewed and validated by their professor before delivery were significantly more likely to act on the intervention plan within the first week of receipt compared to students who received algorithmically identical plans without the human validation disclosure. The researchers termed this the "human stamp of approval" effect — demonstrating that HITL validation is not merely a technical safeguard against AI error but a critical trust-building mechanism that directly amplifies the behavioral effectiveness of academic intervention communication (Imundo et al., 2025).

These findings collectively validate the design and institutional necessity of ASPIRE's HITL faculty validation modal — which requires professors to explicitly review AI-generated catch-up plans, record qualitative observation notes, assign structured catch-up tasks, and approve plan content before publication to students — embedding documented human accountability at the precise moment of highest academic consequence.

# AI-Assisted Academic Advising Systems

Atalla et al. (2023) developed an intelligent recommendation system for academic advising grounded in curriculum analysis and student performance modeling. Their system demonstrated that AI advising engines incorporating structured, domain-specific academic

context — including course codes, prerequisite dependency mappings, and historical subject performance records — produce recommendations that students are 3.4 times more likely to act upon compared to generic advising outputs generated without domain context. The study established the foundational design principle that academic advising AI must be domaingrounded and curriculum-aware — not a repurposed general-purpose conversational model — to achieve meaningful student behavioral outcomes (Atalla et al., 2023).

Srinivasan and Kumar (2026) advanced this principle with Aurora, a neuro-symbolic AI academic advising agent that grounds all generated recommendations by injecting institutional parameters — including student grade logs, curriculum codes, GWA scale definitions, and subject prerequisite mappings — directly into the LLM system prompt before generation. Aurora's architecture eliminated hallucinated course recommendations and produced verifiably institution-specific advising outputs. Their evaluation demonstrated that context-grounded AI advising agents achieved significantly lower rates of student confusion, higher rates of recommendation follow-through, and higher faculty confidence in AIgenerated plan quality compared to ungrounded advising systems (Srinivasan & Kumar, 2026).

OpenRouter (2026) telemetry data on the Google Gemini 2.5 Flash model — the AI backbone of ASPIRE's Academic Advisor module — confirmed consistent production-level uptime, low-latency response times, and native structured JSON output capability through JSON Schema Mode. These technical characteristics validate Gemini 2.5 Flash as a suitable foundation for real-time, high-availability academic advisory deployment. This technical reliability, combined with ASPIRE's deterministic local fallback mechanism — which guarantees non-blank, rule-generated diagnostic output during any period of API unavailability — ensures that the AI Advisory Layer operates without service disruption regardless of external API conditions (OpenRouter, 2026).

ASPIRE's AI Academic Advisor (AcademicInsights.jsx) integrates the validated design principles established across this body of literature: mandatory Activity Title and Scope metadata is injected as domain-grounding context at prompt construction time, Google Gemini 2.5 Flash generates structured JSON topic-diagnostic output through JSON Schema Mode, and a deterministic local fallback guarantees zero blank-screen failures — producing a grounded, reliable, and pedagogically sound AI advising experience.

Statement of the Problem

Academic attrition and delayed intervention remain persistent challenges in Philippine higher education institutions. At Dr. Yanga's Colleges, Inc. (DYCI), performance tracking remains largely traditional, fragmented, and reactive — faculty members primarily rely on periodic manual grade evaluations, spreadsheet-based tracking, and consultation-based identification of struggling students. A faculty pre-survey conducted for this study reveals that early identification of students needing support was rated only moderately effective (M = 3.25), while administrative workload was perceived as high (M = 3.75). Respondents strongly

agreed on the need for a centralized performance tracking system (M = 4.00), an automated warning mechanism (M = 4.13), and strict accountability in data handling (M = 4.63). These findings confirm that current practices produce lagging indicators — alerts that surface only after a student has already disengaged — and that structured, rule-based, and facultyvalidated academic support pipelines are critically absent.

This capstone project addresses these institutional and technological gaps by developing ASPIRE (Academic Support and Performance Advising with Intervention, Risk, and Evaluation), a human-in-the-loop academic early-intervention system. ASPIRE integrates automated grade computation, explainable multi-factor risk assessment, educator triage sorting, Human-in-the-Loop (HITL) faculty evaluation, AI-assisted personalized academic advising, and baseline versus follow-up outcome measurement into a single closed-loop academic support pipeline.

# General Problem

How can ASPIRE be designed, developed, and evaluated as a human-in-the-loop academic early-intervention system for Dr. Yanga's Colleges, Inc. that enables explainable risk assessment, structured faculty-led intervention planning, and outcome-based measurement of student academic recovery?

# Specific Problems

1. System Portal Integration: How can ASPIRE be designed to centralize and secure academic operations across four role-based portal interfaces (Student, Faculty, Dean, and Admin) under a centralized managed cloud database architecture?
2. Grading Automation: How can ASPIRE automate grading calculations and transmutations in strict compliance with DYCI's program-specific Computation of Grades (COG) templates (e.g., 50-40-10 for General/Professional Education, 30-60-10 for Health Sciences Theory, and distinct component breakdowns for Health Sciences RLE and Maritime Education), correctly branching the calculation span between regular semesters (four grading periods: Prelim, Midterm, Semi-Final, Final) and summer terms (two grading periods: Midterm, Final), with step-by-step intermediate average rounding (MR, TFR, SG)?
3. Explainable Multi-Factor Risk Assessment: How can a weighted risk scoring mechanism (0–100) be developed combining GWA performance, assessment standing, attendance records, and performance trajectory to automatically classify students into risk tiers (Low, Moderate, High, Critical) and surface explainable, factor-level breakdowns to faculty?
4. Educator Triage & Human-in-the-Loop (HITL) Intervention: How can an educator triage roster be implemented that auto-sorts students by risk severity and provides faculty with a structured HITL evaluation interface to review risk breakdowns, write observation notes, assign trackable catch-up tasks, and capture baseline snapshots for outcome comparison?
5. Mandatory Activity Metadata & AI Academic Advising: How can mandatory Activity Title and Activity Scope/Description enforcement in the Score Input module be used to

ground the AI Academic Advisor in generating topic-specific, personalized study diagnostics and real-time GWA/President's Lister (PL) target forecasts for students?

6. Faculty-Dean Collaboration & Institutional Oversight: How can a faculty-to-dean escalation mechanism (refer_to_dean) and a Dean Risk & Honors Analytics Matrix be developed to provide institutional-level visibility into risk distribution, evaluation compliance, and collaboration queues?
7. Intervention Outcome Evaluation: How can baseline snapshots (captured at evaluation time) and follow-up snapshots (captured at the next grade milestone) be used to quantifiably measure whether academic improvement occurred following faculty-led interventions?
8. Security & Audit Trails: How can ASPIRE maintain administrative accountability through an audited grade resubmission ledger (Dean approval workflow) and a system-wide chronological activity log?
9. Technology Acceptance Model (TAM) Validation: How acceptable is ASPIRE to users when evaluated using the TAM constructs of Perceived Ease of Use (PEOU), Perceived Usefulness (PU), and Behavioral Intention (BI) administered to a purposively selected sample of respondents from Dr. Yanga's Colleges, Inc.?
10. Software Quality Standards: How compliant is ASPIRE when evaluated against the software quality characteristics of the ISO/IEC 25010:2023 standard, specifically functional suitability, performance efficiency, usability, reliability, security, portability, and maintainability?

# Objectives of the Study

This study defines the specific targets and measurable outcomes that the proposed academic management and intervention system intends to achieve for the institution.

# General Objective

To design, develop, and evaluate ASPIRE — a human-in-the-loop academic earlyintervention system for Dr. Yanga's Colleges, Inc. — that integrates explainable multi-factor risk assessment, structured faculty-led intervention planning, AI-assisted personalized academic advising, and outcome-based measurement to proactively support at-risk and honors-endangered students.

# Specific Objectives

1. System Portal Integration: To develop a responsive web application featuring four distinct, role-based dashboards (Student, Faculty, Dean, and Admin) connected via a centralized managed cloud database to consolidate academic operations under a 4-role RBAC architecture.
2. Grading Automation: To build an automated grading engine that applies the correct program-specific COG template per subject (General/Professional Education, Health Sciences Theory, Health Sciences RLE, and Maritime Education), computes term averages by branching between regular (Prelim, Midterm, Semi-Final, Final) and summer (Midterm, Final) grading periods, and transmutates semestral ratings into GWA equivalents (1.00 to 5.00) with precise intermediate rounding to eliminate clerical errors.
3. Explainable Multi-Factor Risk Assessment: To design and implement a weighted Academic Risk Score formula (0–100) combining four factors — GWA Factor, Assessment Factor, Attendance Factor, and Trajectory Factor — with a clickable UI breakdown displaying each factor's point contribution so faculty and deans can answer "Why was this student flagged?" without ambiguity.
4. Educator Triage & Human-in-the-Loop (HITL) Intervention: To implement an educator triage roster that auto-sorts students by risk score (High/Critical Risk pinned to top) and a HITL Student Risk Evaluation modal ([ Evaluate Student ]) where faculty select intervention context (Passing Recovery or PL Honor Retention), write observation notes, assign 2–3 specific catch-up tasks, capture a baseline_snapshot, and optionally flag for Dean discussion (refer_to_dean).
5. Mandatory Activity Metadata & AI Academic Advising: To enforce mandatory Activity Title and Activity Scope/Description entry in Score Input and leverage this grounded metadata in the AI Academic Advisor (AcademicInsights.jsx) to generate topic-specific subject diagnostic cards, personalized study recommendations, and real-time GWA/PL target forecasts — with a deterministic local fallback guaranteeing zero blank screens during offline conditions.
6. Faculty-Dean Collaboration & Institutional Oversight: To develop a Faculty-Dean Collaboration Queue (refer_to_dean escalation) and a dual-tier Dean Risk & Honors Analytics Matrix displaying At-Risk Roster and President's Lister (PL) Risk Roster with Faculty Evaluation Status Badges (Evaluated vs. Pending).
7. Intervention Outcome Evaluation: To implement baseline_snapshot and followup_snapshot capture in student_risk_evaluations to quantify academic recovery after each faculty-led intervention, measuring GWA change, risk-level transition rate, and task completion rate as primary research output metrics.
8. Security & Audit Trails: To create an audited grade resubmission workflow requiring Dean approval for posted grade modifications, supported by a system-wide chronological activity ledger (audit_logs).
9. Technology Acceptance Model (TAM) Validation: To evaluate the acceptability of ASPIRE using a forced-choice 4-point Likert scale TAM questionnaire (measuring PEOU, PU, and Behavioral Intention) administered to a purposively selected sample of respondents from Dr. Yanga's Colleges, Inc.
10. Software Quality Standards: To assess ASPIRE's technical quality using selected characteristics of the ISO/IEC 25010:2023 standard, verifying its functional suitability, performance efficiency, usability, reliability, security, portability, and maintainability.

Scope and Delimitation

Scope

# Shared / Public Portal (Authentication and Security)

Role-Based Login Module: Renders a secure credential entry form supporting four institutional roles (Student, Faculty, Dean, and Admin). Triggers a Supabase Auth backend authentication flow to validate credentials, verify active account statuses, provision secure session tokens, and route the authenticated user to their role-specific dashboard.

First Login / Change Password Module: Intercepts new users accessing the system with temporary administrative credentials and locks navigation behind a mandatory password change interface. Enforces password strength validation and updates the user's credential record before granting access.

Forgot Password Module: Handles self-service password recovery by triggering Supabase Auth's built-in password reset email flow. Verifies the user's institutional email, generates a secure reset token with an expiration window, and dispatches a recovery email containing the validation link.

Reset Password Module: Renders the password update interface accessed through the recovery email link. Performs token authenticity checks, updates the user's password record, and immediately revokes all active session tokens to prevent security leaks.

# Student Portal

## Dashboard Module

Serves as the student's central academic landing page upon login. It presents an Academic Status Card summarizing the student's cumulative General Weighted Average (GWA), a dynamic Risk Indicator Badge that reflects the student's most recently computed academic risk score, and an activity feed showing recent grade updates and advisories issued by faculty members.

## My Grades Module

Groups together all grade-related pages so students can view their academic standing per subject in one place, from the subject list down to individual activity scores.

- **My Subjects** — A directory of the student's currently enrolled courses for the term, displaying scheduled class hours, the assigned instructor for each subject, and a running indicator of academic performance per subject so students can quickly identify which courses need attention.
- **Grade Report** — The student's official grade record, displaying the three standardized milestone grades per subject: Midterm Grade (MR), Tentative Final Grade (TFR), and Semestral Grade (SG), along with the transmuted GWA equivalent (1.00–5.00 scale) and the corresponding passing remark. Each milestone grade column only becomes visible once it has been officially posted by the instructor for that grading period, meaning students cannot see grades that haven't been finalized yet.
- **Score Breakdown** — A detailed, per-subject listing of individual scores for every formative assessment (quizzes, activities, projects) configured by the instructor. Each entry displays not just the score received, but also the Activity Title and Activity Description set by the instructor, so students understand exactly which topic or task each score corresponds to.

## My Attendance Module

Covers the student's attendance record and early-warning indicators for excessive absences.

- **Attendance & Warnings** — Displays the student's attendance record per enrolled subject, broken down into Present, Late, and Absent counts. The system automatically displays a Failure Due to Absences (FDA) warning badge once a student's absence count for any subject reaches four or more, acting as an early alert before any formal action is taken by the instructor.

## Academic Support Module

Brings together the tools and communication channels meant to help students who are struggling academically or aiming for honors.

- **Advisories & Study Plans** — The student's inbox for academic intervention communication, where instructor-issued advisories and AI-generated catch-up study plans appear. Any plan that has not yet been approved by the instructor is shown with a "Pending Instructor Review" lock banner, meaning the student cannot access or act on it until the instructor reviews and releases it.
- **AI Study Advisor** — An AI-powered academic coaching tool that analyzes the student's actual activity titles and topic coverage to generate specific, topic-grounded diagnostic feedback rather than generic advice. It provides personalized study recommendations and recovery strategies, plus a real-time "what-if" GWA simulator that lets students calculate what score they'd need on upcoming assessments to pass or to qualify for the President's Lister honor roll. If the AI service is temporarily unavailable, the system automatically falls back to a locally generated recommendation so the student is never shown a blank screen.

## Consultations Module

Covers direct communication between students and their instructors outside of grade-related channels.

- **Request a Consultation** — Allows students to initiate a one-on-one consultation request with their assigned instructor, specifying the category of concern (e.g., academic difficulty, grade inquiry) and a preferred schedule for the meeting.

## Account Module

Covers the student's personal account management, separate from academic content.

- **My Profile** — Allows students to view and update personal information such as name, profile photo, and contact details.
- **Change Password** — Allows students to update their login credentials for account security.
- **Notification Settings** — Allows students to manage which alerts and notifications they receive from the system (e.g., grade postings, advisories, consultation replies).

# Faculty Portal

## Dashboard Module

Serves as the instructor's central command hub, providing a real-time overview of handled class sections, pending grading tasks, active student interventions, and incoming consultation requests. It also displays time-sensitive alerts, grade trend charts across multiple terms, score distribution summaries by grading component, and a risk-level breakdown of students across all handled sections.

## Grades Module

Covers the complete instructor workflow for recording, computing, and reviewing student grades before official submission.

- **Score Sheet** — A dynamic scoring grid where instructors input each student's raw score per graded activity. It starts with one activity column and can expand up to six. Each column must be configured with an Activity Title, Activity Description, and Maximum Score before it becomes active for scoring — columns left unconfigured remain locked. This configuration data is also what powers the student-facing AI Study Advisor, so accurate setup here directly affects the quality of AI recommendations students receive. The sheet also supports filtered views by term, grading period, or full semestral summary.
- **Grade Preview** — A live-calculating view that automatically converts raw scores entered in the Score Sheet into term averages (Prelim, Midterm, Semi-Final, Final) and their transmuted GWA equivalents, applying the subject's assigned grading formula. This lets instructors verify computed grades are correct before they are officially submitted to the system.

## Classes Module

Covers the instructor's section rosters and student enrollment approval.

- **My Classes** — Displays all class sections assigned to the instructor, including the student roster, active enrollment count, and room join code for each section. Instructors can create new class rooms and generate join codes to allow students to self-enroll.
- **Enrollment Requests** — An approval queue listing students who joined a class using a join code. Instructors must approve or reject each request before the student is officially added to the class roster and gradebook.

## Student Risk Module

Supports early identification of struggling students and the process of formally evaluating and intervening.

- **At-Risk Students** — Automatically computes an Academic Risk Score (0–100) for every student in each of the instructor's sections, with students automatically sorted so that Critical and High Risk cases appear at the top. Instructors can click into any student to see a breakdown of exactly which factors (grades, assessment performance, attendance, or performance trend) are contributing to their risk level.
- **Evaluate Student** — A structured evaluation form launched from the At-Risk Students page. Instructors select the intervention context (academic recovery or honor roll retention), review the student's risk factor breakdown, write qualitative observation notes, and assign two to three specific catch-up tasks with deadlines. The system automatically records a snapshot of the student's current standing at the time of evaluation, which is later used to measure improvement. Instructors may also flag a case for Dean-level review if needed.

## Attendance Module

Covers monitoring of student attendance across the instructor's assigned sections.

- **Attendance Monitoring** — Recalculates attendance percentages across all of the instructor's assigned sections and displays warning badges next to students who are approaching or have exceeded the four-absence threshold. This page is advisory only — the final decision on Failure Due to Absences remains at the instructor's discretion.

## Consultations Module

Covers instructor handling of student-initiated consultation requests.

- **Consultation Requests** — The instructor's inbox for receiving student-initiated consultation requests, where they can respond, log resolution notes, and track the status of each case.

## Account Module

Covers the instructor's personal account management, separate from academic content.

- **My Profile** — Allows instructors to view and update personal and department information.
- **Change Password** — Allows instructors to update their login credentials.
- **Notification Settings** — Allows instructors to manage which alerts they receive (e.g., new enrollment requests, consultation requests, escalation updates).

# Dean Portal

## Dashboard Module

Provides an institutional overview of the Dean's college, including college-wide GWA distribution, grade submission completion rates per instructor, and the total number of active student intervention cases.

## Grades Module

Covers oversight of grade submission compliance, correction approvals, and grade trend analysis at the college level.

- **Grade Submission Status** — A compliance tracking grid showing which instructors have and have not submitted their term grades across all grading periods, with overdue status indicators broken down by department.
- **Grade Corrections** — A review queue for grade correction requests submitted by instructors for grades that have already been officially posted. The Dean reviews the stated reason for each correction and approves or rejects the request, with every decision recorded in the audit trail.
- **Grade Distribution** — An analytical view of the college-wide distribution of final grades across grade brackets (1.00–5.00), allowing the Dean to identify grading trends or concentration patterns by department.

## Student Risk Module

Covers monitoring of at-risk and high-performing students, handling of escalated cases, and measurement of intervention effectiveness.

- **Risk & Honors Overview** — A two-tab dashboard: one tab lists all students in the college classified as Moderate, High, or Critical risk, along with their risk scores and whether they've been formally evaluated by an instructor; the second tab lists high-performing students whose current academic trajectory puts their honor roll eligibility at risk. Both tabs display status badges tracking whether instructors have completed their required evaluations.
- **Escalated Cases** — A queue of student cases that instructors have flagged for Dean-level discussion. The Dean can review the instructor's observation notes, add institutional recommendations, and mark each case as resolved.
- **Intervention Results** — Measures the effectiveness of academic interventions college-wide by comparing each student's standing before and after intervention, calculating change in GWA, movement between risk levels, and completion rate of assigned catch-up tasks. This serves as the primary outcome-measurement data for the institution.

## Reports Module

Covers generation of exportable academic and institutional performance reports.

- **Generate Reports** — A report-building tool that generates formatted, exportable summaries of academic performance, risk data, and intervention outcomes for the college, ready for printing or official distribution.

## Account Module

Covers the Dean's personal account management, separate from academic content.

- **My Profile** — Allows the Dean to view and update personal information.
- **Change Password** — Allows the Dean to update login credentials.
- **Notification Settings** — Allows the Dean to manage which alerts they receive (e.g., new escalations, overdue grade submissions).

# Admin Portal

## Dashboard Module

A global system overview displaying institution-wide user counts, active academic term information, total database record counts, and a live feed of recent system-wide transactions.

## User Accounts Module

Covers creation and management of user accounts across the institution.

- **Manage Users** — A master registry allowing administrators to add, search, filter, edit, and deactivate user accounts for all four roles (Student, Faculty, Dean, Admin) across all departments.
- **Import Users (CSV)** — A batch import tool that allows administrators to create multiple user accounts at once by uploading a structured CSV file, with each account automatically assigned its role and department based on the file contents.

## Academic Setup Module

Covers the foundational academic data that the rest of the system depends on — subjects, grading rules, sections, and department structure.

- **Subjects** — The master catalog of all institutional course codes, subject titles, and credit units, along with which grading formula each subject is bound to, across all programs and colleges.
- **Grading Formulas** — The centralized manager for the institution's grade computation formulas. Administrators define and maintain each formula variant (e.g., different weight distributions for General Education, Health Sciences, and Maritime programs), including component weights and grading period rules.
- **Sections** — A directory for creating and organizing class section shells, categorized by academic year, semester, and program.
- **Departments & Programs** — The master registry for academic department records, including linking Dean accounts to their respective colleges and programs.

## System Module

Covers institution-wide activity tracking and global system configuration.

- **Activity Logs** — A system-wide activity ledger that archives all account operations, grade override events, Dean approval actions, AI-generated plan events, and configuration changes, each with a timestamp for accountability and traceability.
- **Term Settings** — A global configuration panel for setting the currently active academic term, the school year calendar, and other system-wide operational parameters.

## Account Module

Covers the administrator's personal account management, separate from system configuration.

- **My Profile** — Allows administrators to view and update personal information.
- **Change Password** — Allows administrators to update login credentials.
- **Notification Settings** — Allows administrators to manage which system alerts they receive.

# Delimitation

The ASPIRE system is designed with specific operational boundaries that define what the system does not cover within the scope of this study. In terms of role structure and evaluation direction, ASPIRE operates exclusively under a four-role architecture -- Student, Faculty, Dean, and Admin. The College Office role, previously present in the legacy SAGE system, is entirely removed; its former functions of subject assignment and bulk roster import have been

reassigned to the Faculty and Admin portals respectively. Student-to-faculty evaluation surveys, anonymous rating forms, evaluation form builders, and evaluation window schedulers are likewise entirely removed. ASPIRE does not include any mechanism for students to rate or score their instructors; the "E" in ASPIRE refers exclusively to faculty-led student evaluation and system outcome evaluation.

Regarding data sources and AI advisory boundaries, the Academic Risk Score is computed solely from official faculty-uploaded grade data, attendance records, and cross-period performance trajectory metrics. The system does not incorporate student self-reported grade logs, socioeconomic indicators, mental health records, financial data, or geolocation data. The AI Academic Advisor operates exclusively in a non-authoritative, advisory capacity; it does not autonomously determine official grades, assign risk classifications, or activate institutional decisions. All AI-generated catch-up plans remain locked in a pending status until explicitly reviewed and approved by the assigned faculty member through the HITL validation workflow. This study does not evaluate the AI model's internal architecture, training data, or model weights -- only its API-level output behavior within the ASPIRE application context.

In terms of systems integration, while ASPIRE operates on a live, cloud-hosted Supabase backend, it is a self-contained platform not integrated with any of Dr. Yanga's Colleges, Inc.'s other institutional systems. The system does not connect to, sync with, or query the institution's legacy Student Information System (SIS), registrar archives, financial billing systems, or external Learning Management Systems such as Canvas or Moodle. Roster data is managed through standardized CSV uploads processed and validated within ASPIRE itself. The clearance sign-off system and blurred semestral grade lock previously implemented in the legacy SAGE system are also entirely removed; all milestone grades (MR, TFR, SG) are fully transparent and accessible to students once officially posted by the faculty, with no conditional unlock requirements.

Security features, while more robust than a purely local prototype, are bounded in scope. ASPIRE implements role-based account provisioning, Supabase Auth credential authentication, Row Level Security (RLS) policies at the database layer, and Dean-approval audit workflows for all posted grade modifications. The study excludes multi-factor authentication (MFA), browser-based hardware fingerprinting (HWID), and SMS or email One-Time Passcode (OTP) verifications -- exclusions that are intentional to prevent login friction in shared institutional computer laboratory environments during the evaluation phase.

Finally, the study's evaluation and deployment are bounded by institutional and technological limits. The TAM and ISO/IEC 25010:2023 evaluation is conducted using a purposively selected sample of student and faculty respondents from Dr. Yanga's Colleges, Inc. only; findings are not generalizable to other institutions. ASPIRE is developed as a web-based application using React.js (Vite) and Supabase; the study does not include native mobile applications, offline-first architectures, or hybrid mobile packages. All mathematical grade computations, term weighting frameworks, intermediate rounding procedures, and transmutation rules correspond strictly to DYCI's official academic computation models.

ASPIRE is validated, tested, and evaluated as a single-tenant institutional deployment for Dr. Yanga's Colleges, Inc. and does not cover multi-tenant onboarding or divergent institutional configurations.

References

Aborokbah, A. M., Sangaiah, A. K., & Al-Maimani, M. (2026). Predictive modeling of student retention in higher education using supervised classification algorithms. Journal of Educational Data Mining, 18(1), 45-62.

Al-Barrak, A. I., & Al-Razgan, M. (2023). Early warning systems in higher education: A weighted scoring approach for student risk detection. Computers & Education, 194, 104680.

Alipour, M., & Khosravi, H. (2024). Grade transparency and student trust in automated evaluation systems. International Journal of Educational Technology in Higher Education, 21(1), 12.

Bacongol, R., & Durango, M. (2025). AutoGrade: Centralized grade computation and transparency platform for Philippine HEIs. Review of Computer Engineering Research, 12(1), 88-102.

Davis, F. D. (1989). Perceived usefulness, perceived ease of use, and user acceptance of information technology. MIS Quarterly, 13(3), 319-340.

DeLone, W. H., & McLean, E. R. (2003). The DeLone and McLean model of information systems success: A ten-year update. Journal of Management Information Systems, 19(4), 9- 30.

Engineerica. (2024). Continuous tracking frameworks for proactive student retention. Educational Technology & Retention Insights, 8(2), 14-29.

EnrollOps. (2024). AI-driven student success and proactive retention intervention models. Higher Ed Automation Report.

Haron, H., & Ismail, Z. (2024). Monitoring academic performance risk using RepTree classification models. Journal of King Saud University - Computer and Information Sciences, 36(3), 101850.

Hussain, S., & Mansur, A. (2025). Mathematical weighting mechanisms in early warning retention systems. IEEE Transactions on Learning Technologies, 18, 112-125.

Jayaprakash, S. M., Moody, E. W., Lauria, E. J., Regan, J. R., & Baron, J. D. (2014). Early alert of academically at-risk students: An open source analytics initiative. Journal of Learning Analytics, 1(1), 6-47.

Lim, L., & Yousefi, A. (2026). Institutional learning analytics dashboards for macro-level educational governance. Computers & Education: Artificial Intelligence, 7, 100210.

Mhakure, D., & Mthethwa, N. (2025). Transforming LMS grading data into actionable decision trees for student self-monitoring. Computers & Education, 210, 104950.

Mthethwa, N., & Nkosi, S. (2025). Fostering student learning autonomy through real-time self-monitoring portals. Assessment & Evaluation in Higher Education, 50(2), 175-190.

Ouatiq, A., & El-Housni, M. (2025). Educational data mining and predictive modeling for early academic failure forecasting. Computers, 14(2), 45.

Pangcatan, R., & Prado, N. (2019). Digitalization challenges in Philippine academic record management systems. Philippine Journal of Education and Technology, 5(1), 34-48.

Quizon, G., & Reyes, C. (2025). Machine learning predictive models for student retention in Philippine higher education institutions. Review of Computer Engineering Research, 12(2), 130-145.

Rino, F., & Daing, M. (2022). Evaluation of decentralized grading sheets in private HEIs. Journal of Academic Administration, 15(3), 67-81.

Secreto, A., Ofrin, J., & Tabo, R. (2025). Real-time student progress monitoring and AI integration readiness in Philippine state universities. International Journal of Information and Education Technology, 15(4), 512-525.

Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. Cognitive Science, 12(2), 257-285.

Tlili, A., & Huang, R. (2025). AI-driven real-time analytics and personalized intervention strategies in higher education: A systematic review. Educational Psychology Review, 37(1), 15.

U.S. Department of Education. (2023). Multi-tiered tracking networks and early warning intervention frameworks. Office of Educational Technology.

Yousefi, A., & Lim, L. (2025). Multi-dimensional learning analytics frameworks for student engagement tracking. Higher Education Research & Development, 44(3), 401-418. Atalla, S., Daradkeh, M., Gawanmeh, A., Khalil, H., Mansoor, W., Miniaoui, S., & Himeur, Y. (2023). An intelligent recommendation system for automating academic advising based on curriculum analysis and performance modeling. Mathematics, 11(5), Article 1098.

Chang, Y.-H., Chen, F.-C., & Lee, C.-I. (2025). Developing an early warning system with personalized interventions to enhance academic outcomes for at-risk students in Taiwanese higher education. Education Sciences, 15(10), Article 1321.

Follo, W. P. (2025). Understanding retention challenges at Apayao State College: Towards institutional interventions. Asian Journal of Education and Social Studies, 51(6), 1510-1520.

Gil, Y., & Selman, B. (2025). Human-in-the-loop AI systems: A systematic review of frameworks, applications, and decision support. Entropy, 28(4), 377.

Hellas, A., Ihantola, P., Petersen, A., Ajanovski, V. V., Gutica, M., Hynninen, T., Knutas, A., Leinonen, J., Messom, C., & Liao, S. N. (2019). Predicting academic performance: A systematic literature review. Journal of Business Research, 94, 335-343.

Imundo, M. N., Goldshtein, M., Watanabe, M., Gong, J., Crosby, D. N., Roscoe, R. D., Arner, T., & McNamara, D. S. (2025). Awareness to action: Student knowledge of and responses to an early alert system. Applied Sciences, 15(11), Article 6316.

Lin, J., Wang, S., & Zhao, H. (2025). AdvisingWise: Supporting academic advising in higher education settings through a human-in-the-loop multi-agent framework. arXiv preprint arXiv:2502.14829.

OpenRouter. (2026). Google Gemini 2.5 Flash live API uptime, latency, and performance metrics. OpenRouter Telemetry.

Singh, A. (2026). Predictive analytics for student success: Investigating how machine learning can predict student success and identify early warning signs for intervention. Patna University Research Journal.

Srinivasan, R., & Kumar, A. (2026). Aurora: Neuro-symbolic AI driven advising agent. arXiv preprint arXiv:2602.17999.

Atalla, S., Daradkeh, M., Gawanmeh, A., Khalil, H., Mansoor, W., Miniaoui, S., & Himeur, Y. (2023). An intelligent recommendation system for automating academic advising based on curriculum analysis and performance modeling. Mathematics, 11(5), Article 1098.

Chang, Y.-H., Chen, F.-C., & Lee, C.-I. (2025). Developing an early warning system with personalized interventions to enhance academic outcomes for at-risk students in Taiwanese higher education. Education Sciences, 15(10), Article 1321.

Follo, W. P. (2025). Understanding retention challenges at Apayao State College: Towards institutional interventions. Asian Journal of Education and Social Studies, 51(6), 1510-1520.

Gil, Y., & Selman, B. (2025). Human-in-the-loop AI systems: A systematic review of frameworks, applications, and decision support. Entropy, 28(4), 377.

Hellas, A., Ihantola, P., Petersen, A., Ajanovski, V. V., Gutica, M., Hynninen, T., Knutas, A., Leinonen, J., Messom, C., & Liao, S. N. (2019). Predicting academic performance: A systematic literature review. Journal of Business Research, 94, 335-343.

Imundo, M. N., Goldshtein, M., Watanabe, M., Gong, J., Crosby, D. N., Roscoe, R. D., Arner, T., & McNamara, D. S. (2025). Awareness to action: Student knowledge of and responses to an early alert system. Applied Sciences, 15(11), Article 6316.

Lin, J., Wang, S., & Zhao, H. (2025). AdvisingWise: Supporting academic advising in higher education settings through a human-in-the-loop multi-agent framework. arXiv preprint arXiv:2502.14829.

OpenRouter. (2026). Google Gemini 2.5 Flash live API uptime, latency, and performance metrics. OpenRouter Telemetry.

Singh, A. (2026). Predictive analytics for student success: Investigating how machine learning can predict student success and identify early warning signs for intervention. Patna University Research Journal.

Srinivasan, R., & Kumar, A. (2026). Aurora: Neuro-symbolic AI driven advising agent. arXiv preprint arXiv:2602.17999.
