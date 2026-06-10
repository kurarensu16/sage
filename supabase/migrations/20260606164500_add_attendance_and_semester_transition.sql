-- Migration: Add Academic Terms, Semester Transition, and Attendance Tracking features
-- Created At: 2026-06-06T11:18:00Z

-- 1. Create custom enum type for semesters if not already present
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'semester_period') THEN
        CREATE TYPE semester_period AS ENUM ('1st', '2nd', 'Summer');
    END IF;
END$$;

-- 2. Term registry (Global System State)
CREATE TABLE IF NOT EXISTS academic_terms (
    term_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    school_year VARCHAR(15) NOT NULL,
    semester semester_period NOT NULL,
    is_active BOOLEAN DEFAULT FALSE,
    is_evaluation_open BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enforce a database constraint so that at most one row has is_active = TRUE
CREATE UNIQUE INDEX IF NOT EXISTS active_term_singleton_idx 
ON academic_terms (is_active) 
WHERE is_active = TRUE;

-- 3. Student Term History (Saves history before sections reset during rollover)
CREATE TABLE IF NOT EXISTS student_term_details (
    mapping_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    term_id UUID REFERENCES academic_terms(term_id) ON DELETE CASCADE,
    year_level VARCHAR(20),
    section_id UUID REFERENCES sections(section_id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, term_id)
);

-- 4. Late Submission Flag in posted_grades table
ALTER TABLE posted_grades ADD COLUMN IF NOT EXISTS is_late_submission BOOLEAN DEFAULT FALSE;

-- 5. Link sections & classes to the central terms registry
ALTER TABLE sections ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES academic_terms(term_id) ON DELETE SET NULL;
ALTER TABLE class_records ADD COLUMN IF NOT EXISTS term_id UUID REFERENCES academic_terms(term_id) ON DELETE CASCADE;

-- 6. Seed starting active term
INSERT INTO academic_terms (school_year, semester, is_active, is_evaluation_open)
VALUES ('2025-2026', '2nd', TRUE, FALSE)
ON CONFLICT DO NOTHING;

-- 7. Create custom enum type for attendance statuses if not present
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'attendance_status') THEN
        CREATE TYPE attendance_status AS ENUM ('Present', 'Absent', 'Late', 'Excused');
    END IF;
END$$;

-- 8. Create the daily attendance registry
CREATE TABLE IF NOT EXISTS attendance_records (
    attendance_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    class_record_id UUID REFERENCES class_records(class_record_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status attendance_status NOT NULL DEFAULT 'Present',
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    term_id UUID REFERENCES academic_terms(term_id) ON DELETE CASCADE,
    UNIQUE(student_id, class_record_id, date)
);

-- 9. Add indexes for fast lookup
CREATE INDEX IF NOT EXISTS idx_attendance_by_class_date ON attendance_records (class_record_id, date);
CREATE INDEX IF NOT EXISTS idx_attendance_by_student ON attendance_records (student_id, term_id);

-- 10. Enable Row Level Security (RLS)
ALTER TABLE academic_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_term_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

-- 11. Define RLS Policies

-- Policies for academic_terms
CREATE POLICY "Allow select for authenticated users on academic_terms" 
ON academic_terms FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow all operations for admins on academic_terms" 
ON academic_terms FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM users WHERE users.user_id = auth.uid() AND users.role = 'admin'));

-- Policies for student_term_details
CREATE POLICY "Allow select for authenticated users on student_term_details" 
ON student_term_details FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow all operations for admins on student_term_details" 
ON student_term_details FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM users WHERE users.user_id = auth.uid() AND users.role = 'admin'));

-- Policies for attendance_records
CREATE POLICY "Allow select for authenticated users on attendance_records" 
ON attendance_records FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow all operations for faculty and admin on attendance_records" 
ON attendance_records FOR ALL TO authenticated 
USING (EXISTS (SELECT 1 FROM users WHERE users.user_id = auth.uid() AND users.role IN ('faculty', 'admin')));

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.academic_terms TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.student_term_details TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.attendance_records TO authenticated;

-- =========================================================================
-- STORED FUNCTIONS & RPCs
-- =========================================================================

-- 12. Unified Roster Fetch Function
CREATE OR REPLACE FUNCTION get_class_attendance_roster(p_class_record_id UUID)
RETURNS TABLE (
    student_id UUID,
    first_name VARCHAR,
    last_name VARCHAR,
    student_type VARCHAR
) AS $$
DECLARE
    v_section_id UUID;
    v_subject_id UUID;
BEGIN
    SELECT section_id, subject_id INTO v_section_id, v_subject_id
    FROM class_records
    WHERE class_record_id = p_class_record_id;

    RETURN QUERY
    SELECT 
        u.user_id as student_id,
        u.first_name,
        u.last_name,
        CASE 
            WHEN u.section_id = v_section_id THEN 'Regular'::VARCHAR
            ELSE 'Irregular'::VARCHAR
        END as student_type
    FROM users u
    LEFT JOIN enrollments e ON e.student_id = u.user_id
    WHERE u.role = 'student'
      AND u.status = 'active'
      AND (
          u.section_id = v_section_id
          OR (e.subject_id = v_subject_id AND e.section_id = v_section_id)
      )
    GROUP BY u.user_id, u.first_name, u.last_name, u.section_id
    ORDER BY u.last_name ASC, u.first_name ASC;
END;
$$ LANGUAGE plpgsql;

-- 13. Semester Transition Transaction Procedure
CREATE OR REPLACE FUNCTION perform_semester_transition(
    old_term_uuid UUID, 
    new_term_uuid UUID
) RETURNS VOID AS $$
DECLARE
    is_new_sy BOOLEAN;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM academic_terms WHERE term_id = old_term_uuid) OR 
       NOT EXISTS (SELECT 1 FROM academic_terms WHERE term_id = new_term_uuid) THEN
         RAISE EXCEPTION 'Invalid old or new academic term ID.';
    END IF;

    SELECT (SELECT school_year FROM academic_terms WHERE term_id = new_term_uuid) != 
           (SELECT school_year FROM academic_terms WHERE term_id = old_term_uuid)
    INTO is_new_sy;

    INSERT INTO student_term_details (student_id, term_id, year_level, section_id)
    SELECT user_id, old_term_uuid, COALESCE(year_level, '1st Year'), section_id
    FROM users
    WHERE role = 'student' AND status = 'active' AND section_id IS NOT NULL
    ON CONFLICT (student_id, term_id) DO UPDATE 
    SET year_level = EXCLUDED.year_level, section_id = EXCLUDED.section_id;

    UPDATE class_records 
    SET status = 'archived' 
    WHERE term_id = old_term_uuid;

    UPDATE posted_grades
    SET is_late_submission = TRUE
    WHERE class_record_id IN (SELECT class_record_id FROM class_records WHERE term_id = old_term_uuid)
      AND effective_grade IS NULL;

    IF is_new_sy THEN
        UPDATE users 
        SET year_level = 
            CASE 
                WHEN year_level = '1st Year' THEN '2nd Year'
                WHEN year_level = '2nd Year' THEN '3rd Year'
                WHEN year_level = '3rd Year' THEN '4th Year'
                ELSE 'Graduating'
            END
        WHERE role = 'student' AND status = 'active';
    END IF;

    UPDATE users u
    SET section_id = (
        SELECT ns.section_id 
        FROM sections os
        JOIN sections ns ON ns.term_id = new_term_uuid
        WHERE os.section_id = u.section_id
          AND ns.name = CASE 
              WHEN is_new_sy THEN 
                  REGEXP_REPLACE(os.name, '([1-3])', CAST((CAST(SUBSTRING(os.name FROM '([1-3])') AS INTEGER) + 1) AS TEXT))
              ELSE os.name
          END
    )
    WHERE u.role = 'student' AND u.status = 'active' AND u.section_id IS NOT NULL;

    UPDATE users u
    SET section_id = (SELECT section_id FROM sections WHERE name = 'Graduating' AND term_id = new_term_uuid LIMIT 1)
    WHERE u.role = 'student' 
      AND u.status = 'active' 
      AND u.year_level = 'Graduating';

    UPDATE users u
    SET section_id = NULL
    WHERE u.role = 'student' 
      AND u.status = 'active' 
      AND u.section_id IS NOT NULL 
      AND u.section_id NOT IN (SELECT section_id FROM sections WHERE term_id = new_term_uuid);

    UPDATE academic_terms SET is_active = FALSE WHERE term_id = old_term_uuid;
    UPDATE academic_terms SET is_active = TRUE WHERE term_id = new_term_uuid;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
