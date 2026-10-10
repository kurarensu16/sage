import {
  createInsightEvidenceFingerprint,
  getFreshInsightText,
} from '../src/lib/insightFreshness.js';

const originalEvidence = {
  postedGrades: [{ id: 'grade-1', computedGrade: 90, postedAt: '2026-10-08T00:00:00Z' }],
  attendance: [{ id: 'attendance-1', status: 'Present' }],
  activityScores: [{ activityId: 'activity-1', score: 18, updatedAt: '2026-10-08T00:00:00Z' }],
  evaluations: [{ id: 'evaluation-1', updatedAt: '2026-10-08T00:00:00Z' }],
};

const reorderedEvidence = {
  evaluations: originalEvidence.evaluations,
  activityScores: originalEvidence.activityScores,
  attendance: originalEvidence.attendance,
  postedGrades: originalEvidence.postedGrades,
};

const originalFingerprint = createInsightEvidenceFingerprint(originalEvidence);
if (originalFingerprint !== createInsightEvidenceFingerprint(reorderedEvidence)) {
  throw new Error('Equivalent evidence produced different fingerprints.');
}

for (const [field, changedEvidence] of [
  ['posted grade', { ...originalEvidence, postedGrades: [{ ...originalEvidence.postedGrades[0], computedGrade: 89 }] }],
  ['attendance', { ...originalEvidence, attendance: [{ ...originalEvidence.attendance[0], status: 'Absent' }] }],
  ['activity score', { ...originalEvidence, activityScores: [{ ...originalEvidence.activityScores[0], score: 17 }] }],
  ['evaluation', { ...originalEvidence, evaluations: [{ ...originalEvidence.evaluations[0], updatedAt: '2026-10-09T00:00:00Z' }] }],
]) {
  if (originalFingerprint === createInsightEvidenceFingerprint(changedEvidence)) {
    throw new Error(`A changed ${field} did not invalidate the evidence fingerprint.`);
  }
}

const cacheEntry = { text: 'Current insight', evidenceFingerprint: originalFingerprint };
if (getFreshInsightText(cacheEntry, originalFingerprint) !== 'Current insight') {
  throw new Error('A current cache entry was rejected.');
}
if (getFreshInsightText(cacheEntry, 'different-fingerprint') !== null) {
  throw new Error('A stale cache entry was reused.');
}
if (getFreshInsightText('Legacy unversioned text', originalFingerprint) !== null) {
  throw new Error('A legacy unversioned cache entry was reused.');
}

console.log('AI insight freshness verification passed.');
