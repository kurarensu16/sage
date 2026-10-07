import { cn } from '../../lib/utils';
import { getRiskDisplay, getRiskTierForScore } from '../../lib/academicPolicy';

const styles = {
  low: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  moderate: 'border-amber-200 bg-amber-50 text-amber-700',
  high: 'border-rose-200 bg-rose-50 text-rose-700',
  critical: 'border-rose-300 bg-rose-100 text-rose-800'
};

const dots = {
  low: 'bg-emerald-500',
  moderate: 'bg-amber-500',
  high: 'bg-rose-500',
  critical: 'bg-rose-700'
};

export default function RiskTierBadge({ tier, score, tentative = false, onClick, className }) {
  const resolvedTier = String(tier || getRiskTierForScore(score).label || 'low').toLowerCase();
  const display = getRiskDisplay(resolvedTier);
  const Component = onClick ? 'button' : 'span';
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={`${display.label}: ${display.description}${tentative ? ' Based on incomplete grades.' : ''}`}
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold whitespace-nowrap',
        onClick && 'cursor-pointer hover:shadow-sm focus-visible:outline-2 focus-visible:outline-sage-600',
        styles[resolvedTier] || styles.low,
        className
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', dots[resolvedTier] || dots.low)} />
      {display.label}{tentative ? ' · Tentative' : ''}
    </Component>
  );
}
