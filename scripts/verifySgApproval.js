// SG approval by the Dean: submit, return with a reason, resubmit, approve; held notices; release to every student and guardian; Registrar notice.
// Runs the real migration file(s) 20261118153739 and 20261118194508 against PGlite with stand-in tables and
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

const U = {
  dean: '00000000-0000-0000-0000-0000000000d1',
  otherDean: '00000000-0000-0000-0000-0000000000d2',
  faculty: '00000000-0000-0000-0000-0000000000f1',
  registrar: '00000000-0000-0000-0000-0000000000a1',
  s1: '00000000-0000-0000-0000-000000000051',
  s2: '00000000-0000-0000-0000-000000000052'
};
const DEPT = '00000000-0000-0000-0000-00000000de01';
const DEPT2 = '00000000-0000-0000-0000-00000000de02';
const SEC = '00000000-0000-0000-0000-00000000ec01';
const SUB = '00000000-0000-0000-0000-00000000cb01';
const CLS = '00000000-0000-0000-0000-00000000c1a5';
const OLD = '00000000-0000-0000-0000-00000000c1a6'; // class with an SG from before the workflow

async function as(who) {
  await db.exec('RESET ROLE;');
  await db.query("SELECT set_config('test.uid', $1, false)", [who || '']);
  if (who) await db.exec('SET ROLE authenticated;');
}
const q = async (sql, params = []) => (await db.query(sql, params)).rows;

await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::UUID $$;
  GRANT USAGE ON SCHEMA public, auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;

  CREATE TABLE departments(department_id UUID PRIMARY KEY, name TEXT);
  CREATE TABLE users(user_id UUID PRIMARY KEY, first_name TEXT, last_name TEXT, role TEXT, status TEXT DEFAULT 'active', department_id UUID, email TEXT);
  CREATE TABLE sections(section_id UUID PRIMARY KEY, name TEXT, department_id UUID);
  CREATE TABLE subjects(subject_id UUID PRIMARY KEY, code TEXT, name TEXT);
  CREATE TABLE class_records(class_record_id UUID PRIMARY KEY, subject_id UUID, section_id UUID, faculty_id UUID, status TEXT DEFAULT 'active', prev_term BOOLEAN DEFAULT FALSE);
  CREATE TABLE enrollments(student_id UUID, subject_id UUID, section_id UUID, status TEXT DEFAULT 'active');
  CREATE TABLE posted_grades(posted_grade_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), class_record_id UUID, student_id UUID,
    grade_period TEXT, computed_grade NUMERIC, effective_grade NUMERIC, remarks TEXT, locked_milestones CHARACTER VARYING[] DEFAULT '{}',
    posted_by UUID, posted_at TIMESTAMPTZ DEFAULT now(), official_source TEXT DEFAULT 'faculty_post',
    UNIQUE (class_record_id, grade_period, student_id));
  CREATE TABLE notifications(notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), recipient_id UUID, type TEXT, title TEXT, link TEXT,
    severity TEXT DEFAULT 'info', message TEXT, payload JSONB NOT NULL DEFAULT '{}', dedupe_key TEXT, is_read BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT now());
  CREATE UNIQUE INDEX notifications_dedupe ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;
  CREATE TABLE deliveries(notification_id UUID, channel TEXT);
  CREATE FUNCTION fan_out() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN INSERT INTO deliveries VALUES (NEW.notification_id, 'email'); RETURN NEW; END $$;
  CREATE TRIGGER trg_fan_out_notification_deliveries AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fan_out();
  CREATE TABLE remark_override_requests(request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), posted_grade_id UUID, status TEXT);
  CREATE TABLE activity_logs(id SERIAL, msg TEXT);

  CREATE FUNCTION is_class_faculty(p UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (SELECT 1 FROM class_records c WHERE c.class_record_id = p AND c.faculty_id = auth.uid()) $$;
  CREATE FUNCTION is_authorized_dean_for_class(p UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (SELECT 1 FROM class_records c JOIN sections s ON s.section_id = c.section_id JOIN users u ON u.user_id = auth.uid()
                   WHERE c.class_record_id = p AND u.role = 'dean' AND u.department_id = s.department_id) $$;
  CREATE FUNCTION is_active_registrar() RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT EXISTS (SELECT 1 FROM users WHERE user_id = auth.uid() AND role = 'registrar') $$;
  CREATE FUNCTION is_active_admin() RETURNS BOOLEAN LANGUAGE sql STABLE AS $$ SELECT FALSE $$;
  CREATE FUNCTION class_sg_deadline_state(p UUID) RETURNS TEXT LANGUAGE sql STABLE AS $$
    SELECT CASE WHEN prev_term THEN 'pending' ELSE 'current' END FROM class_records WHERE class_record_id = p $$;
  CREATE FUNCTION audit_business_mutation() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN INSERT INTO activity_logs(msg) VALUES (TG_TABLE_NAME || ' ' || TG_OP); RETURN COALESCE(NEW, OLD); END $$;
  CREATE FUNCTION can_read_student_class_record(p UUID, s UUID) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT s = auth.uid() OR is_class_faculty(p) OR is_authorized_dean_for_class(p) OR is_active_registrar() $$;

  ALTER TABLE posted_grades ENABLE ROW LEVEL SECURITY;
  CREATE POLICY posted_grades_authorized_select ON posted_grades FOR SELECT TO authenticated USING (can_read_student_class_record(class_record_id, student_id));
  GRANT SELECT ON posted_grades, class_records, sections, users, subjects TO authenticated;

  -- A stand-in for the posting function: the real body's SG branch, reduced to
  -- what the patch touches. Existing SG rows are preserved unless allowed.
  CREATE FUNCTION post_grade_milestone_v2(p_class_record_id UUID, p_grade_period TEXT, p_rows JSONB) RETURNS INTEGER
  LANGUAGE plpgsql SECURITY DEFINER AS $fn$
  DECLARE v_item JSONB; v_is_insert BOOLEAN; v_count INTEGER := 0; v_student UUID;
  BEGIN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
      v_student := (v_item->>'student_id')::UUID;
      v_is_insert := NOT EXISTS (SELECT 1 FROM posted_grades WHERE class_record_id = p_class_record_id AND student_id = v_student AND grade_period = p_grade_period);
      IF p_grade_period = 'semestral_grade' AND NOT v_is_insert THEN
        CONTINUE;
      END IF;
      INSERT INTO posted_grades(class_record_id, student_id, grade_period, computed_grade, effective_grade, remarks, posted_by, official_source)
      VALUES (p_class_record_id, v_student, p_grade_period, (v_item->>'g')::NUMERIC, 2.00, v_item->>'remarks', auth.uid(), 'faculty_post')
      ON CONFLICT (class_record_id, grade_period, student_id) DO UPDATE SET computed_grade = EXCLUDED.computed_grade, remarks = EXCLUDED.remarks, posted_at = now();
      INSERT INTO notifications(recipient_id, type, title, link, message, payload, dedupe_key)
      VALUES (v_student, CASE WHEN v_is_insert THEN 'grade_posted' ELSE 'grade_changed' END, 'New Grade Posted', '/student/grades', 'posted',
              jsonb_build_object('class_record_id', p_class_record_id, 'grade_period', p_grade_period, 'remark', v_item->>'remarks'),
              format('%s:%s:%s:%s', CASE WHEN v_is_insert THEN 'p' ELSE 'c' END, p_class_record_id, v_student, now()))
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
      v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
  END $fn$;

  INSERT INTO departments VALUES ('${DEPT}', 'CCS'), ('${DEPT2}', 'CBA');
  INSERT INTO users(user_id, first_name, last_name, role, department_id) VALUES
    ('${U.dean}', 'Dee', 'Dean', 'dean', '${DEPT}'), ('${U.otherDean}', 'Oth', 'Dean', 'dean', '${DEPT2}'),
    ('${U.faculty}', 'Fa', 'Culty', 'faculty', '${DEPT}'), ('${U.registrar}', 'Reg', 'Istrar', 'registrar', NULL),
    ('${U.s1}', 'Ana', 'One', 'student', '${DEPT}'), ('${U.s2}', 'Ben', 'Two', 'student', '${DEPT}');
  INSERT INTO sections VALUES ('${SEC}', 'BSIT-1A', '${DEPT}');
  INSERT INTO subjects VALUES ('${SUB}', 'IT101', 'Intro');
  INSERT INTO class_records(class_record_id, subject_id, section_id, faculty_id, prev_term) VALUES
    ('${CLS}', '${SUB}', '${SEC}', '${U.faculty}', TRUE), ('${OLD}', '${SUB}', '${SEC}', '${U.faculty}', FALSE);
  INSERT INTO enrollments(student_id, subject_id, section_id) VALUES ('${U.s1}', '${SUB}', '${SEC}'), ('${U.s2}', '${SUB}', '${SEC}');
  -- An SG released before the workflow existed, stored with the legacy 'final' period.
  INSERT INTO posted_grades(class_record_id, student_id, grade_period, computed_grade, remarks, locked_milestones)
  VALUES ('${OLD}', '${U.s1}', 'final', 88, 'passed', ARRAY['Semestral Grade']);
`);

const migration = await fs.readFile(path.join(root, 'supabase/migrations/20261118153739_sg_approval_by_the_dean.sql'), 'utf8');
await db.exec(migration);
// Re-run: must be idempotent.
await db.exec(migration);
await db.exec(await fs.readFile(path.join(root,'supabase/migrations/20261118194508_an_approved_sg_reaches_every_student.sql'),'utf8'));
await db.exec('GRANT SELECT ON sg_approvals TO authenticated; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;');
const results = [];
const ok = (name) => results.push(`ok  ${name}`);

// 1. Backfill: the old SG is approved and still visible to its student.
await as(null);
assert.equal((await q(`SELECT status FROM sg_approvals WHERE class_record_id = $1`, [OLD]))[0]?.status, 'approved');
await as(U.s1);
assert.equal((await q(`SELECT 1 FROM posted_grades WHERE class_record_id = $1`, [OLD])).length, 1);
ok('existing SG recorded as approved and still visible to the student');

// 2. Faculty posts MR, then SG.
await as(U.faculty);
await q(`SELECT post_grade_milestone_v2($1, 'midterm_rating', $2)`, [CLS, JSON.stringify([{ student_id: U.s1, g: 80, remarks: 'passed' }, { student_id: U.s2, g: 70, remarks: 'failed' }])]);
await q(`SELECT post_grade_milestone_v2($1, 'semestral_grade', $2)`, [CLS, JSON.stringify([{ student_id: U.s1, g: 85, remarks: 'passed' }, { student_id: U.s2, g: 72, remarks: 'failed' }])]);
await as(null);
let appr = (await q(`SELECT * FROM sg_approvals WHERE class_record_id = $1`, [CLS]))[0];
assert.equal(appr.status, 'submitted');
assert.equal(appr.submission_count, 1);
ok('posting the SG opens a submitted approval');

const studentSgNotices = await q(`SELECT * FROM notifications WHERE payload->>'grade_period' = 'semestral_grade' AND payload->>'class_record_id' = $1`, [CLS]);
assert.equal(studentSgNotices.length, 0);
assert.equal((await q(`SELECT * FROM sg_held_notifications WHERE class_record_id = $1`, [CLS])).length, 2);
const mrNotices = await q(`SELECT * FROM notifications WHERE payload->>'grade_period' = 'midterm_rating'`);
assert.equal(mrNotices.length, 2);
ok('SG notices held (no email queued); MR notices sent as before');

const deanNotices = await q(`SELECT * FROM notifications WHERE type = 'grades_pending'`);
assert.deepEqual(deanNotices.map((n) => n.recipient_id), [U.dean]);
assert.equal(deanNotices[0].link, `/dean/sgapprovals/${CLS}`);
ok('only the owning college Dean is told, once, with the review link');

// 3. Students cannot see the pending SG; staff can.
await as(U.s1);
const s1Rows = await q(`SELECT grade_period FROM posted_grades WHERE class_record_id = $1 ORDER BY grade_period`, [CLS]);
assert.deepEqual(s1Rows.map((r) => r.grade_period), ['midterm_rating']);
assert.equal((await q(`SELECT state FROM get_sg_release_states(ARRAY[$1::uuid])`, [CLS]))[0].state, 'pending');
await as(U.registrar);
assert.equal((await q(`SELECT 1 FROM posted_grades WHERE class_record_id = $1`, [CLS])).length, 4);
await as(U.dean);
assert.equal((await q(`SELECT 1 FROM posted_grades WHERE class_record_id = $1 AND grade_period = 'semestral_grade'`, [CLS])).length, 2);
ok('student sees MR but not the pending SG; Registrar and Dean see it');

// 4. Corrections/overrides are refused while pending.
await as(null);
const sgRow = (await q(`SELECT posted_grade_id FROM posted_grades WHERE class_record_id = $1 AND grade_period = 'semestral_grade' LIMIT 1`, [CLS]))[0];
await assert.rejects(q(`INSERT INTO remark_override_requests(posted_grade_id, status) VALUES ($1, 'pending')`, [sgRow.posted_grade_id]), /waiting for the Dean/);
ok('SG correction / override refused while the SG is pending');

// 5. Archive waits for approval.
assert.equal((await q(`SELECT status FROM class_records WHERE class_record_id = $1`, [CLS]))[0].status, 'active');
ok('previous-term class is not archived while the SG is pending');

// 6. The wrong Dean, a faculty member, and a too-short reason are refused.
await as(U.otherDean);
await assert.rejects(q(`SELECT decide_sg_approval($1, 'approve')`, [CLS]), /Only the Dean/);
await as(U.faculty);
await assert.rejects(q(`SELECT decide_sg_approval($1, 'approve')`, [CLS]), /Only the Dean/);
await as(U.dean);
await assert.rejects(q(`SELECT decide_sg_approval($1, 'return', 'bad')`, [CLS]), /at least 10/);
ok('other college Dean, faculty, and short return reason all refused');

// 7. Return, then the faculty re-posts.
await q(`SELECT decide_sg_approval($1, 'return', 'Please review the INC remark for Ben Two.')`, [CLS]);
await as(null);
appr = (await q(`SELECT * FROM sg_approvals WHERE class_record_id = $1`, [CLS]))[0];
assert.equal(appr.status, 'returned');
assert.equal((await q(`SELECT * FROM sg_held_notifications WHERE class_record_id = $1`, [CLS])).length, 0);
const returned = await q(`SELECT * FROM notifications WHERE type = 'sg_returned'`);
assert.equal(returned.length, 1);
assert.equal(returned[0].recipient_id, U.faculty);
ok('return stores the reason, discards held notices, tells the faculty');

await as(U.faculty);
const reposted = (await q(`SELECT post_grade_milestone_v2($1, 'semestral_grade', $2) AS n`, [CLS, JSON.stringify([{ student_id: U.s1, g: 85, remarks: 'passed' }, { student_id: U.s2, g: 72, remarks: 'incomplete' }])]))[0].n;
assert.equal(reposted, 2, 'a returned SG must be re-postable');
await as(null);
appr = (await q(`SELECT * FROM sg_approvals WHERE class_record_id = $1`, [CLS]))[0];
assert.equal(appr.status, 'submitted');
assert.equal(appr.submission_count, 2);
assert.equal((await q(`SELECT remarks FROM posted_grades WHERE class_record_id = $1 AND student_id = $2 AND grade_period = 'semestral_grade'`, [CLS, U.s2]))[0].remarks, 'incomplete');
assert.equal((await q(`SELECT * FROM notifications WHERE type = 'grades_pending'`)).length, 2);
ok('re-posting a returned SG resubmits it (submission 2) and tells the Dean again');

// While submitted again, a further re-post is preserved (no change).
await as(U.faculty);
const blocked = (await q(`SELECT post_grade_milestone_v2($1, 'semestral_grade', $2) AS n`, [CLS, JSON.stringify([{ student_id: U.s1, g: 99, remarks: 'passed' }])]))[0].n;
assert.equal(blocked, 0);
ok('a submitted SG is not re-postable until the Dean returns it');

// 8. Approve: notices released once per student, emails queued, archive, registrar told.
await as(U.dean);
await q(`SELECT decide_sg_approval($1, 'approve')`, [CLS]);
await as(null);
const released = await q(`SELECT * FROM notifications WHERE type = 'grade_posted' AND payload->>'grade_period' = 'semestral_grade' AND payload->>'class_record_id' = $1`, [CLS]);
assert.equal(released.length, 2);
assert.ok(released.find((n) => n.recipient_id === U.s2).payload.remark === 'incomplete', 'released notice carries the latest submission');
const deliveries = await q(`SELECT d.* FROM deliveries d JOIN notifications n USING (notification_id) WHERE n.type = 'grade_posted' AND n.payload->>'grade_period' = 'semestral_grade' AND n.payload->>'class_record_id' = $1`, [CLS]);
assert.equal(deliveries.length, 2);
ok('approval releases one notice per student (latest), and their emails are queued');
assert.equal((await q(`SELECT status FROM class_records WHERE class_record_id = $1`, [CLS]))[0].status, 'archived');
ok('previous-term class archived on approval');
const approvedNotices = await q(`SELECT recipient_id FROM notifications WHERE type = 'sg_approved' ORDER BY recipient_id`);
assert.deepEqual(approvedNotices.map((n) => n.recipient_id).sort(), [U.registrar, U.faculty].sort());
ok('faculty and Registrar told of the approval');

await as(U.s2);
assert.equal((await q(`SELECT 1 FROM posted_grades WHERE class_record_id = $1 AND grade_period = 'semestral_grade'`, [CLS])).length, 1);
ok('student sees the SG after approval');

await as(U.dean);
await assert.rejects(q(`SELECT decide_sg_approval($1, 'return', 'Changed my mind about this one.')`, [CLS]), /not waiting/);
ok('an approved SG cannot be returned');

await as(null);
await q(`INSERT INTO remark_override_requests(posted_grade_id, status) VALUES ($1, 'pending')`, [sgRow.posted_grade_id]);
ok('corrections allowed once approved');

// 9. Direct writes to the approval table are refused.
await as(U.faculty);
await assert.rejects(q(`UPDATE sg_approvals SET status = 'approved' WHERE class_record_id = $1`, [CLS]));
ok('clients cannot write sg_approvals directly');

// 10. Legacy-period classification mirrors gradeMilestones.js.
await as(null);
const cls = await q(`SELECT aspire_is_sg_row('final', ARRAY['Tentative Final Rating']) a, aspire_is_sg_row('final', '{}'::TEXT[]) b,
  aspire_is_sg_row('final', ARRAY['Tentative Final Rating','Semestral Grade']) c, aspire_is_sg_row('sg', NULL) d, aspire_is_sg_row('midterm_rating', NULL) e`);
assert.deepEqual(cls[0], { a: false, b: true, c: true, d: true, e: false });
ok('legacy final/sg rows classified the same way as the app');

console.log(results.join('\n'));
console.log(`\nAll ${results.length} checks passed.`);
