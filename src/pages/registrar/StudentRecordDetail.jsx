import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ArrowLeft, BookOpen, FileText, Download, GraduationCap, CalendarX } from 'lucide-react';
import {
  fetchRecordsCatalog,
  fetchStudentProfile,
  fetchStudentEnrollments,
  fetchStudentGradeHistory,
  gradeHistoryExportRows,
  fullName
} from '../../lib/registrarRecordsService';
import { exportRegistrarReportToExcel } from '../../lib/registrarAnalyticsService';
import { formatTermLabel } from '../../lib/termStatus';
import { toUserMessage } from '../../lib/errorMessages';
import { cn } from '../../lib/utils';
import { FilterSelect, ErrorBanner, EmptyState, Chip, GradeCell, RemarkChip } from '../../components/registrar/RecordsUi';

// Registrar › Student Records › one student.
//
// Two read-only tabs:
//   Enrolled Subjects  the subjects the student is enrolled in for a chosen
//                      term, each with its section, instructor and schedule.
//   Grade History      every posted MR, TFR and SG, grouped by term, with the
//                      term GWA from the posted SGs (plain mean, the same figure
//                      the student's own Grade Report shows).

const TABS = [
  { id: 'subjects', label: 'Enrolled Subjects', icon: BookOpen },
  { id: 'grades', label: 'Grade History', icon: FileText }
];

export default function StudentRecordDetail() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'grades' ? 'grades' : 'subjects';

  const [catalog, setCatalog] = useState(null);
  const [student, setStudent] = useState(null);
  const [enrollments, setEnrollments] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [termId, setTermId] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      setNotFound(false);
      setTermId('');
      try {
        const cat = await fetchRecordsCatalog();
        const profile = await fetchStudentProfile(studentId, cat.programsByAbbr);
        if (cancelled) return;
        setCatalog(cat);
        if (!profile) {
          setNotFound(true);
          return;
        }
        setStudent(profile);
        const [rows, grades] = await Promise.all([
          fetchStudentEnrollments(studentId, cat.terms),
          fetchStudentGradeHistory(studentId, cat.terms)
        ]);
        if (cancelled) return;
        setEnrollments(rows);
        setHistory(grades);
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err, 'Could not load this student record.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [studentId]);

  // Terms the student actually has subjects in, newest first, plus the active
  // term so "nothing enrolled this term" is something the registrar can see.
  const termOptions = useMemo(() => {
    if (!catalog) return [];
    const withRows = new Set(enrollments.map((r) => r.termId).filter(Boolean));
    const list = catalog.terms.filter((t) => withRows.has(t.term_id) || t.is_active);
    const options = list.map((t) => ({ value: t.term_id, label: `${formatTermLabel(t)}${t.is_active ? ' (current)' : ''}` }));
    if (enrollments.some((r) => !r.termId)) options.push({ value: 'unknown', label: 'Term not recorded' });
    return options;
  }, [catalog, enrollments]);

  useEffect(() => {
    if (termId || !termOptions.length) return;
    const active = catalog?.activeTerm?.term_id;
    setTermId(termOptions.some((o) => o.value === active) ? active : termOptions[0].value);
  }, [termOptions, termId, catalog]);

  const termRows = useMemo(
    () => enrollments.filter((r) => (termId === 'unknown' ? !r.termId : r.termId === termId)),
    [enrollments, termId]
  );
  const termUnits = useMemo(() => {
    // Lecture and laboratory rows of one subject carry the subject's units once.
    const seen = new Set();
    return termRows.reduce((sum, r) => {
      const key = `${r.subjectCode}:${r.sectionName}`;
      if (seen.has(key)) return sum;
      seen.add(key);
      return sum + (Number(r.units) || 0);
    }, 0);
  }, [termRows]);

  const exportHistory = () => {
    exportRegistrarReportToExcel({
      rows: gradeHistoryExportRows(student, history),
      sheetName: 'Grade History',
      fileLabel: `Grade_History_${student?.user_number || 'student'}`
    });
  };

  const setTab = (id) => {
    const next = new URLSearchParams(params);
    if (id === 'subjects') next.delete('tab');
    else next.set('tab', id);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader title="Student Record" breadcrumb="Registrar Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-5">
        {/* Back keeps the previous screen's filters, which live in its URL. */}
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/registrar/studentrecords'))}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-sage-700 hover:text-sage-800 cursor-pointer"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back
        </button>

        <ErrorBanner message={error} />

        {loading ? (
          <p className="text-xs text-slate-400">Loading student record…</p>
        ) : notFound ? (
          <EmptyState icon={GraduationCap} title="No student account with this ID" hint="The link may be out of date. Go back to the student list and search again." />
        ) : student && (
          <>
            {/* ── Header card ─────────────────────────────────────────────── */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-sage-50 text-sage-700 flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm sm:text-lg font-bold font-display text-slate-900">{fullName(student)}</h2>
                    <Chip tone={student.standing === 'Regular' ? 'brand' : 'warn'}>{student.standing}</Chip>
                    <Chip tone={(student.status || 'active') === 'active' ? 'good' : 'neutral'}>{student.status || 'active'}</Chip>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                    <span className="font-mono">{student.user_number || '—'}</span>
                    {student.email && <span className="ml-2">{student.email}</span>}
                  </p>
                </div>
              </div>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
                {[
                  ['College', student.collegeName || '—'],
                  ['Program', student.programLabel],
                  ['Year Level', student.year_level || '—'],
                  ['Home Section', student.sectionName || 'None (irregular)']
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</dt>
                    <dd className="text-xs sm:text-sm text-slate-800 truncate mt-0.5">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* ── Tabs ────────────────────────────────────────────────────── */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap cursor-pointer',
                    tab === id ? 'bg-sage-600 text-white' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {tab === 'subjects' ? (
              <EnrolledSubjects
                termOptions={termOptions}
                termId={termId}
                onTermChange={setTermId}
                rows={termRows}
                units={termUnits}
              />
            ) : (
              <GradeHistory history={history} onExport={exportHistory} />
            )}
          </>
        )}
      </div>
    </>
  );
}

function EnrolledSubjects({ termOptions, termId, onTermChange, rows, units }) {
  return (
    <div className="space-y-3">
      {termOptions.length > 0 && (
        <div className="sm:max-w-xs">
          <FilterSelect label="Term" value={termId} onChange={onTermChange} options={termOptions} />
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon={CalendarX}
          title={termOptions.length ? 'No subjects enrolled for this term' : 'This student has no enrolled subjects'}
          hint="Subjects appear here once the student is enrolled in a block section or added to a class roster."
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-100 text-[10px] sm:text-xs text-slate-500 flex items-center gap-3">
            <span><span className="font-mono tabular-nums">{rows.length}</span> class{rows.length === 1 ? '' : 'es'}</span>
            <span><span className="font-mono tabular-nums">{units}</span> units</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Units</th>
                  <th className="px-4 py-3">Section</th>
                  <th className="px-4 py-3">Instructor</th>
                  <th className="px-4 py-3">Schedule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-slate-50/70 align-top">
                    <td className="px-4 py-3">
                      <div className="text-xs sm:text-sm font-semibold text-slate-900 font-mono">{r.subjectCode}</div>
                      <div className="text-[11px] text-slate-500">{r.subjectName}</div>
                      <div className="flex gap-1 mt-1">
                        {r.classType && r.classType !== 'lecture' && <Chip>{r.classType}</Chip>}
                        {r.enrollmentType === 'Off-block' && <Chip tone="warn">Off-block</Chip>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono tabular-nums text-slate-700">{r.units ?? '—'}</td>
                    <td className="px-4 py-3 text-xs font-mono text-slate-700">{r.sectionName || '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-700">{r.instructor}</td>
                    <td className="px-4 py-3 text-xs text-slate-600">{r.schedule || <span className="text-slate-400">Not scheduled</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function GradeHistory({ history, onExport }) {
  if (history.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="No posted grades yet"
        hint="Grades appear here once an instructor posts a Midterm Rating, Tentative Final Rating, or Semestral Grade."
      />
    );
  }
  return (
    <div className="space-y-3.5">
      <div className="flex justify-end">
        <button
          onClick={onExport}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
        >
          <Download className="h-3.5 w-3.5" /> Export to Excel
        </button>
      </div>

      {history.map((term) => (
        <div key={term.termKey} className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-xs sm:text-sm font-bold font-display text-slate-900">{term.termLabel}</h3>
            <div className="flex items-center gap-2 text-[10px] sm:text-xs text-slate-500">
              <span>Term GWA</span>
              <span className="font-mono tabular-nums text-sm font-bold text-slate-900">
                {term.gwa !== null ? term.gwa.toFixed(2) : '—'}
              </span>
              <Chip tone={term.gwaIsComplete ? 'good' : 'warn'}>
                {term.gwaIsComplete ? 'Official' : `${term.sgCount}/${term.subjectCount} SG posted`}
              </Chip>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Units</th>
                  <th className="px-4 py-3">MR</th>
                  <th className="px-4 py-3">TFR</th>
                  <th className="px-4 py-3">SG</th>
                  <th className="px-4 py-3">Remark</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {term.subjects.map((s) => (
                  <tr key={s.classRecordId} className="hover:bg-slate-50/70 align-top">
                    <td className="px-4 py-3">
                      <Link
                        to={`/registrar/gradesheets/${s.classRecordId}`}
                        className="text-xs sm:text-sm font-semibold text-slate-900 font-mono hover:text-sage-700"
                      >
                        {s.subjectCode}
                      </Link>
                      <div className="text-[11px] text-slate-500">{s.subjectName}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        <span className="font-mono">{s.sectionName}</span>
                        {s.instructor && <> · {s.instructor}</>}
                      </div>
                      <div className="flex gap-1 mt-1">
                        {s.classType && s.classType !== 'lecture' && <Chip>{s.classType}</Chip>}
                        {s.corrected && <Chip tone="brand">Corrected</Chip>}
                        {s.sgApprovalStatus === 'submitted' && <Chip tone="brand">SG awaiting Dean</Chip>}
                        {s.sgApprovalStatus === 'returned' && <Chip tone="warn">SG returned</Chip>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs font-mono tabular-nums text-slate-700">{s.units ?? '—'}</td>
                    <td className="px-4 py-3"><GradeCell milestone={s.mr} /></td>
                    <td className="px-4 py-3"><GradeCell milestone={s.tfr} /></td>
                    <td className="px-4 py-3"><GradeCell milestone={s.sg} /></td>
                    <td className="px-4 py-3">
                      <RemarkChip milestone={s.sg} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
