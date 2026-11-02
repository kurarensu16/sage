import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import ConfirmModal from '../../components/ConfirmModal';
import {
  FileWarning, AlertTriangle, CheckCircle2, Loader2, Info, Paperclip, X,
  Lock, FileText, Camera
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { toUserMessage } from '../../lib/errorMessages';
import { cn } from '../../lib/utils';
import { MILESTONE_LABEL } from '../../lib/milestoneState';
import { downscaleImage } from '../../lib/imageDownscale';
import {
  REASON_TYPES, fetchDisputableMilestones, submitGradeChangeRequest,
  uploadEvidenceFile, describeEvidenceFile, isImageEvidence,
  EVIDENCE_ACCEPT_ATTR, EVIDENCE_MIN_FILES, EVIDENCE_MAX_FILES
} from '../../lib/gradeChangeRequestService';

// A student disputes a grade they believe is wrong.
//
// ONLY FINALIZED MILESTONES APPEAR HERE.
// While a consultation window is open the instructor can still correct the
// grade directly -- that is what the Grade Consultation Log is for, and a formal
// request would be slower for everyone. The list of what can be disputed comes
// from the server, because the rule about what counts as finalized already
// exists in SQL and a second copy here would eventually disagree with it.
//
// EVIDENCE IS REQUIRED (owner's decision, 2026-10-30), one to three files.
// Photographs are shrunk in the browser before upload, so a phone picture of an
// activity sheet -- routinely 4-8 MB -- never meets a size error. Files are
// uploaded before the request is created, so there is no state where a dispute
// exists with nothing attached: either everything lands, or nothing does.

export default function SubmitGradeChangeRequest() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [selected, setSelected] = useState(null);
  const [reasonType, setReasonType] = useState('');
  const [detail, setDetail] = useState('');
  const [files, setFiles] = useState([]);          // { id, file, previewUrl }
  const [preparing, setPreparing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setOptions(await fetchDisputableMilestones());
    } catch (err) {
      setError(toUserMessage(err, 'Could not load your grades.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Object URLs are a browser resource, not garbage. Released when the page
  // goes away, so a student who picks and removes several photos does not leak.
  useEffect(() => () => {
    files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = async (chosen) => {
    const room = EVIDENCE_MAX_FILES - files.length;
    if (room <= 0) return;
    setPreparing(true);
    setError('');

    const accepted = [];
    try {
      for (const raw of Array.from(chosen).slice(0, room)) {
        // Shrink first, then check: a 7 MB photo becomes a 600 KB one and passes,
        // which is the whole point of doing this before validating.
        const file = (await downscaleImage(raw)) || raw;
        const check = describeEvidenceFile(file);
        if (!check.ok) {
          setError(raw.name + ': ' + check.message);
          continue;
        }
        accepted.push({
          id: Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          file,
          previewUrl: isImageEvidence(file.type) ? URL.createObjectURL(file) : ''
        });
      }
      setFiles((prev) => [...prev, ...accepted]);
    } catch (err) {
      // Without this the throw escaped, preparing stayed true, and the input
      // stayed disabled -- the button simply stopped working, with nothing on
      // screen and nothing in the console to say why.
      console.error('[ASPIRE] could not prepare the attachment:', err);
      setError('That file could not be prepared. Try a different photo, or save it as a PDF.');
    } finally {
      setPreparing(false);
    }
  };

  const removeFile = (id) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const detailOk = detail.trim().length >= 20;
  const filesOk = files.length >= EVIDENCE_MIN_FILES;
  const canSubmit = selected && !selected.hasOpenRequest && reasonType && detailOk && filesOk && !preparing;

  const blockedBecause = !selected
    ? 'Choose the grade you are asking about'
    : selected.hasOpenRequest
      ? 'You already have a request open for this grade'
      : !reasonType
        ? 'Choose what the problem is'
        : !detailOk
          ? 'Explain what happened in a little more detail'
          : !filesOk
            ? 'Attach at least one photo or file'
            : preparing
              ? 'Preparing your file…'
              : '';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      // Upload first. If any file fails, nothing is submitted at all -- better
      // than a dispute that exists without the evidence it is supposed to carry.
      const keys = [];
      for (let i = 0; i < files.length; i += 1) {
        setProgress('Uploading file ' + (i + 1) + ' of ' + files.length + '…');
        const up = await uploadEvidenceFile({ userId: user?.id, file: files[i].file });
        keys.push(up.objectKey);
      }

      setProgress('Sending your request…');
      await submitGradeChangeRequest({
        postedGradeId: selected.postedGradeId,
        reasonType,
        reasonDetail: detail.trim(),
        evidenceKeys: keys
      });

      setNotice('Your request has been sent to your instructor.');
      files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      setSelected(null);
      setReasonType('');
      setDetail('');
      setFiles([]);
      setConfirm(false);
      await load();
    } catch (err) {
      setError(toUserMessage(err, 'Could not send your request.'));
      setConfirm(false);
    } finally {
      setSaving(false);
      setProgress('');
    }
  };

  return (
    <>
      <PageHeader title="Ask About a Grade" breadcrumb="Student Portal" />

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
            <span>
              {notice}{' '}
              <button
                onClick={() => navigate('/student/graderequests')}
                className="underline font-semibold cursor-pointer"
              >
                See your requests
              </button>
            </span>
          </div>
        )}

        <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[11px] sm:text-xs text-slate-600 flex items-start gap-2">
          <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>
            Use this when a grade has been <strong>finalized</strong> and you believe it is wrong.
            If a grade still shows <strong>Not Final</strong>, speak to your instructor instead —
            they can correct it directly, which is faster.
          </span>
        </div>

        {/* ── 1. Which grade ───────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5 space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-sage-50 border border-sage-200 flex items-center justify-center flex-shrink-0">
              <FileWarning className="h-4.5 w-4.5 text-sage-600" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900">Which grade are you asking about?</h2>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                Only finalized grades can be disputed.
              </p>
            </div>
          </div>

          {loading ? (
            <p className="text-xs text-slate-400">Loading your grades…</p>
          ) : options.length === 0 ? (
            <div className="border border-slate-200 rounded-xl p-6 flex flex-col items-center text-center">
              <Lock className="h-7 w-7 text-slate-300 stroke-1 mb-2" />
              <p className="text-sm font-medium text-slate-600">Nothing to dispute yet</p>
              <p className="text-xs text-slate-400 mt-1 max-w-sm">
                None of your grades have been finalized, or the period for raising a question has
                closed.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {options.map((o) => {
                const chosen = selected?.postedGradeId === o.postedGradeId;
                return (
                  <button
                    key={o.postedGradeId}
                    onClick={() => setSelected(o)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 rounded-xl border transition-colors cursor-pointer',
                      chosen
                        ? 'bg-sage-50 border-sage-300 ring-1 ring-sage-200'
                        : 'bg-white border-slate-200 hover:border-slate-300',
                      o.hasOpenRequest && 'opacity-70'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-slate-900">
                          {o.subjectCode} — {MILESTONE_LABEL[o.gradePeriod] || o.gradePeriod}
                        </span>
                        <span className="block text-[11px] text-slate-500 mt-0.5">
                          {o.subjectName}
                          {o.sectionName && <> · {o.sectionName}</>}
                          {o.facultyName && <> · {o.facultyName}</>}
                        </span>
                      </div>
                      <span className="font-mono text-sm font-bold text-slate-800 flex-shrink-0">
                        {o.effectiveGrade ?? '—'}
                      </span>
                    </div>
                    {o.hasOpenRequest && (
                      <span className="block text-[11px] text-amber-800 mt-1.5">
                        You already have a request open for this grade. Wait for it to be resolved
                        before raising another.
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* ── 2. What is wrong ─────────────────────────────────────────── */}
        {selected && !selected.hasOpenRequest && (
          <section className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5 space-y-3.5">
            <h2 className="text-sm sm:text-base font-bold text-slate-900">What seems to be wrong?</h2>

            <div className="space-y-1.5">
              {REASON_TYPES.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setReasonType(r.id)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 rounded-xl border transition-colors cursor-pointer',
                    r.id === reasonType
                      ? 'bg-sage-50 border-sage-300 ring-1 ring-sage-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  )}
                >
                  <span className="text-xs font-bold text-slate-900 block">{r.label}</span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">{r.help}</span>
                </button>
              ))}
            </div>

            <div>
              <label className="text-[11px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
                Explain what happened
              </label>
              <textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                rows={4}
                placeholder="For example: my activity sheet for Lab 3 shows 18/20, but the class record shows 15/20."
                className="w-full px-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400 resize-y"
              />
              <p className={cn(
                'text-[10px] mt-1',
                detail.trim().length > 0 && !detailOk ? 'text-amber-700' : 'text-slate-400'
              )}>
                Be specific — which activity, what you expected, and why. Your instructor and the
                Dean read this exactly as you write it.
              </p>
            </div>

            {/* ── Evidence, required ─────────────────────────────────── */}
            <div className="border-t border-slate-100 pt-3.5">
              <label className="text-[11px] sm:text-xs font-semibold text-slate-600 uppercase tracking-wider block mb-1.5">
                Attach proof <span className="text-rose-600">*</span>
                <span className="font-normal normal-case text-slate-400 ml-1">
                  {files.length} of {EVIDENCE_MAX_FILES}
                </span>
              </label>

              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {files.map((f) => (
                    <div key={f.id} className="relative w-24 h-24 rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                      {f.previewUrl ? (
                        <img src={f.previewUrl} alt={f.file.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-slate-500">
                          <FileText className="h-5 w-5" />
                          <span className="text-[10px] px-1">PDF</span>
                        </div>
                      )}
                      <button
                        onClick={() => removeFile(f.id)}
                        aria-label={'Remove ' + f.file.name}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-slate-900/70 text-white flex items-center justify-center hover:bg-slate-900 cursor-pointer"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {files.length < EVIDENCE_MAX_FILES && (
                <label className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 text-xs font-bold transition-colors',
                  preparing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 cursor-pointer'
                )}>
                  {preparing
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : files.length === 0 ? <Camera className="h-3.5 w-3.5" /> : <Paperclip className="h-3.5 w-3.5" />}
                  {/* The input has always accepted PDF as well as images, so a
                      label naming only a photo understated what the student may
                      send — and a student with a scanned PDF of the returned
                      paper would reasonably conclude it was not allowed. */}
                  {preparing ? 'Preparing…' : files.length === 0 ? 'Add a photo or PDF' : 'Add another'}
                  <input
                    type="file"
                    accept={EVIDENCE_ACCEPT_ATTR}
                    multiple
                    disabled={preparing}
                    className="hidden"
                    onChange={(e) => {
                      // Array.from FIRST. e.target.files is a live FileList
                      // owned by the input, so clearing value on the next line
                      // empties the very object we are holding -- the guard
                      // then saw length 0, addFiles never ran, and nothing
                      // threw. A silent failure with an empty console.
                      //
                      // value is still cleared so re-picking the same file
                      // fires change again.
                      const chosen = Array.from(e.target.files || []);
                      e.target.value = '';
                      if (chosen.length) addFiles(chosen);
                    }}
                  />
                </label>
              )}

              <p className="text-[10px] text-slate-400 mt-1.5">
                Required. A photo of the returned paper or activity sheet is what resolves these
                fastest — on a phone, the picker offers your camera. Up to {EVIDENCE_MAX_FILES} files,
                JPG, PNG, WebP or PDF. Photos are shrunk automatically, so large pictures are fine.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                onClick={() => setConfirm(true)}
                disabled={!canSubmit || saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sage-600 text-white text-xs font-bold hover:bg-sage-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileWarning className="h-3.5 w-3.5" />}
                {saving ? (progress || 'Sending…') : 'Send to my instructor'}
              </button>
              {!canSubmit && !saving && (
                <span className="text-[10px] sm:text-xs text-slate-400">{blockedBecause}</span>
              )}
            </div>
          </section>
        )}
      </div>

      <ConfirmModal
        isOpen={confirm}
        onCancel={() => setConfirm(false)}
        onConfirm={handleSubmit}
        title="Send this request?"
        message={'Your instructor will see your explanation and ' + (files.length === 1 ? 'your attachment' : 'your ' + files.length + ' attachments') + ', and can pass it to the Dean for a decision. You can withdraw it while it is still being reviewed.'}
      />
    </>
  );
}
