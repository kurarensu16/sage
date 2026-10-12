import { Info } from 'lucide-react';

const content = {
  gradeLog: [
    ['Row highlights', null],
    ['Meaning', 'Shows the student’s current grade performance.'],
    ['White row', 'The student is currently doing well.'],
    ['Yellow highlight', 'The student’s grade needs attention.'],
    ['Red highlight', 'The student is currently struggling.'],
    ['Risk badges', null],
    ['Meaning', 'Also considers attendance, unfinished work, and changes in performance.'],
    ['Safe', 'No current concern.'],
    ['Watch', 'The student may need attention.'],
    ['High', 'Timely faculty support is recommended.'],
    ['Critical', 'Prompt review and intervention are needed.'],
    ['Remember', 'A student with a white row may still receive a Watch badge. Incomplete grades are marked Tentative.']
  ],
  performance: [
    ['Performance', 'Shows how students are doing based on their current grades.'],
    ['Risk', 'Also considers attendance, unfinished work, and changes in performance.'],
    ['Counts', 'A student may be both Struggling and At Risk, so these two groups should not be added together.'],
    ['At Risk', 'Includes students with High or Critical risk.']
  ],
  dashboard: [
    ['Safe', 'No current concern.'],
    ['Watch', 'The student may need attention.'],
    ['High', 'Timely faculty support is recommended.'],
    ['Critical', 'Prompt review and intervention are needed.'],
    ['Interventions', 'These show actions taken and are separate from the student’s risk level.']
  ],
  roster: [
    ['Risk badge', 'Considers grades, attendance, unfinished work, and changes in performance.'],
    ['Tentative', 'The result uses incomplete grades and may change as scores are added.'],
    ['At Risk', 'High and Critical students need timely faculty review.']
  ],
  evaluationRoster: [
    ['Current risk', 'A live, rule-based score for the selected subject. It is recalculated from the latest recorded data and is not an AI prediction.'],
    ['Low · 0–24 points', 'Routine monitoring. No current rule-based intervention trigger.'],
    ['Moderate · 25–49 points', 'An early concern is present. The student enters the Needs evaluation queue for the selected grading term.'],
    ['High · 50–74 points', 'Significant concern. Timely faculty review and a documented support plan are needed.'],
    ['Critical · 75–100 points', 'Severe or combined concerns. Prioritize prompt faculty intervention and consider Dean review when appropriate.'],
    ['How points are formed', 'Current GWA contributes up to 60 points, attendance up to 50, recorded zero scores up to 15, and a declining term trajectory up to 10. The final score is capped at 100.'],
    ['Pending versus recorded zero', 'A saved activity without a score is pending and adds no zero-score points. A numerical 0 is a recorded tentative result and can increase risk.'],
    ['Tentative standing', 'The displayed grade uses the scores currently available and may change when pending scores are recorded or grades are officially posted.'],
    ['Needs evaluation', 'Counts Moderate, High, or Critical students who do not yet have an evaluation for the selected subject and grading term.'],
    ['Re-evaluation', 'Each student has one evaluation per subject and grading term. Use Review / edit to update it until its follow-up is recorded. After that the term shows Closed; if the student still needs support, select a later grading term and evaluate again with a new baseline.']
  ],
  evaluationHistory: [
    ['At evaluation', 'The risk level, points, and baseline GWA captured when the faculty submitted that subject-and-term evaluation. This historical snapshot does not change afterward.'],
    ['Low · 0–24 points', 'The recorded evaluation had no rule-based intervention trigger.'],
    ['Moderate · 25–49 points', 'The recorded evaluation identified an early concern requiring faculty review.'],
    ['High · 50–74 points', 'The recorded evaluation identified a significant concern requiring timely support.'],
    ['Critical · 75–100 points', 'The recorded evaluation identified severe or combined concerns requiring prompt intervention.'],
    ['Current subject standing', 'The latest available grade for the same class. It can differ from the frozen baseline as new scores are recorded.'],
    ['Tentative', 'The current standing is still based on incomplete or not-yet-final grade data. It does not change the historical risk badge.'],
    ['Tasks', 'Students report a task as done; it counts as complete only after you verify it. Returning a task sends it back to the student with your note. Verification never changes a grade.'],
    ['Follow-up', 'After the next MR, TFR, or SG is posted, record the follow-up to freeze the current standing beside the baseline. Recording closes the plan and feeds the Dean\'s Intervention Results.'],
    ['Re-evaluation', 'Before the follow-up is recorded, update the same evaluation from Evaluate Students; its baseline stays fixed, and the student must acknowledge again if tasks or guidance change. Once the follow-up is recorded, that subject-and-term case is closed. If the student still needs support, evaluate again in a later grading term; the new evaluation starts from a new baseline and this record stays as history.'],
    ['Referral status', 'Shows whether the case currently has an active Dean referral. Authored history remains read-only when the faculty no longer owns the class.']
  ]
};

export default function RiskEducationNote({ variant = 'roster', defaultOpen = false, className = '' }) {
  const items = content[variant] || content.roster;
  const isEvaluationNote = variant === 'evaluationRoster' || variant === 'evaluationHistory';
  const title = variant === 'gradeLog'
    ? 'What row highlights and risk badges mean'
    : variant === 'evaluationRoster'
      ? 'How current risk and evaluation priority work'
      : variant === 'evaluationHistory'
        ? 'How evaluation history and current standing differ'
        : 'How badges and student status work';
  return (
    <details open={defaultOpen || undefined} className={`group border-y border-sage-200 bg-sage-50/70 ${className}`}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-xs font-semibold text-sage-800">
        <Info className="h-4 w-4 shrink-0" />
        {title}
        <span className="ml-auto text-sage-500 group-open:hidden">Show note</span>
        <span className="ml-auto hidden text-sage-500 group-open:inline">Hide note</span>
      </summary>
      {variant === 'gradeLog' ? (
        <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2 sm:px-10">
          <section className="rounded-xl border border-sage-200 bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-sage-900">Row highlights</h3>
            <p className="mt-1 text-xs text-sage-600">Shows the student’s current grade performance.</p>
            <ul className="mt-3 space-y-1.5 text-xs leading-5 text-sage-700">
              <li><strong>White:</strong> The student is currently doing well.</li>
              <li><strong>Yellow:</strong> The student’s grade needs attention.</li>
              <li><strong>Red:</strong> The student is currently struggling.</li>
            </ul>
          </section>
          <section className="rounded-xl border border-sage-200 bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-sage-900">Risk badges</h3>
            <p className="mt-1 text-xs text-sage-600">Also considers attendance, unfinished work, and changes in performance.</p>
            <ul className="mt-3 space-y-1.5 text-xs leading-5 text-sage-700">
              <li><strong>Safe:</strong> No current concern.</li>
              <li><strong>Watch:</strong> The student may need attention.</li>
              <li><strong>High:</strong> Timely faculty support is recommended.</li>
              <li><strong>Critical:</strong> Prompt review and intervention are needed.</li>
            </ul>
          </section>
          <p className="text-xs leading-5 text-sage-700 sm:col-span-2"><strong>Remember:</strong> A student with a white row may still receive a Watch badge. Incomplete grades are marked Tentative.</p>
        </div>
      ) : isEvaluationNote ? (
        <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2 sm:px-10">
          <section className="rounded-xl border border-sage-200 bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-sage-900">
              {variant === 'evaluationRoster' ? 'Live risk and priority' : 'Recorded evaluation risk'}
            </h3>
            <ul className="mt-3 space-y-1.5 text-xs leading-5 text-sage-700">
              {items.slice(0, 5).map(([label, text]) => <li key={label}><strong>{label}:</strong> {text}</li>)}
            </ul>
          </section>
          <section className="rounded-xl border border-sage-200 bg-white p-4">
            <h3 className="text-xs font-bold uppercase tracking-wide text-sage-900">
              {variant === 'evaluationRoster' ? 'Evidence and queue rules' : 'Current status and follow-up'}
            </h3>
            <ul className="mt-3 space-y-1.5 text-xs leading-5 text-sage-700">
              {items.slice(5).map(([label, text]) => <li key={label}><strong>{label}:</strong> {text}</li>)}
            </ul>
          </section>
        </div>
      ) : (
        <ul className="space-y-1.5 px-10 pb-4 text-xs leading-5 text-sage-700">
          {items.map(([label, text], index) => text === null
            ? <li key={`${label}-${index}`} className="pt-1 font-bold uppercase tracking-wide text-sage-900">{label}</li>
            : <li key={`${label}-${index}`}><strong>{label}:</strong> {text}</li>)}
        </ul>
      )}
    </details>
  );
}
