import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, BookOpen, CheckCircle2, ClipboardCheck, Info, Loader2, RefreshCw, Search, Users, X } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { useAuth } from '../../lib/AuthContext';
import { getClassPriorityRoster } from '../../lib/classRoomService';
import { getEvaluationClasses, getTermEvaluations } from '../../lib/evaluationService';
import { getTermsForPeriod, needsEvaluation } from '../../lib/evaluationTracking';
import { RISK_TIERS } from '../../lib/academicPolicy';
import {
  generateInterventionDraft,
  getFacultyInterventionWorkingDraft,
  getLatestGeneratedInterventionPlan
} from '../../lib/interventionDraftService';
import StudentRiskEvaluationModal from './StudentRiskEvaluationModal';
import EnrollmentTypeBadge from '../../components/common/EnrollmentTypeBadge';
import RiskEducationNote from '../../components/faculty/RiskEducationNote';

const field = 'w-full rounded-lg border border-sage-200 bg-white px-4 py-2.5 text-sm text-sage-900 outline-none focus:border-sage-500 focus:ring-2 focus:ring-sage-200';
const secondaryButton = 'inline-flex items-center justify-center gap-2 rounded-lg border border-sage-200 bg-white px-4 py-2 text-xs font-semibold text-sage-700 hover:bg-sage-50 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-sage-600 disabled:opacity-50 disabled:cursor-not-allowed';

export default function StudentRisk({ mode = 'evaluate' }) {
  const { user } = useAuth();
  return user?.id ? <EvaluationRoster key={user.id} facultyId={user.id} needsByDefault={mode === 'risk'} /> : null;
}

function EvaluationRoster({ facultyId, needsByDefault }) {
  const [params, setParams] = useSearchParams();
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [evaluations, setEvaluations] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [generationCandidate, setGenerationCandidate] = useState(null);
  const [generationRequestId, setGenerationRequestId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [generationSlow, setGenerationSlow] = useState(false);
  const [generationError, setGenerationError] = useState('');
  const [restoringStudentId, setRestoringStudentId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!generating) {
      setGenerationSlow(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setGenerationSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, [generating]);
  const [search, setSearch] = useState('');
  const classId = params.get('class') || classes.find(item => item.status === 'active')?.class_record_id || classes[0]?.class_record_id || '';
  const selectedClass = classes.find(item => item.class_record_id === classId);
  const termOptions = getTermsForPeriod(selectedClass?.semester);
  const term = termOptions.includes(params.get('term')) ? params.get('term') : '';
  const needsOnly = params.get('view') === 'needs-evaluation' || (needsByDefault && !params.get('view'));

  function changeFilter(key, value) {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    setParams(next, { replace: true });
    setSelectedStudent(null);
    if (key === 'class') setSearch('');
  }

  async function beginEvaluation(student, existing) {
    const candidate = { ...student, evaluation: existing || null };
    setRestoringStudentId(student.user_id);
    try {
      const workingDraft = await getFacultyInterventionWorkingDraft({
        classRecordId: classId,
        studentId: student.user_id,
        term
      });
      if (workingDraft) {
        setSelectedStudent({ ...candidate, interventionDraft: workingDraft });
        return;
      }
      if (existing) {
        setSelectedStudent(candidate);
        return;
      }
      const savedDraft = await getLatestGeneratedInterventionPlan({
        classRecordId: classId,
        studentId: student.user_id,
        term
      });
      if (savedDraft) {
        setSelectedStudent({ ...candidate, interventionDraft: savedDraft });
        return;
      }
      setGenerationCandidate(candidate);
      setGenerationRequestId(crypto.randomUUID());
      setGenerationError('');
    } catch (err) {
      console.error('Unable to restore the intervention draft:', err);
      if (existing) {
        setSelectedStudent(candidate);
        return;
      }
      setGenerationCandidate(candidate);
      setGenerationRequestId(crypto.randomUUID());
      setGenerationError('A saved suggestion could not be restored. You may generate a new draft or continue manually.');
    } finally {
      setRestoringStudentId(null);
    }
  }

  async function generateDraft() {
    if (!generationCandidate || generating) return;
    setGenerating(true);
    setGenerationError('');
    try {
      const draft = await generateInterventionDraft({ classRecordId: classId,
        studentId: generationCandidate.user_id, term, requestId: generationRequestId });
      setSelectedStudent({ ...generationCandidate, interventionDraft: draft });
      setGenerationCandidate(null);
    } catch (err) {
      console.error('Unable to generate intervention draft:', err);
      setGenerationError(err.message || 'We could not create the suggested intervention tasks right now. Please try again, or continue manually.');
    } finally { setGenerating(false); }
  }

  function continueManually() {
    setSelectedStudent({ ...generationCandidate, interventionDraft: null });
    setGenerationCandidate(null);
    setGenerationError('');
  }

  useEffect(() => {
    let cancelled = false;
    getEvaluationClasses(facultyId).then(data => {
      if (!cancelled) { setClasses(data.classes); if (!data.classes.length) setLoading(false); }
    }).catch(err => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [facultyId]);

  useEffect(() => {
    let cancelled = false;
    if (!classId || !selectedClass) { setStudents([]); setEvaluations([]); setLoading(false); return; }
    setLoading(true);
    setError('');
    Promise.all([getClassPriorityRoster(classId, { throwOnError: true }), getTermEvaluations(classId, term)])
      .then(([roster, cases]) => { if (!cancelled) { setStudents(roster); setEvaluations(cases); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError(err.message); setStudents([]); setEvaluations([]); setLoading(false); } });
    return () => { cancelled = true; };
  }, [classId, selectedClass, term, refresh]);

  const needsCount = students.filter(student => needsEvaluation(student, evaluations, term, RISK_TIERS.MODERATE.min)).length;
  const coveredCount = students.filter(student => evaluations.some(item => item.student_id === student.user_id)).length;
  const roster = needsOnly ? students.filter(student => needsEvaluation(student, evaluations, term, RISK_TIERS.MODERATE.min)) : students;
  const visible = roster.filter(student => `${student.first_name} ${student.last_name} ${student.last_name}, ${student.first_name} ${student.student_id_number || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <>
    <PageHeader title="Evaluate Students" breadcrumb="Faculty Portal" />
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6 text-sage-900">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div><h2 className="text-base font-bold font-display">Student evaluation roster</h2><p className="text-xs text-sage-500 mt-1">Review academic concerns and record advising for a specific grading term.</p></div>
        <Link className={secondaryButton} to={`/faculty/evaluatedstudents?${new URLSearchParams({ class: classId, term, period: selectedClass?.term_id || 'all' })}`}><ClipboardCheck className="h-4 w-4" />Evaluated Students<ArrowRight className="h-4 w-4" /></Link>
      </div>

      <RiskEducationNote variant="evaluationRoster" />

      <section className="rounded-2xl border border-sage-200 bg-white shadow-2xs overflow-hidden" aria-label="Evaluation context">
        <div className="flex items-center gap-2 border-b border-sage-100 px-4 py-4 sm:px-6"><BookOpen className="h-4 w-4 text-sage-600" /><h3 className="text-sm font-bold">Class & grading term</h3></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 sm:p-6">
          <label className="md:col-span-2 text-xs font-semibold text-sage-700">Class<select className={`${field} block mt-2`} value={classId} onChange={e => changeFilter('class', e.target.value)}>{!classes.length && <option value="">No classes assigned</option>}{classes.map(item => <option key={item.class_record_id} value={item.class_record_id}>{item.subjects?.code} · {item.sections?.name} · {item.school_year} · {item.semester}</option>)}</select></label>
          <label className="text-xs font-semibold text-sage-700">Grading term<select className={`${field} block mt-2`} value={term} onChange={e => changeFilter('term', e.target.value)}><option value="">All grading terms</option>{termOptions.map(item => <option key={item}>{item}</option>)}</select></label>
        </div>
        <div className="border-t border-sage-100 bg-sage-50/50 px-4 py-4 sm:px-6 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-sage-600">
          <span className="font-semibold text-sage-800">{selectedClass?.subjects?.name || 'Select an assigned class'}</span><span>{selectedClass?.sections?.name || 'No section'} · {selectedClass?.school_year || '—'} · {selectedClass?.semester || '—'}</span>{selectedClass && selectedClass.status !== 'active' && <span className="font-semibold">Read-only class</span>}
        </div>
      </section>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[[Users, 'Enrolled students', loading ? '—' : students.length, 'Full class roster'], [ClipboardCheck, 'Needs evaluation', loading || !term ? '—' : needsCount, term ? `Moderate or higher risk · ${term}` : 'All grading terms'], [CheckCircle2, 'Evaluations recorded', loading || !term ? '—' : coveredCount, term ? `Includes drafts · ${term}` : 'All grading terms']].map(([Icon, label, count, detail]) => <div key={label} className="flex items-start justify-between gap-4 rounded-xl border border-sage-200 bg-white p-4 shadow-2xs"><div><p className="text-xs font-semibold text-sage-600">{label}</p><p className="mt-2 text-2xl font-mono font-bold">{count}</p><p className="mt-2 text-xs text-sage-500">{detail}</p></div><div className="rounded-lg bg-sage-50 p-2 text-sage-600"><Icon className="h-5 w-5" /></div></div>)}
      </div>

      {!term && <div className="flex items-start gap-2 rounded-xl border border-sage-200 bg-sage-50 p-4 text-xs text-sage-700"><Info className="h-4 w-4 shrink-0 mt-0.5" /><div><p className="font-bold">Choose a grading term to start evaluating</p><p className="mt-1">You can browse the roster now. Evaluation actions become available after selecting a term above.</p></div></div>}
      {error && <p role="alert" className="border border-sage-400 bg-white p-4 rounded-xl text-sm">{error}</p>}

      <section className="rounded-2xl border border-sage-200 bg-white shadow-2xs overflow-hidden" aria-label="Student roster">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 sm:px-6 border-b border-sage-100">
          <div className="flex flex-wrap gap-2" aria-label="Roster view">
            {[[false, 'Full roster', students.length], [true, 'Needs evaluation', term ? needsCount : '—']].map(([isNeeds, label, count]) => <button key={label} type="button" aria-pressed={needsOnly === isNeeds} onClick={() => changeFilter('view', isNeeds ? 'needs-evaluation' : 'all')} className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-sage-600 ${needsOnly === isNeeds ? 'bg-sage-800 text-white' : 'bg-sage-50 text-sage-600 hover:bg-sage-100'}`}>{label}<span className={`rounded px-2 py-0.5 font-mono ${needsOnly === isNeeds ? 'bg-sage-700' : 'bg-sage-100'}`}>{loading ? '—' : count}</span></button>)}
          </div>
          <div className="flex items-center gap-2"><div className="relative flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-sage-400" /><input aria-label="Search students" value={search} onChange={e => setSearch(e.target.value)} placeholder="Name or student number" className={`${field} pl-10 lg:w-64`} /></div><button type="button" className={secondaryButton} disabled={loading} onClick={() => setRefresh(value => value + 1)} aria-label="Refresh roster"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">Refresh</span></button></div>
        </div>
        {loading ? <div role="status" className="flex items-center justify-center gap-2 p-12 text-sm text-sage-500"><RefreshCw className="h-4 w-4 animate-spin" />Calculating risk roster…</div> : !visible.length ? <div className="p-12 text-center"><Users className="h-8 w-8 mx-auto text-sage-300" /><p className="mt-4 text-sm font-semibold">{needsOnly && !term ? 'All grading terms' : search ? 'No matching students' : 'No students in this view'}</p><p className="mt-2 text-xs text-sage-500">{needsOnly && !term ? 'Choose a term above to identify unevaluated concerns.' : search ? 'Try another name or student number.' : needsOnly ? 'No moderate-or-higher-risk students need an evaluation for this term.' : 'Enrolled students will appear here.'}</p></div> : <div className="overflow-x-auto table-container">
          <table className="w-full text-left text-xs"><thead className="bg-sage-50/70 text-sage-500"><tr>{['Student', 'Current risk', 'Subject standing', 'Absences', 'Evaluation'].map(title => <th key={title} className="px-4 py-4 sm:px-6 font-semibold whitespace-nowrap">{title}</th>)}</tr></thead><tbody className="divide-y divide-sage-100">{visible.map(student => {
            const existing = evaluations.find(item => item.student_id === student.user_id);
            const restoring = restoringStudentId === student.user_id;
            // A recorded follow-up closes this subject-and-term case; re-evaluation happens in a later term.
            const closed = Boolean(existing?.followup_recorded_at);
            const disabled = !term || selectedClass?.status !== 'active' || restoring || closed;
            return <tr key={student.user_id} className="hover:bg-sage-50/40 transition-colors"><td className="px-4 py-4 sm:px-6"><div className="flex items-center gap-3"><div className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sage-100 bg-sage-50 text-xs font-bold text-sage-600" aria-hidden="true">{student.first_name?.[0]}{student.last_name?.[0]}</div><div><p className="font-bold text-sm whitespace-nowrap">{student.last_name}, {student.first_name}</p><p className="font-mono text-sage-500 mt-1">{student.student_id_number}</p><EnrollmentTypeBadge enrollmentType={student.enrollment_type} /></div></div></td><td className="px-4 py-4 sm:px-6"><span className={`inline-flex rounded-md border px-2 py-1 text-xs font-semibold capitalize ${student.risk_level === 'critical' || student.risk_level === 'high' ? 'bg-rose-50 text-rose-700 border-rose-200' : student.risk_level === 'moderate' ? 'bg-amber-50 text-amber-700 border-amber-200' : student.risk_level === 'low' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-sage-50 text-sage-700 border-sage-200'}`}>{student.risk_level}</span><p className="font-mono text-sage-500 mt-2">{student.risk_score} pts</p></td><td className="px-4 py-4 sm:px-6"><p className="font-mono text-sm font-semibold">{student.current_gwa == null ? 'Pending' : Number(student.current_gwa).toFixed(2)}</p><p className="text-sage-500 mt-1 whitespace-nowrap">{student.standing_source} · {student.standing_milestone || 'No milestone'}</p></td><td className="px-4 py-4 sm:px-6 font-mono text-sm">{student.absences}</td><td className="px-4 py-4 sm:px-6"><button type="button" disabled={disabled} title={!term ? 'Select a grading term first' : selectedClass?.status !== 'active' ? 'Inactive class is read-only' : restoring ? 'Restoring saved draft' : closed ? 'The follow-up for this term is recorded. Select a later grading term to evaluate again.' : undefined} onClick={() => beginEvaluation(student, existing)} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-sage-600 ${disabled ? 'bg-sage-50 text-sage-300 border border-sage-100 cursor-not-allowed' : existing ? `${secondaryButton}` : 'bg-sage-800 text-white hover:bg-sage-700 cursor-pointer'}`}>{restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}{restoring ? 'Restoring…' : closed ? 'Closed' : existing ? 'Review / edit' : 'Evaluate'}</button><p className="mt-2 text-xs text-sage-500">{!term ? 'Choose a term above' : selectedClass?.status !== 'active' ? 'Read-only class' : closed ? 'Follow-up recorded · evaluate again in a later term' : existing ? existing.status : 'Not evaluated'}</p></td></tr>;
          })}</tbody></table>
        </div>}
        {!loading && !!visible.length && <div className="border-t border-sage-100 px-4 py-4 sm:px-6 text-xs text-sage-500">Showing <span className="font-mono font-semibold text-sage-700">{visible.length}</span> of <span className="font-mono">{roster.length}</span> students{term ? ` · ${term}` : ''}</div>}
      </section>
    </div>
    {generationCandidate && <div className="fixed inset-0 z-50 flex items-center justify-center bg-sage-950/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="generate-title" className="w-full max-w-lg rounded-2xl border border-sage-200 bg-white p-5 text-sage-900 shadow-xl">
        <div className="flex items-start justify-between gap-4"><div><h2 id="generate-title" className="font-display text-lg font-bold">Generate intervention draft?</h2><p className="mt-1 text-xs text-sage-500">AI suggestions are saved as drafts for faculty review but are not published automatically.</p></div><button type="button" disabled={generating} onClick={() => setGenerationCandidate(null)} aria-label="Cancel generation" className="rounded-lg p-2 text-sage-500 hover:bg-sage-100 disabled:opacity-50"><X className="h-4 w-4" /></button></div>
        <div className="mt-4 rounded-xl border border-sage-200 bg-sage-50 p-4 text-sm"><p className="font-bold">{generationCandidate.first_name} {generationCandidate.last_name}</p><p className="mt-1 text-xs text-sage-600">{selectedClass?.subjects?.code} · {selectedClass?.sections?.name} · {term}</p></div>
        <p className="mt-4 text-sm text-sage-700">The system will securely analyze this subject's grades, saved tentative activities, exam and character results, attendance, and academic-risk evidence. Names, email addresses, private notes, and referral reasons are excluded from the AI prompt.</p>
        {generating && <p role="status" className="mt-4 flex items-center gap-2 rounded-lg bg-sage-100 p-3 text-sm"><Loader2 className="h-4 w-4 animate-spin" />{generationSlow ? 'This is taking a little longer than usual. We’re still preparing the draft—please keep this window open.' : 'Preparing three suggested intervention tasks…'}</p>}
        {generationError && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{generationError}</p>}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={generating} onClick={() => setGenerationCandidate(null)} className={secondaryButton}>Cancel</button>
          {generationError && <button type="button" disabled={generating} onClick={continueManually} className={secondaryButton}>Continue manually</button>}
          <button type="button" disabled={generating} onClick={generateDraft} className="inline-flex items-center justify-center gap-2 rounded-lg bg-sage-800 px-4 py-2 text-xs font-semibold text-white hover:bg-sage-700 disabled:opacity-50">{generating && <Loader2 className="h-4 w-4 animate-spin" />}{generationError ? 'Retry generation' : 'Generate Draft'}</button>
        </div>
      </div>
    </div>}
    {selectedStudent && <StudentRiskEvaluationModal key={`${selectedStudent.user_id}:${term}`} isOpen onClose={() => setSelectedStudent(null)} student={selectedStudent} initialDraft={selectedStudent.interventionDraft} classRecordId={classId} currentTerm={term} subjectCode={selectedClass?.subjects?.code || ''} subjectName={selectedClass?.subjects?.name || ''} onEvaluationSaved={() => setRefresh(value => value + 1)} />}
  </>;
}
