import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Inbox, 
  CheckSquare, 
  Square, 
  Clock, 
  AlertCircle, 
  Trophy, 
  BrainCircuit, 
  CheckCircle2, 
  ArrowRight,
  Loader2,
  Lock
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { cn } from '../../lib/utils';
import { countTaskProgress, isAcknowledged, isStudentVisibleEvaluation, taskVerification } from '../../lib/evaluationTracking';

export default function FacultyAdvisingInbox() {
  const { user } = useAuth();
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingTaskId, setUpdatingTaskId] = useState(null);
  const [acknowledgingId, setAcknowledgingId] = useState(null);

  const fetchEvaluations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('student_risk_evaluations')
        .select(`
          evaluation_id,
          class_record_id,
          student_id,
          faculty_id,
          term,
          evaluation_context,
          shared_academic_feedback,
          advising_plan,
          baseline_snapshot,
          followup_snapshot,
          status,
          acknowledged_at,
          published_to_student_at,
          created_at,
          updated_at,
          class_records (
            school_year,
            semester,
            subjects ( code, name ),
            sections ( name )
          ),
          users:faculty_id (
            first_name,
            last_name,
            email
          )
        `)
        .eq('student_id', user.id)
        .in('status', ['submitted', 'acknowledged_by_student'])
        .not('published_to_student_at', 'is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEvaluations((data || []).filter(isStudentVisibleEvaluation));
    } catch (err) {
      console.error('Error loading advising evaluations:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchEvaluations();
  }, [fetchEvaluations]);

  const handleAcknowledge = async (evaluationId) => {
    setAcknowledgingId(evaluationId);
    try {
      const { data, error } = await supabase
        .rpc('acknowledge_student_evaluation', { p_evaluation_id: evaluationId })
        .single();
      if (error) throw error;
      setEvaluations(prev => prev.map(e => e.evaluation_id === evaluationId
        ? { ...e, status: data.status, acknowledged_at: data.acknowledged_at } : e));
    } catch (err) {
      console.error('Failed to acknowledge plan:', err);
      alert(err.message || 'Failed to acknowledge this plan. Please try again.');
    } finally {
      setAcknowledgingId(null);
    }
  };

  // Toggle checklist task completion
  const handleToggleTask = async (evaluationId, taskId, currentStatus, isLocked) => {
    if (isLocked) return;
    setUpdatingTaskId(taskId);
    try {
      const targetEval = evaluations.find(e => e.evaluation_id === evaluationId);
      if (!targetEval) return;

      const { data: updatedPlan, error } = await supabase
        .rpc('set_legacy_advising_task_completion', {
          p_evaluation_id: evaluationId,
          p_task_id: taskId,
          p_completed: !currentStatus
        });

      if (error) throw error;

      // Update local state
      setEvaluations(prev => prev.map(e => e.evaluation_id === evaluationId ? { ...e, advising_plan: updatedPlan } : e));
    } catch (err) {
      console.error('Failed to update task status:', err);
      alert(err.message || 'Failed to update task status. Please try again.');
    } finally {
      setUpdatingTaskId(null);
    }
  };

  return (
    <>
      <PageHeader title="Faculty Advising Inbox" breadcrumb="Student Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6 text-left font-sans">
        
        {/* Header Notice */}
        <div className="p-4 bg-white border border-slate-200 rounded-lg shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold font-display text-slate-900 flex items-center gap-2">
              <Inbox className="w-4 h-4 text-sage-600" />
              <span>Official Academic Intervention & Catch-Up Plans</span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review personal action plans and complete assigned recovery milestones assigned by your course professors.
            </p>
          </div>
          <Link
            to="/student/academic-insights"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sage-600 hover:bg-sage-700 rounded-md shadow-xs transition-colors whitespace-nowrap cursor-pointer"
          >
            <BrainCircuit className="w-3.5 h-3.5" />
            <span>AI Study Tutor</span>
          </Link>
        </div>

        {/* Content List */}
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-sage-600" />
            <p className="text-xs">Loading advising inbox...</p>
          </div>
        ) : evaluations.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-8 sm:p-12 text-center max-w-xl mx-auto shadow-xs">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto mb-3" />
            <h3 className="text-base font-bold text-slate-900 font-display">No Pending Advising Plans</h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              You are currently on track with no formal intervention plans assigned by your professors.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {evaluations.map((ev) => {
              const tasks = ev.advising_plan || [];
              const { reported: completedCount, verified: verifiedCount, total: totalCount } = countTaskProgress(tasks);
              const isClosed = Boolean(ev.followup_snapshot);
              const acknowledged = isAcknowledged(ev);
              // Progress counts instructor-verified tasks, matching the faculty view and the Dean's results.
              const progressPct = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0;
              const planDeadline = tasks.map(task => task.due_date).filter(Boolean).sort().at(-1) || null;
              const isRecovery = ev.evaluation_context === 'passing_recovery';
              const isLegacyRetention = ev.evaluation_context === 'pl_retention';
              const isDraft = ev.status === 'draft' || ev.status === 'pending_review';

              return (
                <div 
                  key={ev.evaluation_id} 
                  className={cn(
                    "bg-white rounded-lg border shadow-xs overflow-hidden transition-all",
                    isDraft 
                      ? "border-slate-200 border-l-4 border-l-slate-400" 
                      : isRecovery 
                        ? "border-slate-200 border-l-4 border-l-rose-500" 
                        : "border-slate-200 border-l-4 border-l-amber-500"
                  )}
                >
                  {/* Card Top Banner */}
                  <div className="p-4 sm:p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">
                          {ev.class_records?.subjects?.code || 'COURSE'}
                        </span>
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-xs font-semibold text-slate-700">
                          {ev.class_records?.subjects?.name || 'Class Record'}
                        </span>
                        <span className="text-xs font-mono text-slate-400">
                          ({ev.class_records?.sections?.name})
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2">
                        <span>Instructor: <strong className="text-slate-700 font-medium">Prof. {ev.users?.first_name} {ev.users?.last_name}</strong></span>
                        <span>•</span>
                        <span>Term: <strong className="text-slate-700 font-medium">{ev.term}</strong></span>
                        <span>•</span>
                        <span>Issued: {new Date(ev.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isDraft ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border bg-slate-50 text-slate-600 border-slate-200">
                          <Lock className="w-3.5 h-3.5 text-amber-600" />
                          <span>Awaiting Professor Publish</span>
                        </span>
                      ) : (
                        <span className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold border",
                          isRecovery
                            ? "bg-rose-50 text-rose-700 border-rose-200"
                            : isLegacyRetention
                              ? "bg-amber-50 text-amber-700 border-amber-200"
                              : "bg-sage-50 text-sage-700 border-sage-200"
                        )}>
                          {isLegacyRetention ? <Trophy className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                          <span>{isRecovery ? 'Legacy Passing Recovery Plan' : isLegacyRetention ? 'Legacy Honors Retention Plan' : 'Academic Intervention Plan'}</span>
                        </span>
                      )}

                      <span className="px-2 py-1 rounded-md text-xs font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {isDraft ? 'Draft' : `${verifiedCount}/${totalCount} verified`}
                      </span>
                    </div>
                  </div>

                  {/* Card Body */}
                  <div className="p-4 sm:p-5 space-y-4">
                    
                    {/* Draft Lock Notice Banner */}
                    {isDraft && (
                      <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2.5 text-amber-900 text-xs">
                        <Lock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-bold">Pending Professor Review & Validation:</span>
                          <p className="mt-0.5 text-amber-800 text-[11px] leading-relaxed">
                            This intervention plan has been prepared and is currently awaiting final validation and publishing by your instructor. Tasks will become actionable once officially published.
                          </p>
                        </div>
                      </div>
                    )}

                    {!isDraft && !isClosed && (
                      acknowledged ? (
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>You acknowledged this plan on {new Date(ev.acknowledged_at).toLocaleDateString()}.</span>
                        </div>
                      ) : (
                        <div className="p-3.5 bg-sage-50 border border-sage-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-sage-900">
                          <div>
                            <span className="font-bold block">Please acknowledge this plan</span>
                            <span className="text-[11px] text-sage-700">Read your instructor&apos;s guidance and tasks below, then confirm you have received them. Your instructor will see when you acknowledged it. You can report task progress after acknowledging.</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleAcknowledge(ev.evaluation_id)}
                            disabled={acknowledgingId === ev.evaluation_id}
                            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-sage-600 hover:bg-sage-700 rounded-md shadow-xs transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>{acknowledgingId === ev.evaluation_id ? 'Saving…' : 'Acknowledge plan'}</span>
                          </button>
                        </div>
                      )
                    )}

                    {/* Only explicitly shared feedback is student-visible. */}
                    {ev.shared_academic_feedback && (
                      <div className="p-3.5 bg-slate-50 border-l-2 border-sage-500 rounded-r-md text-xs text-slate-800 space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          Faculty Academic Guidance:
                        </div>
                        <p className="text-slate-700 leading-relaxed font-sans">
                          {ev.shared_academic_feedback}
                        </p>
                      </div>
                    )}

                    {/* Action Tasks Checklist */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                          Assigned Catch-Up Milestones ({completedCount}/{totalCount} reported · {verifiedCount} verified)
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {isDraft ? 'Actionable once published by professor' : isClosed ? 'Plan closed after your instructor recorded the follow-up' : !acknowledged ? 'Acknowledge the plan to start reporting progress' : 'Check off items as you complete them; your instructor verifies each one'}
                        </span>
                      </div>

                      {planDeadline && (
                        <div className="flex items-center gap-2 rounded-md border border-sage-200 bg-sage-50 px-3 py-2 text-xs text-sage-800">
                          <Clock className="h-4 w-4 text-sage-600" />
                          <span><strong>Plan completion date:</strong> {planDeadline} · Complete all steps in order by this date.</span>
                        </div>
                      )}

                      {/* Progress Track */}
                      <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full transition-all duration-300",
                            isDraft ? "bg-slate-300" : progressPct === 100 ? "bg-emerald-600" : "bg-sage-600"
                          )}
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>

                      {/* Tasks List */}
                      <div className="space-y-2 pt-1">
                        {tasks.map((task) => {
                          const verification = taskVerification(task);
                          const isLocked = isDraft || isClosed || !acknowledged || verification === 'verified';
                          return (
                          <div
                            key={task.task_id}
                            className={cn(
                              "flex items-start gap-3 p-3 rounded-md border transition-all",
                              isLocked && !task.completed
                                ? "bg-slate-50/70 border-slate-200 text-slate-500 cursor-not-allowed opacity-75"
                                : task.completed
                                  ? cn("bg-emerald-50/40 border-emerald-200 text-slate-600", isLocked ? "cursor-default" : "cursor-pointer")
                                  : "bg-white border-slate-200 text-slate-800 hover:border-slate-300 cursor-pointer"
                            )}
                            onClick={() => !isLocked && handleToggleTask(ev.evaluation_id, task.task_id, task.completed, isLocked)}
                          >
                            <button
                              type="button"
                              disabled={isLocked || updatingTaskId === task.task_id}
                              aria-label={task.completed ? 'Mark task as not done' : 'Report task as done'}
                              className="mt-0.5 text-sage-600 hover:text-sage-700 disabled:opacity-50"
                            >
                              {task.completed ? (
                                <CheckSquare className="w-4 h-4 text-emerald-600" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-400" />
                              )}
                            </button>

                            <div className="flex-1 text-xs">
                              <span className={cn(task.completed && "line-through text-slate-400")}>
                                {task.description}
                              </span>
                              {task.completed && task.completed_at && (
                                <div className="text-[10px] font-mono text-slate-400 mt-0.5 flex items-center gap-1">
                                  <span className="text-emerald-600 font-semibold">Reported done on {new Date(task.completed_at).toLocaleDateString()}</span>
                                </div>
                              )}
                              <div className="text-[10px] mt-0.5 font-semibold text-slate-500">
                                {verification === 'verified' && <span className="text-emerald-700">Verified by your instructor</span>}
                                {verification === 'reported' && <span>{isClosed ? 'Not verified before the plan closed' : 'Awaiting instructor verification'}</span>}
                                {verification === 'returned' && <span className="text-amber-700">Returned by your instructor: {task.return_note}</span>}
                              </div>
                            </div>
                          </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Card Footer Actions */}
                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <div className="text-slate-500 text-[11px]">
                        Need help with these concepts? Review your personalized diagnostics.
                      </div>
                      <Link
                        to="/student/academic-insights"
                        className="inline-flex items-center gap-1 font-semibold text-sage-600 hover:text-sage-700"
                      >
                        <span>Open AI Study Tutor</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </>
  );
}
