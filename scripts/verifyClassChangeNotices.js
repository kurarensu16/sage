// A live class schedule change or transfer notifies its students and faculty; drafts and no-change saves stay silent.
// Runs the real migration file(s) 20261118184937 against PGlite with stand-in tables and
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
const q = async (s, p = []) => (await db.query(s, p)).rows;
const ID = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const CLS = ID(900), F1 = ID(101), F2 = ID(102), S1 = ID(201), S2 = ID(202), S3 = ID(203);

await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated;
  CREATE TABLE users(user_id UUID PRIMARY KEY, first_name TEXT, last_name TEXT, role TEXT);
  CREATE TABLE subjects(subject_id UUID PRIMARY KEY, code TEXT);
  CREATE TABLE sections(section_id UUID PRIMARY KEY, name TEXT);
  CREATE TABLE class_records(class_record_id UUID PRIMARY KEY, subject_id UUID, section_id UUID, faculty_id UUID,
    status TEXT DEFAULT 'active', class_type TEXT DEFAULT 'lecture', meeting_days TEXT[], start_time TIME, end_time TIME);
  CREATE TABLE enrollments(student_id UUID, subject_id UUID, section_id UUID, status TEXT DEFAULT 'active');
  CREATE TABLE notifications(notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), recipient_id UUID, type TEXT,
    title TEXT, link TEXT, severity TEXT, message TEXT, payload JSONB, dedupe_key TEXT, is_read BOOLEAN, created_at TIMESTAMPTZ DEFAULT now());
  CREATE UNIQUE INDEX notifications_dedupe ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;
  CREATE FUNCTION delete_class_record(p UUID) RETURNS JSONB LANGUAGE sql AS $$ SELECT '{}'::jsonb $$;
  GRANT EXECUTE ON FUNCTION delete_class_record(UUID) TO authenticated;
  INSERT INTO users VALUES ('${F1}','Amanda','Rivera','faculty'),('${F2}','Marcus','Cruz','faculty'),
    ('${S1}','Ana','One','student'),('${S2}','Ben','Two','student'),('${S3}','Cy','Three','student');
  INSERT INTO subjects VALUES ('${ID(1)}','IT213'); INSERT INTO sections VALUES ('${ID(2)}','BSIT-1B');
  INSERT INTO class_records VALUES ('${CLS}','${ID(1)}','${ID(2)}','${F1}','active','lecture',
    ARRAY['Mon','Tue','Wed','Thu','Fri','Sat'],'12:45','20:00');
  INSERT INTO enrollments VALUES ('${S1}','${ID(1)}','${ID(2)}','active'),('${S2}','${ID(1)}','${ID(2)}','active'),
    ('${S3}','${ID(1)}','${ID(2)}','dropped');
`);
const mig = await fs.readFile(path.join(root, 'supabase/migrations/20261118184937_class_changes_notify_students_and_faculty.sql'), 'utf8');
await db.exec(mig);
await db.exec(mig); // re-run is safe
const out = [];
const count = async () => Number((await q('SELECT count(*) n FROM notifications'))[0].n);

await db.exec(`UPDATE class_records SET meeting_days = ARRAY['Wed'] WHERE class_record_id = '${CLS}'`);
let rows = await q('SELECT recipient_id, title, message FROM notifications ORDER BY recipient_id');
assert.equal(rows.length, 3, 'two active students + the faculty');
assert.ok(!rows.some((r) => r.recipient_id === S3), 'a dropped student is not told');
assert.ok(rows[0].message.includes('now meets Wed 12:45 PM–8:00 PM (was Mon/Tue/Wed/Thu/Fri/Sat 12:45 PM–8:00 PM)'), rows[0].message);
out.push('ok  schedule change: 2 enrolled students + faculty notified, old -> new shown; dropped student not told');

await db.exec(`UPDATE class_records SET meeting_days = ARRAY['Wed'] WHERE class_record_id = '${CLS}'`);
assert.equal(await count(), 3);
out.push('ok  saving the same schedule sends nothing');

await db.exec(`DELETE FROM notifications; UPDATE class_records SET faculty_id = '${F2}' WHERE class_record_id = '${CLS}'`);
rows = await q('SELECT recipient_id, title, message FROM notifications');
const by = (id) => rows.find((r) => r.recipient_id === id);
assert.equal(rows.length, 4);
assert.ok(by(S1).message.includes('now handled by Prof. Marcus Cruz'));
assert.equal(by(F2).title, 'Class Assigned to You');
assert.ok(by(F1).message.includes('transferred to Prof. Marcus Cruz'));
out.push('ok  transfer: students, the new faculty and the previous faculty each notified');

await db.exec(`DELETE FROM notifications; UPDATE class_records SET faculty_id = '${F1}', start_time = '13:00' WHERE class_record_id = '${CLS}'`);
rows = await q('SELECT recipient_id, title FROM notifications');
assert.equal(rows.filter((r) => r.title === 'Class Schedule Changed').length, 3);
assert.equal(rows.filter((r) => r.title !== 'Class Schedule Changed').length, 4);
out.push('ok  schedule + transfer together: both kinds of notice, no clash of keys');

await db.exec(`DELETE FROM notifications; UPDATE class_records SET status = 'archived' WHERE class_record_id = '${CLS}';
  UPDATE class_records SET start_time = '14:00' WHERE class_record_id = '${CLS}'`);
assert.equal(await count(), 0);
out.push('ok  an archived class sends nothing');

const can = (await q(`SELECT has_function_privilege('authenticated', 'delete_class_record(uuid)', 'EXECUTE') AS c`))[0].c;
assert.equal(can, false);
out.push('ok  the app can no longer remove a live class');

console.log(out.join('\n'));
console.log(`\nAll ${out.length} checks passed.`);
