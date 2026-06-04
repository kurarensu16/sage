import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { cn } from '../../lib/utils';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import { logActivity } from '../../lib/auditLog';
import {
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Lock,
  Unlock,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
  Loader2
} from 'lucide-react';

const REMARK_COLORS = {
  Passed:  'text-emerald-700 bg-emerald-50 border-emerald-300',
  Failed:  'text-rose-700 bg-rose-50 border-rose-300',
  INC:     'text-rose-700 bg-rose-50 border-rose-300',
  FDA:     'text-rose-700 bg-rose-50 border-rose-300',
  Dropped: 'text-rose-700 bg-rose-50 border-rose-300',
};

// Capitalise first letter, lowercase rest; map db enum values to display labels
function displayRemark(r) {
  if (!r) return '—';
  const map = { passed: 'Passed', failed: 'Failed', incomplete: 'INC', fda: 'FDA', dropped: 'Dropped' };
  return map[r.toLowerCase()] || (r.charAt(0).toUpperCase() + r.slice(1));
}

export default function RemarkOverrideRequests() {
  const { user, profile } = useAuth();

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [rejectNote, setRejectNote] = useState({});
  const [actionLoading, setActionLoading] = useState(null); // request_id being processed
  const [refreshKey, setRefreshKey] = useState(0); // increment to trigger re-fetch

  // ── Fetch from Supabase ─────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function fetchRequests() {
      if (!cancelled) setLoading(true);
      if (!cancelled) setError(null);
      try {
        const { data, error: fetchErr } = await supabase
          .from('remark_override_requests')
          .select(`
            request_id,
            class_record_id,
            student_id,
            requested_by,
            requested_at,
            subject_name,
            section_name,
            faculty_name,
            computed_grade,
            effective_grade,
            current_remark,
            requested_remark,
            note,
            status,
            resolved_by,
            resolved_at,
            dean_note,
            student:users!remark_override_requests_student_id_fkey (
              first_name,
              last_name
            )
          `)
          .order('requested_at', { ascending: false });

        if (fetchErr) throw fetchErr;

        const mapped = (data || []).map(r => ({
          id: r.request_id,
          classCode: r.class_record_id,
          subjectName: r.subject_name || '—',
          facultyName: r.faculty_name || '—',
          section: r.section_name || '—',
          studentId: r.student_id,
          studentName: r.student
            ? `${r.student.last_name}, ${r.student.first_name}`
            : '—',
          computedGrade: r.computed_grade != null ? parseFloat(r.computed_grade).toFixed(2) : '—',
          effectiveGrade: r.effective_grade != null ? parseFloat(r.effective_grade).toFixed(2) : '—',
          currentRemark: displayRemark(r.current_remark),
          requestedRemark: displayRemark(r.requested_remark),
          note: r.note,
          requestedAt: r.requested_at,
          status: r.status,
          resolvedAt: r.resolved_at,
          deanNote: r.dean_note || '',
        }));

        if (!cancelled) setRequests(mapped);
      } catch (err) {
        console.warn('Could not fetch from DB, using localStorage fallback:', err.message);
        const ls = JSON.parse(localStorage.getItem('remark_override_requests') || '[]');
        if (!cancelled) {
          setRequests(ls.map(r => ({
            ...r,
            currentRemark: r.currentRemark || displayRemark(r.current_remark),
            requestedRemark: r.requestedRemark || displayRemark(r.requested_remark),
          })));
          setError('Live database unavailable. Showing cached data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchRequests();
    return () => { cancelled = true; };
  }, [refreshKey]);

  // ── Approve ─────────────────────────────────────────────────────────────────
  const handleApprove = async (req) => {
    setActionLoading(req.id);
    try {
      const resolvedAt = new Date().toISOString();
      const actorName = profile ? `${profile.first_name} ${profile.last_name}` : 'Dean';

      // 1. Update remark_override_requests status
      const { error: rorErr } = await supabase
        .from('remark_override_requests')
        .update({ status: 'approved', resolved_by: user.id, resolved_at: resolvedAt })
        .eq('request_id', req.id);

      if (rorErr) throw rorErr;

      // 2. Approve matching Semestral Grade unlock_request for this class
      await supabase
        .from('unlock_requests')
        .update({ status: 'approved', resolved_by: user.id, resolved_at: resolvedAt })
        .eq('class_record_id', req.classCode)
        .eq('milestone', 'Semestral Grade')
        .eq('status', 'pending');

      // 3. Unlock posted_grades for the Final period in this class
      await supabase
        .from('posted_grades')
        .update({ is_locked: false })
        .eq('class_record_id', req.classCode)
        .eq('grade_period', 'final');

      // 4. Audit log
      await logActivity(
        'Remark Override Approved',
        `Dean approved remark override for student ${req.studentName} (${req.currentRemark} → ${req.requestedRemark}) in ${req.subjectName}`,
        actorName
      );

      // 5. Mirror to localStorage
      const all = JSON.parse(localStorage.getItem('remark_override_requests') || '[]');
      const updated = all.map(r => r.id === req.id ? { ...r, status: 'approved', resolvedAt } : r);
      localStorage.setItem('remark_override_requests', JSON.stringify(updated));

      setRefreshKey(k => k + 1);
    } catch (err) {
      console.error('Error approving request:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Reject ──────────────────────────────────────────────────────────────────
  const handleReject = async (req) => {
    setActionLoading(req.id);
    try {
      const resolvedAt = new Date().toISOString();
      const dNote = rejectNote[req.id] || '';
      const actorName = profile ? `${profile.first_name} ${profile.last_name}` : 'Dean';

      // 1. Update remark_override_requests status
      const { error: rorErr } = await supabase
        .from('remark_override_requests')
        .update({ status: 'rejected', resolved_by: user.id, resolved_at: resolvedAt, dean_note: dNote })
        .eq('request_id', req.id);

      if (rorErr) throw rorErr;

      // 2. Reject matching Semestral Grade unlock_request for this class
      await supabase
        .from('unlock_requests')
        .update({ status: 'rejected', resolved_by: user.id, resolved_at: resolvedAt })
        .eq('class_record_id', req.classCode)
        .eq('milestone', 'Semestral Grade')
        .eq('status', 'pending');

      // 3. Audit log
      await logActivity(
        'Remark Override Rejected',
        `Dean rejected remark override for student ${req.studentName} (${req.currentRemark} → ${req.requestedRemark}) in ${req.subjectName}. Reason: ${dNote || 'None'}`,
        actorName
      );

      // 4. Mirror to localStorage
      const all = JSON.parse(localStorage.getItem('remark_override_requests') || '[]');
      const updated = all.map(r => r.id === req.id ? { ...r, status: 'rejected', resolvedAt, deanNote: dNote } : r);
      localStorage.setItem('remark_override_requests', JSON.stringify(updated));

      setRefreshKey(k => k + 1);
    } catch (err) {
      console.error('Error rejecting request:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Filtering ────────────────────────────────────────────────────────────────
  const filtered = requests.filter(r => {
    const matchStatus = !statusFilter || r.status === statusFilter;
    const term = searchTerm.toLowerCase();
    const matchSearch =
      (r.studentName || '').toLowerCase().includes(term) ||
      (r.facultyName || '').toLowerCase().includes(term) ||
      (r.classCode || '').toLowerCase().includes(term) ||
      (r.section || '').toLowerCase().includes(term) ||
      (r.subjectName || '').toLowerCase().includes(term);
    return matchStatus && matchSearch;
  });

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  const statusBadge = (status) => {
    if (status === 'pending')  return 'bg-amber-50 text-amber-700 border border-amber-300';
    if (status === 'approved') return 'bg-emerald-50 text-emerald-700 border border-emerald-300';
    if (status === 'rejected') return 'bg-rose-50 text-rose-700 border border-rose-300';
    return '';
  };

  const formatDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-PH', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <>
      <PageHeader title="Remark Override Requests" breadcrumb="Dean Portal" />

      <div className="p-8 overflow-y-auto flex-1 space-y-6">

        {/* ── Info Banner ── */}
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800 shadow-sm">
          <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-500" />
          <div>
            <p className="font-semibold">About Remark Override Requests</p>
            <p className="text-xs text-blue-600 mt-0.5">
              When faculty need to change a posted student's remark (e.g. <strong>Failed → INC</strong> or <strong>Failed → Passed (grace)</strong>),
              they must submit a request here. Approving unlocks that student's grade row for one edit.
              The row re-locks automatically after the faculty saves the change.
            </p>
          </div>
        </div>

        {/* ── Error Banner ── */}
        {error && (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-xs text-amber-800">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Pending Review', value: requests.filter(r => r.status === 'pending').length, color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200' },
            { label: 'Approved', value: requests.filter(r => r.status === 'approved').length, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
            { label: 'Rejected', value: requests.filter(r => r.status === 'rejected').length, color: 'text-rose-600', bg: 'bg-rose-50 border-rose-200' },
          ].map(s => (
            <div key={s.label} className={cn('rounded-xl border p-4 shadow-sm flex items-center gap-3', s.bg)}>
              <span className={cn('text-2xl font-extrabold font-mono', s.color)}>{s.value}</span>
              <span className="text-xs font-semibold text-slate-600">{s.label}</span>
            </div>
          ))}
        </div>

        {/* ── Toolbar ── */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search student, faculty, class code…"
              className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-xs outline-none focus:border-sage-500 bg-slate-50/30 focus:bg-white transition-colors"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            {['pending', 'approved', 'rejected', ''].map(s => (
              <button
                key={s || 'all'}
                onClick={() => setStatusFilter(s)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all',
                  statusFilter === s
                    ? 'bg-sage-700 text-white border-sage-700 shadow-sm'
                    : 'bg-white text-slate-500 border-slate-200 hover:border-sage-300 hover:text-sage-700'
                )}
              >
                {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All'}
                {s === 'pending' && pendingCount > 0 && (
                  <span className="ml-1 bg-amber-400 text-white rounded-full px-1 text-[9px]">{pendingCount}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white border border-slate-200 rounded-xl p-5 animate-pulse">
                <div className="flex gap-4 items-center">
                  <div className="h-5 w-16 bg-slate-200 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-48 bg-slate-200 rounded" />
                    <div className="h-2.5 w-64 bg-slate-100 rounded" />
                  </div>
                  <div className="h-3 w-20 bg-slate-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Requests list ── */}
        {!loading && (
          <div className="space-y-3">
            {filtered.length === 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-slate-400 text-sm shadow-sm">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                No remark override requests found.
              </div>
            )}

            {filtered.map(req => {
              const isExpanded = expandedId === req.id;
              const isGracePass = req.requestedRemark === 'Passed' && parseFloat(req.computedGrade) > 3.00;
              const isActioning = actionLoading === req.id;

              return (
                <div
                  key={req.id}
                  className={cn(
                    'bg-white border rounded-xl shadow-sm overflow-hidden transition-all',
                    req.status === 'pending' ? 'border-amber-200' : 'border-slate-200'
                  )}
                >
                  {/* ── Card header row ── */}
                  <div
                    className="flex flex-wrap items-center gap-3 px-5 py-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : req.id)}
                  >
                    <span className={cn(
                      'inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border capitalize',
                      statusBadge(req.status)
                    )}>
                      {req.status}
                    </span>

                    <div className="flex-1 min-w-[180px]">
                      <p className="text-sm font-bold text-slate-800">{req.studentName}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{req.section} · {req.subjectName}</p>
                    </div>

                    <div className="flex items-center gap-2 text-xs font-bold">
                      <span className={cn('px-2 py-0.5 rounded border text-[10px]', REMARK_COLORS[req.currentRemark] || 'text-slate-700 border-slate-200')}>
                        {req.currentRemark}
                      </span>
                      <span className="text-slate-400">→</span>
                      <span className={cn('px-2 py-0.5 rounded border text-[10px]', REMARK_COLORS[req.requestedRemark] || 'text-slate-700 border-slate-200')}>
                        {req.requestedRemark}
                      </span>
                      {isGracePass && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-violet-50 text-violet-700 border border-violet-200 font-bold">Grace Pass</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[10px] font-mono">
                      <span className="text-rose-600 font-bold">{req.computedGrade}</span>
                      <span className="text-slate-300">→</span>
                      <span className={cn('font-bold', parseFloat(req.effectiveGrade) <= 3.00 ? 'text-emerald-600' : 'text-rose-600')}>
                        {req.effectiveGrade}
                      </span>
                    </div>

                    <div className="text-right text-[10px] text-slate-400 hidden sm:block">
                      <p className="font-semibold text-slate-600">{req.facultyName}</p>
                      <p>{formatDate(req.requestedAt)}</p>
                    </div>

                    {isExpanded
                      ? <ChevronUp className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      : <ChevronDown className="h-4 w-4 text-slate-400 flex-shrink-0" />
                    }
                  </div>

                  {/* ── Expanded panel ── */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/40 space-y-4">

                      {/* Faculty note */}
                      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                        <MessageSquare className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mb-0.5">Faculty's Reason</p>
                          <p className="text-xs text-amber-900">{req.note || '— No reason provided —'}</p>
                        </div>
                      </div>

                      {/* Grade breakdown */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                        {[
                          { label: 'Computed Grade', value: req.computedGrade, color: 'text-rose-600' },
                          { label: 'Effective Grade', value: req.effectiveGrade, color: parseFloat(req.effectiveGrade) <= 3.00 ? 'text-emerald-600' : 'text-rose-600' },
                          { label: 'From Remark', value: req.currentRemark, color: '' },
                          { label: 'To Remark', value: req.requestedRemark, color: '' },
                        ].map(item => (
                          <div key={item.label} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{item.label}</p>
                            <p className={cn('text-base font-extrabold font-mono mt-1', item.color || 'text-slate-700')}>{item.value}</p>
                          </div>
                        ))}
                      </div>

                      {/* Grace pass warning */}
                      {isGracePass && (
                        <div className="flex items-start gap-2 bg-violet-50 border border-violet-200 rounded-lg px-4 py-2.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-violet-500 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-violet-700">
                            <strong>Grace Pass detected:</strong> The computed grade is {req.computedGrade} (failing), but the faculty is requesting it be recorded as <strong>Passed</strong> (effective grade: 3.00). Please verify this is justified.
                          </p>
                        </div>
                      )}

                      {/* Action area — only for pending */}
                      {req.status === 'pending' && (
                        <div className="flex flex-col sm:flex-row gap-3 pt-1">
                          <div className="flex-1">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                              Dean's Note (optional, for rejection)
                            </label>
                            <textarea
                              rows={2}
                              value={rejectNote[req.id] || ''}
                              onChange={e => setRejectNote(prev => ({ ...prev, [req.id]: e.target.value }))}
                              placeholder="Reason for rejection…"
                              className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:border-rose-400 focus:ring-1 focus:ring-rose-300 outline-none resize-none bg-white transition-colors"
                            />
                          </div>

                          <div className="flex sm:flex-col gap-2 justify-end sm:justify-start pt-0 sm:pt-5">
                            <button
                              onClick={() => handleApprove(req)}
                              disabled={isActioning}
                              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors outline-none disabled:opacity-60"
                            >
                              {isActioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                              Approve & Unlock
                            </button>
                            <button
                              onClick={() => handleReject(req)}
                              disabled={isActioning}
                              className="flex items-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold rounded-lg transition-colors outline-none disabled:opacity-60"
                            >
                              {isActioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                              Reject
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Resolved badge */}
                      {req.status !== 'pending' && (
                        <div className={cn(
                          'flex items-center gap-2 rounded-lg px-4 py-2.5 text-xs font-semibold border',
                          req.status === 'approved'
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                            : 'bg-rose-50 border-rose-200 text-rose-700'
                        )}>
                          {req.status === 'approved'
                            ? <><Unlock className="h-3.5 w-3.5" /> Grade row unlocked for faculty edit — resolved {formatDate(req.resolvedAt)}</>
                            : <><Lock className="h-3.5 w-3.5" /> Request rejected — {formatDate(req.resolvedAt)}{req.deanNote ? ` · "${req.deanNote}"` : ''}</>
                          }
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
