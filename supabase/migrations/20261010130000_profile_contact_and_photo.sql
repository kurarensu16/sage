-- =============================================================================
-- ASPIRE: SELF-SERVICE CONTACT NUMBER AND PROFILE PHOTO
-- =============================================================================
-- Users may manage only their own contact number and optional profile photo.
-- Name, email, ID number, department, and section stay administrator-managed
-- because they identify the user on official grade and audit records.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS contact_number TEXT,
  ADD COLUMN IF NOT EXISTS avatar_path TEXT;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_contact_number_format;
ALTER TABLE public.users
  ADD CONSTRAINT users_contact_number_format
  CHECK (contact_number IS NULL OR contact_number ~ '^\+639[0-9]{9}$');

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_avatar_path_owner;
ALTER TABLE public.users
  ADD CONSTRAINT users_avatar_path_owner
  CHECK (avatar_path IS NULL OR avatar_path LIKE user_id::TEXT || '/%');

-- Accepts 09XXXXXXXXX, 639XXXXXXXXX, or +639XXXXXXXXX (spaces/dashes ignored);
-- stores +639XXXXXXXXX. An empty value clears the number.
CREATE OR REPLACE FUNCTION public.update_own_contact_number(p_contact_number TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_digits TEXT := regexp_replace(COALESCE(p_contact_number, ''), '[\s()-]', '', 'g');
  v_normalized TEXT;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;

  IF v_digits = '' THEN
    v_normalized := NULL;
  ELSIF v_digits ~ '^09[0-9]{9}$' THEN
    v_normalized := '+63' || substr(v_digits, 2);
  ELSIF v_digits ~ '^639[0-9]{9}$' THEN
    v_normalized := '+' || v_digits;
  ELSIF v_digits ~ '^\+639[0-9]{9}$' THEN
    v_normalized := v_digits;
  ELSE
    RAISE EXCEPTION 'Enter a Philippine mobile number such as 0917 123 4567.';
  END IF;

  UPDATE public.users SET contact_number = v_normalized WHERE user_id = v_actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your account was not found.';
  END IF;
  RETURN v_normalized;
END;
$$;

REVOKE ALL ON FUNCTION public.update_own_contact_number(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_own_contact_number(TEXT) TO authenticated;

-- Records (or clears) the caller's photo path; the object must be in their own folder.
CREATE OR REPLACE FUNCTION public.set_own_avatar_path(p_avatar_path TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor UUID := auth.uid();
  v_path TEXT := NULLIF(btrim(COALESCE(p_avatar_path, '')), '');
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;
  IF v_path IS NOT NULL AND (
    v_path NOT LIKE v_actor::TEXT || '/%'
    OR v_path ~ '\.\.'
    OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'avatars' AND name = v_path)
  ) THEN
    RAISE EXCEPTION 'Upload the photo to your own profile folder first.';
  END IF;

  UPDATE public.users SET avatar_path = v_path WHERE user_id = v_actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Your account was not found.';
  END IF;
  RETURN v_path;
END;
$$;

REVOKE ALL ON FUNCTION public.set_own_avatar_path(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_own_avatar_path(TEXT) TO authenticated;

-- Private bucket: photos are personal data (R.A. 10173) and are served through
-- short-lived signed URLs. 2 MB limit; JPEG, PNG, or WebP only.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', FALSE, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Owner-only access: each user reads and writes only objects under "<user_id>/".
DROP POLICY IF EXISTS avatars_owner_select ON storage.objects;
CREATE POLICY avatars_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

DROP POLICY IF EXISTS avatars_owner_insert ON storage.objects;
CREATE POLICY avatars_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

DROP POLICY IF EXISTS avatars_owner_update ON storage.objects;
CREATE POLICY avatars_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT)
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

DROP POLICY IF EXISTS avatars_owner_delete ON storage.objects;
CREATE POLICY avatars_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::TEXT);

COMMIT;
