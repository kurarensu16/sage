import { BookOpen, CheckCircle2, ClipboardCheck, FileSpreadsheet } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';

const WORKFLOW_STEPS = Object.freeze([
  {
    id: 'scorebook',
    label: 'Scorebook',
    description: 'Enter and save scores',
    icon: FileSpreadsheet,
    getPath: classRecordId => `/faculty/scoreinput?id=${classRecordId}`
  },
  {
    id: 'review',
    label: 'Review & Post',
    description: 'Verify and release periods',
    icon: ClipboardCheck,
    getPath: classRecordId => `/faculty/gradecomputationpreview?id=${classRecordId}`
  },
  {
    id: 'posted',
    label: 'Posted Grades & Corrections',
    description: 'View official records',
    icon: CheckCircle2,
    getPath: classRecordId => `/faculty/postedgradesview?id=${classRecordId}`
  }
]);

export default function ClassWorkflowNav({ activeStep, classRecordId, subjectCode, sectionName }) {
  if (!classRecordId) return null;

  const classLabel = [subjectCode, sectionName].filter(Boolean).join(' — ') || 'Selected class';

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xs" aria-label="Selected class grading workflow">
      <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-micro font-bold uppercase tracking-wider text-slate-400">Class workspace</p>
          <p className="truncate text-sm font-bold text-slate-900">{classLabel}</p>
        </div>
        <Link
          to="/faculty/classrecordslist"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:border-sage-300 hover:text-sage-700"
        >
          <BookOpen className="h-3.5 w-3.5" />
          My Classes
        </Link>
      </div>

      <nav className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-3" aria-label="Grading workflow steps">
        {WORKFLOW_STEPS.map((step, index) => {
          const Icon = step.icon;
          const isActive = activeStep === step.id;

          return (
            <Link
              key={step.id}
              to={step.getPath(classRecordId)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                isActive
                  ? 'border-sage-300 bg-sage-50 text-sage-900'
                  : 'border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <span className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold',
                isActive ? 'bg-sage-600 text-white' : 'bg-slate-100 text-slate-500'
              )}>
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-xs font-bold">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{step.label}</span>
                </span>
                <span className="mt-0.5 block truncate text-micro text-slate-500">{step.description}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
