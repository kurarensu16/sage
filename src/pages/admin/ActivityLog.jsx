import React, { useState, useEffect } from 'react';
import PageHeader from '../../components/layout/PageHeader';
import { Search, Filter, Clock, Shield, RefreshCw } from 'lucide-react';
import { mockDb } from '../../lib/mockDb';

export default function ActivityLog() {
  const [logs, setLogs] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  const loadLogs = () => {
    setLogs(mockDb.getLogs());
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const formatTimestamp = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleDateString() + ' @ ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getActionBadgeColor = (action) => {
    switch (action) {
      case 'Grade Override':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Faculty Reassignment':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'Classroom Archive':
        return 'bg-slate-100 text-slate-700 border-slate-200';
      case 'Classroom Creation':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'User Creation':
      case 'User Update':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  // Get unique action types for filter dropdown
  const uniqueActions = Array.from(new Set(logs.map(log => log.action)));

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.actor.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesAction = actionFilter ? log.action === actionFilter : true;
    
    return matchesSearch && matchesAction;
  });

  return (
    <>
      <PageHeader title="System Activity & Audit Log" breadcrumb="Admin Portal">
        <button 
          onClick={loadLogs}
          className="px-4 py-2 text-sm font-medium border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors bg-white flex items-center gap-2 shadow-sm"
        >
          <RefreshCw className="h-4 w-4 text-slate-500" /> Refresh logs
        </button>
      </PageHeader>

      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Toolbar Filters */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="relative max-w-md w-full">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input 
              type="text" 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 outline-none transition-colors" 
              placeholder="Search logs by message or actor..." 
            />
          </div>

          <div>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="bg-white border border-slate-200 rounded-lg text-sm px-3 py-2 outline-none cursor-pointer hover:border-sage-300 transition-colors"
            >
              <option value="">All Action Types</option>
              {uniqueActions.map((action, idx) => (
                <option key={idx} value={action}>{action}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Audit Log Card Layout */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="bg-slate-50 px-6 py-4 flex items-center gap-2 border-b border-slate-200">
            <Shield className="h-5 w-5 text-sage-600" />
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">
              Immutable Action Ledger ({filteredLogs.length} Records)
            </span>
          </div>

          <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <div key={log.id} className="p-6 hover:bg-slate-50/20 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${getActionBadgeColor(log.action)}`}>
                        {log.action}
                      </span>
                      <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" /> {formatTimestamp(log.timestamp)}
                      </span>
                      <span className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                        ID: {log.id}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700 leading-relaxed font-sans">{log.message}</p>
                  </div>
                  
                  <div className="md:text-right flex-shrink-0 self-start md:self-center">
                    <span className="text-xs text-slate-500">Performed by:</span>
                    <h5 className="text-sm font-bold text-slate-900 mt-0.5">{log.actor}</h5>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-12 text-center text-slate-400 text-sm">
                No system activity matches your filter criteria.
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
