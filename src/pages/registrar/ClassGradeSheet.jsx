import { useState, useEffect } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { ArrowLeft, Download, Printer, Table2, Users } from 'lucide-react';
import { fetchRecordsCatalog, fetchClassGradeSheet, gradeSheetExportRows } from '../../lib/registrarRecordsService';
import { exportRegistrarReportToExcel } from '../../lib/registrarAnalyticsService';
import { toUserMessage } from '../../lib/errorMessages';
import { ErrorBanner, EmptyState, Chip, GradeCell, RemarkChip } from '../../components/registrar/RecordsUi';

// Registrar › Class Grade Sheets › one class.
//
// Read-only. The roster of one class with each student's posted MR, TFR and
// SG, the grade (1.00-5.00) over the percentage, and the SG remark. A student
// whose official grade was later corrected (Dean-approved correction or
// Registrar override) is flagged "Corrected". Export to Excel and print.

// The Dean's approval of the SG (2026-11-18). Only an approved SG is official.
function describeApproval(approval) {
  if (!approval) return 'Not submitted';
  const when = approval.decidedAt
    ? new Date(approval.decidedAt).toLocaleDateString('en-PH', { dateStyle: 'medium' })
    : '';
  if (approval.status === 'approved') {
    return approval.approvedBeforeWorkflow
      ? 'Official (posted before Dean approval)'
      : `Approved ${when}${approval.decidedBy ? ` by ${approval.decidedBy}` : ''}`;
  }
  if (approval.status === 'returned') return `Returned to faculty ${when}`;
  return 'Awaiting the Dean';
}

const printGrade = (m) => (m && m.gwa !== null ? Number(m.gwa).toFixed(2) : '—');
const printRating = (m) => (m && m.rating !== null ? Number(m.rating).toFixed(2) : '');

// What the Print button prints: a plain, black-on-white grade sheet.
function PrintableGradeSheet({ sheet }) {
  const cell = 'border border-slate-400 px-2 py-1';
  return (
    <div id="print-container" className="hidden print:block p-6 bg-white text-slate-900 font-sans text-xs">
      <div className="text-center mb-4">
        <p className="text-sm font-bold uppercase tracking-wide">Class Grade Sheet</p>
        <p className="text-[11px]">{sheet.termLabel}</p>
      </div>

      <table className="w-full mb-4 text-[11px]">
        <tbody>
          <tr>
            <td className="py-0.5 pr-2 font-semibold w-28">Subject</td>
            <td className="py-0.5">{sheet.subjectCode} — {sheet.subjectName}{sheet.units != null ? ` (${sheet.units} units)` : ''}</td>
            <td className="py-0.5 pr-2 font-semibold w-28">Section</td>
            <td className="py-0.5">{sheet.sectionName || '—'}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2 font-semibold">College</td>
            <td className="py-0.5">{sheet.collegeName || '—'}</td>
            <td className="py-0.5 pr-2 font-semibold">Program · Year</td>
            <td className="py-0.5">{sheet.programLabel} · {sheet.yearLabel}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-2 font-semibold">Instructor</td>
            <td className="py-0.5">{sheet.instructor}</td>
            <td className="py-0.5 pr-2 font-semibold">SG approval</td>
            <td className="py-0.5">{describeApproval(sheet.approval)}</td>
          </tr>
        </tbody>
      </table>

      <table className="w-full border-collapse text-[11px]">
        <thead>
          <tr className="bg-slate-100">
            <th className={`${cell} w-8`}>#</th>
            <th className={`${cell} text-left`}>Student No.</th>
            <th className={`${cell} text-left`}>Name</th>
            <th className={cell}>MR</th>
            <th className={cell}>TFR</th>
            <th className={cell}>SG %</th>
            <th className={cell}>SG</th>
            <th className={cell}>Remark</th>
          </tr>
        </thead>
        <tbody>
          {sheet.roster.map((r, i) => (
            <tr key={r.studentId}>
              <td className={`${cell} text-center`}>{i + 1}</td>
              <td className={`${cell} font-mono`}>{r.userNumber || '—'}</td>
              <td className={cell}>{r.name}</td>
              <td className={`${cell} text-center font-mono`}>{printGrade(r.mr)}</td>
              <td className={`${cell} text-center font-mono`}>{printGrade(r.tfr)}</td>
              <td className={`${cell} text-center font-mono`}>{printRating(r.sg)}</td>
              <td className={`${cell} text-center font-mono font-semibold`}>{printGrade(r.sg)}</td>
              <td className={`${cell} text-center`}>{r.sg ? r.sg.remark : 'In progress'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-3 text-[10px] text-slate-600">
        Enrolled: {sheet.counts.enrolled} · Posted MR / TFR / SG: {sheet.counts.mr} / {sheet.counts.tfr} / {sheet.counts.sg}
        {' · '}Printed {new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
      </p>
    </div>
  );
}

export default function ClassGradeSheet() {
  const { classRecordId } = useParams();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      setNotFound(false);
      try {
        const cat = await fetchRecordsCatalog();
        const data = await fetchClassGradeSheet(classRecordId, cat.terms, cat.programsByAbbr);
        if (cancelled) return;
        if (!data) setNotFound(true);
        setSheet(data);
      } catch (err) {
        if (!cancelled) setError(toUserMessage(err, 'Could not load this grade sheet.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [classRecordId]);

  const exportSheet = () => {
    exportRegistrarReportToExcel({
      rows: gradeSheetExportRows(sheet),
      sheetName: `${sheet.subjectCode} ${sheet.sectionName}`.trim(),
      fileLabel: `Grade_Sheet_${sheet.subjectCode}_${sheet.sectionName}`.replace(/[^A-Za-z0-9_-]+/g, '_')
    });
  };

  return (
    <>
      <div className="print:hidden">
        <PageHeader title="Class Grade Sheet" breadcrumb="Registrar Portal" />
      </div>

      {/* Print-only sheet. The app's print stylesheet (src/index.css) hides
          everything except #print-container, so without this the page printed
          blank. Same pattern as the student Grade Report. */}
      {sheet && <PrintableGradeSheet sheet={sheet} />}

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-5 print:hidden">
        {/* Back keeps the list's filters, which live in its URL. */}
        <button
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/registrar/gradesheets'))}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-sage-700 hover:text-sage-800 cursor-pointer print:hidden"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to classes
        </button>

        <ErrorBanner message={error} />

        {loading ? (
          <p className="text-xs text-slate-400">Loading grade sheet…</p>
        ) : notFound ? (
          <EmptyState icon={Table2} title="No class with this ID" hint="The link may be out of date. Go back to Class Grade Sheets and pick the class again." />
        ) : sheet && (
          <>
            <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-2xs">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm sm:text-lg font-bold font-display text-slate-900 font-mono">{sheet.subjectCode}</h2>
                    <span className="text-sm sm:text-base text-slate-700">{sheet.subjectName}</span>
                    {sheet.classType && sheet.classType !== 'lecture' && <Chip>{sheet.classType}</Chip>}
                    {sheet.status === 'archived' && <Chip>Archived</Chip>}
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">{sheet.termLabel}</p>
                </div>
                <div className="flex items-center gap-2 print:hidden">
                  <button
                    onClick={exportSheet}
                    disabled={!sheet.roster.length}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Download className="h-3.5 w-3.5" /> Excel
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    <Printer className="h-3.5 w-3.5" /> Print
                  </button>
                </div>
              </div>
              <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100">
                {[
                  ['College', sheet.collegeName || '—'],
                  ['Program · Year', `${sheet.programLabel} · ${sheet.yearLabel}`],
                  ['Section', sheet.sectionName || '—'],
                  ['Instructor', sheet.instructor],
                  ['Units', sheet.units ?? '—'],
                  ['Schedule', sheet.schedule || 'Not scheduled'],
                  ['Enrolled', sheet.counts.enrolled],
                  ['Posted (MR / TFR / SG)', `${sheet.counts.mr} / ${sheet.counts.tfr} / ${sheet.counts.sg}`],
                  ['SG approval', describeApproval(sheet.approval)]
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{label}</dt>
                    <dd className="text-xs sm:text-sm text-slate-800 truncate mt-0.5">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>

            {sheet.roster.length === 0 ? (
              <EmptyState icon={Users} title="No students on this roster" hint="Students appear once they are enrolled in this class's section or added to its roster." />
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                        <th className="px-4 py-3 w-10">#</th>
                        <th className="px-4 py-3">Student</th>
                        <th className="px-4 py-3">MR</th>
                        <th className="px-4 py-3">TFR</th>
                        <th className="px-4 py-3">SG</th>
                        <th className="px-4 py-3">Remark</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sheet.roster.map((r, index) => (
                        <tr key={r.studentId} className="hover:bg-slate-50/70 align-top">
                          <td className="px-4 py-3 text-xs text-slate-400 font-mono">{index + 1}</td>
                          <td className="px-4 py-3">
                            {r.userNumber ? (
                              <Link
                                to={`/registrar/studentrecords/${r.studentId}?tab=grades`}
                                className="text-xs sm:text-sm font-medium text-slate-900 hover:text-sage-700"
                              >
                                {r.name}
                              </Link>
                            ) : (
                              <span className="text-xs sm:text-sm text-slate-500 italic">{r.name}</span>
                            )}
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              <span className="font-mono">{r.userNumber || '—'}</span>
                              {r.homeSection && <> · <span className="font-mono">{r.homeSection}</span></>}
                            </div>
                            <div className="flex gap-1 mt-1">
                              {r.enrollmentType === 'Off-block' && <Chip tone="warn">Off-block</Chip>}
                              {r.corrected && <Chip tone="brand">Corrected</Chip>}
                            </div>
                          </td>
                          <td className="px-4 py-3"><GradeCell milestone={r.mr} /></td>
                          <td className="px-4 py-3"><GradeCell milestone={r.tfr} /></td>
                          <td className="px-4 py-3"><GradeCell milestone={r.sg} /></td>
                          <td className="px-4 py-3">
                            <RemarkChip milestone={r.sg} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
