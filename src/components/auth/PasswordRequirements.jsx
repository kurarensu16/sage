import { CheckCircle2, Circle } from 'lucide-react';
import { cn } from '../../lib/utils';
import { checkPassword } from '../../lib/passwordPolicy';

export default function PasswordRequirements({ value }) {
  const { results } = checkPassword(value);
  return (
    <ul className="mt-1.5 space-y-1" aria-label="Password requirements">
      {results.map(rule => (
        <li key={rule.key} className={cn('flex items-center gap-1.5 text-[11px]', rule.met ? 'text-emerald-700' : 'text-slate-500')}>
          {rule.met ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <Circle className="h-3.5 w-3.5 shrink-0" />}
          <span>{rule.label}</span>
          <span className="sr-only">{rule.met ? '(met)' : '(not met)'}</span>
        </li>
      ))}
    </ul>
  );
}
