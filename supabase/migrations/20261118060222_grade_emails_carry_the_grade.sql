-- =============================================================================
-- A posted-grade email that actually says what was posted
-- =============================================================================
--
-- THE SYMPTOM
--   A guardian received: "Dear Grandparent of the student, a grade has been
--   posted for the student in their class, this Rating." No subject, no name,
--   no grade card. The student's own copy was equally generic: "Dear Student,
--   a grade has been posted in your class." Nothing errored. Resend accepted
--   the message, the delivery row was marked sent, and no log recorded a
--   problem -- the template degraded instead of failing, which is why this ran
--   unnoticed from the first server-authoritative posting onward.
--
-- THE CAUSE: TWO VOCABULARIES FOR ONE PAYLOAD
--   send-email/index.ts reads the grade out of notifications.payload using the
--   names the old JavaScript dispatcher wrote:
--
--     student_name   subject_name   subject_code   term   remark   rating   gwa
--
--   post_grade_milestone_v2 writes the names the database uses:
--
--     class_record_id   grade_period   computed_grade   effective_grade   remarks
--
--   Not one key matches. Every fallback in renderGuardianTemplate and
--   renderStudentTemplate fires at once, and the grade card is skipped
--   entirely because remark is blank and rating/gwa parse to NaN.
--
-- THE EVIDENCE
--   Counted straight off the live table, by day and type:
--
--     grade_posted   2026-10-31 .. 2026-11-17   231 rows   0 with student_name   always 5 keys
--     grade_changed  2026-11-02, 2026-11-11       3 rows   3 with student_name   14-16 keys
--     grade_changed  2026-11-08                   1 row    0 with student_name        5 keys
--
--   So this was never a regression. grade_posted has never carried the keys.
--   The emails that looked right were corrections -- apply_approved_sg_-
--   correction and the cascade path already write BOTH vocabularies. And the
--   lone 5-key grade_changed shows the split is not "posted versus changed"
--   but WHICH function produced the row: post_grade_milestone_v2 raises both
--   types from this one payload, so a re-post sends a blank "updated" email
--   too. That is why the administrative override below is patched as well.
--
-- WHY THE BODY IS PATCHED RATHER THAN RESTATED
--   post_grade_milestone_v2 is ~180 lines and the most load-bearing function
--   in the system; 20261103092200 declined to touch it for exactly that
--   reason, and 20261030102815 records that it "has already been patched from
--   its live definition twice". Restating it here would mean re-stating those
--   patches from memory and silently losing any that live only in the
--   database. So this reads the DEPLOYED body, asserts the payload appears
--   exactly once, and replaces that one expression -- the same technique
--   20261104210923 used on describe_schedule_conflict. If the body has
--   drifted, the assertion fails loudly instead of half-applying.
--
-- NO SCHEMA CHANGE. Two function bodies, nothing else.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Routine posting and re-posting (grade_posted AND grade_changed)
-- -----------------------------------------------------------------------------
DO $patch_posting$
DECLARE
  v_def  TEXT;
  v_hits INTEGER;
  -- The deployed payload's closing fragment, matched on one line so the
  -- anchor does not depend on how the body was indented.
  v_old CONSTANT TEXT :=
$old$'computed_grade', v_computed, 'effective_grade', v_effective, 'remarks', v_remark)$old$;
  -- The same five keys, untouched, plus the seven the email templates read.
  -- Scalar subqueries rather than new variables: adding to DECLARE would mean
  -- a second replacement in the same body, and each replacement is a chance to
  -- miss. v_class and v_student_id are already in scope at this point.
  v_new CONSTANT TEXT :=
$new$'computed_grade', v_computed, 'effective_grade', v_effective, 'remarks', v_remark,
          'subject_code', (SELECT s.code FROM public.subjects s WHERE s.subject_id = v_class.subject_id),
          'subject_name', (SELECT s.name FROM public.subjects s WHERE s.subject_id = v_class.subject_id),
          'term', CASE p_grade_period
                    WHEN 'midterm_rating' THEN 'Midterm'
                    WHEN 'tentative_final_rating' THEN 'Tentative Final'
                    WHEN 'semestral_grade' THEN 'Semestral Grade'
                    ELSE p_grade_period
                  END,
          'rating', v_computed, 'gwa', v_effective, 'remark', v_remark,
          'student_name', (SELECT NULLIF(BTRIM(COALESCE(u.last_name, '') || ', ' || COALESCE(u.first_name, '')), ',')
                             FROM public.users u WHERE u.user_id = v_student_id))$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'post_grade_milestone_v2';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'post_grade_milestone_v2 does not exist. Run 20261022121000 first.';
  END IF;

  IF position('''student_name''' IN v_def) > 0 THEN
    RAISE NOTICE 'post_grade_milestone_v2 already carries the email keys; nothing to do.';
    RETURN;
  END IF;

  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION
      'Expected the notification payload exactly once in post_grade_milestone_v2, found %. Re-read the deployed body before re-running.',
      v_hits;
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
  RAISE NOTICE 'post_grade_milestone_v2 now names the subject, the term, the student and the grade.';
END
$patch_posting$;

-- -----------------------------------------------------------------------------
-- 2. Administrative override
-- -----------------------------------------------------------------------------
-- The override changes the effective grade and the remark only, so the term
-- rating it reports is the computed grade already on the row -- unchanged, and
-- still the figure the student was marked against.
DO $patch_override$
DECLARE
  v_def  TEXT;
  v_hits INTEGER;
  v_old CONSTANT TEXT :=
$old$'effective_grade', p_new_effective_grade, 'remarks', v_new_remarks::TEXT, 'request_id', v_request_id)$old$;
  v_new CONSTANT TEXT :=
$new$'effective_grade', p_new_effective_grade, 'remarks', v_new_remarks::TEXT, 'request_id', v_request_id,
      'subject_code', (SELECT s.code FROM public.subjects s
                         JOIN public.class_records c ON c.subject_id = s.subject_id
                        WHERE c.class_record_id = v_old.class_record_id),
      'subject_name', (SELECT s.name FROM public.subjects s
                         JOIN public.class_records c ON c.subject_id = s.subject_id
                        WHERE c.class_record_id = v_old.class_record_id),
      'term', 'Semestral Grade',
      'rating', v_old.computed_grade, 'gwa', p_new_effective_grade,
      'remark', v_new_remarks::TEXT,
      'student_name', (SELECT NULLIF(BTRIM(COALESCE(u.last_name, '') || ', ' || COALESCE(u.first_name, '')), ',')
                         FROM public.users u WHERE u.user_id = v_old.student_id))$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'apply_admin_grade_override_v2';

  IF v_def IS NULL THEN
    RAISE NOTICE 'apply_admin_grade_override_v2 is not deployed; skipping.';
    RETURN;
  END IF;

  IF position('''student_name''' IN v_def) > 0 THEN
    RAISE NOTICE 'apply_admin_grade_override_v2 already carries the email keys; nothing to do.';
    RETURN;
  END IF;

  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 1 THEN
    RAISE EXCEPTION
      'Expected the student payload exactly once in apply_admin_grade_override_v2, found %. Re-read the deployed body before re-running.',
      v_hits;
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
  RAISE NOTICE 'apply_admin_grade_override_v2 now names the subject, the student and the grade.';
END
$patch_override$;

-- -----------------------------------------------------------------------------
-- 3. Post-conditions
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_def TEXT;
  v_key TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'post_grade_milestone_v2';

  -- Each name the two email templates actually read. A single missing one
  -- brings back a fallback -- "their class", "this Rating" -- on every posted
  -- grade, for every guardian, silently.
  FOREACH v_key IN ARRAY ARRAY['subject_code', 'subject_name', 'term', 'rating', 'gwa', 'remark', 'student_name']
  LOOP
    IF position('''' || v_key || '''' IN v_def) = 0 THEN
      RAISE EXCEPTION 'Verification failed: the posting payload still omits %, so the email falls back to a generic line.', v_key;
    END IF;
  END LOOP;

  -- The database-facing names must survive: posted_grades reconciliation and
  -- the student grade view read these, not the email ones.
  IF position('''computed_grade''' IN v_def) = 0
    OR position('''effective_grade''' IN v_def) = 0
    OR position('''remarks''' IN v_def) = 0
    OR position('''class_record_id''' IN v_def) = 0
    OR position('''grade_period''' IN v_def) = 0
  THEN
    RAISE EXCEPTION 'Verification failed: the patch dropped a key the rest of the system reads.';
  END IF;

  RAISE NOTICE 'Posted-grade notifications now carry both vocabularies.';
END
$verify$;

COMMIT;
