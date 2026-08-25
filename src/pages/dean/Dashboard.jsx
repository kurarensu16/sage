import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Users, 
  BookOpen, 
  AlertCircle, 
  ClipboardCheck, 
  ArrowRight, 
  FileText, 
  GraduationCap, 
  TrendingUp,
  CheckCircle2,
  BrainCircuit,
  BarChart3,
  PieChart,
  Clock,
  Sparkles,
  ShieldAlert
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { getTransmutedGrade } from '../../lib/gradingMath';

// ── Risk classification ───────────────────────────────────────────────────────
function classifyRisk(avgGwa, failingCount) {
  if (failingCount > 0 || avgGwa > 3.00) {
    return {
      severity: 'high',
      advisory: 'Immediate academic counselor intervention advised. Failing marks recorded.',
    };
  }
  if (avgGwa >= 2.75 && avgGwa <= 3.00) {
    return {
      severity: 'medium',
      advisory: 'Provide tutoring support. Running GWA is border-lining the passing scale.',
    };
  }
  return {
    severity: 'low',
    advisory: 'Good academic standing. Maintain current study patterns.',
  };
}

// Compute tentative GWA for a class record from its scores
function computeTentativeGrade(classRecordScores, classRecordCols) {
  const terms = ['Prelim', 'Midterm', 'Semi-Final', 'Final'];
  const termRatings = {};
  
  terms.forEach(term => {
    const tSc = classRecordScores?.[term];
    if (!tSc || (tSc.act1 == null && tSc.act2 == null && tSc.act3 == null && tSc.act4 == null && tSc.act5 == null && tSc.act6 == null && tSc.char_rating == null && tSc.exam == null)) {
      return;
    }
    
    const tMx = classRecordCols?.[term] || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, exam: 40 };
    
    const csSum = (tSc.act1 || 0) + (tSc.act2 || 0) + (tSc.act3 || 0) + (tSc.act4 || 0) + (tSc.act5 || 0) + (tSc.act6 || 0);
    const csMax = (tMx.act1 || 20) + (tMx.act2 || 20) + (tMx.act3 || 20) + (tMx.act4 || 20) + (tMx.act5 || 20) + (tMx.act6 || 10);
    
    const csPercent = csMax > 0 ? (csSum / csMax) * 50 : 0;
    const charPercent = (tSc.char_rating || 0) * 0.1;
    const examPercent = (tMx.exam || 40) > 0 ? ((tSc.exam || 0) / tMx.exam) * 40 : 0;
    
    termRatings[term] = Math.min(100, Math.max(0, Math.round(csPercent + charPercent + examPercent)));
  });
  
  const hasPrelim = termRatings['Prelim'] !== undefined;
  const hasMidterm = termRatings['Midterm'] !== undefined;
  const hasSF = termRatings['Semi-Final'] !== undefined;
  const hasFinal = termRatings['Final'] !== undefined;
  
  let finalSG = null;
  if (hasPrelim && hasMidterm && hasSF && hasFinal) {
    const mr = Math.round((termRatings['Prelim'] + termRatings['Midterm']) / 2);
    const tfr = Math.round((termRatings['Semi-Final'] + termRatings['Final']) / 2);
    finalSG = Math.round((mr + tfr) / 2);
  } else {
    const available = Object.values(termRatings);
    if (available.length > 0) {
      finalSG = Math.round(available.reduce((sum, val) => sum + val, 0) / available.length);
    }
  }
  
  if (finalSG === null) return null;
  return getTransmutedGrade(finalSG);
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
    expectedCount: 0,
    evalResponseRate: 0,
    totalEvalResponses: 0,
    totalEvalSeats: 0
  });

  const [warnings, setWarnings] = useState([]);
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
          { data: scoreData, error: sErr },
          { data: colData, error: colErr },
          { data: winData, error: winErr },
          { data: enrollments, error: enrolErr }
        ] = await Promise.all([
          supabase.from('academic_terms').select('term_id, school_year, semester').eq('is_active', true).maybeSingle(),
          supabase.from('users').select('user_id, role, first_name, last_name, section_id, department_id'),
          supabase.from('class_records').select('class_record_id, section_id, faculty_id, term_id, school_year, semester').eq('status', 'active').in('section_id', sectionIds),
          supabase.from('posted_grades').select('class_record_id, student_id, grade_period, computed_grade, effective_grade'),
          supabase.from('student_term_scores').select('student_id, class_record_id, term, act1, act2, act3, act4, act5, act6, char_rating, exam'),
          supabase.from('class_grading_columns').select('class_record_id, term, act1_max, act2_max, act3_max, act4_max, act5_max, act6_max, exam_max'),
          supabase.from('evaluation_windows').select('window_id, is_closed, section_id, evaluation_responses(response_id)').in('section_id', sectionIds),
          supabase.from('enrollments').select('section_id, student_id').in('section_id', sectionIds)
        ]);

        if (usersErr) throw usersErr;
        if (classroomsErr) throw classroomsErr;
        if (postedGradesErr) throw postedGradesErr;
        if (winErr) throw winErr;
        if (enrolErr) throw enrolErr;

        if (!active) return;

        const activeTerm = termData;

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

            const { severity } = classifyRisk(avgGwa, failingCount);
            if (severity === 'high') {
              highRiskCount++;
            } else if (severity === 'medium') {
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

        // 4. Evaluation metrics engagement
        const studentsPerSection = {};
        (enrollments || []).forEach(e => {
          if (!studentsPerSection[e.section_id]) {
            studentsPerSection[e.section_id] = new Set();
          }
          studentsPerSection[e.section_id].add(e.student_id);
        });

        const activeSectionIds = new Set(classroomsFiltered.map(c => c.section_id));
        const winDataFiltered = (winData || []).filter(w => activeSectionIds.has(w.section_id));

        let lowEvalEngagementCount = 0;
        let highEvalEngagementCount = 0;
        let totalSeats = 0;
        let totalResponses = 0;

        winDataFiltered.forEach(w => {
          const totalStudents = studentsPerSection[w.section_id] ? studentsPerSection[w.section_id].size : 0;
          const responsesCount = w.evaluation_responses ? w.evaluation_responses.length : 0;
          totalSeats += totalStudents;
          totalResponses += responsesCount;

          if (totalStudents > 0) {
            const rate = responsesCount / totalStudents;
            if (rate < 0.5) {
              lowEvalEngagementCount++;
            } else if (rate >= 0.8) {
              highEvalEngagementCount++;
            }
          }
        });

        const evalResponseRate = totalSeats > 0 ? Math.round((totalResponses / totalSeats) * 100) : 0;

        setAnalytics({
          collegeAvgGwa: collegeAvg,
          totalStudents: deptStudents.length,
          gwaDistribution: gwaDist,
          submissionRate,
          postedCount: totalPostedPeriods,
          expectedCount: totalExpectedPosts,
          evalResponseRate,
          totalEvalResponses: totalResponses,
          totalEvalSeats: totalSeats
        });

        // Generate dynamic aggregated SAGE diagnostics warnings
        const diagnostics = [];

        // A. High Academic Risk Detected (Red Alert 🔴)
        if (highRiskCount > 0) {
          diagnostics.push({
            id: 'diag-high-academic-risk',
            type: 'error',
            order: 0,
            title: 'High Academic Risk Detected',
            message: `There are ${highRiskCount} student(s) flagged at high academic risk with failing marks (GWA > 3.00) or failing periods recorded.`,
            action: () => navigate('/dean/atriskstudents')
          });
        }

        // B. Moderate Academic Risk Detected (Yellow Alert 🟡)
        if (moderateRiskCount > 0) {
          diagnostics.push({
            id: 'diag-moderate-academic-risk',
            type: 'warning',
            order: 1,
            title: 'Moderate Academic Risk Detected',
            message: `There are ${moderateRiskCount} student(s) flagged at moderate academic risk border-lining the passing scale (GWA 2.75 - 3.00).`,
            action: () => navigate('/dean/atriskstudents')
          });
        }

        // C. Low Evaluation Engagement (Yellow Alert 🟡)
        if (lowEvalEngagementCount > 0) {
          diagnostics.push({
            id: 'diag-low-evaluation-engagement',
            type: 'warning',
            order: 2,
            title: 'Low Evaluation Engagement',
            message: `There are ${lowEvalEngagementCount} class evaluation(s) with response rates below the 50% participation threshold.`,
            action: () => navigate('/dean/evalresultsoverview')
          });
        }

        // D. Low Academic Risk Detected (Green Success 🟢)
        if (lowRiskCount > 0) {
          diagnostics.push({
            id: 'diag-low-academic-risk',
            type: 'success',
            order: 3,
            title: 'Low Academic Risk',
            message: `Outstanding! There are ${lowRiskCount} student(s) in excellent academic standing (Low Risk / Safe).`,
            action: () => navigate('/dean/atriskstudents')
          });
        }

        // E. High Evaluation Engagement (Green Success 🟢)
        if (highEvalEngagementCount > 0) {
          diagnostics.push({
            id: 'diag-high-evaluation-engagement',
            type: 'success',
            order: 4,
            title: 'High Evaluation Engagement',
            message: `Outstanding! There are ${highEvalEngagementCount} class evaluation(s) with high student participation (>= 80% response rate).`,
            action: () => navigate('/dean/evalresultsoverview')
          });
        }

        // F. Pending Class Grade Postings (Blue Notice 🔵)
        if (pendingPosts > 0) {
          diagnostics.push({
            id: 'diag-pending-posts',
            type: 'info',
            order: 5,
            title: 'Pending Class Grade Postings',
            message: `There are ${pendingPosts} outstanding grading periods (Prelim/Midterm/Finals) awaiting submission across active classrooms.`,
            action: () => navigate('/dean/gradepostingstatus')
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

  const { gwaDistribution } = analytics;
  const distTotal = gwaDistribution.total || 1;

  const pctExcellent = Math.round((gwaDistribution.excellent / distTotal) * 100);
  const pctGood = Math.round((gwaDistribution.good / distTotal) * 100);
  const pctPassing = Math.round((gwaDistribution.passing / distTotal) * 100);
  const pctFailing = Math.round((gwaDistribution.failing / distTotal) * 100);

  return (
    <>
      <PageHeader title="Academic Oversight" breadcrumb="Dean Portal" />
      
      <div className="p-8 overflow-y-auto flex-1 space-y-8 max-w-7xl mx-auto w-full">
        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs">
            {error}
          </div>
        )}
        
        {/* KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {loading ? (
            [1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4 animate-pulse">
                <div className="p-3 bg-slate-100 rounded-lg w-12 h-12"></div>
                <div className="space-y-2 flex-1">
                  <div className="h-3 bg-slate-200 rounded w-2/3"></div>
                  <div className="h-6 bg-slate-200 rounded w-1/3 mt-1"></div>
                </div>
              </div>
            ))
          ) : (
            <>
              {/* Card 1: Faculty */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4 hover:border-sage-300 transition-colors">
                <div className="p-3 bg-sage-50 text-sage-700 rounded-lg">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Total Faculty</p>
                  <h3 className="text-2xl font-bold font-display text-slate-900 mt-1 font-mono">
                    {stats.facultyCount}
                  </h3>
                </div>
              </div>

              {/* Card 2: Active Classrooms */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4 hover:border-indigo-300 transition-colors">
                <div className="p-3 bg-indigo-50 text-indigo-700 rounded-lg">
                  <BookOpen className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Active Classrooms</p>
                  <h3 className="text-2xl font-bold font-display text-slate-900 mt-1 font-mono">
                    {stats.sectionsCount}
                  </h3>
                </div>
              </div>

              {/* Card 3: At-Risk Students */}
              <div 
                onClick={() => navigate('/dean/atriskstudents')}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4 cursor-pointer hover:border-rose-300 transition-colors group"
              >
                <div className="p-3 bg-rose-50 text-rose-700 rounded-lg group-hover:scale-105 transition-transform">
                  <AlertCircle className="h-6 w-6 animate-pulse" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">At-Risk Students</p>
                  <h3 className="text-2xl font-bold font-display text-rose-700 mt-1 font-mono">
                    {stats.atRiskCount}
                  </h3>
                </div>
              </div>

              {/* Card 4: Pending Posts */}
              <div 
                onClick={() => navigate('/dean/gradepostingstatus')}
                className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-center gap-4 cursor-pointer hover:border-amber-300 transition-colors group"
              >
                <div className="p-3 bg-amber-50 text-amber-700 rounded-lg group-hover:scale-105 transition-transform">
                  <ClipboardCheck className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Pending Grade Posts</p>
                  <h3 className="text-2xl font-bold font-display text-amber-700 mt-1 font-mono">
                    {stats.pendingPosts}
                  </h3>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── NEW VISUAL ANALYTICS INTELLIGENCE ROW (CHARTS) ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          
          {/* Chart 1: College-Wide Academic Health & GWA Distribution (8 Cols) */}
          <div className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-3">
              <div>
                <h3 className="text-sm font-bold font-display text-slate-900 uppercase tracking-wide flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-sage-600" /> College Academic Performance &amp; GWA Distribution
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time academic standing breakdown across {analytics.totalStudents} evaluated college students.
                </p>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="block text-[10px] uppercase font-bold text-slate-400">College Avg GWA</span>
                  <span className="text-lg font-bold font-mono text-sage-800">{analytics.collegeAvgGwa}</span>
                </div>
                <button
                  onClick={() => navigate('/dean/gradedistribution')}
                  className="px-3 py-1.5 bg-sage-50 hover:bg-sage-100 text-sage-700 text-xs font-semibold rounded-lg border border-sage-200 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  Deep Dive <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Segmented Performance Progress Bar */}
            <div className="py-6 space-y-3">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-600">Performance Bracket Composition</span>
                <span className="text-slate-400 font-mono font-medium">{gwaDistribution.total} Graded Students</span>
              </div>
              
              {/* Multi-segment Progress Bar */}
              <div className="h-5 w-full bg-slate-100 rounded-full overflow-hidden flex p-0.5 shadow-inner">
                {pctExcellent > 0 && (
                  <div 
                    style={{ width: `${pctExcellent}%` }} 
                    className="bg-emerald-500 h-full rounded-l-full transition-all duration-500 hover:opacity-90"
                    title={`Dean's List / Excellent: ${gwaDistribution.excellent} (${pctExcellent}%)`}
                  />
                )}
                {pctGood > 0 && (
                  <div 
                    style={{ width: `${pctGood}%` }} 
                    className="bg-sage-600 h-full transition-all duration-500 hover:opacity-90"
                    title={`Good Standing: ${gwaDistribution.good} (${pctGood}%)`}
                  />
                )}
                {pctPassing > 0 && (
                  <div 
                    style={{ width: `${pctPassing}%` }} 
                    className="bg-amber-400 h-full transition-all duration-500 hover:opacity-90"
                    title={`Borderline Passing: ${gwaDistribution.passing} (${pctPassing}%)`}
                  />
                )}
                {pctFailing > 0 && (
                  <div 
                    style={{ width: `${pctFailing}%` }} 
                    className="bg-rose-500 h-full rounded-r-full transition-all duration-500 hover:opacity-90"
                    title={`High Risk / Failing: ${gwaDistribution.failing} (${pctFailing}%)`}
                  />
                )}
              </div>

              {/* Bracket Details Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3">
                <div className="p-3 bg-emerald-50/60 border border-emerald-100 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-[10px] font-bold text-emerald-900 uppercase">1.00 – 1.75</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-bold font-mono text-emerald-900">{gwaDistribution.excellent}</span>
                    <span className="text-[10px] font-semibold text-emerald-700">{pctExcellent}%</span>
                  </div>
                  <span className="text-[9px] text-emerald-700 block truncate">Dean's Honors</span>
                </div>

                <div className="p-3 bg-sage-50/60 border border-sage-200/60 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-sage-600" />
                    <span className="text-[10px] font-bold text-sage-900 uppercase">2.00 – 2.50</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-bold font-mono text-sage-900">{gwaDistribution.good}</span>
                    <span className="text-[10px] font-semibold text-sage-700">{pctGood}%</span>
                  </div>
                  <span className="text-[9px] text-sage-700 block truncate">Good Standing</span>
                </div>

                <div className="p-3 bg-amber-50/60 border border-amber-100 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span className="text-[10px] font-bold text-amber-900 uppercase">2.75 – 3.00</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-bold font-mono text-amber-900">{gwaDistribution.passing}</span>
                    <span className="text-[10px] font-semibold text-amber-700">{pctPassing}%</span>
                  </div>
                  <span className="text-[9px] text-amber-700 block truncate">Borderline</span>
                </div>

                <div className="p-3 bg-rose-50/60 border border-rose-100 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    <span className="text-[10px] font-bold text-rose-900 uppercase">&gt; 3.00 / FDA</span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-base font-bold font-mono text-rose-900">{gwaDistribution.failing}</span>
                    <span className="text-[10px] font-semibold text-rose-700">{pctFailing}%</span>
                  </div>
                  <span className="text-[9px] text-rose-700 block truncate">At Risk</span>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-[11px] text-slate-500">
              <span className="flex items-center gap-1 text-emerald-700 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {pctExcellent + pctGood}% of students are in good academic standing.
              </span>
              <span className="font-mono text-slate-400">Scale: 1.00 Max → 5.00 Fail</span>
            </div>
          </div>

          {/* Chart 2: Department Compliance & Engagement Hub (4 Cols) */}
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-6">
            <div>
              <h3 className="text-sm font-bold font-display text-slate-900 uppercase tracking-wide flex items-center gap-2 border-b border-slate-100 pb-3">
                <PieChart className="h-4 w-4 text-sage-600" /> Department Compliance
              </h3>
            </div>

            {/* Metric A: Grade Submission Compliance */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <ClipboardCheck className="h-3.5 w-3.5 text-indigo-600" /> Grade Submission Pipeline
                </span>
                <span className="font-mono font-bold text-indigo-900">{analytics.submissionRate}%</span>
              </div>
              
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  style={{ width: `${analytics.submissionRate}%` }}
                  className={`h-full rounded-full transition-all duration-500 ${
                    analytics.submissionRate >= 80 ? 'bg-emerald-500' : analytics.submissionRate >= 50 ? 'bg-amber-400' : 'bg-rose-500'
                  }`}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>{analytics.postedCount} periods submitted</span>
                <span>{stats.pendingPosts} pending</span>
              </div>
            </div>

            {/* Metric B: Student Evaluation Participation */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700 flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5 text-sage-600" /> Evaluation Response Rate
                </span>
                <span className="font-mono font-bold text-sage-900">{analytics.evalResponseRate}%</span>
              </div>
              
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                <div 
                  style={{ width: `${analytics.evalResponseRate}%` }}
                  className={`h-full rounded-full transition-all duration-500 ${
                    analytics.evalResponseRate >= 80 ? 'bg-emerald-500' : analytics.evalResponseRate >= 50 ? 'bg-sage-600' : 'bg-amber-500'
                  }`}
                />
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>{analytics.totalEvalResponses} responses submitted</span>
                <span>{analytics.totalEvalSeats} total seats</span>
              </div>
            </div>

            {/* Compliance Footer Link */}
            <button
              onClick={() => navigate('/dean/evalresultsoverview')}
              className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              Faculty Evaluation Rankings <ArrowRight className="h-3 w-3" />
            </button>
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
                  onClick={() => navigate('/dean/evalresultsoverview')}
                  className="w-full p-3 bg-slate-50 hover:bg-sage-50 border border-slate-200/60 rounded-xl text-left text-xs font-semibold text-slate-700 hover:text-sage-900 transition-all flex items-center justify-between cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-sage-600" /> Faculty Evaluation Ratings
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
