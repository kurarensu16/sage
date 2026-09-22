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

export default function FacultyAdvisingInbox() {
  const { user } = useAuth();
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updatingTaskId, setUpdatingTaskId] = useState(null);

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
          risk_level,
          risk_score,
          professor_notes,
          advising_plan,
          baseline_snapshot,
          status,
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
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEvaluations(data || []);
    } catch (err) {
      console.error('Error loading advising evaluations:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchEvaluations();
  }, [fetchEvaluations]);

  // Toggle checklist task completion
  const handleToggleTask = async (evaluationId, taskId, currentStatus, isDraft) => {
    if (isDraft) return;
    setUpdatingTaskId(taskId);
    try {
      const targetEval = evaluations.find(e => e.evaluation_id === evaluationId);
      if (!targetEval) return;

      const updatedPlan = (targetEval.advising_plan || []).map(t => {
        if (t.task_id === taskId) {
          const nextCompleted = !currentStatus;
          return {
            ...t,
            completed: nextCompleted,
            completed_at: nextCompleted ? new Date().toISOString() : null
          };
        }
        return t;
      });

      const { error } = await supabase
        .from('student_risk_evaluations')
        .update({
          advising_plan: updatedPlan,
          updated_at: new Date().toISOString()
        })
        .eq('evaluation_id', evaluationId);

      if (error) throw error;

      // Update local state
      setEvaluations(prev => prev.map(e => e.evaluation_id === evaluationId ? { ...e, advising_plan: updatedPlan } : e));
    } catch (err) {
      console.error('Failed to update task status:', err);
      alert('Failed to update task status. Please try again.');
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
              const completedCount = tasks.filter(t => t.completed).length;
              const totalCount = tasks.length;
              const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
              const isRecovery = ev.evaluation_context === 'passing_recovery';
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
                          isRecovery ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"
                        )}>
                          {isRecovery ? <AlertCircle className="w-3.5 h-3.5" /> : <Trophy className="w-3.5 h-3.5" />}
                          <span>{isRecovery ? 'Passing Recovery Plan' : 'Honors (PL) Retention Plan'}</span>
                        </span>
                      )}

                      <span className="px-2 py-1 rounded-md text-xs font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        {isDraft ? 'Draft' : `${progressPct}% Completed`}
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

                    {/* Professor's Memorandum Note */}
                    <div className="p-3.5 bg-slate-50 border-l-2 border-sage-500 rounded-r-md text-xs text-slate-800 space-y-1">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Professor's Observations & Directions:
                      </div>
                      <p className="italic text-slate-700 leading-relaxed font-sans">
                        "{ev.professor_notes}"
                      </p>
                    </div>

                    {/* Action Tasks Checklist */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-700 uppercase tracking-wide">
                          Assigned Catch-Up Milestones ({completedCount}/{totalCount})
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {isDraft ? 'Actionable once published by professor' : 'Check off items as you complete them'}
                        </span>
                      </div>

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
                        {tasks.map((task) => (
                          <div 
                            key={task.task_id}
                            className={cn(
                              "flex items-start gap-3 p-3 rounded-md border transition-all",
                              isDraft 
                                ? "bg-slate-50/70 border-slate-200 text-slate-500 cursor-not-allowed opacity-75" 
                                : task.completed 
                                  ? "bg-emerald-50/40 border-emerald-200 text-slate-600 cursor-pointer" 
                                  : "bg-white border-slate-200 text-slate-800 hover:border-slate-300 cursor-pointer"
                            )}
                            onClick={() => !isDraft && handleToggleTask(ev.evaluation_id, task.task_id, task.completed, isDraft)}
                          >
                            <button
                              type="button"
                              disabled={isDraft || updatingTaskId === task.task_id}
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
                              {task.due_date && (
                                <div className="text-[10px] font-mono text-slate-400 mt-0.5 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  <span>Target Due: {task.due_date}</span>
                                  {task.completed && task.completed_at && (
                                    <span className="text-emerald-600 font-semibold">• Completed on {new Date(task.completed_at).toLocaleDateString()}</span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
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
                        <span>Open Study Tutor</span>
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
