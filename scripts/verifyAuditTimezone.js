import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  formatPhilippineTimestamp,
  getPhilippineDateKey,
  parseDatabaseUtcTimestamp,
  toPhilippineIsoTimestamp,
} from '../src/lib/dateTime.js';
import { getGradePostingAuditAction } from '../src/lib/gradeMilestones.js';
import {
  formatAuditActionForDisplay,
  formatAuditEntityForDisplay,
  formatAuditMessageForDisplay,
} from '../src/lib/auditLogPresentation.js';

const legacyUtcValue = '2026-10-22T23:40:41';
const explicitUtcValue = '2026-10-22T23:40:41Z';
const explicitManilaValue = '2026-10-23T07:40:41+08:00';

assert.equal(parseDatabaseUtcTimestamp(legacyUtcValue)?.toISOString(), '2026-10-22T23:40:41.000Z');
assert.equal(toPhilippineIsoTimestamp(legacyUtcValue), '2026-10-23T07:40:41+08:00');
assert.equal(toPhilippineIsoTimestamp(explicitUtcValue), '2026-10-23T07:40:41+08:00');
assert.equal(toPhilippineIsoTimestamp(explicitManilaValue), '2026-10-23T07:40:41+08:00');
assert.equal(getPhilippineDateKey(explicitUtcValue), '2026-10-23');
assert.match(formatPhilippineTimestamp(legacyUtcValue), /Oct 23, 2026/);
assert.match(formatPhilippineTimestamp(legacyUtcValue), /07:40:41 AM/);
assert.match(formatPhilippineTimestamp(legacyUtcValue), /PHT \(UTC\+8\)$/);
assert.equal(
  formatAuditMessageForDisplay(
    'Updated posted_grades record 13100656-f6a6-4cee-96b4-b18dbeb1afb1. Changed fields: remarks.',
    'posted_grades',
  ),
  'Updated posted grade record. Changed fields: remarks.'
);
assert.equal(formatAuditActionForDisplay('Updated posted_grades', 'posted_grades'), 'Updated posted grade');
assert.equal(
  formatAuditActionForDisplay(
    'Updated posted_grades',
    'posted_grades',
    'Changed fields: last_correction_request_id, official_source.'
  ),
  'Applied Semestral Grade Correction'
);
assert.equal(
  formatAuditMessageForDisplay(
    'Updated posted_grades record 13100656-f6a6-4cee-96b4-b18dbeb1afb1. Changed fields: last_correction_request_id, official_source.',
    'posted_grades',
  ),
  'Applied a Dean-approved correction to an official Semestral Grade (SG).'
);
assert.equal(
  formatAuditActionForDisplay('Grade Posting', null, 'Posted Midterm Rating (MR) for subject NAV113.'),
  'Posted Midterm Rating'
);
assert.equal(
  formatAuditActionForDisplay('Remark Override Approved', null, 'Dean approved a request.'),
  'Approved SG Correction Request'
);
assert.equal(
  getGradePostingAuditAction({ targetMilestone: 'midterm', isFirstPost: true, changedCount: 10 }),
  'Posted Midterm Rating'
);
assert.equal(
  getGradePostingAuditAction({ targetMilestone: 'midterm', isFirstPost: false, changedCount: 1 }),
  'Updated Midterm Rating'
);
assert.equal(
  getGradePostingAuditAction({ targetMilestone: 'semestral', isFirstPost: false, changedCount: 1 }),
  'Applied Semestral Grade Correction'
);
assert.equal(formatAuditEntityForDisplay('remark_override_requests'), 'SG correction request');
assert.doesNotMatch(
  formatAuditMessageForDisplay(
    'Changed student 13100656-f6a6-4cee-96b4-b18dbeb1afb1.',
    'posted_grades',
  ),
  /13100656-f6a6-4cee-96b4-b18dbeb1afb1/
);

const migration = readFileSync(
  new URL('../supabase/migrations/20261023080500_activity_logs_philippine_time.sql', import.meta.url),
  'utf8',
);
assert.match(migration, /timestamp without time zone/i);
assert.match(migration, /TYPE TIMESTAMPTZ/i);
assert.match(migration, /AT TIME ZONE 'UTC'/i);
assert.match(migration, /timestamp with time zone/i);

const semanticAuditMigration = readFileSync(
  new URL('../supabase/migrations/20261023083000_semantic_grade_audit_events.sql', import.meta.url),
  'utf8',
);
[
  'Posted Midterm Rating',
  'Updated Midterm Rating',
  'Posted Tentative Final Rating',
  'Updated Tentative Final Rating',
  'Posted Semestral Grade',
  'Applied Semestral Grade Correction',
  'Submitted SG Correction Request',
  'Approved SG Correction Request',
  'Rejected SG Correction Request',
  'Applied Administrative Grade Override',
].forEach((eventName) => {
  assert.ok(semanticAuditMigration.includes(eventName), `Missing semantic audit event: ${eventName}`);
});

console.log('Audit timezone verification passed: legacy UTC and offset timestamps render consistently as PHT (UTC+8).');
