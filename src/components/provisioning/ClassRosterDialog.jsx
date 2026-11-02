import { useState, useEffect, useCallback } from 'react';
import { Search, UserPlus, X, AlertTriangle, Loader2, Users } from 'lucide-react';
import {
  fetchClassRoster, searchStudents, addStudentToClass
} from '../../lib/facultyLoadingService';
import { toUserMessage } from '../../lib/errorMessages';
import { cn } from '../../lib/utils';

// Place a student directly onto a class roster.
//
// Additive only: the join-code path a regular student uses is untouched, and
// Faculty still approve those in Enrollment Requests. This covers what that flow
// was never meant to -- an off-block elective, or a block student taking one
// extra subject -- with no code and no approval step.
//
// Regular vs Irregular is never stored. It is derived by comparing the student's
// home section to the class's, so a row added here is labelled correctly
// everywhere the moment it exists.

export default function ClassRosterDialog({ chip, onClose }) {
  const [roster, setRoster] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Set when the server reported a timetable clash; adding again confirms it.
  const [clash, setClash] = useState(null);

  const classRecordId = chip?.draft?.class_record_id || chip?.id;

  const loadRoster = useCallback(async () => {
    setLoading(true);
    try {
      setRoster(await fetchClassRoster(classRecordId));
    } catch (err) {
      setError(toUserMessage(err, 'Could not load this roster.'));
    } finally {
      setLoading(false);
    }
  }, [classRecordId]);

  useEffect(() => {
    loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchStudents(query);
        if (!cancelled) setResults(found);
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err, 'Could not search students.'));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query]);

  const add = async (student, force = false) => {
    setBusyId(student.user_id);
    setError('');
    setNotice('');
    try {
      await addStudentToClass(classRecordId, student.user_id, { force });
      setClash(null);
      setQuery('');
      setResults([]);
      await loadRoster();
      setNotice(`${student.last_name}, ${student.first_name} added.`);
    } catch (err) {
      const message = toUserMessage(err, 'Could not add that student.');
      // A timetable overlap is reported once and then confirmable, because an
      // irregular student's schedule is exactly where a registrar may know
      // better than the data does.
      if (/overlaps this class/i.test(message)) setClash({ student, message });
      else setError(message);
    } finally {
      setBusyId(null);
    }
  };

  const alreadyIn = new Set(roster.map((r) => r.studentId));

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-lg w-full max-h-[85vh] flex flex-col">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold font-display text-slate-900 truncate">{chip?.label}</h3>
            <p className="text-[11px] text-slate-500">
              {roster.length} enrolled
              {chip?.schedule && <> · <span className="font-mono">{chip.schedule}</span></>}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-3.5 overflow-y-auto">
          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3 py-2.5 text-xs flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl px-3 py-2.5 text-xs">
              {notice}
            </div>
          )}

          {clash && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-900 space-y-2">
              <p className="flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>{clash.message}</span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => add(clash.student, true)}
                  disabled={busyId === clash.student.user_id}
                  className="px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg cursor-pointer disabled:opacity-50"
                >
                  Add anyway
                </button>
                <button
                  onClick={() => setClash(null)}
                  className="px-3 py-1.5 text-xs font-medium bg-white border border-amber-200 text-amber-800 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Search and add */}
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search a student by name or number"
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              No join code and no faculty approval — this places the student directly.
            </p>

            {searching && <p className="text-[11px] text-slate-400 mt-2">Searching…</p>}

            {results.length > 0 && (
              <div className="mt-2 border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-44 overflow-y-auto">
                {results.map((s) => {
                  const inClass = alreadyIn.has(s.user_id);
                  return (
                    <div key={s.user_id} className="px-3 py-2 flex items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-slate-900 truncate">
                          {s.last_name}, {s.first_name}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono truncate">{s.user_number}</p>
                      </div>
                      <button
                        onClick={() => add(s)}
                        disabled={inClass || busyId === s.user_id}
                        className="px-2.5 py-1.5 text-[11px] font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                      >
                        {busyId === s.user_id
                          ? <Loader2 className="h-3 w-3 animate-spin" />
                          : <UserPlus className="h-3 w-3" />}
                        {inClass ? 'Enrolled' : 'Add'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Current roster */}
          <div>
            <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              Enrolled
            </h4>
            {loading ? (
              <p className="text-xs text-slate-400">Loading roster…</p>
            ) : roster.length === 0 ? (
              <div className="border border-slate-200 rounded-xl p-5 flex flex-col items-center text-center">
                <Users className="h-6 w-6 text-slate-300 stroke-1 mb-1.5" />
                <p className="text-xs text-slate-500">Nobody enrolled yet</p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-56 overflow-y-auto">
                {roster.map((r) => (
                  <div key={r.enrollmentId} className="px-3 py-2 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-slate-900 truncate">{r.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono truncate">{r.userNumber}</p>
                    </div>
                    <span
                      className={cn(
                        'text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0',
                        r.type === 'Regular'
                          ? 'text-slate-600 bg-slate-50 border-slate-200'
                          : 'text-indigo-700 bg-indigo-50 border-indigo-200'
                      )}
                    >
                      {r.type}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
