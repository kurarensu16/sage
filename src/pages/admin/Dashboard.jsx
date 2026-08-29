import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Users, 
  Calendar, 
  Clock, 
  Archive, 
  ArrowRight, 
  UserPlus, 
  PlusCircle, 
  Settings, 
  ShieldAlert,
  ChevronRight,
  TrendingUp
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function Dashboard() {
  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    activeWindows: 0,
    pendingPosts: 0,
    archivedClasses: 0
  });
  const [activeTerm, setActiveTerm] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        setLoading(true);

        // Fetch active academic term
        const { data: termData } = await supabase
          .from('academic_terms')
          .select('term_id, school_year, semester')
          .eq('is_active', true)
          .maybeSingle();

        setActiveTerm(termData || null);

        // Fetch counts directly
        const { count: usersCount } = await supabase
          .from('users')
          .select('*', { count: 'exact', head: true });

        const { count: archivedCount } = await supabase
          .from('class_records')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'archived');

        const { count: pendingCount } = await supabase
          .from('class_records')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'active'); // Simulate pending posts for active classes

        const { count: activeWindowsCount } = await supabase
          .from('evaluation_windows')
          .select('*', { count: 'exact', head: true })
          .eq('is_closed', false);

        setMetrics({
          totalUsers: usersCount || 0,
          activeWindows: activeWindowsCount || 0,
          pendingPosts: pendingCount || 0,
          archivedClasses: archivedCount || 0
        });

        // Fetch top 5 recent logs
        const { data: logsData } = await supabase
          .from('activity_logs')
          .select('*')
          .order('timestamp', { ascending: false })
          .limit(5);

        setRecentLogs(logsData || []);
      } catch (err) {
        console.error("Failed to load dashboard data", err);
      } finally {
        setLoading(false);
      }
    }
    
    fetchDashboardData();
  }, []);

  const formatTimestamp = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }) + ' - ' + date.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
  };

  const statCards = [
    { 
      label: 'Total Users', 
      value: metrics.totalUsers, 
      icon: Users, 
      color: 'bg-blue-50 text-blue-700 border-blue-200', 
      link: '/admin/userlist' 
    },
    { 
      label: 'Active Eval Windows', 
      value: metrics.activeWindows, 
      icon: Calendar, 
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200', 
      link: '/admin/evalwindowlist' 
    },
    { 
      label: 'Pending Grade Posts', 
      value: metrics.pendingPosts, 
      icon: Clock, 
      color: 'bg-amber-50 text-amber-700 border-amber-200', 
      link: '/admin/classmanagementlist' 
    },
    { 
      label: 'Archived Classes', 
      value: metrics.archivedClasses, 
      icon: Archive, 
      color: 'bg-slate-100 text-slate-700 border-slate-200', 
      link: '/admin/classmanagementlist' 
    }
  ];

  return (
    <>
      <PageHeader title="Admin Dashboard" breadcrumb="Admin Portal" />
      
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6">
        
        {/* Welcome & Active Academic Term Hero Banner */}
        <div className="bg-gradient-to-r from-sage-900 via-sage-800 to-sage-900 rounded-2xl p-4 sm:p-6 md:p-8 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-1.5 sm:space-y-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-sage-700/60 text-sage-100 border border-sage-600/40">
              Active Term: AY {activeTerm?.school_year || '2025-2026'} • {activeTerm?.semester === '1st' ? 'First' : activeTerm?.semester === '2nd' ? 'Second' : activeTerm?.semester || 'Second'} Semester
            </span>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight font-display">System Administration & Controls</h1>
            <p className="text-xs sm:text-sm text-sage-200/90 max-w-xl line-clamp-2 sm:line-clamp-none">
              Manage institution-wide academic terms, grading templates, user authorizations, and operational audit logs.
            </p>
          </div>
          <div className="flex gap-2 sm:gap-3 flex-shrink-0">
            <Link
              to="/admin/termmanagement"
              className="w-full sm:w-auto justify-center px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs font-semibold bg-white text-sage-900 hover:bg-sage-50 rounded-xl transition-all shadow-sm flex items-center gap-1.5 sm:gap-2 whitespace-nowrap active:scale-95"
            >
              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sage-700" /> Manage Terms
            </Link>
          </div>
        </div>

        {/* Stat Cards 2x2 on Mobile, 4-col on Desktop */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {statCards.map((card, idx) => (
            <Link 
              key={idx} 
              to={card.link}
              className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-sage-300 hover:shadow-md transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2 group active:scale-[0.98]"
            >
              <div className="min-w-0">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 block truncate">{card.label}</span>
                <h3 className="text-xl sm:text-2xl md:text-3xl font-bold font-display text-slate-900 mt-0.5 sm:mt-1">{card.value}</h3>
              </div>
              <div className={`p-2 sm:p-3 rounded-xl border ${card.color} self-end sm:self-center group-hover:scale-105 transition-transform flex-shrink-0`}>
                <card.icon className="h-4 w-4 sm:h-5 sm:w-5 md:h-6 md:w-6" />
              </div>
            </Link>
          ))}
        </div>

        {/* Two-Column Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          
          {/* Left Column: Recent Logs */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs lg:col-span-2 flex flex-col overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold font-display text-slate-900 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 sm:h-5 sm:w-5 text-sage-600" /> Recent Administrative Activity
              </h3>
              <Link to="/admin/auditlog" className="text-xs font-bold text-sage-600 hover:text-sage-700 flex items-center gap-0.5 py-1 px-2 rounded-lg hover:bg-sage-50">
                Full Log <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            
            <div className="p-3.5 sm:p-5 flex-1 divide-y divide-slate-100">
              {recentLogs.length > 0 ? (
                recentLogs.map((log) => (
                  <div key={log.log_id} className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1.5 sm:gap-2">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] sm:text-xs font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200">
                          {log.action}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-700 leading-snug">{log.message}</p>
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium self-start sm:self-auto whitespace-nowrap flex-shrink-0">
                      by <strong className="text-slate-800">{log.actor}</strong>
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-slate-400 text-xs sm:text-sm">No activity recorded yet.</div>
              )}
            </div>
          </div>

          {/* Right Column: Quick Shortcuts */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs p-4 sm:p-5 space-y-4 flex flex-col justify-between">
            <div>
              <h3 className="text-sm sm:text-base font-bold font-display text-slate-900 flex items-center gap-2 mb-3 sm:mb-4">
                <Settings className="h-4 w-4 sm:h-5 sm:w-5 text-sage-600" /> Control Shortcuts
              </h3>
              
              <div className="space-y-2 sm:space-y-2.5">
                <Link 
                  to="/admin/userform"
                  className="flex items-center gap-3 p-3 border border-slate-100 hover:border-sage-200 hover:bg-slate-50/70 rounded-xl text-slate-700 hover:text-slate-900 transition-all active:scale-[0.99]"
                >
                  <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <UserPlus className="h-4 w-4" />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">Add New User</h4>
                    <p className="text-[11px] text-slate-500 truncate">Register students, faculty, or deans.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
                </Link>

                <Link 
                  to="/admin/sectionform"
                  className="flex items-center gap-3 p-3 border border-slate-100 hover:border-sage-200 hover:bg-slate-50/70 rounded-xl text-slate-700 hover:text-slate-900 transition-all active:scale-[0.99]"
                >
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                    <PlusCircle className="h-4 w-4" />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">Create Section</h4>
                    <p className="text-[11px] text-slate-500 truncate">Define cohorts and capacity limits.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
                </Link>

                <Link 
                  to="/admin/gradeoverride"
                  className="flex items-center gap-3 p-3 border border-slate-100 hover:border-sage-200 hover:bg-slate-50/70 rounded-xl text-slate-700 hover:text-slate-900 transition-all active:scale-[0.99]"
                >
                  <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">Grade Overrides</h4>
                    <p className="text-[11px] text-slate-500 truncate">Manually override posted grades.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
                </Link>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100">
              <div className="bg-sage-50 border border-sage-200 rounded-xl p-3 flex items-center gap-2.5">
                <TrendingUp className="h-4 w-4 text-sage-600 flex-shrink-0" />
                <div className="text-xs text-sage-800">
                  <strong className="font-bold">System Status: Operational</strong>
                  <p className="text-[11px] text-slate-500 mt-0.5">Database connectivity active & synced.</p>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </>
  );
}
