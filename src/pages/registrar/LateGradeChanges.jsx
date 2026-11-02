import { useState, useEffect, useCallback } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import {
  Stamp, AlertTriangle, CheckCircle2, Info, Search, XCircle, Clock,
  CalendarX, GraduationCap, UserCheck
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { toUserMessage } from '../../lib/errorMessages';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { cn } from '../../lib/utils';
import { MILESTONE_LABEL } from '../../lib/milestoneState';
import EvidenceGallery from '../../components/grades/EvidenceGallery';
import GradeChangeChain from '../../components/grades/GradeChangeChain';
import {
  STATUS_PRESENTATION, REQUEST_STATUS,
  fetchGradeChangeRequests, registrarReviewRequest
} from '../../lib/gradeChangeRequestService';

// The Registrar authorises grade changes to terms that have already closed.
//
// WHY THIS STEP EXISTS
// A dispute can only be raised within 30 school days of the term rolling over.
// One that outlives that window is not refused -- a student who filed on the
// last day should not lose their case because a review took time -- but by then
// the term's records are settled, and settled records are the Registrar's.
//
// So this is an ADDITIONAL authority, not a replacement. The evidence, the
// instructor's validation and the Dean's approval have all already happened;
// nothing reaches this page without them. What the Registrar decides is whether
// a closed term may be reopened for it.
//
// Requests inside the window never appear here. They go straight from the Dean
// to the instructor, and most should.

const TABS = [
  { id: 'waiting', label: 'Waiting on you', statuses: [REQUEST_STATUS.PENDING_REGISTRAR] },
  { id: 'authorized', label: 'Authorised', statuses: [REQUEST_STATUS.APPROVED, REQUEST_STATUS.APPLIED] },
  { id: 'refused', label: 'Not authorised', statuses: [REQUEST_STATUS.REJECTED] }
];

// How far past the deadline, in plain words. "41 days late" tells a Registrar
// more about whether to reopen a term than a raw timestamp does.
function daysPast(resolvedAt) {
  if (!resolvedAt) return null;
  const days = Math.floor((Date.now() - new Date(resolvedAt).getTime()) / 86400000);
  return Number.isFinite(days) && days >= 0 ? days : null;
}

export default function RegistrarLateGradeChanges() {
  const { user, profile } = useAuth();

  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('waiting');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');

  const [acting, setActing] = useState(null);     // { row, decision }
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const all = await fetchGradeChangeRequests();
      // Only requests that reached the Registrar. Everything resolved inside
      // the window is none of this page's business.
      setRows(all.filter((r) => r.reachedRegistrar || r.status === REQUEST_STATUS.PENDING_REGISTRAR));
    } catch (err) {
      setError(toUserMessage(err, 'Could not load the requests.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeTab = TABS.find((t) => t.id === tab) || TABS[0];
  const term = search.trim().toLowerCase();
  const visible = rows
    .filter((r) => activeTab.statuses.includes(r.status))
    .filter((r) => !term || [
      r.studentName, r.studentNumber, r.subjectCode, r.subjectName,
      r.sectionName, r.facultyName
    ].some((v) => (v || '').toLowerCase().includes(term)));

  const countFor = (t) => rows.filter((r) => t.statuses.includes(r.status)).length;

  const handleDecide = async () => {
    if (!acting) return;
    const { row, decision } = acting;
    setBusyId(row.requestId);
    setError('');
    setNotice('');
    try {
      await registrarReviewRequest({ requestId: row.requestId, decision, registrarNote: note.trim() });
      await logActivity(
        decision === 'authorize' ? 'Authorised Late Grade Change' : 'Refused Late Grade Change',
        `${resolveActorName(profile, user)} ${decision === 'authorize' ? 'authorised' : 'refused'} a late grade change for ${row.studentName} in ${row.subjectCode} (${MILESTONE_LABEL[row.gradePeriod] || row.gradePeriod}), ${row.schoolYear} ${row.semester}.`,
        resolveActorName(profile, user)
      );
      setNotice(
        decision === 'authorize'
          ? 'Authorised. The instructor can now make the correction.'
          : 'Recorded as not authorised. The student can see your reason.'
      );
      setActing(null);
      setNote('');
      await load();
    } catch (err) {
      setError(toUserMessage(err, 'Could not record your decision.'));
    } finally {
      setBusyId('');
    }
  };

  const canDecide = note.trim().length >= 10;

  return (
    <>
      <PageHeader title="Late Grade Changes" breadcrumb="Registrar Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
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

        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[11px] sm:text-xs text-slate-600 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            These are grade changes the instructor has validated and the Dean has approved, for
            terms that have already closed. Your authorisation is what allows a settled record to
            be reopened. Requests still inside the dispute period do not appear here — they go
            straight from the Dean to the instructor.
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {TABS.map((t) => {
              const n = countFor(t);
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer',
                    tab === t.id
                      ? 'bg-sage-600 text-white'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  )}
                >
                  {t.label}
                  {n > 0 && <span className="ml-1.5 font-mono tabular-nums opacity-80">{n}</span>}
                </button>
              );
            })}
          </div>
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search student, subject or instructor…"
              className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400"
            />
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 flex flex-col items-center text-center">
            <Stamp className="h-8 w-8 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-medium text-slate-600">Nothing waiting</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              {tab === 'waiting'
                ? 'No closed terms are waiting to be reopened. Most grade changes resolve well inside the dispute period and never reach you.'
                : 'Nothing to show in this view.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden divide-y divide-slate-100">
            {visible.map((row) => {
              const fromStudent = row.submittedByRole === 'student';
              const late = daysPast(row.requestedAt);
              const waiting = row.status === REQUEST_STATUS.PENDING_REGISTRAR;
              return (
                <div key={row.requestId} className="p-3.5 sm:p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="min-w-0">
                      <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                        {row.studentName}
                        {row.studentNumber && (
                          <span className="font-mono font-normal text-slate-500"> · {row.studentNumber}</span>
                        )}
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {row.subjectCode} {row.sectionName && <>· {row.sectionName} </>}
                        {row.facultyName && <>· {row.facultyName} </>}
                        · {MILESTONE_LABEL[row.gradePeriod] || row.gradePeriod}
                        {row.originalGrade != null && (
                          <> · grade <span className="font-mono font-semibold text-slate-700">{row.originalGrade}</span></>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {row.schoolYear} · {row.semester}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
                      <span className={cn(
                        'text-micro font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border',
                        fromStudent
                          ? 'bg-sky-50 text-sky-700 border-sky-200'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      )}>
                        {fromStudent ? <GraduationCap className="h-3 w-3 inline-block mr-1 -mt-px" /> : <UserCheck className="h-3 w-3 inline-block mr-1 -mt-px" />}
                        {fromStudent ? 'Raised by student' : 'Raised by instructor'}
                      </span>
                      <span className={cn(
                        'text-micro font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border',
                        STATUS_PRESENTATION[row.status]?.tone || 'bg-slate-50 text-slate-600 border-slate-200'
                      )}>
                        {STATUS_PRESENTATION[row.status]?.label || row.status}
                      </span>
                    </div>
                  </div>

                  {waiting && (
                    <p className="text-[11px] text-violet-900 bg-violet-50 border border-violet-200 rounded-lg px-2.5 py-2 flex items-start gap-1.5">
                      <CalendarX className="h-3.5 w-3.5 mt-px flex-shrink-0" />
                      This term has closed. The dispute was raised
                      {late != null && <> <strong>{late} day{late === 1 ? '' : 's'} ago</strong></>}, and
                      the correction cannot be made until you authorise reopening the record.
                    </p>
                  )}

                  {/* The full chain, so a decision is never made on a summary. */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 space-y-1.5">
                    <p className="text-[11px] sm:text-xs text-slate-700">
                      <span className="font-semibold">{row.reasonLabel}.</span> {row.reasonDetail}
                    </p>
                    {row.facultyNote && (
                      <p className="text-[11px] text-slate-700 border-t border-slate-200 pt-1.5">
                        <span className="font-semibold">Instructor:</span> {row.facultyNote}
                      </p>
                    )}
                    {row.deanNote && (
                      <p className="text-[11px] text-slate-700 border-t border-slate-200 pt-1.5">
                        <span className="font-semibold">Dean approved:</span> {row.deanNote}
                      </p>
                    )}
                    {row.registrarNote && (
                      <p className="text-[11px] text-slate-700 border-t border-slate-200 pt-1.5">
                        <span className="font-semibold">Your decision:</span> {row.registrarNote}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Raised {new Date(row.requestedAt).toLocaleString('en-PH')}
                    </p>
                  </div>

                  <GradeChangeChain status={row.status} reachedRegistrar={row.reachedRegistrar} className="mb-2" />
                  <EvidenceGallery request={row} />

                  {waiting && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => { setActing({ row, decision: 'authorize' }); setNote(''); }}
                        disabled={busyId === row.requestId}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-[11px] font-bold hover:bg-violet-700 disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        <Stamp className="h-3 w-3" />
                        Authorise the change
                      </button>
                      <button
                        onClick={() => { setActing({ row, decision: 'reject' }); setNote(''); }}
                        disabled={busyId === row.requestId}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 text-[11px] font-bold hover:bg-rose-50 disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        <XCircle className="h-3 w-3" />
                        Do not authorise
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {acting && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full p-5 space-y-3 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold font-display text-slate-900">
              {acting.decision === 'authorize' ? 'Reopen this closed term?' : 'Refuse this change?'}
            </h3>
            <p className="text-xs text-slate-500">
              {acting.decision === 'authorize'
                ? `${acting.row.facultyName || 'The instructor'} will be able to correct ${acting.row.studentName}'s ${MILESTONE_LABEL[acting.row.gradePeriod] || 'grade'} for ${acting.row.schoolYear} ${acting.row.semester}. Your reason is recorded against the change permanently.`
                : `${acting.row.studentName} will read this. The Dean has already approved it, so the reason should say why the closed term cannot be reopened.`}
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              autoFocus
              placeholder={acting.decision === 'authorize'
                ? 'For example: evidence verified against the submitted class record; reopening approved for correction of the Lab 3 score.'
                : 'For example: the term has been reported to CHED and the record can no longer be amended; refer the student to the appeals process.'}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 resize-y"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={handleDecide}
                disabled={!canDecide || busyId === acting.row.requestId}
                className={cn(
                  'px-3.5 py-2 rounded-xl text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors',
                  acting.decision === 'authorize'
                    ? 'bg-violet-600 hover:bg-violet-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                )}
              >
                {busyId === acting.row.requestId
                  ? 'Saving…'
                  : acting.decision === 'authorize' ? 'Authorise' : 'Do not authorise'}
              </button>
              <button
                onClick={() => { setActing(null); setNote(''); }}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              {!canDecide && <span className="text-[10px] text-slate-400">Write a sentence or two</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
