import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  X, 
  AlertCircle, 
  Plus, 
  Trash2, 
  Send, 
  Loader2,
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { getEvaluationDetails } from '../../lib/evaluationService';
import { EVALUATION_TERMS } from '../../lib/evaluationTracking';
import { dispatchNotifications } from '../../lib/notificationDispatcher';
import { cn } from '../../lib/utils';
import {
  generateAdditionalInterventionTask,
  saveFacultyInterventionWorkingDraft
} from '../../lib/interventionDraftService';

const latestTaskDeadline = tasks => (tasks || []).map(task => task?.due_date).filter(Boolean).sort().at(-1) || '';

const toLocalDateValue = date => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const earliestFutureDate = () => {
  const tomorrow = new Date();
  tomorrow.setHours(0, 0, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return toLocalDateValue(tomorrow);
};

export default function StudentRiskEvaluationModal({
  isOpen,
  onClose,
  student,
  initialDraft = null,
  classRecordId,
  currentTerm,
  subjectCode = '',
  subjectName = '',
  onSaveSuccess,
  onEvaluationSaved
}) {
  const { user } = useAuth();
  const studentId = student?.user_id || student?.id;
  const restoredWorkingDraft = initialDraft?.working_draft === true ? initialDraft : null;
  const restoredTasks = Array.isArray(initialDraft?.tasks)
    && initialDraft.tasks.length >= 1
    && initialDraft.tasks.length <= 5
    ? initialDraft.tasks
    : null;

  const [context, setContext] = useState(restoredWorkingDraft?.evaluation_context || 'academic_intervention');

  const [privateNote, setPrivateNote] = useState(restoredWorkingDraft?.private_note || '');
  const [sharedAcademicFeedback, setSharedAcademicFeedback] = useState(restoredWorkingDraft?.shared_academic_feedback || '');
  const [tasks, setTasks] = useState(() => restoredTasks
    ? restoredTasks
    : [{
      task_id: 'task-init-1',
      description: '',
      target_term: currentTerm,
      due_date: '',
      completed: false,
      completed_at: null,
      source: 'manual'
    }]);
  const [planDeadline, setPlanDeadline] = useState(() => restoredWorkingDraft?.plan_deadline || latestTaskDeadline(initialDraft?.tasks));
  const [referToDean, setReferToDean] = useState(Boolean(restoredWorkingDraft?.refer_to_dean));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(Boolean(student?.evaluation));
  const referralRequest = useRef(crypto.randomUUID());
  const [referralReason, setReferralReason] = useState(restoredWorkingDraft?.referral_reason || '');
  const [existingPending, setExistingPending] = useState(Boolean(student?.evaluation?.refer_to_dean));
  const [addingAiTask, setAddingAiTask] = useState(false);
  const [draftSaveState, setDraftSaveState] = useState('idle');
  const [draftUpdatedAt, setDraftUpdatedAt] = useState(restoredWorkingDraft?.updated_at || null);
  const [draftHydrated, setDraftHydrated] = useState(!student?.evaluation?.evaluation_id);
  const submittedRef = useRef(false);
  const draftHydratedRef = useRef(draftHydrated);
  const latestDraftPayloadRef = useRef(null);
  const latestDraftFingerprintRef = useRef('');
  const lastSavedDraftFingerprintRef = useRef('');
  const skipInitialDraftPersistenceRef = useRef(Boolean(student?.evaluation?.evaluation_id || restoredWorkingDraft));
  const draftSaveQueueRef = useRef(Promise.resolve());
  const minimumPlanDeadline = earliestFutureDate();

  // Compute live explainable risk metrics
  const riskAnalysis = student?.risk_analysis;
  useEffect(() => {
    let cancelled = false;
    if (!student?.evaluation?.evaluation_id) return;
    getEvaluationDetails(student.evaluation.evaluation_id).then(existing => {
      if (cancelled) return;
      setContext(restoredWorkingDraft?.evaluation_context || existing.evaluation_context);
      setSharedAcademicFeedback(restoredWorkingDraft?.shared_academic_feedback ?? existing.shared_academic_feedback ?? '');
      const existingTasks = Array.isArray(existing.advising_plan) ? existing.advising_plan : [];
      setTasks(restoredTasks || existingTasks);
      setPlanDeadline(restoredWorkingDraft?.plan_deadline || latestTaskDeadline(existingTasks));
      setPrivateNote(restoredWorkingDraft?.private_note ?? existing.private_notes?.find(note => note.author_id === user?.id)?.note_text ?? '');
      setReferToDean(Boolean(existing.refer_to_dean) || Boolean(restoredWorkingDraft?.refer_to_dean));
      setReferralReason(restoredWorkingDraft?.referral_reason
        || existing.referrals?.find(referral => referral.state === 'pending')?.reason
        || '');
      setExistingPending(Boolean(existing.refer_to_dean));
      setLoadingExisting(false);
      setDraftHydrated(true);
    }).catch(err => { if (!cancelled) setError(`Unable to load the existing evaluation: ${err.message}. Close and retry.`); });
    return () => { cancelled = true; };
  }, [student?.evaluation?.evaluation_id, user?.id, restoredWorkingDraft, restoredTasks]);

  const draftPayload = useMemo(() => ({
    classRecordId,
    studentId,
    term: currentTerm,
    evaluationContext: context,
    sharedAcademicFeedback,
    privateNote,
    tasks,
    planDeadline,
    referToDean,
    referralReason
  }), [
    classRecordId,
    studentId,
    currentTerm,
    context,
    sharedAcademicFeedback,
    privateNote,
    tasks,
    planDeadline,
    referToDean,
    referralReason
  ]);

  const queueDraftSave = useCallback((payload) => {
    const queued = draftSaveQueueRef.current
      .catch(() => undefined)
      .then(() => saveFacultyInterventionWorkingDraft(payload));
    draftSaveQueueRef.current = queued;
    return queued;
  }, []);

  useEffect(() => {
    draftHydratedRef.current = draftHydrated;
    latestDraftPayloadRef.current = draftPayload;
    latestDraftFingerprintRef.current = JSON.stringify(draftPayload);
  }, [draftHydrated, draftPayload]);

  useEffect(() => {
    if (!draftHydrated || submittedRef.current || !isOpen || !classRecordId || !studentId
      || !EVALUATION_TERMS.includes(currentTerm) || tasks.length < 1 || tasks.length > 5) return undefined;

    const fingerprint = JSON.stringify(draftPayload);
    if (skipInitialDraftPersistenceRef.current) {
      skipInitialDraftPersistenceRef.current = false;
      lastSavedDraftFingerprintRef.current = fingerprint;
      return undefined;
    }
    if (fingerprint === lastSavedDraftFingerprintRef.current) return undefined;

    setDraftSaveState('pending');
    const timer = window.setTimeout(async () => {
      setDraftSaveState('saving');
      try {
        const saved = await queueDraftSave(draftPayload);
        if (!submittedRef.current) {
          lastSavedDraftFingerprintRef.current = fingerprint;
          setDraftUpdatedAt(saved?.updated_at || new Date().toISOString());
          setDraftSaveState('saved');
        }
      } catch (saveError) {
        console.error('Unable to autosave the intervention working draft:', saveError);
        if (!submittedRef.current) setDraftSaveState('error');
      }
    }, 700);
    return () => window.clearTimeout(timer);
  }, [draftHydrated, draftPayload, isOpen, classRecordId, studentId, currentTerm, tasks.length, queueDraftSave]);

  useEffect(() => () => {
    if (!submittedRef.current
      && draftHydratedRef.current
      && latestDraftPayloadRef.current
      && latestDraftFingerprintRef.current !== lastSavedDraftFingerprintRef.current) {
      void queueDraftSave(latestDraftPayloadRef.current).catch(saveError => {
        console.error('Unable to persist the intervention draft while leaving the page:', saveError);
      });
    }
  }, [queueDraftSave]);

  const handleClose = async () => {
    if (saving || addingAiTask) return;
    if (!draftHydrated || !latestDraftPayloadRef.current) {
      onClose();
      return;
    }
    if (latestDraftFingerprintRef.current === lastSavedDraftFingerprintRef.current) {
      onClose();
      return;
    }
    setDraftSaveState('saving');
    try {
      const saved = await queueDraftSave(latestDraftPayloadRef.current);
      lastSavedDraftFingerprintRef.current = latestDraftFingerprintRef.current;
      setDraftUpdatedAt(saved?.updated_at || new Date().toISOString());
      setDraftSaveState('saved');
      onClose();
    } catch (saveError) {
      console.error('Unable to save the intervention draft before closing:', saveError);
      setDraftSaveState('error');
      setError('The working draft could not be saved. Keep this window open and retry before leaving.');
    }
  };

  if (!isOpen || !student) return null;

  const handleAddManualTask = () => {
    if (tasks.length >= 5) return;
    setTasks(prev => [
      ...prev,
      {
        task_id: `task-${Date.now()}-${prev.length + 1}`,
        description: '',
        target_term: currentTerm,
        due_date: planDeadline || '',
        completed: false,
        completed_at: null,
        source: 'manual'
      }
    ]);
  };

  const handleAddAiTask = async () => {
    if (tasks.length >= 5 || addingAiTask || loadingExisting) return;
    setAddingAiTask(true);
    setError(null);
    try {
      const draft = await generateAdditionalInterventionTask({
        classRecordId,
        studentId: student.user_id || student.id,
        term: currentTerm,
        requestId: crypto.randomUUID(),
        existingTasks: tasks.map(task => ({
          description: task.description,
          deliverable: task.deliverable,
          action_type: task.action_type,
          priority: task.priority,
          basis_codes: task.basis_codes,
          source: task.source,
          faculty_edited: task.faculty_edited
        }))
      });
      setTasks(previous => previous.length >= 5 ? previous : [...previous, draft.tasks[0]]);
    } catch (err) {
      console.error('Unable to generate an additional intervention task:', err);
      setError(err.message || 'The additional AI task could not be generated. You can retry or add one manually.');
    } finally {
      setAddingAiTask(false);
    }
  };

  const handleRemoveTask = (taskId) => {
    if (tasks.length <= 1) return;
    setTasks(prev => prev.filter(t => t.task_id !== taskId));
  };

  const handleTaskChange = (taskId, field, value) => {
    setTasks(prev => prev.map(t => (t.task_id === taskId
      ? { ...t, [field]: value, ...(t.source === 'ai_assisted' ? { faculty_edited: true } : {}) }
      : t)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!EVALUATION_TERMS.includes(currentTerm) || loadingExisting) {
      setError('Select a grading term and wait for the existing evaluation to load.');
      return;
    }
    if (referToDean && !referralReason.trim()) {
      setError('Enter a reason for Dean review.');
      return;
    }
    if (!privateNote.trim()) {
      setError('Please document the restricted faculty observation for this evaluation.');
      return;
    }
    if (!sharedAcademicFeedback.trim()) {
      setError('Please provide student-visible academic guidance.');
      return;
    }
    if (!planDeadline) {
      setError('Choose one completion date for the intervention plan.');
      return;
    }
    if (planDeadline < minimumPlanDeadline) {
      setError('Choose a future completion date. Today and earlier dates are not allowed.');
      return;
    }

    const validTasks = tasks.filter(t => typeof t.description === 'string' && t.description.trim().length > 0);
    if (validTasks.length === 0) {
      setError('Add at least one actionable intervention task before submitting this evaluation.');
      return;
    }
    if (validTasks.length > 5 || validTasks.some(task => task.description.trim().length > 500)) {
      setError('Use between 1 and 5 tasks, with each description limited to 500 characters.');
      return;
    }

    setShowConfirm(true);
  };

  const processSubmit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    submittedRef.current = true;

    const validTasks = tasks.filter(t => typeof t.description === 'string' && t.description.trim().length > 0)
      .map(task => ({ ...task, description: task.description.trim(), due_date: planDeadline }));

    try {
      // Flush the latest faculty-authored working state first. The database
      // submission trigger links this exact draft to the official evaluation
      // in the same transaction that publishes the evaluation.
      await queueDraftSave(draftPayload);

      const baselineSnapshot = {
        captured_at: new Date().toISOString(),
        term: currentTerm,
        gwa: student.current_gwa !== undefined ? student.current_gwa : null,
        risk_score: riskAnalysis?.composite_score || 0,
        risk_level: riskAnalysis?.risk_level || 'moderate',
        exam_average: student.exam_average !== undefined ? student.exam_average : null,
        absence_count: student.absences || 0,
        tasks_total: validTasks.length,
        tasks_completed: 0
      };

      const { data, error: dbErr } = await supabase
        .rpc('submit_student_risk_evaluation', {
          p_class_record_id: classRecordId,
          p_student_id: student.user_id || student.id,
          p_term: currentTerm,
          p_evaluation_context: context,
          p_risk_level: riskAnalysis?.risk_level || 'moderate',
          p_risk_score: riskAnalysis?.composite_score || 0,
          p_risk_breakdown: riskAnalysis || {},
          p_shared_academic_feedback: sharedAcademicFeedback.trim(),
          p_private_note: privateNote.trim(),
          p_advising_plan: validTasks,
          p_baseline_snapshot: baselineSnapshot,
          p_refer_to_dean: referToDean,
          p_status: 'submitted',
          p_referral_reason: referToDean ? referralReason.trim() : null,
          p_referral_request_id: referToDean ? referralRequest.current : null
        })
        .single();

      if (dbErr) throw dbErr;

      // Dispatch real-time student notification
      try {
        await dispatchNotifications([
          {
            recipient_id: student.user_id || student.id,
            type: 'academic_advising',
            message: `Official Academic Advising Notice: An academic intervention plan for ${subjectCode || 'your enrolled subject'} was submitted by your professor. Review your Advising Inbox.`,
            dedupe_key: `academic_advising:${data.evaluation_id}:${data.updated_at}`
          }
        ]);
      } catch (notifErr) {
        console.warn('Could not dispatch notification:', notifErr);
      }

      if (onEvaluationSaved) {
        onEvaluationSaved(data);
      } else if (onSaveSuccess) {
        onSaveSuccess(data);
      }
      onClose();
    } catch (err) {
      console.error('Failed to submit risk evaluation:', err);
      submittedRef.current = false;
      setError(err.message || 'Failed to save evaluation. Please check your network and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs text-left animate-in fade-in duration-150">
      <div className="bg-white rounded-lg border border-slate-200 shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
        
        {/* Header */}
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold font-display text-slate-900 flex items-center gap-2">
              <span>Evaluate Student Academic Risk</span>
              <span className="text-xs font-mono font-medium text-slate-500">[{currentTerm}]</span>
            </h3>
            <p className="text-xs text-slate-500 font-sans mt-0.5">
              {student.first_name} {student.last_name} {student.student_id_number ? `(${student.student_id_number})` : ''} • {subjectCode} {subjectName ? `— ${subjectName}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn(
              'text-[10px] font-semibold',
              draftSaveState === 'error' ? 'text-rose-600' : 'text-sage-600'
            )}>
              {draftSaveState === 'saving' || draftSaveState === 'pending'
                ? 'Saving draft…'
                : draftSaveState === 'error'
                  ? 'Draft not saved'
                  : draftUpdatedAt
                    ? 'Draft saved'
                    : 'Faculty-only draft'}
            </span>
            <button
              onClick={handleClose}
              disabled={draftSaveState === 'saving'}
              className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs font-sans">
          
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-md flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          <div className="rounded-lg border border-sage-200 bg-sage-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-sage-700">Academic Intervention</p>
            <p className="mt-1 text-xs text-sage-700">Create one faculty-reviewed support plan based on the student’s grades, attendance, unfinished work, and performance changes.</p>
          </div>

          {/* Pre-Computed System Diagnostic Summary */}
          {riskAnalysis && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Pre-Computed Diagnostic Metrics
                </span>
                <span className={cn(
                  "px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold border",
                  riskAnalysis.risk_level === 'critical' ? "bg-rose-50 text-rose-700 border-rose-200" :
                  riskAnalysis.risk_level === 'high' ? "bg-rose-50 text-rose-700 border-rose-200" :
                  riskAnalysis.risk_level === 'moderate' ? "bg-amber-50 text-amber-700 border-amber-200" :
                  "bg-emerald-50 text-emerald-700 border-emerald-200"
                )}>
                  Risk Score: {riskAnalysis.composite_score}/100 ({riskAnalysis.risk_level.toUpperCase()})
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                <div className="p-2 bg-white border border-slate-200 rounded-md">
                  <div className="text-[10px] text-slate-400 font-medium uppercase">Current GWA</div>
                  <div className="font-mono text-sm font-semibold text-slate-800">
                    {student.current_gwa ? student.current_gwa.toFixed(2) : '—'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">+{riskAnalysis.factors.gwa.points_contributed} pts</div>
                </div>

                <div className="p-2 bg-white border border-slate-200 rounded-md">
                  <div className="text-[10px] text-slate-400 font-medium uppercase">Pending</div>
                  <div className="font-mono text-sm font-semibold text-slate-800">
                    {student.pending_activity_counts?.[currentTerm] ?? student.pending_activity_count ?? 0} Ungraded
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">+0 pts</div>
                </div>

                <div className="p-2 bg-white border border-slate-200 rounded-md">
                  <div className="text-[10px] text-slate-400 font-medium uppercase">Recorded Zeros</div>
                  <div className="font-mono text-sm font-semibold text-slate-800">
                    {riskAnalysis.factors.missing_work?.zero_submissions_count || 0} Scored 0
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">+{riskAnalysis.factors.missing_work?.points_contributed || 0} pts</div>
                </div>

                <div className="p-2 bg-white border border-slate-200 rounded-md">
                  <div className="text-[10px] text-slate-400 font-medium uppercase">Absences</div>
                  <div className="font-mono text-sm font-semibold text-slate-800">
                    {student.absences || 0} / 4
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">+{riskAnalysis.factors.attendance.points_contributed} pts</div>
                </div>

                <div className="p-2 bg-white border border-slate-200 rounded-md">
                  <div className="text-[10px] text-slate-400 font-medium uppercase">Trajectory</div>
                  <div className={cn(
                    "font-mono text-sm font-semibold flex items-center justify-center gap-0.5",
                    riskAnalysis.trajectory_delta < 0 ? "text-rose-600" : "text-emerald-600"
                  )}>
                    {riskAnalysis.trajectory_delta < 0 ? <TrendingDown className="w-3.5 h-3.5" /> : <TrendingUp className="w-3.5 h-3.5" />}
                    {riskAnalysis.trajectory_delta ? `${riskAnalysis.trajectory_delta.toFixed(1)}%` : 'Stable'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">+{riskAnalysis.factors.trajectory.points_contributed} pts</div>
                </div>
              </div>

              {student.weakest_topic && (
                <div className="text-[11px] text-slate-600 pt-1 flex items-center gap-1.5">
                  <span className="font-semibold text-slate-700">Weakest Lesson Scope:</span>
                  <span className="bg-slate-200 text-slate-800 px-1.5 py-0.5 rounded font-mono text-[10px]">
                    {student.weakest_topic}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Restricted faculty note */}
          <div className="space-y-1">
            <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
              Restricted Faculty Observation <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={privateNote}
              onChange={(e) => setPrivateNote(e.target.value)}
              placeholder="Document specific conceptual gaps, lab execution struggles, or behavioral observations..."
              className="w-full px-3 py-2 text-xs font-sans text-slate-900 bg-white border border-slate-300 rounded-md shadow-xs placeholder:text-slate-400 focus:outline-none focus:border-sage-600 focus:ring-1 focus:ring-sage-600 transition-colors resize-none"
            />
            <p className="text-[10px] text-slate-500">
                  Restricted to authorized faculty and the class department Dean. This note is never shown to the student or sent to Ask ASPIRE.
            </p>
          </div>

          {/* Student-visible guidance */}
          <div className="space-y-1">
            <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
              Student-Visible Academic Guidance <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={sharedAcademicFeedback}
              onChange={(e) => setSharedAcademicFeedback(e.target.value)}
              placeholder="Explain the academic concern, supporting evidence, and practical next step in student-appropriate language..."
              className="w-full px-3 py-2 text-xs font-sans text-slate-900 bg-white border border-slate-300 rounded-md shadow-xs placeholder:text-slate-400 focus:outline-none focus:border-sage-600 focus:ring-1 focus:ring-sage-600 transition-colors resize-none"
            />
            <p className="text-[10px] text-slate-500">
              Published to the student's Advising Inbox and may be used as approved context by Ask ASPIRE.
            </p>
          </div>

          {/* Actionable Tasks Checklist Builder */}
          <div className="space-y-2">
            {initialDraft && !initialDraft.working_draft && !student?.evaluation && <div className="rounded-lg border border-sage-200 bg-sage-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-sage-700">AI draft — faculty review required</p>
              <p className="mt-1 text-xs text-sage-700">{initialDraft.summary}</p>
              <p className="mt-2 text-[10px] text-sage-500">Edit, delete, or add tasks as needed. Nothing is published to the student until you confirm submission.</p>
            </div>}
            {initialDraft?.working_draft && <div className="rounded-lg border border-sage-200 bg-sage-50 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-sage-700">Restored faculty-only working draft</p>
              <p className="mt-1 text-xs text-sage-700">Your saved edits, task order, guidance, notes, deadline, and referral choice were restored. Nothing is published until official submission.</p>
            </div>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
                Intervention Catch-Up Tasks <span className="text-rose-500">*</span>
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddManualTask}
                  disabled={tasks.length >= 5 || addingAiTask}
                  className="flex items-center gap-1 rounded-md border border-sage-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-sage-700 hover:bg-sage-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Manually
                </button>
                <button
                  type="button"
                  onClick={handleAddAiTask}
                  disabled={tasks.length >= 5 || addingAiTask || loadingExisting}
                  className="flex items-center gap-1 rounded-md bg-sage-700 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-sage-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {addingAiTask && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {addingAiTask ? 'Suggesting…' : 'Suggest with AI'}
                </button>
              </div>
            </div>
            <p className="text-[10px] text-sage-500">{tasks.length}/5 tasks. AI suggestions consider every current manual, AI-generated, and faculty-edited task.</p>

            <label className="block rounded-lg border border-sage-200 bg-sage-50 p-3 text-xs font-semibold text-sage-800">
              Plan Completion Date <span className="text-rose-500">*</span>
              <span className="ml-2 font-normal text-sage-600">Complete all steps in order by this date.</span>
              <input
                type="date"
                required
                min={minimumPlanDeadline}
                value={planDeadline}
                onChange={(event) => setPlanDeadline(event.target.value)}
                className="mt-2 block w-full rounded-md border border-sage-200 bg-white px-3 py-2 font-mono text-xs text-sage-900 focus:outline-none focus:border-sage-600"
              />
            </label>

            <div className="space-y-2">
              {tasks.map((task, idx) => (
                <div key={task.task_id} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-md">
                  <span className="font-mono font-bold text-slate-400 text-xs w-4">{idx + 1}.</span>
                  <input
                    type="text"
                    required
                    maxLength={500}
                    value={task.description ?? ''}
                    onChange={(e) => handleTaskChange(task.task_id, 'description', e.target.value)}
                    placeholder="e.g. Redo pointer reversal supplementary lab exercises"
                    className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-sage-600"
                  />
                  {task.source === 'ai_assisted' && <span className="rounded bg-sage-100 px-1.5 py-1 text-[9px] font-bold uppercase text-sage-700">AI</span>}
                  {tasks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveTask(task.task_id)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {tasks.some(task => task.source === 'ai_assisted') && <div className="space-y-2">
              {tasks.filter(task => task.source === 'ai_assisted').map(task => <label key={`${task.task_id}-deliverable`} className="block rounded-md border border-sage-100 bg-white p-2 text-[10px] font-semibold uppercase tracking-wider text-sage-600">Expected deliverable
                <input type="text" maxLength={300} required value={task.deliverable || ''} onChange={event => handleTaskChange(task.task_id, 'deliverable', event.target.value)} className="mt-1 block w-full rounded border border-sage-200 bg-white px-2.5 py-1.5 text-xs font-normal normal-case tracking-normal text-sage-900 focus:outline-none focus:border-sage-600" />
              </label>)}
            </div>}
          </div>

          {/* Administrative Collaboration Checkbox */}
          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={referToDean}
                disabled={existingPending}
                onChange={(e) => setReferToDean(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-sage-600 focus:ring-sage-500 cursor-pointer"
              />
              <div>
                <span className="font-semibold text-sage-800 text-xs">{existingPending ? 'Already referred — pending Dean review' : 'Request Dean review'}</span>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Escalate this case to the Dean's Collaboration Queue for department-level advising or parental coordination.
                </p>
              </div>
            </label>
            {referToDean && <label className="block text-sm text-sage-900 mt-3">Reason for Dean review<textarea required maxLength={2000} value={referralReason} onChange={e => setReferralReason(e.target.value)} className="block w-full rounded-lg border border-sage-200 bg-sage-50 p-3 mt-1 text-sage-900" /></label>}
            {loadingExisting && <p role="status" className="text-xs text-sage-700 mt-2">Loading the existing plan before editing…</p>}
          </div>

          {/* Footer Bar */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={handleClose}
              disabled={draftSaveState === 'saving'}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors cursor-pointer"
            >
              Save &amp; Close
            </button>
            <button
              type="submit"
              disabled={saving || loadingExisting || !EVALUATION_TERMS.includes(currentTerm) || !privateNote.trim() || !sharedAcademicFeedback.trim() || !planDeadline || planDeadline < minimumPlanDeadline || (referToDean && !referralReason.trim())}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-sage-600 hover:bg-sage-700 active:bg-sage-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-md shadow-xs transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              {saving ? 'Submitting...' : 'Submit Official Evaluation'}
            </button>
          </div>
        </form>
      </div>
      
      {/* Confirmation Modal Overlay */}
      {showConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs text-left animate-in fade-in duration-150">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-150 border border-slate-200">
            <div className="p-5 flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-1">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="text-base font-bold text-slate-800">Submit Risk Evaluation?</h4>
              <p className="text-xs text-slate-500 font-sans leading-relaxed">
                You are about to officially submit this academic intervention plan for <strong className="text-slate-700">{student.first_name} {student.last_name}</strong>.
                {referToDean && (
                  <span className="block mt-1.5 text-rose-600 font-medium">This will also flag the student for the Dean's review queue.</span>
                )}
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-2 justify-center">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors w-full"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowConfirm(false);
                  processSubmit();
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-sage-600 rounded-lg hover:bg-sage-700 transition-colors w-full"
              >
                Confirm Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
