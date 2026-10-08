import { supabase } from './supabase';

const ensureArray = (value) => (Array.isArray(value) ? value : []);

/**
 * Commits a grading-formula snapshot, any faculty-confirmed NULL-to-zero score
 * substitutions, and one complete posted milestone in a single database
 * transaction. Grade calculation remains in the shared gradingMath engine;
 * this service is the single persistence boundary used by Faculty pages.
 */
export async function postGradeMilestoneAtomic({
  classRecordId,
  gradePeriod,
  gradingFormulaSnapshot,
  termScoreRows = [],
  activityScoreRows = [],
  postedGradeRows
}) {
  if (!classRecordId) throw new Error('A class record is required to post grades.');
  if (!gradePeriod) throw new Error('A grade milestone is required to post grades.');
  if (!gradingFormulaSnapshot) {
    throw new Error('Grades cannot be posted without a valid class or subject COG.');
  }
  if (!Array.isArray(postedGradeRows) || postedGradeRows.length === 0) {
    throw new Error('At least one computed student grade is required for posting.');
  }

  const { data, error } = await supabase.rpc('post_grade_milestone_atomic', {
    p_class_record_id: classRecordId,
    p_grade_period: gradePeriod,
    p_grading_formula_snapshot: gradingFormulaSnapshot,
    p_term_score_rows: ensureArray(termScoreRows),
    p_activity_score_rows: ensureArray(activityScoreRows),
    p_posted_grade_rows: postedGradeRows
  });

  if (error) throw error;
  return data;
}
