-- =============================================================================
-- ASPIRE: AUTOMATIC STUDENT VISIBILITY FOR SAVED ACTIVITIES
-- =============================================================================
-- The faculty-only activity draft/release workflow has been retired. Every
-- saved activity is visible to enrolled students. A missing score is Pending;
-- a numeric score is Tentative until the applicable grade milestone is posted.
-- Legacy release columns remain temporarily for backward compatibility.

BEGIN;

UPDATE public.class_activities
SET is_released = TRUE,
    released_at = COALESCE(released_at, created_at, CURRENT_TIMESTAMP)
WHERE is_released IS DISTINCT FROM TRUE;

ALTER TABLE public.class_activities
ALTER COLUMN is_released SET DEFAULT TRUE;

COMMIT;
