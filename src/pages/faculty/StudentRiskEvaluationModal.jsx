import { useState, useMemo } from 'react';
import { 
  X, 
  AlertCircle, 
  Trophy, 
  Plus, 
  Trash2, 
  Send, 
  TrendingDown,
  TrendingUp
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { calculateAcademicRisk } from '../../lib/riskEngine';
import { dispatchNotifications } from '../../lib/notificationDispatcher';
import { cn } from '../../lib/utils';

export default function StudentRiskEvaluationModal({
  isOpen,
  onClose,
  student,
  classRecordId,
  currentTerm = 'Prelim',
  subjectCode = '',
  subjectName = '',
  onSaveSuccess,
  onEvaluationSaved
}) {
  const { user } = useAuth();

  const [context, setContext] = useState(
    (student?.current_gwa && student.current_gwa > 2.50) || (student?.failing_count && student.failing_count > 0)
      ? 'passing_recovery'
      : 'pl_retention'
  );

  const [professorNotes, setProfessorNotes] = useState('');
  const [tasks, setTasks] = useState(() => [
    {
      task_id: 'task-init-1',
      description: '',
      target_term: currentTerm,
      due_date: '',
      completed: false,
      completed_at: null
    }
  ]);
  const [referToDean, setReferToDean] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Compute live explainable risk metrics
  const riskAnalysis = useMemo(() => {
    if (!student) return null;
    return calculateAcademicRisk({
      currentGwa: student.current_gwa || null,
      failingSubjectsCount: student.failing_count || 0,
      majorExamAverage: student.exam_average !== undefined ? student.exam_average : 75,
      absenceCount: student.absences || 0,
      previousTermRating: student.term_ratings?.Prelim || null,
      currentTermRating: student.term_ratings?.Midterm || null
    });
  }, [student]);

  if (!isOpen || !student) return null;

  const handleAddTask = () => {
    if (tasks.length >= 5) return;
    setTasks(prev => [
      ...prev,
      {
        task_id: `task-${Date.now()}-${prev.length + 1}`,
        description: '',
        target_term: currentTerm,
        due_date: '',
        completed: false,
        completed_at: null
      }
    ]);
  };

  const handleRemoveTask = (taskId) => {
    if (tasks.length <= 1) return;
    setTasks(prev => prev.filter(t => t.task_id !== taskId));
  };

  const handleTaskChange = (taskId, field, value) => {
    setTasks(prev => prev.map(t => (t.task_id === taskId ? { ...t, [field]: value } : t)));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!professorNotes.trim()) {
      setError('Please document qualitative observations for this student.');
      return;
    }

    const validTasks = tasks.filter(t => t.description.trim().length > 0);
    if (validTasks.length === 0) {
      setError('Please provide at least 1 actionable catch-up task.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
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

      const payload = {
        class_record_id: classRecordId,
        student_id: student.user_id || student.id,
        faculty_id: user?.id,
        term: currentTerm,
        evaluation_context: context,
        risk_level: riskAnalysis?.risk_level || 'moderate',
        risk_score: riskAnalysis?.composite_score || 0,
        risk_breakdown: riskAnalysis || {},
        professor_notes: professorNotes.trim(),
        advising_plan: validTasks,
        baseline_snapshot: baselineSnapshot,
        refer_to_dean: referToDean,
        status: 'submitted',
        updated_at: new Date().toISOString()
      };

      const { data, error: dbErr } = await supabase
        .from('student_risk_evaluations')
        .upsert(payload, { onConflict: 'class_record_id,student_id,term' })
        .select()
        .single();

      if (dbErr) throw dbErr;

      // Dispatch real-time student notification
      try {
        await dispatchNotifications([
          {
            recipient_id: student.user_id || student.id,
            type: 'academic_advising',
            message: `Official Academic Advising Notice: An academic intervention plan for ${subjectCode || 'your enrolled subject'} was submitted by your professor. Review your Advising Inbox.`
          },
          referToDean ? {
            recipient_id: user?.id,
            type: 'dean_referral',
            message: `Faculty Referral Logged: Flagged case for student ${student.first_name} ${student.last_name} submitted for Dean review.`
          } : null
        ].filter(Boolean));
      } catch (notifErr) {
        console.warn('Could not dispatch notification:', notifErr);
      }

      if (onEvaluationSaved) {
        onEvaluationSaved(data || payload);
      } else if (onSaveSuccess) {
        onSaveSuccess(data || payload);
      }
      onClose();
    } catch (err) {
      console.error('Failed to submit risk evaluation:', err);
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
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs font-sans">
          
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-md flex items-center gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* Context Switcher */}
          <div className="space-y-1.5">
            <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
              Evaluation Context <span className="text-rose-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 border border-slate-200 rounded-lg">
              <button
                type="button"
                onClick={() => setContext('passing_recovery')}
                className={cn(
                  "py-2 px-3 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  context === 'passing_recovery'
                    ? "bg-white text-rose-700 shadow-xs border border-rose-200 font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                Passing Recovery
              </button>
              <button
                type="button"
                onClick={() => setContext('pl_retention')}
                className={cn(
                  "py-2 px-3 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  context === 'pl_retention'
                    ? "bg-white text-amber-700 shadow-xs border border-amber-200 font-semibold"
                    : "text-slate-600 hover:text-slate-900"
                )}
              >
                <Trophy className="w-3.5 h-3.5 text-amber-500" />
                Honors (PL) Retention
              </button>
            </div>
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

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2 bg-white border border-slate-200 rounded-md">
                  <div className="text-[10px] text-slate-400 font-medium uppercase">Current GWA</div>
                  <div className="font-mono text-sm font-semibold text-slate-800">
                    {student.current_gwa ? student.current_gwa.toFixed(2) : '—'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">+{riskAnalysis.factors.gwa.points_contributed} pts</div>
                </div>

                <div className="p-2 bg-white border border-slate-200 rounded-md">
                  <div className="text-[10px] text-slate-400 font-medium uppercase">Assessment</div>
                  <div className="font-mono text-sm font-semibold text-slate-800">
                    {student.failing_count || 0} Fail
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">+{riskAnalysis.factors.assessment.points_contributed} pts</div>
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

          {/* Qualitative Notes */}
          <div className="space-y-1">
            <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
              Professor Qualitative Observations <span className="text-rose-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={professorNotes}
              onChange={(e) => setProfessorNotes(e.target.value)}
              placeholder="Document specific conceptual gaps, lab execution struggles, or behavioral observations..."
              className="w-full px-3 py-2 text-xs font-sans text-slate-900 bg-white border border-slate-300 rounded-md shadow-xs placeholder:text-slate-400 focus:outline-none focus:border-sage-600 focus:ring-1 focus:ring-sage-600 transition-colors resize-none"
            />
            <p className="text-[10px] text-slate-400">
              Your observation context will be delivered directly to the student's Advising Inbox and will enrich their AI study coach.
            </p>
          </div>

          {/* Actionable Tasks Checklist Builder */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-semibold text-slate-700 uppercase tracking-wider text-[11px]">
                Intervention Catch-Up Tasks <span className="text-rose-500">*</span>
              </label>
              <button
                type="button"
                onClick={handleAddTask}
                disabled={tasks.length >= 5}
                className="text-[11px] text-sage-600 hover:text-sage-700 font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Task
              </button>
            </div>

            <div className="space-y-2">
              {tasks.map((task, idx) => (
                <div key={task.task_id} className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-md">
                  <span className="font-mono font-bold text-slate-400 text-xs w-4">{idx + 1}.</span>
                  <input
                    type="text"
                    required
                    value={task.description}
                    onChange={(e) => handleTaskChange(task.task_id, 'description', e.target.value)}
                    placeholder="e.g. Redo pointer reversal supplementary lab exercises"
                    className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:border-sage-600"
                  />
                  <input
                    type="date"
                    value={task.due_date}
                    onChange={(e) => handleTaskChange(task.task_id, 'due_date', e.target.value)}
                    className="px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono text-slate-700 focus:outline-none focus:border-sage-600"
                  />
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
          </div>

          {/* Administrative Collaboration Checkbox */}
          <div className="pt-2 border-t border-slate-100">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={referToDean}
                onChange={(e) => setReferToDean(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-sage-600 focus:ring-sage-500 cursor-pointer"
              />
              <div>
                <span className="font-semibold text-slate-800 text-xs">Flag for Dean Discussion (refer_to_dean)</span>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Escalate this case to the Dean's Collaboration Queue for department-level advising or parental coordination.
                </p>
              </div>
            </label>
          </div>

          {/* Footer Bar */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !professorNotes.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-sage-600 hover:bg-sage-700 active:bg-sage-800 disabled:bg-slate-300 disabled:cursor-not-allowed rounded-md shadow-xs transition-colors cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              {saving ? 'Submitting...' : 'Submit Official Evaluation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
