import { Check, CircleDashed, Dot, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { REQUEST_STATUS } from '../../lib/gradeChangeRules';

// Where a grade change request has got to, and whose desk it is on.
//
// WHY THIS EXISTS
//   Every screen showed a status badge -- "With the Dean", "Approved" -- and a
//   badge answers "what state is this in" without answering the question people
//   actually ask, which is "how many more hands does this pass through, and is
//   it nearly done". A student seeing "Approved" reasonably assumed their grade
//   had changed; it had not, because the instructor still has to apply it.
//
//   Objective 7 is controlled correction through three approvals. The control
//   IS the chain, so the chain is worth drawing rather than describing.
//
// ONE COMPONENT, FIVE SCREENS
//   Student, instructor, Dean, the apply page and the Registrar's late route
//   all render this same sequence. A per-screen version would let the five
//   drift, and disagreeing accounts of the same request is worse than none.
//
// THE REGISTRAR STEP IS CONDITIONAL
//   It appears only on a request that outlived the dispute window, because on
//   an ordinary request it is not a step that was skipped -- it is a step that
//   never applied. Drawing it greyed out on every request would imply the
//   Registrar was bypassed.

const STOPPED_STATES = [REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED];

function buildSteps(status, reachedRegistrar) {
  const steps = [
    { key: 'raised', label: 'Raised', who: 'Student' },
    { key: 'faculty', label: 'Instructor review', who: 'Instructor', at: REQUEST_STATUS.PENDING_FACULTY },
    { key: 'dean', label: "Dean's decision", who: 'Dean', at: REQUEST_STATUS.PENDING_DEAN }
  ];
  if (reachedRegistrar) {
    steps.push({ key: 'registrar', label: 'Registrar authorises', who: 'Registrar', at: REQUEST_STATUS.PENDING_REGISTRAR });
  }
  steps.push(
    { key: 'apply', label: 'Instructor applies', who: 'Instructor', at: REQUEST_STATUS.APPROVED },
    { key: 'done', label: 'Grade corrected', who: 'Student', at: REQUEST_STATUS.APPLIED }
  );
  return steps;
}

export default function GradeChangeChain({ status, reachedRegistrar = false, className }) {
  if (!status) return null;

  const steps = buildSteps(status, reachedRegistrar);
  const stopped = STOPPED_STATES.includes(status);

  // A stopped request halts at whoever was holding it, which the status alone
  // no longer says once it reads "Not approved".
  const currentIndex = stopped
    ? Math.max(1, steps.findIndex(step => step.at === REQUEST_STATUS.PENDING_DEAN))
    : steps.findIndex(step => step.at === status);

  // 'raised' has no status of its own: the request existing is the evidence.
  const activeIndex = currentIndex === -1 ? 0 : currentIndex;

  return (
    <ol className={cn('flex flex-wrap items-stretch gap-1', className)} aria-label="Progress of this request">
      {steps.map((step, index) => {
        const done = index < activeIndex || (!stopped && status === REQUEST_STATUS.APPLIED);
        const current = !stopped && index === activeIndex && status !== REQUEST_STATUS.APPLIED;
        const halted = stopped && index === activeIndex;

        return (
          <li
            key={step.key}
            aria-current={current ? 'step' : undefined}
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2 py-1',
              halted && 'bg-rose-50 border-rose-200 text-rose-700',
              current && 'bg-amber-50 border-amber-200 text-amber-800 font-semibold',
              done && !halted && 'bg-emerald-50 border-emerald-200 text-emerald-700',
              !done && !current && !halted && 'bg-slate-50 border-slate-200 text-slate-400'
            )}
          >
            {halted ? <X className="h-3 w-3 shrink-0" />
              : done ? <Check className="h-3 w-3 shrink-0" />
                : current ? <CircleDashed className="h-3 w-3 shrink-0" />
                  : <Dot className="h-3 w-3 shrink-0" />}
            <span className="text-[11px] leading-tight">
              {step.label}
              <span className="block text-[10px] font-normal opacity-80">{step.who}</span>
            </span>
          </li>
        );
      })}

      {stopped && (
        <li className="flex items-center text-[11px] text-rose-700 px-2">
          {status === REQUEST_STATUS.CANCELLED ? 'Withdrawn — the chain stopped here.' : 'Not approved — the chain stopped here.'}
        </li>
      )}
    </ol>
  );
}
