import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const studentPage = read('src/pages/student/AcademicInsights.jsx');
const askPanel = read('src/components/student/AskAspirePanel.jsx');
const advisorEdge = read('supabase/functions/invoke-advisor/index.ts');
const interventionEdge = read('supabase/functions/generate-intervention-draft/index.ts');

assert(
  !/payload\s*=\s*\{[\s\S]{0,600}studentName\s*:/.test(studentPage),
  'Student names must not be included in provider-bound insight payloads.'
);
assert(
  !/const askAspireContext\s*=\s*\{[\s\S]{0,800}firstName\s*:/.test(studentPage),
  'Student first names must not be included in Ask ASPIRE provider context.'
);
assert(
  !advisorEdge.includes('studentName: text(input?.studentName'),
  'The advisor Edge Function must ignore client-supplied student names.'
);
assert(
  !advisorEdge.includes('instructor: text(input.subject.instructor'),
  'Instructor names must not be included in provider prompts.'
);
assert(
  advisorEdge.includes("student: { label: 'Student' }"),
  'The advisor provider context must use a generic student label.'
);
assert(
  askPanel.includes('personalizeLocally(answer)'),
  'Ask ASPIRE must add the authenticated student name locally after receiving the provider response.'
);
assert(
  askPanel.includes('redactForProvider(trimmed)'),
  'Ask ASPIRE must redact direct identifiers from free-text questions before provider submission.'
);
assert(
  advisorEdge.includes(".select('role, first_name, middle_name, last_name, email, user_number')")
    && advisorEdge.includes('redactDirectIdentifiers(body.question, identityValues)')
    && advisorEdge.includes('redactDirectIdentifiers(message?.content, identityValues)')
    && advisorEdge.includes('redactDirectIdentifiers(JSON.stringify(context), identityValues)'),
  'The trusted advisor edge must independently redact the authenticated student identity from questions, history, and context.'
);
assert(
  !advisorEdge.includes('sharedAcademicFeedback: text(input.subject.sharedAcademicFeedback'),
  'Free-form faculty feedback must not be included in provider prompts.'
);
assert(
  askPanel.includes('adds your first name locally after the response'),
  'Ask ASPIRE must disclose that personalization occurs after the provider response.'
);
assert(
  interventionEdge.includes('const code = `activity:${activityIndex + 1}`'),
  'Intervention evidence must use request-local aliases instead of activity UUIDs.'
);
assert(
  !interventionEdge.includes('section: classRecord.sections?.name'),
  'Section labels must not be included in intervention provider snapshots.'
);

console.log('AI provider data-minimization boundaries verified.');
