import { supabase } from './supabase';
import {
  EVIDENCE_BUCKET, EVIDENCE_STORES, REASON_LABEL,
  describeEvidenceFile, evidenceObjectPath, resolveFileType, evidenceTypeFromKey
} from './gradeChangeRules';

// The pure rules live in gradeChangeRules.js so the verify scripts can load
// them without a browser. Re-exported here so every page keeps one import.
export {
  REASON_TYPES, REASON_LABEL, REQUEST_STATUS, STATUS_PRESENTATION,
  DISPUTABLE_MILESTONES, isOpenStatus, EVIDENCE_BUCKET, EVIDENCE_STORES,
  EVIDENCE_MIN_FILES, EVIDENCE_MAX_FILES, EVIDENCE_MAX_BYTES,
  EVIDENCE_ACCEPTED, EVIDENCE_ACCEPT_ATTR, isImageEvidence,
  resolveFileType, describeEvidenceFile, evidenceObjectPath, correctionSignature,
  evidenceTypeFromKey
} from './gradeChangeRules';

// Grade change requests: a student disputes a FINALIZED milestone, faculty
// validates, the dean decides, faculty applies the correction.
//
// Separate from gradeCorrectionService.js, which carries the older
// faculty-raised SG correction flow. Both write to remark_override_requests;
// submitted_by_role tells them apart.
//
// WHY A SEPARATE SUBMISSION RPC
// submit_sg_correction_request takes a proposed remark, a proposed effective
// grade and proposed score changes. A student must never be able to supply any
// of those -- a dispute says "this looks wrong, here is why", not "set my grade
// to 1.25". Keeping the student path on its own function means the refusal is
// the signature, not a branch somebody can later forget to guard.
//
// Migration: see the Phase 6 migration (written last, per the owner's
// preference to apply migrations at the end of a phase).

// Fixed vocabulary. Free text alone makes disputes impossible to count, and
// counting them is how a pattern in one class becomes visible.
// The chain. Each state names who is holding it, because "pending" alone never
// told anyone whose turn it was.
// A dispute is only possible once a milestone is final. Before that the
// consultation window (Phase 5) is the right channel, and the grade can still
// be corrected directly -- no formal request needed.
// --- Student ---------------------------------------------------------------

/**
 * Raise the dispute. Returns { request_id, status }.
 *
 * The files are uploaded FIRST and their keys passed here, because evidence is
 * required and so the request cannot exist without it. The server re-checks
 * that every key belongs to the calling student and that the count is within
 * range, so neither rule depends on this page behaving.
 *
 * Creating the row and recording its evidence happen in one transaction: there
 * is no state where a dispute exists with nothing attached.
 */
export async function submitGradeChangeRequest({
  postedGradeId,
  reasonType,
  reasonDetail,
  evidenceKeys = [],
  evidenceStorage = EVIDENCE_STORES.SUPABASE
}) {
  const { data, error } = await supabase.rpc('submit_grade_change_request', {
    p_posted_grade_id: postedGradeId,
    p_reason_type: reasonType,
    p_reason_detail: reasonDetail,
    p_evidence_keys: evidenceKeys,
    p_evidence_storage: evidenceStorage
  });
  if (error) throw error;
  return data;
}

export async function withdrawGradeChangeRequest(requestId) {
  const { data, error } = await supabase.rpc('withdraw_grade_change_request', {
    p_request_id: requestId
  });
  if (error) throw error;
  return data;
}

/**
 * The milestones this student could dispute, with whether each already has an
 * open request.
 *
 * Read through an RPC rather than assembled here: deciding what is disputable
 * means knowing whether a consultation window is finalized, and that rule
 * already exists in SQL as milestone_edits_frozen(). Re-deriving it in
 * JavaScript would be a second copy that eventually disagrees.
 */
export async function fetchDisputableMilestones() {
  const { data, error } = await supabase.rpc('student_disputable_milestones');
  if (error) throw error;
  return (data || []).map(normalizeDisputable);
}

function normalizeDisputable(row) {
  return {
    postedGradeId: row.posted_grade_id,
    classRecordId: row.class_record_id,
    gradePeriod: row.grade_period,
    subjectCode: row.subject_code,
    subjectName: row.subject_name,
    sectionName: row.section_name,
    facultyName: row.faculty_name,
    schoolYear: row.school_year,
    semester: row.semester,
    effectiveGrade: row.effective_grade,
    remarks: row.remarks,
    postedAt: row.posted_at,
    hasOpenRequest: !!row.has_open_request,
    openRequestId: row.open_request_id || null
  };
}

// --- Shared reads ----------------------------------------------------------

/**
 * Requests visible to the caller. RLS decides what that means per role:
 * a student sees their own at any stage, plus faculty-raised ones about their
 * grades once those are resolved; faculty see their classes'; the dean sees
 * their college's.
 */
export async function fetchGradeChangeRequests({ statuses = null } = {}) {
  let query = supabase
    .from('remark_override_requests')
    .select(`
      request_id, status, reason_type, reason_detail, grade_period,
      submitted_by_role, faculty_note, dean_note, registrar_note,
      requires_registrar, requested_at, resolved_at,
      posted_grade_id, class_record_id, student_id,
      original_effective_grade, final_remark,
      grade_change_evidence ( id, object_key, storage, content_type, uploaded_at ),
      student:student_id (first_name, last_name, user_number),
      requester:requested_by (first_name, last_name),
      class_records:class_record_id (
        school_year, semester,
        subjects:subject_id (code, name),
        sections:section_id (name),
        faculty:faculty_id (first_name, last_name)
      )
    `)
    .order('requested_at', { ascending: false });

  if (statuses?.length) query = query.in('status', statuses);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(normalizeRequest);
}

function normalizeRequest(row) {
  const cls = row.class_records;
  return {
    requestId: row.request_id,
    status: row.status,
    reasonType: row.reason_type,
    reasonLabel: REASON_LABEL[row.reason_type] || 'Not stated',
    reasonDetail: row.reason_detail,
    gradePeriod: row.grade_period,
    submittedByRole: row.submitted_by_role,
    facultyNote: row.faculty_note,
    deanNote: row.dean_note,
    registrarNote: row.registrar_note,
    // Set when the Dean approves a request that has outlived the dispute
    // window: the term is closed by then, so the Registrar must authorise
    // reopening it before the correction can be made.
    reachedRegistrar: !!row.requires_registrar,
    requestedAt: row.requested_at,
    resolvedAt: row.resolved_at,
    evidence: (row.grade_change_evidence || []).map((e) => ({
      id: e.id,
      objectKey: e.object_key,
      storage: e.storage,
      // The column is NULL on every row the chain has ever written -- neither
      // RPC records it -- so the key's extension is the real source. Kept as a
      // fallback rather than a replacement, so a row that DOES carry a type
      // still wins.
      contentType: e.content_type || evidenceTypeFromKey(e.object_key),
      uploadedAt: e.uploaded_at
    })),
    postedGradeId: row.posted_grade_id,
    classRecordId: row.class_record_id,
    studentId: row.student_id,
    originalGrade: row.original_effective_grade,
    finalRemark: row.final_remark,
    studentName: `${row.student?.last_name || ''}, ${row.student?.first_name || ''}`.trim().replace(/^,\s*/, ''),
    studentNumber: row.student?.user_number || '',
    requesterName: `${row.requester?.first_name || ''} ${row.requester?.last_name || ''}`.trim(),
    subjectCode: cls?.subjects?.code || '',
    subjectName: cls?.subjects?.name || '',
    sectionName: cls?.sections?.name || '',
    facultyName: `${cls?.faculty?.first_name || ''} ${cls?.faculty?.last_name || ''}`.trim(),
    schoolYear: cls?.school_year || '',
    semester: cls?.semester || ''
  };
}

// --- Faculty ---------------------------------------------------------------

/**
 * The faculty validation step: a lightweight gate, not a second full review.
 * Either this dispute is clearly invalid -- wrong class, duplicate, already
 * corrected -- or it goes to the Dean with context the Dean would not have.
 */
export async function facultyReviewRequest({ requestId, decision, facultyNote }) {
  const { data, error } = await supabase.rpc('faculty_review_grade_change_request', {
    p_request_id: requestId,
    p_decision: decision,          // 'forward' | 'reject'
    p_faculty_note: facultyNote || null
  });
  if (error) throw error;
  return data;
}

/**
 * Apply an approved correction to a midterm or tentative-final rating.
 *
 * Semestral grade does NOT come through here: it keeps the existing
 * apply_approved_sg_correction_v2 path, which cascades MR -> TFR -> SG. An
 * MR or TFR correction is deliberately isolated and does not cascade forward;
 * if a later milestone also needs correcting, that is its own request.
 */
export async function applyMilestoneCorrection({ requestId, scoreChanges = [] }) {
  const { data, error } = await supabase.rpc('apply_approved_milestone_correction', {
    p_operation_id: crypto.randomUUID(),
    p_request_id: requestId,
    p_score_changes: scoreChanges
  });
  if (error) throw error;
  return data;
}

// --- Dean ------------------------------------------------------------------

export async function deanReviewRequest({ requestId, decision, deanNote }) {
  const { data, error } = await supabase.rpc('dean_review_grade_change_request', {
    p_request_id: requestId,
    p_decision: decision,          // 'approve' | 'reject'
    p_dean_note: deanNote || null
  });
  if (error) throw error;
  return data;
}

// --- Evidence --------------------------------------------------------------
//
// A file is REQUIRED on every student-raised dispute (owner's decision,
// 2026-10-30), and up to three may be attached -- the front and back of a paper,
// or an activity sheet alongside the class record.
//
// WHAT THAT CHANGES
// Storage stops being a nicety and becomes load-bearing: if the bucket or its
// policies are wrong, no student can raise a dispute at all. That is a reason to
// keep this on Supabase Storage rather than move to R2 -- row-level security
// failing closed is far easier to reason about than a signed-URL broker.
//
// ORDERING
// The file is uploaded BEFORE the request exists, because the request cannot be
// created without it. So the path is scoped to the student -- "<uid>/..." , the
// same convention the avatars bucket uses -- and the submit RPC verifies that
// the first segment of every key is the caller. A student can therefore only
// ever submit files they uploaded themselves, and an abandoned upload belongs to
// nobody but them.
//
// Each attachment records WHICH store holds it, so a later move to R2 is
// additive and files uploaded today stay readable.

// Scoped to the student, not the request: the request does not exist yet.
/**
 * Put one file in the bucket and hand back its key. Throws, because at this
 * point the student has asked to submit and a silent failure would leave them
 * believing a dispute was filed when none was.
 */
export async function uploadEvidenceFile({ userId, file }) {
  const check = describeEvidenceFile(file);
  if (!check.ok) throw new Error(check.message);

  const path = evidenceObjectPath(userId, file.name);
  const contentType = resolveFileType(file);
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .upload(path, file, { contentType, upsert: false });

  if (error) {
    console.error('[ASPIRE] evidence upload failed:', error);
    throw new Error('Your file could not be uploaded, so nothing was submitted. Check your connection and try again.');
  }
  return { objectKey: path, storage: EVIDENCE_STORES.SUPABASE, contentType };
}

/** Attach another file to a request that is still being reviewed. */
export async function attachEvidence({ requestId, objectKey, storage = EVIDENCE_STORES.SUPABASE }) {
  const { data, error } = await supabase.rpc('attach_grade_change_evidence', {
    p_request_id: requestId,
    p_object_key: objectKey,
    p_storage: storage
  });
  if (error) throw error;
  return data;
}

/**
 * Remove one attachment. The server refuses to remove the last one, because a
 * dispute without evidence is not a state this process allows.
 */
export async function removeEvidence(evidenceId) {
  const { data, error } = await supabase.rpc('remove_grade_change_evidence', {
    p_evidence_id: evidenceId
  });
  if (error) throw error;
  return data;
}

/**
 * A short-lived link to one attachment.
 *
 * Branches on where the file actually lives, which is what makes a later move
 * to R2 additive rather than a migration of everything already uploaded.
 */
export async function getEvidenceUrl({ objectKey, storage, requestId }) {
  if (!objectKey) return null;

  if (storage === EVIDENCE_STORES.R2) {
    try {
      const { data, error } = await supabase.functions.invoke('grade-change-evidence', {
        body: { action: 'sign-download', requestId, objectKey }
      });
      if (error) return null;
      return data?.url || null;
    } catch {
      return null;
    }
  }

  const { data, error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(objectKey, 300);
  if (error) {
    console.warn('[ASPIRE] could not sign evidence URL:', error);
    return null;
  }
  return data?.signedUrl || null;
}

/**
 * The bytes of one attachment, for the in-app viewer.
 *
 * The thumbnail strip still uses a signed URL, because <img src> needs one and
 * a thumbnail navigates nowhere. Opening a file full size is different: that is
 * where a link would otherwise be handed to a new tab, so the full-size read
 * goes through the session and produces no shareable link at all.
 */
export async function downloadEvidence({ objectKey, storage, requestId }) {
  if (!objectKey) return null;

  if (storage === EVIDENCE_STORES.R2) {
    // R2 has no session-authenticated read: the edge function signs, and we
    // fetch that once rather than hand it to the browser's address bar.
    const url = await getEvidenceUrl({ objectKey, storage, requestId });
    if (!url) throw new Error('That attachment could not be opened.');
    const response = await fetch(url);
    if (!response.ok) throw new Error('That attachment could not be opened.');
    return response.blob();
  }

  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).download(objectKey);
  if (error) {
    console.warn('[ASPIRE] could not read evidence:', error);
    throw new Error('That attachment could not be opened. It may have been removed, or your account may not be allowed to read it.');
  }
  if (!data) throw new Error('That attachment could not be opened. Storage returned nothing for it.');
  return data;
}

/** Signed links for every attachment on a request, for inline review. */
export async function getEvidenceUrls(request) {
  const items = request?.evidence || [];
  const signed = await Promise.all(
    items.map(async (e) => ({
      ...e,
      url: await getEvidenceUrl({
        objectKey: e.objectKey,
        storage: e.storage,
        requestId: request.requestId
      })
    }))
  );
  return signed;
}

// --- Midterm / Tentative-Final corrections ---------------------------------
//
// A separate path from the semestral-grade editor, which iterates every term,
// asks for a remark, and cascades MR -> TFR -> SG. None of that is right here:
// an MR correction touches only Prelim and Midterm, has no remark of its own,
// and must NOT cascade -- if a later milestone also needs correcting, that is
// its own request, by the owner's rule.
//
// The editable items come from the server rather than being assembled here.
// Working out which activities feed a milestone means knowing the class's
// grading template, and that logic already exists in SQL; a second copy in
// JavaScript would drift from it.

/** The score items that feed the milestone this request is about. */
export async function fetchMilestoneCorrectionTargets(requestId) {
  const { data, error } = await supabase.rpc('milestone_correction_targets', {
    p_request_id: requestId
  });
  if (error) throw error;
  return (data || []).map((row) => ({
    key: row.target_key,
    targetType: row.target_type,
    activityId: row.activity_id,
    term: row.term,
    field: row.field,
    label: row.label,
    originalScore: row.original_score,
    maxScore: Number(row.max_score)
  }));
}

/**
 * What the rating WOULD become, computed on the server.
 *
 * The same reasoning as the semestral editor's preview: the figure an
 * instructor approves has to be the one the database will produce, not one
 * recalculated in the browser from a copy of the rules.
 */
export async function previewMilestoneCorrection({ requestId, scoreChanges }) {
  const { data, error } = await supabase.rpc('preview_milestone_correction', {
    p_request_id: requestId,
    p_score_changes: scoreChanges
  });
  if (error) throw error;
  return data;          // { original_rating, proposed_rating, terms: [...] }
}

// A fingerprint of exactly what was previewed. If a score changes after the
// preview, this stops Apply going ahead on a figure nobody actually saw --
// the same guard the semestral editor carries, and for the same reason.
// --- Registrar ---------------------------------------------------------------
//
// A request that outlives the dispute window needs the Registrar's authority
// before it can be applied: the term's records are already settled, and the
// Registrar owns them. Faculty validation, the Dean's approval and the evidence
// are all still required -- this is an additional authority, not a replacement.

export async function registrarReviewRequest({ requestId, decision, registrarNote }) {
  const { data, error } = await supabase.rpc('registrar_review_grade_change_request', {
    p_request_id: requestId,
    p_decision: decision,            // 'authorize' | 'reject'
    p_registrar_note: registrarNote || null
  });
  if (error) throw error;
  return data;
}

// --- Retention -------------------------------------------------------------
//
// Evidence clears at the rollover AFTER the term it belongs to, and only for
// requests that are resolved (owner's decision, 2026-10-30). Evidence is
// REQUIRED on every dispute, so without this the bucket only ever grows.
//
// It runs from Storage Health rather than on a schedule: this project has no
// cron, and a destructive sweep that nobody watches is worse than one somebody
// chooses to run. The database decides WHAT expires; the page only decides when
// to ask.

/** What has expired and could be cleared. Read-only -- nothing is removed. */
export async function fetchExpiredEvidence(limit = 200) {
  const { data, error } = await supabase.rpc('aspire_expired_evidence', {
    p_limit: limit
  });
  if (error) throw error;
  return (data || []).map((row) => ({
    evidenceId: row.evidence_id,
    objectKey: row.object_key,
    storage: row.storage
  }));
}

/**
 * Clear expired evidence: the files first, then the rows.
 *
 * ORDER IS LOAD-BEARING. The row is what identifies a file as expired, so
 * dropping it first would strand bytes in the bucket that nothing could name
 * again. Done this way a failed or interrupted run leaves the rows untouched
 * and the next run simply picks them up -- there is no half-cleared state that
 * needs repairing by hand.
 *
 * Only the files that actually left the bucket have their rows removed, so a
 * partial failure stays visible instead of being papered over.
 */
export async function purgeExpiredEvidence(limit = 200) {
  const expired = await fetchExpiredEvidence(limit);
  if (!expired.length) return { removed: 0, failed: [], found: 0 };

  // R2 is not wired up yet. Those rows are left alone rather than having their
  // database row removed while the object stays in a bucket this cannot reach.
  const here = expired.filter((e) => e.storage !== EVIDENCE_STORES.R2);
  if (!here.length) return { removed: 0, failed: [], found: expired.length };

  const paths = here.map((e) => e.objectKey);
  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).remove(paths);
  if (error) throw error;

  const gone = new Set((data || []).map((d) => d.name));
  const clearedIds = here.filter((e) => gone.has(e.objectKey)).map((e) => e.evidenceId);
  const failed = here.filter((e) => !gone.has(e.objectKey)).map((e) => e.objectKey);

  let removed = 0;
  if (clearedIds.length) {
    const { data: count, error: purgeErr } = await supabase.rpc('aspire_purge_evidence', {
      p_evidence_ids: clearedIds
    });
    if (purgeErr) throw purgeErr;
    removed = Number(count || 0);
  }

  return { removed, failed, found: expired.length };
}
