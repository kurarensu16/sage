-- Block-section enrollment: enroll immediately, and tell the subject professors.
--
-- Before: an admin assigning a student to a section (Manage Users / CSV import)
-- only set users.section_id. Class enrollments were created later in the browser:
-- when an admin provisioned a class, or when a professor happened to open
-- My Class Records (auto-sync). Until then the student was missing from the
-- grade sheet, attendance, and risk lists, and nobody was told.
--
-- After:
--   1. Assigning (or changing) a student's section enrolls them right away in every
--      active class of that section (same rule as before: one enrollment per subject).
--   2. One-time back-fill of block-section students missing from their section's
--      active classes (what the browser auto-sync would eventually have done).
--   3. Whenever students are enrolled through section enrollment (new section
--      assignment, class provisioning, or the browser auto-sync), the class's faculty
--      receives one in-app notice per class with the NUMBER of students added
--      (no names). Additions within 10 minutes are merged into the same unread notice,
--      so a CSV import or a new class produces one notice per class, not one per
--      student. Enrollments made by approving a join request are skipped (the faculty
--      decided them). In-app and device alert only; never email.
-- Not changed: moving a student to another section does not remove their old class
-- enrollments (recorded as a future enhancement).

BEGIN;

-- ── 1. Enroll on section assignment ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_student_section_enrollments()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.role::TEXT <> 'student'
     OR NEW.section_id IS NULL
     OR COALESCE(NEW.status, 'active') <> 'active' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.section_id IS NOT DISTINCT FROM OLD.section_id
     AND NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.enrollments (student_id, subject_id, section_id, status)
  SELECT DISTINCT ON (cr.subject_id) NEW.user_id, cr.subject_id, cr.section_id, 'active'
  FROM public.class_records cr
  WHERE cr.section_id = NEW.section_id
    AND cr.subject_id IS NOT NULL
    AND COALESCE(cr.status::TEXT, '') = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.enrollments e
      WHERE e.student_id = NEW.user_id AND e.subject_id = cr.subject_id
    )
  ORDER BY cr.subject_id, cr.created_at;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_student_section_enrollments ON public.users;
CREATE TRIGGER trg_sync_student_section_enrollments
AFTER INSERT OR UPDATE OF section_id, role, status ON public.users
FOR EACH ROW EXECUTE FUNCTION public.sync_student_section_enrollments();

-- ── 2. One-time back-fill (runs BEFORE the notice trigger exists, so no flood) ──
INSERT INTO public.enrollments (student_id, subject_id, section_id, status)
SELECT DISTINCT ON (u.user_id, cr.subject_id) u.user_id, cr.subject_id, cr.section_id, 'active'
FROM public.users u
JOIN public.class_records cr
  ON cr.section_id = u.section_id
 AND cr.subject_id IS NOT NULL
 AND COALESCE(cr.status::TEXT, '') = 'active'
WHERE u.role::TEXT = 'student'
  AND u.section_id IS NOT NULL
  AND COALESCE(u.status, 'active') = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM public.enrollments e
    WHERE e.student_id = u.user_id AND e.subject_id = cr.subject_id
  )
ORDER BY u.user_id, cr.subject_id, cr.created_at;

-- ── 3. Roster notice to the class's faculty ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_class_roster_additions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r RECORD;
  v_existing public.notifications;
  v_total INTEGER;
  v_new_class BOOLEAN;
  v_label TEXT;
  v_message TEXT;
BEGIN
  -- Approved join requests are decided by the faculty; no notice needed.
  IF current_setting('aspire.enrollment_source', true) = 'join_approval' THEN
    RETURN NULL;
  END IF;

  FOR r IN
    SELECT cr.class_record_id, cr.faculty_id, cr.created_at AS class_created_at,
           sub.code AS subject_code, sec.name AS section_name,
           COUNT(DISTINCT n.student_id)::INTEGER AS added
    FROM new_enrollments n
    JOIN public.class_records cr
      ON cr.section_id = n.section_id
     AND cr.subject_id = n.subject_id
     AND COALESCE(cr.status::TEXT, '') = 'active'
    LEFT JOIN public.subjects sub ON sub.subject_id = cr.subject_id
    LEFT JOIN public.sections sec ON sec.section_id = cr.section_id
    WHERE cr.faculty_id IS NOT NULL
    GROUP BY cr.class_record_id, cr.faculty_id, cr.created_at, sub.code, sec.name
  LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('class_roster_added:' || r.class_record_id::TEXT, 0));

    v_label := COALESCE(r.subject_code, 'your class') || COALESCE(' (' || r.section_name || ')', '');
    v_new_class := r.class_created_at IS NOT NULL
      AND r.class_created_at > CURRENT_TIMESTAMP - INTERVAL '10 minutes';

    SELECT * INTO v_existing
    FROM public.notifications nt
    WHERE nt.recipient_id = r.faculty_id
      AND nt.type = 'class_roster_added'
      AND nt.payload->>'class_record_id' = r.class_record_id::TEXT
      AND nt.is_read = FALSE
      AND nt.dismissed_at IS NULL
      AND nt.created_at > CURRENT_TIMESTAMP - INTERVAL '10 minutes'
    ORDER BY nt.created_at DESC
    LIMIT 1
    FOR UPDATE;

    v_total := r.added + CASE WHEN FOUND THEN COALESCE((v_existing.payload->>'added_count')::INTEGER, 0) ELSE 0 END;
    v_new_class := v_new_class OR (FOUND AND COALESCE((v_existing.payload->>'new_class')::BOOLEAN, FALSE));

    v_message := CASE
      WHEN v_new_class THEN
        v_label || ' was set up with ' || v_total
          || CASE WHEN v_total = 1 THEN ' student' ELSE ' students' END
          || ' from section enrollment. Review your class roster.'
      ELSE
        v_total || CASE WHEN v_total = 1 THEN ' student was' ELSE ' students were' END
          || ' added to ' || v_label || ' through section enrollment. Review your class roster.'
    END;

    IF FOUND THEN
      UPDATE public.notifications
      SET message = v_message,
          payload = payload || jsonb_build_object('added_count', v_total, 'new_class', v_new_class)
      WHERE notification_id = v_existing.notification_id;
    ELSE
      INSERT INTO public.notifications (
        recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
      ) VALUES (
        r.faculty_id,
        'class_roster_added',
        'Class Roster Update',
        '/faculty/classrecordslist',
        'info',
        v_message,
        jsonb_build_object('class_record_id', r.class_record_id, 'added_count', v_total, 'new_class', v_new_class),
        'class_roster_added:' || r.class_record_id::TEXT || ':' || txid_current()::TEXT || ':'
          || floor(extract(epoch FROM clock_timestamp()) * 1000)::BIGINT::TEXT,
        FALSE
      )
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_class_roster_additions ON public.enrollments;
CREATE TRIGGER trg_notify_class_roster_additions
AFTER INSERT ON public.enrollments
REFERENCING NEW TABLE AS new_enrollments
FOR EACH STATEMENT EXECUTE FUNCTION public.notify_class_roster_additions();

COMMIT;
