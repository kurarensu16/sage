-- =============================================================================
-- ASPIRE AI ADVISOR: FACULTY-CONTROLLED ACTIVITY RELEASE
-- =============================================================================
-- Activity configuration and scores remain faculty-private until the activity
-- is explicitly released. Student-facing advising may only consume released
-- activities; official grades remain limited to posted Midterm and Final data.

BEGIN;

ALTER TABLE public.class_activities
ADD COLUMN IF NOT EXISTS is_released BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS topic_tag VARCHAR(100),
ADD COLUMN IF NOT EXISTS released_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS released_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_class_activities_student_release
ON public.class_activities(class_record_id, term, is_released, created_at);

-- Keep the current development security posture. Production RLS policies will
-- be introduced as a separate, audited feature after all actor paths are known.
ALTER TABLE public.class_activities DISABLE ROW LEVEL SECURITY;

COMMIT;
