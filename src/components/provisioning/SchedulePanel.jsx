import { Clock, AlertTriangle } from 'lucide-react';
import { formatDays, formatTimeRange } from '../../lib/classSchedule';

// What is already taken, and whether the slot being typed clashes.
//
// The loading screen used to offer a faculty member and a time with no sign
// that either was spoken for, so finding a free slot meant picking a time,
// clicking Add, being refused, and trying again. Three round trips to learn
// three things the server already knew.
//
// BOTH HALVES ARE ADVISORY. add_faculty_load_draft runs the same conflict check
// inside its own transaction, under an advisory lock on the section and the
// faculty member, and that is the answer that decides. A snapshot taken while
// somebody types cannot be authoritative -- another college may claim the slot
// between the look and the click, which is exactly what the lock exists for.
//
// Subject and section are absent for anyone but a registrar: the server strips
// them, matching redact_schedule_conflict. A dean sees days, times and the
// owning college -- enough to schedule around, not enough to read another
// college's timetable.

function Slot({ entry }) {
  const days = formatDays(entry.days);
  const time = formatTimeRange(entry.start_time, entry.end_time);
  const detail = entry.subject_code
    ? `${entry.subject_code}${entry.section_name ? ` · ${entry.section_name}` : ''}`
    : entry.college;

  return (
    <div className="flex items-baseline justify-between gap-3 text-[11px]">
      <span className="font-mono text-slate-700 whitespace-nowrap">
        {days} {time}
      </span>
      <span className="text-slate-500 truncate text-right">{detail}</span>
    </div>
  );
}

export default function SchedulePanel({ occupancy = [], conflict = null, hasFaculty, hasSection }) {
  if (!hasFaculty && !hasSection) return null;

  const facultySlots = occupancy.filter((e) => e.owner === 'faculty');
  const sectionSlots = occupancy.filter((e) => e.owner === 'section');

  return (
    <div className="space-y-2.5">
      {(facultySlots.length > 0 || sectionSlots.length > 0) && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            <Clock className="h-3 w-3" /> Already booked this term
          </div>

          {facultySlots.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-slate-600">This faculty member</p>
              {facultySlots.map((entry, i) => <Slot key={`f-${i}`} entry={entry} />)}
            </div>
          )}

          {sectionSlots.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-slate-600">This section</p>
              {sectionSlots.map((entry, i) => <Slot key={`s-${i}`} entry={entry} />)}
            </div>
          )}
        </div>
      )}

      {/* Drafts count here, not just live classes: a draft reserves the slot,
          which is what makes first-come-first-served true across colleges. */}
      {hasFaculty && hasSection && facultySlots.length === 0 && sectionSlots.length === 0 && (
        <p className="text-[11px] text-slate-400">
          Nothing booked yet for this faculty member or section.
        </p>
      )}

      {conflict && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 flex gap-2.5">
          <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="min-w-0 text-[11px] text-rose-900 space-y-1">
            <p className="font-bold">
              {conflict.kind === 'faculty'
                ? 'This faculty member is already teaching then.'
                : 'This section already has a class then.'}
            </p>
            <p>
              <span className="font-mono">{formatDays(conflict.days)} {formatTimeRange(conflict.start_time, conflict.end_time)}</span>
              {conflict.subject_code
                ? <> &middot; {conflict.subject_code}{conflict.section_name ? ` · ${conflict.section_name}` : ''}</>
                : <> &middot; {conflict.college}</>}
            </p>
            {!conflict.subject_code && (
              <p className="text-rose-800">
                Contact that college to coordinate, or ask the Registrar, who can see the full timetable.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
