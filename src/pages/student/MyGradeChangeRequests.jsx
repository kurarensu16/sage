import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import ConfirmModal from '../../components/ConfirmModal';
import {
  FileWarning, AlertTriangle, CheckCircle2, Loader2, Info, Paperclip,
  Plus, UserCheck
} from 'lucide-react';
import { toUserMessage } from '../../lib/errorMessages';
import { cn } from '../../lib/utils';
import { MILESTONE_LABEL } from '../../lib/milestoneState';
import {
  STATUS_PRESENTATION, isOpenStatus,
  fetchGradeChangeRequests, withdrawGradeChangeRequest,
  uploadEvidenceFile, attachEvidence, describeEvidenceFile,
  EVIDENCE_ACCEPT_ATTR, EVIDENCE_MAX_FILES
} from '../../lib/gradeChangeRequestService';
import { useAuth } from '../../lib/AuthContext';
import { downscaleImage } from '../../lib/imageDownscale';
import EvidenceGallery from '../../components/grades/EvidenceGallery';
import GradeChangeChain from '../../components/grades/GradeChangeChain';

// What a student sees about disputes on their own grades.
//
// TWO KINDS OF ROW APPEAR HERE, by the owner's decision on 2026-10-29:
//   - Requests the student raised: visible at every stage.
//   - Requests a faculty member raised about their grade: visible only once
//     resolved -- approved, rejected or applied.
//
// The second rule is the considered one. A student has a right to know their
// grade was changed and why; they do not need to watch an instructor's review
// unfold, which would invite pressure on a process that should be unhurried.
// The rule is enforced by row-level security, not by this page -- what is
// filtered here is only how it is grouped.

function StatusChip({ status }) {
  const p = STATUS_PRESENTATION[status];
  if (!p) return null;
  return (
    <span className={cn(
      'text-micro font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border flex-shrink-0',
      p.tone
    )}>
      {p.label}
    </span>
  );
}

export default function MyGradeChangeRequests() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');
  const [confirmWithdraw, setConfirmWithdraw] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await fetchGradeChangeRequests());
    } catch (err) {
      setError(toUserMessage(err, 'Could not load your requests.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const mine = rows.filter((r) => r.submittedByRole === 'student');
  const raisedByFaculty = rows.filter((r) => r.submittedByRole !== 'student');

  const handleWithdraw = async () => {
    const row = confirmWithdraw;
    if (!row) return;
    setBusyId(row.requestId);
    setError('');
    setNotice('');
    try {
      await withdrawGradeChangeRequest(row.requestId);
      setNotice('Your request has been withdrawn.');
      await load();
    } catch (err) {
      setError(toUserMessage(err, 'Could not withdraw that request.'));
    } finally {
      setBusyId('');
      setConfirmWithdraw(null);
    }
  };

  const handleAttach = async (row, raw) => {
    setBusyId(row.requestId);
    setError('');
    setNotice('');
    try {
      const file = await downscaleImage(raw);
      const check = describeEvidenceFile(file);
      if (!check.ok) throw new Error(check.message);
      const up = await uploadEvidenceFile({ userId: user?.id, file });
      await attachEvidence({ requestId: row.requestId, objectKey: up.objectKey, storage: up.storage });
      setNotice('Your file has been attached.');
      await load();
    } catch (err) {
      setError(toUserMessage(err, 'That file could not be attached.'));
    } finally {
      setBusyId('');
    }
  };

  const renderRow = (row, { ownedByStudent }) => (
    <div key={row.requestId} className="p-3.5 sm:p-4 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-xs sm:text-sm font-bold text-slate-900">
            {row.subjectCode} — {MILESTONE_LABEL[row.gradePeriod] || row.gradePeriod}
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {row.subjectName}
            {row.sectionName && <> · {row.sectionName}</>}
            {' · '}Sent {new Date(row.requestedAt).toLocaleDateString('en-PH')}
          </p>
        </div>
        <StatusChip status={row.status} />
      </div>

      <p className="text-[11px] sm:text-xs text-slate-700">
        <span className="font-semibold">{row.reasonLabel}.</span> {row.reasonDetail}
      </p>

      {STATUS_PRESENTATION[row.status]?.student && (
        <p className="text-[11px] text-slate-500">{STATUS_PRESENTATION[row.status].student}</p>
      )}

      {/* The outcome, in the words of whoever decided it. */}
      {(row.facultyNote || row.deanNote) && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 space-y-1.5">
          {row.facultyNote && (
            <p className="text-[11px] text-slate-700">
              <span className="font-semibold">Your instructor:</span> {row.facultyNote}
            </p>
          )}
          {row.deanNote && (
            <p className="text-[11px] text-slate-700">
              <span className="font-semibold">The Dean:</span> {row.deanNote}
            </p>
          )}
        </div>
      )}

      <GradeChangeChain status={row.status} reachedRegistrar={row.reachedRegistrar} className="mb-2" />
      <EvidenceGallery request={row} />

      <div className="flex items-center gap-2 flex-wrap pt-0.5">
        {ownedByStudent && isOpenStatus(row.status)
          && (row.evidence?.length || 0) < EVIDENCE_MAX_FILES && (
          <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 text-[11px] font-semibold hover:bg-slate-50 cursor-pointer transition-colors">
            {busyId === row.requestId
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Paperclip className="h-3 w-3" />}
            Add another file
            <input
              type="file"
              accept={EVIDENCE_ACCEPT_ATTR}
              className="hidden"
              disabled={busyId === row.requestId}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) handleAttach(row, f);
              }}
            />
          </label>
        )}

        {ownedByStudent && isOpenStatus(row.status) && (
          <button
            onClick={() => setConfirmWithdraw(row)}
            disabled={busyId === row.requestId}
            className="text-[11px] font-semibold text-slate-500 hover:text-rose-700 disabled:opacity-50 cursor-pointer"
          >
            Withdraw
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      <PageHeader title="Grade Change Requests" breadcrumb="Student Portal">
        <button
          onClick={() => navigate('/student/graderequests/new')}
          className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Ask about a grade</span>
        </button>
      </PageHeader>

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

        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 flex flex-col items-center text-center">
            <FileWarning className="h-8 w-8 text-slate-300 stroke-1 mb-2" />
            <p className="text-sm font-medium text-slate-600">No requests yet</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">
              If a finalized grade looks wrong, you can ask about it here. Your instructor reviews
              it first, and the Dean decides.
            </p>
            <button
              onClick={() => navigate('/student/graderequests/new')}
              className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sage-600 text-white text-xs font-bold hover:bg-sage-700 cursor-pointer transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Ask about a grade
            </button>
          </div>
        ) : (
          <>
            {mine.length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
                <div className="px-3.5 sm:px-5 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-900">Requests you sent</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {mine.map((r) => renderRow(r, { ownedByStudent: true }))}
                </div>
              </section>
            )}

            {raisedByFaculty.length > 0 && (
              <section className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
                <div className="px-3.5 sm:px-5 py-3 border-b border-slate-100">
                  <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                    <UserCheck className="h-4 w-4 text-slate-400" />
                    Corrections raised by your instructor
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Shown once a decision has been made, so you know what changed and why.
                  </p>
                </div>
                <div className="divide-y divide-slate-100">
                  {raisedByFaculty.map((r) => renderRow(r, { ownedByStudent: false }))}
                </div>
              </section>
            )}
          </>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[11px] sm:text-xs text-slate-600 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Your instructor checks the request first and either explains why it does not apply or
            passes it to the Dean. Only the Dean can approve a change, and only your instructor can
            make the correction once approved.
          </span>
        </div>
      </div>

      <ConfirmModal
        isOpen={!!confirmWithdraw}
        onCancel={() => setConfirmWithdraw(null)}
        onConfirm={handleWithdraw}
        title="Withdraw this request?"
        message="It will be closed and your instructor will no longer see it as waiting. You can raise a new one about the same grade afterwards."
      />
    </>
  );
}
