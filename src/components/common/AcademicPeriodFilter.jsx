import { useEffect, useMemo, useState } from 'react';
import { Archive, CalendarRange, LoaderCircle, LockKeyhole, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { getArchivedAcademicTerms } from '../../lib/termStatus';

export default function AcademicPeriodFilter({
  terms = [],
  archiveMode = false,
  appliedTerm = null,
  loading = false,
  error = '',
  onModeChange,
  onLoad,
  onRetry,
  className = ''
}) {
  const archivedTerms = useMemo(() => getArchivedAcademicTerms(terms), [terms]);
  const [draftSchoolYear, setDraftSchoolYear] = useState(appliedTerm?.school_year || '');
  const [draftSemester, setDraftSemester] = useState(appliedTerm?.semester || '');

  useEffect(() => {
    if (!archiveMode) {
      setDraftSchoolYear('');
      setDraftSemester('');
      return;
    }
    if (appliedTerm) {
      setDraftSchoolYear(appliedTerm.school_year || '');
      setDraftSemester(appliedTerm.semester || '');
    }
  }, [archiveMode, appliedTerm]);

  const schoolYears = useMemo(
    () => [...new Set(archivedTerms.map(term => term.school_year).filter(Boolean))],
    [archivedTerms]
  );
  const semesterTerms = draftSchoolYear
    ? archivedTerms.filter(term => term.school_year === draftSchoolYear)
    : [];
  const draftTerm = semesterTerms.find(term => term.semester === draftSemester) || null;
  const draftChanged = Boolean(appliedTerm) && draftTerm?.term_id !== appliedTerm.term_id;
  const canLoad = Boolean(draftTerm) && !loading;

  const showCurrent = () => {
    setDraftSchoolYear('');
    setDraftSemester('');
    onModeChange?.(false);
  };

  const showArchiveControls = () => {
    if (!archiveMode) {
      setDraftSchoolYear('');
      setDraftSemester('');
      onModeChange?.(true);
    }
  };

  const changeSchoolYear = (value) => {
    setDraftSchoolYear(value);
    setDraftSemester('');
  };

  return (
    <section className={cn('rounded-xl border border-slate-200 bg-white p-3 shadow-xs sm:p-4', className)}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xs font-bold text-slate-800 font-display">
            <CalendarRange className="h-4 w-4 text-sage-600" /> Academic Period
          </h2>
          <p className="mt-1 text-[11px] text-slate-500">
            Previous records load only after you choose a period and click Load Archive.
          </p>
        </div>

        <div className="flex w-full flex-col gap-2 xl:w-auto xl:flex-row xl:items-center">
          <div className="inline-flex self-start rounded-lg border border-slate-200 bg-slate-50 p-1">
            <button
              type="button"
              disabled={loading}
              onClick={showCurrent}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                !archiveMode ? 'bg-white text-sage-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              Current Term
            </button>
            <button
              type="button"
              disabled={loading || archivedTerms.length === 0}
              onClick={showArchiveControls}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                archiveMode ? 'bg-white text-sage-700 shadow-xs' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              <Archive className="h-3.5 w-3.5" /> Previous Terms
            </button>
          </div>

          {archiveMode && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(150px,1fr)_minmax(140px,1fr)_auto]">
              <select
                aria-label="Archive school year"
                value={draftSchoolYear}
                disabled={loading}
                onChange={event => changeSchoolYear(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sage-500 disabled:bg-slate-100"
              >
                <option value="">Select school year</option>
                {schoolYears.map(year => <option key={year} value={year}>A.Y. {year}</option>)}
              </select>
              <select
                aria-label="Archive semester"
                value={draftSemester}
                disabled={loading || !draftSchoolYear}
                onChange={event => setDraftSemester(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-sage-500 disabled:bg-slate-100"
              >
                <option value="">Select semester</option>
                {semesterTerms.map(term => (
                  <option key={term.term_id} value={term.semester}>{term.semester} Semester</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!canLoad}
                onClick={() => onLoad?.(draftTerm)}
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-sage-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-sage-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Archive className="h-3.5 w-3.5" />}
                {loading ? 'Loading…' : 'Load Archive'}
              </button>
            </div>
          )}
        </div>
      </div>

      {archiveMode && loading && (
        <div role="status" className="mt-3 flex items-center gap-2 rounded-lg border border-sage-200 bg-sage-50 px-3 py-2 text-[11px] font-semibold text-sage-800">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Loading archived records…
        </div>
      )}
      {archiveMode && !loading && appliedTerm && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
          <LockKeyhole className="h-3.5 w-3.5 shrink-0" />
          Read-only archive: A.Y. {appliedTerm.school_year} · {appliedTerm.semester} Semester
        </div>
      )}
      {archiveMode && !loading && draftChanged && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          Period changed—click Load Archive to apply. Displayed results still belong to A.Y. {appliedTerm.school_year} · {appliedTerm.semester} Semester.
        </div>
      )}
      {archiveMode && !loading && !appliedTerm && (
        <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
          Select a school year and semester, then click Load Archive. No historical query has run yet.
        </div>
      )}
      {archiveMode && !loading && error && (
        <div role="alert" className="mt-3 flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => onRetry?.(draftTerm)} className="inline-flex items-center gap-1 font-bold hover:text-rose-900">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}
    </section>
  );
}
