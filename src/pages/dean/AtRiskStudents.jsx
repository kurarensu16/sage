import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Search, AlertCircle, Sparkles, Building2, Loader2, AlertTriangle, 
  Bell, Check, Award, MessageSquare, TrendingUp, CheckCircle2, 
  Clock, AlertOctagon, X, FileText, ShieldAlert
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { dispatchNotifications } from '../../lib/notificationDispatcher';
import { showLocalNotification } from '../../lib/notificationService';
import { getTransmutedGrade } from '../../lib/gradingMath';
import { calculateAcademicRisk, calculateInterventionOutcome } from '../../lib/riskEngine';
import { cn } from '../../lib/utils';

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

function SeverityBadge({ severity, score }) {
  if (severity === 'critical' || severity === 'high') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
        <AlertOctagon className="h-3 w-3 text-rose-500" />
        <span>{severity === 'critical' ? 'Critical Risk' : 'High Risk'}</span>
        {typeof score === 'number' && <span className="font-mono text-[10px] opacity-75">({score})</span>}
      </span>
    );
  }
  if (severity === 'moderate' || severity === 'medium') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
        <AlertTriangle className="h-3 w-3 text-amber-500" />
        <span>Moderate Risk</span>
        {typeof score === 'number' && <span className="font-mono text-[10px] opacity-75">({score})</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
      <span>Low Risk / Clear</span>
      {typeof score === 'number' && <span className="font-mono text-[10px] opacity-75">({score})</span>}
    </span>
  );
}

export default function AtRiskStudents() {
  const { user, profile } = useAuth();

  const [students, setStudents] = useState([]);
  const [sections, setSections] = useState([]);
  const [rawEvaluations, setRawEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [alertSentMap, setAlertSentMap] = useState({});

  // ASPIRE v3.1 Navigation Tabs:
  // 'tier1_at_risk' | 'tier2_pl_risk' | 'discussion_queue' | 'outcomes_tracker'
  const [activeTab, setActiveTab] = useState('tier1_at_risk');
  const [severityFilter, setSeverityFilter] = useState('');
  const [sectionFilter, setSectionFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Dean Review & Action Modal state
  const [selectedQueueItem, setSelectedQueueItem] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deanNotes, setDeanNotes] = useState('');
  const [deanActionType, setDeanActionType] = useState('conference');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  const handleAlertStudent = async (student) => {
    try {
      const gwaText = student.runningGwa !== null ? student.runningGwa.toFixed(2) : 'Under Evaluation';
      
      await showLocalNotification({
        title: 'Academic Notice Dispatched',
        body: `Sent Early Warning advisory to ${student.firstName} ${student.lastName} (${student.section}).`
      });

      await dispatchNotifications([
        {
          recipient_id: student.id,
          type: 'ews_alert',
          message: `Academic Early Warning: You have received an early warning academic advisory with running GWA ${gwaText}. Please consult your department chair or college advisor.`
        },
        {
          recipient_id: user?.id,
          type: 'risk_threshold',
          message: `At-Risk Student Flagged: Issued academic advisory for ${student.firstName} ${student.lastName} (${student.section}) with running GWA ${gwaText}.`
        }
      ].filter(n => Boolean(n.recipient_id)));

      setAlertSentMap(prev => ({ ...prev, [student.id]: true }));
      setTimeout(() => {
        setAlertSentMap(prev => ({ ...prev, [student.id]: false }));
      }, 4000);
    } catch (err) {
      console.error('Failed to dispatch EWS alert:', err);
    }
  };

  const handleOpenReview = (item) => {
    setSelectedQueueItem(item);
    setDeanNotes('');
    setDeanActionType('conference');
    setIsModalOpen(true);
  };

  const handleSaveDeanReview = async () => {
    if (!selectedQueueItem) return;
    setIsSubmittingAction(true);
    try {
      const isResolving = deanActionType === 'resolved';
      const requiresTutoring = deanActionType === 'tutoring' || selectedQueueItem.requires_tutoring;

      const { error: updateErr } = await supabase
        .from('student_risk_evaluations')
        .update({
          refer_to_dean: isResolving ? false : true,
          requires_tutoring: requiresTutoring,
          status: isResolving ? 'acknowledged_by_student' : selectedQueueItem.status,
          updated_at: new Date().toISOString()
        })
        .eq('evaluation_id', selectedQueueItem.evaluation_id);

      if (updateErr) throw updateErr;

      const actionLabel = 
        deanActionType === 'conference' ? 'Dean Academic Conference Scheduled' :
        deanActionType === 'tutoring' ? 'Dean Approved Remedial / Peer Tutoring' :
        deanActionType === 'advisory' ? 'Official Dean Academic Warning Issued' :
        'Dean Escalation Directives Issued & Handled';

      await dispatchNotifications([
        {
          recipient_id: selectedQueueItem.faculty_id,
          type: 'academic_notice',
          message: `${actionLabel} for ${selectedQueueItem.studentName} (${selectedQueueItem.subjectCode || 'Class'}). Directives: ${deanNotes || 'Case reviewed by Dean.'}`
        },
        {
          recipient_id: selectedQueueItem.student_id,
          type: 'ews_alert',
          message: `Office of the Dean notice: ${actionLabel}. Directives: ${deanNotes || 'Please consult your Department Chair.'}`
        },
        {
          recipient_id: user?.id,
          type: 'academic_notice',
          message: `Processed Discussion Queue item for ${selectedQueueItem.studentName}.`
        }
      ].filter(n => Boolean(n.recipient_id)));

      await showLocalNotification({
        title: 'Dean Directives Recorded',
        body: `Directives recorded for ${selectedQueueItem.studentName}.`
      });

      // Update local state
      setRawEvaluations(prev => prev.map(ev => {
        if (ev.evaluation_id === selectedQueueItem.evaluation_id) {
          return {
            ...ev,
            refer_to_dean: isResolving ? false : true,
            requires_tutoring: requiresTutoring
          };
        }
        return ev;
      }));

      setIsModalOpen(false);
      setSelectedQueueItem(null);
    } catch (err) {
      console.error('Failed to submit Dean review:', err);
      alert('Failed to save Dean review: ' + err.message);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  useEffect(() => {
    if (!profile?.department_id) return;
    let cancelled = false;

    async function load() {
      try {
        // Step 1: Sections in dean's college
        const { data: deptSections, error: secErr } = await supabase
          .from('sections')
          .select('section_id, name')
          .eq('department_id', profile.department_id)
          .order('name');

        if (secErr) throw secErr;

        const sectionIds = (deptSections || []).map(s => s.section_id);
        if (!cancelled) setSections(deptSections || []);

        if (sectionIds.length === 0) {
          if (!cancelled) { setStudents([]); setLoading(false); }
          return;
        }

        // Step 2: Students in the college
        const { data: studentData, error: stuErr } = await supabase
          .from('users')
          .select(`
            user_id,
            first_name,
            last_name,
            email,
            section_id,
            sections ( name, department_id )
          `)
          .eq('role', 'student')
          .in('section_id', sectionIds)
          .order('last_name');

        if (stuErr) throw stuErr;
        const studentIds = (studentData || []).map(s => s.user_id);

        // Step 3: Posted grades
        const { data: gradeData, error: gErr } = await supabase
          .from('posted_grades')
          .select(`
            posted_grade_id,
            student_id,
            grade_period,
            computed_grade,
            effective_grade,
            remarks,
            class_record_id,
            class_records (
              subjects ( code, name )
            )
          `)
          .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']);

        if (gErr) throw gErr;

        // Step 3.5: Student term scores and grading columns for tentative grade calculations
        const { data: scoreData } = await supabase
          .from('student_term_scores')
          .select('student_id, class_record_id, term, act1, act2, act3, act4, act5, act6, char_rating, exam')
          .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']);

        const { data: colData } = await supabase
          .from('class_grading_columns')
          .select('class_record_id, term, act1_max, act2_max, act3_max, act4_max, act5_max, act6_max, exam_max');

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

        const scoresMap = {};
        (scoreData || []).forEach(s => {
          if (!scoresMap[s.student_id]) scoresMap[s.student_id] = {};
          if (!scoresMap[s.student_id][s.class_record_id]) scoresMap[s.student_id][s.class_record_id] = {};
          scoresMap[s.student_id][s.class_record_id][s.term] = s;
        });

        // Step 4: AI Insights
        const { data: aiData } = await supabase
          .from('student_academic_insights')
          .select('student_id, verdict, summary')
          .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000']);

        const aiMap = {};
        (aiData || []).forEach(r => { 
          aiMap[r.student_id] = {
            student_id: r.student_id,
            recommendation: r.verdict,
            summary: r.summary
          }; 
        });

        // Step 4.5: ASPIRE v3.1 Student Risk Evaluations with faculty and class info
        const { data: evalRecords, error: evalErr } = await supabase
          .from('student_risk_evaluations')
          .select(`
            *,
            faculty:users!faculty_id ( first_name, last_name, email ),
            class_record:class_records (
              class_record_id,
              subjects ( code, name ),
              sections ( name )
            )
          `)
          .in('student_id', studentIds.length > 0 ? studentIds : ['00000000-0000-0000-0000-000000000000'])
          .order('created_at', { ascending: false });

        if (evalErr) console.warn('Could not fetch student_risk_evaluations:', evalErr);
        if (!cancelled) setRawEvaluations(evalRecords || []);

        const evalByStudent = {};
        (evalRecords || []).forEach(ev => {
          if (!evalByStudent[ev.student_id]) evalByStudent[ev.student_id] = [];
          evalByStudent[ev.student_id].push(ev);
        });

        // Step 5: Aggregate per student
        const gradesByStudent = {};
        (gradeData || []).forEach(g => {
          if (!gradesByStudent[g.student_id]) gradesByStudent[g.student_id] = [];
          gradesByStudent[g.student_id].push(g);
        });

        const enriched = (studentData || []).map(s => {
          const myGrades = gradesByStudent[s.user_id] || [];
          const postedClassRecordIds = new Set(myGrades.map(g => g.class_record_id));
          
          const subjectGradeList = [];
          let containsTentative = false;

          // Posted grades
          myGrades.forEach(g => {
            const val = g.effective_grade != null ? parseFloat(g.effective_grade) : parseFloat(g.computed_grade);
            if (!isNaN(val)) {
              subjectGradeList.push({
                subjectCode: g.class_records?.subjects?.code || 'SUBJ',
                subjectName: g.class_records?.subjects?.name || 'Subject',
                val,
                isTentative: false
              });
            }
          });

          // Tentative draft scores
          const studentScores = scoresMap[s.user_id] || {};
          Object.keys(studentScores).forEach(classRecId => {
            if (!postedClassRecordIds.has(classRecId)) {
              const classRecordScores = studentScores[classRecId];
              const classRecordCols = colMap[classRecId];
              const tentativeVal = computeTentativeGrade(classRecordScores, classRecordCols);
              if (tentativeVal !== null) {
                subjectGradeList.push({
                  subjectCode: 'DRAFT',
                  subjectName: 'Pending Term Class',
                  val: tentativeVal,
                  isTentative: true
                });
                containsTentative = true;
              }
            }
          });

          const avgGwa = subjectGradeList.length > 0
            ? subjectGradeList.reduce((acc, item) => acc + item.val, 0) / subjectGradeList.length
            : null;

          const failingItems = subjectGradeList.filter(item => item.val > 3.00);
          const failingCount = failingItems.length;

          // Explainable Multi-Factor Risk Assessment via centralized engine
          const riskAssessment = calculateAcademicRisk({
            currentGwa: avgGwa,
            failingSubjectsCount: failingCount,
            majorExamAverage: 80,
            absenceCount: 0
          });

          const severity = riskAssessment.risk_level;
          const riskScore = riskAssessment.composite_score;

          // AI override advisory if available
          const ai = aiMap[s.user_id];
          const aiAdvisory = ai?.summary
            ? ai.summary.slice(0, 120) + (ai.summary.length > 120 ? '…' : '')
            : (failingCount > 0 
                ? `Academic difficulty detected in ${failingCount} course(s). Immediate tutorial intervention recommended.`
                : avgGwa !== null && avgGwa <= 1.75
                ? `Honor pace student maintaining a ${avgGwa.toFixed(2)} running GWA.`
                : 'Performance within passing parameters. Continuing routine term monitoring.');

          const sectionName = s.sections?.name || '';
          const programCode = sectionName.split('-')[0] || '—';

          // President's Lister (PL) Tier 2 Honor Status & Dragging Subject analysis
          const isHonorsPace = avgGwa !== null && avgGwa <= 1.75 && failingCount === 0;
          let draggingSubject = null;
          let plStatus = isHonorsPace ? 'Honor Candidate (Pace Maintained)' : 'Non-Honors';

          if (isHonorsPace && subjectGradeList.length > 0) {
            // Find subject with highest grade value (highest numeric grade is lowest academic score)
            const highestGradeItem = [...subjectGradeList].sort((a, b) => b.val - a.val)[0];
            if (highestGradeItem && highestGradeItem.val > 1.75) {
              draggingSubject = highestGradeItem;
              plStatus = 'Honor Standing Vulnerable (Dragging Course)';
            }
          }

          const myEvals = evalByStudent[s.user_id] || [];
          const latestEval = myEvals.length > 0 ? myEvals[0] : null;
          const isEvaluated = myEvals.length > 0;
          const hasDeanReferral = myEvals.some(ev => ev.refer_to_dean === true);
          const hasSnapshot = myEvals.some(ev => ev.baseline_snapshot && Object.keys(ev.baseline_snapshot).length > 0);

          return {
            id: s.user_id,
            firstName: s.first_name,
            lastName: s.last_name,
            email: s.email,
            section: sectionName,
            programCode,
            runningGwa: avgGwa,
            isTentative: containsTentative,
            subjectGradeList,
            failingCount,
            failingItems,
            severity,
            riskScore,
            advisory: aiAdvisory,
            hasGrades: subjectGradeList.length > 0,
            hasAi: !!ai,
            isHonorsPace,
            plStatus,
            draggingSubject,
            isEvaluated,
            hasDeanReferral,
            hasSnapshot,
            latestEvaluation: latestEval,
            evalCount: myEvals.length
          };
        });

        if (!cancelled) {
          setStudents(enriched);
          setError(null);
        }
      } catch (err) {
        console.error('Database query failed:', err);
        if (!cancelled) setError('Failed to load at-risk students data from database.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [profile?.department_id]);

  // Derived lists for ASPIRE v3.1 Matrix
  const tier1Students = students.filter(s => 
    s.failingCount > 0 || (s.runningGwa !== null && s.runningGwa >= 2.50) || s.severity === 'critical' || s.severity === 'high'
  );

  const tier2PlStudents = students.filter(s => s.isHonorsPace);

  // Discussion Queue Items (all evaluations with refer_to_dean = true)
  const discussionQueueItems = rawEvaluations
    .filter(ev => ev.refer_to_dean === true)
    .map(ev => {
      const studentMatch = students.find(s => s.id === ev.student_id);
      return {
        evaluation_id: ev.evaluation_id,
        student_id: ev.student_id,
        faculty_id: ev.faculty_id,
        studentName: studentMatch ? `${studentMatch.firstName} ${studentMatch.lastName}` : 'Student',
        studentEmail: studentMatch?.email || '—',
        section: ev.class_record?.sections?.name || studentMatch?.section || '—',
        programCode: studentMatch?.programCode || '—',
        runningGwa: studentMatch?.runningGwa || null,
        facultyName: ev.faculty ? `${ev.faculty.first_name} ${ev.faculty.last_name}` : 'Faculty Member',
        subjectCode: ev.class_record?.subjects?.code || 'Class Subject',
        subjectName: ev.class_record?.subjects?.name || 'Class Subject',
        term: ev.term || 'Current Term',
        context: ev.evaluation_context === 'pl_retention' ? "President's Lister Retention" : "Academic Recovery",
        risk_level: ev.risk_level,
        risk_score: ev.risk_score,
        professor_notes: ev.professor_notes || 'Professor requested Dean consultation regarding student academic standing.',
        advising_plan: Array.isArray(ev.advising_plan) ? ev.advising_plan : [],
        requires_tutoring: ev.requires_tutoring || false,
        status: ev.status,
        created_at: ev.created_at
      };
    });

  // Outcomes Tracker Items (evaluations with baseline snapshot)
  const outcomesList = rawEvaluations
    .filter(ev => ev.baseline_snapshot && Object.keys(ev.baseline_snapshot).length > 0)
    .map(ev => {
      const studentMatch = students.find(s => s.id === ev.student_id);
      const bSnapshot = ev.baseline_snapshot || {};
      const fSnapshot = ev.followup_snapshot || null;
      const outcomeCalc = fSnapshot ? calculateInterventionOutcome(bSnapshot, fSnapshot) : null;

      let recoveryStatus = 'Active Intervention';
      if (fSnapshot) {
        const bGwa = parseFloat(bSnapshot.gwa || 3.0);
        const fGwa = parseFloat(fSnapshot.gwa || 3.0);
        if (fGwa < bGwa) recoveryStatus = 'Recovered / GWA Improved';
        else if (fGwa === bGwa) recoveryStatus = 'Stabilized';
        else recoveryStatus = 'Needs Continued Escalation';
      } else if (ev.refer_to_dean) {
        recoveryStatus = 'Escalated to Dean';
      }

      return {
        evaluation_id: ev.evaluation_id,
        studentName: studentMatch ? `${studentMatch.firstName} ${studentMatch.lastName}` : 'Student',
        studentEmail: studentMatch?.email || '—',
        section: ev.class_record?.sections?.name || studentMatch?.section || '—',
        subjectCode: ev.class_record?.subjects?.code || 'General',
        context: ev.evaluation_context === 'pl_retention' ? "President's Lister Pace" : "Passing Recovery",
        baselineGwa: bSnapshot.gwa ? Number(bSnapshot.gwa).toFixed(2) : '—',
        baselineScore: bSnapshot.risk_score || ev.risk_score || 0,
        followupGwa: fSnapshot?.gwa ? Number(fSnapshot.gwa).toFixed(2) : (studentMatch?.runningGwa ? studentMatch.runningGwa.toFixed(2) : 'Pending'),
        followupScore: fSnapshot?.risk_score ?? (studentMatch?.riskScore ?? '—'),
        recoveryStatus,
        outcomeCalc,
        facultyName: ev.faculty ? `${ev.faculty.first_name} ${ev.faculty.last_name}` : 'Faculty',
        tasks: Array.isArray(ev.advising_plan) ? ev.advising_plan : []
      };
    });

  // Filter handlers for Tier 1 & Tier 2 student tables
  const filterStudents = (list) => {
    return list
      .filter(s => {
        const name = `${s.firstName} ${s.lastName}`;
        const matchesSearch =
          name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          s.email.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesSeverity = !severityFilter || s.severity === severityFilter;
        const matchesSection = !sectionFilter || s.section === sectionFilter;
        return matchesSearch && matchesSeverity && matchesSection;
      })
      .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0));
  };

  const filteredTier1 = filterStudents(tier1Students);
  const filteredTier2 = filterStudents(tier2PlStudents);

  const deanCollege = profile?.departments?.name || 'College of Computer Studies';

  return (
    <>
      <PageHeader title="At-Risk Students & Academic Risk Matrix" breadcrumb="Dean Portal" />

      <div className="p-8 overflow-y-auto flex-1 space-y-6">

        {/* Error banner */}
        {error && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-xs text-amber-800 shadow-sm">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Dean College Scope & Fast KPI Strip */}
        {!loading && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Building2 className="h-3.5 w-3.5 text-sage-600" />
                <span>Monitoring College:</span>
                <span className="font-bold text-sage-700">{deanCollege}</span>
                <span className="text-slate-300">·</span>
                <span>{students.length} students enrolled</span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                ASPIRE v3.1 Dual-Tier Predictive Model Active
              </div>
            </div>

            {/* Quick KPI Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3.5 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-rose-800 block">Tier 1 At-Risk</span>
                  <span className="text-xl font-extrabold font-mono text-rose-900">{tier1Students.length}</span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center text-rose-700">
                  <AlertOctagon className="h-4 w-4" />
                </div>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3.5 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-amber-800 block">Tier 2 PL Honors Pace</span>
                  <span className="text-xl font-extrabold font-mono text-amber-900">{tier2PlStudents.length}</span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                  <Award className="h-4 w-4" />
                </div>
              </div>

              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-3.5 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-indigo-800 block">Dean Discussion Queue</span>
                  <span className="text-xl font-extrabold font-mono text-indigo-900">{discussionQueueItems.length}</span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-700">
                  <MessageSquare className="h-4 w-4" />
                </div>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-semibold text-emerald-800 block">Active Interventions</span>
                  <span className="text-xl font-extrabold font-mono text-emerald-900">{outcomesList.length}</span>
                </div>
                <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-700">
                  <TrendingUp className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ASPIRE v3.1 Matrix 4 Tabs */}
        <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveTab('tier1_at_risk')}
            className={cn(
              "px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer border",
              activeTab === 'tier1_at_risk'
                ? "bg-sage-800 text-white border-sage-800 shadow-xs"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            )}
          >
            <AlertTriangle className={cn("h-3.5 w-3.5", activeTab === 'tier1_at_risk' ? "text-rose-300" : "text-rose-500")} />
            <span>Academic At-Risk (Tier 1)</span>
            <span className={cn(
              "text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full",
              activeTab === 'tier1_at_risk' ? "bg-sage-950 text-white" : "bg-rose-100 text-rose-800"
            )}>
              {tier1Students.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('tier2_pl_risk')}
            className={cn(
              "px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer border",
              activeTab === 'tier2_pl_risk'
                ? "bg-sage-800 text-white border-sage-800 shadow-xs"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            )}
          >
            <Award className={cn("h-3.5 w-3.5", activeTab === 'tier2_pl_risk' ? "text-amber-300" : "text-amber-500")} />
            <span>President's Lister Risk (Tier 2)</span>
            <span className={cn(
              "text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full",
              activeTab === 'tier2_pl_risk' ? "bg-sage-950 text-white" : "bg-amber-100 text-amber-800"
            )}>
              {tier2PlStudents.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('discussion_queue')}
            className={cn(
              "px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer border",
              activeTab === 'discussion_queue'
                ? "bg-sage-800 text-white border-sage-800 shadow-xs"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            )}
          >
            <MessageSquare className={cn("h-3.5 w-3.5", activeTab === 'discussion_queue' ? "text-indigo-300" : "text-indigo-500")} />
            <span>Faculty Discussion Queue</span>
            <span className={cn(
              "text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full",
              activeTab === 'discussion_queue' 
                ? "bg-sage-950 text-white" 
                : discussionQueueItems.length > 0 
                ? "bg-rose-100 text-rose-800 animate-pulse" 
                : "bg-slate-100 text-slate-600"
            )}>
              {discussionQueueItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('outcomes_tracker')}
            className={cn(
              "px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer border",
              activeTab === 'outcomes_tracker'
                ? "bg-sage-800 text-white border-sage-800 shadow-xs"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            )}
          >
            <TrendingUp className={cn("h-3.5 w-3.5", activeTab === 'outcomes_tracker' ? "text-emerald-300" : "text-sage-600")} />
            <span>Intervention Outcomes</span>
            <span className={cn(
              "text-[10px] font-mono font-bold px-1.5 py-0.2 rounded-full",
              activeTab === 'outcomes_tracker' ? "bg-sage-950 text-white" : "bg-slate-100 text-slate-600"
            )}>
              {outcomesList.length}
            </span>
          </button>
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-12 flex items-center justify-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-sage-600" />
            <span className="text-sm text-slate-500 font-medium">Computing ASPIRE risk telemetry & multi-factor indicators…</span>
          </div>
        )}

        {/* TAB 1: ACADEMIC AT-RISK ROSTER (TIER 1) */}
        {!loading && activeTab === 'tier1_at_risk' && (
          <div className="space-y-4">
            {/* Filter toolbar */}
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-4 w-4 text-slate-400" />
                </div>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Search at-risk student name or email..."
                  className="block w-full pl-9 pr-3 py-2 border border-slate-200 focus:border-sage-500 rounded-lg text-xs outline-none bg-slate-50/20 focus:bg-white transition-colors"
                />
              </div>

              <select
                value={severityFilter}
                onChange={e => setSeverityFilter(e.target.value)}
                className="border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer focus:border-sage-500 transition-colors"
              >
                <option value="">All Risk Tiers</option>
                <option value="critical">Critical Risk</option>
                <option value="high">High Risk</option>
                <option value="moderate">Moderate Risk</option>
              </select>

              <select
                value={sectionFilter}
                onChange={e => setSectionFilter(e.target.value)}
                className="border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer focus:border-sage-500 transition-colors"
              >
                <option value="">All Sections</option>
                {sections.map(sec => (
                  <option key={sec.section_id} value={sec.name}>{sec.name}</option>
                ))}
              </select>
            </div>

            {/* Desktop Table View */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Student</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Section</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Running GWA</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Failing Subjects</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Explainable Risk</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">AI Diagnostic Insight</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Advisory Notice</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {filteredTier1.length > 0 ? (
                      filteredTier1.map(s => (
                        <tr key={s.id} className={cn("hover:bg-slate-50/50 transition-colors", s.severity === 'critical' ? 'bg-rose-50/20' : '')}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center font-mono shrink-0">
                                {s.firstName[0]}{s.lastName[0]}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{s.firstName} {s.lastName}</p>
                                <p className="text-[10px] text-slate-400 font-mono">{s.email}</p>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                              {s.section}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {s.runningGwa !== null ? (
                              <div className="inline-flex items-center justify-center gap-1.5">
                                <span className={cn(
                                  "text-sm font-mono font-bold",
                                  s.runningGwa > 3.00 ? 'text-rose-700' : s.runningGwa >= 2.75 ? 'text-amber-700' : 'text-slate-900'
                                )}>
                                  {s.runningGwa.toFixed(2)}
                                </span>
                                {s.isTentative && (
                                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[8px] font-bold bg-amber-50 text-amber-700 border border-amber-200" title="Computed from draft term scores">
                                    Tentative
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 font-medium italic">Pending grades</span>
                            )}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {s.failingCount > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                <AlertOctagon className="h-3 w-3" /> {s.failingCount} Course(s)
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400 font-medium">None</span>
                            )}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <SeverityBadge severity={s.severity} score={s.riskScore} />
                          </td>

                          <td className="px-6 py-4 text-xs text-slate-600 max-w-xs">
                            <div className="flex items-start gap-1.5">
                              <Sparkles className="h-3.5 w-3.5 text-violet-500 shrink-0 mt-0.5" />
                              <span className="text-[11px] leading-relaxed line-clamp-2">{s.advisory}</span>
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <button
                              type="button"
                              onClick={() => handleAlertStudent(s)}
                              disabled={alertSentMap[s.id]}
                              className={cn(
                                "px-2.5 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs",
                                alertSentMap[s.id]
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200"
                              )}
                            >
                              {alertSentMap[s.id] ? <Check className="h-3 w-3 text-emerald-600" /> : <Bell className="h-3 w-3 text-amber-600" />}
                              <span>{alertSentMap[s.id] ? 'Alerted' : 'Notify'}</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" className="px-6 py-12 text-center">
                          <CheckCircle2 className="h-8 w-8 text-emerald-300 mx-auto mb-2" />
                          <p className="text-sm text-slate-500 font-medium">No Tier 1 academic at-risk students match the current filters.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PRESIDENT'S LISTER (PL) RISK ROSTER (TIER 2) */}
        {!loading && activeTab === 'tier2_pl_risk' && (
          <div className="space-y-4">
            <div className="p-4 bg-amber-50/60 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2.5">
              <Award className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">ASPIRE Tier 2: President's Lister (PL) Retention Matrix</span>
                <p className="text-amber-800/90 text-[11px] mt-0.5">
                  Tracks high achievers (GWA &le; 1.75). Flags students whose honor qualification is threatened by a single dragging course or declining trajectory before final grade lock.
                </p>
              </div>
            </div>

            {/* Desktop Table View */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Honor Student</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Section</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Running GWA</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Honor Standing</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Dragging Subject (If Any)</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Retention Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {filteredTier2.length > 0 ? (
                      filteredTier2.map(s => (
                        <tr key={s.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-amber-100 border border-amber-200 text-amber-800 font-bold text-[10px] flex items-center justify-center font-mono shrink-0">
                                {s.firstName[0]}{s.lastName[0]}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{s.firstName} {s.lastName}</p>
                                <p className="text-[10px] text-slate-400 font-mono">{s.email}</p>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                              {s.section}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className="text-sm font-mono font-extrabold text-amber-700">
                              {s.runningGwa ? s.runningGwa.toFixed(2) : '1.50'}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold",
                              s.draggingSubject 
                                ? "bg-amber-100 text-amber-800 border border-amber-300"
                                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            )}>
                              {s.draggingSubject ? <AlertTriangle className="h-3 w-3" /> : <Award className="h-3 w-3" />}
                              <span>{s.plStatus}</span>
                            </span>
                          </td>

                          <td className="px-6 py-4 text-xs text-slate-600">
                            {s.draggingSubject ? (
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-rose-700 font-mono font-bold text-[10px]">
                                  {s.draggingSubject.subjectCode} ({s.draggingSubject.val.toFixed(2)})
                                </span>
                                <span className="text-slate-500 text-[11px] truncate max-w-xs">{s.draggingSubject.subjectName}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 italic">All subjects qualifying (&le; 1.75)</span>
                            )}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <button
                              type="button"
                              onClick={() => handleAlertStudent(s)}
                              disabled={alertSentMap[s.id]}
                              className={cn(
                                "px-2.5 py-1 rounded-md text-[11px] font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs",
                                alertSentMap[s.id]
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200"
                              )}
                            >
                              {alertSentMap[s.id] ? <Check className="h-3 w-3 text-emerald-600" /> : <Bell className="h-3 w-3 text-amber-600" />}
                              <span>{alertSentMap[s.id] ? 'Notified' : 'Honor Advisory'}</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6" className="px-6 py-12 text-center">
                          <AlertCircle className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                          <p className="text-sm text-slate-500 font-medium">No students currently in President's Lister pace for this selection.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: FACULTY-DEAN DISCUSSION QUEUE (refer_to_dean = true) */}
        {!loading && activeTab === 'discussion_queue' && (
          <div className="space-y-4">
            <div className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl text-xs text-indigo-900 flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-2.5">
                <MessageSquare className="h-4 w-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Faculty-Dean Discussion Queue (Human-in-the-Loop Collaboration)</span>
                  <p className="text-indigo-800/90 text-[11px] mt-0.5">
                    Aggregates qualitative assessments escalated by course professors needing administrative conference, remedial tutoring approval, or Dean directives.
                  </p>
                </div>
              </div>
              <div className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-800 border border-indigo-200">
                {discussionQueueItems.length} Escalations Pending
              </div>
            </div>

            {discussionQueueItems.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {discussionQueueItems.map(item => (
                  <div 
                    key={item.evaluation_id}
                    className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4 hover:border-indigo-300 transition-all"
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center font-mono shrink-0">
                          {item.studentName.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-bold text-slate-900">{item.studentName}</h4>
                            <span className="px-2 py-0.2 rounded text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                              {item.section}
                            </span>
                            <span className="text-xs text-slate-400">·</span>
                            <span className="text-xs text-slate-500 font-medium">{item.programCode}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono">{item.studentEmail}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                          <AlertOctagon className="h-3 w-3 text-rose-500" />
                          <span>Flagged for Dean</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenReview(item)}
                          className="px-3 py-1.5 bg-sage-800 hover:bg-sage-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          <span>Open Dean Review</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200/80 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Referring Faculty</span>
                        <span className="font-semibold text-slate-800">Prof. {item.facultyName}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Course &amp; Term</span>
                        <span className="font-semibold text-slate-800">{item.subjectCode} ({item.term})</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase block">Risk Score at Evaluation</span>
                        <span className="font-mono font-bold text-rose-700">{item.risk_score} pts ({item.risk_level?.toUpperCase()})</span>
                      </div>
                    </div>

                    {/* Professor Notes */}
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                        <MessageSquare className="h-3 w-3 text-indigo-500" /> Professor Qualitative Statement:
                      </span>
                      <blockquote className="p-3 bg-slate-50/80 border-l-2 border-indigo-400 rounded-r-lg text-xs text-slate-700 italic leading-relaxed">
                        "{item.professor_notes}"
                      </blockquote>
                    </div>

                    {/* Action Plan items */}
                    {item.advising_plan.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-sage-600" /> Proposed Advising Tasks:
                        </span>
                        <div className="space-y-1">
                          {item.advising_plan.map((task, idx) => (
                            <div key={idx} className="flex items-center justify-between text-xs p-2 bg-white rounded border border-slate-200">
                              <span className="text-slate-700 font-medium">{task.description}</span>
                              <span className="text-[10px] font-mono text-slate-400">Target: {task.target_term || task.due_date || 'Term Final'}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center bg-white border border-slate-200 rounded-xl">
                <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-slate-800">Discussion Queue is Clear</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  No professors have active escalations requiring Dean consultation at this time.
                </p>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: INTERVENTION OUTCOMES TRACKER */}
        {!loading && activeTab === 'outcomes_tracker' && (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-start gap-2.5">
                <TrendingUp className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block">Intervention Outcomes &amp; Baseline Recovery Tracker</span>
                  <p className="text-emerald-800/90 text-[11px] mt-0.5">
                    Compares initial baseline evaluation snapshots against follow-up term milestones to quantitatively audit intervention efficacy.
                  </p>
                </div>
              </div>
              <div className="text-xs font-mono font-bold px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200">
                {outcomesList.length} Active Tracks
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Student</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Section</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Scope / Course</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Baseline GWA</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Follow-up GWA</th>
                      <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Intervention Status</th>
                      <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Faculty Lead</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-100">
                    {outcomesList.length > 0 ? (
                      outcomesList.map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[10px] flex items-center justify-center font-mono shrink-0">
                                {row.studentName.slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">{row.studentName}</p>
                                <p className="text-[10px] text-slate-400 font-mono">{row.studentEmail}</p>
                              </div>
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                              {row.section}
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-700">
                            <div>
                              <span className="font-bold block">{row.subjectCode}</span>
                              <span className="text-[10px] text-slate-400">{row.context}</span>
                            </div>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center font-mono text-xs text-slate-600">
                            {row.baselineGwa}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center font-mono font-bold text-xs text-slate-900">
                            {row.followupGwa}
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold",
                              row.recoveryStatus.includes('Recovered') || row.recoveryStatus.includes('Improved')
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : row.recoveryStatus.includes('Escalated')
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : "bg-amber-50 text-amber-700 border border-amber-200"
                            )}>
                              {row.recoveryStatus.includes('Recovered') ? (
                                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                              ) : row.recoveryStatus.includes('Escalated') ? (
                                <AlertOctagon className="h-3 w-3 text-rose-500" />
                              ) : (
                                <Clock className="h-3 w-3 text-amber-500" />
                              )}
                              <span>{row.recoveryStatus}</span>
                            </span>
                          </td>

                          <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-600">
                            {row.facultyName}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" className="px-6 py-12 text-center">
                          <TrendingUp className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                          <p className="text-sm text-slate-500 font-medium">No baseline snapshots recorded yet for this college.</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* DEAN REVIEW & DIRECTIVES MODAL */}
      {isModalOpen && selectedQueueItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-indigo-600" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Dean Academic Review &amp; Directives</h3>
                  <p className="text-[11px] text-slate-500">Actioning faculty escalation request</p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              
              {/* Student info strip */}
              <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-indigo-950">{selectedQueueItem.studentName}</span>
                  <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-white text-indigo-800 border border-indigo-200">
                    {selectedQueueItem.section} ({selectedQueueItem.programCode})
                  </span>
                </div>
                <div className="flex items-center gap-4 text-slate-500 text-[11px]">
                  <span>Faculty: <strong>Prof. {selectedQueueItem.facultyName}</strong></span>
                  <span>Course: <strong>{selectedQueueItem.subjectCode}</strong></span>
                  <span>Term: <strong>{selectedQueueItem.term}</strong></span>
                </div>
              </div>

              {/* Professor Statement */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Professor Escalation Statement</label>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 italic leading-relaxed">
                  "{selectedQueueItem.professor_notes}"
                </div>
              </div>

              {/* Dean Action Select */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Dean Administrative Action</label>
                <select
                  value={deanActionType}
                  onChange={e => setDeanActionType(e.target.value)}
                  className="w-full border border-slate-200 px-3 py-2 rounded-lg text-xs bg-white outline-none cursor-pointer focus:border-sage-600 font-semibold"
                >
                  <option value="conference">Schedule Dean Academic Conference (Faculty + Student)</option>
                  <option value="tutoring">Approve Remedial Peer Tutoring Mandate</option>
                  <option value="advisory">Issue Official Dean Academic Standing Advisory</option>
                  <option value="resolved">Acknowledge Directives &amp; Mark Queue Item Resolved</option>
                </select>
              </div>

              {/* Dean Notes / Directives Input */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-700 uppercase tracking-wide">Dean Consultation Notes / Directives</label>
                <textarea
                  rows={4}
                  value={deanNotes}
                  onChange={e => setDeanNotes(e.target.value)}
                  placeholder="Enter academic directives, instructions for faculty, or counseling recommendations..."
                  className="w-full border border-slate-200 p-3 rounded-lg text-xs outline-none focus:border-sage-600 resize-none font-sans"
                />
              </div>

            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDeanReview}
                disabled={isSubmittingAction}
                className="px-4 py-2 bg-sage-800 hover:bg-sage-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
              >
                {isSubmittingAction ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving Directives…</span>
                  </>
                ) : (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>Submit Dean Directives</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
