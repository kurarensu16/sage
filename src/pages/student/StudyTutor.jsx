import { useState, useEffect, useCallback, useMemo } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import ConfirmModal from '../../components/ConfirmModal';
import {
  GraduationCap, Loader2, AlertTriangle, CheckCircle2, Circle, Info,
  ChevronLeft, Sparkles, ListChecks, HelpCircle, Link2, RefreshCw, Clock,
  BookOpen, ExternalLink, Trash2
} from 'lucide-react';
import { toUserMessage } from '../../lib/errorMessages';
import { cn } from '../../lib/utils';
import {
  TUTOR_ACTIONS, TUTOR_HORIZONS, PRACTICE_DIFFICULTIES, TUTOR_BOUNDARY,
  PLAN_STATUS, PLAN_STATUS_LABEL, planProgress, planStaleness, planOverdue,
  fetchTutorMenu, fetchMyPlans, explainTopic, buildStudyPlan,
  generatePractice, submitPractice, fetchTopicResources,
  setPlanItemDone, setPlanStatus, acknowledgePlanStaleness
} from '../../lib/studyTutorService';

// AI Study Tutor — the tutoring mode.
//
// Deliberately NOT part of Ask ASPIRE, which lives on Academic Insights and
// explains standing, grades and risk. This teaches, and it is reached only by
// choosing to start it. The two never blend: a student always knows which one
// they are talking to, and this one has its own boundary statement.
//
// WHAT THIS PAGE NEVER SHOWS
// No grade, GWA, standing, risk tier or faculty note appears here, because the
// tutor is never given them. Topic percentages shown below are study signals
// computed from the student's own activity scores -- they are not an
// assessment, and the wording avoids implying one.

const ACTION_ICON = {
  explain: Sparkles,
  plan: ListChecks,
  practice: HelpCircle,
  resources: Link2
};

function OptionButton({ label, help, active, onClick, icon: Icon, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full text-left rounded-xl border px-3.5 py-3 transition-colors cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        active
          ? 'border-emerald-300 bg-emerald-50'
          : 'border-slate-200 bg-white hover:bg-slate-50'
      )}
    >
      <span className="flex items-start gap-2.5">
        {Icon && (
          <Icon className={cn('h-4 w-4 mt-0.5 flex-shrink-0', active ? 'text-emerald-600' : 'text-slate-400')} />
        )}
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-800">{label}</span>
          {help && <span className="block text-[11px] text-slate-500 mt-0.5">{help}</span>}
        </span>
      </span>
    </button>
  );
}

function StepShell({ step, title, children, onBack }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
        )}
        <span className="text-micro font-bold uppercase tracking-wider text-slate-400">
          Step {step}
        </span>
      </div>
      <h3 className="text-sm font-semibold font-display text-slate-900 mb-3">{title}</h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function TopicChip({ topic }) {
  // A percentage is a study signal, not a grade. "Needs review" is the label a
  // student acts on; the number is secondary and only shown when one exists.
  if (topic.percent === null) {
    return <span className="text-[11px] text-slate-400">Not graded yet</span>;
  }
  return (
    <span className={cn(
      'text-[11px] font-mono font-semibold',
      topic.needsReview ? 'text-amber-700' : 'text-emerald-700'
    )}>
      {topic.percent}%
    </span>
  );
}

function PlanCard({ plan, onToggle, onFinish, onDiscard, busy }) {
  const progress = planProgress(plan);
  const stale = planStaleness(plan);
  const overdue = planOverdue(plan);
  const items = Array.isArray(plan.items) ? plan.items : [];

  return (
    <div className="border border-slate-200 rounded-xl bg-white p-3.5">
      <div className="flex items-start justify-between gap-2 flex-wrap mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {plan.topic || 'General study plan'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {plan.subjectCode || 'Across all subjects'}
            {' · '}
            {PLAN_STATUS_LABEL[plan.status] || plan.status}
            {' · '}
            {progress.done} of {progress.total} done
          </p>
        </div>
        {plan.status === PLAN_STATUS.ACTIVE && (
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => onFinish(plan)}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 text-[11px] font-bold hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="h-3 w-3" />
              Finish
            </button>
            <button
              type="button"
              onClick={() => onDiscard(plan)}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 text-[11px] font-bold hover:bg-slate-50 disabled:opacity-50 cursor-pointer"
            >
              <Trash2 className="h-3 w-3" />
              Discard
            </button>
          </div>
        )}
      </div>

      {stale && (
        <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 mb-2 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 mt-px flex-shrink-0" />
          <span>{stale.message} It is still worth finishing — ask for a new one if it no longer fits.</span>
        </p>
      )}

      {overdue && (
        <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 mb-2 flex items-start gap-1.5">
          <Clock className="h-3.5 w-3.5 mt-px flex-shrink-0" />
          This plan&apos;s week has passed. Finish what is left, or start a new one.
        </p>
      )}

      <ul className="space-y-1.5">
        {items.map((item, index) => (
          <li key={`${plan.plan_id}-${index}`}>
            <button
              type="button"
              onClick={() => onToggle(plan, index, !item.done)}
              disabled={busy || plan.status !== PLAN_STATUS.ACTIVE}
              className="w-full text-left flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {item.done
                ? <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                : <Circle className="h-4 w-4 text-slate-300 mt-0.5 flex-shrink-0" />}
              <span className="min-w-0">
                <span className={cn(
                  'block text-[13px]',
                  item.done ? 'text-slate-400 line-through' : 'text-slate-800'
                )}>
                  {item.action}
                </span>
                {item.by && (
                  <span className="block text-[11px] text-slate-500 mt-0.5">{item.by}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResourceList({ resources }) {
  if (!resources?.length) return null;
  return (
    <div className="mt-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
        From your instructor
      </p>
      <ul className="space-y-1.5">
        {resources.map((r, i) => (
          <li key={`${r.label}-${i}`} className="border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
            {r.url ? (
              <a
                href={r.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] font-semibold text-sky-700 hover:underline inline-flex items-center gap-1"
              >
                {r.label}
                <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              <span className="text-[13px] font-semibold text-slate-800">{r.label}</span>
            )}
            {r.note && <p className="text-[11px] text-slate-500 mt-0.5">{r.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Shown when the instructor attached nothing for this topic.
//
// Every link here is built by the system from a keyword, never produced by the
// model — a model with no browsing tool can only recall URLs, and recalled URLs
// are often dead or point somewhere other than they claim. A search page built
// from a keyword always works, and the student judges the results themselves.
function SearchSuggestions({ suggestions, hint }) {
  if (!suggestions?.length) return null;
  return (
    <div className="mt-3">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">
        Try searching for
      </p>
      {hint && <p className="text-[12px] text-slate-600 mb-2">{hint}</p>}
      <ul className="space-y-1.5">
        {suggestions.map((s, i) => (
          <li key={i} className="border border-slate-200 rounded-lg px-2.5 py-2 bg-white">
            <p className="text-[13px] font-semibold text-slate-800">{s.keyword}</p>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              {(s.links || []).map((link) => (
                <a
                  key={link.name}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] font-semibold text-sky-700 hover:underline inline-flex items-center gap-1"
                >
                  {link.label}
                  <ExternalLink className="h-3 w-3" />
                </a>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-slate-400 mt-2 flex items-start gap-1.5">
        <Info className="h-3.5 w-3.5 mt-px flex-shrink-0" />
        These are general web suggestions, not materials your instructor reviewed.
      </p>
    </div>
  );
}

function PracticeRunner({ set, onSubmit, submitting, results }) {
  const [answers, setAnswers] = useState({});

  if (results) {
    return (
      <div className="space-y-2.5">
        <p className="text-sm font-semibold text-slate-900">
          You got {results.score} of {results.total} right.
        </p>
        {results.results.map((r, i) => (
          <div
            key={i}
            className={cn(
              'border rounded-xl p-3',
              r.is_correct ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'
            )}
          >
            <p className="text-[13px] font-semibold text-slate-900">{r.question}</p>
            <p className="text-[11px] mt-1.5 text-slate-700">
              Your answer: <span className="font-semibold">{r.chosen_answer || 'Not answered'}</span>
            </p>
            {!r.is_correct && (
              <p className="text-[11px] text-slate-700">
                Correct answer: <span className="font-semibold">{r.correct_answer}</span>
              </p>
            )}
            {r.explanation && <p className="text-[11px] text-slate-600 mt-1">{r.explanation}</p>}
          </div>
        ))}
      </div>
    );
  }

  const allAnswered = set.assessment.every((_, i) => answers[i]);

  return (
    <div className="space-y-3">
      {set.assessment.map((q, i) => (
        <div key={i} className="border border-slate-200 rounded-xl p-3 bg-white">
          <p className="text-[13px] font-semibold text-slate-900 mb-2">
            {i + 1}. {q.question}
          </p>
          <div className="space-y-1.5">
            {q.choices.map((choice, c) => (
              <button
                key={c}
                type="button"
                onClick={() => setAnswers((prev) => ({ ...prev, [i]: choice }))}
                className={cn(
                  'w-full text-left text-[13px] rounded-lg border px-2.5 py-1.5 transition-colors cursor-pointer',
                  answers[i] === choice
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900 font-semibold'
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                )}
              >
                {choice}
              </button>
            ))}
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={() => onSubmit(answers)}
        disabled={!allAnswered || submitting}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-[13px] font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
      >
        {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {submitting ? 'Checking…' : 'Check my answers'}
      </button>
      {!allAnswered && (
        <p className="text-[11px] text-slate-500">Answer every question to check them.</p>
      )}
    </div>
  );
}

export default function StudyTutor() {
  const [menu, setMenu] = useState({ subjects: [], topics: [], hasAnyScore: false });
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [planBusy, setPlanBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(null);

  // The wizard
  const [step, setStep] = useState(1);
  const [subjectId, setSubjectId] = useState(null);
  const [focusMode, setFocusMode] = useState('');
  const [topic, setTopic] = useState(null);
  const [action, setAction] = useState('');
  const [horizon, setHorizon] = useState('this_week');
  const [difficulty, setDifficulty] = useState('mixed');

  // The answer
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [practiceResults, setPracticeResults] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [menuData, planData] = await Promise.all([fetchTutorMenu(), fetchMyPlans()]);
      setMenu(menuData);
      setPlans(planData);
    } catch (err) {
      setError(toUserMessage(err, 'Could not open the study tutor.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activePlans = useMemo(
    () => plans.filter((p) => p.status === PLAN_STATUS.ACTIVE),
    [plans]
  );
  const pastPlans = useMemo(
    () => plans.filter((p) => p.status !== PLAN_STATUS.ACTIVE),
    [plans]
  );

  const subjectTopics = useMemo(() => {
    if (!subjectId) return menu.topics;
    return menu.topics.filter((t) => t.subjectId === subjectId);
  }, [menu.topics, subjectId]);

  const offeredTopics = useMemo(() => {
    if (focusMode === 'weak') return subjectTopics.filter((t) => t.needsReview);
    if (focusMode === 'all') return subjectTopics;
    return [];
  }, [subjectTopics, focusMode]);

  const resetWizard = () => {
    setStep(1); setSubjectId(null); setFocusMode(''); setTopic(null);
    setAction(''); setResult(null); setPracticeResults(null); setError('');
  };

  const run = async (chosenAction) => {
    setRunning(true);
    setError('');
    setResult(null);
    setPracticeResults(null);
    try {
      const args = {
        subjectId,
        topic: topic?.topic || (focusMode === 'skills' ? 'general study skills and time management' : ''),
        topicTag: topic?.topic || null
      };
      let data;
      if (chosenAction === 'explain') data = await explainTopic(args);
      else if (chosenAction === 'plan') data = await buildStudyPlan({ ...args, horizon });
      else if (chosenAction === 'practice') data = await generatePractice({ ...args, difficulty });
      else data = await fetchTopicResources(args);

      setResult({ ...data, action: chosenAction });
      if (chosenAction === 'plan') await load();
    } catch (err) {
      setError(toUserMessage(err, 'The tutor could not answer that. Please try again.'));
    } finally {
      setRunning(false);
    }
  };

  // Only reached when the student already has an unfinished plan at this scope.
  // Replacing is always their explicit choice -- a plan is never silently
  // overwritten, and no model is called until they say so.
  const replacePlan = async () => {
    setRunning(true);
    setError('');
    try {
      const data = await buildStudyPlan({
        subjectId,
        topic: topic?.topic || '',
        topicTag: topic?.topic || null,
        horizon,
        replace: true
      });
      setResult({ ...data, action: 'plan' });
      await load();
    } catch (err) {
      setError(toUserMessage(err, 'The plan could not be replaced.'));
    } finally {
      setRunning(false);
    }
  };

  const handleToggle = async (plan, index, done) => {
    setPlanBusy(true);
    try {
      await setPlanItemDone(plan, index, done);
      await load();
    } catch (err) {
      setError(toUserMessage(err, 'That could not be saved.'));
    } finally {
      setPlanBusy(false);
    }
  };

  const handleStatus = async (plan, status) => {
    setPlanBusy(true);
    try {
      await setPlanStatus(plan.plan_id, status);
      await load();
    } catch (err) {
      setError(toUserMessage(err, 'That could not be saved.'));
    } finally {
      setPlanBusy(false);
      setConfirmDiscard(null);
    }
  };

  const handleAcknowledge = async (plan) => {
    try {
      await acknowledgePlanStaleness(plan.plan_id);
      await load();
    } catch {
      // A banner that will not dismiss is a small annoyance, not worth an error.
    }
  };

  const handlePracticeSubmit = async (answers) => {
    setSubmitting(true);
    setError('');
    try {
      const ordered = result.assessment.map((_, i) => answers[i] || '');
      const data = await submitPractice({ setId: result.set_id, answers: ordered });
      setPracticeResults(data);
    } catch (err) {
      setError(toUserMessage(err, 'Your answers could not be checked.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <>
        <PageHeader title="AI Study Advising" subtitle="Practice, plans and explanations for your own topics" />
        <div className="flex items-center gap-2 text-sm text-slate-500 p-6">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your subjects…
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="AI Study Advising"
        subtitle="Practice, plans and explanations for your own topics"
      />

      <div className="space-y-4 sm:space-y-5">
        {error && (
          <p className="text-[13px] text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2.5 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-px flex-shrink-0" />
            {error}
          </p>
        )}

        {/* ── My Study Plans ─────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-10 h-10 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 flex items-center justify-center flex-shrink-0">
              <ListChecks className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-semibold font-display text-slate-900">
                My study plans
              </h2>
              <p className="text-[11px] text-slate-500">
                One plan at a time per subject, plus one across everything.
              </p>
            </div>
          </div>

          {activePlans.length === 0 && pastPlans.length === 0 ? (
            <p className="text-[13px] text-slate-500">
              No plans yet. Start a session below and choose &ldquo;Give me a study plan&rdquo;.
            </p>
          ) : (
            <div className="space-y-2.5">
              {activePlans.map((plan) => (
                <PlanCard
                  key={plan.plan_id}
                  plan={plan}
                  busy={planBusy}
                  onToggle={handleToggle}
                  onFinish={(p) => handleStatus(p, PLAN_STATUS.COMPLETED)}
                  onDiscard={(p) => setConfirmDiscard(p)}
                />
              ))}

              {activePlans.some((p) => p.stale_since) && (
                <button
                  type="button"
                  onClick={() => activePlans.filter((p) => p.stale_since).forEach(handleAcknowledge)}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="h-3 w-3" />
                  Dismiss the out-of-date notices
                </button>
              )}

              {pastPlans.length > 0 && (
                <details className="mt-1">
                  <summary className="text-[11px] font-bold uppercase tracking-wider text-slate-400 cursor-pointer">
                    Finished and past plans ({pastPlans.length})
                  </summary>
                  <div className="space-y-2.5 mt-2">
                    {pastPlans.map((plan) => (
                      <PlanCard
                        key={plan.plan_id}
                        plan={plan}
                        busy={planBusy}
                        onToggle={handleToggle}
                        onFinish={() => {}}
                        onDiscard={() => {}}
                      />
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>

        {/* ── Start a session ────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-10 h-10 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm sm:text-base font-semibold font-display text-slate-900">
                Start a session
              </h2>
              <p className="text-[11px] text-slate-500">
                Tap through to what you want help with.
              </p>
            </div>
            {step > 1 && (
              <button
                type="button"
                onClick={resetWizard}
                className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 cursor-pointer flex-shrink-0"
              >
                Start over
              </button>
            )}
          </div>

          {menu.subjects.length === 0 ? (
            <p className="text-[13px] text-slate-500">
              You have no subjects with recorded activities yet. Once your instructors add
              activities, this is where you can get help with them.
            </p>
          ) : (
            <>
              {step === 1 && (
                <StepShell step={1} title="What do you want help with?">
                  <OptionButton
                    label="Across all my subjects"
                    help="Study skills, or topics that need review anywhere."
                    icon={BookOpen}
                    active={subjectId === null && focusMode !== ''}
                    onClick={() => { setSubjectId(null); setStep(2); }}
                  />
                  {menu.subjects.map((s) => (
                    <OptionButton
                      key={s.subjectId}
                      label={s.code || s.name}
                      help={s.code ? s.name : undefined}
                      icon={BookOpen}
                      onClick={() => { setSubjectId(s.subjectId); setStep(2); }}
                    />
                  ))}
                </StepShell>
              )}

              {step === 2 && (
                <StepShell step={2} title="Which topics?" onBack={() => setStep(1)}>
                  {subjectId === null && (
                    <OptionButton
                      label="General study skills and time management"
                      help="Not tied to one topic."
                      icon={Sparkles}
                      onClick={() => { setFocusMode('skills'); setTopic(null); setStep(3); }}
                    />
                  )}
                  <OptionButton
                    label={subjectId ? 'My weak topics in this subject' : 'Topics that need review'}
                    help="Topics where your recorded scores are below the passing mark."
                    icon={AlertTriangle}
                    onClick={() => { setFocusMode('weak'); setStep(2.5); }}
                  />
                  <OptionButton
                    label={subjectId ? 'All topics covered so far' : 'All my topics'}
                    help="Everything your instructors have tagged."
                    icon={ListChecks}
                    onClick={() => { setFocusMode('all'); setStep(2.5); }}
                  />
                </StepShell>
              )}

              {step === 2.5 && (
                <StepShell step={2} title="Pick a topic" onBack={() => setStep(2)}>
                  {offeredTopics.length === 0 ? (
                    <p className="text-[13px] text-slate-500">
                      {focusMode === 'weak'
                        ? 'Nothing is below the passing mark here — which is good news. Choose “All topics” to study something anyway.'
                        : 'Your instructors have not tagged any topics here yet.'}
                    </p>
                  ) : (
                    offeredTopics.map((t) => (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => { setTopic(t); setStep(3); }}
                        className="w-full text-left rounded-xl border border-slate-200 bg-white hover:bg-slate-50 px-3.5 py-3 cursor-pointer"
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block text-sm font-semibold text-slate-800">{t.topic}</span>
                            <span className="block text-[11px] text-slate-500 mt-0.5">
                              {t.subjectCode} · {t.attempted} of {t.total} graded
                            </span>
                          </span>
                          <TopicChip topic={t} />
                        </span>
                      </button>
                    ))
                  )}
                </StepShell>
              )}

              {step === 3 && (
                <StepShell step={3} title="What would help?" onBack={() => setStep(focusMode === 'skills' ? 2 : 2.5)}>
                  {TUTOR_ACTIONS.map((a) => (
                    <OptionButton
                      key={a.id}
                      label={a.label}
                      help={a.help}
                      icon={ACTION_ICON[a.id]}
                      active={action === a.id}
                      onClick={() => {
                        setAction(a.id);
                        if (a.id === 'plan' || a.id === 'practice') setStep(4);
                        else { setStep(5); run(a.id); }
                      }}
                    />
                  ))}
                </StepShell>
              )}

              {step === 4 && action === 'plan' && (
                <StepShell step={4} title="How long should it run?" onBack={() => setStep(3)}>
                  {TUTOR_HORIZONS.map((h) => (
                    <OptionButton
                      key={h.id}
                      label={h.label}
                      help={h.help}
                      icon={Clock}
                      active={horizon === h.id}
                      onClick={() => { setHorizon(h.id); setStep(5); run('plan'); }}
                    />
                  ))}
                </StepShell>
              )}

              {step === 4 && action === 'practice' && (
                <StepShell step={4} title="How hard?" onBack={() => setStep(3)}>
                  {PRACTICE_DIFFICULTIES.map((d) => (
                    <OptionButton
                      key={d.id}
                      label={d.label}
                      icon={HelpCircle}
                      active={difficulty === d.id}
                      onClick={() => { setDifficulty(d.id); setStep(5); run('practice'); }}
                    />
                  ))}
                </StepShell>
              )}

              {step === 5 && (
                <div>
                  <button
                    type="button"
                    onClick={resetWizard}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 hover:text-slate-800 mb-3 cursor-pointer"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Ask something else
                  </button>

                  {running && (
                    <p className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Thinking…
                    </p>
                  )}

                  {!running && result && (
                    <div>
                      {result.personalized === false && (
                        <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 mb-2.5 flex items-start gap-1.5">
                          <Info className="h-3.5 w-3.5 mt-px flex-shrink-0" />
                          No scores are recorded for this yet, so this is general guidance rather than
                          advice based on your own work.
                        </p>
                      )}

                      {result.message && (
                        <p className="text-[13px] text-slate-800 whitespace-pre-line leading-relaxed">
                          {result.message}
                        </p>
                      )}

                      {result.needs_choice && (
                        <div className="mt-3 border border-amber-200 bg-amber-50 rounded-xl p-3">
                          <p className="text-[12px] text-amber-900">
                            You already have an unfinished plan for this. Keeping it costs nothing;
                            replacing it starts a new one.
                          </p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <button
                              type="button"
                              onClick={resetWizard}
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-800 text-[11px] font-bold hover:bg-amber-100 cursor-pointer"
                            >
                              Keep the one I have
                            </button>
                            <button
                              type="button"
                              onClick={replacePlan}
                              className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-700 text-[11px] font-bold hover:bg-slate-100 cursor-pointer"
                            >
                              Start a new plan instead
                            </button>
                          </div>
                        </div>
                      )}

                      {result.action === 'practice' && result.assessment && (
                        <div className="mt-3">
                          <PracticeRunner
                            set={result}
                            onSubmit={handlePracticeSubmit}
                            submitting={submitting}
                            results={practiceResults}
                          />
                        </div>
                      )}

                      {result.action === 'plan' && result.study_plan && (
                        <p className="text-[12px] text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-2 mt-3">
                          Saved to My study plans above.
                        </p>
                      )}

                      {Array.isArray(result.follow_ups) && result.follow_ups.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {result.follow_ups.map((f, i) => (
                            <span
                              key={i}
                              className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-1"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      )}

                      <ResourceList resources={result.resources} />
                      <SearchSuggestions
                        suggestions={result.search_suggestions}
                        hint={result.search_hint}
                      />

                      <p className="text-[11px] text-slate-400 mt-4 flex items-start gap-1.5">
                        <Info className="h-3.5 w-3.5 mt-px flex-shrink-0" />
                        {result.boundary_statement || TUTOR_BOUNDARY}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!confirmDiscard}
        onCancel={() => setConfirmDiscard(null)}
        onConfirm={() => handleStatus(confirmDiscard, PLAN_STATUS.DELETED)}
        title="Discard this plan?"
        message="It will be removed from your list and you can start a new one for this subject. Your practice history is not affected."
      />
    </>
  );
}
