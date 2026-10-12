-- Subjects: refuse duplicates.
--
-- Before: the same subject could be registered twice in a college under different codes
-- (e.g. "Data Structures and Algorithms" as both DSA123 and DSA213), and codes were only
-- unique as typed.
-- After:
--   * a subject code is unique regardless of case or spaces (dsa123 = DSA123);
--   * a subject name is unique within its college regardless of case or spaces.
--     The same name may still exist in another college (e.g. "Understanding the Self"
--     in General Education and in Health Sciences).
-- No rows are changed. If duplicates already exist, this migration stops and lists them;
-- remove or rename them first, then run it again.

BEGIN;

DO $$
DECLARE
  v_dupes TEXT;
BEGIN
  SELECT string_agg(code_key || ' (' || n || 'x)', ', ') INTO v_dupes
  FROM (
    SELECT upper(btrim(code)) AS code_key, COUNT(*) AS n
    FROM public.subjects GROUP BY 1 HAVING COUNT(*) > 1
  ) d;
  IF v_dupes IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate subject codes exist: %. Remove or rename them, then run this migration again.', v_dupes;
  END IF;

  SELECT string_agg('"' || name_key || '" (' || n || 'x)', ', ') INTO v_dupes
  FROM (
    SELECT lower(btrim(name)) AS name_key, COUNT(*) AS n
    FROM public.subjects GROUP BY department_id, 1 HAVING COUNT(*) > 1
  ) d;
  IF v_dupes IS NOT NULL THEN
    RAISE EXCEPTION 'The same subject name exists more than once in a college: %. Remove or rename them, then run this migration again.', v_dupes;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_subjects_code_normalized
  ON public.subjects (upper(btrim(code)));

CREATE UNIQUE INDEX IF NOT EXISTS uq_subjects_college_name_normalized
  ON public.subjects (department_id, lower(btrim(name)));

COMMIT;

-- Verify (read-only): both indexes listed.
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'subjects' AND indexname LIKE 'uq_subjects_%';
