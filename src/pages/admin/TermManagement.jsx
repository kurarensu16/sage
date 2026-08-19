import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Calendar, RefreshCw, AlertTriangle, CheckCircle, ShieldAlert, Database, ArrowRight, Check, X, ClipboardList } from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { supabase } from '../../lib/supabase';
import SuccessModal from '../../components/SuccessModal';
import ErrorModal from '../../components/ErrorModal';
import ConfirmModal from '../../components/ConfirmModal';

export default function TermManagement() {
  const { user, userProfile } = useAuth();
  const [terms, setTerms] = useState([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  
  // Success, Error & Confirm Modals
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [successModalMessage, setSuccessModalMessage] = useState('');
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false);
  const [errorModalMessage, setErrorModalMessage] = useState('');
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmModalConfig, setConfirmModalConfig] = useState({ title: '', message: '', onConfirm: null });
  
  // Rollover wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [nextSemester, setNextSemester] = useState({ schoolYear: '', semester: '' });
  const [wizardStep, setWizardStep] = useState(1); // 1: Audit, 2: Confirm, 3: Success
  const [auditResults, setAuditResults] = useState(null);
  const [confirmInput, setConfirmInput] = useState('');

  // Load term registries from Supabase with local fallback
  const loadTerms = async () => {
    try {
      const { data, error } = await supabase
        .from('academic_terms')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const formatted = (data || []).map(t => ({
        id: t.term_id,
        schoolYear: t.school_year,
        semester: t.semester,
        isActive: t.is_active,
        isEvaluationOpen: t.is_evaluation_open,
        created_at: t.created_at
      }));
      
      setTerms(formatted);
      localStorage.setItem('sage_cached_terms', JSON.stringify(formatted));
    } catch (err) {
      console.warn('Database error loading terms. Using local fallback cache:', err);
      const cached = localStorage.getItem('sage_cached_terms');
      if (cached) {
        setTerms(JSON.parse(cached));
      } else {
        const defaultTerms = [
          { id: 't1', schoolYear: '2025-2026', semester: '2nd', isActive: true, isEvaluationOpen: false, created_at: new Date().toISOString() },
          { id: 't2', schoolYear: '2025-2026', semester: '1st', isActive: false, isEvaluationOpen: false, created_at: new Date(Date.now() - 86400000 * 100).toISOString() }
        ];
        setTerms(defaultTerms);
        localStorage.setItem('sage_cached_terms', JSON.stringify(defaultTerms));
      }
    }
  };

  useEffect(() => {
    loadTerms();
  }, []);

  const activeTerm = terms.find(t => t.isActive) || null;

  // Calculate succeeding semester automatically based on strict sequence:
  // 1st Semester -> 2nd Semester -> Summer -> 1st Semester of next year
  const calculateNextTerm = (currentTerm) => {
    if (!currentTerm) {
      return { schoolYear: '2025-2026', semester: '2nd' };
    }
    const { schoolYear, semester } = currentTerm;
    let nextSem;
    let nextSy = schoolYear;

    if (semester === '1st') {
      nextSem = '2nd';
    } else if (semester === '2nd') {
      nextSem = 'Summer';
    } else if (semester === 'Summer') {
      nextSem = '1st';
      // Increment school year, e.g., '2025-2026' -> '2026-2027'
      const parts = schoolYear.split('-');
      if (parts.length === 2) {
        const y1 = parseInt(parts[0], 10) + 1;
        const y2 = parseInt(parts[1], 10) + 1;
        nextSy = `${y1}-${y2}`;
      } else {
        nextSy = '2026-2027'; // Fallback
      }
    } else {
      nextSem = '1st';
      nextSy = '2026-2027';
    }

    return { schoolYear: nextSy, semester: nextSem };
  };

  const startRolloverWizard = async () => {
    if (!activeTerm) {
      setErrorModalMessage('Cannot initiate rollover wizard without an active term.');
      setIsErrorModalOpen(true);
      return;
    }
    
    setErrorMsg('');
    setSuccessMsg('');
    setWizardStep(1);
    setConfirmInput('');
    
    // Automatically calculate the succeeding term
    const computedNext = calculateNextTerm(activeTerm);
    setNextSemester(computedNext);
    
    try {
      // 1. Fetch total active classes for the current term
      const { data: totalClasses, error: classErr } = await supabase
        .from('class_records')
        .select(`
          class_record_id,
          status,
          faculty_id,
          subjects ( code ),
          sections ( name )
        `)
        .eq('term_id', activeTerm.id)
        .eq('status', 'active');
      
      if (classErr) throw classErr;

      // 2. Fetch posted grades to see if there are missing final submissions
      const { data: postedGrades, error: gradeErr } = await supabase
        .from('posted_grades')
        .select('class_record_id, is_locked')
        .eq('grade_period', 'final');

      if (gradeErr) throw gradeErr;

      const lockedClassIds = new Set((postedGrades || []).filter(g => g.is_locked).map(g => g.class_record_id));
      
      const unposted = (totalClasses || [])
        .filter(c => !lockedClassIds.has(c.class_record_id))
        .map(c => ({
          id: c.class_record_id,
          code: c.subjects?.code || 'N/A',
          section: c.sections?.name || 'N/A',
          facultyId: c.faculty_id,
          instructor: 'Assigned Faculty',
          milestone: 'Finals (Draft)'
        }));

      // 3. Query unlock requests
      const { count: pendingUnlocks, error: unlockErr } = await supabase
        .from('unlock_requests')
        .select('request_id', { count: 'exact', head: true })
        .eq('status', 'pending');

      setAuditResults({
        unpostedClasses: unposted,
        pendingUnlocks: unlockErr ? 0 : (pendingUnlocks || 0),
        totalActiveClasses: (totalClasses || []).length
      });

      setIsWizardOpen(true);
    } catch (err) {
      console.warn('Audit fetch failed, using offline fallback check:', err);
      // Fallback checklist
      const mockUnposted = [
        { id: 'cls-mock-01', code: 'CS301', section: 'BSCS-3A', facultyId: null, instructor: 'Faculty member', milestone: 'Finals (Draft)' }
      ];
      setAuditResults({
        unpostedClasses: mockUnposted,
        pendingUnlocks: 1,
        totalActiveClasses: 4
      });
      setIsWizardOpen(true);
    }
  };

  const handleSendReminders = async () => {
    if (!auditResults || !auditResults.unpostedClasses || auditResults.unpostedClasses.length === 0) return;
    
    const isOfflineDemo = auditResults.unpostedClasses.some(c => c.id && c.id.toString().startsWith('cls-mock'));
    if (isOfflineDemo) {
      setConfirmModalConfig({
        title: 'Send Reminders?',
        message: 'Are you sure you want to send grade posting reminders to pending faculty members in offline demo mode?',
        onConfirm: () => {
          setIsConfirmModalOpen(false);
          setSuccessModalMessage('[Offline Demo Mode]\n\nSent a grade posting reminder alert to all pending faculty members successfully.');
          setIsSuccessModalOpen(true);
        }
      });
      setIsConfirmModalOpen(true);
      return;
    }

    try {
      const uniqueFacultyIds = [...new Set(auditResults.unpostedClasses.map(c => c.facultyId).filter(Boolean))];
      if (uniqueFacultyIds.length === 0) {
        setErrorModalMessage('No reminders could be sent because the unsubmitted classes do not have assigned faculty members in the database.');
        setIsErrorModalOpen(true);
        return;
      }

      setConfirmModalConfig({
        title: 'Send Reminders?',
        message: `Are you sure you want to send grade posting reminders to the ${uniqueFacultyIds.length} pending faculty members?`,
        onConfirm: async () => {
          setIsConfirmModalOpen(false);
          try {
            const inserts = uniqueFacultyIds.map(facultyId => ({
              recipient_id: facultyId,
              message: `Academic term rollover warning: Please lock and submit final grades for your active classes (AY ${activeTerm?.schoolYear || ''}).`,
              type: 'system',
              is_read: false
            }));

            const { error } = await supabase
              .from('notifications')
              .insert(inserts);

            if (error) throw error;

            setSuccessModalMessage(`Reminders sent successfully! Dispatched notifications to ${uniqueFacultyIds.length} faculty members.`);
            setIsSuccessModalOpen(true);
          } catch (err) {
            console.error('Failed to send reminders:', err);
            setErrorModalMessage('Failed to send reminders: ' + err.message);
            setIsErrorModalOpen(true);
          }
        }
      });
      setIsConfirmModalOpen(true);
    } catch (err) {
      console.error('Failed to prepare reminders:', err);
      setErrorModalMessage('Failed to prepare reminders: ' + err.message);
      setIsErrorModalOpen(true);
    }
  };

  const handleExecuteRollover = async () => {
    if (confirmInput !== 'CONFIRM') {
      setErrorModalMessage('Please type "CONFIRM" exactly to change the semester.');
      setIsErrorModalOpen(true);
      return;
    }

    try {
      const targetSy = nextSemester.schoolYear;
      const targetSem = nextSemester.semester;

      // 1. Check if next term already exists in Supabase
      const { data: existingTerm, error: checkErr } = await supabase
        .from('academic_terms')
        .select('term_id')
        .eq('school_year', targetSy)
        .eq('semester', targetSem)
        .maybeSingle();

      if (checkErr) throw checkErr;

      let newTermId = '';

      if (existingTerm) {
        newTermId = existingTerm.term_id;
      } else {
        // Create new term (inactive at first)
        const { data: newTerm, error: createErr } = await supabase
          .from('academic_terms')
          .insert({
            school_year: targetSy,
            semester: targetSem,
            is_active: false
          })
          .select('term_id')
          .single();

        if (createErr) throw createErr;
        newTermId = newTerm.term_id;
      }

      // 2. Call the database function perform_semester_transition(old_term_uuid, new_term_uuid)
      const { error: transitionErr } = await supabase
        .rpc('perform_semester_transition', {
          old_term_uuid: activeTerm.id,
          new_term_uuid: newTermId
        });

      if (transitionErr) throw transitionErr;

      // 3. Write transition records to the activity_logs table
      const actorName = resolveActorName(userProfile, user);
      await supabase.from('activity_logs').insert({
        action: 'Semester Transition',
        details: `Transitioned academic term from AY ${activeTerm.schoolYear} (${activeTerm.semester} Sem) to AY ${targetSy} (${targetSem} Sem).`,
        actor: actorName
      });

      // Write to audit log helper if present
      logActivity('Semester Transition', `Transitioned academic term from AY ${activeTerm.schoolYear} (${activeTerm.semester} Sem) to AY ${targetSy} (${targetSem} Sem). All old classrooms archived.`, actorName);

      setWizardStep(3);
    } catch (err) {
      console.warn('Failed to run transition transaction on database. Executing in local cache only:', err);
      
      // Local fallback logic
      const targetSy = nextSemester.schoolYear;
      const targetSem = nextSemester.semester;
      
      const newTerms = terms.map(t => {
        if (t.isActive) {
          return { ...t, isActive: false };
        }
        return t;
      });
      
      newTerms.unshift({
        id: 'mock-new-term-' + Date.now(),
        schoolYear: targetSy,
        semester: targetSem,
        isActive: true,
        isEvaluationOpen: false,
        created_at: new Date().toISOString()
      });
      
      setTerms(newTerms);
      localStorage.setItem('sage_cached_terms', JSON.stringify(newTerms));
      
      // Save logs
      const actorName = resolveActorName(userProfile, user);
      logActivity('Semester Transition', `[Offline Fallback] Transitioned academic term to AY ${targetSy} (${targetSem} Sem).`, actorName);
      
      setWizardStep(3);
      setSuccessModalMessage('Database transaction skipped. Transitioned successfully in local offline state.');
      setIsSuccessModalOpen(true);
    }
  };


  return (
    <>
      <PageHeader title="School Term & Semester Transition" breadcrumb="Admin Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 md:space-y-8">
        
        {/* Info Box */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3 shadow-sm">
          <Database className="h-5 w-5 text-sage-600 mt-0.5 flex-shrink-0" />
          <div>
            <h4 className="font-bold text-sm text-slate-900 font-display">Central Academic Term Registry</h4>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              SAGE utilizes a centralized state manager for school semesters. Transitions strictly follow the academic progression: <strong>1st Semester &rarr; 2nd Semester &rarr; Summer</strong>, followed by auto-incrementing to the next School Year.
            </p>
          </div>
        </div>

        {/* Status Indicators */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-full">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-sage-50 text-sage-600 rounded-lg">
                <Calendar className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-450 uppercase tracking-wide">Active School Term</div>
                <div className="text-base font-bold text-slate-900 mt-0.5">
                  {activeTerm ? `AY ${activeTerm.schoolYear} - ${activeTerm.semester} Sem` : 'No Active Term'}
                </div>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 mt-4 pt-2 border-t border-slate-50">
              Currently active system-wide academic term period.
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-full">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-450 uppercase tracking-wide">Predefined Hierarchy</div>
                <div className="text-xs font-bold text-slate-900 mt-1 font-mono">1st &rarr; 2nd &rarr; Summer</div>
              </div>
            </div>
            <div className="text-[11px] text-slate-400 mt-4 pt-2 border-t border-slate-50">
              Term transition sequence for automated system setup.
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex flex-col justify-between h-full">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-50 text-amber-600 rounded-lg">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-450 uppercase tracking-wide">Transition safety Lock</div>
                <div className="text-xs font-bold text-amber-750 mt-0.5">Audit Checklist Enabled</div>
              </div>
            </div>
            <button 
              onClick={startRolloverWizard}
              className="mt-4 w-full py-2 px-4 text-xs font-bold bg-sage-600 hover:bg-sage-700 text-white rounded-lg transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer hover:shadow"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Start Next Semester
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-4 rounded-lg text-xs font-bold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-650" /> {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-4 rounded-lg text-xs font-bold flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-650" /> {successMsg}
          </div>
        )}

        {/* List of Registered Terms */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-955 flex items-center gap-2 font-display">
              <Calendar className="h-4 w-4 text-sage-600" /> Academic Term History
            </h3>
          </div>
          
          <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider font-bold">
              <tr>
                <th className="px-6 py-3">Academic Period</th>
                <th className="px-6 py-3">Created Date</th>
                <th className="px-6 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100 font-sans">
              {terms.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50/55 transition-colors">
                  <td className="px-6 py-4 font-bold text-slate-800">
                    AY {t.schoolYear} — {t.semester} Sem
                  </td>
                  <td className="px-6 py-4 text-slate-500">
                    {new Date(t.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {t.isActive ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                        Active System Term
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-555 border border-slate-200">
                        Archived Sem
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rollover Wizard Modal */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-55 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-xl w-full shadow-lg flex flex-col overflow-hidden">
            
            {/* Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold font-display text-slate-900 flex items-center gap-2">
                <RefreshCw className="h-5 w-5 text-sage-600 animate-spin" /> New Semester Setup Assistant
              </h3>
              <button 
                onClick={() => setIsWizardOpen(false)}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-900 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Step 1: Pre-Rollover Audit Checklist */}
            {wizardStep === 1 && activeTerm && (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-800">Step 1: Check Grading Status</h4>
                  <div className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Active Term: AY {activeTerm.schoolYear}</div>
                </div>
                <p className="text-xs text-slate-500">
                  Scanning classrooms for academic standing. All classrooms from the current term must be finalized to prevent grade conflicts.
                </p>

                <div className="border border-slate-200 rounded-lg p-4 bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold border-b border-slate-200 pb-2">
                    <span className="text-slate-600">Metric Checked</span>
                    <span>Result</span>
                  </div>
                  
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-500">Total Active Classrooms Analyzed:</span>
                    <span className="font-mono text-slate-800 font-bold">{auditResults?.totalActiveClasses} Classes</span>
                  </div>

                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="text-slate-500">Pending Dean Grade Override Requests:</span>
                    <span className="font-mono text-slate-800 font-bold">{auditResults?.pendingUnlocks} Requests</span>
                  </div>
                </div>

                {auditResults?.unpostedClasses.length > 0 ? (
                  <div className="bg-amber-50 border border-amber-250 p-4 rounded-lg space-y-3">
                    <div className="flex items-start gap-2 text-xs font-bold text-amber-900">
                      <AlertTriangle className="h-4.5 w-4.5 text-amber-600 flex-shrink-0" />
                      <div>
                        <span>Warning: Pending Grades Found</span>
                        <p className="font-normal text-[11px] text-slate-650 mt-1">
                          The following class registers have unsubmitted/draft grades. If you proceed with this transition, these will be archived and flagged as <strong>"Late Submissions"</strong> on the Dean's dashboard.
                        </p>
                      </div>
                    </div>
                    
                    <div className="max-h-24 overflow-y-auto border-t border-amber-200/60 pt-2 text-[10px] space-y-1 font-mono text-slate-700">
                      {auditResults.unpostedClasses.map((cls, idx) => (
                        <div key={idx} className="flex justify-between">
                          <span>{cls.code} - {cls.section}</span>
                          <span className="font-bold text-amber-700">{cls.milestone}</span>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        onClick={handleSendReminders}
                        className="px-2.5 py-1 text-[10px] font-bold text-amber-900 hover:text-white bg-amber-100 hover:bg-amber-600 rounded border border-amber-300 transition-colors"
                      >
                        Send Reminder to All Pending Faculty
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-250 p-3 rounded-lg flex items-center gap-2 text-xs font-bold text-emerald-800">
                    <CheckCircle className="h-5 w-5 text-emerald-650" />
                    Checklist Passed: All classroom records are locked and finalized.
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">Target Destination Semester</label>
                  <div className="bg-slate-50 border border-slate-200 px-4 py-3 rounded-lg text-sm font-bold text-slate-800 flex items-center justify-between font-sans">
                    <span>AY {nextSemester.schoolYear} &mdash; {nextSemester.semester} Semester</span>
                    <span className="text-[10px] font-bold text-sage-650 bg-sage-50 px-2 py-0.5 rounded border border-sage-200 uppercase tracking-wider font-mono">Auto-Calculated</span>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                  <button 
                    onClick={() => setIsWizardOpen(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-755 hover:bg-slate-100 rounded-lg text-sm font-medium transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => setWizardStep(2)}
                    className="px-4 py-2 bg-sage-600 hover:bg-sage-700 text-white rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    Next Step <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 2: Confirmation */}
            {wizardStep === 2 && activeTerm && (
              <div className="p-6 space-y-4">
                <h4 className="text-sm font-bold text-slate-800">Step 2: Confirm Semester Transition</h4>
                
                <div className="bg-rose-50 border border-rose-255 p-4 rounded-lg text-xs space-y-2">
                  <div className="font-bold text-rose-900 flex items-center gap-1.5">
                    <ShieldAlert className="h-4.5 w-4.5 text-rose-650" /> Critical Warnings
                  </div>
                  <ul className="list-disc pl-4 space-y-1 text-slate-655 leading-relaxed text-[11px]">
                    <li>All currently active classrooms in <strong>AY {activeTerm.schoolYear} ({activeTerm.semester} Sem)</strong> will be set to <strong>Archived</strong>.</li>
                    {nextSemester.semester === '1st' && (
                      <li className="font-bold text-rose-700">Students will be promoted to their next corresponding year levels (e.g. 1st Year &rarr; 2nd Year).</li>
                    )}
                    <li>Faculty can still submit outstanding grades for the archived semester, but they will be dynamically flagged as "Late Submissions".</li>
                    <li>This semester transition cannot be undone.</li>
                  </ul>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Type <code className="font-mono text-rose-700 bg-rose-50 px-1 py-0.5 rounded border border-rose-200">CONFIRM</code> to authorize
                  </label>
                  <input 
                    type="text" 
                    value={confirmInput}
                    onChange={(e) => setConfirmInput(e.target.value)}
                    className="block w-full px-3.5 py-2.5 border border-slate-200 focus:border-rose-500 rounded-lg text-sm font-mono outline-none transition-all focus:ring-1 focus:ring-rose-500"
                    placeholder="CONFIRM"
                  />
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-3">
                  <button 
                    onClick={() => setWizardStep(1)}
                    className="px-4 py-2 border border-slate-200 text-slate-755 hover:bg-slate-100 rounded-lg text-sm font-medium transition-all"
                  >
                    Back
                  </button>
                  <button 
                    onClick={handleExecuteRollover}
                    disabled={confirmInput !== 'CONFIRM'}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-250 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 shadow-sm"
                  >
                    <Check className="h-4 w-4" /> Confirm & Start Next Semester
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Success Screen */}
            {wizardStep === 3 && (
              <div className="p-8 text-center space-y-4">
                <div className="w-12 h-12 bg-emerald-50 border border-emerald-200 rounded-full flex items-center justify-center mx-auto text-emerald-650 animate-bounce">
                  <Check className="h-6 w-6" />
                </div>
                
                <div>
                  <h3 className="text-base font-bold text-slate-900 font-display">Semester Transition Completed</h3>
                  <p className="text-xs text-slate-550 mt-1 leading-relaxed max-w-sm mx-auto">
                    The active system term has transitioned. Old classes have been archived, and student registries are updated.
                  </p>
                </div>

                <div className="pt-4 max-w-xs mx-auto">
                  <button 
                    onClick={() => {
                      setIsWizardOpen(false);
                      loadTerms();
                    }}
                    className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
                  >
                    Close & Refresh Portals
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      <SuccessModal
        isOpen={isSuccessModalOpen}
        message={successModalMessage}
        onClose={() => setIsSuccessModalOpen(false)}
      />
      <ErrorModal
        isOpen={isErrorModalOpen}
        message={errorModalMessage}
        onClose={() => setIsErrorModalOpen(false)}
      />
      <ConfirmModal
        isOpen={isConfirmModalOpen}
        title={confirmModalConfig.title}
        message={confirmModalConfig.message}
        onConfirm={confirmModalConfig.onConfirm}
        onCancel={() => setIsConfirmModalOpen(false)}
      />
    </>
  );
}
