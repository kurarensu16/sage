import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Search, ShieldAlert, Check, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { showLocalNotification } from '../../lib/notificationService';
import { getRemarks, toDbRemark, toDisplayRemark, toGwaOrNull, TRANSMUTATION_LADDER, GRADE_SCALE } from '../../lib/academicPolicy';
import { GRADE_MILESTONES, getCanonicalGradePeriod } from '../../lib/gradeMilestones';
import { applyAdminGradeOverride } from '../../lib/gradePostingService';

// Official DYCI grade steps (1.00 … 3.00, then 5.00), taken from the grading scale.
const GRADE_STEPS = Object.freeze(
  [...new Set([...TRANSMUTATION_LADDER.map(step => step.gwa), GRADE_SCALE.failedValue])].sort((a, b) => a - b)
);

// Badge color per DB remark value. Only 'passed' reads as success — every other state
// (failed, FDA, incomplete, dropped) is visually distinct, never collapsed to one "Failed" look.
const REMARK_BADGE_CLASS = {
  passed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  fda: 'bg-rose-50 text-rose-700 border-rose-200',
  incomplete: 'bg-amber-50 text-amber-700 border-amber-200',
  dropped: 'bg-slate-100 text-slate-600 border-slate-200'
};
const remarkBadgeClass = (dbRemark) => REMARK_BADGE_CLASS[String(dbRemark || '').trim().toLowerCase()] || REMARK_BADGE_CLASS.failed;

export default function GradeOverride() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentMatches, setStudentMatches] = useState([]);
  const [postedGrades, setPostedGrades] = useState([]);
  const [adminProfile, setAdminProfile] = useState(null);
  
  // Override Modal State
  const [isOverrideOpen, setIsOverrideOpen] = useState(false);
  const [selectedGrade, setSelectedGrade] = useState(null);
  const [newSgVal, setNewSgVal] = useState('');
  const [newGradeVal, setNewGradeVal] = useState('');
  const [newRemark, setNewRemark] = useState('failed');
  const [overrideReason, setOverrideReason] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    async function getAdmin() {
      if (user?.id) {
        const { data } = await supabase
          .from('users')
          .select('first_name, last_name, email')
          .eq('user_id', user.id)
          .maybeSingle();
        if (data) {
          setAdminProfile(data);
        }
      }
    }
    getAdmin();
  }, [user]);

  const fetchStudentGrades = async (studentId) => {
    try {
      const { data: gradesData, error: gradesErr } = await supabase
        .from('posted_grades')
        .select(`
          posted_grade_id,
          computed_grade,
          effective_grade,
          grade_period,
          remarks,
          remarks_note,
          is_locked,
          class_records (
            class_record_id,
            faculty_id,
            sections (name),
            subjects (code, name)
          )
        `)
        .eq('student_id', studentId);

      if (gradesErr) throw gradesErr;

      const mappedGrades = gradesData?.map(g => ({
        id: g.posted_grade_id,
        subjectCode: g.class_records?.subjects?.code || 'N/A',
        subjectName: g.class_records?.subjects?.name || '',
        classRecordId: g.class_records?.class_record_id || null,
        section: g.class_records?.sections?.name || 'N/A',
        facultyId: g.class_records?.faculty_id || null,
        gradePeriod: g.grade_period,
        isSemestral: getCanonicalGradePeriod(g) === GRADE_MILESTONES.SEMESTRAL_GRADE,
        computedGrade: Number(g.computed_grade),
        effectiveGrade: Number(g.effective_grade !== null ? g.effective_grade : toGwaOrNull(g.computed_grade)),
        remarks: g.remarks,
        remarksNote: g.remarks_note || '',
        isLocked: g.is_locked
      })) || [];

      setPostedGrades(mappedGrades);
    } catch (err) {
      console.error('Failed to load grades:', err);
      setErrorMsg('Failed to fetch student grades: ' + err.message);
    }
  };

  const handleSelectStudent = async (match) => {
    setErrorMsg('');
    setSuccessMsg('');
    setSelectedStudent({
      id: match.user_id,
      firstName: match.first_name,
      lastName: match.last_name,
      middleName: match.middle_name,
      email: match.email,
      userNumber: match.user_number || '',
      section: match.sections?.name || '',
      department: match.departments?.name || 'No college'
    });
    await fetchStudentGrades(match.user_id);
  };

  // Every match is listed and the admin picks the exact student; nothing is chosen
  // for them when several students share a name.
  const handleSearchStudent = async () => {
    setErrorMsg('');
    setSuccessMsg('');
    setSelectedStudent(null);
    setStudentMatches([]);
    setPostedGrades([]);

    const term = searchQuery.trim();
    if (!term) {
      setErrorMsg('Please enter a search query.');
      return;
    }

    try {
      const searchPattern = `%${term.replace(/[,()]/g, ' ')}%`;
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(term);
      let orFilter = `last_name.ilike.${searchPattern},first_name.ilike.${searchPattern},email.ilike.${searchPattern},user_number.ilike.${searchPattern}`;
      if (isUUID) {
        orFilter += `,user_id.eq.${term}`;
      }

      const { data: matchedUsers, error: userErr } = await supabase
        .from('users')
        .select(`
          user_id,
          first_name,
          last_name,
          middle_name,
          email,
          user_number,
          departments (name),
          sections (name)
        `)
        .eq('role', 'student')
        .eq('status', 'active')
        .or(orFilter)
        .order('last_name')
        .order('first_name')
        .limit(50);

      if (userErr) throw userErr;

      if (!matchedUsers || matchedUsers.length === 0) {
        setErrorMsg('No active student found matching that search query.');
      } else if (matchedUsers.length === 1) {
        await handleSelectStudent(matchedUsers[0]);
      } else {
        setStudentMatches(matchedUsers);
      }
    } catch (err) {
      console.error('Lookup failed:', err);
      setErrorMsg('Failed to lookup student: ' + err.message);
    }
  };

  const handleOpenOverride = (grade) => {
    if (!grade.isSemestral) return;
    setSelectedGrade(grade);
    setNewSgVal(Number(grade.computedGrade).toFixed(2));
    const nearestStep = GRADE_STEPS.reduce((best, step) => (
      Math.abs(step - grade.effectiveGrade) < Math.abs(best - grade.effectiveGrade) ? step : best
    ), GRADE_STEPS[0]);
    setNewGradeVal(nearestStep.toFixed(2));
    setNewRemark(String(grade.remarks || 'failed').toLowerCase());
    setOverrideReason('');
    setErrorMsg('');
    setIsOverrideOpen(true);
  };

  const handleNewSgChange = (value) => {
    setNewSgVal(value);
    const sg = Number(value);
    if (!Number.isFinite(sg) || sg < 0 || sg > 100) return;
    const baseGwa = toGwaOrNull(sg);
    if (newRemark === 'fda') {
      setNewGradeVal('5.00');
    } else if (newRemark === 'incomplete' || newRemark === 'dropped') {
      setNewGradeVal(Number(baseGwa).toFixed(2));
    } else {
      const nextRemark = Number(baseGwa) <= 3 ? 'passed' : 'failed';
      setNewRemark(nextRemark);
      setNewGradeVal(Number(baseGwa).toFixed(2));
    }
  };

  const handleNewRemarkChange = (value) => {
    setNewRemark(value);
    const baseGwa = toGwaOrNull(newSgVal);
    if (baseGwa == null) return;
    const effective = value === 'fda' ? 5 : value === 'passed' ? Math.min(baseGwa, 3) : baseGwa;
    setNewGradeVal(Number(effective).toFixed(2));
  };

  const handleSaveOverride = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const parsedSg = parseFloat(newSgVal);
    const parsedGrade = parseFloat(newGradeVal);

    if (!selectedGrade?.isSemestral) {
      setErrorMsg('Only the Semestral Grade (SG) can be overridden. MR and TFR are progress ratings.');
      return;
    }
    if (!Number.isFinite(parsedSg) || parsedSg < 0 || parsedSg > 100) {
      setErrorMsg('Enter an official SG percentage from 0 to 100.');
      return;
    }
    if (!GRADE_STEPS.includes(parsedGrade)) {
      setErrorMsg(`Choose an official DYCI grade: ${GRADE_STEPS.map(step => step.toFixed(2)).join(', ')}.`);
      return;
    }

    if (!overrideReason.trim()) {
      setErrorMsg('Please specify a valid administrative reason for this override.');
      return;
    }

    const remarks = toDbRemark(newRemark || getRemarks({ gwa: parsedGrade, isComplete: true }));

    try {
      // Goes through the RPC rather than a direct table update: it is the only path
      // allowed to change a locked SG, and it records the override in
      // grade_correction_history with the reason attached.
      await applyAdminGradeOverride({
        postedGradeId: selectedGrade.id,
        newComputedGrade: parsedSg,
        newEffectiveGrade: parsedGrade,
        newRemarks: remarks,
        reason: overrideReason.trim()
      });

      const actorName = adminProfile 
        ? `${adminProfile.first_name} ${adminProfile.last_name}` 
        : (user?.email || 'Administrator');

      const oldSgVal = selectedGrade.computedGrade;
      const oldGradeVal = selectedGrade.effectiveGrade;
      const oldRemarksVal = selectedGrade.remarks;

      const studentLabel = `${selectedStudent.lastName}, ${selectedStudent.firstName}${selectedStudent.userNumber ? ` (${selectedStudent.userNumber})` : ''}`;
      const previousNote = selectedGrade.remarksNote ? ` Previous remark note: "${selectedGrade.remarksNote}".` : '';
      const logMessage = `Overrode ${studentLabel}'s official result in ${selectedGrade.subjectCode} (${selectedGrade.section}) from SG ${oldSgVal.toFixed(2)} / GWA ${oldGradeVal.toFixed(2)} / ${oldRemarksVal} to SG ${parsedSg.toFixed(2)} / GWA ${parsedGrade.toFixed(2)} / ${remarks}. Reason: ${overrideReason.trim()}.${previousNote}`;

      const { error: logErr } = await supabase
        .from('activity_logs')
        .insert({
          action: 'Applied Administrative Grade Override',
          message: logMessage,
          actor: actorName
        });

      if (logErr) {
        console.error('Failed to write activity log:', logErr);
      }

      // Local notification for admin actor
      await showLocalNotification({
        title: 'Grade Override Executed',
        body: `Overrode ${selectedStudent.firstName} ${selectedStudent.lastName}'s official result in ${selectedGrade.subjectCode} to SG ${parsedSg.toFixed(2)}, GWA ${parsedGrade.toFixed(2)} (${remarks}).`
      });

      setIsOverrideOpen(false);
      setSuccessMsg('Grade override submitted successfully. Action logged to audit service.');
      
      if (selectedStudent) {
        await fetchStudentGrades(selectedStudent.id);
      }
    } catch (err) {
      console.error('Override failed:', err);
      setErrorMsg('Failed to override grade: ' + err.message);
    }
  };

  return (
    <>
      <PageHeader title="Administrative Grade Override" breadcrumb="Admin Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8">
        
        {/* Warning Banner */}
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-4 flex gap-3 text-xs leading-relaxed">
          <ShieldAlert className="h-5 w-5 text-amber-700 mt-0.5 flex-shrink-0" />
          <div>
            <strong>Immutable Grade System Override Panel</strong>
            <p className="text-slate-600 mt-0.5">
              Grade overrides should only be performed under faculty recommendation or registrar dispute approvals. All modifications write directly to immutable audit logs with admin metadata.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-lg text-sm font-semibold">
            {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-lg text-sm font-semibold">
            {successMsg}
          </div>
        )}

        {/* Student Lookup Search */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 sm:p-6 space-y-3 sm:space-y-4">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Lookup Enrolled Student</label>
          <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
            <div className="relative flex-1">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearchStudent()}
                placeholder="Student Name or Student ID..."
                className="block w-full px-3.5 py-2.5 border border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors" 
              />
            </div>
            <button 
              onClick={handleSearchStudent}
              className="px-5 py-2.5 bg-sage-600 hover:bg-sage-700 text-white rounded-xl text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <Search className="h-4 w-4" /> Search Student
            </button>
          </div>
        </div>

        {/* Several matches: the admin picks the exact student */}
        {!selectedStudent && studentMatches.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-4 sm:p-6 space-y-3">
            <p className="text-xs font-bold text-slate-700">
              {studentMatches.length} students match. Choose the exact student:
            </p>
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {studentMatches.map(match => (
                <button
                  key={match.user_id}
                  type="button"
                  onClick={() => handleSelectStudent(match)}
                  className="w-full text-left px-4 py-3 hover:bg-sage-50 transition-colors flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 cursor-pointer"
                >
                  <span className="text-sm font-semibold text-slate-900">
                    {match.last_name}, {match.first_name}{match.middle_name ? ` ${match.middle_name[0]}.` : ''}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {match.user_number || 'No ID'} · {match.departments?.name || 'No college'} · {match.sections?.name || 'No section'}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Student Grades View */}
        {selectedStudent && (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden space-y-4 p-4 sm:p-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-bold text-xs flex items-center justify-center font-mono flex-shrink-0">
                {selectedStudent.firstName[0]}{selectedStudent.lastName[0]}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-bold font-display text-slate-900 truncate">
                  {selectedStudent.lastName}, {selectedStudent.firstName} {selectedStudent.middleName && selectedStudent.middleName[0] + '.'}
                </h4>
                <p className="text-[11px] text-slate-500 font-mono truncate">
                  {selectedStudent.userNumber || 'No ID'} · {selectedStudent.email} — {selectedStudent.department}{selectedStudent.section ? ` · ${selectedStudent.section}` : ''}
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">Only the Semestral Grade (SG) can be overridden; MR and TFR are shown for reference.</p>
              </div>
            </div>

            {/* ── Mobile Grades Cards (md:hidden) ── */}
            <div className="md:hidden space-y-3">
              {postedGrades.length > 0 ? (
                postedGrades.map((grade) => (
                  <div key={grade.id} className="bg-slate-50/70 rounded-xl p-3.5 border border-slate-200/80 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-slate-900">{grade.subjectCode}</span>
                          <span className="text-[10px] text-slate-500 font-mono">({grade.section})</span>
                        </div>
                        <span className="text-[11px] text-slate-600 capitalize block">{grade.gradePeriod} Period</span>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-bold font-mono text-slate-950">{grade.computedGrade.toFixed(2)}%</div>
                        <div className="text-[10px] font-mono text-slate-500">GWA {grade.effectiveGrade.toFixed(2)}</div>
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-micro font-bold border ${remarkBadgeClass(grade.remarks)}`}>
                          {toDisplayRemark(grade.remarks)}
                        </span>
                      </div>
                    </div>

                    {grade.isSemestral ? (
                      <button
                        onClick={() => handleOpenOverride(grade)}
                        className="w-full py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer active:scale-98"
                      >
                        <ShieldAlert className="h-3.5 w-3.5" /> Override SG
                      </button>
                    ) : (
                      <p className="text-center text-[11px] text-slate-400">Progress rating, view only</p>
                    )}
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs">
                  No posted grades found for this student.
                </div>
              )}
            </div>

            {/* ── Desktop Grades Table (hidden md:block) ── */}
            <div className="hidden md:block table-container border border-slate-200 rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Subject Code</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Class Section</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Grading Period</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">SG %</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Effective GWA</th>
                    <th className="px-6 py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">Standing</th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-slate-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {postedGrades.length > 0 ? (
                    postedGrades.map((grade) => (
                      <tr key={grade.id} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold font-mono text-slate-900">
                          {grade.subjectCode}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                          {grade.section}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600 capitalize">
                          {grade.gradePeriod}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-mono font-bold text-slate-950">
                          {grade.computedGrade.toFixed(2)}%
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-mono font-bold text-slate-950">
                          {grade.effectiveGrade.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${remarkBadgeClass(grade.remarks)}`}>
                            {toDisplayRemark(grade.remarks)}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          {grade.isSemestral ? (
                            <button
                              onClick={() => handleOpenOverride(grade)}
                              className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-xs font-bold transition-all inline-flex items-center gap-1 shadow-sm"
                            >
                              <ShieldAlert className="h-3 w-3" /> Override SG
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">View only</span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="7" className="px-6 py-10 text-center text-slate-400 text-sm">
                        No posted grades found for this student.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* Override dialog modal */}
      {isOverrideOpen && selectedGrade && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 max-w-md w-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-200">
            
            {/* Mobile grab handle */}
            <div className="sm:hidden pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1.25 bg-slate-300 rounded-full" />
            </div>

            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/30">
              <h3 className="text-sm sm:text-base font-bold font-display text-amber-900 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 sm:h-5 sm:w-5 text-amber-700" /> Execute Grade Override
              </h3>
              <button 
                onClick={() => setIsOverrideOpen(false)}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-900 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveOverride}>
              <div className="p-4 sm:p-6 space-y-4">
                
                {errorMsg && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs font-bold">
                    {errorMsg}
                  </div>
                )}

                <div className="bg-slate-50 border border-slate-150 p-3.5 rounded-xl text-xs space-y-1">
                  <div>Student: <strong className="text-slate-800">{selectedStudent?.lastName}, {selectedStudent?.firstName}</strong></div>
                  <div>Subject / Section: <span className="text-slate-600 font-mono">{selectedGrade.subjectCode} ({selectedGrade.section})</span></div>
                  <div>Grading Period: <span className="text-slate-600 capitalize">{selectedGrade.gradePeriod}</span></div>
                  <div>Current SG: <strong className="text-slate-800 font-mono">{selectedGrade.computedGrade.toFixed(2)}%</strong></div>
                  <div>Current GWA: <strong className="text-slate-800 font-mono">{selectedGrade.effectiveGrade.toFixed(2)}</strong></div>
                  <div>Current Status: <strong className="text-slate-800">{toDisplayRemark(selectedGrade.remarks)}</strong></div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="override-sg" className="text-xs font-bold text-slate-700 uppercase tracking-wide">Replacement SG Percentage</label>
                  <input
                    id="override-sg"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    required
                    value={newSgVal}
                    onChange={(e) => handleNewSgChange(e.target.value)}
                    className="block w-full px-3.5 py-2.5 border border-slate-200 focus:border-sage-500 rounded-xl text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-sage-500 bg-white"
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="override-grade" className="text-xs font-bold text-slate-700 uppercase tracking-wide">Replacement Effective GWA</label>
                  <select
                    id="override-grade"
                    required
                    value={newGradeVal}
                    onChange={(e) => setNewGradeVal(e.target.value)}
                    className="block w-full px-3.5 py-2.5 border border-slate-200 focus:border-sage-500 rounded-xl text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-sage-500 bg-white"
                  >
                    {GRADE_STEPS.map(step => (
                      <option key={step} value={step.toFixed(2)}>
                        {step.toFixed(2)}{step === GRADE_SCALE.failedValue ? ' (Failed)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-400">The database rejects an SG, GWA, and status combination that conflicts with the institutional transmutation policy.</p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="override-remark" className="text-xs font-bold text-slate-700 uppercase tracking-wide">Replacement Academic Status</label>
                  <select
                    id="override-remark"
                    required
                    value={newRemark}
                    onChange={(e) => handleNewRemarkChange(e.target.value)}
                    className="block w-full px-3.5 py-2.5 border border-slate-200 focus:border-sage-500 rounded-xl text-sm outline-none transition-all focus:ring-1 focus:ring-sage-500 bg-white"
                  >
                    <option value="passed">Passed</option>
                    <option value="failed">Failed</option>
                    <option value="incomplete">Incomplete (INC)</option>
                    <option value="fda">FDA</option>
                    <option value="dropped">Dropped</option>
                  </select>
                </div>
                {selectedGrade.remarksNote && (
                  <p className="text-[11px] text-slate-500">
                    Current remark note: “{selectedGrade.remarksNote}”. It is kept in the activity log and replaced by your reason below.
                  </p>
                )}

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Override Justification Reason</label>
                  <textarea
                    required
                    rows="3"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    className="block w-full p-3 border border-slate-200 focus:border-sage-500 rounded-xl text-xs outline-none transition-all focus:ring-1 focus:ring-sage-500"
                    placeholder="Provide details for record auditing..."
                  />
                </div>
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setIsOverrideOpen(false)}
                  className="flex-1 sm:flex-none px-4 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs sm:text-sm font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs sm:text-sm font-medium transition-colors flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                >
                  <Check className="h-4 w-4" /> Confirm Override
                </button>
              </div>
            </form>

          </div>
        </div>
      )}
    </>
  );
}
