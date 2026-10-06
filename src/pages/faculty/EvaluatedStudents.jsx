import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ChevronDown, ChevronUp, RefreshCw, Send, X } from 'lucide-react';
import PageHeader from '../../components/layout/PageHeader';
import { useAuth } from '../../lib/AuthContext';
import { CASE_PAGE_SIZE, getEvaluatedCases, getEvaluationClasses, getReferralHistory, referEvaluation } from '../../lib/evaluationService';
import { getTermsForPeriod, referralEligibility, taskState } from '../../lib/evaluationTracking';

const field = 'rounded-lg border border-sage-200 bg-sage-50 px-3 py-2 text-sm text-sage-900 focus:ring-2 focus:ring-sage-400';
const action = 'rounded-lg border border-sage-200 px-3 py-2 text-sm font-semibold text-sage-700 hover:bg-sage-100 disabled:opacity-50';
const dateText = value => value ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : 'Unknown';
const gradeText = value => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value))
  ? Number(value).toFixed(2) : 'Pending';

export default function EvaluatedStudents() {
  const { user } = useAuth();
  return user?.id ? <Tracker key={user.id} facultyId={user.id} /> : null;
}

function Tracker({ facultyId }) {
  const [params, setParams] = useSearchParams();
  const [metadata, setMetadata] = useState(null);
  const [result, setResult] = useState({ cases: [], count: 0, standings: {} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [historyDetails, setHistoryDetails] = useState({});
  const [referralCase, setReferralCase] = useState(null);
  const [reason, setReason] = useState('');
  const [referralError, setReferralError] = useState('');
  const [sending, setSending] = useState(false);
  const requestId = useRef(null);
  const referralTrigger = useRef(null);
  const [refresh, setRefresh] = useState(0);
  const [searchText, setSearchText] = useState(params.get('search') || '');
  const queryKey = params.toString();
  const filters = {
    history: params.get('scope') === 'history', periodId: params.get('period') || '',
    classId: params.get('class') || '', term: params.get('term') || '',
    referral: params.get('referral') || '', search: params.get('search') || '',
    page: Math.max(0, Number.parseInt(params.get('page') || '0', 10) || 0)
  };
  
  const selectedPeriod = metadata?.periods.find(item => item.term_id === (filters.periodId || metadata?.periods.find(p => p.is_active)?.term_id));
  const termOptions = getTermsForPeriod(selectedPeriod?.semester);

  function changeFilter(key, value) {
    const next = new URLSearchParams(params);
    value ? next.set(key, value) : next.delete(key);
    if (key !== 'page') next.delete('page');
    if (key === 'scope') { next.delete('class'); next.set('period', 'all'); }
    setParams(next, { replace: true });
    setExpanded(null);
  }

  function closeReferral() {
    if (sending) return;
    setReferralCase(null);
    referralTrigger.current?.focus();
  }

  function dialogKeys(event) {
    if (event.key === 'Escape') { event.preventDefault(); closeReferral(); }
    if (event.key !== 'Tab') return;
    const controls = event.currentTarget.querySelectorAll('button:not(:disabled), textarea:not(:disabled)');
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }

  useEffect(() => {
    let cancelled = false;
    getEvaluationClasses(facultyId).then(data => {
      if (!cancelled) setMetadata(data);
    }).catch(err => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [facultyId, refresh]);

  useEffect(() => {
    if (!metadata) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    const period = filters.periodId === 'all' ? '' : filters.periodId || metadata.periods.find(item => item.is_active)?.term_id || '';
    getEvaluatedCases({ ...filters, periodId: period, facultyId,
      classIds: metadata.classes.map(item => item.class_record_id) }).then(data => {
      if (!cancelled) { setResult(data); setLoading(false); }
    }).catch(err => { if (!cancelled) { setError(err.message); setResult({ cases: [], count: 0, standings: {} }); setLoading(false); } });
    return () => { cancelled = true; };
    // queryKey includes every server filter, including pagination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facultyId, metadata, queryKey]);

  useEffect(() => {
    const onFocus = () => setRefresh(value => value + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    if (!expanded) return;
    let cancelled = false;
    setHistoryDetails(previous => ({ ...previous, [expanded]: { loading: true, records: [] } }));
    getReferralHistory(expanded).then(records => {
      if (!cancelled) setHistoryDetails(previous => ({ ...previous, [expanded]: { loading: false, records } }));
    }).catch(err => {
      if (!cancelled) setHistoryDetails(previous => ({ ...previous, [expanded]: { loading: false, records: [], error: err.message } }));
    });
    return () => { cancelled = true; };
  }, [expanded, refresh]);

  async function submitReferral(event) {
    event.preventDefault();
    if (sending || !referralCase) return;
    setSending(true);
    setReferralError('');
    try {
      const saved = await referEvaluation(referralCase.evaluation_id, reason, requestId.current);
      setResult(previous => ({ ...previous, cases: previous.cases.map(item => item.evaluation_id === saved.evaluation_id
        ? { ...item, refer_to_dean: saved.refer_to_dean, referrals: [...(item.referrals || []).filter(r => r.referral_id !== saved.referral.referral_id), saved.referral] } : item) }));
      setNotice(saved.referral.state === 'resolved' ? 'This request was already resolved; it did not reopen the case.'
        : saved.referral.legacy ? 'The existing legacy referral is pending. No duplicate notification was sent.'
          : 'Referral saved in-app for the responsible Dean. External delivery follows the notification pipeline.');
      setReferralCase(null);
      referralTrigger.current?.focus();
      setRefresh(value => value + 1);
    } catch (err) { setReferralError(err.message || 'Referral could not be saved. Retry with the same request.'); }
    finally { setSending(false); }
  }

  return <>
    <PageHeader title="Evaluated Students" breadcrumb="Faculty Portal" />
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 text-sage-900">
      <div className="flex flex-wrap justify-between gap-3">
        <p className="text-sm">Track each evaluation by subject and term. Task completion is reported by the student.</p>
        <Link className={action} to={`/faculty/evaluatestudent?${new URLSearchParams({ class: filters.classId, term: filters.term })}`}>Evaluate Students</Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 rounded-xl border border-sage-200 bg-sage-50 p-4">
        <label className="text-xs font-semibold">Ownership<select className={`${field} block w-full mt-1`} value={filters.history ? 'history' : 'current'} onChange={e => changeFilter('scope', e.target.value)}><option value="current">Currently assigned classes</option><option value="history">Authored history (read-only)</option></select></label>
        <label className="text-xs font-semibold">Academic period<select className={`${field} block w-full mt-1`} value={filters.periodId || metadata?.periods.find(item => item.is_active)?.term_id || 'all'} onChange={e => changeFilter('period', e.target.value)}><option value="all">All academic periods</option>{metadata?.periods.map(item => <option key={item.term_id} value={item.term_id}>{item.school_year} · {item.semester}{item.is_active ? ' (active)' : ' (Archive)'}</option>)}</select></label>
        <label className="text-xs font-semibold">Class<select className={`${field} block w-full mt-1`} value={filters.classId} onChange={e => changeFilter('class', e.target.value)}><option value="">All allowed classes</option>{metadata?.classes.map(item => <option key={item.class_record_id} value={item.class_record_id}>{item.subjects?.code} · {item.sections?.name} · {item.school_year}</option>)}</select></label>
        <label className="text-xs font-semibold">Grading term<select className={`${field} block w-full mt-1`} value={filters.term} onChange={e => changeFilter('term', e.target.value)}><option value="">All Terms</option>{termOptions.map(term => <option key={term}>{term}</option>)}</select></label>
        <label className="text-xs font-semibold">Referral<select className={`${field} block w-full mt-1`} value={filters.referral} onChange={e => changeFilter('referral', e.target.value)}><option value="">All cases</option><option value="pending">Pending Dean referral</option><option value="none">No active referral</option></select></label>
        <form className="flex items-end gap-2" onSubmit={e => { e.preventDefault(); changeFilter('search', searchText); }}><label className="text-xs font-semibold flex-1">Student search<input className={`${field} block w-full mt-1`} value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Name or student number" maxLength={100} /></label><button className={action}>Search</button></form>
      </div>
      <div className="flex justify-between items-center"><p className="text-sm font-mono">{result.count} cases</p><button className={action} disabled={loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw className="inline h-4 w-4 mr-2" />Refresh</button></div>
      {notice && <p role="status" className="rounded-lg bg-sage-100 p-3 text-sm">{notice}</p>}
      {error && <p role="alert" className="rounded-lg border border-sage-400 p-3 text-sm">{error}</p>}
      {loading ? <p role="status">Loading evaluations and current subject standings…</p> : !result.cases.length ? <p className="p-6 rounded-xl border border-sage-200">No evaluations match these filters.</p> : result.cases.map(item => {
        const tasks = Array.isArray(item.advising_plan) ? item.advising_plan : [];
        const complete = tasks.filter(task => task.completed === true).length;
        const standing = result.standings[item.class_record_id]?.[item.student_id];
        const unavailable = referralEligibility(item, item.class_record, facultyId, filters.history);
        const open = expanded === item.evaluation_id;
        const history = historyDetails[item.evaluation_id];
        return <article key={item.evaluation_id} className="rounded-xl border border-sage-200 bg-sage-50 overflow-hidden">
          <div className="p-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><h2 className="font-display font-semibold">{item.student?.last_name}, {item.student?.first_name}</h2><p className="text-xs font-mono">{item.student?.user_number}</p><p className="text-sm mt-2">{item.class_record?.subjects?.code} · {item.class_record?.sections?.name}</p><p className="text-xs">{item.class_record?.school_year} · {item.class_record?.semester} · {item.term}</p><p className="text-xs mt-1">Evaluation: {dateText(item.baseline_snapshot?.captured_at || item.created_at)} · {item.status}</p></div>
            <div><h3 className="text-xs font-semibold uppercase">At evaluation</h3><p className="text-sm font-semibold capitalize"><span className={item.risk_level === 'critical' || item.risk_level === 'high' ? 'text-rose-600' : item.risk_level === 'moderate' ? 'text-amber-600' : item.risk_level === 'low' ? 'text-emerald-600' : ''}>{item.risk_level}</span><span className="font-normal text-sage-900"> · {item.risk_score} pts</span></p><p className="font-mono text-sm mt-1">Baseline GWA: {gradeText(item.baseline_snapshot?.gwa)}</p><p className="text-xs">{item.baseline_snapshot?.term || item.term} · {dateText(item.baseline_snapshot?.captured_at)}</p></div>
            <div><h3 className="text-xs font-semibold uppercase">Current subject standing</h3><p className="font-mono">{gradeText(standing?.current_gwa)}</p><p className="text-xs">{standing?.standing_source || 'Pending'} · {standing?.standing_milestone || 'No available milestone'}</p><p className="text-xs mt-2">Reported tasks: {complete}/{tasks.length}</p><p className="text-xs">{item.refer_to_dean ? 'Pending Dean referral' : item.referrals?.some(r => r.state === 'resolved') ? 'Previous referral resolved' : 'No active referral'}</p></div>
            <div className="flex flex-col gap-2 justify-start"><button className={action} aria-expanded={open} aria-controls={`case-${item.evaluation_id}`} onClick={() => setExpanded(open ? null : item.evaluation_id)}>{open ? <ChevronUp className="inline h-4 w-4" /> : <ChevronDown className="inline h-4 w-4" />} Tasks and referrals</button><button className={action} disabled={Boolean(unavailable)} onClick={event => { referralTrigger.current = event.currentTarget; setReferralCase(item); setReason(''); setReferralError(''); requestId.current = crypto.randomUUID(); }}><Send className="inline h-4 w-4 mr-1" />{unavailable || 'Escalate to Dean'}</button></div>
          </div>
          {open && <div id={`case-${item.evaluation_id}`} className="border-t border-sage-200 p-4 space-y-3">
            <h3 className="font-semibold text-sm">Student-reported tasks</h3>
            {!tasks.length && <p className="text-sm">No tasks assigned</p>}
            {tasks.map((task, index) => <div key={task.task_id || index} className="rounded-lg bg-sage-100 p-3 text-sm"><p>{task.description}</p><p className="text-xs mt-1">Target: {task.target_term || 'Not specified'} · Due: {task.due_date || 'No deadline'} · {taskState(task)}</p>{task.completed === true && <p className="text-xs"><CheckCircle2 className="inline h-3 w-3" /> Reported at: {dateText(task.completed_at)}</p>}</div>)}
            <h3 className="font-semibold text-sm">Referral history</h3>
            {history?.loading && <p role="status" className="text-sm">Loading authorized referral details…</p>}
            {history?.error && <p role="alert" className="text-sm">{history.error}</p>}
            {history && !history.loading && !history.error && !history.records.length && <p className="text-sm">No recorded referral event; a clear flag alone does not prove previous resolution.</p>}
            {history?.records.map(r => <div key={r.referral_id} className="text-sm border border-sage-200 rounded-lg p-3"><p>{r.state} · {r.legacy ? 'Legacy referral: actor, time, and reason unknown' : dateText(r.referred_at)}</p><p>{r.reason || 'Reason unknown'}</p>{r.last_review_note && <p>Latest restricted review: {r.last_review_note} · {dateText(r.last_reviewed_at)}</p>}{r.state === 'resolved' && <p>Resolved: {dateText(r.resolved_at)} · {r.resolution_note || 'No note'}</p>}</div>)}
          </div>}
        </article>;
      })}
      <div className="flex items-center justify-end gap-3"><button className={action} disabled={loading || filters.page === 0} onClick={() => changeFilter('page', String(filters.page - 1))}>Previous</button><span className="text-sm">Page {filters.page + 1}</span><button className={action} disabled={loading || (filters.page + 1) * CASE_PAGE_SIZE >= result.count} onClick={() => changeFilter('page', String(filters.page + 1))}>Next</button></div>
    </div>
    {referralCase && <div className="fixed inset-0 z-50 bg-sage-950/60 p-4 flex items-center justify-center">
      <form onSubmit={submitReferral} onKeyDown={dialogKeys} role="dialog" aria-modal="true" aria-labelledby="referral-title" className="rounded-xl bg-sage-50 border border-sage-200 p-5 w-full max-w-lg max-h-full overflow-y-auto space-y-4 text-sage-900">
        <div className="flex justify-between"><h2 id="referral-title" className="font-display font-semibold">Escalate to Dean</h2><button type="button" className={action} aria-label="Close referral" disabled={sending} onClick={closeReferral}><X className="h-4 w-4" /></button></div>
        <p className="text-sm">{referralCase.student?.first_name} {referralCase.student?.last_name} · {referralCase.class_record?.subjects?.code} · {referralCase.class_record?.sections?.name} · {referralCase.term}</p>
        <ul className="text-xs space-y-1">{(Array.isArray(referralCase.advising_plan) ? referralCase.advising_plan : []).map(task => <li key={task.task_id}>{task.description} · {taskState(task)} · {task.due_date || 'No deadline'}</li>)}</ul>
        {!referralCase.advising_plan?.length && <p className="text-xs">No tasks assigned</p>}
        <label className="block text-sm">Reason for Dean review<textarea autoFocus required maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} className={`${field} block w-full mt-1 min-h-28`} /></label>
        <p className="text-xs">The reason is restricted to authorized faculty, department Deans, and admins. Reported completion does not establish instructor verification.</p>
        {referralError && <p role="alert" className="text-sm">{referralError}</p>}
        <button className={`${action} w-full`} disabled={sending || !reason.trim()}>{sending ? 'Saving…' : 'Save referral'}</button>
      </form>
    </div>}
  </>;
}
