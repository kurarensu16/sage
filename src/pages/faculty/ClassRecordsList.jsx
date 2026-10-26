import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Search, 
  Users, 
  Calendar, 
  BookOpen, 
  Settings, 
  Edit3, 
  FileText,
  X, 
  Copy, 
  Check, 
  Target, 
  TrendingDown, 
  TrendingUp,
  Plus,
  CheckCircle2,
  MoreVertical
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { CardListSkeleton } from '../../components/common/Skeleton';
import { 
  getOrCreateJoinCode, 
  getClassPriorityRoster 
} from '../../lib/classRoomService';
import { GRADE_MILESTONES, getCanonicalGradePeriod } from '../../lib/gradeMilestones';
import { RISK_TIERS } from '../../lib/academicPolicy';
import StudentRiskEvaluationModal from './StudentRiskEvaluationModal';
import FacultyCreateClassroomModal from './FacultyCreateClassroomModal';
import { cn } from '../../lib/utils';
import { fetchAcademicTerms, getActiveAcademicTerm, getClassTermState } from '../../lib/termStatus';
import RiskEducationNote from '../../components/faculty/RiskEducationNote';
import AcademicPeriodFilter from '../../components/common/AcademicPeriodFilter';

export default function ClassRecordsList() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [classes, setClasses] = useState([]);
  const [terms, setTerms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [archiveMode, setArchiveMode] = useState(Boolean(searchParams.get('archiveTerm')));
  const [appliedTerm, setAppliedTerm] = useState(null);
  const [archiveError, setArchiveError] = useState('');
  const [copiedCode, setCopiedCode] = useState(null);
  const periodRequest = useRef(0);

  // Faculty Classroom Self-Service Creation Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creationBanner, setCreationBanner] = useState(null);

  // Student Risk Review & Priority Roster Modal State
  const [isRiskReviewModalOpen, setIsRiskReviewModalOpen] = useState(false);
  const [activeClassForReview, setActiveClassForReview] = useState(null);
  const [priorityStudents, setPriorityStudents] = useState([]);
  const [loadingPriorityList, setLoadingPriorityList] = useState(false);

  // HITL Risk Evaluation Modal State
  const [evaluatingStudent, setEvaluatingStudent] = useState(null);

  // Card Quick Menu Dropdown State
  const [activeMenuId, setActiveMenuId] = useState(null);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (!e.target.closest('.card-quick-menu-container')) {
        setActiveMenuId(null);
      }
    };
    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, []);

  useEffect(() => {
    if (searchParams.get('action') === 'create') {
      setIsCreateModalOpen(true);
      setSearchParams(previous => {
        const next = new URLSearchParams(previous);
        next.delete('action');
        return next;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const loadClassesForTerm = async (term, { archive = false, availableTerms = terms } = {}) => {
    if (!user?.id || !term?.term_id) return false;
    const requestId = ++periodRequest.current;
    setLoading(true);
    setArchiveError('');
    try {
      const classSelect = `
        class_record_id,
        status,
        term_id,
        school_year,
        semester,
        subject_id,
        section_id,
        subjects ( subject_id, code, name, units, computation_id ),
        sections ( section_id, name, school_year, semester )
      `;
      const [exactResult, legacyResult] = await Promise.all([
        supabase
          .from('class_records')
          .select(classSelect)
          .eq('faculty_id', user.id)
          .eq('term_id', term.term_id),
        supabase
          .from('class_records')
          .select(classSelect)
          .eq('faculty_id', user.id)
          .is('term_id', null)
          .eq('school_year', term.school_year)
          .eq('semester', term.semester)
      ]);

      if (exactResult.error) throw exactResult.error;
      if (legacyResult.error) throw legacyResult.error;
      if (requestId !== periodRequest.current) return false;

      const classesData = [...(exactResult.data || []), ...(legacyResult.data || [])]
        .map(cls => ({ ...cls, termState: getClassTermState(availableTerms, cls) }));

      if (classesData.length === 0) {
        setClasses([]);
        if (archive) {
          setAppliedTerm(term);
          setSearchParams(previous => {
            const next = new URLSearchParams(previous);
            next.set('archiveTerm', term.term_id);
            return next;
          }, { replace: true });
        }
        return true;
      }

      const classIds = classesData.map(c => c.class_record_id);

      // Fetch grading columns to determine setup status
      const { data: gradingCols } = await supabase
        .from('class_grading_columns')
        .select('class_record_id, term')
        .in('class_record_id', classIds);

      // Fetch posted grades
      const { data: postedGrades } = await supabase
        .from('posted_grades')
        .select('class_record_id, grade_period, is_locked')
        .in('class_record_id', classIds);

      const { data: correctionRequests } = await supabase
        .from('remark_override_requests')
        .select('request_id, class_record_id, status, correction_scope, requested_at')
        .in('class_record_id', classIds)
        .in('status', ['pending', 'approved'])
        .order('requested_at', { ascending: false });

      // Auto-sync regular block section students into enrollments for current-term classes only
      const sectionIds = !archive
        ? Array.from(new Set(classesData.map(c => c.section_id).filter(Boolean)))
        : [];
      if (sectionIds.length > 0) {
        try {
          const { data: sectionStudents } = await supabase
            .from('users')
            .select('user_id, section_id')
            .eq('role', 'student')
            .in('section_id', sectionIds);

          if (sectionStudents && sectionStudents.length > 0) {
            const { data: existingEnrolls } = await supabase
              .from('enrollments')
              .select('student_id, subject_id')
              .in('section_id', sectionIds);

            const existingSet = new Set((existingEnrolls || []).map(e => `${e.student_id}|${e.subject_id}`));

            const autoEnrollments = [];
            classesData.forEach(cls => {
              const stds = sectionStudents.filter(s => s.section_id === cls.section_id);
              stds.forEach(s => {
                if (!existingSet.has(`${s.user_id}|${cls.subject_id}`)) {
                  autoEnrollments.push({
                    student_id: s.user_id,
                    subject_id: cls.subject_id,
                    section_id: cls.section_id,
                    status: 'active'
                  });
                }
              });
            });

            if (autoEnrollments.length > 0) {
              await supabase
                .from('enrollments')
                .insert(autoEnrollments);
            }
          }
        } catch (syncErr) {
          console.warn('Auto-sync section students notice:', syncErr);
        }
      }

      // Fetch active enrollments count
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('student_id, section_id, subject_id')
        .in('section_id', classesData.map(c => c.section_id));

      const enrolledCountsMap = {};
      const uniqueEnrollmentKeys = new Set();
      (enrollments || []).forEach(e => {
        const uniqueStudentKey = `${e.student_id}|${e.section_id}|${e.subject_id}`;
        if (!uniqueEnrollmentKeys.has(uniqueStudentKey)) {
          uniqueEnrollmentKeys.add(uniqueStudentKey);
          const classKey = `${e.section_id}|${e.subject_id}`;
          enrolledCountsMap[classKey] = (enrolledCountsMap[classKey] || 0) + 1;
        }
      });

      // Load join codes
      const codes = {};
      await Promise.all(
        classesData.filter(cls => cls.termState.state === 'current').map(async (cls) => {
          try {
            const code = await getOrCreateJoinCode(
              cls.class_record_id, 
              cls.subjects?.code || 'CLS', 
              cls.sections?.name || 'A'
            );
            codes[cls.class_record_id] = code;
          } catch (e) {
            console.warn('Error loading join code for class:', cls.class_record_id, e);
          }
        })
      );

      // Map classes
      const mappedClasses = classesData.map((cls) => {
        const matchingCols = (gradingCols || []).filter(col => col.class_record_id === cls.class_record_id);
        const matchingPosted = (postedGrades || []).filter(g => g.class_record_id === cls.class_record_id);
        const matchingCorrections = (correctionRequests || []).filter(request => request.class_record_id === cls.class_record_id);
        const approvedCorrection = matchingCorrections.find(request => (
          request.status === 'approved' && request.correction_scope === 'student_score_row'
        ));
        const hasSetup = matchingCols.length > 0;
        
        let statusLabel = 'Active';
        let gradingPeriod = 'Prelim';

        if (hasSetup) {
          const postedPeriods = new Set(matchingPosted.map(getCanonicalGradePeriod));
          if (postedPeriods.has(GRADE_MILESTONES.SEMESTRAL_GRADE)) {
            statusLabel = 'Grades Posted';
            gradingPeriod = 'Final';
          } else {
            statusLabel = 'Ongoing';
            gradingPeriod = 'Semestral';
          }
        }

        const enrolledCount = enrolledCountsMap[`${cls.section_id}|${cls.subject_id}`] || 0;

        return {
          id: cls.class_record_id,
          subjectCode: cls.subjects?.code || 'N/A',
          subjectName: cls.subjects?.name || 'N/A',
          section: cls.sections?.name || 'N/A',
          units: cls.subjects?.units || 0,
          enrolled: enrolledCount,
          status: statusLabel,
          gradingPeriod,
          semester: cls.semester,
          schoolYear: cls.school_year,
          termState: cls.termState.state,
          daysLeft: cls.termState.daysLeft,
          approvedCorrectionId: approvedCorrection?.request_id || null,
          pendingCorrectionCount: matchingCorrections.filter(request => request.status === 'pending').length,
          joinCode: codes[cls.class_record_id] || 'Generating...'
        };
      });

      if (requestId !== periodRequest.current) return false;
      setClasses(mappedClasses);
      if (archive) {
        setAppliedTerm(term);
        setSearchParams(previous => {
          const next = new URLSearchParams(previous);
          next.set('archiveTerm', term.term_id);
          return next;
        }, { replace: true });
      }
      return true;
    } catch (err) {
      if (requestId === periodRequest.current) {
        console.error('Error fetching classes:', err);
        setArchiveError(archive
          ? 'The selected class archive could not be loaded. Please retry.'
          : 'Current-term classes could not be loaded. Please retry.');
      }
      return false;
    } finally {
      if (requestId === periodRequest.current) setLoading(false);
    }
  };

  useEffect(() => {
    async function initializePeriods() {
      if (!user?.id) return;
      try {
        const availableTerms = await fetchAcademicTerms();
        setTerms(availableTerms);
        const requestedArchive = availableTerms.find(term => (
          term.term_id === searchParams.get('archiveTerm') && !term.is_active
        ));
        if (requestedArchive) {
          setArchiveMode(true);
          await loadClassesForTerm(requestedArchive, { archive: true, availableTerms });
          return;
        }

        const activeTerm = getActiveAcademicTerm(availableTerms);
        setArchiveMode(false);
        setAppliedTerm(null);
        setSearchParams(previous => {
          const next = new URLSearchParams(previous);
          next.delete('archiveTerm');
          return next;
        }, { replace: true });
        if (activeTerm) await loadClassesForTerm(activeTerm, { availableTerms });
        else setLoading(false);
      } catch (err) {
        console.error('Academic periods could not be loaded:', err);
        setArchiveError('Academic periods could not be loaded.');
        setLoading(false);
      }
    }
    initializePeriods();
    // Initialization is intentionally tied to the authenticated faculty member.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handlePeriodModeChange = async (useArchive) => {
    periodRequest.current += 1;
    setArchiveMode(useArchive);
    setArchiveError('');
    setClasses([]);
    setSearchTerm('');
    setAppliedTerm(null);
    setSearchParams(previous => {
      const next = new URLSearchParams(previous);
      next.delete('archiveTerm');
      return next;
    }, { replace: true });
    if (useArchive) {
      setLoading(false);
      return;
    }
    const activeTerm = getActiveAcademicTerm(terms);
    if (activeTerm) await loadClassesForTerm(activeTerm);
  };

  const handleArchiveLoad = async (term) => {
    if (term) await loadClassesForTerm(term, { archive: true });
  };

  const handleCopyCode = (code) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Open Student Priority Roster
  const handleOpenRiskReview = async (cls) => {
    setActiveClassForReview(cls);
    setIsRiskReviewModalOpen(true);
    setLoadingPriorityList(true);
    try {
      const roster = await getClassPriorityRoster(cls.id);
      setPriorityStudents(roster);
    } catch (err) {
      console.error('Error loading priority roster:', err);
    } finally {
      setLoadingPriorityList(false);
    }
  };

  const filteredClasses = classes.filter(cls => {
    const searchLower = searchTerm.toLowerCase();
    return (
      cls.subjectCode.toLowerCase().includes(searchLower) ||
      cls.subjectName.toLowerCase().includes(searchLower) ||
      cls.section.toLowerCase().includes(searchLower) ||
      (cls.joinCode && cls.joinCode.toLowerCase().includes(searchLower))
    );
  });

  return (
    <>
      <PageHeader title="My Classes" breadcrumb="Faculty Portal">
        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="px-3.5 py-2 bg-sage-800 hover:bg-sage-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
        >
          <Plus className="h-4 w-4" />
          <span>Create Classroom</span>
        </button>
      </PageHeader>
      
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6">
        <RiskEducationNote variant="roster" />

        <AcademicPeriodFilter
          terms={terms}
          archiveMode={archiveMode}
          appliedTerm={appliedTerm}
          loading={loading}
          error={archiveError}
          onModeChange={handlePeriodModeChange}
          onLoad={handleArchiveLoad}
          onRetry={handleArchiveLoad}
        />
        
        {/* Success Creation Banner */}
        {creationBanner && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-center justify-between shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
              <div>
                <strong className="block text-sm">Classroom(s) Created Successfully!</strong>
                <span className="text-xs text-emerald-800">{creationBanner.message}</span>
              </div>
            </div>
            <button 
              onClick={() => setCreationBanner(null)}
              className="text-emerald-700 hover:text-emerald-900 p-1 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {archiveMode && !appliedTerm ? null : loading ? (
          <CardListSkeleton count={4} />
        ) : (
        <>
        {/* Toolbar: Search within the loaded academic period */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-9 py-2.5 sm:py-2 border border-slate-200 rounded-lg text-xs sm:text-sm bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors shadow-xs" 
              placeholder="Search subject code, section, or join code..." 
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          
          {archiveMode && appliedTerm && (
            <span className="text-[11px] font-semibold text-slate-500">
              Showing A.Y. {appliedTerm.school_year} · {appliedTerm.semester} Semester
            </span>
          )}
        </div>

        {/* Classes Grid */}
        {filteredClasses.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-8 sm:p-12 text-center max-w-xl mx-auto shadow-xs">
            <BookOpen className="h-10 w-10 text-slate-400 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-900 font-display">No class records found</h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {searchTerm
                ? "No classes match your search query."
                : archiveMode
                  ? "No classes were found for the selected archived academic period."
                  : "No assigned classrooms provisioned by the Academic Administrator for this semester."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredClasses.map((cls) => (
              <div key={cls.id} className="bg-white rounded-lg border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between overflow-visible text-left relative">
                
                {/* Card Header */}
                <div className="p-4 border-b border-slate-100 space-y-2.5">
                  <div className="flex justify-between items-center gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                        {cls.section}
                      </span>

                      {cls.status === 'Ongoing' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                          {cls.gradingPeriod} Ongoing
                        </span>
                      )}
                      {cls.status === 'Grades Posted' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {cls.gradingPeriod} Posted
                        </span>
                      )}
                      {cls.approvedCorrectionId && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-200">
                          Correction Approved
                        </span>
                      )}
                      {!cls.approvedCorrectionId && cls.pendingCorrectionCount > 0 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Awaiting Dean
                        </span>
                      )}
                      {cls.termState === 'pending' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Pending · SG due in {cls.daysLeft} {cls.daysLeft === 1 ? 'day' : 'days'}
                        </span>
                      )}
                      {cls.termState === 'overdue' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          SG Overdue
                        </span>
                      )}
                      {cls.termState === 'archived' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          Archived · View only
                        </span>
                      )}
                    </div>

                    {/* Three Dots Quick Actions Menu */}
                    <div className="relative card-quick-menu-container">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === cls.id ? null : cls.id);
                        }}
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                        title="Quick Actions Menu"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>

                      {activeMenuId === cls.id && (
                        <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-xl border border-slate-200 py-1.5 z-40 text-xs text-slate-700">
                          <button
                            onClick={() => {
                              setActiveMenuId(null);
                              handleOpenRiskReview(cls);
                            }}
                            className="w-full text-left px-3.5 py-2 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-2.5 transition-colors font-semibold cursor-pointer"
                          >
                            <Target className="h-4 w-4 text-rose-600 shrink-0" />
                            <span>Student Priority List &amp; Advising</span>
                          </button>

                          <Link
                            to={`/faculty/gradecomputationpreview?id=${cls.id}`}
                            onClick={() => setActiveMenuId(null)}
                            className="w-full text-left px-3.5 py-2 hover:bg-sage-50 hover:text-sage-700 flex items-center gap-2.5 transition-colors"
                          >
                            <FileText className="h-4 w-4 text-sage-600 shrink-0" />
                            <span>Review &amp; Post Grades</span>
                          </Link>

                          <Link
                            to={`/faculty/postedgradesview?id=${cls.id}`}
                            onClick={() => setActiveMenuId(null)}
                            className="w-full text-left px-3.5 py-2 hover:bg-violet-50 hover:text-violet-700 flex items-center gap-2.5 transition-colors"
                          >
                            <FileText className="h-4 w-4 text-violet-600 shrink-0" />
                            <span>Posted Grades &amp; Corrections</span>
                          </Link>

                          {cls.termState === 'current' && (
                            <Link
                              to={`/faculty/classattendance?classId=${cls.id}`}
                              onClick={() => setActiveMenuId(null)}
                              className="w-full text-left px-3.5 py-2 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2.5 transition-colors"
                            >
                              <Calendar className="h-4 w-4 text-slate-500 shrink-0" />
                              <span>Attendance Monitoring</span>
                            </Link>
                          )}

                          <div className="border-t border-slate-100 my-1"></div>

                          <Link
                            to={`/faculty/gradecomponentssetup?id=${cls.id}`}
                            onClick={() => setActiveMenuId(null)}
                            className="w-full text-left px-3.5 py-2 hover:bg-slate-50 hover:text-slate-900 flex items-center gap-2.5 transition-colors text-slate-600"
                          >
                            <Settings className="h-4 w-4 text-slate-400 shrink-0" />
                            <span>View Grade Weights</span>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-base font-bold font-display text-slate-900 leading-tight">
                      {cls.subjectCode}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{cls.subjectName}</p>
                  </div>

                  {/* Classroom Join Code Display Bar (current-term classes only) */}
                  {cls.termState === 'current' && (
                  <div className="flex items-center justify-between p-2.5 bg-sage-50/70 border border-sage-200/80 rounded-md">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-sage-800 uppercase tracking-wide">Classroom Code:</span>
                      <span className="font-mono text-xs font-bold text-sage-950 tracking-wider bg-white px-2 py-0.5 rounded border border-sage-200 shadow-2xs">{cls.joinCode}</span>
                    </div>
                    <button
                      onClick={() => handleCopyCode(cls.joinCode)}
                      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-sage-800 bg-white hover:bg-sage-100/60 border border-sage-200 rounded transition-colors cursor-pointer"
                      title="Copy Classroom Code for students to self-enroll"
                    >
                      {copiedCode === cls.joinCode ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span className="text-emerald-700 font-semibold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-sage-700" />
                          <span>Copy Code</span>
                        </>
                      )}
                    </button>
                  </div>
                  )}
                </div>
                
                {/* Card Body */}
                <div className="p-4 space-y-2 bg-white text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    <span>{cls.schoolYear} • {cls.semester}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-slate-400" />
                    <span><strong className="text-slate-900 font-mono">{cls.enrolled}</strong> Students Enrolled</span>
                  </div>
                </div>
                
                {/* Card Actions (Footer) - Streamlined Single Primary Action */}
                <div className="p-3 bg-slate-50 border-t border-slate-100">
                  {cls.approvedCorrectionId ? (
                    <Link
                      to={`/faculty/postedgradesview?id=${cls.id}&request=${cls.approvedCorrectionId}`}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-md transition-all shadow-xs"
                    >
                      <Edit3 className="h-4 w-4" /> Continue Approved Correction
                    </Link>
                  ) : cls.termState === 'archived' || cls.status === 'Grades Posted' ? (
                    <Link
                      to={`/faculty/postedgradesview?id=${cls.id}`}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md transition-all shadow-xs"
                    >
                      <FileText className="h-4 w-4" /> Posted Grades &amp; Corrections
                    </Link>
                  ) : (
                    <Link
                      to={`/faculty/scoreinput?id=${cls.id}`}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold bg-sage-600 hover:bg-sage-700 text-white rounded-md transition-all shadow-xs"
                    >
                      <Edit3 className="h-4 w-4" /> {cls.termState === 'current' ? 'Open Scorebook' : 'Finish Grading & Post SG'}
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        </>
        )}
      </div>





      {/* ========================================================================= */}
      {/* 3. STUDENT PRIORITY ROSTER & ACADEMIC ADVISING MODAL                       */}
      {/* ========================================================================= */}
      {isRiskReviewModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs text-left animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
            
            {/* Header */}
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold font-display text-slate-900 flex items-center gap-2">
                  <Target className="w-4 h-4 text-rose-600" />
                  <span>Student Priority List &amp; Academic Advising</span>
                  <span className="text-xs font-mono font-medium text-slate-500">
                    [{activeClassForReview?.subjectCode} — {activeClassForReview?.section}]
                  </span>
                </h3>
                <p className="text-xs text-slate-500 font-sans mt-0.5">
                  Students needing the most help and attention are sorted to the top.
                </p>
              </div>
              <button
                onClick={() => setIsRiskReviewModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Roster Table */}
            <div className="p-4 overflow-y-auto flex-1 text-xs font-sans">
              {loadingPriorityList ? (
                <div className="p-8 text-center text-slate-500">
                  <p>Calculating academic risk indicators...</p>
                </div>
              ) : priorityStudents.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <p>No students enrolled in this section.</p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                      <tr>
                        <th className="py-2.5 pl-3 pr-2 text-left">Student</th>
                        <th className="py-2.5 px-2 text-right">GWA</th>
                        <th className="py-2.5 px-2 text-right">Exam Avg</th>
                        <th className="py-2.5 px-2 text-right">Absences</th>
                        <th className="py-2.5 px-2 text-center">Trajectory</th>
                        <th className="py-2.5 px-2 text-center">Risk Score</th>
                        <th className="py-2.5 pr-3 pl-2 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {priorityStudents.map((stud) => (
                        <tr key={stud.user_id} className={cn(
                          "hover:bg-slate-50/80 transition-colors",
                          stud.risk_score >= RISK_TIERS.HIGH.min && "bg-rose-50/30"
                        )}>
                          <td className="py-2 pl-3 pr-2">
                            <div className="font-semibold text-slate-900">
                              {stud.last_name}, {stud.first_name}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              {stud.student_id_number}
                            </div>
                          </td>

                          <td className="py-2 px-2 text-right font-mono font-medium text-slate-800">
                            {stud.current_gwa ? stud.current_gwa.toFixed(2) : '—'}
                          </td>

                          <td className="py-2 px-2 text-right font-mono font-medium text-slate-800">
                            {stud.exam_average}%
                          </td>

                          <td className="py-2 px-2 text-right font-mono font-medium text-slate-800">
                            <span className={cn(stud.absences >= 4 && "text-rose-600 font-bold")}>
                              {stud.absences}/4
                            </span>
                          </td>

                          <td className="py-2 px-2 text-center font-mono text-[11px]">
                            {stud.trajectory_delta !== null && stud.trajectory_delta !== undefined ? (
                              <span className={cn(
                                "inline-flex items-center gap-0.5",
                                stud.trajectory_delta < 0 ? "text-rose-600 font-semibold" : "text-emerald-600"
                              )}>
                                {stud.trajectory_delta < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                                {stud.trajectory_delta > 0 ? `+${stud.trajectory_delta.toFixed(1)}%` : `${stud.trajectory_delta.toFixed(1)}%`}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="py-2 px-2 text-center">
                            <span className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold border",
                              stud.risk_score >= RISK_TIERS.CRITICAL.min ? "bg-rose-50 text-rose-700 border-rose-200" :
                              stud.risk_score >= RISK_TIERS.HIGH.min ? "bg-rose-50 text-rose-700 border-rose-200" :
                              stud.risk_score >= RISK_TIERS.MODERATE.min ? "bg-amber-50 text-amber-700 border-amber-200" :
                              "bg-emerald-50 text-emerald-700 border-emerald-200"
                            )}>
                              <span className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                stud.risk_score >= RISK_TIERS.HIGH.min ? "bg-rose-600" : stud.risk_score >= RISK_TIERS.MODERATE.min ? "bg-amber-500" : "bg-emerald-500"
                              )} />
                              {stud.risk_score}/100
                            </span>
                          </td>

                          <td className="py-2 pr-3 pl-2 text-right">
                            <button
                              onClick={() => setEvaluatingStudent(stud)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-sage-600 hover:bg-sage-700 active:bg-sage-800 rounded-md shadow-xs transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>{stud.evaluation ? 'Edit Plan' : 'Evaluate'}</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setIsRiskReviewModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md cursor-pointer"
              >
                Close List
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 4. HITL RISK EVALUATION & INTERVENTION MODAL                              */}
      {/* ========================================================================= */}
      {evaluatingStudent && (
        <StudentRiskEvaluationModal
          isOpen={Boolean(evaluatingStudent)}
          onClose={() => setEvaluatingStudent(null)}
          student={evaluatingStudent}
          classRecordId={activeClassForReview?.id}
          currentTerm={activeClassForReview?.gradingPeriod || 'Midterm'}
          subjectCode={activeClassForReview?.subjectCode}
          subjectName={activeClassForReview?.subjectName}
          onSaveSuccess={(saved) => {
            // Update local priority list state
            setPriorityStudents(prev => prev.map(s => s.user_id === evaluatingStudent.user_id ? { ...s, evaluation: saved } : s));
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* 5. FACULTY CLASSROOM SELF-SERVICE CREATION MODAL                           */}
      {/* ========================================================================= */}
      <FacultyCreateClassroomModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={async ({ count, results }) => {
          await handlePeriodModeChange(false);
          const listStr = results.map(r => `${r.subject?.code} (${r.section?.name}) [Join Code: ${r.join_code}]`).join(', ');
          setCreationBanner({
            message: `Created ${count} active classroom(s): ${listStr}`
          });
          setTimeout(() => setCreationBanner(null), 8000);
        }}
      />
    </>
  );
}
