import { cn } from '../../lib/utils';

export default function EnrollmentTypeBadge({ enrollmentType, className }) {
  if (enrollmentType !== 'Irregular') return null;

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700',
        className
      )}
      title="Student is enrolled outside their regular block section"
    >
      Irregular
    </span>
  );
}
