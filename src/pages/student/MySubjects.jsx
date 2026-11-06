import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  BookOpen, 
  Award,
  Calendar, 
  X, 
  ChevronDown, 
  GraduationCap, 
  FileText,
  User,
  Clock,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { getCachedData, setCachedData } from '../../lib/dataCache';
import { fetchAcademicTerms, getClassTermState } from '../../lib/termStatus';
import { formatClassSchedule, NO_SCHEDULE_TEXT } from '../../lib/classSchedule';
import { TableSkeleton } from '../../components/common/Skeleton';

// True when the enrollment's section belongs to the selected term option.
// Falls back to the option's section when the section has no term details.
const normalizeSchoolYear = (value) => String(value || '').replace(/^AY\s*/i, '').trim();
function isEnrollmentInTerm(enrollment, termOption) {
  const section = enrollment?.sections;
  if (section?.semester && section?.school_year && termOption?.semester && termOption?.school_year) {
    return section.semester === termOption.semester
      && normalizeSchoolYear(section.school_year) === normalizeSchoolYear(termOption.school_year);
  }
  return !termOption?.section_id || enrollment?.section_id === termOption.section_id;
}

export default function MySubjects() {
  const { user, profile } = useAuth();

  // State
  const [loading, setLoading] = useState(true);
  const [semestersList, setSemestersList] = useState([]);
  const [selectedSemLabel, setSelectedSemLabel] = useState('');
  const [enrolledSubjects, setEnrolledSubjects] = useState([]);
  const [studentSection, setStudentSection] = useState(null);
  // The section the student is actually assigned to, read from their own
  // record rather than inferred from enrolments. A first-year with nothing
  // enrolled yet still has a section, and the card is supposed to show it.
  const [assignedSectionName, setAssignedSectionName] = useState('');

  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Looked up by id rather than embedded on the profile: users and sections
  // both predate the tracked migrations, so the foreign key PostgREST would
  // need for an embed cannot be verified from the repo. A plain filter needs
  // no relationship and cannot break the shared profile query.
  useEffect(() => {
    const sectionId = profile?.section_id;
    if (!sectionId) { setAssignedSectionName(''); return; }

    let cancelled = false;
    supabase
      .from('sections')
      .select('name')
      .eq('section_id', sectionId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('Could not read the assigned section:', error.message);
          setAssignedSectionName('');
          return;
        }
        setAssignedSectionName(data?.name || '');
      });
    return () => { cancelled = true; };
  }, [profile?.section_id]);

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

        // 1. Fetch this student's enrollments for the selected term. Filter by the term,
        // not only the block section, so a class joined by code from another section
        // is listed.
        const { data: allEnrolls, error: enrollErr } = await supabase
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
        if (enrollErr) throw enrollErr;

        const enrolls = (allEnrolls || []).filter(e => isEnrollmentInTerm(e, activeOpt));

        // Block section for this term, never a joined class's section. A student with no
        // home section is irregular. For a term the current home section is not in, the
        // block section is the section holding most of the student's classes that term.
        const homeSectionId = profile?.section_id || null;
        let blockSectionId = null;
        if (homeSectionId) {
          if (enrolls.some(e => e.section_id === homeSectionId)) {
            blockSectionId = homeSectionId;
          } else {
            const countsBySection = enrolls.reduce((counts, e) => {
              counts[e.section_id] = (counts[e.section_id] || 0) + 1;
              return counts;
            }, {});
            blockSectionId = Object.entries(countsBySection).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
          }
        }
        const blockEnrollment = blockSectionId ? enrolls.find(e => e.section_id === blockSectionId) : null;
        setStudentSection({
          name: blockEnrollment?.sections?.name || (blockSectionId ? profile?.section_name : null) || null,
          isIrregular: !homeSectionId,
          otherSectionCount: blockSectionId
            ? enrolls.filter(e => e.section_id !== blockSectionId).length
            : enrolls.length
        });

        const subjectIds = [...new Set(enrolls.map(e => e.subject_id).filter(Boolean))];
        const sectionIds = [...new Set(enrolls.map(e => e.section_id).filter(Boolean))];

        // 2. Fetch class records, including archived ones: a previous term's subjects stay
        // listed, marked "Grade not yet posted" until the SG is posted, then completed.
        let classRecords = [];
        let terms = [];
        if (subjectIds.length > 0) {
          const crQuery = supabase
            .from('class_records')
            .select(`
              class_record_id,
              subject_id,
              section_id,
              status,
              term_id,
              school_year,
              semester,
              meeting_days,
              start_time,
              end_time,
              class_type,
              rooms ( code ),
              sections ( name ),
              faculty:users!faculty_id ( first_name, last_name )
            `)
            .in('subject_id', subjectIds)
            .in('section_id', sectionIds.length > 0 ? sectionIds : ['00000000-0000-0000-0000-000000000000']);

          const [{ data: crData }, termRows] = await Promise.all([crQuery, fetchAcademicTerms()]);
          // Each enrollment matches its own class by subject AND section.
          const enrolledPairs = new Set(enrolls.map(e => `${e.subject_id}:${e.section_id}`));
          classRecords = (crData || []).filter(cr => enrolledPairs.has(`${cr.subject_id}:${cr.section_id}`));
          terms = termRows;
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

          const sectionName = e.sections?.name || matchingClass?.sections?.name || blockEnrollment?.sections?.name || 'Section';

          return {
            enrollment_id: e.enrollment_id,
            class_record_id: matchingClass?.class_record_id || null,
            code: subj?.code || 'SUBJ',
            name: subj?.name || 'Course Name',
            credits: Number(subj?.units) || 3,
            instructor: facultyName,
            sectionName: sectionName || 'Section',
            // Stored on every class since 20261029093613 and never once shown
            // to the student it belongs to. Scheduling is optional per college,
            // so this is null for a class nobody has timetabled yet.
            schedule: matchingClass
              ? formatClassSchedule({
                  days: matchingClass.meeting_days,
                  startTime: matchingClass.start_time,
                  endTime: matchingClass.end_time,
                  room: matchingClass.rooms?.code
                })
              : null,
            classType: matchingClass?.class_type || 'lecture',
            status: e.status || 'Enrolled',
            gradeState: matchingClass ? getClassTermState(terms, matchingClass).state : 'current'
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
  }, [user, profile?.section_id, profile?.section_name, selectedSemLabel, semestersList, refreshTrigger]);


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
        title="My Subjects"
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

          {/* Enrolment is handled by the Registrar and the Dean's office since the
              faculty loading rebuild, so there is no self-service join here. */}
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
                {/* The student's own assigned section comes first: it is the
                    authoritative answer and exists even with nothing enrolled.
                    The enrolment-derived name is the fallback, for a past term
                    the current section was not part of. "Block Section" used to
                    sit here as a literal, which read like a real section name
                    while actually meaning "we could not find one". */}
                {studentSection?.isIrregular
                  ? 'Irregular'
                  : assignedSectionName || studentSection?.name || 'Not assigned'}
              </h3>
              {/* Enrollment type only (same rule as the faculty "Irregular" badge); academic
                  standing is shown on the Grade Report and dashboard. */}
              <p className="text-[11px] text-slate-500 font-semibold mt-0.5 truncate">
                {studentSection?.isIrregular
                  ? `Classes joined by code (${studentSection.otherSectionCount})`
                  : studentSection?.otherSectionCount > 0
                    ? `Regular · ${studentSection.otherSectionCount} ${studentSection.otherSectionCount === 1 ? 'class' : 'classes'} from another section`
                    : 'Regular student'}
              </p>
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
                  : `You have no active courses registered for ${selectedSemLabel}. Enrolment is handled by the Registrar's office — contact them if you believe this is wrong.`}
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
              ) : null}
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

                    {sub.gradeState === 'archived' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        Completed · Grade posted
                      </span>
                    ) : sub.gradeState === 'pending' || sub.gradeState === 'overdue' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        Grade not yet posted
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        Enrolled
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-bold font-display text-slate-900 leading-tight">
                      {sub.code}
                    </h3>
                    <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed font-sans">{sub.name}</p>
                  </div>

                  {/* Faculty Instructor Info */}
                  {/* The "Request Academic Consultation" link that sat here is
                      gone. A consultation is not something a student opens from
                      a subject card: the window is opened by the trigger that
                      fires when a milestone is posted, and it is time-bounded.
                      The link implied a request the system no longer accepts. */}
                  <div className="flex items-center p-2.5 bg-slate-50 border border-slate-200/70 rounded-xl">
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
                  </div>

                  {/* When the class actually meets. Until now a student could
                      see their subject, their units and their instructor, and
                      had no way to find out the one thing they need to turn up. */}
                  <div className="flex items-center gap-2 px-2.5 text-xs">
                    <Clock className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                    {sub.schedule
                      ? <span className="font-mono text-slate-700 truncate">{sub.schedule}</span>
                      : <span className="text-slate-400">{NO_SCHEDULE_TEXT}</span>}
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
                    <span>Score Breakdown</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

              </div>
    </>
  );
}
