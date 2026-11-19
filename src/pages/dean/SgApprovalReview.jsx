import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ArrowLeft, CheckCircle2, Undo2, Table2, Users } from 'lucide-react';
import { fetchRecordsCatalog, fetchClassGradeSheet } from '../../lib/registrarRecordsService';
import { fetchSgApproval, decideSgApproval, SG_APPROVAL_LABEL } from '../../lib/sgApprovalService';
import { toUserMessage } from '../../lib/errorMessages';
import { cn } from '../../lib/utils';
import { ErrorBanner, EmptyState, Chip, GradeCell, RemarkChip } from '../../components/registrar/RecordsUi';

// Dean › SG Approvals › one class.
//
// The submitted grade sheet with a distribution summary, and the two decisions:
//   Approve  releases the SG to students (and emails them and their
//            guardians), sends it to the Registrar, and tells the instructor.
//   Return   sends it back to the instructor with a required reason; students
//            still see nothing.
// The decision is made by decide_sg_approval(), which re-checks that the
// signed-in Dean owns the class's college and that the SG is still waiting.

const MIN_REASON = 10;

const formatWhen = (iso) =>
  iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

function summarize(roster) {
  const out = { total: 0, passed: 0, failed: 0, exceptional: 0 };
  for (const r of roster) {
    if (!r.sg) continue;
    out.total += 1;
    const remark = String(r.sg.remark || '').toLowerCase();
    if (remark === 'passed') out.passed += 1;
    else if (remark === 'failed' || remark === 'fda') out.failed += 1;
    else out.exceptional += 1;
  }
  return out;
}

export default function SgApprovalReview() {
  const { classRecordId } = useParams();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState(null);
  const [approval, setApproval] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState(null); // null | 'approve' | 'return'
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const cat = await fetchRecordsCatalog();
      const [data, approvalRow] = await Promise.all([
        fetchClassGradeSheet(classRecordId, cat.terms, cat.programsByAbbr),
        fetchSgApproval(classRecordId)
      ]);
      setSheet(data);
      setApproval(approvalRow);
    } catch (err) {
      setError(toUserMessage(err, 'Could not load this grade sheet.'));
    } finally {
      setLoading(false);
    }
  }, [classRecordId]);

  useEffect(() => { load(); }, [load]);

  const decide = async () => {
    setBusy(true);
    setError('');
    try {
      await decideSgApproval(classRecordId, mode, mode === 'return' ? reason.trim() : null);
      setDone(mode === 'approve'
        ? 'Approved. The SG is now official: students can see it, they and their guardians are being emailed, and the Registrar has received it.'
        : 'Returned to the instructor with your reason. Students still do not see this SG.');
      setMode(null);
      setReason('');
      await load();
    } catch (err) {
      setError(toUserMessage(err, 'The decision could not be saved.'));
    } finally {
      setBusy(false);
    }
  };

  const waiting = approval?.status === 'submitted';
  const stats = sheet ? summarize(sheet.roster) : null;

  return (
    <>
      <PageHeader title="Review SG" breadcrumb="Dean Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-5">
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/dean/sgapprovals'))}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-sage-700 hover:text-sage-800 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to SG Approvals
        </button>

        <ErrorBanner message={error} />
        {done && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{done}</span>
          </div>
        )}

        {loading ? (
          <p className="text-xs text-slate-400">Loading grade sheet…</p>
        ) : !sheet ? (
          <EmptyState icon={Table2} title="This class could not be found" hint="It may belong to another college, or the link is out of date." />
        ) : (
          <>
            {/* ── Header and decision ─────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm sm:text-lg font-bold font-display text-slate-900 font-mono">{sheet.subjectCode}</h2>
                    <span className="text-sm sm:text-base text-slate-700">{sheet.subjectName}</span>
                    {sheet.classType && sheet.classType !== 'lecture' && <Chip>{sheet.classType}</Chip>}
                    {approval && (
                      <Chip tone={approval.status === 'approved' ? 'good' : approval.status === 'returned' ? 'warn' : 'brand'}>
                        {SG_APPROVAL_LABEL[approval.status]}
                      </Chip>
                    )}
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                    <span className="font-mono">{sheet.sectionName}</span> · {sheet.instructor} · {sheet.termLabel}
                  </p>
                  {approval && (
                    <p className="text-[11px] text-slate-400 mt-1">
                      Submitted {formatWhen(approval.submittedAt)}
                      {approval.submissionCount > 1 && <> (submission {approval.submissionCount})</>}
                      {approval.decidedAt && <> · {approval.status === 'approved' ? 'Approved' : 'Returned'} {formatWhen(approval.decidedAt)}{approval.decidedBy && <> by {approval.decidedBy}</>}</>}
                    </p>
                  )}
                  {approval?.status === 'returned' && approval.returnReason && (
                    <p className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2">
                      <span className="font-bold">Your reason:</span> {approval.returnReason}
                    </p>
                  )}
                </div>
              </div>

              {stats && (
                <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100">
                  {[
                    ['Students with SG', `${stats.total} / ${sheet.counts.enrolled}`],
                    ['Passed', stats.passed],
                    ['Failed / FDA', stats.failed],
                    ['INC / Dropped', stats.exceptional]
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</dt>
                      <dd className="text-sm sm:text-lg font-bold font-mono tabular-nums text-slate-900 mt-0.5">{value}</dd>
                    </div>
                  ))}
                </dl>
              )}

              {!approval ? (
                <p className="text-xs text-slate-500 pt-4 border-t border-slate-100">The instructor has not submitted this class&apos;s SG yet.</p>
              ) : waiting && (
                <div className="pt-4 border-t border-slate-100 space-y-3">
                  {mode === 'return' ? (
                    <div className="space-y-2">
                      <label className="block">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                          Reason for returning (the instructor will see this)
                        </span>
                        <textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          rows={3}
                          maxLength={1000}
                          placeholder="e.g. Please review the INC remark for Dela Cruz; the attendance record shows FDA."
                          className="w-full bg-white border border-slate-200 focus:border-sage-500 rounded-xl px-3 py-2 text-xs sm:text-sm outline-none"
                        />
                      </label>
                      <p className={cn('text-[10px]', reason.trim().length >= MIN_REASON ? 'text-slate-400' : 'text-amber-700')}>
                        At least {MIN_REASON} characters.
                      </p>
                    </div>
                  ) : mode === 'approve' ? (
                    <p className="text-xs text-slate-700">
                      Approve this Semestral Grade? Students will see it right away, they and their guardians will be emailed,
                      and the Registrar will receive the grade sheet. After approval, a change needs a grade correction request.
                    </p>
                  ) : null}

                  <div className="flex items-center gap-2 flex-wrap">
                    {mode ? (
                      <>
                        <button
                          onClick={decide}
                          disabled={busy || (mode === 'return' && reason.trim().length < MIN_REASON)}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl text-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
                            mode === 'approve' ? 'bg-emerald-700 hover:bg-emerald-800' : 'bg-amber-600 hover:bg-amber-700'
                          )}
                        >
                          {busy ? 'Saving…' : mode === 'approve' ? 'Confirm approval' : 'Return to instructor'}
                        </button>
                        <button
                          onClick={() => { setMode(null); setReason(''); }}
                          disabled={busy}
                          className="px-3.5 py-2 text-xs font-medium rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setMode('approve')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Approve SG
                        </button>
                        <button
                          onClick={() => setMode('return')}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100 cursor-pointer"
                        >
                          <Undo2 className="h-3.5 w-3.5" /> Return to instructor
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Grade sheet ─────────────────────────────────────────────── */}
            {sheet.roster.length === 0 ? (
              <EmptyState icon={Users} title="No students on this roster" />
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="px-4 py-3 w-10">#</th>
                        <th className="px-4 py-3">Student</th>
                        <th className="px-4 py-3">MR</th>
                        <th className="px-4 py-3">TFR</th>
                        <th className="px-4 py-3">SG</th>
                        <th className="px-4 py-3">Remark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sheet.roster.map((r, index) => (
                        <tr key={r.studentId} className="hover:bg-slate-50/70 align-top">
                          <td className="px-4 py-3 text-xs text-slate-400 font-mono">{index + 1}</td>
                          <td className="px-4 py-3">
                            <div className="text-xs sm:text-sm font-medium text-slate-900">{r.name}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5 font-mono">{r.userNumber || '—'}</div>
                            {r.enrollmentType === 'Off-block' && <div className="mt-1"><Chip tone="warn">Off-block</Chip></div>}
                          </td>
                          <td className="px-4 py-3"><GradeCell milestone={r.mr} /></td>
                          <td className="px-4 py-3"><GradeCell milestone={r.tfr} /></td>
                          <td className="px-4 py-3"><GradeCell milestone={r.sg} /></td>
                          <td className="px-4 py-3"><RemarkChip milestone={r.sg} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
