// Grade change requests: the rules that are pure functions of their input.
//
// Kept apart from gradeChangeRequestService.js on purpose. That module opens a
// Supabase client, which cannot be imported outside a browser, and the logic
// here decides whether a student can file a dispute at all. Splitting it out is
// what lets the verify scripts assert it — the same split that caught a real
// defect in the Phase 5 milestone states.
//
// Nothing here talks to the network. If a function in this file needs a
// database, it belongs in the service instead.

// Explicit extension: the verify scripts load this in Node, which does not
// resolve extensionless specifiers the way Vite does.
import { GRADE_MILESTONES } from './gradeMilestones.js';

// --- Vocabulary ------------------------------------------------------------

// Fixed, not free text. Free text alone makes disputes impossible to count, and
// counting them is how a pattern in one class becomes visible.
export const REASON_TYPES = Object.freeze([
  {
    id: 'computation_error',
    label: 'The computation looks wrong',
    help: 'The individual scores look right, but the total or the grade does not follow from them.'
  },
  {
    id: 'missing_or_incorrect_score',
    label: 'A score is missing or incorrect',
    help: 'A specific activity, quiz or exam score does not match what was returned to you.'
  },
  {
    id: 'technical_issue',
    label: 'Something went wrong in the system',
    help: 'A submission or score did not record properly, or the system behaved unexpectedly.'
  },
  {
    id: 'other',
    label: 'Something else',
    help: 'Anything the options above do not cover. Explain it below.'
  }
]);

export const REASON_LABEL = Object.freeze(
  Object.fromEntries(REASON_TYPES.map((r) => [r.id, r.label]))
);

// Each waiting state names who is holding it. "Pending" alone never told
// anyone whose turn it was.
export const REQUEST_STATUS = Object.freeze({
  PENDING_FACULTY: 'pending_faculty_review',
  PENDING_DEAN: 'pending_dean_review',
  // Only reached when a request outlives the dispute window: the term's records
  // are settled by then, and the Registrar owns them.
  PENDING_REGISTRAR: 'pending_registrar_review',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  APPLIED: 'applied',
  CANCELLED: 'cancelled'
});

export const STATUS_PRESENTATION = Object.freeze({
  [REQUEST_STATUS.PENDING_FACULTY]: {
    label: 'With your instructor',
    tone: 'bg-amber-50 text-amber-700 border-amber-200',
    student: 'Your instructor is reviewing this.'
  },
  [REQUEST_STATUS.PENDING_DEAN]: {
    label: 'With the Dean',
    tone: 'bg-sky-50 text-sky-700 border-sky-200',
    student: 'Your instructor has passed this to the Dean for a decision.'
  },
  [REQUEST_STATUS.PENDING_REGISTRAR]: {
    label: 'With the Registrar',
    tone: 'bg-violet-50 text-violet-700 border-violet-200',
    student: 'Approved by the Dean. Because the term has already closed, the Registrar is authorising the change.'
  },
  [REQUEST_STATUS.APPROVED]: {
    label: 'Approved',
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    student: 'Approved. Your instructor will correct the grade.'
  },
  [REQUEST_STATUS.APPLIED]: {
    label: 'Corrected',
    tone: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    student: 'The correction has been applied to your grade.'
  },
  [REQUEST_STATUS.REJECTED]: {
    label: 'Not approved',
    tone: 'bg-rose-50 text-rose-700 border-rose-200',
    student: 'This was reviewed and not approved. The reason is below.'
  },
  [REQUEST_STATUS.CANCELLED]: {
    label: 'Withdrawn',
    tone: 'bg-slate-50 text-slate-600 border-slate-200',
    student: 'You withdrew this request.'
  }
});

// A dispute is only possible once a milestone is final. Before that the
// consultation window is the right channel and the grade can still be corrected
// directly, which is faster for everyone.
export const DISPUTABLE_MILESTONES = Object.freeze([
  GRADE_MILESTONES.MIDTERM_RATING,
  GRADE_MILESTONES.TENTATIVE_FINAL_RATING,
  GRADE_MILESTONES.SEMESTRAL_GRADE
]);

// Open means someone still has to act. Missing a state here would strand a
// student: withdrawing and attaching are both gated on it, so a request sitting
// with the Registrar would become uneditable and un-withdrawable.
export const isOpenStatus = (status) =>
  status === REQUEST_STATUS.PENDING_FACULTY
  || status === REQUEST_STATUS.PENDING_DEAN
  || status === REQUEST_STATUS.PENDING_REGISTRAR;

// --- Evidence --------------------------------------------------------------

export const EVIDENCE_BUCKET = 'grade-evidence';
export const EVIDENCE_STORES = Object.freeze({ SUPABASE: 'supabase', R2: 'r2' });

export const EVIDENCE_MIN_FILES = 1;
export const EVIDENCE_MAX_FILES = 3;

// 5 MB after downscaling, which a 2000px JPEG is comfortably under. The bucket
// enforces the same limit, so this is a courtesy message rather than the control.
export const EVIDENCE_MAX_BYTES = 5 * 1024 * 1024;
export const EVIDENCE_ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
export const EVIDENCE_ACCEPT_ATTR = EVIDENCE_ACCEPTED.join(',');

export const isImageEvidence = (type) => !!type && type.startsWith('image/');

// Browsers do not always report a type. A file picked from a file manager, or
// dragged from some apps, can arrive with an empty string — so the extension is
// the fallback rather than an immediate refusal of a perfectly good photo.
const EXTENSION_TYPES = Object.freeze({
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', pdf: 'application/pdf',
  heic: 'image/heic', heif: 'image/heif'
});

export function resolveFileType(file) {
  if (file?.type) return file.type;
  const ext = (file?.name || '').split('.').pop()?.toLowerCase();
  return EXTENSION_TYPES[ext] || '';
}

export function describeEvidenceFile(file) {
  if (!file) return { ok: false, message: 'Choose a file to attach.' };

  const type = resolveFileType(file);

  // iPhones photograph in HEIC. downscaleImage() converts it to JPEG first and
  // succeeds on any Apple device, which is where HEIC comes from in the first
  // place. So reaching this point means the conversion could not happen —
  // almost always a HEIC copied onto a Windows PC and uploaded through a
  // browser that cannot decode it.
  if (type === 'image/heic' || type === 'image/heif') {
    return {
      ok: false,
      message: 'This photo is in iPhone format, and this browser cannot read it. Attach it from the iPhone itself, or open it and save a copy as JPEG first.'
    };
  }

  if (!EVIDENCE_ACCEPTED.includes(type)) {
    return { ok: false, message: 'Attach a photo (JPG, PNG or WebP) or a PDF.' };
  }
  if (file.size > EVIDENCE_MAX_BYTES) {
    return {
      ok: false,
      message: 'That file is still larger than 5 MB after shrinking. Try a PDF saved at a smaller size.'
    };
  }
  return { ok: true, message: '' };
}

// Scoped to the student, not the request: the request does not exist yet,
// because evidence is required to create it.
//
// The first path segment MUST be the uploader's id. Both the storage policy and
// submit_grade_change_request() check it, so a change to this shape silently
// breaks every submission.
export function evidenceObjectPath(userId, fileName) {
  const safe = (fileName || 'evidence').replace(/[^A-Za-z0-9._-]/g, '_').slice(-120);
  return `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safe}`;
}

// The name the uploader saw, read back out of the key above. Kept next to the
// builder so the two cannot drift: the prefix is exactly two underscore-free
// fields, which is what makes slice(2) safe even for a name full of them.
export function evidenceFileName(objectKey) {
  const base = String(objectKey || '').split('/').pop();
  if (!base) return 'attachment';
  const parts = base.split('_');
  return parts.length > 2 ? parts.slice(2).join('_') : base;
}

// The type of a stored attachment, worked out from its key.
//
// submit_grade_change_request() and attach_grade_change_evidence() insert
// (request_id, object_key, storage, uploaded_by) and nothing else, so
// grade_change_evidence.content_type is NULL on every row ever written. The
// gallery asked isImageEvidence(null), got false, and labelled a photograph
// "Open PDF".
//
// Recovering it from the key rather than backfilling the column fixes the rows
// that already exist, which a migration writing types for NEW uploads would
// not. evidenceObjectPath keeps the original file name, extension included, so
// the answer is already in the key.
export function evidenceTypeFromKey(objectKey) {
  const ext = evidenceFileName(objectKey).split('.').pop()?.toLowerCase();
  return EXTENSION_TYPES[ext] || '';
}

// --- Corrections -----------------------------------------------------------

// A fingerprint of exactly what was previewed. If a score changes after the
// preview, this stops Apply going ahead on a figure nobody actually saw.
//
// Order-independent by construction: the same edits made in a different order
// are the same correction, and treating them as different would invalidate a
// preview for no reason the instructor could see.
export function correctionSignature(scoreChanges = []) {
  return JSON.stringify(
    [...scoreChanges]
      .map((c) => [c.target_key, c.new_score])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
  );
}
