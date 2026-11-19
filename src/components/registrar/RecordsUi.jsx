import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '../../lib/utils';

// Small building blocks shared by the Registrar's Student Records and Class
// Grade Sheets screens, so the four pages look and read the same.

export function FilterSelect({ label, value, onChange, options, disabled = false }) {
  return (
    <label className="block min-w-0">
      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="block w-full bg-white border border-slate-200 hover:border-sage-300 focus:border-sage-500 rounded-xl px-3 py-2 text-xs sm:text-sm outline-none transition-all cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
      <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function InfoNote({ children }) {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-[11px] sm:text-xs text-slate-600 flex items-start gap-2">
      <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 flex flex-col items-center text-center">
      {Icon && <Icon className="h-8 w-8 text-slate-300 stroke-1 mb-2" />}
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="text-xs text-slate-400 mt-1 max-w-md">{hint}</p>}
    </div>
  );
}

const CHIP_TONES = {
  neutral: 'text-slate-600 bg-slate-50 border-slate-200',
  good: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  warn: 'text-amber-700 bg-amber-50 border-amber-200',
  bad: 'text-rose-700 bg-rose-50 border-rose-200',
  brand: 'text-sage-700 bg-sage-50 border-sage-200'
};

export function Chip({ tone = 'neutral', children, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border whitespace-nowrap',
        CHIP_TONES[tone] || CHIP_TONES.neutral,
        className
      )}
    >
      {children}
    </span>
  );
}

// A posted milestone cell: the 1.00-5.00 grade, with the percentage under it.
// "—" when the milestone has not been posted.
export function GradeCell({ milestone, showRating = true }) {
  if (!milestone) return <span className="text-slate-300 font-mono text-xs">—</span>;
  const failing = milestone.gwa !== null && Number(milestone.gwa) > 3;
  return (
    <span className="inline-flex flex-col leading-tight">
      <span className={cn('font-mono tabular-nums text-xs sm:text-sm font-semibold', failing ? 'text-rose-700' : 'text-slate-900')}>
        {milestone.gwa !== null ? Number(milestone.gwa).toFixed(2) : '—'}
      </span>
      {showRating && milestone.rating !== null && (
        <span className="font-mono tabular-nums text-[10px] text-slate-400">{Number(milestone.rating).toFixed(2)}%</span>
      )}
    </span>
  );
}

// The SG remark, coloured by outcome. INC, FDA and Dropped keep their own
// look rather than collapsing into Passed/Failed.
export function RemarkChip({ milestone }) {
  if (!milestone) return <span className="text-[11px] text-slate-400">In progress</span>;
  const value = String(milestone.remark || '').toLowerCase();
  const tone = value === 'passed'
    ? 'good'
    : value === 'failed' || value === 'fda'
      ? 'bad'
      : value.startsWith('incomplete') || value === 'dropped' ? 'warn' : 'neutral';
  return <Chip tone={tone}>{milestone.remark}</Chip>;
}
