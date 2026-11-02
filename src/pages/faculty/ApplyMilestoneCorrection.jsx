import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import ConfirmModal from '../../components/ConfirmModal';
import {
  Wrench, AlertTriangle, CheckCircle2, Loader2, Info, Calculator, ArrowLeft
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { toUserMessage } from '../../lib/errorMessages';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { cn } from '../../lib/utils';
import { MILESTONE_LABEL } from '../../lib/milestoneState';
import EvidenceGallery from '../../components/grades/EvidenceGallery';
import GradeChangeChain from '../../components/grades/GradeChangeChain';
import {
  REQUEST_STATUS, fetchGradeChangeRequests, fetchMilestoneCorrectionTargets,
  previewMilestoneCorrection, applyMilestoneCorrection, correctionSignature
} from '../../lib/gradeChangeRequestService';

// Applying an approved correction to a Midterm or Tentative Final Rating.
//
// WHY THIS IS NOT THE SEMESTRAL EDITOR
// That one iterates every term, asks for a remark, and cascades MR -> TFR -> SG.
// None of it applies here. A midterm correction touches only the terms that
// feed the midterm, carries no remark of its own, and must NOT cascade -- a
// later milestone needing correction is its own request, by the owner's rule.
// Sharing one screen would have meant teaching it to hide most of itself.
//
// WHAT IT KEEPS FROM THAT EDITOR, DELIBERATELY
//   A server-side preview, so the figure approved is the one the database will
//   produce rather than one recomputed in the browser.
//   A preview signature, so editing a score after previewing blocks Apply until
//   it is previewed again. Without it, somebody applies a number they never saw.
//
// The student's complaint and the Dean's reason stay on screen throughout. A
// correction made without its justification in view is how the wrong one gets
// made.

export default function ApplyMilestoneCorrection() {
  const { requestId } = useParams();
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [request, setRequest] = useState(null);
  const [targets, setTargets] = useState([]);
  const [draft, setDraft] = useState({});
  const [preview, setPreview] = useState(null);
  const [previewSig, setPreviewSig] = useState('');

  const [loading, setLoading] = useState(true);
  const [previewing, setPreviewing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const all = await fetchGradeChangeRequests();
      const found = all.find((r) => r.requestId === requestId);
      if (!found) {
        setError('That request could not be found, or it is not yours to act on.');
        return;
      }
      setRequest(found);

      if (found.status === REQUEST_STATUS.APPROVED) {
        const items = await fetchMilestoneCorrectionTargets(requestId);
        setTargets(items);
        setDraft(Object.fromEntries(items.map((t) => [
          t.key, t.originalScore === null || t.originalScore === undefined ? '' : String(t.originalScore)
        ])));
      }
    } catch (err) {
      setError(toUserMessage(err, 'Could not open that correction.'));
    } finally {
      setLoading(false);
    }
  }, [requestId]);

  useEffect(() => { load(); }, [load]);

  // Only the items the instructor actually altered are sent. Submitting
  // untouched scores would rewrite rows that never changed and make the audit
  // trail claim more happened than did.
  const scoreChanges = targets.flatMap((t) => {
    const raw = draft[t.key];
    if (raw === '' || raw === null || raw === undefined) return [];
    const value = Number(raw);
    if (!Number.isFinite(value)) return [];
    const was = t.originalScore === null || t.originalScore === undefined ? null : Number(t.originalScore);
    if (was !== null && was === value) return [];
    return [{
      target_key: t.key,
      target_type: t.targetType,
      activity_id: t.activityId,
      term: t.term,
      field: t.field,
      new_score: value
    }];
  });

  const invalid = targets.filter((t) => {
    const raw = draft[t.key];
    if (raw === '' || raw === null || raw === undefined) return false;
    const value = Number(raw);
    return !Number.isFinite(value) || value < 0 || value > t.maxScore;
  });

  const signature = correctionSignature(scoreChanges);
  const previewIsCurrent = !!preview && previewSig === signature;
  const canApply = previewIsCurrent && scoreChanges.length > 0 && invalid.length === 0 && !applying;

  const setScore = (key, value) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    // Any edit invalidates the preview. That is the whole point of the guard.
    setPreview(null);
    setPreviewSig('');
  };

  const handlePreview = async () => {
    if (!scoreChanges.length || invalid.length) return;
    setPreviewing(true);
    setError('');
    try {
      const result = await previewMilestoneCorrection({ requestId, scoreChanges });
      setPreview(result);
      setPreviewSig(signature);
    } catch (err) {
      setError(toUserMessage(err, 'The recalculated grade could not be checked.'));
    } finally {
      setPreviewing(false);
    }
  };

  const handleApply = async () => {
    if (!canApply) return;
    setApplying(true);
    setError('');
    try {
      const result = await applyMilestoneCorrection({ requestId, scoreChanges });
      await logActivity(
        'Applied Grade Correction',
        `${resolveActorName(profile, user)} applied an approved ${MILESTONE_LABEL[request.gradePeriod] || 'milestone'} correction for ${request.studentName} in ${request.subjectCode}. ${scoreChanges.length} score(s) changed; rating is now ${result?.proposed_rating ?? result?.rating ?? 'recalculated'}.`,
        resolveActorName(profile, user)
      );
      setDone(true);
      setConfirm(false);
    } catch (err) {
      setError(toUserMessage(err, 'The correction was not applied. No score was changed.'));
      setConfirm(false);
    } finally {
      setApplying(false);
    }
  };

  const byTerm = targets.reduce((acc, t) => {
    (acc[t.term] = acc[t.term] || []).push(t);
    return acc;
  }, {});

  return (
    <>
      <PageHeader title="Apply Correction" breadcrumb="Faculty Portal">
        <button
          onClick={() => navigate('/faculty/graderequests')}
          className="px-3.5 py-2 text-xs font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back to requests</span>
        </button>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {done && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              The correction has been applied and the student has been notified.{' '}
              <button
                onClick={() => navigate('/faculty/graderequests')}
                className="underline font-semibold cursor-pointer"
              >
                Back to requests
              </button>
            </span>
          </div>
        )}

        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : !request ? null : (
          <>
            {/* ── Why this correction exists ───────────────────────────── */}
            <section className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5 space-y-2.5">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-slate-900">
                    {request.studentName}
                    {request.studentNumber && (
                      <span className="font-mono font-normal text-slate-500"> · {request.studentNumber}</span>
                    )}
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {request.subjectCode} {request.sectionName && <>· {request.sectionName} </>}
                    · {MILESTONE_LABEL[request.gradePeriod] || request.gradePeriod}
                  </p>
                </div>
                {request.originalGrade != null && (
                  <span className="text-right">
                    <span className="text-micro font-bold text-slate-400 uppercase tracking-wide block">Current</span>
                    <span className="font-mono text-lg font-extrabold text-slate-800">{request.originalGrade}</span>
                  </span>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 space-y-1.5">
                <p className="text-[11px] sm:text-xs text-slate-700">
                  <span className="font-semibold">{request.reasonLabel}.</span> {request.reasonDetail}
                </p>
                {request.facultyNote && (
                  <p className="text-[11px] text-slate-700 border-t border-slate-200 pt-1.5">
                    <span className="font-semibold">Your note:</span> {request.facultyNote}
                  </p>
                )}
                {request.deanNote && (
                  <p className="text-[11px] text-slate-700 border-t border-slate-200 pt-1.5">
                    <span className="font-semibold">Dean approved:</span> {request.deanNote}
                  </p>
                )}
              </div>

              <GradeChangeChain status={request.status} reachedRegistrar={request.reachedRegistrar} className="mb-2" />
              <EvidenceGallery request={request} />
            </section>

            {request.status !== REQUEST_STATUS.APPROVED ? (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 text-xs text-amber-900 flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>
                  This request is not awaiting a correction. Only an approved request can be
                  applied, and this one is currently <strong>{request.status.replace(/_/g, ' ')}</strong>.
                </span>
              </div>
            ) : done ? null : (
              <>
                {/* ── The scores that feed this rating ──────────────────── */}
                <section className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5 space-y-3.5">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-slate-900">
                      Correct the scores
                    </h2>
                    <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                      Only the terms that feed this rating are shown. Changing them recalculates
                      this rating alone — no later grade is affected.
                    </p>
                  </div>

                  {Object.keys(byTerm).length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No editable scores were found for this rating.
                    </p>
                  ) : (
                    Object.entries(byTerm).map(([term, items]) => (
                      <div key={term} className="space-y-1.5">
                        <span className="text-micro font-bold text-slate-400 uppercase tracking-wide block">
                          {term}
                        </span>
                        <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100">
                          {items.map((t) => {
                            const raw = draft[t.key];
                            const value = Number(raw);
                            const bad = raw !== '' && raw != null
                              && (!Number.isFinite(value) || value < 0 || value > t.maxScore);
                            const changed = scoreChanges.some((c) => c.target_key === t.key);
                            return (
                              <div key={t.key} className="flex items-center justify-between gap-2 px-3 py-2">
                                <span className="text-[11px] sm:text-xs text-slate-700 min-w-0 truncate">
                                  {t.label}
                                  {changed && (
                                    <span className="ml-1.5 text-micro font-bold uppercase tracking-wide text-sage-700">
                                      changed
                                    </span>
                                  )}
                                </span>
                                <span className="flex items-center gap-1.5 flex-shrink-0">
                                  <input
                                    type="number"
                                    min="0"
                                    max={t.maxScore}
                                    value={raw ?? ''}
                                    onChange={(e) => setScore(t.key, e.target.value)}
                                    className={cn(
                                      'w-20 px-2 py-1.5 text-xs font-mono text-right bg-white border rounded-lg outline-none',
                                      bad
                                        ? 'border-rose-400 focus:border-rose-500'
                                        : changed
                                          ? 'border-sage-400 focus:border-sage-500'
                                          : 'border-slate-200 focus:border-sage-400'
                                    )}
                                  />
                                  <span className="text-[11px] text-slate-400 font-mono w-10">
                                    / {t.maxScore}
                                  </span>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  )}

                  {invalid.length > 0 && (
                    <p className="text-[11px] text-rose-700">
                      Every score must be between zero and its maximum.
                    </p>
                  )}
                </section>

                {/* ── Check, then apply ─────────────────────────────────── */}
                <section className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5 space-y-3">
                  <button
                    onClick={handlePreview}
                    disabled={!scoreChanges.length || invalid.length > 0 || previewing}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                  >
                    {previewing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Calculator className="h-3.5 w-3.5" />}
                    {previewing ? 'Checking…' : 'Check the new rating'}
                  </button>

                  {!scoreChanges.length && (
                    <p className="text-[11px] text-slate-400">Change at least one score first.</p>
                  )}

                  {preview && previewIsCurrent && (
                    <div className="bg-sage-50 border border-sage-200 rounded-xl px-3 py-2.5 space-y-1">
                      <p className="text-xs text-slate-800">
                        <span className="font-semibold">
                          {MILESTONE_LABEL[request.gradePeriod] || 'Rating'}
                        </span>{' '}
                        <span className="font-mono">{preview.original_rating ?? '—'}</span>
                        {' → '}
                        <span className="font-mono font-bold">{preview.proposed_rating ?? '—'}</span>
                      </p>
                      <p className="text-[11px] text-slate-600">
                        Calculated by the system from the corrected scores. Applying writes exactly
                        this.
                      </p>
                    </div>
                  )}

                  {preview && !previewIsCurrent && (
                    <p className="text-[11px] text-amber-700">
                      You changed a score after checking. Check again before applying.
                    </p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap border-t border-slate-100 pt-3">
                    <button
                      onClick={() => setConfirm(true)}
                      disabled={!canApply}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    >
                      {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
                      {applying ? 'Applying…' : 'Apply the correction'}
                    </button>
                    {!canApply && !applying && (
                      <span className="text-[10px] sm:text-xs text-slate-400">
                        {!scoreChanges.length
                          ? 'Nothing has changed yet'
                          : invalid.length
                            ? 'Fix the scores outside their range'
                            : 'Check the new rating first'}
                      </span>
                    )}
                  </div>
                </section>
              </>
            )}
          </>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[11px] sm:text-xs text-slate-600 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            This affects only this rating. If a later grade needs correcting as a result, it takes
            its own request — that is deliberate, so no grade changes without someone approving it.
          </span>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirm}
        onCancel={() => setConfirm(false)}
        onConfirm={handleApply}
        title="Apply this correction?"
        message={`${scoreChanges.length} score${scoreChanges.length === 1 ? '' : 's'} will be corrected and ${request?.studentName || 'the student'}'s ${MILESTONE_LABEL[request?.gradePeriod] || 'rating'} recalculated to ${preview?.proposed_rating ?? 'the checked figure'}. The student is notified, and the change is recorded against this request.`}
      />
    </>
  );
}
