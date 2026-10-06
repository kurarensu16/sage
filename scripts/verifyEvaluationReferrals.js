// Isolated PostgreSQL checks. Optional dependency lives in ignored scratch/,
// never in the application dependencies. No remote database is accessed.
// npm install --prefix scratch/referral-validation --no-save --package-lock=false @electric-sql/pglite
// node scripts/verifyEvaluationReferrals.js
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { PGlite } from '../scratch/referral-validation/node_modules/@electric-sql/pglite/dist/index.js';

const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const faculty = id(1), student = id(2), dean = id(3), stranger = id(4), otherDean = id(5), admin = id(6), secondDean = id(7);
const department = id(20), section = id(21), classId = id(22), subject = id(23), evaluation = id(30), draft = id(31), legacy = id(32);
let checks = 0;
async function actor(who) { await db.exec('RESET ROLE;'); await db.query("SELECT set_config('test.uid', $1, false)", [who]); await db.exec('SET ROLE authenticated;'); }
async function owner(sql, args = []) {
  await db.exec('RESET ROLE;');
  return !args.length && sql.includes(';') ? db.exec(sql) : db.query(sql, args);
}
async function reject(sql, args, pattern) { await assert.rejects(db.query(sql, args), pattern); checks++; }
async function refer(caseId, request, reason = 'Restricted referral reason') {
  const result = await db.query('SELECT public.refer_student_evaluation_to_dean($1,$2,$3) AS result', [caseId, reason, request]);
  return result.rows[0].result;
}
const task = [{ task_id: 't1', description: 'Meet faculty', completed: true, completed_at: '2026-10-01T00:00:00Z' }];
try {
  // Minimal prerequisite schema, with the actual privacy/grant migrations and
  // actual new RPC definitions applied below. Fixture rows are synthetic only.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE SQL STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::UUID $$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated; GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
    CREATE TABLE users(user_id UUID PRIMARY KEY,role TEXT,status TEXT DEFAULT 'active',department_id UUID,email TEXT);
    CREATE TABLE sections(section_id UUID PRIMARY KEY,department_id UUID);
    CREATE TABLE class_records(class_record_id UUID PRIMARY KEY,faculty_id UUID REFERENCES users,section_id UUID REFERENCES sections,subject_id UUID,status TEXT DEFAULT 'active');
    CREATE TABLE enrollments(student_id UUID,section_id UUID,subject_id UUID);
    CREATE TABLE student_risk_evaluations(
      evaluation_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), class_record_id UUID NOT NULL REFERENCES class_records,
      student_id UUID NOT NULL REFERENCES users,faculty_id UUID NOT NULL REFERENCES users,term TEXT NOT NULL,
      evaluation_context TEXT,risk_level TEXT,risk_score NUMERIC,risk_breakdown JSONB,
      professor_notes TEXT NOT NULL,advising_plan JSONB DEFAULT '[]',baseline_snapshot JSONB DEFAULT '{}',
      refer_to_dean BOOLEAN DEFAULT FALSE,requires_tutoring BOOLEAN DEFAULT FALSE,status TEXT DEFAULT 'submitted',
      created_at TIMESTAMPTZ DEFAULT NOW(),updated_at TIMESTAMPTZ DEFAULT NOW(),UNIQUE(class_record_id,student_id,term));
    CREATE TABLE notifications(notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),recipient_id UUID REFERENCES users,
      type TEXT,title TEXT,message TEXT,link TEXT,severity TEXT,payload JSONB,dedupe_key TEXT UNIQUE,is_read BOOLEAN);
    CREATE TABLE notification_preferences(user_id UUID,notification_type TEXT,email BOOLEAN,PRIMARY KEY(user_id,notification_type));
    CREATE TABLE notification_deliveries(delivery_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),notification_id UUID REFERENCES notifications,
      channel TEXT,recipient_id UUID,target_address TEXT,status TEXT);
    CREATE FUNCTION fixture_in_app() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO notification_deliveries(notification_id,channel,recipient_id,status) VALUES(NEW.notification_id,'in_app',NEW.recipient_id,'sent'); RETURN NEW; END; $$;
    CREATE TRIGGER fixture_delivery AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION fixture_in_app();
    GRANT SELECT ON users,sections,class_records,enrollments TO authenticated;
  `);
  await db.query('INSERT INTO users(user_id,role,department_id,email) VALUES ($1,\'faculty\',$8,\'faculty@test.invalid\'),($2,\'student\',$8,\'student@test.invalid\'),($3,\'dean\',$8,\'dean@test.invalid\'),($4,\'faculty\',$8,\'other@test.invalid\'),($5,\'dean\',$9,\'otherdean@test.invalid\'),($6,\'admin\',$8,\'admin@test.invalid\'),($7,\'dean\',$8,\'dean2@test.invalid\')', [faculty,student,dean,stranger,otherDean,admin,secondDean,department,id(24)]);
  await db.query('INSERT INTO sections VALUES($1,$2)', [section,department]);
  await db.query('INSERT INTO class_records VALUES($1,$2,$3,$4,\'active\')', [classId,faculty,section,subject]);
  await db.query('INSERT INTO enrollments VALUES($1,$2,$3)', [student,section,subject]);
  // Referral routing follows the class department even when the student's home
  // department differs (irregular/cross-department enrollment).
  await db.query('UPDATE users SET department_id=$1 WHERE user_id=$2', [id(24),student]);
  for (const [caseId, term, status, pending] of [[evaluation,'Prelim','acknowledged_by_student',false],[draft,'Midterm','draft',false],[legacy,'Final','submitted',true]]) {
    await db.query(`INSERT INTO student_risk_evaluations(evaluation_id,class_record_id,student_id,faculty_id,term,evaluation_context,
      risk_level,risk_score,risk_breakdown,professor_notes,advising_plan,baseline_snapshot,status,refer_to_dean)
      VALUES($1,$2,$3,$4,$5,'passing_recovery','high',60,'{}','Private note',$6,'{"gwa":4}',$7,$8)`, [caseId,classId,student,faculty,term,JSON.stringify(task),status,pending]);
  }
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20260926120000_secure_student_risk_notes.sql', import.meta.url), 'utf8'));
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20260926123000_harden_risk_evaluation_grants.sql', import.meta.url), 'utf8'));
  await db.exec(await fs.readFile(new URL('../supabase/migrations/20261006120000_faculty_evaluation_referrals.sql', import.meta.url), 'utf8'));
  checks++;
  assert.equal((await owner('SELECT count(*)::int AS n FROM student_evaluation_referrals WHERE legacy')).rows[0].n, 1);
  assert.equal((await owner('SELECT count(*)::int AS n FROM notifications')).rows[0].n, 0); checks += 2;
  const before = (await owner('SELECT * FROM student_risk_evaluations WHERE evaluation_id=$1', [evaluation])).rows[0];
  await actor(stranger); await reject('SELECT refer_student_evaluation_to_dean($1,$2,$3)', [evaluation,'reason',id(100)], /assigned faculty/);
  await actor(faculty); await reject('SELECT refer_student_evaluation_to_dean($1,$2,$3)', [draft,'reason',id(101)], /published evaluation/);
  await reject('UPDATE student_risk_evaluations SET refer_to_dean=true WHERE evaluation_id=$1', [evaluation], /permission denied/);
  await reject('SELECT refer_student_evaluation_to_dean($1,$2,$3)', [evaluation,' ',id(102)], /reason/);
  await owner("UPDATE users SET status='inactive' WHERE role='dean'"); await actor(faculty);
  await reject('SELECT refer_student_evaluation_to_dean($1,$2,$3)', [evaluation,'reason',id(103)], /No active Dean/);
  assert.equal((await owner('SELECT count(*)::int AS n FROM student_evaluation_referrals')).rows[0].n, 1); checks++;
  await owner("UPDATE users SET status='active' WHERE role='dean'"); await actor(faculty);
  const first = await refer(evaluation,id(104));
  const again = await refer(evaluation,id(104));
  const pendingRetry = await refer(evaluation,id(105));
  assert.equal(first.referral.referral_id, again.referral.referral_id);
  assert.equal(first.referral.referral_id, pendingRetry.referral.referral_id);
  assert.equal(first.notification_ids.length, 2); checks += 3;
  const after = (await owner('SELECT * FROM student_risk_evaluations WHERE evaluation_id=$1', [evaluation])).rows[0];
  for (const field of ['advising_plan','baseline_snapshot','risk_score','risk_level','risk_breakdown','shared_academic_feedback','status','published_to_student_at']) assert.deepEqual(after[field],before[field]); checks++;
  const notices = (await owner('SELECT * FROM notifications')).rows;
  assert.deepEqual(notices.map(row => row.recipient_id).sort(), [dean,secondDean].sort()); checks++;
  assert.ok(notices.every(row => !JSON.stringify(row).includes('Restricted referral reason') && !JSON.stringify(row).includes('Private note')));
  assert.equal((await owner("SELECT count(*)::int AS n FROM notification_deliveries WHERE channel='email'")).rows[0].n, 2); checks += 2;
  await actor(student);
  assert.equal((await db.query('SELECT * FROM student_evaluation_referrals')).rows.length, 0);
  assert.equal((await db.query('SELECT * FROM student_risk_private_notes')).rows.length, 0); checks += 2;
  await reject('SELECT refer_student_evaluation_to_dean($1,$2,$3)', [evaluation,'reason',id(106)], /assigned faculty/);
  await reject('INSERT INTO student_evaluation_referrals(evaluation_id,legacy) VALUES($1,true)', [evaluation], /permission denied/);
  await reject('SELECT * FROM student_evaluation_referral_requests', [], /permission denied/);
  await actor(otherDean); assert.equal((await db.query('SELECT * FROM student_evaluation_referrals')).rows.length, 0); checks++;
  await reject('SELECT review_student_risk_evaluation($1,false,false,\'submitted\',\'note\')', [evaluation], /Not authorized/);
  await actor(dean);
  assert.equal((await db.query('SELECT * FROM student_evaluation_referrals')).rows.length, 2); checks++;
  await db.query('SELECT review_student_risk_evaluation($1,false,false,\'submitted\',\'Resolved privately\')', [evaluation]);
  assert.equal((await db.query('SELECT status FROM student_risk_evaluations WHERE evaluation_id=$1', [evaluation])).rows[0].status, 'acknowledged_by_student'); checks++;
  await actor(faculty);
  assert.equal((await refer(evaluation,id(104))).referral.state,'resolved');
  assert.equal((await refer(evaluation,id(105))).referral.state,'resolved'); checks += 2;
  await owner("INSERT INTO notification_preferences VALUES($1,'dean_referral',false)", [secondDean]); await actor(faculty);
  const fresh = await refer(evaluation,id(107)); assert.notEqual(fresh.referral.referral_id,first.referral.referral_id); checks++;
  assert.equal((await owner("SELECT count(*)::int AS n FROM notification_deliveries WHERE channel='email'")).rows[0].n,3); checks++;
  await actor(faculty);
  await owner('UPDATE class_records SET faculty_id=$1 WHERE class_record_id=$2', [stranger,classId]); await actor(faculty);
  assert.equal((await db.query('SELECT * FROM student_evaluation_referrals')).rows.length, 3); checks++;
  await reject('SELECT refer_student_evaluation_to_dean($1,$2,$3)', [evaluation,'reason',id(108)], /assigned faculty/);
  await owner('UPDATE class_records SET faculty_id=$1,status=\'archived\' WHERE class_record_id=$2', [faculty,classId]); await actor(faculty);
  await reject('SELECT refer_student_evaluation_to_dean($1,$2,$3)', [evaluation,'reason',id(109)], /active class/);
  await owner("UPDATE class_records SET status='active'"); await actor(faculty);
  await reject('SELECT refer_student_evaluation_to_dean($1,$2,$3)', [legacy,'reason',id(104)], /different evaluation/);
  const savedLegacy = await refer(legacy,id(110)); assert.equal(savedLegacy.referral.legacy,true); checks++;

  // Ordinary editing cannot clear pending referral or overwrite student reports.
  const saveSql = `SELECT to_jsonb(submit_student_risk_evaluation($1,$2,$3,'passing_recovery','high',60,'{}',
    'Updated guidance','Updated private note',$4,'{"gwa":4}',$5,'submitted',$6,$7)) AS result`;
  await db.query(saveSql,[classId,student,'Prelim',JSON.stringify([{...task[0],completed:false,completed_at:null}]),false,null,null]);
  let edited = (await db.query('SELECT advising_plan,refer_to_dean,status FROM student_risk_evaluations WHERE evaluation_id=$1',[evaluation])).rows[0];
  assert.equal(edited.advising_plan[0].completed,true); assert.equal(edited.refer_to_dean,true); assert.equal(edited.status,'acknowledged_by_student'); checks += 3;
  // Student writes use the same evaluation row lock and remain preserved on saves.
  await actor(student); await db.query('SELECT set_legacy_advising_task_completion($1,\'t1\',false)',[evaluation]);
  await actor(faculty); await db.query(saveSql,[classId,student,'Prelim',JSON.stringify(task),false,null,null]);
  edited = (await db.query('SELECT advising_plan FROM student_risk_evaluations WHERE evaluation_id=$1',[evaluation])).rows[0];
  assert.equal(edited.advising_plan[0].completed,false); checks++;
  // Failed notification persistence rolls back the event and evaluation flag.
  await owner(`CREATE FUNCTION reject_referral_notice() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic delivery failure'; END; $$;
    CREATE TRIGGER fail_notice BEFORE INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION reject_referral_notice();`);
  await actor(faculty);
  await reject(saveSql,[classId,student,'Semi-Final',JSON.stringify(task),true,'creation reason',id(111)],/Synthetic delivery failure/);
  assert.equal((await owner("SELECT count(*)::int AS n FROM student_risk_evaluations WHERE term='Semi-Final'")).rows[0].n,0); checks++;
  await owner('DROP TRIGGER fail_notice ON notifications'); await actor(faculty);
  const created = (await db.query(saveSql,[classId,student,'Semi-Final',JSON.stringify(task),true,'creation reason',id(111)])).rows[0].result;
  assert.equal(created.refer_to_dean,true); checks++;
  await actor(admin); assert.ok((await db.query('SELECT * FROM student_evaluation_referrals')).rows.length > 0); checks++;
  console.log(`Referral PostgreSQL checks passed (${checks} groups): migration, RLS/grants, legacy, authorization, deduplication, retry after resolution, referral/task/status preservation, creation-time atomicity, and notification failure rollback.`);
} catch (error) {
  console.error(`Referral validation failed: ${error.message}${error.where ? ` (${error.where})` : ''}`);
  process.exitCode = 1;
} finally { await db.close(); }
