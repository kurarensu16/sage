-- =============================================================================
-- A faculty-raised correction can carry files, like a student's dispute can
-- =============================================================================
--
-- WHAT WAS WRONG
--   A student disputing a grade attaches up to three files. An instructor
--   raising a correction for the same grade could attach nothing -- the older
--   SG flow records a single free-text evidence_url and no attachments at all.
--   The evidence a correction actually rests on (a marked paper, a class
--   record, a screenshot of the activity) is a file, not a link, and asking
--   for a URL means asking the instructor to host it somewhere first.
--
-- WHY THIS IS TWO FUNCTIONS AND NO SCHEMA CHANGE
--   grade_change_evidence, the three-file cap, the per-user upload path and
--   the ownership test are ALREADY role-agnostic: attach checks
--   `requested_by <> auth.uid()` -- "you can only add files to a request you
--   raised" -- and never asks what role the caller holds. A faculty member who
--   raised an SG correction IS requested_by, so they already pass every test
--   except one.
--
--   That one is the status gate. The faculty flow files at the legacy
--   'pending', which both functions omit from their allowed list, so every
--   attach was refused with "This request has already been decided" -- about a
--   request that had not been decided at all. Adding 'pending' is the whole
--   fix.
--
--   No table is altered, no column is added, no policy is rewritten. The two
--   function bodies below are the deployed ones from 20261030104405 with that
--   single list extended, plus the floor correction described next.
--
-- THE "AT LEAST ONE FILE" FLOOR IS A STUDENT RULE, NOT A GENERAL ONE
--   remove_grade_change_evidence refuses to delete the last remaining file,
--   because submit_grade_change_request REQUIRES a student to attach one and a
--   dispute with no evidence is not a state that flow allows. The faculty flow
--   has no such requirement -- evidence is optional there -- so applying the
--   same floor would trap an instructor who attached one file by mistake and
--   can never remove it. The floor is therefore scoped to student-raised
--   requests, which is where the requirement it protects actually lives.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Attaching
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_grade_change_evidence(
  p_request_id UUID,
  p_object_key TEXT,
  p_storage TEXT DEFAULT 'supabase'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_req RECORD;
  v_count INTEGER;
BEGIN
  SELECT * INTO v_req FROM public.remark_override_requests WHERE request_id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That request could not be found.';
  END IF;

  IF v_req.requested_by <> auth.uid() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You can only add files to a request you raised.';
  END IF;

  -- 'pending' is the faculty-raised flow's waiting state. Without it an
  -- instructor was told their own undecided request had already been decided.
  IF v_req.status NOT IN ('pending', 'pending_faculty_review', 'pending_dean_review', 'pending_registrar_review') THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'This request has already been decided, so files can no longer be added.';
  END IF;

  IF split_part(p_object_key, '/', 1) <> auth.uid()::TEXT THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'That file was not uploaded by you.';
  END IF;

  SELECT count(*) INTO v_count FROM public.grade_change_evidence WHERE request_id = p_request_id;
  IF v_count >= 3 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'You can attach up to three files.';
  END IF;

  INSERT INTO public.grade_change_evidence (request_id, object_key, storage, uploaded_by)
  VALUES (p_request_id, p_object_key, COALESCE(p_storage, 'supabase'), auth.uid())
  ON CONFLICT (request_id, object_key) DO NOTHING;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. Removing
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_grade_change_evidence(p_evidence_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_ev RECORD;
  v_req RECORD;
  v_count INTEGER;
BEGIN
  SELECT * INTO v_ev FROM public.grade_change_evidence WHERE id = p_evidence_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'That file could not be found.';
  END IF;

  SELECT * INTO v_req FROM public.remark_override_requests WHERE request_id = v_ev.request_id;

  IF v_req.requested_by <> auth.uid() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'You can only remove a file you attached.';
  END IF;

  IF v_req.status NOT IN ('pending', 'pending_faculty_review', 'pending_dean_review', 'pending_registrar_review') THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'This request has already been decided, so its files can no longer be changed.';
  END IF;

  -- Only a student's dispute is required to carry evidence, so only a
  -- student's dispute may be stopped from losing its last file.
  IF COALESCE(v_req.submitted_by_role, 'faculty') = 'student' THEN
    SELECT count(*) INTO v_count FROM public.grade_change_evidence WHERE request_id = v_ev.request_id;
    IF v_count <= 1 THEN
      RAISE EXCEPTION USING ERRCODE = '23514',
        MESSAGE = 'A request needs at least one file. Add the replacement first, then remove this one.';
    END IF;
  END IF;

  DELETE FROM public.grade_change_evidence WHERE id = p_evidence_id;
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.attach_grade_change_evidence(UUID, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_grade_change_evidence(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_grade_change_evidence(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_grade_change_evidence(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. Evidence becomes REQUIRED on a faculty-raised correction
-- -----------------------------------------------------------------------------
-- The two functions above let an instructor add files. They do not make the
-- request impossible WITHOUT them, and that is the actual requirement: the
-- student flow guarantees "there is no state where a dispute exists with
-- nothing attached", and a correction to the same grade should be evidenced to
-- the same standard.
--
-- WHY A v2 WRAPPER RATHER THAN EDITING THE EXISTING FUNCTION
--   submit_sg_correction_request is ~186 lines: it validates the class and the
--   posted grade, recomputes the proposal through preview_sg_score_correction,
--   freezes the original figures, writes the row and notifies every Dean. A
--   parameter cannot be added to a live function with CREATE OR REPLACE --
--   that produces an overload, and the one-argument-short call then resolves
--   ambiguously -- so requiring evidence in place would mean DROP plus a
--   verbatim restatement of all 186 lines. Every line restated is a line that
--   can silently lose a patch some later migration applied.
--
--   So the proposal logic is REUSED, not reimplemented -- the same reasoning
--   the loading phase recorded for provisionClassroomByAdmin ("a second path
--   would diverge from that snapshot logic, which is the one thing in this
--   system that must not drift"), and the same v2 shape already used by
--   add_faculty_load_draft_v2.
--
-- WHY THIS IS STILL ATOMIC
--   One function body is one transaction. If the evidence insert fails after
--   the inner call created the request, the whole statement rolls back and no
--   request survives. That is the same guarantee submit_grade_change_request
--   gives a student, reached a different way.
CREATE OR REPLACE FUNCTION public.submit_sg_correction_request_v2(
  p_class_record_id UUID,
  p_student_id UUID,
  p_proposed_remark TEXT,
  p_reason TEXT,
  p_evidence_keys TEXT[],
  p_evidence_storage TEXT DEFAULT 'supabase',
  p_evidence_url TEXT DEFAULT NULL,
  p_proposed_computed_grade NUMERIC DEFAULT NULL,
  p_proposed_effective_grade NUMERIC DEFAULT NULL,
  p_proposed_score_changes JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_count INTEGER;
  v_key TEXT;
  v_result JSONB;
  v_request_id UUID;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required.';
  END IF;

  -- Checked BEFORE the request is created, so a correction is never written
  -- and then rolled back over something the page could have caught.
  v_count := COALESCE(array_length(p_evidence_keys, 1), 0);
  IF v_count < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Attach at least one photo or file supporting this correction.';
  END IF;
  IF v_count > 3 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'You can attach up to three files.';
  END IF;

  FOREACH v_key IN ARRAY p_evidence_keys LOOP
    IF split_part(v_key, '/', 1) <> v_actor::TEXT THEN
      RAISE EXCEPTION USING ERRCODE = '42501',
        MESSAGE = 'One of those files was not uploaded by you.';
    END IF;
  END LOOP;

  -- The proposal itself, unchanged and unduplicated.
  v_result := public.submit_sg_correction_request(
    p_class_record_id, p_student_id, p_proposed_remark, p_reason,
    p_evidence_url, p_proposed_computed_grade, p_proposed_effective_grade,
    p_proposed_score_changes
  );

  v_request_id := (v_result->>'request_id')::UUID;
  IF v_request_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002',
      MESSAGE = 'The correction request could not be created.';
  END IF;

  FOREACH v_key IN ARRAY p_evidence_keys LOOP
    INSERT INTO public.grade_change_evidence (request_id, object_key, storage, uploaded_by)
    VALUES (v_request_id, v_key, COALESCE(p_evidence_storage, 'supabase'), v_actor)
    ON CONFLICT (request_id, object_key) DO NOTHING;
  END LOOP;

  RETURN v_result;
END;
$$;

-- v1 becomes internal. Left in place because v2 calls it, but no longer
-- reachable from a client -- otherwise "evidence is required" would hold only
-- for callers that chose to go through v2, which is not a requirement at all.
REVOKE ALL ON FUNCTION public.submit_sg_correction_request(UUID, UUID, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_sg_correction_request_v2(UUID, UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, NUMERIC, NUMERIC, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_sg_correction_request_v2(UUID, UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, NUMERIC, NUMERIC, JSONB) TO authenticated;

COMMENT ON FUNCTION public.submit_sg_correction_request_v2(UUID, UUID, TEXT, TEXT, TEXT[], TEXT, TEXT, NUMERIC, NUMERIC, JSONB) IS
  'Raises a faculty SG correction with its evidence, in one transaction. The '
  'v1 signature still exists because this calls it, but is no longer granted '
  'to clients: evidence is required, so the unevidenced path must not remain '
  'reachable.';

-- -----------------------------------------------------------------------------
-- 3. Post-conditions
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_attach TEXT;
  v_remove TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_attach
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'attach_grade_change_evidence';

  SELECT pg_get_functiondef(p.oid) INTO v_remove
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'remove_grade_change_evidence';

  IF v_attach IS NULL OR v_remove IS NULL THEN
    RAISE EXCEPTION 'Verification failed: an evidence function is missing.';
  END IF;

  -- The point of the migration: a faculty-raised request can now be given
  -- files. If this assertion ever fails, attaching is silently refused again.
  IF position('''pending'', ''pending_faculty_review''' IN v_attach) = 0 THEN
    RAISE EXCEPTION 'Verification failed: attach still refuses the faculty-raised waiting state.';
  END IF;
  IF position('''pending'', ''pending_faculty_review''' IN v_remove) = 0 THEN
    RAISE EXCEPTION 'Verification failed: remove still refuses the faculty-raised waiting state.';
  END IF;

  -- The floor must still protect a student dispute, which IS required to
  -- carry evidence. Losing this would let a student strip their own case bare.
  IF position('submitted_by_role' IN v_remove) = 0 THEN
    RAISE EXCEPTION 'Verification failed: the last-file floor is no longer scoped, so it either traps instructors or no longer protects students.';
  END IF;

  IF to_regprocedure('public.submit_sg_correction_request_v2(uuid,uuid,text,text,text[],text,text,numeric,numeric,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Verification failed: the evidence-required submission path is missing.';
  END IF;

  -- The requirement is only real if the unevidenced path is unreachable. If
  -- this grant ever comes back, a client can raise a correction with nothing
  -- attached and the rule becomes advisory.
  IF has_function_privilege(
       'authenticated',
       'public.submit_sg_correction_request(uuid,uuid,text,text,text,numeric,numeric,jsonb)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'Verification failed: the unevidenced v1 submission is still callable by clients.';
  END IF;

  RAISE NOTICE 'Faculty-raised corrections now require, and can carry, up to three files.';
END
$verify$;

COMMIT;
