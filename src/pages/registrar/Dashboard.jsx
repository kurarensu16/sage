import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import {
  Building2, Layers, BookMarked, Users, AlertTriangle, CheckCircle2,
  ArrowRight, Calendar, RefreshCw, BarChart3, CalendarCheck, ClipboardList
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { fetchRegistrarDashboard } from '../../lib/registrarAnalyticsService';
import { toUserMessage } from '../../lib/errorMessages';
import {
  EnrollmentByCollegeChart,
  TermReadinessChart,
  StructureByCollegeChart
} from '../../components/registrar/RegistrarCharts';

// Registrar landing page.
//
// This route must exist: every post-auth redirect in the app interpolates the
// role generically (`/${role}/dashboard` -- see Login.jsx, ForceChangePassword.jsx,
// NotFound.jsx, Forbidden.jsx), so without it a registrar login would bounce
// into NotFound and then back here, looping.
//
// Scope is records and structure, institution-wide. Student performance
// analytics stay with the Dean and faculty; system health stays with Admin.

function StatTile({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-2xs flex items-center gap-3">
      <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-sage-50 text-sage-700 flex items-center justify-center flex-shrink-0">
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </div>
      <div className="min-w-0">
        <span className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider block truncate">
          {label}
        </span>
        <span className="text-base sm:text-2xl font-bold font-display text-slate-900 leading-tight block truncate">
          {value}
        </span>
        {sub && <span className="text-[10px] text-slate-400 block truncate">{sub}</span>}
      </div>
    </div>
  );
}

function Panel({ title, subtitle, icon: Icon, children, action }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
      <div className="px-3.5 sm:px-5 py-3 sm:py-4 border-b border-slate-100 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          {Icon && (
            <div className="w-8 h-8 rounded-lg bg-sage-50 text-sage-700 flex items-center justify-center flex-shrink-0">
              <Icon className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold font-display text-slate-900 leading-tight">{title}</h2>
            {subtitle && <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="p-3.5 sm:p-5">{children}</div>
    </div>
  );
}

export default function RegistrarDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await fetchRegistrarDashboard());
    } catch (err) {
      setError(toUserMessage(err, 'Could not load registrar analytics.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const term = data?.term;
  const termLabel = term ? `${term.school_year} · ${term.semester}` : 'No active term';
  const outstanding = (data?.integrity || []).filter((item) => item.count > 0);

  return (
    <>
      <PageHeader title="Registrar Dashboard" breadcrumb="Registrar Portal">
        <button
          onClick={load}
          disabled={loading}
          className="px-3.5 sm:px-4 py-2 text-xs sm:text-sm font-medium bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl transition-all shadow-xs flex items-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap disabled:opacity-50"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-3.5 sm:space-y-6">
        {error && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl px-3.5 py-3 text-xs sm:text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── Stat tiles ──────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <StatTile icon={Calendar} label="Active Term" value={loading ? '—' : termLabel} />
          <StatTile
            icon={Users}
            label="Enrollments"
            value={loading ? '—' : data.enrollment.total.toLocaleString()}
            sub={loading ? '' : `${data.enrollment.irregular.toLocaleString()} irregular`}
          />
          <StatTile
            icon={Layers}
            label="Sections"
            value={loading ? '—' : data.structure.totals.sections.toLocaleString()}
            sub={loading ? '' : `${data.structure.totals.colleges} colleges`}
          />
          <StatTile
            icon={BookMarked}
            label="Subjects"
            value={loading ? '—' : data.structure.totals.subjects.toLocaleString()}
            sub={loading ? '' : `${data.structure.totals.templates} grading templates`}
          />
        </div>

        {/* ── 1. Records integrity: a work queue, not a statistic ─────────── */}
        {/* Written for a registrar, not a developer. "Records integrity" and
            "each linking to where it is resolved" describe the panel's
            implementation; what the reader needs to know is whether any of this
            is their problem today. Most of the time it is not -- these are
            states a term passes through -- so the heading says so plainly
            rather than implying a defect. */}
        <Panel
          title="Setup still to finish"
          subtitle="Normal for a term that is being set up. Open a row to see what is left."
          icon={AlertTriangle}
        >
          {loading ? (
            <p className="text-xs text-slate-400">Checking records…</p>
          ) : outstanding.length === 0 ? (
            <div className="flex items-center gap-2 text-xs sm:text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              No outstanding records issues found.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 -my-1">
              {outstanding.map((item) => (
                <li key={item.id}>
                  <Link
                    to={item.to}
                    className="flex items-center gap-3 py-2.5 group cursor-pointer"
                  >
                    <span className="font-mono text-sm sm:text-base font-bold text-amber-600 w-12 sm:w-14 flex-shrink-0 tabular-nums">
                      {item.count.toLocaleString()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs sm:text-sm font-medium text-slate-800 truncate">
                        {item.label}
                      </span>
                      <span className="block text-[10px] sm:text-xs text-slate-500">{item.hint}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-sage-600 transition-colors flex-shrink-0" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ── 2. Enrollment distribution ──────────────────────────────────── */}
        <Panel
          title="Enrollment by College"
          subtitle="Regular and irregular enrollments for the active term"
          icon={BarChart3}
        >
          {loading ? (
            <p className="text-xs text-slate-400">Loading enrollment…</p>
          ) : (
            <>
              <EnrollmentByCollegeChart perCollege={data.enrollment.perCollege} />
              {data.enrollment.topSections?.length > 0 && (
                <div className="mt-3.5 pt-3.5 border-t border-slate-100">
                  <p className="text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                    Largest sections
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.enrollment.topSections.map((row) => (
                      <span
                        key={`${row.college}-${row.section}`}
                        className="text-[10px] sm:text-xs bg-slate-50 border border-slate-200 text-slate-700 rounded-lg px-2 py-1"
                      >
                        {row.section}
                        <span className="font-mono font-semibold text-slate-900 ml-1.5">
                          {row.enrollments}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Panel>

        {/* ── 3. Term readiness ───────────────────────────────────────────── */}
        <Panel
          title="Term Readiness"
          subtitle="Share of classes per college with a Semestral Grade posted"
          icon={CalendarCheck}
          action={
            <Link
              to="/registrar/termmanagement"
              className="text-[11px] sm:text-xs font-medium text-sage-700 hover:text-sage-800 flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              Academic Terms <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {loading ? (
            <p className="text-xs text-slate-400">Loading term status…</p>
          ) : (
            <TermReadinessChart perCollege={data.readiness.perCollege} />
          )}
        </Panel>

        {/* ── 4. Academic structure ───────────────────────────────────────── */}
        <Panel
          title="Academic Structure"
          subtitle="Sections and programs per college"
          icon={Building2}
          action={
            <Link
              to="/registrar/reports"
              className="text-[11px] sm:text-xs font-medium text-sage-700 hover:text-sage-800 flex items-center gap-1 whitespace-nowrap cursor-pointer"
            >
              Reports <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {loading ? (
            <p className="text-xs text-slate-400">Loading structure…</p>
          ) : (
            <StructureByCollegeChart perCollege={data.structure.perCollege} />
          )}
        </Panel>

        {/* ── Shortcuts ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4">
          {[
            { to: '/registrar/subjectlist', label: 'Subjects', icon: BookMarked },
            { to: '/registrar/sectionlist', label: 'Manage Sections', icon: Layers },
            { to: '/registrar/sectionmasterlist', label: 'Section Rosters', icon: ClipboardList },
            { to: '/registrar/departmentslist', label: 'Colleges', icon: Building2 }
          ].map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 shadow-2xs flex items-center gap-2.5 hover:border-sage-300 transition-colors cursor-pointer group"
            >
              <link.icon className="h-4 w-4 text-sage-700 flex-shrink-0" />
              <span className="text-xs sm:text-sm font-medium text-slate-800 truncate">{link.label}</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-sage-600 ml-auto flex-shrink-0 transition-colors" />
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
