import { CloudOff, Clock, AlertCircle } from 'lucide-react';

// What a person sees when an AI feature does not answer.
//
// Three surfaces call three different edge functions, and each used to render
// whatever string happened to arrive: a raw FunctionsFetchError in one, a
// hard-coded "temporarily unavailable" that swallowed every cause in another,
// and nothing at all in a third. A student reading a stack-adjacent string
// concludes the system is broken rather than busy.
//
// describeAiFailure() in src/lib/aiFallbackMessage.js decides WHAT to say; this
// decides how it looks. Keeping them apart means the wording can be checked
// without a browser, and the three surfaces cannot drift.
//
// NOT the deterministic fallback Objective 6 promises -- that would produce
// usable study guidance with no provider at all. This explains the silence.
// See QA bug B-06.

export default function AiUnavailableNotice({ failure, onRetry, retrying = false }) {
  if (!failure) return null;

  const { title, message, hint, canRetry } = failure;
  const offline = /offline/i.test(title || '');
  const Icon = offline ? CloudOff : canRetry ? Clock : AlertCircle;

  // Amber when waiting helps, slate when it does not. A red alarm for "busy,
  // try again shortly" trains people to ignore the next one.
  const tone = canRetry
    ? {
        wrap: 'bg-amber-50 border-amber-200',
        icon: 'text-amber-600',
        heading: 'text-amber-900',
        body: 'text-amber-800',
        button: 'border-amber-300 text-amber-900 hover:bg-amber-100'
      }
    : {
        wrap: 'bg-slate-50 border-slate-200',
        icon: 'text-slate-500',
        heading: 'text-slate-900',
        body: 'text-slate-600',
        button: 'border-slate-300 text-slate-700 hover:bg-slate-100'
      };

  return (
    <div className={`border rounded-xl p-3.5 flex gap-3 ${tone.wrap}`} role="status">
      <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${tone.icon}`} />
      <div className="min-w-0 flex-1 space-y-1">
        <p className={`text-xs sm:text-sm font-bold ${tone.heading}`}>{title}</p>
        <p className={`text-[11px] sm:text-xs leading-relaxed ${tone.body}`}>{message}</p>
        {hint && <p className={`text-[11px] sm:text-xs leading-relaxed ${tone.body}`}>{hint}</p>}
        {canRetry && onRetry && (
          <button
            onClick={onRetry}
            disabled={retrying}
            className={`mt-1.5 px-2.5 py-1 text-[11px] font-bold bg-white border rounded-lg transition-colors disabled:opacity-50 cursor-pointer ${tone.button}`}
          >
            {retrying ? 'Trying again…' : 'Try again'}
          </button>
        )}
      </div>
    </div>
  );
}
