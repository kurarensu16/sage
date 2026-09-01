import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Clock, Shield, RefreshCw, DownloadCloud } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const ACTION_BADGE_MAP = {
  'Grade Override':       'bg-rose-50 text-rose-700 border-rose-200',
  'Faculty Reassignment': 'bg-amber-50 text-amber-700 border-amber-200',
  'Classroom Archive':    'bg-slate-100 text-slate-600 border-slate-200',
  'Classroom Creation':   'bg-blue-50 text-blue-700 border-blue-200',
  'User Creation':        'bg-emerald-50 text-emerald-700 border-emerald-200',
  'User Update':          'bg-teal-50 text-teal-700 border-teal-200',
  'User Status Change':   'bg-indigo-50 text-indigo-700 border-indigo-200',
  'User Deletion':        'bg-rose-100 text-rose-800 border-rose-300',
  'Batch User Import':    'bg-violet-50 text-violet-700 border-violet-200',
  'Section Creation':     'bg-cyan-50 text-cyan-700 border-cyan-200',
  'Section Update':       'bg-cyan-50 text-cyan-600 border-cyan-100',
  'Subject Creation':     'bg-sky-50 text-sky-700 border-sky-200',
  'Subject Update':       'bg-sky-50 text-sky-600 border-sky-100',
  'Eval Window Creation': 'bg-orange-50 text-orange-700 border-orange-200',
  'Eval Window Update':   'bg-orange-50 text-orange-600 border-orange-100',
  'Eval Form Creation':   'bg-pink-50 text-pink-700 border-pink-200',
  'Eval Form Update':     'bg-pink-50 text-pink-600 border-pink-100',
  'APK Download':         'bg-emerald-50 text-emerald-700 border-emerald-200',
  'Mobile App Distribution': 'bg-teal-50 text-teal-700 border-teal-200',
};

const getActionBadgeColor = (action) =>
  ACTION_BADGE_MAP[action] || 'bg-slate-100 text-slate-600 border-slate-200';

export default function AuditLog() {
  const location = useLocation();
  const [logs, setLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const actionParam = params.get('action');
    const searchParam = params.get('search');
    if (actionParam) setActionFilter(actionParam);
    if (searchParam) setSearchTerm(searchParam);
  }, [location.search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, actionFilter, dateFilter]);

  const loadLogs = async () => {
    setErrorMsg('');
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('timestamp', { ascending: false });

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Failed to load activity logs:', err);
      setErrorMsg('Failed to load system audit logs: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const formatTimestamp = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' })
      + ' • '
      + date.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDateKey = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
    const parts = formatter.formatToParts(date);
    const getPart = (type) => parts.find(p => p.type === type).value;
    return `${getPart('year')}-${getPart('month')}-${getPart('day')}`;
  };

  // Get unique action types for filter dropdown (sorted alphabetically)
  const uniqueActions = Array.from(new Set(logs.map(log => log.action))).sort();

  // Get unique dates for filter dropdown
  const uniqueDates = Array.from(new Set(logs.map(log => formatDateKey(log.timestamp)))).sort().reverse();

  const filteredLogs = logs.filter(log => {
    const haystack = `${log.message} ${log.actor}`.toLowerCase();
    const matchesSearch = searchTerm ? haystack.includes(searchTerm.toLowerCase()) : true;
    const matchesAction = actionFilter ? log.action === actionFilter : true;
    const matchesDate = dateFilter ? formatDateKey(log.timestamp) === dateFilter : true;
    return matchesSearch && matchesAction && matchesDate;
  });

  const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);
  const paginatedLogs = filteredLogs.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Summary stats
  const todayKey = formatDateKey(new Date().toISOString());
  const todayCount = logs.filter(l => formatDateKey(l.timestamp) === todayKey).length;

  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const header = ['Log ID', 'Action', 'Actor', 'Message', 'Timestamp'];
    const rows = filteredLogs.map(l => [
      l.log_id,
      `"${l.action}"`,
      `"${l.actor}"`,
      `"${l.message?.replace(/"/g, "'")}"`,
      formatTimestamp(l.timestamp)
    ]);
    const csv = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sage_audit_logs_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader title="System Audit Logs" breadcrumb="Admin Portal">
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            disabled={filteredLogs.length === 0}
            className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors bg-white flex items-center gap-2 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <DownloadCloud className="h-4 w-4 text-slate-500" /> Export CSV
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
            { label: 'Total Records', value: logs.length, color: 'text-slate-900' },
            { label: 'Today\'s Actions', value: todayCount, color: 'text-sage-700' },
            { label: 'Unique Actors', value: Array.from(new Set(logs.map(l => l.actor))).length, color: 'text-blue-700' },
            { label: 'Action Types', value: uniqueActions.length, color: 'text-violet-700' },
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
              placeholder="Search message or actor..."
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

            <select
              id="audit-date-filter"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-xl text-xs sm:text-sm px-3 py-2 outline-none cursor-pointer hover:border-sage-300 transition-colors flex-1 sm:flex-none"
            >
              <option value="">All Dates</option>
              {uniqueDates.map((date, idx) => (
                <option key={idx} value={date}>{date}</option>
              ))}
            </select>

            {(searchTerm || actionFilter || dateFilter) && (
              <button
                onClick={() => { setSearchTerm(''); setActionFilter(''); setDateFilter(''); }}
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
              {filteredLogs.length} {filteredLogs.length === 1 ? 'record' : 'records'}
            </span>
          </div>

          <div className="divide-y divide-slate-100 overflow-y-auto" style={{ maxHeight: '560px' }}>
            {paginatedLogs.length > 0 ? (
              paginatedLogs.map((log) => (
                <div
                  key={log.log_id}
                  className="p-3.5 sm:px-6 sm:py-4 hover:bg-slate-50/60 transition-colors flex flex-col md:flex-row md:items-start justify-between gap-2.5 sm:gap-4"
                >
                  <div className="space-y-1 sm:space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] sm:text-xs font-bold border ${getActionBadgeColor(log.action)}`}>
                        {log.action}
                      </span>
                      <span className="text-[10px] sm:text-xs font-mono text-slate-400 flex items-center gap-1">
                        <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 flex-shrink-0" />
                        {formatTimestamp(log.timestamp)}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-700 leading-snug sm:leading-relaxed font-sans break-words">{log.message}</p>
                    <p className="text-[10px] font-mono text-slate-400">ID: {log.log_id}</p>
                  </div>

                  <div className="md:text-right flex-shrink-0 self-start md:self-center pt-1 md:pt-0 border-t md:border-t-0 border-slate-100 w-full md:w-auto flex items-center justify-between md:block">
                    <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Performed by</span>
                    <h5 className="text-xs sm:text-sm font-bold text-slate-900 mt-0.5">{log.actor}</h5>
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
