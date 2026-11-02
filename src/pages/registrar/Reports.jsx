import { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import {
  FileSpreadsheet, Download, Users, ClipboardList, Building2,
  AlertCircle, AlertTriangle, Calendar, Loader2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  fetchActiveTerm,
  fetchEnrollmentReport,
  fetchSectionRosterReport,
  fetchAcademicStructureReport,
  fetchGradeOverrideLogReport,
  exportRegistrarReportToExcel
} from '../../lib/registrarAnalyticsService';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { toUserMessage } from '../../lib/errorMessages';
import { useAuth } from '../../lib/AuthContext';

// Registrar records reports.
//
// Records-oriented by design, so it does not overlap the Dean's performance
// reporting (dean/SummaryReports.jsx) or faculty class reports. The faculty-load
// export is deliberately absent: it belongs to the Faculty Loading &
// Provisioning page, and duplicating it here would give the same figure two
// sources of truth.

const REPORTS = [
  {
    id: 'enrollment',
    title: 'Enrollment Report',
    description:
      'Every enrollment in the active term by college and section, with the Regular or Irregular label derived the same way a faculty roster derives it.',
    icon: Users,
    sheetName: 'Enrollment',
    fileLabel: 'Enrollment_Report',
    termScoped: true,
    load: fetchEnrollmentReport
  },
  {
    id: 'rosters',
    title: 'Section Roster Masterlist',
    description:
      'Home-section rosters across every college for the active term — the exportable form of what Section Rosters shows on screen.',
    icon: ClipboardList,
    sheetName: 'Rosters',
    fileLabel: 'Section_Rosters',
    termScoped: true,
    load: fetchSectionRosterReport
  },
  {
    id: 'structure',
    title: 'Academic Structure Inventory',
    description:
      'Colleges, their programs, and every subject with its assigned grading template. Subjects with no template are flagged NOT ASSIGNED.',
    icon: Building2,
    sheetName: 'Structure',
    fileLabel: 'Academic_Structure',
    termScoped: true,
    load: fetchAcademicStructureReport
  },
  {
    id: 'overrides',
    title: 'Grade Override Log',
    description:
      'The 500 most recent applied grade corrections, with the before and after figures and who applied each one. A records action the Registrar owns.',
    icon: AlertCircle,
    sheetName: 'Override Log',
    fileLabel: 'Grade_Override_Log',
    termScoped: false,
    load: fetchGradeOverrideLogReport
  }
];

export default function RegistrarReports() {
  const { user, profile } = useAuth();
  const [term, setTerm] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [preview, setPreview] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        setTerm(await fetchActiveTerm());
      } catch (err) {
        setError(toUserMessage(err, 'Could not read the active term.'));
      }
    })();
  }, []);

  const runExport = async (report) => {
    setBusyId(report.id);
    setError('');
    try {
      const rows = report.termScoped ? await report.load(term) : await report.load();
      setPreview((prev) => ({ ...prev, [report.id]: rows.length }));

      if (!rows.length) {
        setError(`${report.title}: nothing to export for the current scope.`);
        return;
      }

      exportRegistrarReportToExcel({
        rows,
        sheetName: report.sheetName,
        fileLabel: report.fileLabel
      });

      // Exports leave the system, so they are an auditable act, same as the
      // existing admin/dean export paths (see admin/AuditLog.jsx:251).
      await logActivity(
        'File Export',
        `Exported ${report.title} (${rows.length} rows) for ${termLabel}.`,
        resolveActorName(profile, user)
      );
    } catch (err) {
      setError(toUserMessage(err, `Could not build ${report.title}.`));
    } finally {
      setBusyId(null);
    }
  };

  const termLabel = term ? `${term.school_year} · ${term.semester}` : 'No active term';

  return (
    <>
      <PageHeader title="Reports" breadcrumb="Registrar Portal" />

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-sage-50 text-sage-700 flex items-center justify-center flex-shrink-0">
            <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
          </div>
          <div className="min-w-0">
            <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block">
              Active Term
            </span>
            <span className="text-sm sm:text-lg font-bold font-display text-slate-900 leading-tight block truncate">
              {termLabel}
            </span>
          </div>
          <p className="text-[10px] sm:text-xs text-slate-400 ml-auto text-right hidden sm:block max-w-[16rem]">
            Term-scoped reports cover this term only. The override log is not term-scoped.
          </p>
        </div>

        {error && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 sm:gap-4">
          {REPORTS.map((report) => {
            const busy = busyId === report.id;
            const rowCount = preview[report.id];
            return (
              <div
                key={report.id}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-3.5 sm:p-5 flex flex-col"
              >
                <div className="flex items-start gap-2.5 mb-2">
                  <div className="w-8 h-8 rounded-lg bg-sage-50 text-sage-700 flex items-center justify-center flex-shrink-0">
                    <report.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-base font-semibold font-display text-slate-900 leading-tight">
                      {report.title}
                    </h2>
                    {!report.termScoped && (
                      <span className="text-[10px] text-slate-400">All terms</span>
                    )}
                  </div>
                </div>

                <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed flex-1">
                  {report.description}
                </p>

                <div className="mt-3.5 pt-3 border-t border-slate-100 flex items-center gap-2">
                  <button
                    onClick={() => runExport(report)}
                    disabled={busy || (report.termScoped && !term)}
                    className="px-3.5 py-2 text-xs sm:text-sm font-medium bg-sage-600 hover:bg-sage-700 text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    {busy ? 'Building…' : 'Export .xlsx'}
                  </button>

                  {report.termScoped && !term && (
                    <span className="text-[10px] sm:text-xs text-slate-400">
                      Needs an active term
                    </span>
                  )}
                  {typeof rowCount === 'number' && (
                    <span
                      className={cn(
                        'text-[10px] sm:text-xs font-mono tabular-nums ml-auto',
                        rowCount > 0 ? 'text-slate-500' : 'text-amber-600'
                      )}
                    >
                      {rowCount.toLocaleString()} rows
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-[10px] sm:text-xs text-slate-400 flex items-start gap-1.5">
          <FileSpreadsheet className="h-3.5 w-3.5 mt-px flex-shrink-0" />
          Faculty teaching loads are exported from Faculty Loading &amp; Provisioning, not here, so
          that figure keeps a single source of truth.
        </p>
      </div>
    </>
  );
}
