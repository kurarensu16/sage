-- =============================================================================
-- A class does not conflict with itself when its schedule is edited
-- =============================================================================
--
-- THE SYMPTOM (QA, 2026-11-18)
--   In Faculty Loading, a Dean opened a finalized class (IT213 · BSIT-1B,
--   Mon-Sat 12:45-20:00) and narrowed it to Wednesday only. Save was refused:
--     "This faculty member already teaches another class Mon/Wed/Tue/Thu/Fri/Sat
--      12:45-20:00 ..."
--   The "other class" is the same class.
--
-- THE CAUSE
--   find_schedule_conflict() checks two lists: faculty_load_drafts (every draft
--   that is not superseded, which includes 'finalized') and class_records.
--   update_class_schedule() excludes the class being edited from the
--   class_records list (p_exclude_class), but the draft that BECAME that class
--   still carries the old schedule and is not excluded, so the class collides
--   with its own draft.
--
-- THE FIX
--   When a class is excluded, its own draft (faculty_load_drafts.class_record_id
--   = that class) is excluded too. One condition, added to both draft lists in
--   the function (the faculty check and the section check). Patched from the
--   DEPLOYED body: the exact line must appear exactly twice, or nothing changes.
--   Nothing else in the function changes, and adding a draft (where no class is
--   excluded) behaves exactly as before.
-- =============================================================================

BEGIN;

DO $patch$
DECLARE
  v_def TEXT;
  v_hits INTEGER;
  v_old CONSTANT TEXT := $old$AND (p_exclude_draft IS NULL OR l.id <> p_exclude_draft)$old$;
  v_new CONSTANT TEXT := $new$AND (p_exclude_draft IS NULL OR l.id <> p_exclude_draft)
      AND (p_exclude_class IS NULL OR l.class_record_id IS DISTINCT FROM p_exclude_class)$new$;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'find_schedule_conflict';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'find_schedule_conflict does not exist.';
  END IF;
  IF position('l.class_record_id IS DISTINCT FROM p_exclude_class' IN v_def) > 0 THEN
    RAISE NOTICE 'find_schedule_conflict already skips the edited class''s own draft; nothing to do.';
    RETURN;
  END IF;

  v_hits := (length(v_def) - length(replace(v_def, v_old, ''))) / length(v_old);
  IF v_hits <> 2 THEN
    RAISE EXCEPTION
      'Expected the draft exclusion exactly twice in find_schedule_conflict, found %. Re-read the deployed body before re-running.',
      v_hits;
  END IF;

  EXECUTE replace(v_def, v_old, v_new);
  RAISE NOTICE 'find_schedule_conflict now skips the edited class''s own draft.';
END
$patch$;

DO $verify$
DECLARE v_def TEXT;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO v_def
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'find_schedule_conflict';
  IF (length(v_def) - length(replace(v_def, 'l.class_record_id IS DISTINCT FROM p_exclude_class', '')))
     / length('l.class_record_id IS DISTINCT FROM p_exclude_class') <> 2 THEN
    RAISE EXCEPTION 'Verification failed: an edited class can still collide with its own draft.';
  END IF;
  RAISE NOTICE 'A class no longer conflicts with itself when its schedule is edited.';
END
$verify$;

COMMIT;
