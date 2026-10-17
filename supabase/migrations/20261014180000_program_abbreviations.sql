-- Phase 2.2b — Record programs.abbreviation in the migration history.
--
-- This column already exists in the live project and all 26 programs already carry the
-- correct code (verified against the table on 2026-10-14), so this migration is a no-op
-- there. It exists because the column was added by hand and no migration ever created it:
-- a database rebuilt from supabase/migrations alone would not have it, and the app now
-- depends on it. The planned reset and rebuild (docs/03-development/audits,
-- ADMIN_SETUP_AUDIT_2026-10-11 section 6) is exactly that case.
--
-- Why the app depends on it: section names are built as
-- "<PROGRAM ABBREVIATION>-<year digit><suffix>" (BSIT-1A), so the abbreviation is the only
-- link from a section to its program. It decides which sections a student may be assigned
-- to and drives the program filters in the admin and dean portals.
--
-- The same mapping used to be duplicated in code, in five places, which is what this
-- change removed:
--   src/lib/constants.js                      PROGRAM_ABBREVIATIONS
--   src/pages/admin/SectionList.jsx           PROGRAM_NAMES (the reverse mapping)
--   src/pages/admin/SectionForm.jsx           a duplicate of PROGRAM_ABBREVIATIONS
--   src/pages/dean/GradeDistribution.jsx      another duplicate
--   src/pages/admin/ClassroomProvisioning.jsx a chain of programName.includes(...) guesses
--
-- Two of those were load-bearing because their queries never selected the column:
-- UserForm.jsx fetched only (program_id, name, department_id) and GradeDistribution.jsx
-- only (name), so both fell back to their in-code map. Both now select abbreviation.
--
-- Only NULL or empty values are filled, so nothing already set is overwritten.

BEGIN;

ALTER TABLE public.programs
  ADD COLUMN IF NOT EXISTS abbreviation TEXT;

UPDATE public.programs program
SET abbreviation = mapping.abbreviation
FROM (
  VALUES
    ('Bachelor of Science in Accountancy', 'BSA'),
    ('Bachelor of Science in Accounting Information System', 'BSAIS'),
    ('Bachelor of Arts in Political Science', 'BAPS'),
    ('Bachelor of Science in Business Administration', 'BSBA'),
    ('Bachelor of Science in Business Administration Major in Human Resource Development Management', 'BSBA-HRDM'),
    ('Bachelor of Science in Business Administration Major in Financial Management', 'BSBA-FM'),
    ('Bachelor of Science in Business Administration Major in Operations Management', 'BSBA-OM'),
    ('Bachelor of Science in Business Administration Major in Marketing Management', 'BSBA-MM'),
    ('Bachelor of Science in Computer Science', 'BSCS'),
    ('Bachelor of Science in Computer Engineering', 'BSCpE'),
    ('Bachelor of Science in Information Technology', 'BSIT'),
    ('Associate in Computer Technology', 'ACT'),
    ('Bachelor of Elementary Education', 'BEEd'),
    ('Bachelor of Secondary Education Major in Mathematics', 'BSEd-Math'),
    ('Bachelor of Secondary Education Major in Filipino', 'BSEd-Fil'),
    ('Bachelor of Secondary Education Major in English', 'BSEd-Eng'),
    ('Bachelor of Secondary Education Major in Sciences', 'BSEd-Sci'),
    ('Continuing Professional Teacher Education', 'CPTE'),
    ('Bachelor of Science in Nursing', 'BSN'),
    ('Bachelor of Science in Midwifery', 'BSM'),
    ('Bachelor of Science in Hospitality Management', 'BSHM'),
    ('Bachelor of Science in Tourism Management', 'BSTM'),
    ('Bachelor of Science in Marine Transportation', 'BSMT'),
    ('Bachelor of Science in Marine Engineering', 'BSMarE'),
    ('Bachelor of Science in Mechanical Engineering', 'BSME'),
    ('Bachelor of Arts in Psychology', 'BAPsych')
) AS mapping(name, abbreviation)
WHERE program.name = mapping.name
  AND COALESCE(program.abbreviation, '') = '';

-- A program with no abbreviation cannot be matched to its sections by name. After a
-- rebuild, check for any:
--   SELECT program_id, name FROM public.programs WHERE COALESCE(abbreviation, '') = '';

COMMIT;
