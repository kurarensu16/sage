-- Migration: Enable RLS and add granular security policies for faculty and deans
ALTER TABLE remark_override_requests ENABLE ROW LEVEL SECURITY;

-- 1. Allow authenticated users (deans, faculty, admins) to view remark requests
CREATE POLICY "Allow select for authenticated users on remark_override_requests"
ON remark_override_requests FOR SELECT TO authenticated
USING (true);

-- 2. Allow faculty to submit (insert) new remark requests
CREATE POLICY "Allow insert for faculty on remark_override_requests"
ON remark_override_requests FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM users 
  WHERE users.user_id = auth.uid() 
    AND users.role = 'faculty'
));

-- 3. Allow deans to resolve (update) remark requests
CREATE POLICY "Allow update for deans on remark_override_requests"
ON remark_override_requests FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM users 
  WHERE users.user_id = auth.uid() 
    AND users.role = 'dean'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM users 
  WHERE users.user_id = auth.uid() 
    AND users.role = 'dean'
));
