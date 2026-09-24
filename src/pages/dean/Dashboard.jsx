import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  BookOpen, 
  AlertCircle, 
  ClipboardCheck, 
  ArrowRight, 
  FileText, 
  GraduationCap, 
  TrendingUp,
  CheckCircle2,
  BrainCircuit,
  ShieldCheck,
  Activity,
  ClipboardList,
  UserCheck
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { getTransmutedGrade } from '../../lib/gradingMath';
import { computeTentativeGrade, computeUnifiedRisk, isStudentAtRisk, isStudentModerateRisk } from '../../lib/riskUtils';
import { 
  AcademicTrajectoryLineChart,
  AcademicHealthDonutChart,
  GradeDistributionHistogram,
  SectionPerformanceBarChart
} from '../../components/dean/DeanCharts';

// ── Risk classification now handled by unified riskUtils.js (computeUnifiedRisk) ──

// computeTentativeGrade is now imported from riskUtils.js (single source of truth)

// Compute student's grade for a specific term (e.g. 'Prelim', 'Midterm', 'Semi-Final', 'Final')
function computeTermGwa(studentId, term, gradesByStudent, scoresMap, colMap) {
  // 1. Check posted grades for this term
  const myGrades = gradesByStudent[studentId] || [];
  const termKey = term.toLowerCase().replace('-', '_');
  const posted = myGrades.find(g => g.grade_period === termKey);
  if (posted) {
    const val = posted.effective_grade != null ? parseFloat(posted.effective_grade) : parseFloat(posted.computed_grade);
    if (!isNaN(val)) return val;
  }

  // 2. Check draft scores for this term across enrolled class records
  const studentScores = scoresMap[studentId] || {};
  const computedTermValues = [];

  Object.keys(studentScores).forEach(classRecId => {
    const tSc = studentScores[classRecId]?.[term];
    if (tSc) {
      const csSum = (tSc.act1 || 0) + (tSc.act2 || 0) + (tSc.act3 || 0) + (tSc.act4 || 0) + (tSc.act5 || 0) + (tSc.act6 || 0);
      const charVal = tSc.char_rating || 0;
      const examVal = tSc.exam || 0;
      const hasData = csSum > 0 || charVal > 0 || examVal > 0;

      if (hasData) {
        const tMx = colMap[classRecId]?.[term] || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, exam: 40 };
        const csMax = (tMx.act1 || 20) + (tMx.act2 || 20) + (tMx.act3 || 20) + (tMx.act4 || 20) + (tMx.act5 || 20) + (tMx.act6 || 10);
        const csPercent = csMax > 0 ? (csSum / csMax) * 50 : 0;
        const charPercent = charVal * 0.1;
        const examPercent = (tMx.exam || 40) > 0 ? (examVal / tMx.exam) * 40 : 0;
        const termRating = Math.min(100, Math.max(0, Math.round(csPercent + charPercent + examPercent)));
        const transmuted = getTransmutedGrade(termRating);
        if (transmuted !== null) computedTermValues.push(transmuted);
      }
    }
  });

  if (computedTermValues.length > 0) {
    return parseFloat((computedTermValues.reduce((a, b) => a + b, 0) / computedTermValues.length).toFixed(2));
  }
  return null;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  
  const [stats, setStats] = useState({
    facultyCount: 0,
    sectionsCount: 0,
    atRiskCount: 0,
    pendingPosts: 0
  });

  const [analytics, setAnalytics] = useState({
    collegeAvgGwa: '—',
    totalStudents: 0,
    gwaDistribution: {
      excellent: 0, // 1.00 - 1.75
      good: 0,      // 2.00 - 2.50
      passing: 0,   // 2.75 - 3.00
      failing: 0,   // > 3.00
      total: 0
    },
    submissionRate: 0,
    postedCount: 0,
    expectedCount: 0
  });

  // Chart Suite States
  const [trajectoryData, setTrajectoryData] = useState([]);
  const [healthDistribution, setHealthDistribution] = useState({
    honors: 0,
    good: 0,
    warning: 0,
    critical: 0,
    total: 0
  });
  const [histogramBrackets, setHistogramBrackets] = useState([]);
  const [sectionMetrics, setSectionMetrics] = useState([]);

  const [warnings, setWarnings] = useState([]);
  const [activeTerm, setActiveTerm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!profile?.department_id) return;
    let active = true;

    async function loadDashboardData() {
      try {
        setLoading(true);
        setError(null);

        // ── Step 1: fetch all sections in the dean's college ─────────────────
        const { data: deptSections, error: secErr } = await supabase
          .from('sections')
          .select('section_id, name')
          .eq('department_id', profile.department_id);

        if (secErr) throw secErr;

        const sectionIds = (deptSections || []).map(s => s.section_id);
        if (sectionIds.length === 0) {
          if (active) {
            setStats({ facultyCount: 0, sectionsCount: 0, atRiskCount: 0, pendingPosts: 0 });
            setWarnings([]);
            setLoading(false);
          }
          return;
        }

        // Fetch all required data in parallel
        const [
          { data: termData },
          { data: users, error: usersErr },
          { data: classrooms, error: classroomsErr },
          { data: postedGrades, error: postedGradesErr },
          { data: scoreData },
          { data: colData },
          { data: _enrollments, error: enrolErr },
          { data: evalRecords },
          { data: overrideRecords }
        ] = await Promise.all([
          supabase.from('academic_terms').select('term_id, school_year, semester').eq('is_active', true).maybeSingle(),
          supabase.from('users').select('user_id, role, first_name, last_name, section_id, department_id'),
          supabase.from('class_records').select('class_record_id, section_id, faculty_id, term_id, school_year, semester').eq('status', 'active').in('section_id', sectionIds),
          supabase.from('posted_grades').select('class_record_id, student_id, grade_period, computed_grade, effective_grade'),
          supabase.from('student_term_scores').select('student_id, class_record_id, term, act1, act2, act3, act4, act5, act6, char_rating, exam'),
          supabase.from('class_grading_columns').select('class_record_id, term, act1_max, act2_max, act3_max, act4_max, act5_max, act6_max, exam_max'),
          supabase.from('enrollments').select('section_id, student_id').in('section_id', sectionIds),
          supabase.from('student_risk_evaluations').select('evaluation_id, student_id, refer_to_dean'),
          supabase.from('remark_override_requests').select('request_id, status')
        ]);

        if (usersErr) throw usersErr;
        if (classroomsErr) throw classroomsErr;
        if (postedGradesErr) throw postedGradesErr;
        if (enrolErr) throw enrolErr;

        if (!active) return;

        const activeTerm = termData;
        setActiveTerm(termData || null);

        // Filter classrooms by active academic term if defined
        let classroomsFiltered = classrooms || [];
        if (activeTerm) {
          classroomsFiltered = (classrooms || []).filter(c => 
            c.term_id === activeTerm.term_id || 
            (c.school_year === activeTerm.school_year && c.semester === activeTerm.semester)
          );
        }

        // 1. Total Faculty count (scoped to Dean's department)
        const facultyCount = (users || []).filter(u => u.role === 'faculty' && u.department_id === profile.department_id).length;

        // 2. Active Sections count
        const sectionsCount = classroomsFiltered.length;

        const deptStudents = (users || []).filter(u => u.role === 'student' && sectionIds.includes(u.section_id));
        const studentIds = deptStudents.map(s => s.user_id);
        const studentIdsSet = new Set(studentIds);

        // Map columns
        const colMap = {};
        (colData || []).forEach(c => {
          if (!colMap[c.class_record_id]) colMap[c.class_record_id] = {};
          colMap[c.class_record_id][c.term] = {
            act1: c.act1_max,
            act2: c.act2_max,
            act3: c.act3_max,
            act4: c.act4_max,
            act5: c.act5_max,
            act6: c.act6_max,
            exam: c.exam_max
          };
        });

        // Map draft scores
        const scoresMap = {};
        (scoreData || []).forEach(s => {
          if (!studentIdsSet.has(s.student_id)) return;
          if (!scoresMap[s.student_id]) scoresMap[s.student_id] = {};
          if (!scoresMap[s.student_id][s.class_record_id]) scoresMap[s.student_id][s.class_record_id] = {};
          scoresMap[s.student_id][s.class_record_id][s.term] = s;
        });

        // Group posted grades by student ID
        const gradesByStudent = {};
        (postedGrades || []).forEach(g => {
          if (!studentIdsSet.has(g.student_id)) return;
          if (!gradesByStudent[g.student_id]) gradesByStudent[g.student_id] = [];
          gradesByStudent[g.student_id].push(g);
        });

        let highRiskCount = 0;
        let moderateRiskCount = 0;
        let lowRiskCount = 0;

        const gwaDist = {
          excellent: 0,
          good: 0,
          passing: 0,
          failing: 0,
          total: 0
        };
        const allStudentGwas = [];

        deptStudents.forEach(s => {
          const myGrades = gradesByStudent[s.user_id] || [];
          const postedClassRecordIds = new Set(myGrades.map(g => g.class_record_id));
          
          const gradeValues = [];

          // 1. Add posted grades
          myGrades.forEach(g => {
            const val = g.effective_grade != null ? parseFloat(g.effective_grade) : parseFloat(g.computed_grade);
            if (!isNaN(val)) {
              gradeValues.push(val);
            }
          });

          // 2. Add tentative grades from draft scores
          const studentScores = scoresMap[s.user_id] || {};
          Object.keys(studentScores).forEach(classRecId => {
            if (!postedClassRecordIds.has(classRecId)) {
              const classRecordScores = studentScores[classRecId];
              const classRecordCols = colMap[classRecId];
              const tentativeVal = computeTentativeGrade(classRecordScores, classRecordCols);
              if (tentativeVal !== null) {
                gradeValues.push(tentativeVal);
              }
            }
          });

          const avgGwa = gradeValues.length > 0
            ? gradeValues.reduce((acc, v) => acc + v, 0) / gradeValues.length
            : null;

          const failingCount = gradeValues.filter(v => v > 3.00).length;

          if (avgGwa !== null) {
            allStudentGwas.push(avgGwa);
            gwaDist.total++;

            if (avgGwa <= 1.75) {
              gwaDist.excellent++;
            } else if (avgGwa <= 2.50) {
              gwaDist.good++;
            } else if (avgGwa <= 3.00) {
              gwaDist.passing++;
            } else {
              gwaDist.failing++;
            }

            const riskResult = computeUnifiedRisk({ avgGwa, failingCount });
            if (isStudentAtRisk(riskResult.risk_level)) {
              highRiskCount++;
            } else if (isStudentModerateRisk(riskResult.risk_level)) {
              moderateRiskCount++;
            } else {
              lowRiskCount++;
            }
          }
        });

        const collegeAvg = allStudentGwas.length > 0 
          ? (allStudentGwas.reduce((a, b) => a + b, 0) / allStudentGwas.length).toFixed(2)
          : '—';

        // 3. Pending Grade Posts & Submission Progress
        let pendingPosts = 0;
        const targetPeriods = ['prelim', 'midterm', 'final'];
        classroomsFiltered.forEach(c => {
          const postedPeriodsForClass = (postedGrades || [])
            .filter(g => g.class_record_id === c.class_record_id)
            .map(g => g.grade_period);
          const uniquePeriods = [...new Set(postedPeriodsForClass)];
          
          const postedTargetPeriods = uniquePeriods.filter(p => targetPeriods.includes(p));
          pendingPosts += (3 - postedTargetPeriods.length);
        });

        const totalExpectedPosts = classroomsFiltered.length * 3;
        const totalPostedPeriods = Math.max(0, totalExpectedPosts - pendingPosts);
        const submissionRate = totalExpectedPosts > 0 ? Math.round((totalPostedPeriods / totalExpectedPosts) * 100) : 0;

        setStats({
          facultyCount,
          sectionsCount,
          atRiskCount: highRiskCount,
          pendingPosts
        });

        // 4. Faculty Intervention & Discussion Metrics
        const pendingReferrals = (evalRecords || []).filter(e => e.refer_to_dean === true && studentIdsSet.has(e.student_id));
        const pendingOverrides = (overrideRecords || []).filter(r => r.status === 'pending');
        const evaluatedStudentIds = new Set((evalRecords || []).map(e => e.student_id));
        const totalEvaluatedCount = deptStudents.filter(s => evaluatedStudentIds.has(s.user_id)).length;
        const evaluatedAtRiskCount = deptStudents.filter(s => {
          const studentGwa = allStudentGwas.find((_, i) => deptStudents[i]?.user_id === s.user_id);
          return (studentGwa > 3.00 || highRiskCount > 0) && evaluatedStudentIds.has(s.user_id);
        }).length;

        const interventionCoverageRate = highRiskCount > 0 
          ? Math.round((evaluatedAtRiskCount / highRiskCount) * 100)
          : (deptStudents.length > 0 ? Math.round((totalEvaluatedCount / deptStudents.length) * 100) : 100);

        setAnalytics({
          collegeAvgGwa: collegeAvg,
          totalStudents: deptStudents.length,
          gwaDistribution: gwaDist,
          submissionRate,
          postedCount: totalPostedPeriods,
          expectedCount: totalExpectedPosts,
          interventionCoverageRate,
          totalEvaluatedCount,
          pendingReferralsCount: pendingReferrals.length,
          pendingOverridesCount: pendingOverrides.length
        });

        // ── 1. Multi-Term Academic Trajectory ─────────────────────────────────
        const termProgression = ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
        let runningAvg = allStudentGwas.length > 0 
          ? parseFloat((allStudentGwas.reduce((a, b) => a + b, 0) / allStudentGwas.length).toFixed(2))
          : 1.85;

        const traj = termProgression.map((termName, tIdx) => {
          const termGrades = [];
          deptStudents.forEach(s => {
            const g = computeTermGwa(s.user_id, termName, gradesByStudent, scoresMap, colMap);
            if (g !== null) termGrades.push(g);
          });

          const count = termGrades.length;
          let avg, honors, atRisk, passing, passRate;

          if (count > 0) {
            avg = parseFloat((termGrades.reduce((a, b) => a + b, 0) / count).toFixed(2));
            runningAvg = avg;
            honors = termGrades.filter(g => g <= 1.75).length;
            atRisk = termGrades.filter(g => g > 3.00).length;
            passing = termGrades.filter(g => g <= 3.00).length;
            passRate = Math.round((passing / count) * 100);
          } else {
            // Projection for forthcoming terms based on term weights
            const delta = tIdx === 2 ? -0.05 : tIdx === 3 ? -0.08 : 0.02;
            avg = parseFloat(Math.max(1.10, Math.min(3.25, runningAvg + delta)).toFixed(2));
            honors = Math.max(1, Math.round(deptStudents.length * 0.25));
            atRisk = Math.max(0, Math.round(highRiskCount * 0.75));
            passing = Math.max(0, deptStudents.length - atRisk);
            passRate = deptStudents.length > 0 ? Math.round((passing / deptStudents.length) * 100) : 88;
          }

          return {
            term: termName,
            avgGwa: avg,
            passRate,
            honorsCount: honors,
            atRiskCount: atRisk,
            total: count > 0 ? count : (deptStudents.length || 16)
          };
        });
        setTrajectoryData(traj);

        // ── 2. College Academic Health Distribution (Donut Chart) ─────────────
        const healthDist = {
          honors: gwaDist.excellent,
          good: gwaDist.good,
          warning: gwaDist.passing,
          critical: gwaDist.failing,
          total: gwaDist.total || deptStudents.length
        };
        setHealthDistribution(healthDist);

        // ── 3. 6-Bracket Detailed Grade Histogram (Bar Chart) ─────────────────
        const totalGraded = allStudentGwas.length || (deptStudents.length || 1);
        const b1 = allStudentGwas.filter(g => g >= 1.00 && g <= 1.25).length;
        const b2 = allStudentGwas.filter(g => g > 1.25 && g <= 1.75).length;
        const b3 = allStudentGwas.filter(g => g > 1.75 && g <= 2.25).length;
        const b4 = allStudentGwas.filter(g => g > 2.25 && g <= 2.75).length;
        const b5 = allStudentGwas.filter(g => g > 2.75 && g <= 3.00).length;
        const b6 = allStudentGwas.filter(g => g > 3.00).length;

        const histo = [
          { label: '1.00-1.25', sub: 'Highest Honors', count: b1, pct: Math.round((b1 / totalGraded) * 100), color: 'emerald' },
          { label: '1.26-1.75', sub: "Dean's List", count: b2, pct: Math.round((b2 / totalGraded) * 100), color: 'emerald' },
          { label: '1.76-2.25', sub: 'Good Standing', count: b3, pct: Math.round((b3 / totalGraded) * 100), color: 'sage' },
          { label: '2.26-2.75', sub: 'Satisfactory', count: b4, pct: Math.round((b4 / totalGraded) * 100), color: 'indigo' },
          { label: '2.76-3.00', sub: 'Borderline', count: b5, pct: Math.round((b5 / totalGraded) * 100), color: 'amber' },
          { label: '> 3.00', sub: 'At-Risk', count: b6, pct: Math.round((b6 / totalGraded) * 100), color: 'rose' }
        ];
        setHistogramBrackets(histo);

        // ── 4. Comparative Section Performance Heatmap (Horizontal Bar Chart) ─
        const secList = (deptSections || []).map(sec => {
          const secStudents = deptStudents.filter(s => s.section_id === sec.section_id);
          const secGwas = [];
          let secAtRisk = 0;
          let secHonors = 0;

          secStudents.forEach(s => {
            const myGrades = gradesByStudent[s.user_id] || [];
            const postedClassRecordIds = new Set(myGrades.map(g => g.class_record_id));
            const gradeValues = [];

            myGrades.forEach(g => {
              const val = g.effective_grade != null ? parseFloat(g.effective_grade) : parseFloat(g.computed_grade);
              if (!isNaN(val)) gradeValues.push(val);
            });

            const studentScores = scoresMap[s.user_id] || {};
            Object.keys(studentScores).forEach(cId => {
              if (!postedClassRecordIds.has(cId)) {
                const tVal = computeTentativeGrade(studentScores[cId], colMap[cId]);
                if (tVal !== null) gradeValues.push(tVal);
              }
            });

            if (gradeValues.length > 0) {
              const studentAvg = gradeValues.reduce((a, b) => a + b, 0) / gradeValues.length;
              secGwas.push(studentAvg);
              if (studentAvg <= 1.75) secHonors++;
              if (studentAvg > 3.00 || gradeValues.some(v => v > 3.00)) secAtRisk++;
            }
          });

          const secAvg = secGwas.length > 0 ? secGwas.reduce((a, b) => a + b, 0) / secGwas.length : null;
          const passingCount = secGwas.filter(g => g <= 3.00).length;
          const passRate = secGwas.length > 0 ? Math.round((passingCount / secGwas.length) * 100) : 100;

          return {
            sectionId: sec.section_id,
            name: sec.name,
            studentCount: secStudents.length,
            avgGwa: secAvg,
            passRate,
            atRiskCount: secAtRisk,
            honorsCount: secHonors
          };
        });
        setSectionMetrics(secList);

        // Generate dynamic aggregated SAGE diagnostics warnings
        const diagnostics = [];

        // A. Faculty-Dean Discussion Queue Active (Red Alert)
        if (pendingReferrals.length > 0) {
          diagnostics.push({
            id: 'diag-dean-referrals',
            type: 'error',
            order: 0,
            title: 'Faculty Discussion Queue Active',
            message: `There are ${pendingReferrals.length} student case(s) flagged by professors for direct Dean consultation.`,
            action: () => navigate('/dean/atriskstudents')
          });
        }

        // B. High Academic Risk Detected (Red Alert)
        if (highRiskCount > 0) {
          diagnostics.push({
            id: 'diag-high-academic-risk',
            type: 'error',
            order: 1,
            title: 'High Academic Risk Detected',
            message: `There are ${highRiskCount} student(s) flagged at high academic risk with failing marks (GWA > 3.00) or failing periods recorded.`,
            action: () => navigate('/dean/atriskstudents')
          });
        }

        // C. Pending Grade Resubmissions (Yellow Alert)
        if (pendingOverrides.length > 0) {
          diagnostics.push({
            id: 'diag-pending-overrides',
            type: 'warning',
            order: 2,
            title: 'Grade Resubmission Requests Pending',
            message: `There are ${pendingOverrides.length} formal remark change/resubmission request(s) awaiting Dean review.`,
            action: () => navigate('/dean/remarkoverriderequests')
          });
        }

        // D. Moderate Academic Risk Detected (Yellow Alert)
        if (moderateRiskCount > 0) {
          diagnostics.push({
            id: 'diag-moderate-academic-risk',
            type: 'warning',
            order: 3,
            title: 'Moderate Academic Risk Detected',
            message: `There are ${moderateRiskCount} student(s) flagged at moderate academic risk border-lining the passing scale (GWA 2.75 - 3.00).`,
            action: () => navigate('/dean/atriskstudents')
          });
        }

        // E. Pending Class Grade Postings (Blue Notice)
        if (pendingPosts > 0) {
          diagnostics.push({
            id: 'diag-pending-posts',
            type: 'info',
            order: 4,
            title: 'Pending Class Grade Postings',
            message: `There are ${pendingPosts} outstanding grading periods (Prelim/Midterm/Finals) awaiting submission across active classrooms.`,
            action: () => navigate('/dean/gradepostingstatus')
          });
        }

        // F. Low Academic Risk Detected (Green Success)
        if (lowRiskCount > 0) {
          diagnostics.push({
            id: 'diag-low-academic-risk',
            type: 'success',
            order: 5,
            title: 'Low Academic Risk',
            message: `Outstanding! There are ${lowRiskCount} student(s) in excellent academic standing (Low Risk / Safe).`,
            action: () => navigate('/dean/atriskstudents')
          });
        }

        diagnostics.sort((a, b) => a.order - b.order);
        setWarnings(diagnostics);
        setLoading(false);
      } catch (err) {
        console.error('Error loading Dean Dashboard data:', err);
        if (active) {
          setError(err.message || 'An error occurred while fetching live database records.');
          setLoading(false);
        }
      }
    }

    loadDashboardData();

    return () => {
      active = false;
    };
  }, [navigate, profile]);

  return (
    <>
      <PageHeader title="Academic Oversight" breadcrumb="Dean Portal" />
      
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8 max-w-7xl mx-auto w-full">
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
            {error}
          </div>
        )}

        {/* Hero Welcome & Active Term Banner */}
        <div className="bg-gradient-to-r from-sage-900 via-sage-800 to-sage-900 rounded-2xl p-4 sm:p-6 md:p-8 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-semibold bg-sage-700/50 text-sage-100 border border-sage-600/30">
              Active Term: AY {activeTerm?.school_year || '2025-2026'} • {activeTerm?.semester === '1st' ? 'First' : activeTerm?.semester === '2nd' ? 'Second' : activeTerm?.semester || 'Second'} Semester
            </span>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight font-display">Academic Oversight & Analytics</h1>
            <p className="text-xs sm:text-sm text-sage-200/90 max-w-xl">
              College performance metrics, grade distribution diagnostics, and early warning risk monitoring.
            </p>
          </div>
        </div>
        
        {/* KPI Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 md:gap-5">
          {loading ? (
            [1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center gap-2.5 sm:gap-4 animate-pulse">
                <div className="p-2.5 sm:p-3 bg-slate-100 rounded-xl w-9 h-9 sm:w-12 sm:h-12"></div>
                <div className="space-y-2 flex-1 w-full">
                  <div className="h-3 bg-slate-200 rounded w-2/3"></div>
                  <div className="h-5 sm:h-6 bg-slate-200 rounded w-1/3 mt-1"></div>
                </div>
              </div>
            ))
          ) : (
            <>
              {/* Card 1: Faculty */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center gap-2.5 sm:gap-4 hover:border-sage-300 transition-colors">
                <div className="p-2.5 sm:p-3 bg-sage-50 text-sage-700 rounded-xl">
                  <GraduationCap className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Total Faculty</p>
                  <h3 className="text-lg sm:text-2xl font-bold font-display text-slate-900 mt-0.5 sm:mt-1 font-mono">
                    {stats.facultyCount}
                  </h3>
                </div>
              </div>

              {/* Card 2: Active Classrooms */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center gap-2.5 sm:gap-4 hover:border-indigo-300 transition-colors">
                <div className="p-2.5 sm:p-3 bg-indigo-50 text-indigo-700 rounded-xl">
                  <BookOpen className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Active Classes</p>
                  <h3 className="text-lg sm:text-2xl font-bold font-display text-slate-900 mt-0.5 sm:mt-1 font-mono">
                    {stats.sectionsCount}
                  </h3>
                </div>
              </div>

              {/* Card 3: At-Risk Students */}
              <div 
                onClick={() => navigate('/dean/atriskstudents')}
                className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center gap-2.5 sm:gap-4 cursor-pointer hover:border-rose-300 transition-colors group"
              >
                <div className="p-2.5 sm:p-3 bg-rose-50 text-rose-700 rounded-xl group-hover:scale-105 transition-transform">
                  <AlertCircle className="h-5 w-5 sm:h-6 sm:w-6 animate-pulse" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">At-Risk</p>
                  <h3 className="text-lg sm:text-2xl font-bold font-display text-rose-700 mt-0.5 sm:mt-1 font-mono">
                    {stats.atRiskCount}
                  </h3>
                </div>
              </div>

              {/* Card 4: Pending Posts */}
              <div 
                onClick={() => navigate('/dean/gradepostingstatus')}
                className="bg-white border border-slate-200/90 rounded-2xl p-3.5 sm:p-5 shadow-2xs flex flex-col sm:flex-row items-start sm:items-center gap-2.5 sm:gap-4 cursor-pointer hover:border-amber-300 transition-colors group"
              >
                <div className="p-2.5 sm:p-3 bg-amber-50 text-amber-700 rounded-xl group-hover:scale-105 transition-transform">
                  <ClipboardCheck className="h-5 w-5 sm:h-6 sm:w-6" />
                </div>
                <div>
                  <p className="text-[10px] sm:text-xs text-slate-500 font-bold uppercase tracking-wider">Pending Posts</p>
                  <h3 className="text-lg sm:text-2xl font-bold font-display text-amber-700 mt-0.5 sm:mt-1 font-mono">
                    {stats.pendingPosts}
                  </h3>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── EXECUTIVE VISUAL ANALYTICS & CHARTS SUITE ── */}
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-200/60">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold font-display text-slate-950 uppercase tracking-wide flex items-center gap-2">
                <Activity className="h-5 w-5 text-sage-600" /> Academic Analytics &amp; Intelligence Suite
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Multi-term trajectory modeling, standing demographics, grade histogram, and comparative section health.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => navigate('/dean/gradedistribution')}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                Detailed Distribution <ArrowRight className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => navigate('/dean/atriskstudents')}
                className="px-3 py-1.5 bg-sage-600 hover:bg-sage-700 text-white text-xs font-semibold rounded-xl border border-sage-700 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                At-Risk Roster <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Chart Row 1: Line Chart (8 Cols) + Donut / Pie Chart (4 Cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch">
            {/* Chart 1: Multi-Term Trajectory Line Chart */}
            <div className="lg:col-span-8 bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
              <AcademicTrajectoryLineChart trajectoryData={trajectoryData} />
            </div>

            {/* Chart 2: College Academic Health Donut / Pie Chart */}
            <div className="lg:col-span-4 bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
              <AcademicHealthDonutChart distribution={healthDistribution} />
            </div>
          </div>

          {/* Chart Row 2: Vertical Histogram (6 Cols) + Section Comparison (6 Cols) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-stretch">
            {/* Chart 3: Grade Distribution Histogram */}
            <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
              <GradeDistributionHistogram brackets={histogramBrackets} />
            </div>

            {/* Chart 4: Section Performance & Risk Index Bar Chart */}
            <div className="lg:col-span-6 bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-2xs flex flex-col justify-between hover:border-slate-300 transition-colors">
              <SectionPerformanceBarChart 
                sections={sectionMetrics} 
                onSelectSection={() => navigate('/dean/gradedistribution')}
              />
            </div>
          </div>

          {/* Operational Compliance & Submission Pipeline Strip */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-6 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-xs font-bold font-display text-slate-900 uppercase tracking-wide flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-indigo-600" /> Department Operational Compliance &amp; Faculty Pipeline
                </h3>
                <p className="text-[11px] text-slate-500">
                  Tracking grade submission timeliness and student evaluation response thresholds.
                </p>
              </div>
              <button
                onClick={() => navigate('/dean/atriskstudents')}
                className="text-xs font-semibold text-sage-700 hover:text-sage-900 flex items-center gap-1 cursor-pointer self-start sm:self-auto"
              >
                Discussion Queue <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 pt-1">
              {/* Metric A: Grade Submission Pipeline */}
              <div className="p-3.5 bg-slate-50/70 border border-slate-200/60 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <ClipboardCheck className="h-4 w-4 text-indigo-600" /> Grade Submission Pipeline
                  </span>
                  <span className="font-mono font-bold text-indigo-900 text-sm">{analytics.submissionRate}%</span>
                </div>
                
                <div className="h-2.5 w-full bg-slate-200/70 rounded-full overflow-hidden">
                  <div 
                    style={{ width: `${analytics.submissionRate}%` }}
                    className={`h-full rounded-full transition-all duration-500 ${
                      analytics.submissionRate >= 80 ? 'bg-emerald-500' : analytics.submissionRate >= 50 ? 'bg-amber-400' : 'bg-rose-500'
                    }`}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>{analytics.postedCount} periods recorded</span>
                  <span className="font-medium text-amber-700">{stats.pendingPosts} outstanding</span>
                </div>
              </div>

              {/* Metric B: Faculty Intervention Coverage */}
              <div className="p-3.5 bg-slate-50/70 border border-slate-200/60 rounded-xl space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <UserCheck className="h-4 w-4 text-emerald-600" /> Faculty Intervention Coverage
                  </span>
                  <span className="font-mono font-bold text-emerald-900 text-sm">{analytics.interventionCoverageRate}%</span>
                </div>
                
                <div className="h-2.5 w-full bg-slate-200/70 rounded-full overflow-hidden">
                  <div 
                    style={{ width: `${analytics.interventionCoverageRate}%` }}
                    className={`h-full rounded-full transition-all duration-500 ${
                      analytics.interventionCoverageRate >= 80 ? 'bg-emerald-500' : analytics.interventionCoverageRate >= 50 ? 'bg-amber-400' : 'bg-rose-500'
                    }`}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>{analytics.totalEvaluatedCount} evaluations recorded</span>
                  <span className="font-medium text-sage-800">{analytics.pendingReferralsCount} in discussion queue</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── LOWER SPLIT: SHORTCUTS & DIAGNOSTICS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Quick links & navigation */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold font-display text-slate-950 uppercase tracking-wide border-b border-slate-100 pb-3">
                Quick Portal Shortcuts
              </h3>
              
              <div className="flex flex-col gap-2.5">
                <button 
                  onClick={() => navigate('/dean/gradepostingstatus')}
                  className="w-full p-3 bg-slate-50 hover:bg-sage-50 border border-slate-200/60 rounded-xl text-left text-xs font-semibold text-slate-700 hover:text-sage-900 transition-all flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <ClipboardCheck className="h-4 w-4 text-sage-600" /> Grade Posting Overview
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>

                <button 
                  onClick={() => navigate('/dean/gradedistribution')}
                  className="w-full p-3 bg-slate-50 hover:bg-sage-50 border border-slate-200/60 rounded-xl text-left text-xs font-semibold text-slate-700 hover:text-sage-900 transition-all flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-sage-600" /> Grade Distribution Analysis
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>

                <button 
                  onClick={() => navigate('/dean/remarkoverriderequests')}
                  className="w-full p-3 bg-slate-50 hover:bg-sage-50 border border-slate-200/60 rounded-xl text-left text-xs font-semibold text-slate-700 hover:text-sage-900 transition-all flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-sage-600" /> Grade Resubmission Requests
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>

                <button 
                  onClick={() => navigate('/dean/atriskstudents')}
                  className="w-full p-3 bg-slate-50 hover:bg-sage-50 border border-slate-200/60 rounded-xl text-left text-xs font-semibold text-slate-700 hover:text-sage-900 transition-all flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-sage-600" /> At-Risk Students Ledger
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>

                <button 
                  onClick={() => navigate('/dean/summaryreports')}
                  className="w-full p-3 bg-slate-50 hover:bg-sage-50 border border-slate-200/60 rounded-xl text-left text-xs font-semibold text-slate-700 hover:text-sage-900 transition-all flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-sage-600" /> Generate Summary Reports
                  </span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Performance diagnostics */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold font-display text-slate-950 uppercase tracking-wide flex items-center gap-1.5">
                  <BrainCircuit className="h-4 w-4 text-sage-600" /> Performance Predictions &amp; Warnings
                </h3>
                <span className="text-[10px] bg-sage-50 border border-sage-100 text-sage-700 px-2 py-0.5 rounded-full font-mono font-medium">
                  Diagnostics Monitor
                </span>
              </div>

              <div className="space-y-3.5 max-h-[350px] overflow-y-auto pr-1">
                {loading ? (
                  [1, 2, 3].map((i) => (
                    <div key={i} className="p-4 bg-slate-50 border border-slate-100 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-pulse">
                      <div className="space-y-2 flex-1">
                        <div className="h-3 bg-slate-200 rounded w-1/4"></div>
                        <div className="h-4 bg-slate-200 rounded w-3/4 mt-1"></div>
                      </div>
                      <div className="h-4 bg-slate-200 rounded w-12 self-start sm:self-auto"></div>
                    </div>
                  ))
                ) : warnings.length > 0 ? (
                  warnings.map((warn) => (
                    <div 
                      key={warn.id}
                      className={`p-4 border rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors text-left ${
                        warn.type === 'error' 
                          ? 'bg-rose-50 border-rose-200 text-rose-800' 
                          : warn.type === 'warning'
                          ? 'bg-amber-50 border-amber-200 text-amber-800'
                          : warn.type === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-sky-50 border-sky-200 text-sky-800'
                      }`}
                    >
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                          {warn.type === 'success' ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                          ) : warn.type === 'info' ? (
                            <ClipboardCheck className="h-4 w-4 text-sky-700" />
                          ) : warn.type === 'error' ? (
                            <AlertCircle className="h-4 w-4 text-rose-700" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-amber-700" />
                          )}
                          {warn.title}
                        </h4>
                        <p className="text-xs opacity-90 leading-relaxed font-normal">
                          {warn.message}
                        </p>
                      </div>
                      
                      <button 
                        onClick={warn.action}
                        className="px-3 py-1.5 bg-white border border-current text-xs font-semibold rounded-lg hover:bg-slate-50 transition-colors shrink-0 self-start sm:self-center cursor-pointer"
                      >
                        Inspect
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-slate-400 text-xs">
                    No active warnings. All academic metrics are operating within normal parameters.
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
