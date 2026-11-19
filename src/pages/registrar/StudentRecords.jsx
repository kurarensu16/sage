import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { GraduationCap, Search, ChevronRight, UserSearch } from 'lucide-react';
import { fetchRecordsCatalog, fetchStudentDirectory, fullName } from '../../lib/registrarRecordsService';
import { UNCLASSIFIED } from '../../lib/sectionNaming';
import { toUserMessage } from '../../lib/errorMessages';
import { FilterSelect, ErrorBanner, InfoNote, EmptyState, Chip } from '../../components/registrar/RecordsUi';

// Registrar › Student Records (list).
//
// Read-only. Find a student by name or ID, narrow by College -> Program ->
// Year Level, and open their record: enrolled subjects per term and grade
// history across terms. Program comes from the student's home section name
// (sections has no program column); students without a home section are
// Irregular and their program reads as Unclassified.

const SHOW_LIMIT = 200;
const ALL = 'all';

export default function StudentRecords() {
  const [params, setParams] = useSearchParams();
  const [catalog, setCatalog] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const college = params.get('college') || ALL;
  const program = params.get('program') || ALL;
  const year = params.get('year') || ALL;
  const standing = params.get('standing') || ALL;
  const search = params.get('q') || '';

  // Filters live in the URL so Back from a student's record returns to the
  // same filtered list.
  const setFilter = (key, value, resets = []) => {
    const next = new URLSearchParams(params);
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    resets.forEach((k) => next.delete(k));
    setParams(next, { replace: true });
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const cat = await fetchRecordsCatalog();
        setCatalog(cat);
        setStudents(await fetchStudentDirectory(cat.programsByAbbr));
      } catch (err) {
        setError(toUserMessage(err, 'Could not load student records.'));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const collegeName = useMemo(
    () => new Map((catalog?.colleges || []).map((c) => [c.department_id, c.name])),
    [catalog]
  );

  const collegeOptions = useMemo(
    () => [{ value: ALL, label: 'All colleges' }, ...(catalog?.colleges || []).map((c) => ({ value: c.department_id, label: c.name }))],
    [catalog]
  );

  const programOptions = useMemo(() => {
    const list = (catalog?.programs || []).filter((p) => college === ALL || p.department_id === college);
    return [
      { value: ALL, label: 'All programs' },
      ...list.map((p) => ({ value: p.program_id, label: p.abbreviation ? `${p.abbreviation} — ${p.name}` : p.name })),
      { value: UNCLASSIFIED, label: 'Unclassified (no home section)' }
    ];
  }, [catalog, college]);

  // Year levels as stored on the accounts, not a fixed list.
  const yearOptions = useMemo(() => {
    const values = [...new Set(students.map((s) => s.year_level).filter(Boolean))].sort();
    return [
      { value: ALL, label: 'All year levels' },
      ...values.map((v) => ({ value: v, label: v })),
      { value: UNCLASSIFIED, label: 'No year level' }
    ];
  }, [students]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return students.filter((s) => {
      if (college !== ALL && s.department_id !== college) return false;
      if (program !== ALL && s.programId !== program) return false;
      if (year !== ALL) {
        if (year === UNCLASSIFIED ? Boolean(s.year_level) : s.year_level !== year) return false;
      }
      if (standing !== ALL && s.standing !== standing) return false;
      if (!term) return true;
      return (
        fullName(s).toLowerCase().includes(term) ||
        (s.user_number || '').toLowerCase().includes(term) ||
        (s.email || '').toLowerCase().includes(term)
      );
    });
  }, [students, college, program, year, standing, search]);

  return (
    <>
      <PageHeader title="Student Records" breadcrumb="Registrar Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-5">
        <InfoNote>
          Read-only. Open a student to see their enrolled subjects for any term and their grade history.
          Grades are changed only through <strong>Grade Override</strong> or <strong>Late Grade Changes</strong>.
        </InfoNote>

        <ErrorBanner message={error} />

        <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-2xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
            <FilterSelect
              label="College"
              value={college}
              onChange={(v) => setFilter('college', v, ['program'])}
              options={collegeOptions}
            />
            <FilterSelect label="Program" value={program} onChange={(v) => setFilter('program', v)} options={programOptions} />
            <FilterSelect label="Year Level" value={year} onChange={(v) => setFilter('year', v)} options={yearOptions} />
            <FilterSelect
              label="Standing"
              value={standing}
              onChange={(v) => setFilter('standing', v)}
              options={[
                { value: ALL, label: 'Regular and irregular' },
                { value: 'Regular', label: 'Regular (has a home section)' },
                { value: 'Irregular', label: 'Irregular (no home section)' }
              ]}
            />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setFilter('q', e.target.value)}
              placeholder="Search name, ID number, or email"
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400"
            />
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-slate-400">Loading students…</p>
        ) : filtered.length === 0 ? (
          <EmptyState icon={UserSearch} title="No students match these filters" hint="Clear a filter or check the spelling of the name or ID." />
        ) : (
          <>
            <p className="text-[10px] sm:text-xs text-slate-400">
              Showing <span className="font-mono tabular-nums">{Math.min(filtered.length, SHOW_LIMIT).toLocaleString()}</span>
              {' '}of <span className="font-mono tabular-nums">{filtered.length.toLocaleString()}</span> students
            </p>
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden divide-y divide-slate-100">
              {filtered.slice(0, SHOW_LIMIT).map((s) => (
                <Link
                  key={s.user_id}
                  to={`/registrar/studentrecords/${s.user_id}`}
                  className="p-3.5 sm:p-4 flex items-center gap-3 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="w-9 h-9 rounded-xl bg-sage-50 text-sage-700 flex items-center justify-center flex-shrink-0">
                    <GraduationCap className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-xs sm:text-sm font-semibold text-slate-900 truncate">{fullName(s)}</h3>
                      <Chip tone={s.standing === 'Regular' ? 'brand' : 'warn'}>{s.standing}</Chip>
                      {(s.status || 'active') !== 'active' && <Chip>{s.status}</Chip>}
                    </div>
                    <p className="text-[10px] sm:text-xs text-slate-500 truncate mt-0.5">
                      <span className="font-mono">{s.user_number || '—'}</span>
                      <span className="ml-2">{collegeName.get(s.department_id) || 'No college'}</span>
                    </p>
                    <p className="text-[10px] sm:text-xs text-slate-400 truncate mt-0.5">
                      {s.programLabel}
                      {s.year_level && <> · {s.year_level}</>}
                      {s.sectionName && <> · <span className="font-mono">{s.sectionName}</span></>}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
                </Link>
              ))}
            </div>
            {filtered.length > SHOW_LIMIT && (
              <p className="text-[10px] sm:text-xs text-slate-400">
                Showing the first {SHOW_LIMIT}. Narrow the filters or search to reach the rest.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
