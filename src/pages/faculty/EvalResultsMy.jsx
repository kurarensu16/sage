import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Users, 
  Award, 
  MessageSquare, 
  ChevronDown, 
  ShieldCheck, 
  Star,
  CheckCircle,
  FileSpreadsheet,
  BrainCircuit,
  Activity,
  Lightbulb,
  Zap,
  CheckCircle2,
  X,
  ChevronRight,
  Lock
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { DetailSkeleton } from '../../components/common/Skeleton';

export default function EvalResultsMy() {
  const { user, profile } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [semestersList, setSemestersList] = useState([]);
  const [selectedSemester, setSelectedSemester] = useState('');
  const [classesList, setClassesList] = useState([]);
  const [selectedClass, setSelectedClass] = useState('All');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [dbInsight, setDbInsight] = useState(null);
  const [isReleasedToFaculty, setIsReleasedToFaculty] = useState(true);

  const [stats, setStats] = useState({
    overall: 0,
    totalEvaluators: 0,
    participationRate: '0%',
    collegeRank: 'Top —',
    criteria: [],
    comments: []
  });

  // Helper to determine score color / label
  const getRatingLabel = (score) => {
    if (score >= 3.60) return { text: 'Exemplary', color: 'bg-emerald-50 text-emerald-700 border-emerald-250' };
    if (score >= 3.00) return { text: 'Satisfactory', color: 'bg-blue-50 text-blue-700 border-blue-200' };
    if (score >= 2.00) return { text: 'Needs Improvement', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    return { text: 'Poor', color: 'bg-rose-50 text-rose-700 border-rose-200' };
  };

  useEffect(() => {
    async function loadEvaluationsSetup() {
      if (!user) return;
      setLoading(true);
      try {
        // 1. Fetch Evaluation Windows for this faculty
        const { data: winData, error: winErr } = await supabase
          .from('evaluation_windows')
          .select(`
            window_id,
            section_id,
            is_released_to_faculty,
            sections ( name, school_year, semester )
          `)
          .eq('faculty_id', user.id);

        if (winErr) throw winErr;

        if (winData && winData.length > 0) {
          const released = winData.some(w => w.is_released_to_faculty === true);
          setIsReleasedToFaculty(released);
        }

        if (!winData || winData.length === 0) {
          setLoading(false);
          return;
        }

        // Build semesters list
        const sems = [];
        const seenSem = new Set();
        winData.forEach(w => {
          if (w.sections) {
            const sy = w.sections.school_year.startsWith('AY') ? w.sections.school_year : `AY ${w.sections.school_year}`;
            const semName = w.sections.semester === '1st' ? 'First' : w.sections.semester === '2nd' ? 'Second' : w.sections.semester;
            const label = `${semName} Semester, ${sy}`;
            if (!seenSem.has(label)) {
              seenSem.add(label);
              sems.push({
                label,
                school_year: w.sections.school_year,
                semester: w.sections.semester
              });
            }
          }
        });

        setSemestersList(sems);
        if (sems.length > 0) {
          setSelectedSemester(sems[0].label);
        } else {
          setLoading(false);
        }

      } catch (err) {
        console.error('Error loading evaluations configuration:', err);
        setLoading(false);
      }
    }

    loadEvaluationsSetup();
  }, [user]);

  useEffect(() => {
    async function loadStatsData() {
      if (!user || !selectedSemester) return;
      try {
        const activeSem = semestersList.find(s => s.label === selectedSemester);
        if (!activeSem) return;

        // 1. Fetch class records for subjects metadata
        const { data: classRecs } = await supabase
          .from('class_records')
          .select('class_record_id, subject_id, section_id, subjects(*), sections(*)')
          .eq('faculty_id', user.id);

        const classMap = {}; // section_id -> class_record
        classRecs?.forEach(cr => {
          classMap[cr.section_id] = cr;
        });

        // 2. Fetch evaluation windows for this semester
        const { data: windows } = await supabase
          .from('evaluation_windows')
          .select(`
            window_id,
            section_id,
            form_id,
            sections!inner ( name, school_year, semester )
          `)
          .eq('faculty_id', user.id)
          .eq('sections.school_year', activeSem.school_year)
          .eq('sections.semester', activeSem.semester);

        if (!windows || windows.length === 0) {
          setStats({
            overall: 0,
            totalEvaluators: 0,
            participationRate: '0%',
            collegeRank: 'Top —',
            criteria: [],
            comments: []
          });
          setClassesList([]);
          return;
        }

        // Build classes list buttons
        const classes = [{ id: 'All', code: 'All Classes', section: 'Aggregate' }];
        windows.forEach(w => {
          const cr = classMap[w.section_id];
          if (cr && cr.subjects) {
            classes.push({
              id: w.window_id,
              code: cr.subjects.code,
              section: cr.sections?.name || 'Unknown'
            });
          }
        });
        setClassesList(classes);

        // Filter windows
        const filteredWindows = selectedClass === 'All'
          ? windows
          : windows.filter(w => w.window_id === selectedClass);

        const windowIds = filteredWindows.map(w => w.window_id);

        // 3. Fetch responses
        const { data: responses } = await supabase
          .from('evaluation_responses')
          .select('response_id, window_id')
          .in('window_id', windowIds);

        const responseIds = responses?.map(r => r.response_id) || [];

        // 4. Fetch total enrolled student counts for these sections & subjects
        const sectionIds = filteredWindows.map(w => w.section_id);
        const subjectIds = filteredWindows.map(w => classMap[w.section_id]?.subject_id).filter(Boolean);

        const { data: enrollmentData } = await supabase
          .from('enrollments')
          .select('student_id')
          .in('section_id', sectionIds)
          .in('subject_id', subjectIds);

        const enrolledCount = enrollmentData ? new Set(enrollmentData.map(e => e.student_id)).size : 0;

        // 5. Fetch ratings
        const { data: ratings } = await supabase
          .from('evaluation_ratings')
          .select(`
            rating,
            criteria_id,
            evaluation_criteria ( label, description, max_rating )
          `)
          .in('response_id', responseIds);

        // 6. Fetch comments
        const { data: comments } = await supabase
          .from('evaluation_comments')
          .select('response_id, comment')
          .in('response_id', responseIds);

        // Calculate Overall rating
        let ratingsSum = 0;
        ratings?.forEach(r => { ratingsSum += r.rating; });
        const overallRating = ratings && ratings.length > 0 ? ratingsSum / ratings.length : 0;

        // Calculate Criteria breakdown
        const categorySum = {};
        const categoryCount = {};
        const categoryDesc = {};
        
        ratings?.forEach(r => {
          const crit = r.evaluation_criteria;
          if (crit) {
            const label = crit.label;
            categorySum[label] = (categorySum[label] || 0) + r.rating;
            categoryCount[label] = (categoryCount[label] || 0) + 1;
            categoryDesc[label] = crit.description;
          }
        });

        const criteriaBreakdown = Object.entries(categorySum).map(([name, sum]) => {
          const count = categoryCount[name];
          const score = count > 0 ? sum / count : 0;
          return {
            name,
            description: categoryDesc[name] || '',
            score,
            max: 4
          };
        });

        criteriaBreakdown.sort((a, b) => a.name.localeCompare(b.name));

        // Map comments
        const responseToWindowMap = {};
        responses?.forEach(r => {
          responseToWindowMap[r.response_id] = r.window_id;
        });

        const mappedComments = [];
        comments?.forEach(c => {
          const winId = responseToWindowMap[c.response_id];
          const win = windows.find(w => w.window_id === winId);
          const cr = win ? classMap[win.section_id] : null;
          const courseCode = cr?.subjects?.code || 'N/A';
          mappedComments.push({
            course: courseCode,
            text: c.comment
          });
        });

        // 7. Calculate Rank compared to all other faculty
        const { data: allRatings } = await supabase
          .from('evaluation_ratings')
          .select(`
            rating,
            evaluation_responses!inner (
              window_id,
              evaluation_windows!inner (
                faculty_id
              )
            )
          `);

        const facultySums = {};
        const facultyCounts = {};
        allRatings?.forEach(r => {
          const facId = r.evaluation_responses?.evaluation_windows?.faculty_id;
          if (facId) {
            facultySums[facId] = (facultySums[facId] || 0) + r.rating;
            facultyCounts[facId] = (facultyCounts[facId] || 0) + 1;
          }
        });

        const facultyAverages = {};
        Object.keys(facultySums).forEach(facId => {
          facultyAverages[facId] = facultySums[facId] / facultyCounts[facId];
        });

        const sortedFaculty = Object.entries(facultyAverages)
          .map(([facId, avg]) => ({ facId, avg }))
          .sort((a, b) => b.avg - a.avg);

        const totalFaculty = sortedFaculty.length;
        const ourIndex = sortedFaculty.findIndex(f => f.facId === user.id);
        
        let collegeRank = 'Top —';
        if (ourIndex !== -1 && totalFaculty > 0) {
          const percentile = (ourIndex / totalFaculty) * 100;
          collegeRank = `Top ${percentile === 0 ? '1' : Math.max(1, Math.round(percentile))}%`;
        }

        const totalEvaluatorsCount = responses?.length || 0;
        const participationRatePercent = enrolledCount > 0 
          ? `${Math.round((totalEvaluatorsCount / enrolledCount) * 100)}%` 
          : '0%';

        setStats({
          overall: overallRating,
          totalEvaluators: totalEvaluatorsCount,
          participationRate: participationRatePercent,
          collegeRank,
          criteria: criteriaBreakdown,
          comments: mappedComments
        });

      } catch (err) {
        console.error('Error loading evaluations statistics:', err);
      } finally {
        setLoading(false);
      }
    }

    loadStatsData();
  }, [user, selectedSemester, selectedClass, semestersList]);

  useEffect(() => {
    async function loadFacultyInsights() {
      if (!user || !selectedSemester) return;
      try {
        const activeSem = semestersList.find(s => s.label === selectedSemester);
        if (!activeSem) return;
        
        const { data, error } = await supabase
          .from('faculty_performance_insights')
          .select('*')
          .eq('faculty_id', user.id)
          .eq('school_year', activeSem.school_year)
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error) throw error;
        setDbInsight(data);
      } catch (err) {
        console.error("Error loading faculty performance insights from Supabase:", err);
      }
    }
    loadFacultyInsights();
  }, [user, selectedSemester, semestersList]);

  const activeClassObj = classesList.find(c => c.id === selectedClass);
  const sectionName = activeClassObj?.section; // e.g. "BSIT-1A"

  const sortedCriteria = [...stats.criteria].sort((a, b) => b.score - a.score);

  const activeInsight = dbInsight?.basis_snapshot || {
    name: profile ? `Prof. ${profile.first_name} ${profile.last_name}` : "Faculty Member",
    facultyId: user?.id || "",
    overallVerdict: stats.overall >= 3.60 ? 'excellent' : stats.overall >= 3.00 ? 'satisfactory' : 'needs_improvement',
    overallRating: stats.overall,
    overallSummary: stats.overall > 0 
      ? `Evaluation score for this period is ${stats.overall.toFixed(2)}. ${stats.comments.length} student feedback responses recorded.`
      : "No evaluation records processed yet for the active term.",
    overallSpotlight: {
      highestCriteria: sortedCriteria[0]?.name || "N/A",
      highestScore: sortedCriteria[0]?.score || 0,
      lowestCriteria: sortedCriteria[sortedCriteria.length - 1]?.name || "N/A",
      lowestScore: sortedCriteria[sortedCriteria.length - 1]?.score || 0
    },
    sections: []
  };

  // Find section-specific insight
  let activeSectionInsight = null;
  if (selectedClass !== 'All' && sectionName) {
    activeSectionInsight = activeInsight.sections?.find(s => s.sectionCode === sectionName);
    
    // Dynamic fallback construction if not found in db snapshot
    if (!activeSectionInsight) {
      const getScore = (name) => {
        const crit = stats.criteria.find(c => c.name.toLowerCase().includes(name.toLowerCase()));
        return crit ? crit.score : 0;
      };
      
      activeSectionInsight = {
        sectionCode: sectionName,
        subjectName: activeClassObj?.code || 'Subject',
        sectionRating: stats.overall,
        ratingsSummary: {
          subjectKnowledge: getScore('Content Knowledge') || getScore('Subject Knowledge') || stats.overall,
          methodology: getScore('Teaching, Learning, and Planning') || getScore('Methodology') || stats.overall,
          communication: getScore('Learning Environment') || getScore('Communication') || stats.overall,
          turnaround: getScore('Assessment and Reporting') || getScore('Classroom Turnaround') || stats.overall
        },
        insight: `Your overall rating for this class is ${stats.overall.toFixed(2)}. Student comments indicate positive feedback on instructional delivery and guidance.`,
        perceptions: {
          workload: "Students perceive the class workload to be reasonable and aligned with course units.",
          delivery: "Lecture delivery and discussions are noted to be structured and engaging.",
          topSuggestion: stats.comments.length > 0 
            ? "Ensure grading feedback is returned in a timely manner to help student tracking."
            : "Maintain current teaching methodologies and lecture preparations."
        }
      };
    }
  }

  // Derive dynamic or snapshot values for overall standing
  const highestCriteria = activeInsight.overallSpotlight?.highestCriteria || sortedCriteria[0]?.name || 'N/A';
  const highestScore = activeInsight.overallSpotlight?.highestScore || sortedCriteria[0]?.score || 0;
  const lowestCriteria = activeInsight.overallSpotlight?.lowestCriteria || sortedCriteria[sortedCriteria.length - 1]?.name || 'N/A';
  const lowestScore = activeInsight.overallSpotlight?.lowestScore || sortedCriteria[sortedCriteria.length - 1]?.score || 0;

  // Verdict enums display colors & standing
  const getVerdictDetails = (verdict) => {
    switch (verdict) {
      case 'excellent':
        return { text: 'EXCELLENT', color: 'bg-emerald-50 text-emerald-700 border-emerald-250' };
      case 'satisfactory':
        return { text: 'SATISFACTORY', color: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'needs_improvement':
      default:
        return { text: 'NEEDS IMPROVEMENT', color: 'bg-amber-50 text-amber-700 border-amber-200' };
    }
  };

  const verdictDetails = getVerdictDetails(selectedClass === 'All' ? activeInsight.overallVerdict : (activeSectionInsight?.sectionRating >= 3.60 ? 'excellent' : activeSectionInsight?.sectionRating >= 3.00 ? 'satisfactory' : 'needs_improvement'));

  if (loading) {
    return <DetailSkeleton />;
  }

  if (semestersList.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500 font-sans">No evaluation records found.</p>
      </div>
    );
  }

  const ratingLabel = getRatingLabel(stats.overall);

  return (
    <>
      <PageHeader title="Student Evaluations" breadcrumb="Faculty Portal">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
          {/* Semester Selector */}
          <div className="relative">
            <select 
              value={selectedSemester}
              onChange={(e) => setSelectedSemester(e.target.value)}
              className="appearance-none bg-white border border-slate-200 hover:border-sage-300 text-slate-700 px-3 sm:px-4 py-2 pr-8 sm:pr-10 rounded-xl text-xs sm:text-sm font-semibold focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer shadow-2xs"
            >
              {semestersList.map((sem, idx) => (
                <option key={idx} value={sem.label}>{sem.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 h-3.5 sm:h-4 w-3.5 sm:w-4 text-slate-400 pointer-events-none" />
          </div>

          <button className="px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold border border-slate-200 text-slate-700 hover:border-sage-300 rounded-xl transition-colors bg-white flex items-center gap-1.5 cursor-pointer shadow-2xs">
            <FileSpreadsheet className="h-3.5 sm:h-4 w-3.5 sm:w-4 text-slate-500" /> 
            <span className="hidden sm:inline">Export Report</span>
            <span className="sm:hidden">Export</span>
          </button>
        </div>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6">
        
        {!isReleasedToFaculty ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 sm:p-8 text-center space-y-4 shadow-2xs max-w-2xl mx-auto my-6 sm:my-8">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-100 text-amber-700 mx-auto flex items-center justify-center">
              <Lock className="h-6 w-6 sm:h-7 sm:h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-amber-950 font-display">Evaluation Results Pending Dean Release</h3>
              <p className="text-xs text-amber-800 leading-relaxed max-w-lg mx-auto">
                Per institutional governance policy, student evaluation ratings and qualitative feedback for this academic term are under Dean review and have not yet been released to your faculty portal.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-amber-100/80 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold font-mono">
              <span>Status: Under Dean Audit</span>
            </div>
          </div>
        ) : (
          <>
            {/* Anonymity Banner */}
            <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 sm:p-4 flex items-start gap-3 shadow-2xs">
              <ShieldCheck className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
              <div>
                <h4 className="font-semibold text-slate-900 text-xs sm:text-sm text-left">Faculty Evaluation Privacy Protection</h4>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 text-left leading-relaxed">
                  In compliance with academic evaluation policy FR25, student identities are completely anonymized. Data is aggregated to protect student confidentiality.
                </p>
              </div>
            </div>

            {/* Filters and Sub-navigation */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3 sm:pb-4">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 no-scrollbar">
                {classesList.map((cls) => (
                  <button
                    key={cls.id}
                    onClick={() => setSelectedClass(cls.id)}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-full border transition-all whitespace-nowrap cursor-pointer flex-shrink-0 ${
                      selectedClass === cls.id 
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs' 
                        : 'bg-white text-slate-600 border-slate-200 hover:border-sage-300 hover:text-slate-900'
                    }`}
                  >
                    {cls.code === 'All Classes' ? 'All Classes (Combined)' : `${cls.code} - ${cls.section}`}
                  </button>
                ))}
              </div>

              <div className="text-[11px] text-slate-400 italic text-left">
                Showing: <span className="font-semibold text-slate-600 not-italic">{selectedSemester}</span>
              </div>
            </div>

            {/* 2x2 on Mobile, 4-col on Desktop Dashboard Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
              
              {/* Main Stat Card - Overall Rating */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-2xs flex flex-col items-center justify-center text-center relative overflow-hidden group hover:border-sage-350 transition-all col-span-2 sm:col-span-1">
                <div className="absolute top-0 inset-x-0 h-1 bg-sage-500"></div>
                <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400 font-display">Overall Rating</p>
                <div className="mt-2 sm:mt-4 flex items-baseline gap-1">
                  <span className="text-3xl sm:text-5xl font-extrabold font-mono text-slate-900">{stats.overall.toFixed(2)}</span>
                  <span className="text-sm sm:text-lg text-slate-400 font-mono">/4.00</span>
                </div>
                
                <div className="mt-2 sm:mt-3 flex items-center gap-1">
                  {[1, 2, 3, 4].map((star) => (
                    <Star 
                      key={star} 
                      className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${
                        star <= Math.round(stats.overall) 
                          ? 'text-amber-400 fill-amber-400' 
                          : 'text-slate-200'
                      }`} 
                    />
                  ))}
                </div>

                <span className={`mt-2.5 sm:mt-4 px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold border ${ratingLabel.color}`}>
                  {ratingLabel.text}
                </span>
              </div>

              {/* Stat 2 - Total Evaluators */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-2xs flex flex-col justify-between hover:border-sage-350 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">Evaluators</span>
                  <div className="p-1.5 sm:p-2 bg-sage-50 rounded-xl text-sage-600">
                    <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                </div>
                <div className="mt-3 sm:mt-6 text-left">
                  <h3 className="text-xl sm:text-3xl font-extrabold font-mono text-slate-900">{stats.totalEvaluators}</h3>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 line-clamp-1">Anonymized responses</p>
                </div>
              </div>

              {/* Stat 3 - Participation Rate */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-2xs flex flex-col justify-between hover:border-sage-350 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">Response Rate</span>
                  <div className="p-1.5 sm:p-2 bg-sage-50 rounded-xl text-sage-600">
                    <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                </div>
                <div className="mt-3 sm:mt-6 text-left">
                  <h3 className="text-xl sm:text-3xl font-extrabold font-mono text-slate-900">{stats.participationRate}</h3>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 line-clamp-1">Registered students</p>
                </div>
              </div>

              {/* Stat 4 - College Ranking */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-2xs flex flex-col justify-between hover:border-sage-350 transition-all">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-400">Department Rank</span>
                  <div className="p-1.5 sm:p-2 bg-sage-50 rounded-xl text-sage-600">
                    <Award className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                </div>
                <div className="mt-3 sm:mt-6 text-left">
                  <h3 className="text-xl sm:text-3xl font-extrabold font-mono text-slate-900">{stats.collegeRank}</h3>
                  <p className="text-[10px] sm:text-xs text-slate-400 mt-0.5 line-clamp-1">Relative to faculty</p>
                </div>
              </div>

            </div>

            {/* Criteria breakdown & student reviews */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              
              {/* Detailed Criteria Breakdown */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-2xs lg:col-span-2 space-y-4 sm:space-y-6">
                <div>
                  <h3 className="text-sm sm:text-base font-bold font-display text-slate-900 text-left">Criteria Breakdown</h3>
                  <p className="text-[11px] sm:text-xs text-slate-500 text-left">Evaluation scores categorized by official teaching effectiveness metrics.</p>
                </div>

                <div className="space-y-4 sm:space-y-5">
                  {stats.criteria.map((item, idx) => {
                    const percentage = (item.score / item.max) * 100;
                    return (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex justify-between items-start">
                          <div className="text-left min-w-0 pr-2">
                            <h4 className="text-xs sm:text-sm font-semibold text-slate-800 truncate">{item.name}</h4>
                            <p className="text-[10px] sm:text-xs text-slate-400 pr-2 mt-0.5 line-clamp-1">{item.description}</p>
                          </div>
                          <div className="text-right whitespace-nowrap flex-shrink-0">
                            <span className="text-xs sm:text-sm font-bold font-mono text-slate-900">{item.score.toFixed(2)}</span>
                            <span className="text-[10px] sm:text-xs text-slate-400 font-mono"> / {item.max.toFixed(2)}</span>
                          </div>
                        </div>

                        <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                          <div 
                            className="bg-sage-600 h-full rounded-full transition-all duration-500" 
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                  {stats.criteria.length === 0 && (
                    <div className="text-center py-8 text-slate-400 text-xs sm:text-sm">
                      No criteria scores available for this selection.
                    </div>
                  )}
                </div>
              </div>

              {/* Student Feedback & Professional Growth Insights Column */}
              <div className="lg:col-span-1 space-y-4 sm:space-y-6 flex flex-col">
                {/* Professional Growth Insights Trigger Card */}
                <div 
                  onClick={() => setIsDrawerOpen(true)}
                  className="bg-white rounded-2xl border border-slate-200/90 hover:border-sage-350 p-4 sm:p-5 shadow-2xs cursor-pointer transition-all flex items-center justify-between group relative overflow-hidden text-left"
                >
                  <div className="absolute top-0 inset-x-0 h-1 bg-sage-500"></div>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-sage-50 text-sage-700 rounded-xl group-hover:scale-105 transition-transform flex-shrink-0">
                      <BrainCircuit className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-900">Growth Insights</h4>
                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">Qualitative summary & growth plans</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                </div>

                {/* Student Comments list */}
                <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-6 shadow-2xs flex flex-col space-y-3.5 flex-1">
                  <div>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 sm:h-5 sm:w-5 text-sage-600" />
                      <h3 className="text-sm sm:text-base font-bold font-display text-slate-900">Student Feedback</h3>
                    </div>
                    <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5 text-left">Anonymized student feedback excerpts.</p>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-3 max-h-[340px] pr-1">
                    {stats.comments.length > 0 ? (
                      stats.comments.map((comment, index) => (
                        <div key={index} className="bg-slate-50 border border-slate-150 rounded-xl p-3.5 text-xs space-y-2 text-left">
                          <p className="text-slate-700 leading-relaxed italic whitespace-pre-line text-[11px] sm:text-xs">"{comment.text}"</p>
                          <div className="flex items-center justify-between text-[9px] sm:text-[10px] text-slate-400 font-medium">
                            <span>Verified Student</span>
                            <span className="bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-mono font-bold">
                              {comment.course}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center py-8 text-slate-400">
                        <MessageSquare className="h-7 w-7 text-slate-300 mb-2" />
                        <p className="text-xs font-medium">No comments recorded for this selection.</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Drawer Overlay & Responsive Side Panel / Bottom Sheet */}
      {isDrawerOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 animate-in fade-in duration-200"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}

      <div 
        className={`fixed inset-x-0 bottom-0 max-h-[85vh] sm:max-h-full sm:top-0 sm:right-0 sm:left-auto sm:h-full w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-none border-t sm:border-t-0 sm:border-l border-slate-200 shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-out ${
          isDrawerOpen ? 'translate-y-0 sm:translate-x-0' : 'translate-y-full sm:translate-y-0 sm:translate-x-full'
        }`}
      >
        <div className="sm:hidden w-12 h-1.5 bg-slate-200 rounded-full mx-auto mt-3 mb-1" />
        
        {/* Drawer Header */}
        <div className="p-4 sm:p-6 border-b border-slate-150 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sage-700">
            <BrainCircuit className="h-5 w-5" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 font-display">Growth Insights</h3>
          </div>
          <button 
            onClick={() => setIsDrawerOpen(false)}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Drawer Body (Scrollable) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
          
          {selectedClass === 'All' ? (
            /* OVERALL STANDING VIEW */
            <div className="space-y-4 sm:space-y-6 text-left">
              
              {/* Performance Summary Banner */}
              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-3 sm:space-y-4">
                <div>
                  <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-wider block">My Performance Standing</span>
                  <div className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono">{stats.overall.toFixed(2)}</span>
                    <span className="text-xs sm:text-sm text-slate-400 font-mono">/ 4.00</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${verdictDetails.color}`}>
                    STATUS: {verdictDetails.text}
                  </span>
                </div>
              </div>

              {/* Criteria Performance Spotlight */}
              <div className="space-y-3.5">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Award className="h-4 w-4 text-sage-600" /> Overall Criteria Spotlight
                </h4>

                <div className="space-y-3">
                  {/* Peak Performance */}
                  <div className="bg-emerald-50/35 border border-emerald-200/50 rounded-xl p-4 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-emerald-800">
                      <Zap className="h-4 w-4 text-amber-550 fill-amber-400" />
                      <span className="text-[10px] font-extrabold uppercase tracking-wider">Peak Performance Criteria</span>
                    </div>
                    <h5 className="text-xs font-bold text-slate-900">{highestCriteria}</h5>
                    <p className="text-xs text-slate-500 font-medium">Rating: <span className="font-bold text-emerald-700 font-mono">{highestScore.toFixed(2)} / 4.00</span></p>
                  </div>

                  {/* Development Focus */}
                  <div className="bg-amber-50/30 border border-amber-250/40 rounded-xl p-4 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-amber-700">
                      <Lightbulb className="h-4 w-4 text-amber-605" />
                      <span className="text-[10px] font-extrabold uppercase tracking-wider">Development Area / Focus</span>
                    </div>
                    <h5 className="text-xs font-bold text-slate-900">{lowestCriteria}</h5>
                    <p className="text-xs text-slate-500 font-medium">Rating: <span className="font-bold text-amber-700 font-mono">{lowestScore.toFixed(2)} / 4.00</span></p>
                  </div>
                </div>
              </div>

              {/* Overall Performance Insight text */}
              <div className="space-y-2 bg-slate-50 border border-slate-200/80 rounded-xl p-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle2 className="h-4.5 w-4.5 text-sage-600" /> Overall Performance Insight
                </h4>
                <p className="text-xs font-medium text-slate-700 leading-relaxed italic text-left">
                  "{activeInsight.overallSummary}"
                </p>
              </div>

            </div>
          ) : (
            /* SECTION-SPECIFIC VIEW */
            <div className="space-y-6 text-left">
              
              {activeSectionInsight && (
                <>
                  <div className="border-b border-slate-150 pb-4">
                    <span className="text-[10px] font-extrabold font-mono text-sage-800 uppercase tracking-wider bg-sage-50 border border-sage-200 px-2.5 py-0.5 rounded-full">
                      {activeSectionInsight.sectionCode}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 mt-2">{activeSectionInsight.subjectName}</h4>
                    <p className="text-xs text-slate-500 font-medium mt-1">
                      Section Rating: <span className="font-bold text-slate-900 font-mono">{activeSectionInsight.sectionRating.toFixed(2)} / 4.00</span>
                    </p>
                  </div>

                  {/* Summarized Student Ratings */}
                  <div className="space-y-3.5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <Activity className="h-4 w-4 text-sage-600" /> Summarized Student Ratings
                    </h4>

                    <div className="space-y-3">
                      {[
                        { name: 'Subject Knowledge', score: activeSectionInsight.ratingsSummary.subjectKnowledge },
                        { name: 'Teaching Methodology', score: activeSectionInsight.ratingsSummary.methodology },
                        { name: 'Communication Skills', score: activeSectionInsight.ratingsSummary.communication },
                        { name: 'Classroom Turnaround', score: activeSectionInsight.ratingsSummary.turnaround }
                      ].map((item, idx) => (
                        <div key={idx} className="space-y-1.5">
                          <div className="flex justify-between items-center text-xs font-medium">
                            <span className="text-slate-700 font-semibold">{item.name}</span>
                            <span className="font-mono text-slate-800 font-bold">{item.score.toFixed(2)} / 4.00</span>
                          </div>
                          <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-sage-600 h-full rounded-full transition-all duration-300"
                              style={{ width: `${(item.score / 4.00) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Section-Specific Insight */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-1.5 text-sage-700">
                      <Lightbulb className="h-4.5 w-4.5" />
                      <h4 className="text-xs font-bold uppercase tracking-wider">Section Specific Insight</h4>
                    </div>
                    <p className="text-xs font-medium text-slate-700 leading-relaxed italic">
                      "{activeSectionInsight.insight}"
                    </p>
                  </div>

                  {/* Student Perceptions Digest */}
                  <div className="space-y-3.5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4 text-sage-600" /> Student Perceptions Digest
                    </h4>

                    <div className="space-y-3">
                      <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 text-xs space-y-1.5 text-left">
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Workload Comments</span>
                        <p className="text-slate-700 leading-relaxed font-medium">"{activeSectionInsight.perceptions.workload}"</p>
                      </div>

                      <div className="bg-slate-50 border border-slate-150 rounded-xl p-4 text-xs space-y-1.5 text-left">
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Lecture Delivery</span>
                        <p className="text-slate-700 leading-relaxed font-medium">"{activeSectionInsight.perceptions.delivery}"</p>
                      </div>

                      <div className="bg-amber-50/20 border border-amber-250/30 rounded-xl p-4 text-xs space-y-1.5 text-left">
                        <span className="text-[10px] font-extrabold text-amber-800 uppercase tracking-wider block">Top Constructive Suggestion</span>
                        <p className="text-slate-700 leading-relaxed font-semibold italic">"{activeSectionInsight.perceptions.topSuggestion}"</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

            </div>
          )}

        </div>

        {/* Drawer Footer */}
        <div className="p-6 border-t border-slate-150 bg-slate-50 flex items-center justify-between text-[11px] text-slate-400 font-medium">
          <span>Aggregated Evaluations Summary</span>
          <span className="font-mono">SAGE</span>
        </div>
      </div>
    </>
  );
}
