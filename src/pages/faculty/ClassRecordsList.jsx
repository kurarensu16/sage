import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
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
  PlusCircle,
  CheckCircle2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { CardListSkeleton } from '../../components/common/Skeleton';
import { 
  getOrCreateJoinCode, 
  getClassPriorityRoster 
} from '../../lib/classRoomService';
import StudentRiskEvaluationModal from './StudentRiskEvaluationModal';
import FacultyCreateClassroomModal from './FacultyCreateClassroomModal';
import { cn } from '../../lib/utils';

export default function ClassRecordsList() {
  const { user } = useAuth();
  const location = useLocation();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('current'); // 'current' or 'past'
  const [copiedCode, setCopiedCode] = useState(null);

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

  useEffect(() => {
    if (location.search.includes('action=create')) {
      setIsCreateModalOpen(true);
    }
  }, [location.search]);

  const fetchClasses = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: classesData, error: classesError } = await supabase
        .from('class_records')
        .select(`
          class_record_id,
          status,
          school_year,
          semester,
          subject_id,
          section_id,
          subjects ( subject_id, code, name, units, computation_id ),
          sections ( section_id, name, school_year, semester )
        `)
        .eq('faculty_id', user.id)
        .eq('status', filterType === 'current' ? 'active' : 'archived');

      if (classesError) throw classesError;

      if (!classesData || classesData.length === 0) {
        setClasses([]);
        setLoading(false);
        return;
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

      // Fetch active enrollments count
      const { data: enrollments } = await supabase
        .from('enrollments')
        .select('section_id, subject_id')
        .in('section_id', classesData.map(c => c.section_id));

      const enrolledCountsMap = {};
      (enrollments || []).forEach(e => {
        const key = `${e.section_id}|${e.subject_id}`;
        enrolledCountsMap[key] = (enrolledCountsMap[key] || 0) + 1;
      });

      // Load join codes
      const codes = {};
      await Promise.all(
        classesData.map(async (cls) => {
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
        const matchingPosted = (postedGrades || []).filter(g => g.class_record_id === cls.class_record_id && g.is_locked);
        const hasSetup = matchingCols.length > 0;
        
        let statusLabel = 'Pending Setup';
        let gradingPeriod = 'Prelim';

        if (hasSetup) {
          const postedPeriods = new Set(matchingPosted.map(g => g.grade_period.toLowerCase()));
          if (postedPeriods.has('final')) {
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
          joinCode: codes[cls.class_record_id] || 'Generating...'
        };
      });

      setClasses(mappedClasses);
    } catch (err) {
      console.error('Error fetching classes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClasses();
  }, [user, filterType]);

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

  if (loading) {
    return <CardListSkeleton count={4} />;
  }

  return (
    <>
      <PageHeader title="My Class Records" breadcrumb="Faculty Portal" />
      
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6">
        
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

        {/* Toolbar: Search, Semester Filter & Create Room Action */}
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
          
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5 no-scrollbar">
            <div className="flex items-center gap-1.5 p-0.5 bg-slate-100 border border-slate-200 rounded-lg">
              <button 
                onClick={() => setFilterType('current')}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap",
                  filterType === 'current' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                Current Term
              </button>
              <button 
                onClick={() => setFilterType('past')}
                className={cn(
                  "px-3 py-1.5 text-xs font-semibold rounded-md transition-all cursor-pointer whitespace-nowrap",
                  filterType === 'past' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                Past Archives
              </button>
            </div>

            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="px-3.5 py-1.5 bg-sage-800 hover:bg-sage-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-all shrink-0"
            >
              <Plus className="h-4 w-4" />
              <span>Create Classrooms</span>
            </button>
          </div>
        </div>

        {/* Classes Grid */}
        {filteredClasses.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-8 sm:p-12 text-center max-w-xl mx-auto shadow-xs">
            <BookOpen className="h-10 w-10 text-slate-400 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-900 font-display">No class records found</h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              {searchTerm ? "No classes match your search query." : "No assigned classrooms provisioned by the Academic Administrator for this semester."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredClasses.map((cls) => (
              <div key={cls.id} className="bg-white rounded-lg border border-slate-200 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between overflow-hidden text-left">
                
                {/* Card Header */}
                <div className="p-4 border-b border-slate-100 space-y-2.5">
                  <div className="flex justify-between items-start gap-2">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 font-mono">
                      {cls.section}
                    </span>

                    <div className="flex items-center gap-1.5">
                      {cls.status === 'Pending Setup' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          {cls.status}
                        </span>
                      )}
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
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-base font-bold font-display text-slate-900 leading-tight">
                      {cls.subjectCode}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{cls.subjectName}</p>
                  </div>

                  {/* Classroom Join Code Display Bar */}
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
                
                {/* Card Actions (Footer) */}
                <div className="p-3 bg-slate-50 border-t border-slate-100 flex flex-col gap-2">
                  
                  {/* Primary ASPIRE Action: Student Priority List & Risk Advising */}
                  <button
                    onClick={() => handleOpenRiskReview(cls)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 rounded-md shadow-xs transition-all cursor-pointer"
                  >
                    <Target className="w-3.5 h-3.5 text-rose-600" />
                    <span>Student Priority List &amp; Advising</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    {cls.status === 'Pending Setup' ? (
                      <Link 
                        to={`/faculty/gradecomponentssetup?id=${cls.id}`} 
                        className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-md transition-all shadow-xs"
                      >
                        <Settings className="h-3.5 w-3.5" /> Setup Grade Weights
                      </Link>
                    ) : (
                      <>
                        <Link 
                          to={`/faculty/scoreinput?id=${cls.id}`} 
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-sage-600 hover:bg-sage-700 text-white rounded-md transition-all shadow-xs"
                        >
                          <Edit3 className="h-3.5 w-3.5" /> Input Scores
                        </Link>
                        <Link
                          to={`/faculty/gradecomputationpreview?id=${cls.id}`}
                          className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-sage-200 bg-sage-50 hover:bg-sage-100 text-sage-700 rounded-md transition-all shadow-xs"
                        >
                          <FileText className="h-3.5 w-3.5" /> Preview Grades
                        </Link>
                        <Link 
                          to={`/faculty/classattendance?classId=${cls.id}`} 
                          className="col-span-2 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-md transition-all shadow-xs"
                        >
                          <Calendar className="h-3.5 w-3.5 text-slate-500" /> Attendance
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
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
                          stud.risk_score >= 50 && "bg-rose-50/30"
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
                              stud.risk_score >= 75 ? "bg-rose-50 text-rose-700 border-rose-200" :
                              stud.risk_score >= 50 ? "bg-rose-50 text-rose-700 border-rose-200" :
                              stud.risk_score >= 25 ? "bg-amber-50 text-amber-700 border-amber-200" :
                              "bg-emerald-50 text-emerald-700 border-emerald-200"
                            )}>
                              <span className={cn(
                                "w-1.5 h-1.5 rounded-full",
                                stud.risk_score >= 50 ? "bg-rose-600" : stud.risk_score >= 25 ? "bg-amber-500" : "bg-emerald-500"
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
        onSuccess={({ count, results }) => {
          fetchClasses();
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
