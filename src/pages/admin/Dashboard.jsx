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
      
      <div className="p-8 overflow-y-auto flex-1 space-y-6">
        
        {/* Welcome & Active Academic Term Hero Banner */}
        <div className="bg-gradient-to-r from-sage-900 via-sage-800 to-sage-900 rounded-2xl p-6 md:p-8 text-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-sage-700/50 text-sage-100 border border-sage-600/30">
              Active Term: AY {activeTerm?.school_year || '2025-2026'} • {activeTerm?.semester === '1st' ? 'First' : activeTerm?.semester === '2nd' ? 'Second' : activeTerm?.semester || 'Second'} Semester
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight font-display">System Administration & Controls</h1>
            <p className="text-sm text-sage-200/90 max-w-xl">
              Manage institution-wide academic terms, grading templates, user authorizations, and operational audit logs.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              to="/admin/terms"
              className="px-4 py-2.5 text-xs font-semibold bg-white text-sage-900 hover:bg-sage-50 rounded-xl transition-all shadow-md flex items-center gap-2 whitespace-nowrap"
            >
              <Calendar className="h-4 w-4" /> Manage Terms
            </Link>
          </div>
        </div>

        {/* Stat Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card, idx) => (
            <Link 
              key={idx} 
              to={card.link}
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:border-sage-300 hover:shadow-md transition-all flex items-center justify-between group"
            >
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{card.label}</span>
                <h3 className="text-3xl font-bold font-display text-slate-900 mt-1">{card.value}</h3>
              </div>
              <div className={`p-3 rounded-lg border ${card.color} group-hover:scale-105 transition-transform`}>
                <card.icon className="h-6 w-6" />
              </div>
            </Link>
          ))}
        </div>

        {/* Two-Column Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Recent Logs */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm lg:col-span-2 flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-base font-bold font-display text-slate-900 flex items-center gap-2">
                <ShieldAlert className="h-5 w-5 text-sage-600" /> Recent Administrative Activity
              </h3>
              <Link to="/admin/auditlog" className="text-xs font-bold text-sage-600 hover:text-sage-700 flex items-center gap-0.5">
                Full Log <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            
            <div className="p-6 flex-1 divide-y divide-slate-100">
              {recentLogs.length > 0 ? (
                recentLogs.map((log) => (
                  <div key={log.log_id} className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                          {log.action}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 mt-1">{log.message}</p>
                    </div>
                    <span className="text-xs text-slate-500 font-medium self-start sm:self-center">
                      by <strong className="text-slate-800">{log.actor}</strong>
                    </span>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-slate-400 text-sm">No activity recorded yet.</div>
              )}
            </div>
          </div>

          {/* Right Column: Quick Shortcuts */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4 flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold font-display text-slate-900 flex items-center gap-2 mb-4">
                <Settings className="h-5 w-5 text-sage-600" /> Control Shortcuts
              </h3>
              
              <div className="space-y-3">
                <Link 
                  to="/admin/userform"
                  className="flex items-center gap-3 p-3 border border-slate-100 hover:border-sage-200 hover:bg-slate-50/50 rounded-lg text-slate-700 hover:text-slate-900 transition-colors"
                >
                  <UserPlus className="h-5 w-5 text-slate-400" />
                  <div className="text-left">
                    <h4 className="text-sm font-bold">Add New User</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Register new students, faculty, or deans.</p>
                  </div>
                </Link>

                <Link 
                  to="/admin/classmanagementform"
                  className="flex items-center gap-3 p-3 border border-slate-100 hover:border-sage-200 hover:bg-slate-50/50 rounded-lg text-slate-700 hover:text-slate-900 transition-colors"
                >
                  <PlusCircle className="h-5 w-5 text-slate-400" />
                  <div className="text-left">
                    <h4 className="text-sm font-bold">Create Classroom</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Link subjects and sections with CSV student imports.</p>
                  </div>
                </Link>

                <Link 
                  to="/admin/gradeoverride"
                  className="flex items-center gap-3 p-3 border border-slate-100 hover:border-sage-200 hover:bg-slate-50/50 rounded-lg text-slate-700 hover:text-slate-900 transition-colors"
                >
                  <ShieldAlert className="h-5 w-5 text-slate-400" />
                  <div className="text-left">
                    <h4 className="text-sm font-bold">Grade Overrides</h4>
                    <p className="text-xs text-slate-500 mt-0.5">Manually override posted grades with reasons.</p>
                  </div>
                </Link>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <div className="bg-sage-50 border border-sage-200 rounded-lg p-3 flex gap-2">
                <TrendingUp className="h-5 w-5 text-sage-600 flex-shrink-0" />
                <div className="text-xs text-sage-700">
                  <strong>System Running Normal</strong>
                  <p className="text-slate-500 mt-0.5">Database connectivity active. Evaluation timers monitor running.</p>
                </div>
              </div>
            </div>

          </div>

        </div>

      </div>
    </>
  );
}
