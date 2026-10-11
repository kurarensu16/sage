-- Admin setup audit M3 and M10: save COG templates and college deans in one step.
--
-- Before:
--   * Grading Formulas saved each component weight as a separate request, so a failure
--     part-way left the template's weights not totalling 100%. Creating a template was
--     two separate inserts (header, then components).
--   * Colleges: choosing "No Dean" did not unassign the current dean; removing the old
--     dean and linking the new one were separate, unchecked requests.
--
-- After (admin only, each call is one transaction: all or nothing):
--   1. save_grade_template(id, name, description, components)
--        id NULL  -> creates the template and all its components.
--        id given -> updates the weights of its existing components only (the
--                    template's structure stays locked, as before).
--        Refused unless names are filled and unique, weights and max scores are
--        positive, and the weights total 100% (tolerance 0.01, same as the app).
--   2. assign_department_dean(college, dean or NULL)
--        Unassigns every other dean of the college, then links the chosen dean.
--        NULL means "No Dean".
-- No existing rows are changed by this migration.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_grade_template(
  p_computation_id UUID,
  p_name TEXT,
  p_description TEXT,
  p_components JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id UUID := p_computation_id;
  v_count INTEGER;
  v_total NUMERIC;
  v_existing INTEGER;
  v_matched INTEGER;
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only an active administrator can save grading templates.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_name, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A template name is required.';
  END IF;
  IF jsonb_typeof(p_components) IS DISTINCT FROM 'array' OR jsonb_array_length(p_components) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'At least one grading component is required.';
  END IF;

  SELECT COUNT(*), SUM((c->>'weight')::NUMERIC)
  INTO v_count, v_total
  FROM jsonb_array_elements(p_components) c
  WHERE (c->>'weight')::NUMERIC > 0;

  IF v_count <> jsonb_array_length(p_components) OR ABS(COALESCE(v_total, 0) - 100) > 0.01 THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Every component needs a weight above 0, and the weights must total 100%.';
  END IF;

  IF v_id IS NULL THEN
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_components) c
      WHERE NULLIF(BTRIM(COALESCE(c->>'name', '')), '') IS NULL
         OR COALESCE((c->>'max_score')::NUMERIC, 0) <= 0
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Every component needs a name and a max score above 0.';
    END IF;
    IF (SELECT COUNT(DISTINCT lower(BTRIM(c->>'name'))) FROM jsonb_array_elements(p_components) c)
       <> jsonb_array_length(p_components) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Component names must be unique.';
    END IF;

    INSERT INTO public.grade_computations (name, description)
    VALUES (BTRIM(p_name), NULLIF(BTRIM(COALESCE(p_description, '')), ''))
    RETURNING computation_id INTO v_id;

    INSERT INTO public.grade_computation_components (computation_id, name, weight, max_score, is_multiple)
    SELECT v_id, BTRIM(c->>'name'), (c->>'weight')::NUMERIC, (c->>'max_score')::NUMERIC,
           COALESCE((c->>'is_multiple')::BOOLEAN, FALSE)
    FROM jsonb_array_elements(p_components) c;

    RETURN v_id;
  END IF;

  -- Existing template: weights only; every existing component must be included once.
  PERFORM 1 FROM public.grade_computations WHERE computation_id = v_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'The grading template no longer exists.';
  END IF;

  SELECT COUNT(*) INTO v_existing FROM public.grade_computation_components WHERE computation_id = v_id;
  SELECT COUNT(DISTINCT gcc.component_id) INTO v_matched
  FROM jsonb_array_elements(p_components) c
  JOIN public.grade_computation_components gcc
    ON gcc.component_id = NULLIF(c->>'component_id', '')::UUID
   AND gcc.computation_id = v_id;

  IF v_matched <> v_existing OR jsonb_array_length(p_components) <> v_existing THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'An existing template''s components cannot be added or removed; only their weights can change. Create a new template for a different structure.';
  END IF;

  UPDATE public.grade_computation_components gcc
  SET weight = (c->>'weight')::NUMERIC
  FROM jsonb_array_elements(p_components) c
  WHERE gcc.component_id = (c->>'component_id')::UUID
    AND gcc.computation_id = v_id
    AND gcc.weight IS DISTINCT FROM (c->>'weight')::NUMERIC;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_grade_template(UUID, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_grade_template(UUID, TEXT, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.assign_department_dean(
  p_department_id UUID,
  p_dean_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_active_admin() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only an active administrator can assign a dean.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.departments WHERE department_id = p_department_id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'The college no longer exists.';
  END IF;
  IF p_dean_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = p_dean_id AND role::TEXT = 'dean' AND COALESCE(status::TEXT, 'active') = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The selected user is not an active dean.';
  END IF;

  UPDATE public.users
  SET department_id = NULL
  WHERE role::TEXT = 'dean'
    AND department_id = p_department_id
    AND user_id IS DISTINCT FROM p_dean_id;

  IF p_dean_id IS NOT NULL THEN
    UPDATE public.users SET department_id = p_department_id WHERE user_id = p_dean_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_department_dean(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_department_dean(UUID, UUID) TO authenticated;

COMMIT;
