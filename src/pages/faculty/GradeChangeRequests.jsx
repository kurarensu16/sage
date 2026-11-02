import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import ConfirmModal from '../../components/ConfirmModal';
import {
  FileWarning, AlertTriangle, CheckCircle2, Info,
  Send, XCircle, Clock, Wrench
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { toUserMessage } from '../../lib/errorMessages';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { cn } from '../../lib/utils';
import { MILESTONE_LABEL } from '../../lib/milestoneState';
import { GRADE_MILESTONES } from '../../lib/gradeMilestones';
import {
  STATUS_PRESENTATION, REQUEST_STATUS,
  fetchGradeChangeRequests, facultyReviewRequest
} from '../../lib/gradeChangeRequestService';
import EvidenceGallery from '../../components/grades/EvidenceGallery';
import GradeChangeChain from '../../components/grades/GradeChangeChain';

// The faculty side of a grade dispute.
//
// THE VALIDATION STEP IS A GATE, NOT A SECOND REVIEW.
// Faculty either reject a dispute that is plainly inapplicable -- wrong class,
// duplicate, already corrected -- or pass it to the Dean with the context only
// they have. They do not decide the merits; that is the Dean's, and keeping the
// two apart is the point of the chain.
//
// WHERE THE CORRECTION HAPPENS.
// Once the Dean approves, the correction is made from the Approved tab here,
// not from a prompt buried in the gradebook. One place, one trigger, with the
// request that justified it on screen.

const TABS = [
  { id: 'inbox', label: 'To review', statuses: [REQUEST_STATUS.PENDING_FACULTY] },
  { id: 'dean', label: 'With the Dean', statuses: [REQUEST_STATUS.PENDING_DEAN] },
  { id: 'approved', label: 'Approved — to apply', statuses: [REQUEST_STATUS.APPROVED] },
  {
    id: 'history',
    label: 'History',
    statuses: [REQUEST_STATUS.APPLIED, REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED]
  }
];

export default function FacultyGradeChangeRequests() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState('inbox');
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
      setRows(await fetchGradeChangeRequests());
    } catch (err) {
      setError(toUserMessage(err, 'Could not load the requests.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const activeTab = TABS.find((t) => t.id === tab) || TABS[0];
  const visible = rows.filter((r) => activeTab.statuses.includes(r.status));
  const countFor = (t) => rows.filter((r) => t.statuses.includes(r.status)).length;

  const handleReview = async () => {
    if (!acting) return;
    const { row, decision } = acting;
    setBusyId(row.requestId);
    setError('');
    setNotice('');
    try {
      await facultyReviewRequest({ requestId: row.requestId, decision, facultyNote: note.trim() });
      await logActivity(
        decision === 'forward' ? 'Forwarded Grade Request' : 'Rejected Grade Request',
        `${resolveActorName(profile, user)} ${decision === 'forward' ? 'forwarded to the Dean' : 'rejected'} a grade change request for ${row.subjectCode} (${MILESTONE_LABEL[row.gradePeriod] || row.gradePeriod}).`,
        resolveActorName(profile, user)
      );
      setNotice(
        decision === 'forward'
          ? 'Passed to the Dean. The student can see that it has moved on.'
          : 'Marked as not applicable. The student can see your explanation.'
      );
      setActing(null);
      setNote('');
      await load();
    } catch (err) {
      setError(toUserMessage(err, 'Could not record your review.'));
    } finally {
      setBusyId('');
    }
  };

  // A note is required when rejecting: "no" with no reason is the outcome
  // students most often escalate, and the explanation costs one sentence.
  const noteRequired = acting?.decision === 'reject';
  const canAct = !noteRequired || note.trim().length >= 10;

  return (
    <>
      <PageHeader title="Grade Change Requests" breadcrumb="Faculty Portal" />

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

        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 flex flex-col items-center text-center">
            <FileWarning className="h-8 w-8 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-medium text-slate-600">Nothing here</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              {tab === 'inbox'
                ? 'No students are waiting on you. Requests arrive here when a student questions a finalized grade in one of your classes.'
                : tab === 'approved'
                  ? 'Nothing is waiting to be corrected. Approved requests appear here for you to apply.'
                  : 'Nothing to show in this view yet.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden divide-y divide-slate-100">
            {visible.map((row) => (
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
                      · {MILESTONE_LABEL[row.gradePeriod] || row.gradePeriod}
                      {row.originalGrade != null && (
                        <> · grade <span className="font-mono font-semibold text-slate-700">{row.originalGrade}</span></>
                      )}
                    </p>
                  </div>
                  <span className={cn(
                    'text-micro font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border flex-shrink-0',
                    STATUS_PRESENTATION[row.status]?.tone
                  )}>
                    {STATUS_PRESENTATION[row.status]?.label}
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <p className="text-[11px] sm:text-xs text-slate-700">
                    <span className="font-semibold">{row.reasonLabel}.</span> {row.reasonDetail}
                  </p>
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Sent {new Date(row.requestedAt).toLocaleString('en-PH')}
                  </p>
                </div>

                {(row.facultyNote || row.deanNote) && (
                  <div className="space-y-1">
                    {row.facultyNote && (
                      <p className="text-[11px] text-slate-600">
                        <span className="font-semibold">Your note:</span> {row.facultyNote}
                      </p>
                    )}
                    {row.deanNote && (
                      <p className="text-[11px] text-slate-600">
                        <span className="font-semibold">Dean:</span> {row.deanNote}
                      </p>
                    )}
                  </div>
                )}

                <GradeChangeChain status={row.status} reachedRegistrar={row.reachedRegistrar} className="mb-2" />
                <EvidenceGallery request={row} />

                <div className="flex items-center gap-2 flex-wrap">
                  {row.status === REQUEST_STATUS.PENDING_FACULTY && (
                    <>
                      <button
                        onClick={() => { setActing({ row, decision: 'forward' }); setNote(''); }}
                        disabled={busyId === row.requestId}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sage-600 text-white text-[11px] font-bold hover:bg-sage-700 disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        <Send className="h-3 w-3" />
                        Pass to the Dean
                      </button>
                      <button
                        onClick={() => { setActing({ row, decision: 'reject' }); setNote(''); }}
                        disabled={busyId === row.requestId}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 text-[11px] font-bold hover:bg-rose-50 disabled:opacity-50 cursor-pointer transition-colors"
                      >
                        <XCircle className="h-3 w-3" />
                        Not applicable
                      </button>
                    </>
                  )}

                  {row.status === REQUEST_STATUS.APPROVED && (
                    <>
                      <button
                        onClick={() => navigate(
                          row.gradePeriod === GRADE_MILESTONES.SEMESTRAL_GRADE
                            // A semestral correction recalculates the whole term, which is
                            // exactly what the gradebook's existing editor does -- including a
                            // remark decision that only a semestral grade has.
                            ? `/faculty/postedgradesview?id=${row.classRecordId}&request=${row.requestId}`
                            : `/faculty/graderequests/${row.requestId}/apply`
                        )}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 cursor-pointer transition-colors"
                      >
                        <Wrench className="h-3 w-3" />
                        Make the correction
                      </button>
                      <span className="text-[11px] text-slate-500">
                        {row.gradePeriod === GRADE_MILESTONES.SEMESTRAL_GRADE
                          ? 'Recalculates the whole term — midterm and tentative final included.'
                          : 'Affects only this rating. A later grade needs its own request.'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[11px] sm:text-xs text-slate-600 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Your step is a check, not a decision: pass it on, or say why it does not apply. Only
            the Dean approves a change. A correction to a Midterm or Tentative Final Rating affects
            only that rating — if a later grade needs correcting too, it takes its own request.
          </span>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!acting && !noteRequired}
        onCancel={() => { setActing(null); setNote(''); }}
        onConfirm={handleReview}
        title="Pass this to the Dean?"
        message={`${acting?.row?.studentName || 'This student'}'s request will go to the Dean for a decision. Anything you add is shown to both the Dean and the student.`}
      />

      {/* Rejecting asks for the reason inline rather than in a yes/no modal,
          because the reason is the substance of the decision. */}
      {acting && noteRequired && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full p-5 space-y-3 animate-in zoom-in-95 duration-200">
            <h3 className="text-base font-bold font-display text-slate-900">
              Why does this not apply?
            </h3>
            <p className="text-xs text-slate-500">
              {acting.row.studentName} will read this. A clear reason here usually prevents the
              same question coming back.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              autoFocus
              placeholder="For example: the activity sheet shown is for Lab 2, which was already corrected last week."
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 resize-y"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleReview}
                disabled={!canAct || busyId === acting.row.requestId}
                className="px-3.5 py-2 rounded-xl bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                {busyId === acting.row.requestId ? 'Saving…' : 'Mark not applicable'}
              </button>
              <button
                onClick={() => { setActing(null); setNote(''); }}
                className="px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer transition-colors"
              >
                Cancel
              </button>
              {!canAct && (
                <span className="text-[10px] text-slate-400">Write a sentence or two</span>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
