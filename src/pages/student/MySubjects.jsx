import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  BookOpen, 
  Award,
  Calendar, 
  Plus, 
  X, 
  ChevronDown, 
  GraduationCap, 
  AlertCircle, 
  CheckCircle2, 
  MessageSquare,
  FileText,
  User
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { submitJoinRequest } from '../../lib/classRoomService';
import { getCachedData, setCachedData } from '../../lib/dataCache';
import { TableSkeleton } from '../../components/common/Skeleton';

export default function MySubjects() {
  const { user, profile } = useAuth();

  // State
  const [loading, setLoading] = useState(true);
  const [semestersList, setSemestersList] = useState([]);
  const [selectedSemLabel, setSelectedSemLabel] = useState('');
  const [enrolledSubjects, setEnrolledSubjects] = useState([]);
  const [studentSection, setStudentSection] = useState(null);

  // Join Classroom Modal State
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinFeedback, setJoinFeedback] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Format Term Label helper (consistent with MyGradesList)
  const formatLabel = (sem, sy) => {
    const syFormatted = sy?.startsWith('AY') ? sy : `AY ${sy || ''}`;
    const semName = sem === '1st' ? 'First' : sem === '2nd' ? 'Second' : sem === 'Summer' ? 'Summer' : (sem || '');
    const label = `${semName} Semester, ${syFormatted}`;
    return label.replace('Summer Semester', 'Summer Term');
  };

  // Load semesters & active academic terms
  useEffect(() => {
    async function loadSemesters() {
      if (!user) return;

      const semsCacheKey = `student_semesters_${user.id}`;
      const cachedSems = getCachedData(semsCacheKey, 300000);
      if (cachedSems && cachedSems.options?.length > 0) {
        setSemestersList(cachedSems.options);
        if (!selectedSemLabel && cachedSems.defaultLabel) {
          setSelectedSemLabel(cachedSems.defaultLabel);
        }
      }

      try {
        // 1. Fetch active term from central academic_terms registry
        const { data: activeTerm } = await supabase
          .from('academic_terms')
          .select('term_id, school_year, semester')
          .eq('is_active', true)
          .maybeSingle();

        // 2. Fetch student's enrollments and assigned section
        const { data: enrolls, error } = await supabase
          .from('enrollments')
          .select(`
            section_id,
            sections ( section_id, name, school_year, semester )
          `)
          .eq('student_id', user.id);

        if (error) throw error;

        const options = [];
        const seen = new Set();

        const activeLabel = activeTerm ? formatLabel(activeTerm.semester, activeTerm.school_year) : '';

        if (profile?.section_id) {
          const { data: currentSec } = await supabase
            .from('sections')
            .select('*')
            .eq('section_id', profile.section_id)
            .single();

          if (currentSec) {
            const label = formatLabel(currentSec.semester, currentSec.school_year);
            seen.add(label);
            options.push({
              label,
              semester: currentSec.semester,
              school_year: currentSec.school_year,
              section_id: currentSec.section_id
            });
          }
        }

        enrolls?.forEach(e => {
          if (e.sections) {
            const label = formatLabel(e.sections.semester, e.sections.school_year);
            if (!seen.has(label)) {
              seen.add(label);
              options.push({
                label,
                semester: e.sections.semester,
                school_year: e.sections.school_year,
                section_id: e.sections.section_id
              });
            }
          }
        });

        // Ensure central active term is in options
        if (activeLabel && !seen.has(activeLabel)) {
          options.unshift({
            label: activeLabel,
            semester: activeTerm.semester,
            school_year: activeTerm.school_year,
            section_id: profile?.section_id || (enrolls?.[0]?.section_id || null)
          });
        }

        setSemestersList(options);
        if (options.length > 0) {
          const matchedActive = activeLabel ? options.find(o => o.label === activeLabel) : null;
          const matchedProfile = options.find(o => o.section_id === profile?.section_id);
          const defaultOpt = matchedActive || matchedProfile || options[0];
          setSelectedSemLabel(defaultOpt.label);
          setCachedData(semsCacheKey, {
            options,
            defaultLabel: defaultOpt.label
          });
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error('Error loading semesters:', err);
        setLoading(false);
      }
    }

    loadSemesters();
  }, [user, profile, refreshTrigger]);

  // Load enrolled subjects for selected semester
  useEffect(() => {
    async function loadSubjectsForSem() {
      if (!user || !selectedSemLabel) return;

      const semCacheKey = `student_subjects_${user.id}_${selectedSemLabel}`;
      const cached = getCachedData(semCacheKey, 180000);
      if (cached) {
        setEnrolledSubjects(cached.subjects || []);
        setLoading(false);
      } else {
        setLoading(true);
      }

      try {
        const activeOpt = semestersList.find(o => o.label === selectedSemLabel);
        if (!activeOpt) return;

        // 1. Fetch all enrollments for this student
        let enrollsQuery = supabase
          .from('enrollments')
          .select(`
            enrollment_id,
            subject_id,
            section_id,
            status,
            sections ( section_id, name, school_year, semester ),
            subjects ( subject_id, code, name, units )
          `)
          .eq('student_id', user.id);

        if (activeOpt.section_id) {
          enrollsQuery = enrollsQuery.eq('section_id', activeOpt.section_id);
        }

        const { data: enrolls, error: enrollErr } = await enrollsQuery;
        if (enrollErr) throw enrollErr;

        // Resolve student's active section name
        const primarySection = enrolls?.[0]?.sections || null;
        setStudentSection(primarySection);

        const subjectIds = enrolls?.map(e => e.subject_id).filter(Boolean) || [];

        // 2. Fetch active class records
        let classRecords = [];
        if (subjectIds.length > 0) {
          let crQuery = supabase
            .from('class_records')
            .select(`
              class_record_id,
              subject_id,
              section_id,
              sections ( name ),
              faculty:users!faculty_id ( first_name, last_name )
            `)
            .in('subject_id', subjectIds)
            .eq('status', 'active');

          if (activeOpt.section_id) {
            crQuery = crQuery.eq('section_id', activeOpt.section_id);
          }

          const { data: crData } = await crQuery;
          classRecords = crData || [];
        }

        const subMap = {};
        enrolls?.forEach(e => {
          if (e.subjects) {
            subMap[e.subject_id] = e.subjects;
          }
        });

        // 3. Map into distinct subjects safely
        const mapped = (enrolls || []).map(e => {
          const subj = e.subjects || subMap[e.subject_id] || { code: 'SUBJ', name: 'Course', units: 3 };
          const matchingClass = (classRecords || []).find(
            cr => cr.subject_id === e.subject_id && (!e.section_id || cr.section_id === e.section_id)
          ) || (classRecords || []).find(cr => cr.subject_id === e.subject_id);

          const facultyName = matchingClass?.faculty
            ? `Prof. ${matchingClass.faculty.first_name} ${matchingClass.faculty.last_name}`
            : 'Faculty Instructor';

          const sectionName = e.sections?.name || matchingClass?.sections?.name || primarySection?.name || 'Section';

          return {
            enrollment_id: e.enrollment_id,
            class_record_id: matchingClass?.class_record_id || null,
            code: subj?.code || 'SUBJ',
            name: subj?.name || 'Course Name',
            credits: Number(subj?.units) || 3,
            instructor: facultyName,
            sectionName: sectionName || 'Section',
            status: e.status || 'Enrolled'
          };
        });

        setEnrolledSubjects(mapped);
        setCachedData(semCacheKey, { subjects: mapped });
      } catch (err) {
        console.error('Error loading subjects:', err);
      } finally {
        setLoading(false);
      }
    }

    loadSubjectsForSem();
  }, [user, selectedSemLabel, semestersList, refreshTrigger]);

  // Join Classroom Submission Handler
  const handleJoinClassSubmit = async (e) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    setJoining(true);
    setJoinFeedback(null);
    try {
      const res = await submitJoinRequest(user.id, joinCodeInput);
      setJoinFeedback({
        type: 'success',
        message: `Successfully enrolled in ${res.classRecord?.subjects?.code || 'Course'} (${res.classRecord?.sections?.name || 'Section'})! You now have access to this classroom.`
      });
      setJoinCodeInput('');
      setRefreshTrigger(prev => prev + 1);
    } catch (err) {
      setJoinFeedback({
        type: 'error',
        message: err.message || 'Failed to join classroom. Please check your code and try again.'
      });
    } finally {
      setJoining(false);
    }
  };

  // Search Query
  const [searchQuery, setSearchQuery] = useState('');

  // Metrics Calculations
  const totalUnits = useMemo(() => {
    return (enrolledSubjects || []).reduce((acc, curr) => acc + (Number(curr.credits) || 0), 0);
  }, [enrolledSubjects]);

  const filteredSubjects = useMemo(() => {
    if (!searchQuery.trim()) return enrolledSubjects;
    const q = searchQuery.toLowerCase();
    return enrolledSubjects.filter(s => 
      s.code.toLowerCase().includes(q) || 
      s.name.toLowerCase().includes(q) || 
      s.instructor.toLowerCase().includes(q) ||
      s.sectionName.toLowerCase().includes(q)
    );
  }, [enrolledSubjects, searchQuery]);

  if (loading) {
    return <TableSkeleton rows={5} />;
  }

  return (
    <>
      {/* Page Header */}
      <PageHeader 
        title="My Enrolled Subjects" 
        breadcrumb="Student Portal"
      >
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* Term Selector */}
          <div className="relative flex-1 sm:flex-initial">
            <select 
              value={selectedSemLabel}
              onChange={(e) => setSelectedSemLabel(e.target.value)}
              className="w-full sm:w-auto appearance-none bg-white border border-slate-200 hover:border-sage-300 text-slate-700 px-3.5 py-2 pr-9 rounded-xl text-xs font-medium focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-all cursor-pointer shadow-xs"
            >
              {semestersList.map((sem, idx) => (
                <option key={idx} value={sem.label}>{sem.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>

          {/* Join Classroom Button */}
          <button
            onClick={() => {
              setIsJoinModalOpen(true);
              setJoinFeedback(null);
              setJoinCodeInput('');
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>Join Class with Code</span>
          </button>
        </div>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 text-left">
        {/* Standard SAGE KPI Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          
          {/* Stat 1: Enrolled Courses */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-sage-300 transition-all shadow-xs flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block truncate">Enrolled Courses</span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono mt-1 truncate">
                {enrolledSubjects.length < 10 ? `0${enrolledSubjects.length}` : enrolledSubjects.length}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">Registered this term</p>
            </div>
            <div className="p-2.5 bg-sage-50 text-sage-600 rounded-xl flex-shrink-0">
              <BookOpen className="h-5 w-5" />
            </div>
          </div>

          {/* Stat 2: Total Units */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-sage-300 transition-all shadow-xs flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block truncate">Academic Load</span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono mt-1 truncate">
                {(Number(totalUnits) || 0).toFixed(1)} <span className="text-xs font-sans font-semibold text-slate-400">Units</span>
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5 truncate">Official credit units</p>
            </div>
            <div className="p-2.5 bg-sage-50 text-sage-600 rounded-xl flex-shrink-0">
              <Award className="h-5 w-5" />
            </div>
          </div>

          {/* Stat 3: Section & Standing */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 hover:border-sage-300 transition-all shadow-xs flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider block truncate">Assigned Section</span>
              <h3 className="text-xl sm:text-2xl font-extrabold text-slate-900 font-mono mt-1 truncate">
                {studentSection?.name || profile?.section_name || 'Block Section'}
              </h3>
              <p className="text-[11px] text-emerald-600 font-semibold mt-0.5 truncate">Regular Academic Standing</p>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl flex-shrink-0">
              <GraduationCap className="h-5 w-5" />
            </div>
          </div>

        </div>

        {/* Filter & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search by code, title, or instructor..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 hover:border-sage-300 focus:border-sage-500 focus:ring-1 focus:ring-sage-500 text-xs text-slate-800 placeholder-slate-400 pl-3.5 pr-8 py-2.5 rounded-xl transition-all outline-none shadow-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 self-end sm:self-auto">
            <span>Showing <strong className="text-slate-800 font-mono">{filteredSubjects.length}</strong> of <strong className="text-slate-800 font-mono">{enrolledSubjects.length}</strong> courses</span>
            <Link
              to="/student/mygradeslist"
              className="font-semibold text-sage-600 hover:text-sage-700 hidden sm:inline ml-2"
            >
              Grade Report →
            </Link>
          </div>
        </div>

        {/* Course Cards Grid */}
        {filteredSubjects.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 text-center max-w-lg mx-auto space-y-4 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-sage-50 text-sage-600 flex items-center justify-center mx-auto">
              <BookOpen className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-bold font-display text-slate-900">
                {searchQuery ? 'No matching subjects found' : 'No enrolled subjects found'}
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {searchQuery 
                  ? `No courses matched "${searchQuery}". Try clearing your search query.`
                  : `You have no active courses registered for ${selectedSemLabel}. You can add courses using a classroom join code provided by your instructor.`}
              </p>
            </div>
            <div className="pt-2">
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Clear Search
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsJoinModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Join Classroom via Code</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredSubjects.map((sub) => (
              <div
                key={sub.enrollment_id || sub.code}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-xs hover:border-sage-300 hover:shadow-sm transition-all flex flex-col justify-between overflow-hidden text-left"
              >
                {/* Card Header & Content */}
                <div className="p-4 sm:p-5 space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                        {sub.sectionName}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-500 font-mono">
                        {(Number(sub.credits) || 0).toFixed(1)} Units
                      </span>
                    </div>

                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                      Enrolled
                    </span>
                  </div>

                  <div>
                    <h3 className="text-base font-bold font-display text-slate-900 leading-tight">
                      {sub.code}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed font-sans">{sub.name}</p>
                  </div>

                  {/* Faculty Instructor Info */}
                  <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-sage-100 text-sage-700 flex items-center justify-center font-bold text-xs flex-shrink-0 border border-sage-200">
                        <User className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-xs font-semibold text-slate-800 block truncate">
                          {sub.instructor}
                        </span>
                        <span className="text-[10px] text-slate-400 block">Course Instructor</span>
                      </div>
                    </div>

                    <Link
                      to="/student/academic-insights?tab=consultations"
                      title="Request Academic Consultation"
                      className="p-1.5 text-slate-400 hover:text-sage-700 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="p-3 bg-slate-50/70 border-t border-slate-100 grid grid-cols-2 gap-2">
                  <Link
                    to="/student/attendance"
                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl transition-colors shadow-2xs"
                  >
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>Attendance</span>
                  </Link>

                  <Link
                    to={sub.class_record_id ? `/student/mygradesdetail?id=${sub.class_record_id}` : '/student/mygradeslist'}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-sage-700 bg-white hover:bg-sage-50 border border-sage-200 hover:border-sage-300 rounded-xl transition-colors shadow-2xs"
                  >
                    <FileText className="h-3.5 w-3.5 text-sage-600" />
                    <span>Score Sheet</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Join Classroom Modal */}
        {isJoinModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div 
              className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150"
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-sage-50 text-sage-600 rounded-xl">
                    <GraduationCap className="h-4 w-4" />
                  </div>
                  <h3 className="font-bold font-display text-slate-900 text-base">Join a Classroom</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsJoinModalOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Enter the unique 6–8 character classroom join code (e.g. <span className="font-mono font-bold text-slate-700">CS3A-8X92</span>) provided by your professor to enroll in the course.
              </p>

              <form onSubmit={handleJoinClassSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Classroom Join Code
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. CS3A-8X92"
                    value={joinCodeInput}
                    onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sage-500/20 focus:border-sage-400 uppercase transition-colors"
                  />
                </div>

                {joinFeedback && (
                  <div className={cn(
                    "p-3 rounded-xl text-xs flex items-start gap-2",
                    joinFeedback.type === 'success' 
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200/80" 
                      : "bg-rose-50 text-rose-800 border border-rose-200/80"
                  )}>
                    {joinFeedback.type === 'success' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <span>{joinFeedback.message}</span>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setIsJoinModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={joining || !joinCodeInput.trim()}
                    className="px-4 py-2 bg-sage-600 hover:bg-sage-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    {joining ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Verifying...</span>
                      </>
                    ) : (
                      <span>Join Classroom</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
