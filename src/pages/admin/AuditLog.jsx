import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Clock, Shield, RefreshCw, DownloadCloud } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';
import {
  formatAuditActionForDisplay,
  formatAuditEntityForDisplay,
  formatAuditMessageForDisplay,
} from '../../lib/auditLogPresentation';
import { logActivity, resolveActorName } from '../../lib/auditLog';
import { buildCsv } from '../../lib/csvExport';
import { formatPhilippineTimestamp, toPhilippineIsoTimestamp } from '../../lib/dateTime';

const ACTION_BADGE_MAP = {
  'Grade Override':            'bg-rose-50 text-rose-700 border-rose-200',
  'Applied Administrative Grade Override':'bg-rose-50 text-rose-700 border-rose-200',
  'Applied Semestral Grade Correction':'bg-blue-50 text-blue-700 border-blue-200',
  'Submitted SG Correction Request':'bg-amber-50 text-amber-700 border-amber-200',
  'Approved SG Correction Request':'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Rejected SG Correction Request':'bg-rose-50 text-rose-700 border-rose-200',
  'Posted Midterm Rating':     'bg-blue-50 text-blue-700 border-blue-200',
  'Updated Midterm Rating':    'bg-teal-50 text-teal-700 border-teal-200',
  'Posted Tentative Final Rating':'bg-blue-50 text-blue-700 border-blue-200',
  'Updated Tentative Final Rating':'bg-teal-50 text-teal-700 border-teal-200',
  'Posted Semestral Grade':    'bg-sage-50 text-sage-700 border-sage-200',
  'Score Batch Save':          'bg-teal-50 text-teal-700 border-teal-200',
  'Faculty Reassignment':      'bg-amber-50 text-amber-700 border-amber-200',
  'Classroom Archive':         'bg-slate-100 text-slate-600 border-slate-200',
  'Classroom Creation':        'bg-blue-50 text-blue-700 border-blue-200',
  'Classroom Provisioning':    'bg-blue-50 text-blue-700 border-blue-200',
  'User Creation':             'bg-emerald-50 text-emerald-700 border-emerald-200',
  'User Update':               'bg-teal-50 text-teal-700 border-teal-200',
  'User Status Change':        'bg-indigo-50 text-indigo-700 border-indigo-200',
  'User Deletion':             'bg-rose-100 text-rose-800 border-rose-300',
  'Batch User Import':         'bg-violet-50 text-violet-700 border-violet-200',
  'Section Creation':          'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Section Update':            'bg-cyan-50 text-cyan-600 border-cyan-100',
  'Subject Creation':          'bg-sky-50 text-sky-700 border-sky-200',
  'Subject Update':            'bg-sky-50 text-sky-600 border-sky-100',
  'Semester Transition':       'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Grading Template Creation': 'bg-teal-50 text-teal-700 border-teal-200',
  'Grading Template Update':   'bg-teal-50 text-teal-600 border-teal-100',
  'Grading Template Deletion': 'bg-rose-50 text-rose-700 border-rose-200',
  'Intervention Plan Generated':'bg-purple-50 text-purple-700 border-purple-200',
  'Risk Evaluation':           'bg-amber-50 text-amber-700 border-amber-200',
  'Join Code Generated':       'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Dean Remark Approval':      'bg-emerald-50 text-emerald-700 border-emerald-200',
  'APK Download':              'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Mobile App Distribution':   'bg-teal-50 text-teal-700 border-teal-200',
  'File Export':               'bg-sage-50 text-sage-700 border-sage-200',
};

const getActionBadgeColor = (action) =>
  ACTION_BADGE_MAP[action] || 'bg-slate-100 text-slate-600 border-slate-200';

const normalizeSource = (source) => source || 'application';

const SOURCE_PRESENTATION = {
  application: {
    label: 'Application',
    className: 'bg-sage-50 text-sage-700 border-sage-200',
  },
  database_trigger: {
    label: 'Database trigger',
    className: 'bg-violet-50 text-violet-700 border-violet-200',
  },
};

const getSourcePresentation = (source) => {
  const normalizedSource = normalizeSource(source);
  return SOURCE_PRESENTATION[normalizedSource] || {
    label: normalizedSource.replaceAll('_', ' '),
    className: 'bg-slate-100 text-slate-600 border-slate-200',
  };
};

const ITEMS_PER_PAGE = 50;
const EXPORT_PAGE_SIZE = 1000;

const getManilaDateBounds = (dateKey) => {
  if (!dateKey) return null;
  const start = new Date(`${dateKey}T00:00:00+08:00`);
  const nextDay = new Date(start);
  nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  return { start: start.toISOString(), end: nextDay.toISOString() };
};

const getSearchClause = (searchTerm) => {
  const term = searchTerm.trim().replace(/[(),]/g, ' ');
  if (!term) return '';
  const pattern = `*${term.replaceAll('*', '')}*`;
  const sourcePattern = `*${term.replaceAll('*', '').replaceAll(' ', '_')}*`;
  return [
    `message.ilike.${pattern}`,
    `actor.ilike.${pattern}`,
    `actor_role.ilike.${pattern}`,
    `entity_type.ilike.${pattern}`,
    `entity_id.ilike.${pattern}`,
    `source.ilike.${sourcePattern}`,
  ].join(',');
};

const applyLogFilters = (query, { searchTerm, actionFilter, sourceFilter, dateFilter }) => {
  const searchClause = getSearchClause(searchTerm);
  if (searchClause) query = query.or(searchClause);
  if (actionFilter) query = query.eq('action', actionFilter);
  if (sourceFilter) query = query.eq('source', sourceFilter);
  const dateBounds = getManilaDateBounds(dateFilter);
  if (dateBounds) query = query.gte('timestamp', dateBounds.start).lt('timestamp', dateBounds.end);
  return query;
};

export default function AuditLog() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const [logs, setLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [sourceFilter, setSourceFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState({
    total_records: 0,
    today_actions: 0,
    unique_actors: 0,
    action_types: 0,
    actions: [],
    sources: [],
  });
  const requestSequence = useRef(0);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const actionParam = params.get('action');
    const searchParam = params.get('search');
    if (actionParam) setActionFilter(actionParam);
    if (searchParam) setSearchTerm(searchParam);
  }, [location.search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, actionFilter, sourceFilter, dateFilter]);

  const loadSummary = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_activity_log_overview');
    if (error) throw error;
    setSummary(data?.[0] || {
      total_records: 0,
      today_actions: 0,
      unique_actors: 0,
      action_types: 0,
      actions: [],
      sources: [],
    });
  }, []);

  const loadLogs = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setErrorMsg('');
    setIsLoading(true);
    try {
      const filters = { searchTerm, actionFilter, sourceFilter, dateFilter };
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const [logsResult] = await Promise.all([
        applyLogFilters(
          supabase
            .from('activity_logs')
            .select('*', { count: 'exact' })
            .order('timestamp', { ascending: false })
            .order('log_id', { ascending: false }),
          filters,
        ).range(from, from + ITEMS_PER_PAGE - 1),
        loadSummary(),
      ]);

      if (logsResult.error) throw logsResult.error;
      if (requestId !== requestSequence.current) return;
      setLogs(logsResult.data || []);
      setTotalCount(logsResult.count || 0);
    } catch (err) {
      if (requestId !== requestSequence.current) return;
      console.error('Failed to load activity logs:', err);
      setErrorMsg('Failed to load system audit logs: ' + err.message);
    } finally {
      if (requestId === requestSequence.current) setIsLoading(false);
    }
  }, [actionFilter, currentPage, dateFilter, loadSummary, searchTerm, sourceFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadLogs(); }, searchTerm.trim() ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [loadLogs, searchTerm]);

  const uniqueActions = summary.actions || [];
  const uniqueSources = summary.sources || [];
  // Kept as aliases for the existing range label below; the rows themselves now
  // come directly from the current server-side page.
  const itemsPerPage = ITEMS_PER_PAGE;
  const filteredLogs = { length: totalCount };
  const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

  const handleExportCSV = async () => {
    if (totalCount === 0 || isExporting) return;
    setIsExporting(true);
    setErrorMsg('');
    try {
      const allMatchingLogs = [];
      const filters = { searchTerm, actionFilter, sourceFilter, dateFilter };
      for (let from = 0; ; from += EXPORT_PAGE_SIZE) {
        const { data, error } = await applyLogFilters(
          supabase
            .from('activity_logs')
            .select('*')
            .order('timestamp', { ascending: false })
            .order('log_id', { ascending: false }),
          filters,
        ).range(from, from + EXPORT_PAGE_SIZE - 1);
        if (error) throw error;
        allMatchingLogs.push(...(data || []));
        if (!data || data.length < EXPORT_PAGE_SIZE) break;
      }

      const header = ['Log ID', 'Action', 'Operation', 'Actor', 'Actor ID', 'Role', 'Entity', 'Entity ID', 'Source', 'Message', 'Timestamp (PHT UTC+8)'];
      const rows = allMatchingLogs.map(l => [
        l.log_id,
        l.action,
        l.operation,
        l.actor,
        l.actor_id,
        l.actor_role,
        l.entity_type,
        l.entity_id,
        normalizeSource(l.source),
        l.message,
        toPhilippineIsoTimestamp(l.timestamp),
      ]);
      const csv = buildCsv([header, ...rows]);
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `sage_audit_logs_${new Date().toISOString().slice(0,10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      void logActivity('File Export', `Exported ${allMatchingLogs.length} filtered audit-log records to CSV.`, resolveActorName(profile, user));
    } catch (err) {
      console.error('Failed to export activity logs:', err);
      setErrorMsg('Failed to export system audit logs: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <PageHeader title="System Audit Logs" breadcrumb="Admin Portal">
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={totalCount === 0 || isExporting}
            className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors bg-white flex items-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <DownloadCloud className="h-4 w-4 text-slate-500" /> {isExporting ? 'Exporting...' : 'Export CSV'}
          </button>
          <button
            onClick={loadLogs}
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors bg-white flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 text-slate-500 ${isLoading ? 'animate-spin' : ''}`} />
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </PageHeader>

      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6">

        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-700 p-3 sm:p-4 rounded-xl text-xs sm:text-sm font-semibold">
            {errorMsg}
          </div>
        )}

        {/* Summary Stats Row - 2x2 on Mobile */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {[
            { label: 'Total Records', value: summary.total_records, color: 'text-slate-900' },
            { label: 'Today\'s Actions', value: summary.today_actions, color: 'text-sage-700' },
            { label: 'Unique Actors', value: summary.unique_actors, color: 'text-blue-700' },
            { label: 'Action Types', value: summary.action_types, color: 'text-violet-700' },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-3.5 sm:p-4">
              <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-wide truncate">{stat.label}</p>
              <p className={`text-xl sm:text-2xl font-bold font-display mt-0.5 sm:mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Toolbar Filters */}
        <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3">
          <div className="relative max-w-sm w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              id="audit-search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors"
              placeholder="Search message, actor, or source..."
            />
          </div>

          <div className="flex items-center gap-2 flex-1 flex-wrap sm:flex-nowrap">
            <select
              id="audit-action-filter"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl text-xs sm:text-sm px-3 py-2 outline-none cursor-pointer hover:border-sage-300 transition-colors flex-1 sm:flex-none"
            >
              <option value="">All Action Types</option>
              {uniqueActions.map((action, idx) => (
                <option key={idx} value={action}>{action}</option>
              ))}
            </select>

            <input
              type="date"
              id="audit-date-filter"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              aria-label="Filter by date"
              className="bg-white border border-slate-200 rounded-xl text-xs sm:text-sm px-3 py-2 outline-none cursor-pointer hover:border-sage-300 transition-colors flex-1 sm:flex-none"
            />

            <select
              id="audit-source-filter"
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl text-xs sm:text-sm px-3 py-2 outline-none cursor-pointer hover:border-sage-300 transition-colors flex-1 sm:flex-none"
            >
              <option value="">All Sources</option>
              {uniqueSources.map(source => (
                <option key={source} value={source}>{getSourcePresentation(source).label}</option>
              ))}
            </select>

            {(searchTerm || actionFilter || sourceFilter || dateFilter) && (
              <button
                onClick={() => { setSearchTerm(''); setActionFilter(''); setSourceFilter(''); setDateFilter(''); }}
                className="text-xs text-rose-600 hover:text-rose-700 font-semibold transition-colors py-1 px-2 rounded-lg hover:bg-rose-50 cursor-pointer whitespace-nowrap"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Audit Log Card Layout */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
          <div className="bg-slate-50/80 px-4 sm:px-6 py-3.5 flex items-center justify-between border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-sage-600" />
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                Immutable Action Ledger
              </span>
            </div>
            <span className="text-xs font-semibold text-slate-400 font-mono">
              {totalCount} {totalCount === 1 ? 'record' : 'records'}
            </span>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto max-h-[560px]">
            {logs.length > 0 ? (
              logs.map((log) => (
                <div
                  key={log.log_id}
                  className="p-3.5 sm:px-6 sm:py-4 hover:bg-slate-50/60 transition-colors flex flex-col md:flex-row md:items-start justify-between gap-2.5 sm:gap-4"
                >
                  <div className="space-y-1 sm:space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold border ${getActionBadgeColor(log.action)}`}>
                        {formatAuditActionForDisplay(log.action, log.entity_type, log.message)}
                      </span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold border ${getSourcePresentation(log.source).className}`}>
                        {getSourcePresentation(log.source).label}
                      </span>
                      <span className="text-[10px] sm:text-xs font-mono text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                        {formatPhilippineTimestamp(log.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700 leading-snug sm:leading-relaxed font-sans break-words">{formatAuditMessageForDisplay(log.message, log.entity_type)}</p>
                    {(log.entity_type || log.operation) && <p className="text-[10px] font-mono text-slate-500">
                      {[log.operation, formatAuditEntityForDisplay(log.entity_type)].filter(Boolean).join(' · ')}
                    </p>}
                  </div>

                  <div className="md:text-right flex-shrink-0 self-start md:self-center pt-1 md:pt-0 border-t md:border-t-0 border-slate-100 w-full md:w-auto flex items-center justify-between md:block">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Performed by</span>
                    <h5 className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5">{log.actor}</h5>
                    {log.actor_role && <p className="text-[10px] capitalize text-slate-500">{log.actor_role}</p>}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-16 text-center">
                <Shield className="h-8 w-8 text-slate-200 mx-auto mb-3" />
                <p className="text-sm text-slate-400 font-medium">No audit log entries match your filter criteria.</p>
                <p className="text-xs text-slate-300 mt-1">Try adjusting your search or filters above.</p>
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <div className="bg-slate-50/80 px-4 sm:px-6 py-3 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">
                {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredLogs.length)} of {filteredLogs.length}
              </span>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Previous
                </button>
                <span className="px-2 py-1 bg-sage-50 text-sage-800 border border-sage-200 rounded-lg text-xs font-bold font-mono">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
