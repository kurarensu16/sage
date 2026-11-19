// Editing a live class schedule does not clash with that same class; a real clash is still refused.
// Runs the real migration file(s) 20261118183828 against PGlite with stand-in tables and
// helpers (the live schema predates the tracked migrations), the same approach as
// verifyEvaluationReferrals.js.
// Setup once: npm install --prefix scratch/referral-validation --no-save --package-lock=false @electric-sql/pglite
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const { PGlite } = await import(pathToFileURL(path.join(root, 'scratch/referral-validation/node_modules/@electric-sql/pglite/dist/index.js')).href);
const db = new PGlite();
const mig = (f) => fs.readFile(path.join(root, 'supabase/migrations', f), 'utf8');

const src = await mig('20261029093613_faculty_loading_and_provisioning.sql');
const start = src.indexOf('CREATE OR REPLACE FUNCTION public.find_schedule_conflict(');
const end = src.indexOf('$$;', src.indexOf('AS $$', start)) + 3;
const fn = src.slice(start, end);

await db.exec(`
  CREATE TABLE departments(department_id UUID PRIMARY KEY, name TEXT);
  CREATE TABLE programs(program_id UUID PRIMARY KEY, department_id UUID, abbreviation TEXT);
  CREATE TABLE sections(section_id UUID PRIMARY KEY, name TEXT, department_id UUID);
  CREATE TABLE subjects(subject_id UUID PRIMARY KEY, code TEXT);
  CREATE TABLE class_records(class_record_id UUID PRIMARY KEY, faculty_id UUID, section_id UUID, subject_id UUID,
    school_year TEXT, semester TEXT, meeting_days TEXT[], start_time TIME, end_time TIME);
  CREATE TABLE faculty_load_drafts(id UUID PRIMARY KEY, faculty_id UUID, section_id UUID, subject_id UUID, department_id UUID,
    school_year TEXT, semester TEXT, status TEXT, meeting_days TEXT[], start_time TIME, end_time TIME, class_record_id UUID);
  CREATE FUNCTION redact_schedule_conflict(p JSONB) RETURNS JSONB LANGUAGE sql AS $$ SELECT p $$;
  INSERT INTO departments VALUES ('00000000-0000-0000-0000-0000000000d1','TECH');
  INSERT INTO sections VALUES ('00000000-0000-0000-0000-0000000000a1','BSIT-1B','00000000-0000-0000-0000-0000000000d1');
  INSERT INTO subjects VALUES ('00000000-0000-0000-0000-0000000000b1','IT213'), ('00000000-0000-0000-0000-0000000000b2','IT214');
  -- The finalized class and the draft it came from, same schedule.
  INSERT INTO class_records VALUES ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','2026-2027','1st',
    ARRAY['Mon','Tue','Wed','Thu','Fri','Sat'],'12:45','20:00');
  INSERT INTO faculty_load_drafts VALUES ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000f1',
    '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000d1',
    '2026-2027','1st','finalized',ARRAY['Mon','Tue','Wed','Thu','Fri','Sat'],'12:45','20:00','00000000-0000-0000-0000-0000000000c1');
`);
await db.exec(fn);

const check = async () => (await db.query(`SELECT find_schedule_conflict(
  '00000000-0000-0000-0000-0000000000f1','00000000-0000-0000-0000-0000000000a1', ARRAY['Wed'], '12:45','20:00',
  '2026-2027','1st', NULL, '00000000-0000-0000-0000-0000000000c1') AS c`)).rows[0].c;

assert.ok(await check(), 'bug should reproduce before the fix');
console.log('ok  reproduced: the class collides with its own draft');

await db.exec(await mig('20261118183828_a_class_does_not_conflict_with_itself.sql'));
await db.exec(await mig('20261118183828_a_class_does_not_conflict_with_itself.sql')); // re-run is safe
assert.equal(await check(), null);
console.log('ok  fixed: narrowing the class to Wednesday is no longer refused');

// A genuinely different class of the same faculty at Wed 13:00 must still be refused.
await db.exec(`INSERT INTO class_records VALUES ('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000f1',
  '00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b2','2026-2027','1st', ARRAY['Wed'],'13:00','14:00');`);
const real = await check();
assert.ok(real && real.subject_code === 'IT214', 'a real clash must still be caught');
console.log('ok  a real clash with another class (IT214) is still refused');

// Adding a brand-new draft (no class excluded) still sees the existing class.
const add = (await db.query(`SELECT find_schedule_conflict('00000000-0000-0000-0000-0000000000f1',
  '00000000-0000-0000-0000-0000000000a1', ARRAY['Mon'], '13:00','14:00','2026-2027','1st', NULL, NULL) AS c`)).rows[0].c;
assert.ok(add, 'new loads must still see existing classes');
console.log('ok  adding a new load still detects existing classes');
console.log('\nAll 4 checks passed.');
