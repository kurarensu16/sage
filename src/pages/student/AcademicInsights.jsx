import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { useAuth } from '../../lib/AuthContext';
import { supabase } from '../../lib/supabase';
import { 
  BrainCircuit, 
  TrendingUp, 
  AlertCircle, 
  CheckCircle2, 
  HelpCircle,
  GraduationCap,
  BookOpen
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { getAiAcademicInsight } from '../../lib/openrouter';

// Helper to transmute raw scores to DYCI standard grades
const getTransmutedGrade = (score) => {
  if (score >= 98) return 1.00;
  if (score >= 95) return 1.25;
  if (score >= 92) return 1.50;
  if (score >= 89) return 1.75;
  if (score >= 86) return 2.00;
  if (score >= 83) return 2.25;
  if (score >= 80) return 2.50;
  if (score >= 77) return 2.75;
  if (score >= 75) return 3.00;
  return 5.00;
};

// Helper to calculate term ratings from draft scores
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

// Fallback Mock Data matching Part 1.5 of the Redesign Spec
const mockInsightsData = {
  summary: "All subjects are passing safely. Keep it up! You are in prime standing to qualify for Honors this semester.",
  verdict: "continue",
  basis_snapshot: {
    student: {
      name: "Sarah Jenkins",
      gwa: 1.45,
      standing: "Excellent",
      dlEligibility: {
        awardCategory: "1st Class Dean's Lister",
        probabilityPct: 94,
        message: "Your current average of 1.45 qualifies you for 1st Class Dean's Lister honors! Keep your final semestral grades below 1.50 to secure the award."
      }
    },
    subjects: [
      {
        code: "IT101",
        name: "Introduction to Computing",
        credits: 3.0,
        instructor: "Prof. Amanda Rivera",
        periods: {
          prelim: {
            rating: 91,
            gwa: "1.75",
            status: "Posted",
            insight: "Strong start with a 1.75 in the Prelims! Your laboratory outputs were close to perfect."
          },
          midterm: {
            rating: 87,
            gwa: "2.00",
            status: "Posted",
            insight: "A minor midterm quiz dip slowed your pace slightly, but you remain highly competitive."
          },
          midtermRating: {
            rating: 89,
            gwa: "1.85",
            status: "Posted",
            insight: "Your official Midterm Rating stands at a solid 1.85. Safe and robust standing."
          },
          semiFinal: {
            rating: 91,
            gwa: "1.75",
            status: "Posted",
            insight: "Excellent recovery in the Semi-Final proofs! You brought your average back up."
          },
          final: {
            rating: 91,
            gwa: "1.75",
            status: "Draft",
            insight: "Final grading components are drafted at 1.75. Awaiting registrar release."
          },
          tentativeFinalRating: {
            rating: 91,
            gwa: "1.75",
            status: "Draft",
            insight: "Tentative final rating projects at a 1.75, keeping your GWA targets well in hand."
          },
          semestralGrade: {
            rating: 90,
            gwa: "1.80",
            status: "Draft",
            insight: "Your predicted semestral grade of 1.80 guarantees a secure pass and keeps you on the honor roll."
          }
        }
      },
      {
        code: "IT201",
        name: "Data Structures & Algorithms",
        credits: 3.0,
        instructor: "Dr. Carlos Valdes",
        periods: {
          prelim: {
            rating: 92,
            gwa: "1.50",
            status: "Posted",
            insight: "Great start in complex data structures. Lab outputs are excellent."
          },
          midterm: {
            rating: 0,
            gwa: "—",
            status: "Pending",
            insight: "Midterm grades are currently being processed by the department."
          },
          midtermRating: {
            rating: 0,
            gwa: "—",
            status: "Pending",
            insight: "Not yet compiled. Awaiting both term marks."
          },
          semiFinal: {
            rating: 0,
            gwa: "—",
            status: "Pending",
            insight: "Pending semi-final exams."
          },
          final: {
            rating: 0,
            gwa: "—",
            status: "Pending",
            insight: "Pending final deliverables."
          },
          tentativeFinalRating: {
            rating: 0,
            gwa: "—",
            status: "Pending",
            insight: "Pending tentative final rating collation."
          },
          semestralGrade: {
            rating: 0,
            gwa: "—",
            status: "Pending",
            insight: "Pending final semestral posting."
          }
        }
      }
    ]
  }
};

export default function AcademicInsights() {
  const { user, profile } = useAuth();
  const [insight, setInsight] = useState(null);
  const [loading, setLoading] = useState(true);

  // Selector states
  const [scope, setScope] = useState('overall'); // 'overall' or 'subject'
  const [selectedSubjectCode, setSelectedSubjectCode] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('semestralGrade');

  // AI Guidance states
  const [aiCache, setAiCache] = useState({});
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    async function loadInsights() {
      if (!user) return;
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('student_academic_insights')
          .select('*')
          .eq('student_id', user.id)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) {
          console.warn("Could not load pre-generated student insights, trying dynamic calculation:", error);
        }
        if (data) {
          setInsight(data);
          if (data.basis_snapshot?.subjects?.length > 0) {
            setSelectedSubjectCode(data.basis_snapshot.subjects[0].code);
          }
        } else {
          // DATABASE FALLBACK ROUTE: Fetch the student's real data
          const { data: enrollsCheck } = await supabase
            .from('enrollments')
            .select('section_id')
            .eq('student_id', user.id);

          const activeSectionId = profile?.section_id || (enrollsCheck && enrollsCheck.length > 0 ? enrollsCheck[0].section_id : null);

          if (activeSectionId) {
            // 1. Fetch enrollments
            const { data: enrolls } = await supabase
              .from('enrollments')
              .select('subject_id, subjects(*)')
              .eq('student_id', user.id)
              .eq('section_id', activeSectionId);

            const subjectIds = enrolls?.map(e => e.subject_id) || [];

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
                .in('class_record_id', classRecordIds);

              const { data: drafts } = await supabase
                .from('student_term_scores')
                .select('*')
                .eq('student_id', user.id)
                .in('class_record_id', classRecordIds);

              const { data: gradingCols } = await supabase
                .from('class_grading_columns')
                .select('*')
                .in('class_record_id', classRecordIds);

              const subMap = {};
              enrolls?.forEach(e => {
                if (e.subjects) {
                  subMap[e.subject_id] = e.subjects;
                }
              });

              const postedMap = {};
              posted?.forEach(p => {
                if (!postedMap[p.class_record_id]) postedMap[p.class_record_id] = [];
                postedMap[p.class_record_id].push(p);
              });

              const draftsMap = {};
              drafts?.forEach(d => {
                if (!draftsMap[d.class_record_id]) draftsMap[d.class_record_id] = {};
                draftsMap[d.class_record_id][d.term] = d;
              });

              const colsMap = {};
              gradingCols?.forEach(c => {
                if (!colsMap[c.class_record_id]) colsMap[c.class_record_id] = {};
                colsMap[c.class_record_id][c.term] = {
                  act1: c.act1_max,
                  act2: c.act2_max,
                  act3: c.act3_max,
                  act4: c.act4_max,
                  act5: c.act5_max,
                  act6: c.act6_max,
                  exam: c.exam_max
                };
              });

              let totalRunningUnits = 0;
              let weightedRunningSum = 0;

              const computedSubjectsList = (classRecords || [])
                .filter(cr => subMap[cr.subject_id])
                .map(cr => {
                  const subj = subMap[cr.subject_id];

                  const crPosted = postedMap[cr.class_record_id] || [];
                  const crDrafts = draftsMap[cr.class_record_id] || {};
                  const crCols = colsMap[cr.class_record_id] || {};

                  const getTermRating = (termName) => {
                    const dbTermKey = termName.toLowerCase().replace('-', '_');
                    const postedRow = crPosted.find(p => p.grade_period === dbTermKey);
                    if (postedRow) {
                      const rating = parseFloat(postedRow.computed_grade);
                      const gwa = postedRow.effective_grade !== null 
                        ? postedRow.effective_grade.toFixed(2) 
                        : getTransmutedGrade(parseFloat(postedRow.computed_grade)).toFixed(2);
                      return {
                        rating,
                        gwa,
                        status: 'Posted',
                        insight: generateDynamicInsight(termName, rating, gwa, 'Posted')
                      };
                    }
                    const draftRow = crDrafts[termName];
                    if (draftRow) {
                      const hasScores = 
                        (draftRow.act1 && draftRow.act1 > 0) ||
                        (draftRow.act2 && draftRow.act2 > 0) ||
                        (draftRow.act3 && draftRow.act3 > 0) ||
                        (draftRow.act4 && draftRow.act4 > 0) ||
                        (draftRow.act5 && draftRow.act5 > 0) ||
                        (draftRow.act6 && draftRow.act6 > 0) ||
                        (draftRow.char_rating && draftRow.char_rating > 0) ||
                        (draftRow.exam && draftRow.exam > 0);
                      
                      if (!hasScores) return { rating: 0, gwa: '—', status: 'Pending', insight: `Awaiting term evaluation components.` };
                      
                      const computedRating = calculateTermRating(draftRow, crCols[termName]);
                      const computedGwa = getTransmutedGrade(computedRating).toFixed(2);
                      return {
                        rating: computedRating,
                        gwa: computedGwa,
                        status: 'Draft',
                        insight: generateDynamicInsight(termName, computedRating, computedGwa, 'Draft')
                      };
                    }
                    return { rating: 0, gwa: '—', status: 'Pending', insight: `Awaiting term evaluation components.` };
                  };

                  const prelim = getTermRating('Prelim');
                  const midterm = getTermRating('Midterm');
                  
                  let mr = { rating: 0, gwa: '—', status: 'Pending', insight: `Awaiting Prelim and Midterm components.` };
                  if (prelim.gwa !== '—' && midterm.gwa !== '—') {
                    const avgRating = Math.round((prelim.rating + midterm.rating) / 2);
                    const avgGwa = getTransmutedGrade(avgRating).toFixed(2);
                    const status = prelim.status === 'Posted' && midterm.status === 'Posted' ? 'Posted' : 'Draft';
                    mr = {
                      rating: avgRating,
                      gwa: avgGwa,
                      status,
                      insight: generateDynamicInsight('Midterm Rating', avgRating, avgGwa, status)
                    };
                  }

                  const semiFinal = getTermRating('Semi-Final');
                  const final = getTermRating('Final');

                  let tentativeFinalRating = { rating: 0, gwa: '—', status: 'Pending', insight: `Awaiting Semi-Final and Final components.` };
                  if (semiFinal.gwa !== '—' && final.gwa !== '—') {
                    const avgRating = Math.round((semiFinal.rating + final.rating) / 2);
                    const avgGwa = getTransmutedGrade(avgRating).toFixed(2);
                    const status = semiFinal.status === 'Posted' && final.status === 'Posted' ? 'Posted' : 'Draft';
                    tentativeFinalRating = {
                      rating: avgRating,
                      gwa: avgGwa,
                      status,
                      insight: generateDynamicInsight('Tentative Final Rating', avgRating, avgGwa, status)
                    };
                  }

                  let semestralGrade = { rating: 0, gwa: '—', status: 'Pending', insight: `Awaiting complete term components.` };
                  if (mr.gwa !== '—' && tentativeFinalRating.gwa !== '—') {
                    const avgRating = Math.round((mr.rating + tentativeFinalRating.rating) / 2);
                    const avgGwa = getTransmutedGrade(avgRating).toFixed(2);
                    const status = mr.status === 'Posted' && tentativeFinalRating.status === 'Posted' ? 'Posted' : 'Draft';
                    semestralGrade = {
                      rating: avgRating,
                      gwa: avgGwa,
                      status,
                      insight: generateDynamicInsight('Semestral Grade', avgRating, avgGwa, status)
                    };
                  }

                  let runningGwaVal = null;
                  if (semestralGrade.gwa !== '—') runningGwaVal = parseFloat(semestralGrade.gwa);
                  else if (tentativeFinalRating.gwa !== '—') runningGwaVal = parseFloat(tentativeFinalRating.gwa);
                  else if (mr.gwa !== '—') runningGwaVal = parseFloat(mr.gwa);
                  else if (prelim.gwa !== '—') runningGwaVal = parseFloat(prelim.gwa);

                  if (runningGwaVal !== null && !isNaN(runningGwaVal)) {
                    totalRunningUnits += subj.units;
                    weightedRunningSum += runningGwaVal * subj.units;
                  }

                  return {
                    code: subj.code,
                    name: subj.name,
                    credits: subj.units,
                    instructor: cr.faculty ? `Prof. ${cr.faculty.first_name} ${cr.faculty.last_name}` : 'TBA',
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

              if (totalRunningUnits > 0) {
                const computedGwa = parseFloat((weightedRunningSum / totalRunningUnits).toFixed(2));
                
                let gwaStanding = 'Satisfactory';
                if (computedGwa <= 1.45) gwaStanding = 'Excellent';
                else if (computedGwa <= 1.75) gwaStanding = 'Very Good';
                else if (computedGwa > 3.00) gwaStanding = 'Academic Warning';

                // Latin Honors / DL eligibility rule: lowest individual course grade must be <= 2.00
                const hasDisqualifyingGrade = computedSubjectsList.some(sub => {
                  let runningGwaVal = null;
                  const semGrade = sub.periods?.semestralGrade;
                  const tentativeFinal = sub.periods?.tentativeFinalRating;
                  const mr = sub.periods?.midtermRating;
                  const prelim = sub.periods?.prelim;

                  if (semGrade && semGrade.gwa !== '—') runningGwaVal = parseFloat(semGrade.gwa);
                  else if (tentativeFinal && tentativeFinal.gwa !== '—') runningGwaVal = parseFloat(tentativeFinal.gwa);
                  else if (mr && mr.gwa !== '—') runningGwaVal = parseFloat(mr.gwa);
                  else if (prelim && prelim.gwa !== '—') runningGwaVal = parseFloat(prelim.gwa);

                  return runningGwaVal !== null && !isNaN(runningGwaVal) && runningGwaVal > 2.00;
                });

                let dlCategory = 'Not Eligible';
                let dlProbability = 0;
                let dlMessage = 'Your current average does not qualify for Dean\'s Lister honors. Focus on upcoming milestones to improve your score.';
                
                if (hasDisqualifyingGrade) {
                  dlCategory = 'Not Eligible';
                  dlProbability = 0;
                  dlMessage = 'You are currently disqualified from Dean\'s Lister or Latin Honors because you have one or more courses with a grade lower than 2.00 (e.g. 2.25 or worse). Maintain a grade of 2.00 or better in all individual courses to qualify.';
                } else if (computedGwa <= 1.45) {
                  dlCategory = '1st Class Dean\'s Lister';
                  dlProbability = 94;
                  dlMessage = `Your current average of ${computedGwa.toFixed(2)} qualifies you for 1st Class Dean's Lister honors! Keep your final semestral grades below 1.50 and all individual grades at 2.00 or better to secure the award.`;
                } else if (computedGwa <= 1.75) {
                  dlCategory = '2nd Class Dean\'s Lister';
                  dlProbability = 85;
                  dlMessage = `Your current average of ${computedGwa.toFixed(2)} qualifies you for 2nd Class Dean's Lister honors! Try to increase your average to 1.45 to qualify for 1st Class honors, and ensure no individual grade drops below 2.00.`;
                }

                let summary = `Your running average across all subjects is ${computedGwa.toFixed(2)} (${gwaStanding} standing). `;
                if (computedGwa <= 1.75) {
                  summary += 'You are in prime standing to qualify for Honors this semester. Keep it up!';
                } else if (computedGwa <= 3.00) {
                  summary += 'All subjects are passing safely. Maintain your study consistency to secure a strong finish.';
                } else {
                  summary += 'Warning: Academic thresholds are falling. Remediation or tutoring recommended to secure passing grades.';
                }

                const calculatedSnapshot = {
                  summary,
                  verdict: computedGwa <= 1.75 ? 'continue' : (computedGwa <= 3.00 ? 'borderline' : 'at_risk'),
                  basis_snapshot: {
                    student: {
                      name: `${profile?.first_name || 'Student'} ${profile?.last_name || ''}`,
                      gwa: computedGwa,
                      standing: gwaStanding,
                      dlEligibility: {
                        awardCategory: dlCategory,
                        probabilityPct: dlProbability,
                        message: dlMessage
                      }
                    },
                    subjects: computedSubjectsList
                  }
                };

                setInsight(calculatedSnapshot);
                if (computedSubjectsList.length > 0) {
                  setSelectedSubjectCode(computedSubjectsList[0].code);
                }
                setLoading(false);
                return;
              }
            }
          }
          setSelectedSubjectCode(mockInsightsData.basis_snapshot.subjects[0].code);
        }
      } catch (err) {
        console.error("Error loading student insights:", err);
        setSelectedSubjectCode(mockInsightsData.basis_snapshot.subjects[0].code);
      } finally {
        setLoading(false);
      }
    }
    loadInsights();
  }, [user, profile]);

  const activeData = insight || mockInsightsData;
  const snapshot = activeData.basis_snapshot;
  const studentStats = snapshot?.student || mockInsightsData.basis_snapshot.student;
  const subjectsList = snapshot?.subjects || mockInsightsData.basis_snapshot.subjects;

  const currentSubject = subjectsList.find(s => s.code === selectedSubjectCode) || subjectsList[0];

  const periodsMapping = {
    prelim: 'Prelim',
    midterm: 'Midterm',
    midtermRating: 'Midterm Rating (MR)',
    semiFinal: 'Semi-Final (SF)',
    final: 'Final',
    tentativeFinalRating: 'Tentative Final Rating (TFR)',
    semestralGrade: 'Semestral Grade (SG)'
  };

  const calculateRunningGwaForPeriod = (periodKey) => {
    const validGrades = subjectsList.filter(sub => {
      const g = sub.periods?.[periodKey];
      return g && g.gwa !== '—' && (g.status === 'Posted' || g.status === 'Draft');
    });
    if (validGrades.length === 0) return '—';
    const sum = validGrades.reduce((acc, sub) => acc + parseFloat(sub.periods[periodKey].gwa), 0);
    return (sum / validGrades.length).toFixed(2);
  };

  // Fetch LLM-generated guidance from OpenRouter on selection change
  useEffect(() => {
    if (loading || !user || !subjectsList || subjectsList.length === 0) return;

    let cacheKey = '';
    let payload = {};

    if (scope === 'overall') {
      cacheKey = 'overall';
      payload = {
        type: 'overall',
        studentName: studentStats.name || `${profile?.first_name || 'Student'} ${profile?.last_name || ''}`,
        gwa: studentStats.gwa,
        standing: studentStats.standing,
        dlCategory: studentStats.dlEligibility?.awardCategory || 'Not Eligible',
        dlProbability: studentStats.dlEligibility?.probabilityPct || 0,
        dlMessage: studentStats.dlEligibility?.message || '',
        subjects: subjectsList
      };
    } else {
      if (!currentSubject) return;
      cacheKey = `${currentSubject.code}_${selectedPeriod}`;
      const periodObj = currentSubject.periods?.[selectedPeriod] || {};
      payload = {
        type: 'subject',
        studentName: studentStats.name || `${profile?.first_name || 'Student'} ${profile?.last_name || ''}`,
        subjectCode: currentSubject.code,
        subjectName: currentSubject.name,
        credits: currentSubject.credits,
        instructor: currentSubject.instructor,
        periodLabel: periodsMapping[selectedPeriod],
        rating: periodObj.rating || 0,
        gwa: periodObj.gwa || '—',
        status: periodObj.status || 'Pending',
        allPeriods: currentSubject.periods || {}
      };
    }

    if (aiCache[cacheKey]) return; // Already fetched

    async function fetchAiGuidance() {
      setAiLoading(true);
      try {
        const result = await getAiAcademicInsight(payload);
        if (result) {
          setAiCache(prev => ({ ...prev, [cacheKey]: result }));
        }
      } catch (err) {
        console.warn("AI generation failed, relying on fallback.", err);
      } finally {
        setAiLoading(false);
      }
    }

    fetchAiGuidance();
  }, [scope, selectedSubjectCode, selectedPeriod, loading, subjectsList]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-xs text-slate-500 font-medium font-sans">Compiling Academic Insights...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Academic Insights" breadcrumb="Student Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 max-w-5xl mx-auto w-full space-y-4 sm:space-y-6">
        
        {/* Native Mobile App Style Segmented Scope Bar */}
        <div className="bg-slate-200/70 p-1 rounded-2xl shadow-inner grid grid-cols-2 gap-1">
          <button
            onClick={() => setScope('overall')}
            className={cn(
              "flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-xl transition-all cursor-pointer text-center select-none",
              scope === 'overall'
                ? "bg-white text-sage-900 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <BrainCircuit className="h-3.5 w-3.5 text-sage-600" />
            <span>Overall Standing</span>
          </button>

          <button
            onClick={() => setScope('subject')}
            className={cn(
              "flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-xl transition-all cursor-pointer text-center select-none",
              scope === 'subject'
                ? "bg-white text-slate-900 shadow-sm font-bold"
                : "text-slate-600 hover:text-slate-900"
            )}
          >
            <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
            <span>Subject Breakdown</span>
          </button>
        </div>

        {/* Dynamic Panel rendering */}
        {scope === 'overall' ? (
          /* OVERALL INSIGHTS PANEL */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 animate-fade-in">
            
            {/* Left/Main Column */}
            <div className="lg:col-span-2 space-y-4 sm:space-y-6">
              
              {/* Standings Hero banner */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-sage-900 to-slate-900 p-4 sm:p-6 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold text-sage-200 uppercase tracking-wider">Academic Honors Status</span>
                    <h2 className="text-lg sm:text-xl font-extrabold font-display uppercase tracking-tight flex items-center gap-2">
                      <GraduationCap className="h-5 w-5 text-sage-300 flex-shrink-0" />
                      {studentStats.standing} Standing
                    </h2>
                  </div>
                  <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-sage-800/80">
                    <span className="text-[10px] font-bold text-sage-200 uppercase tracking-wider block">Cumulative GWA</span>
                    <span className="text-2xl sm:text-3xl font-extrabold font-mono text-sage-300">{studentStats.gwa.toFixed(2)}</span>
                  </div>
                </div>

                {/* Dean's Lister projection card */}
                {studentStats.dlEligibility && (
                  <div className="p-4 sm:p-6 bg-sage-50/40 border-b border-slate-200 flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-center sm:text-left">
                    {/* Ring progress bar representation */}
                    <div className="relative flex items-center justify-center flex-shrink-0">
                      <svg className="w-16 h-16 sm:w-20 sm:h-20 transform -rotate-90">
                        <circle cx="32" cy="32" r="27" className="stroke-slate-200 sm:hidden" strokeWidth="5" fill="transparent" />
                        <circle 
                          cx="32" 
                          cy="32" 
                          r="27" 
                          className="stroke-sage-600 transition-all duration-500 sm:hidden" 
                          strokeWidth="5" 
                          fill="transparent" 
                          strokeDasharray={2 * Math.PI * 27}
                          strokeDashoffset={2 * Math.PI * 27 * (1 - studentStats.dlEligibility.probabilityPct / 100)}
                        />
                        <circle cx="40" cy="40" r="34" className="stroke-slate-200 hidden sm:block" strokeWidth="6" fill="transparent" />
                        <circle 
                          cx="40" 
                          cy="40" 
                          r="34" 
                          className="stroke-sage-600 transition-all duration-500 hidden sm:block" 
                          strokeWidth="6" 
                          fill="transparent" 
                          strokeDasharray={2 * Math.PI * 34}
                          strokeDashoffset={2 * Math.PI * 34 * (1 - studentStats.dlEligibility.probabilityPct / 100)}
                        />
                      </svg>
                      <span className="absolute text-xs sm:text-sm font-extrabold font-mono text-slate-800">
                        {studentStats.dlEligibility.probabilityPct}%
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      <h4 className="text-xs sm:text-sm font-extrabold text-slate-900">
                        🏆 Dean's Lister Projections ({studentStats.dlEligibility.awardCategory})
                      </h4>
                      <p className="text-xs text-slate-600 leading-relaxed font-medium">
                        {studentStats.dlEligibility.message}
                      </p>
                    </div>
                  </div>
                )}

                {/* Overall Summary Card */}
                <div className="p-4 sm:p-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-sage-600 flex-shrink-0" />
                    <h4 className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider">Academic Advisor Summary</h4>
                  </div>
                  <div className="text-xs sm:text-sm font-medium text-slate-700 leading-relaxed bg-slate-50 border border-slate-200/70 rounded-xl p-3.5 sm:p-4">
                    {aiLoading && !aiCache['overall'] ? (
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-sage-600"></div>
                        Generating AI Counselor advice...
                      </div>
                    ) : (
                      <p>"{aiCache['overall'] || activeData.summary}"</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Running Subject GWA Table/List */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-4 sm:p-6 space-y-4">
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900">Running Course Standing</h3>
                  <p className="text-[10px] text-slate-400 uppercase font-bold tracking-wide mt-0.5">Current GWA per active course</p>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-200/70 rounded-xl overflow-hidden">
                  {subjectsList.map((sub) => {
                    const semGrade = sub.periods?.semestralGrade;
                    const latestPosted = Object.values(sub.periods || {})
                      .reverse()
                      .find(p => p.status === 'Posted');

                    const displayGwa = semGrade?.gwa !== '—' && semGrade?.status === 'Posted' 
                      ? semGrade.gwa 
                      : (latestPosted ? latestPosted.gwa : '—');

                    const displayStatus = semGrade?.status === 'Posted' 
                      ? 'Posted to Final' 
                      : (latestPosted ? `Ongoing (${latestPosted.gwa !== '—' ? 'Posted' : 'Draft'})` : 'No scores posted');

                    return (
                      <div key={sub.code} className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50/40 transition-colors">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold font-mono text-slate-400">{sub.code}</span>
                            <span className="text-[10px] text-slate-400 font-medium sm:hidden">&bull; {sub.instructor}</span>
                          </div>
                          <h4 className="text-xs sm:text-sm font-bold text-slate-800 line-clamp-1">{sub.name}</h4>
                          <span className="text-[10px] text-slate-500 font-semibold hidden sm:block">{sub.instructor}</span>
                        </div>
                        <div className="flex items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                          <span className="text-[10px] text-slate-400 font-bold block">{displayStatus}</span>
                          <span className="inline-flex px-2.5 py-0.5 rounded-full text-xs font-bold bg-sage-50 text-sage-800 border border-sage-200">
                            {displayGwa} GWA
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Right Column: Mini Info Cards */}
            <div className="space-y-4 sm:space-y-6">
              {/* Verdict Indicator */}
              <div className={cn(
                "border rounded-2xl p-4 sm:p-5 shadow-sm space-y-3",
                activeData.verdict === 'continue' ? 'bg-sage-50/40 border-sage-200' : 
                activeData.verdict === 'at_risk' ? 'bg-rose-50/40 border-rose-200' : 'bg-amber-50/40 border-amber-200'
              )}>
                <div className="flex items-center gap-2">
                  <TrendingUp className={cn(
                    "h-4 w-4 sm:h-5 sm:w-5",
                    activeData.verdict === 'continue' ? 'text-sage-700' : 
                    activeData.verdict === 'at_risk' ? 'text-rose-700' : 'text-amber-700'
                  )} />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Standing Verdict</h3>
                </div>
                <div className="space-y-1">
                  <h4 className="text-sm sm:text-base font-extrabold text-slate-900 capitalize">
                    {activeData.verdict === 'continue' ? 'Pass & Continue' : activeData.verdict === 'at_risk' ? 'At Risk Warning' : 'Shift Advice'}
                  </h4>
                  <p className="text-[11px] text-slate-600 font-medium leading-relaxed">
                    {activeData.verdict === 'continue' ? 'No academic risk metrics detected. Keep up the high standard.' : 
                     activeData.verdict === 'at_risk' ? 'Alert: Academic performance thresholds are falling. Action recommended.' : 
                     'Recommended counseling session for academic trajectory realignment.'}
                  </p>
                </div>
              </div>

              {/* Guidelines summary widget */}
              <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-slate-400" />
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">How to Read GWA</h3>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed font-medium">
                  SAGE calculates ratings dynamically per term according to DYCI guidelines. Cumulative and running GPAs ignore all draft values to maintain absolute transcript integrity.
                </p>
              </div>
            </div>

          </div>
        ) : (
          /* SUBJECT-SPECIFIC DRILLDOWN PANEL */
          <div className="space-y-4 sm:space-y-6 animate-fade-in">
            
            {/* Top row filter selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 shadow-sm flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Course</label>
                <select
                  value={selectedSubjectCode}
                  onChange={(e) => setSelectedSubjectCode(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 hover:border-slate-300 outline-none cursor-pointer"
                >
                  {subjectsList.map(sub => (
                    <option key={sub.code} value={sub.code}>{sub.code}: {sub.name}</option>
                  ))}
                </select>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 sm:p-4 shadow-sm flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Grading Period</label>
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 hover:border-slate-300 outline-none cursor-pointer"
                >
                  {Object.entries(periodsMapping).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Drilldown details card */}
            {currentSubject && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden space-y-4">
                <div className="bg-slate-50 p-4 sm:p-6 border-b border-slate-200/80">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-extrabold font-mono text-sage-800 uppercase tracking-wider bg-sage-50 border border-sage-200 px-2.5 py-0.5 rounded-full">
                        {currentSubject.code}
                      </span>
                      <h2 className="text-base sm:text-lg font-bold text-slate-900 mt-2">{currentSubject.name}</h2>
                      <span className="text-xs text-slate-500 font-semibold block mt-0.5">Instructor: {currentSubject.instructor}</span>
                    </div>

                    <div className="bg-white border border-slate-200 px-3.5 py-2 rounded-xl shadow-xs self-start sm:self-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Running Period</span>
                      <span className="text-xs font-extrabold text-slate-800 uppercase font-mono mt-0.5 block">
                        {periodsMapping[selectedPeriod]}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Period details grid */}
                {currentSubject.periods?.[selectedPeriod] ? (
                  <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                      
                      {/* Metric 1: Rating */}
                      <div className="bg-slate-50/50 border border-slate-200/70 rounded-xl p-3 sm:p-4 flex flex-col justify-between min-h-[72px]">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Milestone Rating</span>
                        <h4 className="text-sm sm:text-base font-extrabold text-slate-900 mt-1">
                          {currentSubject.periods[selectedPeriod].rating > 0 
                            ? `${currentSubject.periods[selectedPeriod].rating}%` 
                            : '—'}
                          <span className={cn(
                            "inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold ml-1.5",
                            currentSubject.periods[selectedPeriod].status === 'Posted' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-amber-50 text-amber-800 border border-amber-200'
                          )}>
                            {currentSubject.periods[selectedPeriod].status}
                          </span>
                        </h4>
                      </div>

                      {/* Metric 2: GWA */}
                      <div className="bg-slate-50/50 border border-slate-200/70 rounded-xl p-3 sm:p-4 flex flex-col justify-between min-h-[72px]">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Equivalent GWA</span>
                        <h4 className="text-sm sm:text-base font-extrabold text-slate-900 font-mono mt-1">
                          {currentSubject.periods[selectedPeriod].gwa}
                        </h4>
                      </div>

                      {/* Metric 3: Credits */}
                      <div className="col-span-2 sm:col-span-1 bg-slate-50/50 border border-slate-200/70 rounded-xl p-3 sm:p-4 flex flex-col justify-between min-h-[72px]">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Academic Weight</span>
                        <h4 className="text-sm sm:text-base font-extrabold text-slate-900 mt-1">
                          {currentSubject.credits.toFixed(1)} Units
                        </h4>
                      </div>

                    </div>

                    {/* Milestone specific insight text */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-2.5 shadow-xs">
                      <div className="flex items-center gap-2 text-sage-700">
                        <BrainCircuit className="h-4 w-4 sm:h-4.5 sm:w-4.5" />
                        <h4 className="text-xs font-bold uppercase tracking-wider">Period Summary & Insight</h4>
                      </div>
                      <div className="text-xs sm:text-sm font-medium text-slate-700 leading-relaxed italic">
                        {aiLoading && !aiCache[`${currentSubject.code}_${selectedPeriod}`] ? (
                          <div className="flex items-center gap-2 text-xs text-slate-400 not-italic">
                            <div className="animate-spin rounded-full h-3 w-3 border-t-2 border-sage-600"></div>
                            Analyzing subject performance via AI...
                          </div>
                        ) : (
                          <p>"{aiCache[`${currentSubject.code}_${selectedPeriod}`] || currentSubject.periods[selectedPeriod].insight || 'No qualitative data compiled for this milestone.'}"</p>
                        )}
                      </div>
                    </div>

                    {/* Running period comparison block */}
                    <div className="bg-amber-50/20 border border-amber-200 rounded-xl p-3.5 sm:p-4 flex items-center gap-3">
                      <AlertCircle className="h-4.5 w-4.5 text-amber-600 flex-shrink-0" />
                      <div className="text-xs text-slate-650 font-medium leading-relaxed">
                        <strong>Period Note:</strong> The running GPA for all subjects under {periodsMapping[selectedPeriod]} is <strong>{calculateRunningGwaForPeriod(selectedPeriod)}</strong>.
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="p-8 sm:p-12 text-center text-slate-400 text-xs sm:text-sm space-y-2">
                    <AlertCircle className="h-7 w-7 text-slate-300 mx-auto" />
                    <p>No evaluation data encoded for this period.</p>
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </div>
    </>
  );
}
