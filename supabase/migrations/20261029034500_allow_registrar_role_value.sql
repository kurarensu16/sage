-- =============================================================================
-- ASPIRE: ALLOW THE 'registrar' ROLE VALUE (Admin/Registrar split, Phase 1)
-- =============================================================================
-- RUN THIS FIRST, before 20261029040940_registrar_role_authorization.sql.
--
-- WHY THIS EXISTS
--   The role-split plan and the 2026-10-29 call-site audit both recorded that
--   public.users.role was unconstrained TEXT, because no CHECK constraint and no
--   enum for it appears anywhere in supabase/migrations/. That conclusion was
--   WRONG, and the developer found it empirically: the live database rejects
--   'registrar'.
--
--   The reason the repo cannot show it is that public.users (like departments,
--   sections, and subjects) was created outside the tracked migrations, so its
--   column definition and constraints are not in version control. The plan
--   anticipated exactly this case and said to treat a discovered constraint as a
--   blocking finding rather than something to route around -- hence this
--   migration rather than a workaround.
--
-- WHAT IT DOES
--   It does not assume which shape the restriction takes, because that cannot be
--   read from the repo. It inspects the catalog and handles both:
--     * role is an enum type  -> adds 'registrar' as a new label, if absent.
--     * role has a CHECK      -> drops the constraint that omits 'registrar' and
--                                replaces it with one listing the full role
--                                vocabulary.
--   Either way it is idempotent: running it twice changes nothing the second
--   time.
--
-- NOT WRAPPED IN A TRANSACTION, deliberately. `ALTER TYPE ... ADD VALUE` has
-- historically been rejected inside a transaction block. PostgreSQL 12+ permits
-- it, so this should execute as-is on Supabase, but if your database does raise
-- "ALTER TYPE ... ADD VALUE cannot run inside a transaction block", run that one
-- statement on its own and then re-run this file.
--
-- The authorization migration that follows compares with `role::TEXT = 'registrar'`
-- rather than an enum literal, so it never needs the new value to be visible
-- within its own transaction.
-- =============================================================================

DO $registrar_role$
DECLARE
  v_typname  TEXT;
  v_typtype  "char";
  v_con      RECORD;
  v_dropped  BOOLEAN := FALSE;
BEGIN
  SELECT t.typname, t.typtype
    INTO v_typname, v_typtype
  FROM pg_attribute a
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE a.attrelid = 'public.users'::regclass
    AND a.attname = 'role'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF v_typname IS NULL THEN
    RAISE EXCEPTION 'Could not resolve the type of public.users.role.';
  END IF;

  RAISE NOTICE 'public.users.role is of type % (typtype %)', v_typname, v_typtype;

  -- Case 1: the column is backed by an enum.
  IF v_typtype = 'e' THEN
    IF EXISTS (
      SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = v_typname AND e.enumlabel = 'registrar'
    ) THEN
      RAISE NOTICE 'Enum % already contains registrar; nothing to add.', v_typname;
    ELSE
      EXECUTE format('ALTER TYPE public.%I ADD VALUE %L', v_typname, 'registrar');
      RAISE NOTICE 'Added value registrar to enum %.', v_typname;
    END IF;
  END IF;

  -- Case 2: a CHECK constraint restricts the permitted values. Any such
  -- constraint that does not already admit 'registrar' is replaced below. The
  -- original definition is printed first so the change is recoverable from the
  -- migration output if the replacement turns out to be too narrow.
  FOR v_con IN
    SELECT conname, pg_get_constraintdef(oid) AS condef
    FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    IF v_con.condef ILIKE '%registrar%' THEN
      RAISE NOTICE 'Constraint % already admits registrar; left alone.', v_con.conname;
    ELSE
      RAISE NOTICE 'Dropping role CHECK % -- previous definition was: %',
        v_con.conname, v_con.condef;
      EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', v_con.conname);
      v_dropped := TRUE;
    END IF;
  END LOOP;

  -- Only re-establish a CHECK if one was actually removed, and only when the
  -- column is plain text. Adding a CHECK where none existed would tighten the
  -- schema beyond what this migration is for.
  IF v_dropped AND v_typtype <> 'e' THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.users'::regclass AND conname = 'users_role_allowed'
    ) THEN
      -- 'office' is included because a live RLS policy still enumerates it
      -- (20261003110100_guardian_admin_access.sql). It is dead in practice --
      -- no account holds it -- but excluding it here would turn a harmless
      -- leftover into a constraint violation on any future backfill.
      ALTER TABLE public.users
        ADD CONSTRAINT users_role_allowed
        CHECK (role::TEXT IN ('admin', 'registrar', 'dean', 'faculty', 'student', 'office'));
      RAISE NOTICE 'Recreated role CHECK as users_role_allowed, now including registrar.';
    END IF;
  END IF;
END
$registrar_role$;

-- -----------------------------------------------------------------------------
-- Post-condition: catalog-only. Nothing is written to public.users -- a probe
-- insert would be a needless write against live data for a question the
-- catalog can answer directly.
-- -----------------------------------------------------------------------------
DO $verify$
DECLARE
  v_typtype  "char";
  v_typname  TEXT;
  v_blocking TEXT;
BEGIN
  SELECT t.typname, t.typtype INTO v_typname, v_typtype
  FROM pg_attribute a
  JOIN pg_type t ON t.oid = a.atttypid
  WHERE a.attrelid = 'public.users'::regclass
    AND a.attname = 'role' AND a.attnum > 0 AND NOT a.attisdropped;

  -- If the column is an enum, the label must now exist.
  IF v_typtype = 'e' AND NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = v_typname AND e.enumlabel = 'registrar'
  ) THEN
    RAISE EXCEPTION
      'Verification failed: enum % still has no registrar label.', v_typname;
  END IF;

  -- No remaining CHECK on the role column may omit registrar.
  SELECT string_agg(conname || ' => ' || pg_get_constraintdef(oid), '; ')
    INTO v_blocking
  FROM pg_constraint
  WHERE conrelid = 'public.users'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%role%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%registrar%';

  IF v_blocking IS NOT NULL THEN
    RAISE EXCEPTION
      'Verification failed: a CHECK constraint still omits registrar -- %', v_blocking;
  END IF;

  RAISE NOTICE 'Verified: nothing in the catalog now rejects a registrar role value.';
END
$verify$;
