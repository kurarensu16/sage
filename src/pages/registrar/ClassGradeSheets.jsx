import { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, ChevronRight, Table2, BookOpen } from 'lucide-react';
import { fetchRecordsCatalog, fetchTermClasses } from '../../lib/registrarRecordsService';
import { UNCLASSIFIED, YEAR_LEVEL_BY_DIGIT } from '../../lib/sectionNaming';
import { formatTermLabel } from '../../lib/termStatus';
import { toUserMessage } from '../../lib/errorMessages';
import { FilterSelect, ErrorBanner, InfoNote, EmptyState, Chip } from '../../components/registrar/RecordsUi';

// Registrar › Class Grade Sheets (list).
//
// Read-only. Pick a term, then narrow College -> Program -> Year Level ->
// Section to reach a class and open its grade sheet. College is the section's
// department_id; program and year are read from the section name and matched to
// programs.abbreviation (sectionNaming.js). Sections whose name cannot be read
// are kept under "Unclassified" so no class disappears from the list.

const SHOW_LIMIT = 300;
const ALL = 'all';

// Since 2026-11-18 an SG is official only once the Dean approves it, so the
// chip reports the Dean's approval first and falls back to posting progress.
function sgChip(c) {
  if (c.approvalStatus === 'approved') return { tone: 'good', label: 'SG approved' };
  if (c.approvalStatus === 'submitted') return { tone: 'brand', label: 'Awaiting Dean' };
  if (c.approvalStatus === 'returned') return { tone: 'warn', label: 'Returned to faculty' };
  if (c.sgPosted === 0) return { tone: 'neutral', label: 'No SG yet' };
  return c.sgState === 'complete' ? { tone: 'good', label: 'SG posted' } : { tone: 'warn', label: 'SG partial' };
}

function matchesSgFilter(c, filter) {
  if (filter === 'approved') return c.approvalStatus === 'approved';
  if (filter === 'awaiting') return c.approvalStatus === 'submitted';
  if (filter === 'returned') return c.approvalStatus === 'returned';
  if (filter === 'none') return c.sgPosted === 0;
  return true;
}

export default function ClassGradeSheets() {
  const [params, setParams] = useSearchParams();
  const [catalog, setCatalog] = useState(null);
  const [classes, setClasses] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [loadingClasses, setLoadingClasses] = useState(false);
  const [error, setError] = useState('');

  const termParam = params.get('term') || '';
  const college = params.get('college') || ALL;
  const program = params.get('program') || ALL;
  const year = params.get('year') || ALL;
  const section = params.get('section') || ALL;
  const sg = params.get('sg') || ALL;
  const search = params.get('q') || '';

  // Filters live in the URL so Back from a grade sheet returns to the same list.
  const setFilter = (key, value, resets = []) => {
    const next = new URLSearchParams(params);
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    resets.forEach((k) => next.delete(k));
    setParams(next, { replace: true });
  };

  useEffect(() => {
    (async () => {
      setLoadingCatalog(true);
      try {
        setCatalog(await fetchRecordsCatalog());
      } catch (err) {
        setError(toUserMessage(err, 'Could not load the term and college lists.'));
      } finally {
        setLoadingCatalog(false);
      }
    })();
  }, []);

  const term = useMemo(() => {
    if (!catalog) return null;
    return catalog.terms.find((t) => t.term_id === termParam) || catalog.activeTerm || catalog.terms[0] || null;
  }, [catalog, termParam]);

  useEffect(() => {
    if (!term || !catalog) return;
    let cancelled = false;
    (async () => {
      setLoadingClasses(true);
      setError('');
      try {
        const rows = await fetchTermClasses(term, catalog.programsByAbbr);
        if (!cancelled) setClasses(rows);
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err, 'Could not load the classes for this term.'));
      } finally {
        if (!cancelled) setLoadingClasses(false);
      }
    })();
    return () => { cancelled = true; };
  }, [term, catalog]);

  const collegeName = useMemo(
    () => new Map((catalog?.colleges || []).map((c) => [c.department_id, c.name])),
    [catalog]
  );

  const termOptions = useMemo(
    () => (catalog?.terms || []).map((t) => ({ value: t.term_id, label: `${formatTermLabel(t)}${t.is_active ? ' (current)' : ''}` })),
    [catalog]
  );

  const collegeOptions = useMemo(
    () => [{ value: ALL, label: 'All colleges' }, ...(catalog?.colleges || []).map((c) => ({ value: c.department_id, label: c.name }))],
    [catalog]
  );

  // Each cascade level offers only what exists under the level above it.
  const inCollege = useMemo(
    () => classes.filter((c) => college === ALL || c.collegeId === college),
    [classes, college]
  );
  const programOptions = useMemo(() => {
    const present = new Map();
    for (const c of inCollege) present.set(c.programId, c.programLabel);
    const named = (catalog?.programs || [])
      .filter((p) => present.has(p.program_id))
      .map((p) => ({ value: p.program_id, label: p.abbreviation ? `${p.abbreviation} — ${p.name}` : p.name }));
    return [
      { value: ALL, label: 'All programs' },
      ...named,
      ...(present.has(UNCLASSIFIED) ? [{ value: UNCLASSIFIED, label: 'Unclassified' }] : [])
    ];
  }, [inCollege, catalog]);

  const inProgram = useMemo(
    () => inCollege.filter((c) => program === ALL || c.programId === program),
    [inCollege, program]
  );
  const yearOptions = useMemo(() => {
    const digits = [...new Set(inProgram.map((c) => c.yearDigit))].sort();
    return [
      { value: ALL, label: 'All year levels' },
      ...digits.filter((d) => d !== UNCLASSIFIED).map((d) => ({ value: d, label: YEAR_LEVEL_BY_DIGIT[d] || `Year ${d}` })),
      ...(digits.includes(UNCLASSIFIED) ? [{ value: UNCLASSIFIED, label: 'Unclassified' }] : [])
    ];
  }, [inProgram]);

  const inYear = useMemo(
    () => inProgram.filter((c) => year === ALL || c.yearDigit === year),
    [inProgram, year]
  );
  const sectionOptions = useMemo(() => {
    const names = new Map();
    for (const c of inYear) names.set(c.sectionId, c.sectionName);
    return [
      { value: ALL, label: 'All sections' },
      ...[...names.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({ value: id, label: name || 'Unnamed section' }))
    ];
  }, [inYear]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inYear.filter((c) => {
      if (section !== ALL && c.sectionId !== section) return false;
      if (sg !== ALL && !matchesSgFilter(c, sg)) return false;
      if (!q) return true;
      return (
        c.subjectCode.toLowerCase().includes(q) ||
        c.subjectName.toLowerCase().includes(q) ||
        c.instructor.toLowerCase().includes(q) ||
        c.sectionName.toLowerCase().includes(q)
      );
    });
  }, [inYear, section, sg, search]);

  const totals = useMemo(() => ({
    classes: filtered.length,
    approved: filtered.filter((c) => c.approvalStatus === 'approved').length,
    awaiting: filtered.filter((c) => c.approvalStatus === 'submitted').length
  }), [filtered]);

  const loading = loadingCatalog || loadingClasses;

  return (
    <>
      <PageHeader title="Class Grade Sheets" breadcrumb="Registrar Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-5">
        <InfoNote>
          Read-only. Each grade sheet shows the posted MR, TFR, and SG of every student in the class.
          An SG becomes official once the Dean approves it; you are notified when that happens.
          Program and year level are read from the section name.
        </InfoNote>

        <ErrorBanner message={error} />

        <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-2xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-3">
            <FilterSelect
              label="Term"
              value={term?.term_id || ''}
              onChange={(v) => setFilter('term', v, ['section'])}
              options={termOptions.length ? termOptions : [{ value: '', label: 'No terms defined' }]}
              disabled={!termOptions.length}
            />
            <FilterSelect
              label="College"
              value={college}
              onChange={(v) => setFilter('college', v, ['program', 'year', 'section'])}
              options={collegeOptions}
            />
            <FilterSelect
              label="Program"
              value={program}
              onChange={(v) => setFilter('program', v, ['year', 'section'])}
              options={programOptions}
            />
            <FilterSelect
              label="Year Level"
              value={year}
              onChange={(v) => setFilter('year', v, ['section'])}
              options={yearOptions}
            />
            <FilterSelect label="Section" value={section} onChange={(v) => setFilter('section', v)} options={sectionOptions} />
            <FilterSelect
              label="SG Status"
              value={sg}
              onChange={(v) => setFilter('sg', v)}
              options={[
                { value: ALL, label: 'Any SG status' },
                { value: 'approved', label: 'Approved by the Dean' },
                { value: 'awaiting', label: 'Awaiting the Dean' },
                { value: 'returned', label: 'Returned to faculty' },
                { value: 'none', label: 'No SG yet' }
              ]}
            />
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setFilter('q', e.target.value)}
              placeholder="Search subject, section, or instructor"
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-white border border-slate-200 rounded-xl outline-none focus:border-sage-400"
            />
          </div>
        </div>

        {loading ? (
          <p className="text-xs text-slate-400">Loading classes…</p>
        ) : !term ? (
          <EmptyState icon={BookOpen} title="No academic terms yet" hint="Define a term in Academic Terms first." />
        ) : filtered.length === 0 ? (
          <EmptyState icon={Table2} title="No classes match these filters" hint={`Term: ${formatTermLabel(term)}. Clear a filter or pick another term.`} />
        ) : (
          <>
            <p className="text-[10px] sm:text-xs text-slate-400">
              <span className="font-mono tabular-nums">{totals.classes.toLocaleString()}</span> classes ·{' '}
              <span className="font-mono tabular-nums">{totals.approved.toLocaleString()}</span> SG approved ·{' '}
              <span className="font-mono tabular-nums">{totals.awaiting.toLocaleString()}</span> awaiting the Dean
            </p>
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden divide-y divide-slate-100">
              {filtered.slice(0, SHOW_LIMIT).map((c) => {
                const chip = sgChip(c);
                return (
                  <Link
                    key={c.classRecordId}
                    to={`/registrar/gradesheets/${c.classRecordId}`}
                    className="p-3.5 sm:p-4 flex items-center gap-3 hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-xs sm:text-sm font-semibold text-slate-900 font-mono">{c.subjectCode}</h3>
                        <span className="text-xs sm:text-sm text-slate-700 truncate">{c.subjectName}</span>
                        {c.classType && c.classType !== 'lecture' && <Chip>{c.classType}</Chip>}
                        <Chip tone={chip.tone}>{chip.label}</Chip>
                        {c.status === 'archived' && <Chip>Archived</Chip>}
                      </div>
                      <p className="text-[10px] sm:text-xs text-slate-500 truncate mt-0.5">
                        <span className="font-mono">{c.sectionName || '—'}</span>
                        <span className="ml-2">{c.instructor}</span>
                      </p>
                      <p className="text-[10px] sm:text-xs text-slate-400 truncate mt-0.5">
                        {collegeName.get(c.collegeId) || 'No college'} · {c.programLabel} · {c.yearLabel} ·{' '}
                        <span className="font-mono tabular-nums">{c.sgPosted}/{c.enrolled}</span> SG
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
                  </Link>
                );
              })}
            </div>
            {filtered.length > SHOW_LIMIT && (
              <p className="text-[10px] sm:text-xs text-slate-400">
                Showing the first {SHOW_LIMIT}. Narrow the filters to reach the rest.
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}
