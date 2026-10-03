// Canonical DYCI institutional grading templates.
// Single source of truth for the "Apply Preset" quick-start buttons in the admin
// Grade Computations UI AND for scripts/verifyGradingMath.js's assertion fixtures —
// so the verification suite always exercises the exact same institutional values the
// UI offers, with no risk of the two silently diverging over time (IMPLEMENTATION
// CORRECTIONS item (k)). Component keys are deliberately omitted: the grading engine
// (createComponentKey in gradingMath.js) derives a stable key from each component's
// name, exactly as it does for real database-backed templates.
export const OFFICIAL_DYCI_PRESETS = [
  {
    name: 'General Education Core',
    description: 'Standard institutional lecture scale: 50% Class Standing, 40% Major Examination, 10% Character Rating.',
    components: [
      { name: 'Class Standing (Formative)', weight: 50, max_score: 20, is_multiple: true },
      { name: 'Major Examination', weight: 40, max_score: 40, is_multiple: false },
      { name: 'Character Rating', weight: 10, max_score: 100, is_multiple: false }
    ]
  },
  {
    name: 'Health Sciences (Theory)',
    description: 'Theoretical lecture scale: 30% Class Standing, 60% Major Examination, 10% Character Rating.',
    components: [
      { name: 'Class Standing (Formative)', weight: 30, max_score: 20, is_multiple: true },
      { name: 'Major Examination', weight: 60, max_score: 100, is_multiple: false },
      { name: 'Character Rating', weight: 10, max_score: 100, is_multiple: false }
    ]
  },
  {
    name: 'Health Sciences (RLE / Clinical Practicum)',
    description: 'Clinical practicum: 50% Checklist Rating, 20% NCP & Case Study, 20% Rubrics, 10% Quizzes.',
    components: [
      { name: 'Checklist Rating', weight: 50, max_score: 100, is_multiple: true },
      { name: 'Nursing Care Plan & Case Study', weight: 20, max_score: 100, is_multiple: true },
      { name: 'Rubric Assessment', weight: 20, max_score: 100, is_multiple: false },
      { name: 'Quizzes & Written Outputs', weight: 10, max_score: 50, is_multiple: true }
    ]
  },
  {
    name: 'Maritime Studies (Lecture)',
    description: 'Maritime theoretical lecture scale: 60% Class Standing and 40% Major Examination.',
    components: [
      { name: 'Class Standing', weight: 60, max_score: 100, is_multiple: true },
      { name: 'Major Examination', weight: 40, max_score: 100, is_multiple: false }
    ]
  },
  {
    name: 'Maritime Studies (Laboratory / Simulator)',
    description: 'Maritime simulator/practical scale: 40% Systematic Exercises, 60% Demonstration of Competence.',
    components: [
      { name: 'Systematic Exercises', weight: 40, max_score: 100, is_multiple: true },
      { name: 'Demonstration of Competence', weight: 60, max_score: 100, is_multiple: false }
    ]
  }
];
