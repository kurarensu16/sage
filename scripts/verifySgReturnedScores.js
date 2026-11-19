// A returned SG reopens its scores for the instructor only; MR and TFR follow the corrected scores on approval; every student is notified.
// Runs the real migration file(s) 20261118153739, 20261118192713 and 20261118194508 against PGlite with stand-in tables and
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
await db.exec('GRANT SELECT ON sg_approvals TO authenticated; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;');
const results = [];
const ok = (name) => results.push(`ok  ${name}`);

// Extra stubs for 20261118192713: score table with the guard triggers,
// a calculator that reads those scores, the revision guard on posted_grades.
await as(null);
await db.exec(`
  CREATE TYPE grade_remarks AS ENUM ('passed','failed','inc','dropped','fda');
  ALTER TABLE posted_grades ADD COLUMN calculation_engine_version TEXT, ADD COLUMN input_snapshot_hash TEXT;
  CREATE TABLE student_term_scores(class_record_id UUID, student_id UUID, term TEXT, exam NUMERIC, UNIQUE(class_record_id, student_id, term));
  CREATE TABLE windows(class_record_id UUID, term TEXT);
  CREATE FUNCTION aspire_frozen_terms(p UUID) RETURNS TEXT[] LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT COALESCE(array_agg(term), '{}') FROM windows WHERE class_record_id = p $$;
  CREATE FUNCTION aspire_transmute_grade(p NUMERIC) RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE WHEN p >= 75 THEN 3.00 ELSE 5.00 END $$;
  CREATE FUNCTION aspire_calculate_student_grade(c UUID, s UUID) RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER AS $$
    SELECT jsonb_build_object('ok', TRUE,
      'mr', ROUND((SUM(exam) FILTER (WHERE term IN ('Prelim','Midterm')))/2),
      'tfr', ROUND((SUM(exam) FILTER (WHERE term IN ('Semi-Final','Final')))/2),
      'input_snapshot_hash', md5(string_agg(term || exam, ',' ORDER BY term)))
    FROM student_term_scores WHERE class_record_id = c AND student_id = s $$;
  CREATE FUNCTION aspire_assert_grade_basis_mutable(p_class_record_id UUID, p_student_id UUID, p_term TEXT DEFAULT NULL)
    RETURNS VOID LANGUAGE plpgsql AS $$ BEGIN END $$;
  CREATE FUNCTION protect_scores() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
    BEGIN PERFORM aspire_assert_grade_basis_mutable(NEW.class_record_id, NEW.student_id, NEW.term); RETURN NEW; END $$;
  CREATE TRIGGER trg_protect_locked_sg_term_scores BEFORE INSERT OR UPDATE ON student_term_scores FOR EACH ROW EXECUTE FUNCTION protect_scores();
  CREATE FUNCTION aspire_block_frozen_term_scores() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
  CREATE TRIGGER trg_block_frozen_term_scores BEFORE INSERT OR UPDATE ON student_term_scores FOR EACH ROW EXECUTE FUNCTION aspire_block_frozen_term_scores();
  CREATE FUNCTION advance_rev() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
    IF OLD.computed_grade IS DISTINCT FROM NEW.computed_grade
       AND COALESCE(current_setting('aspire.grade_posting_context', TRUE), '') NOT IN ('posting','correction','admin_override') THEN
      RAISE EXCEPTION 'Official grade values are managed only by secured posting or override operations.';
    END IF; RETURN NEW; END $$;
  ALTER TABLE student_term_scores ENABLE ROW LEVEL SECURITY;
  CREATE POLICY f ON student_term_scores FOR ALL TO authenticated USING (is_class_faculty(class_record_id)) WITH CHECK (is_class_faculty(class_record_id));
  GRANT SELECT, INSERT, UPDATE ON student_term_scores TO authenticated;
`);
await db.exec(`INSERT INTO student_term_scores VALUES
  ('${CLS}','${U.s1}','Prelim',80),('${CLS}','${U.s1}','Midterm',80),('${CLS}','${U.s1}','Semi-Final',90),('${CLS}','${U.s1}','Final',90),
  ('${CLS}','${U.s2}','Prelim',70),('${CLS}','${U.s2}','Midterm',70),('${CLS}','${U.s2}','Semi-Final',72),('${CLS}','${U.s2}','Final',72);
  INSERT INTO windows VALUES ('${CLS}','Prelim'),('${CLS}','Midterm'),('${CLS}','Semi-Final'),('${CLS}','Final');`);

const mig = await fs.readFile(path.join(root, 'supabase/migrations/20261118192713_a_returned_sg_reopens_its_scores.sql'), 'utf8');
const mig8 = await fs.readFile(path.join(root, 'supabase/migrations/20261118194508_an_approved_sg_reaches_every_student.sql'), 'utf8');
if (process.env.ORDER === '87') {
  await db.exec(mig8); await db.exec(mig); await db.exec(mig);
} else {
  await db.exec(mig); await db.exec(mig); await db.exec(mig8); await db.exec(mig8);
}
await db.exec('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;');
ok(`migrations apply (order ${process.env.ORDER || '78'}, re-run safe) and pass their own verification`);

// Faculty posts MR and TFR (the stub poster has no revision guard context, so
// the guard goes on only after these first posts), then the SG.
await as(U.faculty);
await q(`SELECT post_grade_milestone_v2($1, 'midterm_rating', $2)`, [CLS, JSON.stringify([{ student_id: U.s1, g: 80, remarks: 'passed' }, { student_id: U.s2, g: 70, remarks: 'failed' }])]);
await q(`SELECT post_grade_milestone_v2($1, 'tentative_final_rating', $2)`, [CLS, JSON.stringify([{ student_id: U.s1, g: 90, remarks: 'passed' }, { student_id: U.s2, g: 72, remarks: 'failed' }])]);
await q(`SELECT post_grade_milestone_v2($1, 'semestral_grade', $2)`, [CLS, JSON.stringify([{ student_id: U.s1, g: 85, remarks: 'passed' }, { student_id: U.s2, g: 71, remarks: 'failed' }])]);

await as(U.faculty);
await assert.rejects(q(`UPDATE student_term_scores SET exam = 60 WHERE class_record_id = $1 AND student_id = $2 AND term = 'Prelim'`, [CLS, U.s1]), /SG basis is locked|are final and can no longer be edited/);
ok('while submitted, a score edit is refused');

// Frozen-term guard alone (no SG lock involved): a student without an SG row.
await as(null);
await db.exec(`INSERT INTO users(user_id, role, department_id) VALUES ('00000000-0000-0000-0000-000000000053','student','${DEPT}')`);
await as(U.faculty);
await assert.rejects(q(`INSERT INTO student_term_scores VALUES ($1, '00000000-0000-0000-0000-000000000053', 'Prelim', 50)`, [CLS]), /are final and can no longer be edited/);
ok('while submitted, the finalized-term freeze still refuses');

await as(U.dean);
await q(`SELECT decide_sg_approval($1, 'return', 'Prelim exam of Ana One is mistyped.')`, [CLS]);

await as(U.faculty);
await q(`UPDATE student_term_scores SET exam = 60 WHERE class_record_id = $1 AND student_id = $2 AND term = 'Prelim'`, [CLS, U.s1]);
await as(null);
assert.equal(Number((await q(`SELECT exam FROM student_term_scores WHERE class_record_id = $1 AND student_id = $2 AND term = 'Prelim'`, [CLS, U.s1]))[0].exam), 60);
ok('while returned, the instructor can edit a score, even one behind a finalized MR');

await db.exec(`INSERT INTO users(user_id, role, department_id) VALUES ('00000000-0000-0000-0000-0000000000f9','faculty','${DEPT}')`);
await as('00000000-0000-0000-0000-0000000000f9');
assert.equal((await q(`UPDATE student_term_scores SET exam = 1 WHERE class_record_id = $1 RETURNING 1`, [CLS])).length, 0);
ok('another instructor still cannot write the scores');

await as(null);
assert.equal(Number((await q(`SELECT computed_grade FROM posted_grades WHERE class_record_id = $1 AND student_id = $2 AND grade_period = 'midterm_rating'`, [CLS, U.s1]))[0].computed_grade), 80);
ok('MR stays as the student last saw it until the Dean approves');

// From here the revision guard is on: only a posting context may change values.
await db.exec(`CREATE TRIGGER trg_advance_rev BEFORE UPDATE ON posted_grades FOR EACH ROW EXECUTE FUNCTION advance_rev();`);
await db.exec(`CREATE OR REPLACE FUNCTION post_grade_milestone_v2(p_class_record_id UUID, p_grade_period TEXT, p_rows JSONB) RETURNS INTEGER
  LANGUAGE plpgsql SECURITY DEFINER AS $fn$
  DECLARE v_item JSONB; v_count INTEGER := 0;
  BEGIN
    PERFORM set_config('aspire.grade_posting_context', 'posting', TRUE);
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
      INSERT INTO posted_grades(class_record_id, student_id, grade_period, computed_grade, remarks, posted_by, official_source)
      VALUES (p_class_record_id, (v_item->>'student_id')::UUID, p_grade_period, (v_item->>'g')::NUMERIC, v_item->>'remarks', auth.uid(), 'faculty_post')
      ON CONFLICT (class_record_id, grade_period, student_id) DO UPDATE SET computed_grade = EXCLUDED.computed_grade, posted_at = now();
      v_count := v_count + 1;
    END LOOP;
    PERFORM set_config('aspire.grade_posting_context', '', TRUE);
    RETURN v_count;
  END $fn$;`);

await as(U.faculty);
await q(`SELECT post_grade_milestone_v2($1, 'semestral_grade', $2)`, [CLS, JSON.stringify([{ student_id: U.s1, g: 80, remarks: 'passed' }, { student_id: U.s2, g: 71, remarks: 'failed' }])]);
await as(null);
const appr = (await q(`SELECT * FROM sg_approvals WHERE class_record_id = $1`, [CLS]))[0];
assert.equal(appr.status, 'submitted'); assert.equal(appr.submission_count, 2);
ok('resubmission goes back to the Dean (submission 2)');

await as(U.faculty);
await assert.rejects(q(`UPDATE student_term_scores SET exam = 61 WHERE class_record_id = $1 AND student_id = $2 AND term = 'Prelim'`, [CLS, U.s1]), /SG basis is locked|are final and can no longer be edited/);
ok('after resubmitting, scores lock again');

await as(U.dean);
await q(`SELECT decide_sg_approval($1, 'approve')`, [CLS]);
await as(null);
const rows = await q(`SELECT student_id, grade_period, computed_grade, remarks FROM posted_grades WHERE class_record_id = $1 AND grade_period IN ('midterm_rating','tentative_final_rating')`, [CLS]);
const g = Object.fromEntries(rows.map(x => [`${x.student_id === U.s1 ? 's1' : 's2'}:${x.grade_period}`, x]));
assert.equal(Number(g['s1:midterm_rating'].computed_grade), 70);
assert.equal(g['s1:midterm_rating'].remarks, 'failed');
assert.equal(Number(g['s1:tentative_final_rating'].computed_grade), 90);
assert.equal(Number(g['s2:midterm_rating'].computed_grade), 70);
const notes = await q(`SELECT recipient_id, payload FROM notifications WHERE dedupe_key LIKE 'sg_resync:%'`);
assert.equal(notes.length, 1); assert.equal(notes[0].recipient_id, U.s1);
assert.equal(notes[0].payload.grade_period, 'midterm_rating');
assert.equal(notes[0].payload.subject_code, 'IT101'); assert.equal(notes[0].payload.term, 'Midterm');
assert.equal(notes[0].payload.student_name, 'One, Ana');

// THE QA BUG: s2's SG did not change on the resubmission, and returning deleted
// the held notices. Both students must still be told, with emails queued.
const rel = await q(`SELECT recipient_id, type, payload FROM notifications WHERE dedupe_key LIKE 'sg_released:%' ORDER BY recipient_id`);
assert.deepEqual(rel.map(r => r.recipient_id), [U.s1, U.s2]);
assert.ok(rel.every(r => r.type === 'grade_posted' && r.payload.grade_period === 'semestral_grade' && r.payload.term === 'Semestral Grade' && r.payload.subject_name === 'Intro'));
assert.equal(Number(rel[0].payload.rating), 80);
assert.equal((await q(`SELECT 1 FROM deliveries d JOIN notifications n USING (notification_id) WHERE n.dedupe_key LIKE 'sg_released:%'`)).length, 2);
assert.equal((await q(`SELECT 1 FROM sg_held_notifications WHERE class_record_id = $1 AND released_at IS NULL`, [CLS])).length, 0);
ok('after return -> resubmit -> approve, EVERY student gets "Official Grade Posted" (in-app + email queued), unchanged ones included');

// Re-running #8 (backfill) sends nothing twice.
await db.exec(mig8);
assert.equal((await q(`SELECT 1 FROM notifications WHERE dedupe_key LIKE 'sg_released:%'`)).length, 2);
ok('re-running the backfill sends no duplicates');
assert.equal((await q(`SELECT 1 FROM deliveries d JOIN notifications n USING (notification_id) WHERE n.dedupe_key LIKE 'sg_resync:%'`)).length, 1);
ok('on approval, only the changed MR is brought in line (80 -> 70), and that student is notified with email queued');
assert.equal((await q(`SELECT COALESCE(current_setting('aspire.grade_posting_context', TRUE), '') AS c`))[0].c, '');
ok('posting context restored after the sync');

await as(U.faculty);
await assert.rejects(q(`UPDATE student_term_scores SET exam = 61 WHERE class_record_id = $1 AND student_id = $2 AND term = 'Prelim'`, [CLS, U.s1]), /SG basis is locked|are final and can no longer be edited/);
ok('after approval, scores are locked again (existing correction flow applies)');

console.log(results.join('\n'));
console.log(`\nAll ${results.length} checks passed.`);
