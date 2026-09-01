import { 
  getTransmutedGrade, 
  GWA_TARGET_BENCHMARKS, 
  simulateRequiredFinalRating 
} from '../../lib/gradingMath';
import { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { 
  BrainCircuit, 
  AlertCircle, 
  GraduationCap, 
  BookOpen, 
  RefreshCw, 
  Target, 
  Compass, 
  ShieldCheck, 
  Sparkles, 
  Calculator, 
  Sliders, 
  BarChart3, 
  UserCheck, 
  Clock, 
  AlertTriangle, 
  Info 
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { getAiAcademicInsight } from '../../lib/openrouter';

// Helper to calculate term ratings from draft scores (DYCI Standard: 50% CS, 10% Char, 40% Exam)
const calculateTermRating = (draftScores, maxSetup) => {
  if (!draftScores) return null;
  const max = maxSetup || { act1: 20, act2: 20, act3: 20, act4: 20, act5: 20, act6: 10, exam: 40 };

  const act1 = draftScores.act1 !== null ? draftScores.act1 : 0;
  const act2 = draftScores.act2 !== null ? draftScores.act2 : 0;
  const act3 = draftScores.act3 !== null ? draftScores.act3 : 0;
  const act4 = draftScores.act4 !== null ? draftScores.act4 : 0;
  const act5 = draftScores.act5 !== null ? draftScores.act5 : 0;
  const act6 = draftScores.act6 !== null ? draftScores.act6 : 0;
  const char = draftScores.char_rating !== null ? draftScores.char_rating : 0;
  const exam = draftScores.exam !== null ? draftScores.exam : 0;

  // Class Standing (50%)
  const csSum = act1 + act2 + act3 + act4 + act5 + act6;
  const csMax = max.act1 + max.act2 + max.act3 + max.act4 + max.act5 + max.act6;
  const csPct = csMax > 0 ? (csSum / csMax) * 50 : 0;

  // Character Rating (10%)
  const charPct = char * 0.1;

  // Term Exam (40%)
  const examMax = max.exam;
  const examPct = examMax > 0 ? (exam / examMax) * 40 : 0;

  return Math.min(100, Math.max(0, Math.round(csPct + charPct + examPct)));
};

// Helper to compute academic verdict enum ('continue', 'at_risk', 'recommend_shift')
const computeVerdict = (gwaNum, fdaRisk, absents, failingCount = 0) => {
  if ((gwaNum !== null && gwaNum > 3.00) || failingCount > 1) {
    return 'recommend_shift';
  }
  if ((gwaNum !== null && gwaNum > 2.50) || fdaRisk || absents >= 4 || failingCount === 1) {
    return 'at_risk';
  }
  return 'continue';
};

// Helper to generate dynamic academic insights text based on period grade info
const generateDynamicInsight = (termName, rating, gwa, status) => {
  if (status === 'Pending' || gwa === '—') {
    return `Awaiting evaluation components for ${termName}.`;
  }
  const isPosted = status === 'Posted';
  const statusStr = isPosted ? "officially posted" : "calculated as draft";
  
  let baseText;
  if (termName === 'Midterm Rating (MR)' || termName === 'Midterm Rating') {
    baseText = `Your Midterm Rating combines your Prelim and Midterm efforts, ${statusStr} at ${gwa} GWA (${rating}%).`;
  } else if (termName === 'Tentative Final Rating (TFR)' || termName === 'Tentative Final Rating') {
    baseText = `Your Tentative Final Rating represents the average of your Semi-Final and Final marks, ${statusStr} at ${gwa} GWA (${rating}%).`;
  } else if (termName === 'Semestral Grade (SG)' || termName === 'Semestral Grade') {
    baseText = `Your projected Semestral Grade stands at a ${gwa} GWA (${rating}%), reflecting your cumulative performance for the term.`;
  } else {
    baseText = `Your ${termName} grade is ${statusStr} at ${gwa} GWA (${rating}%).`;
  }

  const numericGwa = parseFloat(gwa);
  if (isNaN(numericGwa)) {
    return `${baseText} Maintain your class participation and complete all upcoming tasks.`;
  }

  if (numericGwa <= 1.45) {
    return `${baseText} Outstanding result! You are demonstrating exceptional mastery of the course materials and are on track for honors.`;
  } else if (numericGwa <= 1.75) {
    return `${baseText} Strong academic standing. You are maintaining a highly competitive position in this class.`;
  } else if (numericGwa <= 2.50) {
    return `${baseText} Good, stable performance. Consistent efforts will keep you securely on track.`;
  } else if (numericGwa <= 3.00) {
    return `${baseText} Passing grade. Focus on reviewing core topics to build a safer margin.`;
  } else {
    return `${baseText} Warning: This rating is currently below passing. We recommend reaching out to your instructor or coordinator for guidance.`;
  }
};

// Period display mappings
const PERIODS_MAPPING = {
  prelim: 'Prelim Term',
  midterm: 'Midterm Term',
  midtermRating: 'Midterm Rating (MR)',
  semiFinal: 'Semi-Final Term',
  final: 'Final Term',
  tentativeFinalRating: 'Tentative Final Rating (TFR)',
  semestralGrade: 'Semestral Grade (SG)'
};

export default function AcademicInsights() {
  const { user, profile } = useAuth();
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);

  // Official milestone gate states
  const [hasOfficialMilestone, setHasOfficialMilestone] = useState(false);
  const [hasEnrolledSubjects, setHasEnrolledSubjects] = useState(false);

  // Selector states
  const [scope, setScope] = useState('overall'); // 'overall' or 'subject'
  const [selectedSubjectCode, setSelectedSubjectCode] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('semestralGrade');

  // Interactive What-If Simulator state
  const [simSubjectCode, setSimSubjectCode] = useState('');
  const [simTargetGwa, setSimTargetGwa] = useState('1.75');
  const [simEstimatedCs, setSimEstimatedCs] = useState(85);

  // AI Guidance states
  const [aiCache, setAiCache] = useState(() => {
    try {
      const saved = localStorage.getItem(`sage_ai_cache_${user?.id || 'guest'}`);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });
  const [aiLoading, setAiLoading] = useState(false);

  // Helper to persist insight to Supabase database table `student_academic_insights`
  const saveInsightToDb = useCallback(async (summaryText, verdictValue, basisSnapshot) => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('student_academic_insights')
        .insert({
          student_id: user.id,
          summary: summaryText,
          verdict: verdictValue,
          basis_snapshot: basisSnapshot,
          generated_at: new Date().toISOString()
        })
        .select();

      if (error) {
        console.warn("Could not save insight to database:", error);
      } else {
        console.log("Insight saved to student_academic_insights table:", data);
      }
    } catch (err) {
      console.warn("Error inserting to student_academic_insights:", err);
    }
  }, [user]);

  // Helper to persist AI cache to localStorage
  const updateAiCache = useCallback((key, val) => {
    setAiCache(prev => {
      const next = { ...prev, [key]: val };
      try {
        localStorage.setItem(`sage_ai_cache_${user?.id || 'guest'}`, JSON.stringify(next));
      } catch (e) {
        console.debug('Failed to write aiCache to storage', e);
      }
      return next;
    });
  }, [user]);

  useEffect(() => {
    async function loadInsights() {
      if (!user) return;
      setLoading(true);
      try {
        // 1. Fetch pre-generated insights from Supabase database if any
        const { data: pregenData } = await supabase
          .from('student_academic_insights')
          .select('*')
          .eq('student_id', user.id)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // 2. Fetch student enrollment records
        const { data: enrollsCheck } = await supabase
          .from('enrollments')
          .select('subject_id, section_id, subjects(*)')
          .eq('student_id', user.id);

        const activeSectionId = profile?.section_id || (enrollsCheck && enrollsCheck.length > 0 ? enrollsCheck[0].section_id : null);
        const enrolledSubjectsCount = enrollsCheck?.length || 0;
        setHasEnrolledSubjects(enrolledSubjectsCount > 0);

        // 3. Fetch attendance history
        const { data: attendanceData } = await supabase
          .from('attendance_records')
          .select('status, is_fda')
          .eq('student_id', user.id);

        let totalAttSessions = attendanceData?.length || 0;
        let presentAtt = attendanceData?.filter(a => a.status?.toLowerCase() === 'present').length || 0;
        let lateAtt = attendanceData?.filter(a => a.status?.toLowerCase() === 'late').length || 0;
        let absentAtt = attendanceData?.filter(a => a.status?.toLowerCase() === 'absent').length || 0;
        let fdaFlags = attendanceData?.filter(a => a.is_fda || a.status?.toLowerCase() === 'fda').length || (absentAtt >= 4 ? 1 : 0);
        let attendanceRate = totalAttSessions > 0 
          ? Math.round(((presentAtt + (lateAtt * 0.5)) / totalAttSessions) * 100) 
          : 100;

        if (activeSectionId && enrollsCheck && enrollsCheck.length > 0) {
          const subjectIds = enrollsCheck.map(e => e.subject_id).filter(Boolean);

          if (subjectIds.length > 0) {
            const { data: classRecords } = await supabase
              .from('class_records')
              .select('class_record_id, subject_id, faculty:users!faculty_id(first_name, last_name)')
              .eq('section_id', activeSectionId)
              .in('subject_id', subjectIds)
              .eq('status', 'active');

            const classRecordIds = classRecords?.map(cr => cr.class_record_id) || [];

            const { data: posted } = await supabase
              .from('posted_grades')
              .select('*')
              .eq('student_id', user.id)
              .in('class_record_id', classRecordIds.length > 0 ? classRecordIds : ['00000000-0000-0000-0000-000000000000']);

            const subMap = {};
            enrollsCheck?.forEach(e => {
              if (e.subjects) subMap[e.subject_id] = e.subjects;
            });

            const postedMap = {};
            posted?.forEach(p => {
              if (!postedMap[p.class_record_id]) postedMap[p.class_record_id] = [];
              postedMap[p.class_record_id].push(p);
            });

            // Check if there is at least one officially posted Midterm or Final grade
            const officialMilestonePeriods = ['midterm', 'midterm_rating', 'mr', 'final', 'semestral_grade', 'sg', 'tentative_final_rating'];
            const officialPostedCount = (posted || []).filter(p => officialMilestonePeriods.includes(p.grade_period?.toLowerCase())).length;
            const officialMilestonesExist = officialPostedCount > 0;
            setHasOfficialMilestone(officialMilestonesExist);

            let totalRunningUnits = 0;
            let weightedRunningSum = 0;

            const computedSubjectsList = (classRecords || [])
              .filter(cr => subMap[cr.subject_id])
              .map(cr => {
                const subj = subMap[cr.subject_id];
                const crPosted = postedMap[cr.class_record_id] || [];

                const getTermRating = (termName) => {
                  const dbTermKey = termName.toLowerCase().replace('-', '_');
                  const postedRow = crPosted.find(p => p.grade_period === dbTermKey || p.grade_period === termName.toLowerCase());
                  if (postedRow) {
                    const rating = parseFloat(postedRow.computed_grade);
                    const gwa = postedRow.effective_grade !== null 
                      ? Number(postedRow.effective_grade).toFixed(2) 
                      : getTransmutedGrade(parseFloat(postedRow.computed_grade)).toFixed(2);
                    return {
                      rating,
                      gwa,
                      status: 'Posted',
                      insight: generateDynamicInsight(termName, rating, gwa, 'Posted')
                    };
                  }
                  
                  // Grade is NOT posted yet: MUST NOT calculate or display any draft grades
                  return { 
                    rating: 0, 
                    gwa: '—', 
                    status: 'Pending', 
                    insight: `Awaiting officially posted ${termName} grade from instructor and college dean.` 
                  };
                };

                const prelim = getTermRating('Prelim');
                const midterm = getTermRating('Midterm');
                
                // Check if official Midterm Rating row exists in posted_grades
                const mrPostedRow = crPosted.find(p => p.grade_period === 'midterm_rating' || p.grade_period === 'mr');
                let mr = { rating: 0, gwa: '—', status: 'Pending', insight: `Awaiting Prelim and Midterm components.` };
                
                if (mrPostedRow) {
                  const rating = parseFloat(mrPostedRow.computed_grade);
                  const gwa = mrPostedRow.effective_grade !== null 
                    ? Number(mrPostedRow.effective_grade).toFixed(2) 
                    : getTransmutedGrade(rating).toFixed(2);
                  mr = {
                    rating,
                    gwa,
                    status: 'Posted',
                    insight: generateDynamicInsight('Midterm Rating', rating, gwa, 'Posted')
                  };
                } else if (prelim.status === 'Posted' && midterm.status === 'Posted') {
                  const avgRating = Math.round((prelim.rating + midterm.rating) / 2);
                  const avgGwa = getTransmutedGrade(avgRating).toFixed(2);
                  mr = {
                    rating: avgRating,
                    gwa: avgGwa,
                    status: 'Posted',
                    insight: generateDynamicInsight('Midterm Rating', avgRating, avgGwa, 'Posted')
                  };
                }

                const semiFinal = getTermRating('Semi-Final');
                const final = getTermRating('Final');

                // Check if official Tentative Final Rating row exists in posted_grades
                const tfrPostedRow = crPosted.find(p => p.grade_period === 'tentative_final_rating' || p.grade_period === 'tfr');
                let tentativeFinalRating = { rating: 0, gwa: '—', status: 'Pending', insight: `Awaiting Semi-Final and Final components.` };
                
                if (tfrPostedRow) {
                  const rating = parseFloat(tfrPostedRow.computed_grade);
                  const gwa = tfrPostedRow.effective_grade !== null 
                    ? Number(tfrPostedRow.effective_grade).toFixed(2) 
                    : getTransmutedGrade(rating).toFixed(2);
                  tentativeFinalRating = {
                    rating,
                    gwa,
                    status: 'Posted',
                    insight: generateDynamicInsight('Tentative Final Rating', rating, gwa, 'Posted')
                  };
                } else if (semiFinal.status === 'Posted' && final.status === 'Posted') {
                  const avgRating = Math.round((semiFinal.rating + final.rating) / 2);
                  const avgGwa = getTransmutedGrade(avgRating).toFixed(2);
                  tentativeFinalRating = {
                    rating: avgRating,
                    gwa: avgGwa,
                    status: 'Posted',
                    insight: generateDynamicInsight('Tentative Final Rating', avgRating, avgGwa, 'Posted')
                  };
                }

                // Check if official Semestral Grade row exists in posted_grades
                const sgPostedRow = crPosted.find(p => p.grade_period === 'semestral_grade' || p.grade_period === 'sg');
                let semestralGrade = { rating: 0, gwa: '—', status: 'Pending', insight: `Awaiting complete term components.` };
                
                if (sgPostedRow) {
                  const rating = parseFloat(sgPostedRow.computed_grade);
                  const gwa = sgPostedRow.effective_grade !== null 
                    ? Number(sgPostedRow.effective_grade).toFixed(2) 
                    : getTransmutedGrade(rating).toFixed(2);
                  semestralGrade = {
                    rating,
                    gwa,
                    status: 'Posted',
                    insight: generateDynamicInsight('Semestral Grade', rating, gwa, 'Posted')
                  };
                } else if (mr.status === 'Posted' && tentativeFinalRating.status === 'Posted') {
                  const avgRating = Math.round((mr.rating + tentativeFinalRating.rating) / 2);
                  const avgGwa = getTransmutedGrade(avgRating).toFixed(2);
                  semestralGrade = {
                    rating,
                    gwa,
                    status: 'Posted',
                    insight: generateDynamicInsight('Semestral Grade', avgRating, avgGwa, 'Posted')
                  };
                }

                // Running GWA is strictly derived ONLY from officially posted milestones
                let runningGwaVal = null;
                if (semestralGrade.status === 'Posted') runningGwaVal = parseFloat(semestralGrade.gwa);
                else if (tentativeFinalRating.status === 'Posted') runningGwaVal = parseFloat(tentativeFinalRating.gwa);
                else if (mr.status === 'Posted') runningGwaVal = parseFloat(mr.gwa);
                else if (prelim.status === 'Posted') runningGwaVal = parseFloat(prelim.gwa);

                const courseUnits = Number(subj.units) || 3;
                if (runningGwaVal !== null && !isNaN(runningGwaVal)) {
                  totalRunningUnits += courseUnits;
                  weightedRunningSum += runningGwaVal * courseUnits;
                }

                return {
                  code: subj.code,
                  name: subj.name,
                  credits: courseUnits,
                  instructor: cr.faculty ? `Prof. ${cr.faculty.first_name} ${cr.faculty.last_name}` : 'TBA',
                  runningGwa: runningGwaVal !== null ? runningGwaVal.toFixed(2) : '—',
                  diagnostics: {
                    csAvg: 0,
                    examAvg: 0
                  },
                  periods: {
                    prelim,
                    midterm,
                    midtermRating: mr,
                    semiFinal,
                    final,
                    tentativeFinalRating,
                    semestralGrade
                  }
                };
              });

            // Compute GWA strictly when there are real posted running units (never default to a fake number)
            const computedGwa = totalRunningUnits > 0 
              ? parseFloat((weightedRunningSum / totalRunningUnits).toFixed(2))
              : null;

            // Trajectory and Standing classification
            let gwaStanding = 'No Grades Posted Yet';
            let trajectoryVerdict = 'Awaiting Grade Posting';
            let trajectoryType = 'good'; // 'honors' | 'good' | 'warning' | 'critical'

            if (fdaFlags > 0 || absentAtt >= 4) {
              trajectoryVerdict = 'FDA Advisory Risk';
              trajectoryType = 'critical';
            } else if (computedGwa !== null) {
              if (computedGwa <= 1.45) {
                gwaStanding = 'Excellent';
                trajectoryVerdict = "1st Class Dean's List Pace";
                trajectoryType = 'honors';
              } else if (computedGwa <= 1.75) {
                gwaStanding = 'Very Good';
                trajectoryVerdict = "2nd Class Dean's List Pace";
                trajectoryType = 'honors';
              } else if (computedGwa <= 2.50) {
                gwaStanding = 'Satisfactory';
                trajectoryVerdict = 'Steady Academic Progression';
                trajectoryType = 'good';
              } else if (computedGwa <= 3.00) {
                gwaStanding = 'Passing Margin';
                trajectoryVerdict = 'Academic Warning Buffer';
                trajectoryType = 'warning';
              } else {
                gwaStanding = 'Academic Warning';
                trajectoryVerdict = 'Intervention Required';
                trajectoryType = 'critical';
              }
            } else {
              gwaStanding = computedSubjectsList.length > 0 ? 'No Grades Posted Yet' : 'No Active Enrollment';
              trajectoryVerdict = computedSubjectsList.length > 0 ? 'Awaiting Official Grade Posting' : 'Not Enrolled';
            }

            // Latin Honors / DL eligibility (only calculated when posted grades exist)
            let dlCategory = 'Pending Official Grades';
            let dlProbability = 0;
            let dlMessage = 'Dean\'s Lister eligibility and academic honors forecasts will be determined once official Midterm or Final grades are published by the college.';
            
            if (computedGwa !== null) {
              const hasDisqualifyingGrade = computedSubjectsList.some(sub => {
                const r = parseFloat(sub.runningGwa);
                return !isNaN(r) && r > 2.00;
              });

              if (hasDisqualifyingGrade) {
                dlCategory = 'Not Eligible';
                dlProbability = 0;
                dlMessage = 'You are currently disqualified from Dean\'s Lister or Latin Honors because you have one or more courses with a grade above 2.00 (e.g. 2.25 or worse). Maintain a grade of 2.00 or better in all individual courses to qualify.';
              } else if (computedGwa <= 1.45) {
                dlCategory = "1st Class Dean's Lister";
                dlProbability = 94;
                dlMessage = `Your current average of ${computedGwa.toFixed(2)} qualifies you for 1st Class Dean's Lister honors! Keep your final semestral grades at 1.45 or better and all individual grades at 2.00 or better to secure the award.`;
              } else if (computedGwa <= 1.75) {
                dlCategory = "2nd Class Dean's Lister";
                dlProbability = 85;
                dlMessage = `Your current average of ${computedGwa.toFixed(2)} qualifies you for 2nd Class Dean's Lister honors! Strive for 1.45 to upgrade to 1st Class honors.`;
              } else {
                dlCategory = 'Not Eligible';
                dlProbability = 0;
                dlMessage = 'Your current average does not qualify for Dean\'s Lister honors. Focus on upcoming milestones to improve your score.';
              }
            }

            // Identify Priority Subject for rescue/elevation (only if running GWA exists)
            let prioritySub = null;
            let lowestGwa = 0;
            computedSubjectsList.forEach(s => {
              const num = parseFloat(s.runningGwa);
              if (!isNaN(num) && num > lowestGwa) {
                lowestGwa = num;
                prioritySub = s;
              }
            });
            if (!prioritySub && computedSubjectsList.length > 0) {
              prioritySub = computedSubjectsList[0];
            }

            // If a saved insight exists in DB, populate the cached summary
            if (pregenData && pregenData.summary) {
              updateAiCache('overall', pregenData.summary);
            }

            const activeInsightData = {
              studentName: `${profile?.first_name || 'Student'} ${profile?.last_name || ''}`.trim(),
              gwa: computedGwa,
              standing: gwaStanding,
              totalUnits: totalRunningUnits,
              trajectoryVerdict,
              trajectoryType,
              aiSummary: pregenData?.summary || null,
              dlEligibility: {
                awardCategory: dlCategory,
                probabilityPct: dlProbability,
                message: dlMessage
              },
              diagnostics: {
                csAvg: 0,
                examAvg: 0,
                charAvg: 0,
                attendanceRate,
                absentCount: absentAtt,
                fdaRisk: fdaFlags > 0 || absentAtt >= 4
              },
              prioritySubject: prioritySub,
              subjects: computedSubjectsList
            };

            setInsight(activeInsightData);
            if (computedSubjectsList.length > 0) {
              setSelectedSubjectCode(computedSubjectsList[0].code);
              setSimSubjectCode(computedSubjectsList[0].code);
            }
          } else {
            setHasOfficialMilestone(false);
          }
        } else {
          setHasOfficialMilestone(false);
          setHasEnrolledSubjects(false);
        }
      } catch (err) {
        console.error("Failed to load academic insights:", err);
      } finally {
        setLoading(false);
      }
    }

    loadInsights();
  }, [user, profile, updateAiCache]);

  const studentStats = insight || {
    studentName: `${profile?.first_name || 'Student'} ${profile?.last_name || ''}`.trim(),
    gwa: null,
    standing: hasEnrolledSubjects ? 'Pending Official Milestone Grades' : 'No Active Enrollment',
    totalUnits: 0,
    trajectoryVerdict: hasEnrolledSubjects ? 'Awaiting Milestone Assessments' : 'Not Enrolled',
    trajectoryType: 'good',
    aiSummary: null,
    dlEligibility: { awardCategory: 'Not Eligible', probabilityPct: 0, message: 'No enrolled courses for the current academic term.' },
    diagnostics: { csAvg: 0, examAvg: 0, charAvg: 0, attendanceRate: 100, absentCount: 0, fdaRisk: false },
    prioritySubject: null,
    subjects: []
  };

  const subjectsList = studentStats.subjects || [];
  const currentSubject = subjectsList.find(s => s.code === selectedSubjectCode) || subjectsList[0] || null;
  const simSubject = subjectsList.find(s => s.code === simSubjectCode) || subjectsList[0] || null;

  // What-If Simulator Calculation
  const targetBenchmark = GWA_TARGET_BENCHMARKS.find(b => b.gwa === simTargetGwa) || GWA_TARGET_BENCHMARKS[3];
  const simMr = simSubject?.periods?.midtermRating?.rating || (simSubject?.periods?.prelim?.rating || 75);
  const simSemiFinal = simSubject?.periods?.semiFinal?.rating || null;
  
  const simResult = simulateRequiredFinalRating({
    mr: simMr,
    semiFinal: simSemiFinal,
    targetRating: targetBenchmark.minRating,
    estimatedFinalCs: simEstimatedCs,
    estimatedFinalChar: 95,
    examMax: 40
  });

  // Fetch AI guidance automatically ONLY when official Midterm / Final grades exist and cache is empty
  useEffect(() => {
    if (loading || !user || !hasEnrolledSubjects || !hasOfficialMilestone) return;

    let cacheKey = '';
    let payload = {};

    if (scope === 'overall') {
      cacheKey = 'overall';
      if (aiCache[cacheKey]) return; // Already loaded from DB / cache

      payload = {
        type: 'overall',
        studentName: studentStats.studentName,
        gwa: studentStats.gwa !== null ? studentStats.gwa.toFixed(2) : '—',
        standing: studentStats.standing,
        dlCategory: studentStats.dlEligibility?.awardCategory || 'Not Eligible',
        dlProbability: studentStats.dlEligibility?.probabilityPct || 0,
        dlMessage: studentStats.dlEligibility?.message || '',
        diagnostics: studentStats.diagnostics,
        subjects: subjectsList
      };
    } else {
      if (!currentSubject) return;
      cacheKey = `${currentSubject.code}_${selectedPeriod}`;
      const periodObj = currentSubject.periods?.[selectedPeriod] || {};
      
      // Do not query AI for pending/empty periods
      if (periodObj.gwa === '—' || periodObj.status === 'Pending') return;
      if (aiCache[cacheKey]) return;

      payload = {
        type: 'subject',
        studentName: studentStats.studentName,
        subjectCode: currentSubject.code,
        subjectName: currentSubject.name,
        credits: currentSubject.credits,
        instructor: currentSubject.instructor,
        periodLabel: PERIODS_MAPPING[selectedPeriod],
        rating: periodObj.rating || 0,
        gwa: periodObj.gwa || '—',
        status: periodObj.status || 'Pending',
        courseCs: currentSubject.diagnostics?.csAvg,
        courseExam: currentSubject.diagnostics?.examAvg,
        allPeriods: currentSubject.periods || {}
      };
    }

    async function fetchAiGuidance() {
      setAiLoading(true);
      try {
        const result = await getAiAcademicInsight(payload);
        if (result) {
          updateAiCache(cacheKey, result);

          // If overall guidance, persist directly into Supabase `student_academic_insights` table
          if (scope === 'overall') {
            const v = computeVerdict(studentStats.gwa, studentStats.diagnostics?.fdaRisk, studentStats.diagnostics?.absentCount, 0);
            await saveInsightToDb(result, v, {
              gwa: studentStats.gwa,
              standing: studentStats.standing,
              totalUnits: studentStats.totalUnits,
              trajectoryVerdict: studentStats.trajectoryVerdict,
              trajectoryType: studentStats.trajectoryType,
              dlEligibility: studentStats.dlEligibility,
              diagnostics: studentStats.diagnostics,
              hasOfficialMilestone: true,
              generatedAt: new Date().toISOString()
            });
          }
        }
      } catch (err) {
        console.warn("AI generation failed, relying on fallback.", err);
      } finally {
        setAiLoading(false);
      }
    }

    fetchAiGuidance();
  }, [scope, selectedSubjectCode, selectedPeriod, loading, hasEnrolledSubjects, hasOfficialMilestone, studentStats, subjectsList, currentSubject, aiCache, saveInsightToDb, updateAiCache]);

  // Handler for explicit on-demand re-generation (only enabled when official grades exist)
  const handleRegenerateCurrentInsight = async (e) => {
    e?.stopPropagation?.();
    if (!hasOfficialMilestone) return;

    let cacheKey;
    let payload;

    if (scope === 'overall') {
      cacheKey = 'overall';
      payload = {
        type: 'overall',
        studentName: studentStats.studentName,
        gwa: studentStats.gwa !== null ? studentStats.gwa.toFixed(2) : '—',
        standing: studentStats.standing,
        dlCategory: studentStats.dlEligibility?.awardCategory || 'Not Eligible',
        dlProbability: studentStats.dlEligibility?.probabilityPct || 0,
        dlMessage: studentStats.dlEligibility?.message || '',
        diagnostics: studentStats.diagnostics,
        subjects: subjectsList
      };
    } else {
      if (!currentSubject) return;
      cacheKey = `${currentSubject.code}_${selectedPeriod}`;
      const periodObj = currentSubject.periods?.[selectedPeriod] || {};
      payload = {
        type: 'subject',
        studentName: studentStats.studentName,
        subjectCode: currentSubject.code,
        subjectName: currentSubject.name,
        credits: currentSubject.credits,
        instructor: currentSubject.instructor,
        periodLabel: PERIODS_MAPPING[selectedPeriod],
        rating: periodObj.rating || 0,
        gwa: periodObj.gwa || '—',
        status: periodObj.status || 'Pending',
        courseCs: currentSubject.diagnostics?.csAvg,
        courseExam: currentSubject.diagnostics?.examAvg,
        allPeriods: currentSubject.periods || {}
      };
    }

    setAiLoading(true);
    try {
      const result = await getAiAcademicInsight(payload);
      if (result) {
        updateAiCache(cacheKey, result);

        if (scope === 'overall') {
          const v = computeVerdict(studentStats.gwa, studentStats.diagnostics?.fdaRisk, studentStats.diagnostics?.absentCount, 0);
          await saveInsightToDb(result, v, {
            gwa: studentStats.gwa,
            standing: studentStats.standing,
            totalUnits: studentStats.totalUnits,
            trajectoryVerdict: studentStats.trajectoryVerdict,
            trajectoryType: studentStats.trajectoryType,
            dlEligibility: studentStats.dlEligibility,
            diagnostics: studentStats.diagnostics,
            hasOfficialMilestone: true,
            generatedAt: new Date().toISOString()
          });
        }
      }
    } catch (err) {
      console.warn("AI re-generation failed:", err);
    } finally {
      setAiLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50 min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-xs text-slate-500 font-medium font-sans">Compiling Academic Insights & Diagnostics...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader 
        title="Academic Insights & Advisory Suite" 
        breadcrumb="Student Portal" 
      />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-5 sm:space-y-6">
        
        {/* Navigation Scope Tabs */}
        <div className="bg-slate-200/70 p-1 rounded-2xl shadow-inner grid grid-cols-2 gap-1 max-w-xl mx-auto">
          <button
            onClick={() => setScope('overall')}
            className={cn(
              "flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-xl transition-all cursor-pointer text-center select-none",
              scope === 'overall'
                ? "bg-white text-sage-900 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <BrainCircuit className="h-4 w-4 text-sage-600" />
            <span>Overall Advisory & Diagnostics</span>
          </button>

          <button
            onClick={() => setScope('subject')}
            className={cn(
              "flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-xl transition-all cursor-pointer text-center select-none",
              scope === 'subject'
                ? "bg-white text-slate-900 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <BookOpen className="h-4 w-4 text-indigo-600" />
            <span>Course Milestone Breakdown</span>
          </button>
        </div>

        {/* Dynamic Panels */}
        {scope === 'overall' ? (
          /* ================= OVERALL ADVISORY PANEL ================= */
          <div className="space-y-5 sm:space-y-6 animate-fade-in">
            
            {/* 1. Academic Health Hero Banner */}
            <div className="bg-gradient-to-r from-sage-950 via-slate-900 to-sage-900 rounded-2xl p-5 sm:p-7 text-white shadow-md border border-sage-800/60 flex flex-col md:flex-row md:items-center justify-between gap-5">
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-sage-300 bg-sage-800/60 px-2.5 py-0.5 rounded-md border border-sage-700/50">
                    Academic Trajectory
                  </span>
                  <span className={cn(
                    "text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1",
                    studentStats.trajectoryType === 'honors' && "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
                    studentStats.trajectoryType === 'good' && "bg-sage-500/20 text-sage-300 border border-sage-500/30",
                    studentStats.trajectoryType === 'warning' && "bg-amber-500/20 text-amber-300 border border-amber-500/30",
                    studentStats.trajectoryType === 'critical' && "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  )}>
                    <Sparkles className="h-3 w-3" />
                    {studentStats.trajectoryVerdict}
                  </span>
                </div>
                
                <h2 className="text-xl sm:text-2xl font-extrabold font-display tracking-tight text-white flex items-center gap-2">
                  <GraduationCap className="h-6 w-6 text-sage-300 flex-shrink-0" />
                  {studentStats.standing}
                </h2>
                <p className="text-xs text-slate-300 max-w-xl leading-relaxed">
                  {subjectsList.length > 0 
                    ? `Evaluated against DYCI 4-Term progression standards across ${subjectsList.length} enrolled subjects (${studentStats.totalUnits} Units).`
                    : 'No active course enrollments recorded for this academic term.'}
                </p>
              </div>

              <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-sage-800/80 pt-3 md:pt-0 md:pl-6 justify-between md:justify-end">
                <div>
                  <span className="text-[10px] font-bold text-sage-300 uppercase tracking-wider block">Cumulative GWA</span>
                  <span className="text-3xl sm:text-4xl font-extrabold font-mono text-sage-200">
                    {studentStats.gwa !== null && studentStats.gwa !== undefined && !isNaN(studentStats.gwa) 
                      ? Number(studentStats.gwa).toFixed(2) 
                      : '—'}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-sage-300 uppercase tracking-wider block">Dean's List Chance</span>
                  <span className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400">
                    {studentStats.gwa !== null ? `${studentStats.dlEligibility?.probabilityPct || 0}%` : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. SAGE AI Academic Advisor Guidance Box */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-sage-50 rounded-lg text-sage-600 border border-sage-100">
                    <BrainCircuit className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">SAGE AI Academic Counselor Guidance</h3>
                    <p className="text-[11px] text-slate-400">Personalized pedagogical analysis tailored to your official term milestones</p>
                  </div>
                </div>

                {hasOfficialMilestone && (
                  <button
                    onClick={handleRegenerateCurrentInsight}
                    disabled={aiLoading}
                    title="Generate fresh counseling guidance and update database record"
                    className="text-xs font-semibold text-slate-600 hover:text-sage-700 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={cn("h-3.5 w-3.5 text-sage-600", aiLoading && "animate-spin")} />
                    <span>{aiLoading ? "Consulting AI..." : "Regenerate"}</span>
                  </button>
                )}
              </div>

              <div className="text-xs sm:text-sm font-medium text-slate-700 leading-relaxed bg-slate-50/70 border border-slate-200/80 rounded-xl p-4 sm:p-5">
                {aiLoading && !aiCache['overall'] ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 py-1">
                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-sage-600"></div>
                    <span>Synthesizing customized AI Counselor advice...</span>
                  </div>
                ) : !hasEnrolledSubjects ? (
                  <div className="flex items-start gap-3 py-1 text-slate-500 not-italic">
                    <Info className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-slate-700">No Enrolled Courses Found</p>
                      <p className="text-xs text-slate-500 font-normal mt-0.5">
                        Counselor guidance will become active once you are enrolled in subjects and official term grades are posted.
                      </p>
                    </div>
                  </div>
                ) : !hasOfficialMilestone ? (
                  <div className="flex items-start gap-3 py-1 text-slate-600 not-italic">
                    <Clock className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-slate-800">Awaiting Official Midterm or Final Grades</p>
                      <p className="text-xs text-slate-500 font-normal mt-1 leading-relaxed">
                        Personalized AI counselor analysis and trajectory forecasts are officially generated once your instructors finalize and publish Midterm Ratings (MR) or Final Semestral Grades (SG). Check back once the milestone evaluation period is completed.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="italic text-slate-800">
                    "{aiCache['overall'] || studentStats.aiSummary || 'Maintain consistent attendance and active participation across all enrolled subjects.'}"
                  </p>
                )}
              </div>
            </div>

            {/* 3. Component Strength & Weakness Diagnostic Grid */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-sage-600" />
                  <h3 className="text-sm font-bold text-slate-900">Component Strength & Weakness Diagnosis</h3>
                </div>
                <span className="text-[11px] text-slate-400 font-medium">Weights: 50% Activities | 40% Exams | 10% Character</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
                
                {/* Metric 1: Class Standing */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Class Standing (50%)</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                      {studentStats.diagnostics.csAvg >= 85 ? 'Strong Asset' : studentStats.diagnostics.csAvg > 0 ? 'Moderate' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-extrabold font-mono text-slate-800">
                      {studentStats.diagnostics.csAvg > 0 ? `${studentStats.diagnostics.csAvg}%` : '—'}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">Activities & Quizzes</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${studentStats.diagnostics.csAvg || 0}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {studentStats.diagnostics.csAvg > 0 
                      ? "Reliable assignment completion. Keep submitting deliverables on schedule."
                      : "Class standing scores will compile as activities are graded."}
                  </p>
                </div>

                {/* Metric 2: Major Term Exams */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Major Exams (40%)</span>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                      studentStats.diagnostics.examAvg === 0
                        ? "bg-slate-50 text-slate-500 border-slate-200"
                        : studentStats.diagnostics.examAvg < 80 
                          ? "bg-amber-50 text-amber-700 border-amber-200" 
                          : "bg-emerald-50 text-emerald-700 border-emerald-100"
                    )}>
                      {studentStats.diagnostics.examAvg === 0 ? 'Pending' : studentStats.diagnostics.examAvg < 80 ? 'Primary Growth Area' : 'Solid'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-extrabold font-mono text-slate-800">
                      {studentStats.diagnostics.examAvg > 0 ? `${studentStats.diagnostics.examAvg}%` : '—'}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">Major Milestone Tests</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        studentStats.diagnostics.examAvg < 80 ? "bg-amber-500" : "bg-emerald-500"
                      )} 
                      style={{ width: `${studentStats.diagnostics.examAvg || 0}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {studentStats.diagnostics.examAvg > 0 
                      ? (studentStats.diagnostics.examAvg < 80 ? "Exam marks average lower than class standing. Allocate more time for test prep." : "Balanced exam performance across active subjects.")
                      : "Major exam performance is measured upon completion of term examinations."}
                  </p>
                </div>

                {/* Metric 3: Attendance Reliability */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attendance (FDA Risk)</span>
                    <span className={cn(
                      "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                      studentStats.diagnostics.absentCount >= 3 
                        ? "bg-rose-50 text-rose-700 border-rose-200" 
                        : "bg-emerald-50 text-emerald-700 border-emerald-100"
                    )}>
                      {studentStats.diagnostics.absentCount >= 3 ? 'Warning' : 'Good Standing'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-extrabold font-mono text-slate-800">{studentStats.diagnostics.attendanceRate}%</span>
                    <span className="text-xs text-slate-400 font-medium">{studentStats.diagnostics.absentCount}/4 Absences</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        studentStats.diagnostics.absentCount >= 3 ? "bg-rose-500" : "bg-emerald-500"
                      )} 
                      style={{ width: `${studentStats.diagnostics.attendanceRate}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {studentStats.diagnostics.absentCount >= 4 
                      ? "⚠️ FDA Flagged: Exceeded 4 institutional absences." 
                      : "Attendance is compliant with institutional regulations."}
                  </p>
                </div>

                {/* Metric 4: Character & Values */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-2 shadow-2xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Character (10%)</span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                      {studentStats.diagnostics.charAvg > 0 ? 'Exemplary' : 'Pending'}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-extrabold font-mono text-slate-800">
                      {studentStats.diagnostics.charAvg > 0 ? `${studentStats.diagnostics.charAvg}%` : '—'}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">Conduct & Ethics</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div 
                      className="bg-indigo-500 h-full rounded-full transition-all duration-500" 
                      style={{ width: `${studentStats.diagnostics.charAvg || 0}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {studentStats.diagnostics.charAvg > 0
                      ? "Strong collaborative etiquette and proactive classroom discipline."
                      : "Character ratings encoded periodically by subject faculty."}
                  </p>
                </div>

              </div>
            </div>

            {/* 4. Interactive "What-If" Final Exam Grade Simulator */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600 border border-indigo-100">
                    <Calculator className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Interactive "What-If" Grade Simulator</h3>
                    <p className="text-[11px] text-slate-400">Calculate the exact score needed on your Final Exam to reach your desired grade</p>
                  </div>
                </div>

                {/* Course Picker for Simulator */}
                {subjectsList.length > 0 ? (
                  <select
                    value={simSubjectCode}
                    onChange={(e) => setSimSubjectCode(e.target.value)}
                    className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 outline-none focus:ring-1 focus:ring-sage-500"
                  >
                    {subjectsList.map(s => (
                      <option key={s.code} value={s.code}>
                        {s.code} - {s.name} (Running GWA: {s.runningGwa})
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-slate-400 italic">No courses enrolled</span>
                )}
              </div>

              {/* Target Grade Selector Buttons */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Select Target Semestral GWA Milestone:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
                  {GWA_TARGET_BENCHMARKS.slice(0, 6).map((b) => (
                    <button
                      key={b.gwa}
                      onClick={() => setSimTargetGwa(b.gwa)}
                      className={cn(
                        "flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer",
                        simTargetGwa === b.gwa
                          ? "bg-sage-600 text-white border-sage-600 shadow-sm font-bold scale-[1.02]"
                          : "bg-slate-50 text-slate-700 border-slate-200/80 hover:bg-slate-100"
                      )}
                    >
                      <span className="text-xs font-extrabold font-mono">{b.gwa}</span>
                      <span className={cn(
                        "text-[9px] font-medium leading-tight mt-0.5",
                        simTargetGwa === b.gwa ? "text-sage-100" : "text-slate-400"
                      )}>
                        {b.label.split('(')[0]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Simulation Result Card */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                
                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Required Final Exam Score</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-extrabold font-mono text-slate-900">
                      {simResult.requiredExamScore} <span className="text-base text-slate-400">/ 40 pts</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Exam target equivalent to <strong>{Math.round((simResult.requiredExamScore / 40) * 100)}%</strong>
                  </p>
                </div>

                <div className="space-y-1 border-t md:border-t-0 md:border-l md:border-r border-slate-200 pt-3 md:pt-0 md:px-4">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target Term Milestone</span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-extrabold font-mono text-slate-800">
                      {simResult.requiredFinalTermRating}%
                    </span>
                    <span className="text-xs text-slate-500 font-medium">Final Rating</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Requires Tentative Final Rating (TFR) of <strong>{simResult.requiredTfr}%</strong>
                  </p>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Feasibility Verdict</span>
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-xs font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1.5",
                      simResult.difficulty === 'Easy' && "bg-emerald-100 text-emerald-800 border-emerald-200",
                      simResult.difficulty === 'Moderate' && "bg-sage-100 text-sage-800 border-sage-200",
                      simResult.difficulty === 'Challenging' && "bg-amber-100 text-amber-800 border-amber-200",
                      simResult.difficulty === 'Impossible' && "bg-rose-100 text-rose-800 border-rose-200"
                    )}>
                      {simResult.difficulty === 'Impossible' ? <AlertTriangle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      {simResult.difficulty === 'Impossible' ? 'Mathematically Out of Reach' : `${simResult.difficulty} Target`}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {simResult.difficulty === 'Impossible' 
                      ? "Even with 100% on Finals, target cannot be met. Select a reachable benchmark like 2.00 or 2.25."
                      : "Realistic target with focused revision and consistent assignment scores."}
                  </p>
                </div>

              </div>
            </div>

            {/* 5. 3-Pillar Actionable Prescriptions */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Compass className="h-4 w-4 text-sage-600" />
                <h3 className="text-sm font-bold text-slate-900">3-Pillar Actionable Prescription</h3>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Pillar 1: Priority Course Focus */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center gap-2 text-sage-700">
                    <Target className="h-4 w-4 text-sage-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">1. Priority Subject Focus</h4>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-extrabold text-slate-900">
                      {studentStats.prioritySubject ? `${studentStats.prioritySubject.code} (${studentStats.prioritySubject.name})` : 'Awaiting Course Enrollment'}
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">
                      {studentStats.prioritySubject 
                        ? `Currently standing at GWA ${studentStats.prioritySubject.runningGwa}. Bringing this course to 1.75 will significantly improve your overall honors eligibility.`
                        : 'Course recommendations will appear once enrolled in active subjects.'}
                    </p>
                  </div>
                </div>

                {/* Pillar 2: Component Strategy */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center gap-2 text-amber-700">
                    <Sliders className="h-4 w-4 text-amber-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">2. Component Strategy</h4>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-extrabold text-slate-900">
                      Test Prep & Timed Quizzes
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">
                      {studentStats.diagnostics.csAvg > 0 
                        ? `Class standing average stands at ${studentStats.diagnostics.csAvg}%. Focus on active recall and practice tests before major milestone exams.`
                        : 'Prepare organized study schedules for upcoming term assessments and quizzes.'}
                    </p>
                  </div>
                </div>

                {/* Pillar 3: Faculty Consultation */}
                <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 space-y-2.5 shadow-2xs">
                  <div className="flex items-center gap-2 text-indigo-700">
                    <UserCheck className="h-4 w-4 text-indigo-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider">3. Instructor Consultation</h4>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-extrabold text-slate-900">
                      {studentStats.prioritySubject?.instructor || 'Department Faculty Advisor'}
                    </p>
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">
                      Schedule a 15-minute consultation to review challenging topics from earlier exams prior to the upcoming term assessment.
                    </p>
                  </div>
                </div>

              </div>
            </div>

            {/* 6. Active Courses Running Standing Table */}
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-6 space-y-3">
              <h3 className="text-sm font-bold text-slate-900">Active Course Standing & Progress</h3>
              {subjectsList.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <BookOpen className="h-6 w-6 text-slate-300 mx-auto mb-1.5" />
                  <p className="font-semibold text-slate-600">No Enrolled Subjects Found</p>
                  <p className="text-[11px]">Enrolled courses for this academic term will appear here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        <th className="py-2.5 px-3">Subject Code & Name</th>
                        <th className="py-2.5 px-3">Instructor</th>
                        <th className="py-2.5 px-3 text-center">Units</th>
                        <th className="py-2.5 px-3 text-center">Class Standing</th>
                        <th className="py-2.5 px-3 text-center">Running GWA</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {subjectsList.map((sub) => (
                        <tr key={sub.code} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-3">
                            <span className="font-bold text-slate-900 block">{sub.code}</span>
                            <span className="text-[11px] text-slate-400">{sub.name}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-600">{sub.instructor}</td>
                          <td className="py-3 px-3 text-center font-mono">{sub.credits}</td>
                          <td className="py-3 px-3 text-center font-mono">
                            {sub.diagnostics?.csAvg > 0 ? `${sub.diagnostics.csAvg}%` : '—'}
                          </td>
                          <td className="py-3 px-3 text-center">
                            <span className="font-extrabold font-mono text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                              {sub.runningGwa}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            {sub.runningGwa !== '—' ? (
                              <span className={cn(
                                "text-[10px] font-bold px-2 py-0.5 rounded-full",
                                parseFloat(sub.runningGwa) <= 1.75 ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-amber-50 text-amber-700 border border-amber-100"
                              )}>
                                {parseFloat(sub.runningGwa) <= 1.75 ? 'Honors Tier' : 'Passing Range'}
                              </span>
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                Ongoing
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        ) : (
          /* ================= SUBJECT & MILESTONE BREAKDOWN ================= */
          <div className="space-y-5 sm:space-y-6 animate-fade-in">
            
            {/* Subject Selector Tabs */}
            {subjectsList.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-xs bg-white rounded-2xl border border-dashed border-slate-200">
                <BookOpen className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                <p className="font-semibold text-slate-700 text-sm">No Courses Available</p>
                <p className="text-xs text-slate-400 mt-1">Enroll in subjects to view course-by-course milestone breakdowns and diagnostics.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                  {subjectsList.map(sub => (
                    <button
                      key={sub.code}
                      onClick={() => setSelectedSubjectCode(sub.code)}
                      className={cn(
                        "px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border cursor-pointer",
                        selectedSubjectCode === sub.code
                          ? "bg-sage-900 text-white border-sage-900 shadow-xs font-bold"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      )}
                    >
                      {sub.code} - {sub.name}
                    </button>
                  ))}
                </div>

                {currentSubject && (
                  <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 sm:p-7 space-y-6">
                    
                    {/* Course Header Banner */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-sage-700 uppercase tracking-wider bg-sage-50 px-2 py-0.5 rounded border border-sage-200">
                          {currentSubject.credits} Academic Credits
                        </span>
                        <h3 className="text-lg sm:text-xl font-extrabold text-slate-900">
                          {currentSubject.code} — {currentSubject.name}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">Instructor: {currentSubject.instructor}</p>
                      </div>

                      <div className="text-left sm:text-right">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Running Course Grade</span>
                        <span className="text-2xl sm:text-3xl font-extrabold font-mono text-sage-800">{currentSubject.runningGwa}</span>
                      </div>
                    </div>

                    {/* Milestone Progression Selector */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Select Grading Milestone:</span>
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-1.5">
                        {Object.entries(PERIODS_MAPPING).map(([key]) => {
                          const periodData = currentSubject.periods?.[key];
                          const isAvailable = periodData && periodData.gwa !== '—';
                          return (
                            <button
                              key={key}
                              onClick={() => setSelectedPeriod(key)}
                              className={cn(
                                "p-2 rounded-xl text-center border transition-all cursor-pointer flex flex-col items-center justify-center",
                                selectedPeriod === key
                                  ? "bg-sage-600 text-white border-sage-600 shadow-xs font-bold"
                                  : "bg-slate-50 text-slate-700 border-slate-200/70 hover:bg-slate-100"
                              )}
                            >
                              <span className="text-[11px] font-bold truncate max-w-full">
                                {key === 'midtermRating' ? 'MR' : key === 'tentativeFinalRating' ? 'TFR' : key === 'semestralGrade' ? 'SG' : key.charAt(0).toUpperCase() + key.slice(1)}
                              </span>
                              <span className={cn(
                                "text-[10px] font-mono mt-0.5",
                                selectedPeriod === key ? "text-sage-100 font-bold" : isAvailable ? "text-slate-900 font-bold" : "text-slate-400"
                              )}>
                                {periodData?.gwa || '—'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Selected Period Metrics & AI Guidance */}
                    {currentSubject.periods?.[selectedPeriod] && currentSubject.periods[selectedPeriod].gwa !== '—' ? (
                      <div className="space-y-4 pt-2">
                        
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Numerical Rating</span>
                            <span className="text-xl font-extrabold font-mono text-slate-800 mt-1 block">
                              {currentSubject.periods[selectedPeriod].rating}%
                            </span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Transmuted GWA</span>
                            <span className="text-xl font-extrabold font-mono text-sage-700 mt-1 block">
                              {currentSubject.periods[selectedPeriod].gwa}
                            </span>
                          </div>

                          <div className="bg-slate-50 border border-slate-200/70 rounded-xl p-3.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Posting Status</span>
                            <span className={cn(
                              "text-xs font-bold px-2 py-0.5 rounded-full inline-block mt-1",
                              currentSubject.periods[selectedPeriod].status === 'Posted' 
                                ? "bg-emerald-100 text-emerald-800" 
                                : "bg-amber-100 text-amber-800"
                            )}>
                              {currentSubject.periods[selectedPeriod].status}
                            </span>
                          </div>
                        </div>

                        {/* Milestone AI Counselor Insight */}
                        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-2.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-sage-700">
                              <BrainCircuit className="h-4 w-4" />
                              <h4 className="text-xs font-bold uppercase tracking-wider">Milestone Diagnostic Insight</h4>
                            </div>
                            <button
                              onClick={handleRegenerateCurrentInsight}
                              disabled={aiLoading}
                              className="text-[11px] font-semibold text-slate-500 hover:text-sage-600 flex items-center gap-1 transition-colors px-2 py-0.5 rounded-md hover:bg-slate-100 cursor-pointer disabled:opacity-50"
                            >
                              <RefreshCw className={cn("h-3 w-3", aiLoading && "animate-spin text-sage-600")} />
                              <span>{aiLoading ? "Consulting..." : "Regenerate"}</span>
                            </button>
                          </div>

                          <div className="text-xs sm:text-sm font-medium text-slate-700 leading-relaxed italic bg-slate-50 p-3.5 rounded-lg border border-slate-200/60">
                            {aiLoading && !aiCache[`${currentSubject.code}_${selectedPeriod}`] ? (
                              <div className="flex items-center gap-2 text-xs text-slate-400 not-italic">
                                <div className="animate-spin rounded-full h-3.5 w-3.5 border-t-2 border-sage-600"></div>
                                Analyzing subject performance via AI...
                              </div>
                            ) : (
                              <p>"{aiCache[`${currentSubject.code}_${selectedPeriod}`] || currentSubject.periods[selectedPeriod].insight || 'No qualitative data compiled for this milestone.'}"</p>
                            )}
                          </div>
                        </div>

                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-400 text-xs space-y-1 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                        <AlertCircle className="h-6 w-6 text-slate-300 mx-auto" />
                        <p className="font-semibold text-slate-600">No evaluation data encoded for {PERIODS_MAPPING[selectedPeriod]}</p>
                        <p className="text-[11px]">Milestone scores will appear once graded by your instructor.</p>
                      </div>
                    )}

                  </div>
                )}
              </>
            )}

          </div>
        )}

      </div>
    </>
  );
}
