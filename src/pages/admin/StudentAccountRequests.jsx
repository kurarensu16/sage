import { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import * as XLSX from 'xlsx';
import {
  Download, XCircle, CheckCircle2, Clock, AlertTriangle, Info,
  Loader2, ArrowRight, Inbox
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { toUserMessage } from '../../lib/errorMessages';
import { useAuth } from '../../lib/AuthContext';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { cn } from '../../lib/utils';

const PAGE_SIZE = 1000;

// Admin's side of the Registrar handoff.
//
// This page deliberately CANNOT create accounts. Import Users remains the single
// creation path, because it already validates section against college and active
// term, checks year level against the section, enforces unique ID numbers and
// generates them when blank. A second creator here would be a weaker duplicate
// of all that -- which is exactly the mistake the removed Import Students page
// made.
//
// So the workflow is: review, export in Import Users' own column format with
// Email left blank, create the mailboxes in Outlook, paste the addresses in, and
// upload through Import Users. The RequestID column rides along so each created
// account links back and flips its row to Created automatically.

const EXPORT_HEADERS = [
  'LastName', 'FirstName', 'MiddleName', 'Email', 'Role',
  'College', 'Program', 'Section', 'YearLevel', 'IDNumber', 'RequestID'
];

const STATUS_STYLE = {
  pending: { chip: 'text-amber-700 bg-amber-50 border-amber-200', icon: Clock },
  created: { chip: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  rejected: { chip: 'text-rose-700 bg-rose-50 border-rose-200', icon: XCircle }
};

export default function StudentAccountRequests() {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [programs, setPrograms] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState('pending');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchAllPaged = async (build) => {
    const out = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error: err } = await build(from, from + PAGE_SIZE - 1);
      if (err) throw err;
      const page = data || [];
      out.push(...page);
      if (page.length < PAGE_SIZE) return out;
    }
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [deptRes, progRes, secRes] = await Promise.all([
        supabase.from('departments').select('department_id, name'),
        supabase.from('programs').select('program_id, name, abbreviation'),
        supabase.from('sections').select('section_id, name')
      ]);
      if (deptRes.error) throw deptRes.error;
      if (progRes.error) throw progRes.error;
      if (secRes.error) throw secRes.error;
      setDepartments(deptRes.data || []);
      setPrograms(progRes.data || []);
      setSections(secRes.data || []);

      setRequests(
        await fetchAllPaged((from, to) =>
          supabase
            .from('student_account_requests')
            .select('*')
            .order('submitted_at', { ascending: false })
            .range(from, to)
        )
      );
    } catch (err) {
      setError(toUserMessage(err, 'Could not load student account requests.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deptName = useMemo(
    () => new Map(departments.map((d) => [d.department_id, d.name])),
    [departments]
  );
  const progName = useMemo(
    () => new Map(programs.map((p) => [p.program_id, p.abbreviation || p.name])),
    [programs]
  );
  const secName = useMemo(
    () => new Map(sections.map((s) => [s.section_id, s.name])),
    [sections]
  );

  const counts = useMemo(
    () => ({
      pending: requests.filter((r) => r.status === 'pending').length,
      created: requests.filter((r) => r.status === 'created').length,
      rejected: requests.filter((r) => r.status === 'rejected').length
    }),
    [requests]
  );

  const visible = requests.filter((r) => r.status === statusTab);

  const exportPending = async () => {
    const pending = requests.filter((r) => r.status === 'pending');
    if (!pending.length) {
      setError('There is nothing pending to export.');
      return;
    }
    // Column order and names match Import Users exactly, so the file uploads
    // there without editing anything but Email.
    const rows = pending.map((r) => ({
      LastName: r.last_name || '',
      FirstName: r.first_name || '',
      MiddleName: r.middle_name || '',
      Email: '', // filled in after the Outlook mailbox exists
      Role: 'student',
      College: deptName.get(r.department_id) || '',
      Program: progName.get(r.program_id) || '',
      Section: secName.get(r.section_id) || '',
      YearLevel: r.year_level || '',
      IDNumber: r.user_number || '',
      RequestID: r.request_id
    }));

    const ws = XLSX.utils.json_to_sheet(rows, { header: EXPORT_HEADERS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Import Users');
    XLSX.writeFile(wb, `ASPIRE_Student_Accounts_To_Create_${new Date().toISOString().slice(0, 10)}.xlsx`);

    await logActivity(
      'File Export',
      `Exported ${rows.length} pending student account request(s) for account creation.`,
      resolveActorName(profile, user)
    );
    setNotice(`${rows.length} row(s) exported. Fill the Email column, then upload through Import Users.`);
  };

  const confirmReject = async () => {
    if (!rejecting || !reason.trim()) return;
    setBusy(true);
    setError('');
    try {
      const { error: rpcErr } = await supabase.rpc('reject_student_account_request', {
        p_request_id: rejecting.request_id,
        p_reason: reason.trim()
      });
      if (rpcErr) throw rpcErr;
      await logActivity(
        'Student Account Request',
        `Returned ${rejecting.last_name}, ${rejecting.first_name} to the Registrar: ${reason.trim()}`,
        resolveActorName(profile, user)
      );
      setNotice('Record returned to the Registrar.');
      setRejecting(null);
      setReason('');
      load();
    } catch (err) {
      setError(toUserMessage(err, 'Could not return this record.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Student Account Requests" breadcrumb="Admin Portal">
        <button
          onClick={exportPending}
          disabled={loading || counts.pending === 0}
          className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">Export for Import Users</span>
          <span className="sm:hidden">Export</span>
        </button>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        {/* ── How this works ──────────────────────────────────────────────── */}
        <div className="bg-sage-50 border border-sage-200 rounded-xl px-3.5 py-3 text-[11px] sm:text-xs text-sage-900">
          <div className="flex items-start gap-2">
            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-semibold mb-1">The Registrar sent these students. To create their accounts:</p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li><strong>Export</strong> — downloads an Import Users file with the Email column blank.</li>
                <li>Create each student's mailbox in <strong>Outlook</strong>.</li>
                <li>Paste the addresses into the <span className="font-mono">Email</span> column.</li>
                <li>
                  Upload it in{' '}
                  <Link to="/admin/userlist?action=import" className="underline font-semibold">
                    Manage Users → Import Users
                  </Link>
                  . Each created account links back here automatically.
                </li>
              </ol>
              <p className="mt-1.5 text-sage-800/80">
                Accounts are created only in Import Users, which validates section, college, year
                level and ID number. Leave the <span className="font-mono">RequestID</span> column
                untouched — it is what marks these rows Created.
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {notice && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{notice}</span>
          </div>
        )}

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {['pending', 'created', 'rejected'].map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusTab(tab)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap capitalize cursor-pointer',
                statusTab === tab
                  ? 'bg-sage-600 text-white'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              )}
            >
              {tab === 'rejected' ? 'Returned' : tab}
              <span className="ml-1.5 font-mono tabular-nums opacity-70">{counts[tab]}</span>
            </button>
          ))}
        </div>

        {/* ── List ────────────────────────────────────────────────────────── */}
        {loading ? (
          <p className="text-xs text-slate-400">Loading requests…</p>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 flex flex-col items-center text-center">
            <Inbox className="h-8 w-8 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-medium text-slate-600">
              {statusTab === 'pending' ? 'No requests waiting' : `Nothing ${statusTab === 'rejected' ? 'returned' : statusTab}`}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden divide-y divide-slate-100">
            {visible.map((req) => {
              const style = STATUS_STYLE[req.status] || STATUS_STYLE.pending;
              const Icon = style.icon;
              return (
                <div key={req.request_id} className="p-3.5 sm:p-4 flex items-start gap-3">
                  <div className={cn('w-8 h-8 rounded-lg border flex items-center justify-center flex-shrink-0', style.chip)}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">
                      {req.last_name}, {req.first_name} {req.middle_name || ''}
                    </h3>
                    <p className="text-[10px] sm:text-xs text-slate-500 truncate">
                      <span className="font-mono">{req.user_number}</span>
                      {' · '}{deptName.get(req.department_id) || 'No college'}
                      {req.section_id && <> · <span className="font-mono">{secName.get(req.section_id)}</span></>}
                      {req.year_level && ` · ${req.year_level}`}
                    </p>
                    {req.status === 'rejected' && req.rejection_reason && (
                      <p className="text-[10px] sm:text-xs text-rose-700 mt-1">Returned: {req.rejection_reason}</p>
                    )}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Sent {new Date(req.submitted_at).toLocaleString('en-PH')}
                    </p>
                  </div>
                  {req.status === 'pending' && (
                    <button
                      onClick={() => { setRejecting(req); setReason(''); }}
                      className="px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer flex-shrink-0"
                    >
                      Return
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Return dialog ─────────────────────────────────────────────────── */}
      {rejecting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full p-5 space-y-3.5">
            <h3 className="text-base font-bold font-display text-slate-900">
              Return this record to the Registrar?
            </h3>
            <p className="text-xs text-slate-500">
              {rejecting.last_name}, {rejecting.first_name} —{' '}
              <span className="font-mono">{rejecting.user_number}</span>
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Why is this being returned? The Registrar sees this."
              className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 resize-y"
            />
            <p className="text-[10px] text-slate-400">
              A reason is required — a return the Registrar cannot act on just comes back again.
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmReject}
                disabled={busy || !reason.trim()}
                className="flex-1 px-3.5 py-2 text-xs sm:text-sm font-medium bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                Return
              </button>
              <button
                onClick={() => setRejecting(null)}
                disabled={busy}
                className="flex-1 px-3.5 py-2 text-xs sm:text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
