-- Phase 2.2 (ASPIRE-C09) — Give departments a real abbreviation column so the UI stops
-- hard-coding or pattern-matching college names.
--
-- Verified against the live departments table on 2026-10-14: the table holds only
-- (department_id, name, created_at), so this column genuinely does not exist yet.
--
-- Before this, "CCS" was produced three ways, none of them from data:
--   src/components/ExportPreviewModal.jsx — the literal "DEAN, CCS" on the signatory
--     line of official grade exports, with no data binding at all
--   src/pages/admin/UserList.jsx (x2) — ternaries mapping 'College of IT'/'College of CS'
--     to 'CCS', and neither of those is a department name in this database
--
-- The computing college here is "Technology and Engineering College for Humanity", whose
-- abbreviation is TECH. Full names are kept: only the displayed abbreviation is added,
-- which is what the consultation asked for. Department association everywhere is by
-- department_id, and no RLS policy or function compares a department by name, so this is
-- display-only and carries no authorization risk.
--
-- The abbreviations below were derived from each college's name, not supplied by the
-- institution. Adjust any of them here before running if the official code differs.
--
-- Only NULL or empty values are filled, so nothing already set is overwritten.

BEGIN;

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS short_name TEXT;

UPDATE public.departments department
SET short_name = mapping.short_name
FROM (
  VALUES
    ('Technology and Engineering College for Humanity', 'TECH'),
    ('College of Accountancy', 'COA'),
    ('College of Art and Sciences', 'CAS'),
    ('College of Business Administration', 'CBA'),
    ('College of Education', 'COE'),
    ('College of Health Sciences', 'CHS'),
    ('College of Hospitality Management and Tourism', 'CHMT'),
    ('College of Maritime Education', 'CME'),
    ('Department of General Education', 'DGE'),
    ('School of Psychology', 'SOP')
) AS mapping(name, short_name)
WHERE department.name = mapping.name
  AND COALESCE(department.short_name, '') = '';

-- Legacy computing-college names, kept only so this migration still lands on older
-- copies of the data. Matches nothing in the current database.
UPDATE public.departments
SET short_name = 'TECH'
WHERE COALESCE(short_name, '') = ''
  AND name IN ('College of Computer Studies', 'College of IT', 'College of CS');

-- A department with no short_name falls back to its full name in the UI, so nothing
-- breaks. To find any that were missed:
--   SELECT department_id, name FROM public.departments WHERE COALESCE(short_name, '') = '';

COMMIT;
