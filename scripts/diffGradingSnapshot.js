// =============================================================================
// Grading/Risk Before-After Diff Tool (IMPLEMENTATION_CORRECTIONS.md item (l))
// =============================================================================
// Reusable safety net for any change to gradingMath.js / academicPolicy.js /
// riskEngine.js. Snapshot a representative class's roster BEFORE your change,
// make the change, snapshot again AFTER, then diff the two files.
//
// Reads only OFFICIALLY POSTED grades (posted_grades) — never recomputes a
// tentative/draft grade from live activity scores — so the snapshot is stable
// between runs as long as nobody posts a new grade in between. That means any
// difference the diff finds is attributable to your code change, not to new
// data arriving. Every changed value must map to a specific rule fix you can
// name; anything you can't attribute is a regression.
//
// Usage:
//   node scripts/diffGradingSnapshot.js snapshot <classRecordId> <outFile.json>
//   node scripts/diffGradingSnapshot.js diff <beforeFile.json> <afterFile.json>
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

import { resolveOfficialGwa, getHonorTier, countAttendance } from '../src/lib/academicPolicy.js';
import { calculateAcademicRisk } from '../src/lib/riskEngine.js';
import { findMostAdvancedPostedGrade, GRADE_MILESTONES, getCanonicalGradePeriod } from '../src/lib/gradeMilestones.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadSupabaseEnv() {
  const envPath = resolve(__dirname, '..', 'supabase', '.env');
  const envFile = fs.readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      if (key) process.env[key] = val;
    }
  });
}

function getSupabaseClient() {
  loadSupabaseEnv();
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SERVICE_ROLE_KEY in supabase/.env');
    process.exit(1);
  }
  return createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

const TERM_PERIODS = {
  prelim: 'prelim',
  midterm: 'midterm',
  midtermRating: GRADE_MILESTONES.MIDTERM_RATING,
  semiFinal: 'semi_final',
  final: 'final',
  tentativeFinalRating: GRADE_MILESTONES.TENTATIVE_FINAL_RATING,
  semestralGrade: GRADE_MILESTONES.SEMESTRAL_GRADE
};

function findRowForPeriod(rows, periodKey) {
  if (periodKey === GRADE_MILESTONES.MIDTERM_RATING) {
    return rows.find(r => getCanonicalGradePeriod(r) === GRADE_MILESTONES.MIDTERM_RATING) || null;
  }
  if (periodKey === GRADE_MILESTONES.TENTATIVE_FINAL_RATING) {
    return rows.find(r => getCanonicalGradePeriod(r) === GRADE_MILESTONES.TENTATIVE_FINAL_RATING) || null;
  }
  if (periodKey === GRADE_MILESTONES.SEMESTRAL_GRADE) {
    return rows.find(r => getCanonicalGradePeriod(r) === GRADE_MILESTONES.SEMESTRAL_GRADE) || null;
  }
  return rows.find(r => r.grade_period === periodKey) || null;
}

function summarizeRow(row) {
  if (!row) return { posted: false, rating: null, gwa: null, remarks: null };
  const resolved = resolveOfficialGwa(row);
  return { posted: true, rating: resolved.rating, gwa: resolved.gwa, remarks: row.remarks || null };
}

async function snapshotClass(classRecordId) {
  const supabase = getSupabaseClient();

  const { data: classRecord, error: crError } = await supabase
    .from('class_records')
    .select('class_record_id, section_id, subject_id, subjects:subject_id (code, name)')
    .eq('class_record_id', classRecordId)
    .maybeSingle();
  if (crError) throw crError;
  if (!classRecord) {
    console.error(`No class_record found for id ${classRecordId}`);
    process.exit(1);
  }

  const { data: enrollments, error: enrollError } = await supabase
    .from('enrollments')
    .select('student_id, users:student_id (user_id, first_name, last_name, user_number)')
    .eq('section_id', classRecord.section_id)
    .eq('subject_id', classRecord.subject_id)
    .eq('status', 'active');
  if (enrollError) throw enrollError;

  const { data: postedGrades, error: postedError } = await supabase
    .from('posted_grades')
    .select('student_id, grade_period, computed_grade, effective_grade, remarks, locked_milestones')
    .eq('class_record_id', classRecordId);
  if (postedError) throw postedError;

  const { data: attendanceRows, error: attendanceError } = await supabase
    .from('attendance_records')
    .select('student_id, status')
    .eq('class_record_id', classRecordId);
  if (attendanceError) throw attendanceError;

  const postedByStudent = new Map();
  (postedGrades || []).forEach(row => {
    if (!postedByStudent.has(row.student_id)) postedByStudent.set(row.student_id, []);
    postedByStudent.get(row.student_id).push(row);
  });
  const attendanceByStudent = new Map();
  (attendanceRows || []).forEach(row => {
    if (!attendanceByStudent.has(row.student_id)) attendanceByStudent.set(row.student_id, []);
    attendanceByStudent.get(row.student_id).push(row);
  });

  const students = (enrollments || []).map(enr => {
    const rows = postedByStudent.get(enr.student_id) || [];
    const terms = {};
    Object.entries(TERM_PERIODS).forEach(([key, periodKey]) => {
      terms[key] = summarizeRow(findRowForPeriod(rows, periodKey));
    });

    const absenceCount = countAttendance(attendanceByStudent.get(enr.student_id) || []).absences;

    // Student-wide GWA/honors/risk are deliberately scoped to THIS class's most advanced
    // posted milestone only — this is a representative-class tool, not a full cross-class
    // transcript pull. If you need a true cross-class snapshot, extend this to query every
    // class_record the student is enrolled in, same pattern as AcademicInsights.jsx does.
    const advanced = findMostAdvancedPostedGrade(rows);
    const officialGwa = advanced ? resolveOfficialGwa(advanced).gwa : null;
    const honors = officialGwa !== null
      ? getHonorTier(officialGwa, { subjectGrades: [officialGwa], units: 3 })
      : { tier: null, isEligible: false, unmetRequirements: ['Pending official grades.'] };
    const risk = calculateAcademicRisk({ currentGwa: officialGwa, absenceCount, consecutiveAbsences: absenceCount >= 2 ? 2 : 0 });

    return {
      studentId: enr.student_id,
      studentNumber: enr.users?.user_number || null,
      name: `${enr.users?.first_name || ''} ${enr.users?.last_name || ''}`.trim(),
      terms,
      absenceCount,
      officialGwa,
      honorsTier: honors.tier,
      honorsEligible: honors.isEligible,
      riskScore: risk.composite_score,
      riskLevel: risk.risk_level
    };
  }).sort((a, b) => (a.studentNumber || '').localeCompare(b.studentNumber || ''));

  return {
    capturedAt: new Date().toISOString(),
    classRecordId,
    subjectCode: classRecord.subjects?.code || null,
    subjectName: classRecord.subjects?.name || null,
    students
  };
}

function diffSnapshots(before, after) {
  const beforeById = new Map(before.students.map(s => [s.studentId, s]));
  const afterById = new Map(after.students.map(s => [s.studentId, s]));
  const allIds = new Set([...beforeById.keys(), ...afterById.keys()]);

  let changeCount = 0;
  allIds.forEach(studentId => {
    const b = beforeById.get(studentId);
    const a = afterById.get(studentId);
    if (!b || !a) {
      console.log(`\n[${studentId}] ${!b ? 'only in AFTER' : 'only in BEFORE'} snapshot — roster membership changed, not a value diff.`);
      return;
    }
    const diffs = [];
    const compare = (label, beforeVal, afterVal) => {
      const bStr = JSON.stringify(beforeVal);
      const aStr = JSON.stringify(afterVal);
      if (bStr !== aStr) diffs.push(`  ${label}: ${bStr} -> ${aStr}`);
    };

    Object.keys(b.terms).forEach(term => {
      compare(`terms.${term}.rating`, b.terms[term].rating, a.terms[term].rating);
      compare(`terms.${term}.gwa`, b.terms[term].gwa, a.terms[term].gwa);
      compare(`terms.${term}.remarks`, b.terms[term].remarks, a.terms[term].remarks);
    });
    compare('absenceCount', b.absenceCount, a.absenceCount);
    compare('officialGwa', b.officialGwa, a.officialGwa);
    compare('honorsTier', b.honorsTier, a.honorsTier);
    compare('honorsEligible', b.honorsEligible, a.honorsEligible);
    compare('riskScore', b.riskScore, a.riskScore);
    compare('riskLevel', b.riskLevel, a.riskLevel);

    if (diffs.length > 0) {
      changeCount += diffs.length;
      console.log(`\n[${a.studentNumber || studentId}] ${a.name}`);
      diffs.forEach(line => console.log(line));
    }
  });

  console.log(changeCount === 0
    ? '\nNo changes detected — identical on every tracked field.'
    : `\n${changeCount} changed value(s) found above. Attribute every single one to a specific rule fix before trusting this change — anything you can't attribute is a regression.`);
}

async function main() {
  const [, , command, arg1, arg2] = process.argv;

  if (command === 'snapshot') {
    const [classRecordId, outFile] = [arg1, arg2];
    if (!classRecordId || !outFile) {
      console.error('Usage: node scripts/diffGradingSnapshot.js snapshot <classRecordId> <outFile.json>');
      process.exit(1);
    }
    const snapshot = await snapshotClass(classRecordId);
    fs.writeFileSync(outFile, JSON.stringify(snapshot, null, 2));
    console.log(`Snapshot of ${snapshot.students.length} student(s) in ${snapshot.subjectCode || classRecordId} written to ${outFile}`);
  } else if (command === 'diff') {
    const [beforeFile, afterFile] = [arg1, arg2];
    if (!beforeFile || !afterFile) {
      console.error('Usage: node scripts/diffGradingSnapshot.js diff <beforeFile.json> <afterFile.json>');
      process.exit(1);
    }
    const before = JSON.parse(fs.readFileSync(beforeFile, 'utf-8'));
    const after = JSON.parse(fs.readFileSync(afterFile, 'utf-8'));
    diffSnapshots(before, after);
  } else {
    console.error('Usage:\n  node scripts/diffGradingSnapshot.js snapshot <classRecordId> <outFile.json>\n  node scripts/diffGradingSnapshot.js diff <beforeFile.json> <afterFile.json>');
    process.exit(1);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
