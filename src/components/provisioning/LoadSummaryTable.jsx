import { useMemo } from 'react';
import { CalendarRange } from 'lucide-react';
import { formatDays, formatTimeRange } from '../../lib/classSchedule';

// The whole term's loading, as one table.
//
// The picker builds one assignment at a time and the chips show each faculty
// member's own list, so until now nobody could see the timetable as a whole --
// which is where an impossible load becomes obvious. Four classes ending and
// starting on the same hour across the campus is not visible from any single
// faculty card.
//
// Sorted by day then start time rather than by faculty, because that is the
// order a timetable is read in. A clash that survived every check still shows
// here as two rows on the same line of the day.

const DAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function LoadSummaryTable({ summary = [] }) {
  const rows = useMemo(() => {
    const flat = [];
    summary.forEach((member) => {
      (member.chips || []).forEach((chip) => {
        flat.push({
          key: `${member.facultyId}-${chip.id}`,
          faculty: member.name,
          subjectCode: chip.subjectCode,
          subjectName: chip.subjectName,
          section: chip.sectionName,
          days: chip.days || [],
          startTime: chip.startTime,
          endTime: chip.endTime,
          classType: chip.classType || 'lecture',
          room: chip.room,
          state: chip.state
        });
      });
    });

    // Earliest day first, then earliest start. An unscheduled assignment sorts
    // last rather than to the top, where it would read as a 00:00 class.
    return flat.sort((a, b) => {
      const dayA = Math.min(...(a.days.length ? a.days.map((d) => DAY_ORDER.indexOf(d)) : [99]));
      const dayB = Math.min(...(b.days.length ? b.days.map((d) => DAY_ORDER.indexOf(d)) : [99]));
      if (dayA !== dayB) return dayA - dayB;
      return String(a.startTime || '99').localeCompare(String(b.startTime || '99'));
    });
  }, [summary]);

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 flex flex-col items-center text-center">
        <CalendarRange className="h-8 w-8 text-slate-300 stroke-1 mb-2" />
        <p className="text-sm font-medium text-slate-600">Nothing loaded yet</p>
        <p className="text-xs text-slate-400 mt-0.5">
          Assignments appear here as they are added, in timetable order.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
      <div className="px-3.5 sm:px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-3">
        <h3 className="text-xs sm:text-sm font-bold text-slate-900 font-display">
          Loading summary
        </h3>
        <span className="text-[10px] font-mono text-slate-500 tabular-nums">
          {rows.length} assignment{rows.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Its own scroll container, so a wide timetable never makes the page
          scroll sideways. */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[11px] sm:text-xs">
          <thead className="bg-slate-50/60 text-slate-500">
            <tr>
              <th className="px-3 py-2 font-bold whitespace-nowrap">Faculty</th>
              <th className="px-3 py-2 font-bold whitespace-nowrap">Subject</th>
              <th className="px-3 py-2 font-bold whitespace-nowrap">Section</th>
              <th className="px-3 py-2 font-bold whitespace-nowrap">Day</th>
              <th className="px-3 py-2 font-bold whitespace-nowrap">Time</th>
              <th className="px-3 py-2 font-bold whitespace-nowrap">Type</th>
              <th className="px-3 py-2 font-bold whitespace-nowrap">Room</th>
              <th className="px-3 py-2 font-bold whitespace-nowrap">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.key} className="hover:bg-slate-50/60">
                <td className="px-3 py-2 text-slate-800 whitespace-nowrap">{row.faculty}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className="font-mono text-slate-900">{row.subjectCode}</span>
                </td>
                <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">{row.section}</td>
                <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">
                  {formatDays(row.days) || '—'}
                </td>
                <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap tabular-nums">
                  {formatTimeRange(row.startTime, row.endTime) || '—'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={
                    row.classType === 'laboratory'
                      ? 'text-[10px] font-bold px-1.5 py-0.5 rounded bg-sage-50 text-sage-700 border border-sage-200'
                      : 'text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200'
                  }>
                    {row.classType === 'laboratory' ? 'Lab' : 'Lecture'}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-slate-600 whitespace-nowrap">
                  {row.room || <span className="text-slate-300">—</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <span className={
                    row.state === 'Draft'
                      ? 'text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200'
                      : 'text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200'
                  }>
                    {row.state}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
