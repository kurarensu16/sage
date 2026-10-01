-- =============================================================================
-- ASPIRE NOTIFICATION ACCESS CONTROL
-- Reconciles notification identities, makes delivery records auditable, and
-- moves client notification writes behind validated SECURITY DEFINER functions.
-- =============================================================================

-- Runtime code consistently uses public.users(user_id) as the application
-- identity. The prior guardians scaffold referenced profiles(id), which does
-- not match the documented profiles primary key or the live client contract.
ALTER TABLE public.guardians
  DROP CONSTRAINT IF EXISTS guardians_student_id_fkey;

ALTER TABLE public.guardians
  ADD CONSTRAINT guardians_student_id_fkey
  FOREIGN KEY (student_id) REFERENCES public.users(user_id) ON DELETE CASCADE;

-- Dismissal keeps notification and delivery history intact for audit and
-- delivery diagnostics while removing the item from the recipient's inbox.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS notifications_recipient_visible
  ON public.notifications (recipient_id, created_at DESC)
  WHERE dismissed_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_recipient_select ON public.notifications;
CREATE POLICY notifications_recipient_select
  ON public.notifications FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

DROP POLICY IF EXISTS notifications_admin_select ON public.notifications;
CREATE POLICY notifications_admin_select
  ON public.notifications FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users actor
      WHERE actor.user_id = auth.uid() AND actor.role = 'admin'
    )
  );

DROP POLICY IF EXISTS notification_deliveries_admin_select ON public.notification_deliveries;
CREATE POLICY notification_deliveries_admin_select
  ON public.notification_deliveries FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users actor
      WHERE actor.user_id = auth.uid() AND actor.role = 'admin'
    )
  );

DROP POLICY IF EXISTS notification_preferences_owner_select ON public.notification_preferences;
CREATE POLICY notification_preferences_owner_select
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS notification_preferences_owner_insert ON public.notification_preferences;
CREATE POLICY notification_preferences_owner_insert
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS notification_preferences_owner_update ON public.notification_preferences;
CREATE POLICY notification_preferences_owner_update
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Guardians are deliberately inaccessible until the consent UI and verified
-- delivery workflow are implemented. This prevents accidental disclosure.

CREATE OR REPLACE FUNCTION public.can_dispatch_notification(
  p_actor_id UUID,
  p_actor_role TEXT,
  p_recipient_id UUID,
  p_notification_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipient_role TEXT;
BEGIN
  SELECT role::TEXT INTO v_recipient_role
  FROM public.users
  WHERE user_id = p_recipient_id;

  IF v_recipient_role IS NULL THEN
    RETURN FALSE;
  END IF;

  IF p_actor_role = 'admin' OR p_recipient_id = p_actor_id THEN
    RETURN TRUE;
  END IF;

  IF p_actor_role = 'student' THEN
    RETURN p_notification_type = 'consultation_request'
      AND v_recipient_role = 'faculty'
      AND EXISTS (
        SELECT 1
        FROM public.enrollments enrollment
        JOIN public.class_records class_record
          ON class_record.section_id = enrollment.section_id
         AND class_record.subject_id = enrollment.subject_id
        WHERE enrollment.student_id = p_actor_id
          AND enrollment.status = 'active'
          AND class_record.faculty_id = p_recipient_id
      );
  END IF;

  IF p_actor_role = 'faculty' THEN
    IF v_recipient_role = 'student'
       AND p_notification_type IN ('grade_posted', 'grade_changed', 'academic_advising', 'ews_alert', 'system')
       AND EXISTS (
         SELECT 1
         FROM public.enrollments enrollment
         JOIN public.class_records class_record
           ON class_record.section_id = enrollment.section_id
          AND class_record.subject_id = enrollment.subject_id
         WHERE enrollment.student_id = p_recipient_id
           AND enrollment.status = 'active'
           AND class_record.faculty_id = p_actor_id
       ) THEN
      RETURN TRUE;
    END IF;

    RETURN v_recipient_role = 'dean'
      AND p_notification_type IN ('grades_pending', 'override_request');
  END IF;

  -- Deans and college-office staff are the institutional senders for
  -- advisories, evaluation windows, and term/roster notices.
  RETURN p_actor_role IN ('dean', 'office')
    AND p_notification_type IN (
      'grade_posted', 'grade_changed', 'eval_window_open', 'eval_closed',
      'eval_deadline_reminder', 'ews_alert', 'academic_notice',
      'risk_threshold', 'eval_compiled', 'grades_pending', 'override_request',
      'override_approved', 'override_rejected', 'term_rollover_reminder',
      'roster_import', 'system', 'compliance', 'assignment', 'class_assigned'
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.dispatch_notifications(p_notifications JSONB)
RETURNS SETOF public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT;
  v_item JSONB;
  v_recipient_id UUID;
  v_type TEXT;
  v_message TEXT;
  v_title TEXT;
  v_link TEXT;
  v_severity TEXT;
  v_payload JSONB;
  v_dedupe_key TEXT;
  v_notification public.notifications;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required to dispatch notifications.';
  END IF;

  SELECT role::TEXT INTO v_actor_role
  FROM public.users
  WHERE user_id = v_actor_id;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'The authenticated user has no application role.';
  END IF;

  IF jsonb_typeof(p_notifications) <> 'array'
     OR jsonb_array_length(p_notifications) = 0
     OR jsonb_array_length(p_notifications) > 100 THEN
    RAISE EXCEPTION 'Notifications must be a non-empty array of at most 100 items.';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_notifications)
  LOOP
    v_recipient_id := NULLIF(v_item->>'recipient_id', '')::UUID;
    v_type := lower(trim(COALESCE(v_item->>'type', 'system')));
    v_message := trim(COALESCE(v_item->>'message', ''));
    v_title := NULLIF(trim(COALESCE(v_item->>'title', '')), '');
    v_link := NULLIF(trim(COALESCE(v_item->>'link', '')), '');
    v_severity := lower(trim(COALESCE(v_item->>'severity', 'info')));
    v_payload := COALESCE(v_item->'payload', '{}'::JSONB);
    v_dedupe_key := NULLIF(trim(COALESCE(v_item->>'dedupe_key', '')), '');

    IF v_recipient_id IS NULL
       OR v_type !~ '^[a-z][a-z0-9_]{0,63}$'
       OR v_message = ''
       OR char_length(v_message) > 1000
       OR (v_title IS NOT NULL AND char_length(v_title) > 160)
       OR (v_link IS NOT NULL AND (left(v_link, 1) <> '/' OR char_length(v_link) > 255))
       OR v_severity NOT IN ('info', 'warning', 'critical')
       OR jsonb_typeof(v_payload) <> 'object'
       OR (v_dedupe_key IS NOT NULL AND char_length(v_dedupe_key) > 255) THEN
      RAISE EXCEPTION 'A notification contains invalid data.';
    END IF;

    IF NOT public.can_dispatch_notification(v_actor_id, v_actor_role, v_recipient_id, v_type) THEN
      RAISE EXCEPTION 'Not authorized to send notification type % to this recipient.', v_type;
    END IF;

    INSERT INTO public.notifications (
      recipient_id, type, title, link, severity, message, payload, dedupe_key, is_read
    ) VALUES (
      v_recipient_id, v_type, v_title, v_link, v_severity, v_message, v_payload, v_dedupe_key, FALSE
    )
    ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING * INTO v_notification;

    IF FOUND THEN
      INSERT INTO public.notification_deliveries (
        notification_id, channel, recipient_id, status, attempts, sent_at
      ) VALUES (
        v_notification.notification_id, 'in_app', v_recipient_id, 'sent', 1, CURRENT_TIMESTAMP
      );
      RETURN NEXT v_notification;
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(p_notification_ids UUID[] DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.notifications
  SET is_read = TRUE,
      read_at = COALESCE(read_at, CURRENT_TIMESTAMP)
  WHERE recipient_id = auth.uid()
    AND dismissed_at IS NULL
    AND (p_notification_ids IS NULL OR notification_id = ANY(p_notification_ids));

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_notifications(p_notification_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  IF p_notification_ids IS NULL OR cardinality(p_notification_ids) = 0 THEN
    RETURN 0;
  END IF;

  UPDATE public.notifications
  SET dismissed_at = CURRENT_TIMESTAMP
  WHERE recipient_id = auth.uid()
    AND notification_id = ANY(p_notification_ids)
    AND dismissed_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.requeue_notification_delivery(p_delivery_id UUID)
RETURNS public.notification_deliveries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_delivery public.notification_deliveries;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.users actor
    WHERE actor.user_id = auth.uid() AND actor.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only administrators may requeue notification deliveries.';
  END IF;

  UPDATE public.notification_deliveries
  SET status = 'pending', attempts = 0, error_message = NULL,
      failed_at = NULL, last_attempt_at = NULL
  WHERE delivery_id = p_delivery_id
    AND status = 'failed'
  RETURNING * INTO v_delivery;

  IF v_delivery.delivery_id IS NULL THEN
    RAISE EXCEPTION 'Failed delivery not found.';
  END IF;

  RETURN v_delivery;
END;
$$;

REVOKE ALL ON FUNCTION public.can_dispatch_notification(UUID, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dispatch_notifications(JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notifications_read(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dismiss_notifications(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.requeue_notification_delivery(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.dispatch_notifications(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_notifications(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_notification_delivery(UUID) TO authenticated;

GRANT SELECT ON public.notifications, public.notification_deliveries, public.notification_preferences TO authenticated;
