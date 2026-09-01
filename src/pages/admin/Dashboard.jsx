import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Users, 
  Building2, 
  BookOpen, 
  Layers, 
  Calendar, 
  UserPlus, 
  PlusCircle, 
  Settings, 
  ShieldAlert,
  ChevronRight,
  TrendingUp,
  Sliders,
  Smartphone
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function Dashboard() {
  const [metrics, setMetrics] = useState({
    totalUsers: 0,
    totalDepartments: 0,
    totalSubjects: 0,
    totalSections: 0,
    roleCounts: { student: 0, faculty: 0, dean: 0, admin: 0 }
  });
  const [apkMetrics, setApkMetrics] = useState({
    totalDownloads: 0,
    todayDownloads: 0,
    recentDownloads: []
  });
  const [activeTerm, setActiveTerm] = useState(null);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        setLoading(true);

        // 1. Fetch active academic term
        const { data: termData } = await supabase
          .from('academic_terms')
          .select('term_id, school_year, semester')
          .eq('is_active', true)
          .maybeSingle();

        setActiveTerm(termData || null);

        // 2. Fetch parallel counts directly from Supabase
        const [
          { count: usersCount, data: usersRoleData },
          { count: deptsCount },
          { count: subjectsCount },
          { count: sectionsCount },
          { data: logsData },
          { data: apkLogsData }
        ] = await Promise.all([
          supabase.from('users').select('role', { count: 'exact' }),
          supabase.from('departments').select('*', { count: 'exact', head: true }),
          supabase.from('subjects').select('*', { count: 'exact', head: true }),
          supabase.from('sections').select('*', { count: 'exact', head: true }),
          supabase.from('activity_logs').select('*').order('timestamp', { ascending: false }).limit(6),
          supabase.from('activity_logs').select('*').ilike('action', '%APK%').order('timestamp', { ascending: false })
        ]);

        // Calculate role breakdown
        const roleCounts = { student: 0, faculty: 0, dean: 0, admin: 0 };
        (usersRoleData || []).forEach(u => {
          if (roleCounts[u.role] !== undefined) {
            roleCounts[u.role]++;
          }
        });

        setMetrics({
          totalUsers: usersCount || 0,
          totalDepartments: deptsCount || 0,
          totalSubjects: subjectsCount || 0,
          totalSections: sectionsCount || 0,
          roleCounts
        });

        setRecentLogs(logsData || []);

        // Calculate APK download metrics
        const allApkLogs = apkLogsData || [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayDownloads = allApkLogs.filter(l => new Date(l.timestamp) >= today).length;

        setApkMetrics({
          totalDownloads: allApkLogs.length,
          todayDownloads,
          recentDownloads: allApkLogs.slice(0, 4)
        });
      } catch (err) {
        console.error("Failed to load admin dashboard data", err);
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
      label: 'Registered Accounts', 
      sublabel: 'Students, Faculty & Staff',
      value: metrics.totalUsers, 
      icon: Users, 
      color: 'bg-blue-50 text-blue-700 border-blue-200', 
      link: '/admin/userlist' 
    },
    { 
      label: 'Colleges & Units', 
      sublabel: 'Academic Departments',
      value: metrics.totalDepartments, 
      icon: Building2, 
      color: 'bg-purple-50 text-purple-700 border-purple-200', 
      link: '/admin/departmentslist' 
    },
    { 
      label: 'Curriculum Subjects', 
      sublabel: 'Approved Course Catalog',
      value: metrics.totalSubjects, 
      icon: BookOpen, 
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200', 
      link: '/admin/subjectlist' 
    },
    { 
      label: 'Section Cohorts', 
      sublabel: 'Student Year Sections',
      value: metrics.totalSections, 
      icon: Layers, 
      color: 'bg-amber-50 text-amber-700 border-amber-200', 
      link: '/admin/sectionlist' 
    }
  ];

  const semLabel = activeTerm?.semester === 'Summer' 
    ? 'Summer Term' 
    : `${activeTerm?.semester === '1st' ? '1st' : activeTerm?.semester === '2nd' ? '2nd' : activeTerm?.semester || 'Summer'} Semester`;

  return (
    <>
      <PageHeader title="Admin Dashboard" breadcrumb="Admin Portal" />
      
      <div className="p-3.5 sm:p-6 md:p-8 overflow-y-auto flex-1 space-y-4 sm:space-y-6">
        
        {/* Welcome & Active Academic Term Hero Banner */}
        <div className="bg-gradient-to-r from-sage-900 via-sage-800 to-sage-900 rounded-2xl p-4 sm:p-6 md:p-8 text-white shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-1.5 sm:space-y-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-sage-700/60 text-sage-100 border border-sage-600/40">
              Active Term: AY {activeTerm?.school_year || '2025-2026'} • {semLabel}
            </span>
            <h1 className="text-xl sm:text-2xl md:text-3xl font-extrabold tracking-tight font-display">System Administration & Controls</h1>
            <p className="text-xs sm:text-sm text-sage-200/90 max-w-xl line-clamp-2 sm:line-clamp-none">
              Central management of institutional academic terms, curriculum databases, user accounts, and security audit trails.
            </p>
          </div>
          <div className="flex gap-2 sm:gap-3 flex-shrink-0">
            <Link
              to="/admin/termmanagement"
              className="w-full sm:w-auto justify-center px-3.5 py-2 sm:px-4 sm:py-2.5 text-xs font-semibold bg-white text-sage-900 hover:bg-sage-50 rounded-xl transition-all shadow-sm flex items-center gap-1.5 sm:gap-2 whitespace-nowrap active:scale-95 cursor-pointer"
            >
              <Calendar className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-sage-700" /> Manage Terms
            </Link>
          </div>
        </div>

        {/* 4 Core Infrastructure Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          {statCards.map((card, idx) => (
            <Link 
              key={idx} 
              to={card.link}
              className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:border-sage-300 hover:shadow-md transition-all flex flex-col justify-between gap-2 group active:scale-[0.98] cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-slate-500 block truncate">{card.label}</span>
                  <p className="text-[10px] text-slate-400 font-normal hidden sm:block truncate mt-0.5">{card.sublabel}</p>
                </div>
                <div className={`p-2 sm:p-2.5 rounded-xl border ${card.color} group-hover:scale-105 transition-transform flex-shrink-0`}>
                  <card.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
              </div>
              <div className="flex items-baseline justify-between pt-1">
                <h3 className="text-xl sm:text-2xl md:text-3xl font-bold font-display text-slate-900">{loading ? '...' : card.value}</h3>
                <span className="text-[11px] font-bold text-sage-600 group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                  View <ChevronRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* System User Distribution Summary */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h4 className="text-xs sm:text-sm font-bold text-slate-900">Institution User Composition</h4>
            <p className="text-[11px] text-slate-500">Live breakdown of registered system account credentials</p>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 flex-shrink-0">
            <div className="px-3 py-2 bg-blue-50/60 border border-blue-100 rounded-xl text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 block">Students</span>
              <span className="text-base sm:text-lg font-bold font-mono text-blue-900">{metrics.roleCounts.student}</span>
            </div>
            <div className="px-3 py-2 bg-emerald-50/60 border border-emerald-100 rounded-xl text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 block">Faculty</span>
              <span className="text-base sm:text-lg font-bold font-mono text-emerald-900">{metrics.roleCounts.faculty}</span>
            </div>
            <div className="px-3 py-2 bg-purple-50/60 border border-purple-100 rounded-xl text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-purple-700 block">Deans</span>
              <span className="text-base sm:text-lg font-bold font-mono text-purple-900">{metrics.roleCounts.dean}</span>
            </div>
            <div className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-700 block">Admins / Staff</span>
              <span className="text-base sm:text-lg font-bold font-mono text-slate-900">{metrics.roleCounts.admin}</span>
            </div>
          </div>
        </div>

        {/* Mobile & Client Distribution Command Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5 relative overflow-hidden">
          {/* Subtle Ambient Background Accent */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-sage-50/60 via-transparent to-transparent pointer-events-none rounded-bl-full" />

          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-2xl bg-sage-900 text-white flex items-center justify-center flex-shrink-0 shadow-sm ring-4 ring-sage-50">
                <Smartphone className="h-5 w-5 text-sage-300" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold font-display text-slate-900 tracking-tight">
                  Mobile App & Client Distribution
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Official mobile application package & campus distribution • DYCI
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Link
                to="/admin/auditlog?action=APK+Download"
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 active:scale-95 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
              >
                <span>Audit Ledger</span>
                <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
              </Link>
            </div>
          </div>

          {/* 3-Column Executive Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
            
            {/* Column 1: Total Installs & Daily Pace */}
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Total App Installs
                  </span>
                  <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                    +{apkMetrics.todayDownloads} today
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="text-3xl sm:text-4xl font-extrabold font-display text-slate-900 tracking-tight">
                    {loading ? '—' : apkMetrics.totalDownloads}
                  </span>
                  <span className="text-xs font-medium text-slate-500">verified downloads</span>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Cumulative Android APK and standalone client installations across campus.
              </p>
            </div>

            {/* Column 2: Supported Client Formats */}
            <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80 flex flex-col justify-between space-y-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Distribution Channels
              </span>
              
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-slate-200/60 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="font-semibold text-slate-800">Android Package</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">.APK</span>
                </div>

                <div className="flex items-center justify-between p-2 bg-white rounded-xl border border-slate-200/60 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    <span className="font-semibold text-slate-800">Apple iOS & Desktop</span>
                  </div>
                  <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">PWA</span>
                </div>
              </div>

              <span className="text-[10px] text-slate-400 font-mono">Package ID: ph.edu.dyci.sage</span>
            </div>

            {/* Column 3: Active Release Package Meta */}
            <div className="p-4 bg-gradient-to-br from-sage-900 to-sage-950 text-white rounded-2xl shadow-sm flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sage-300">
                    Active Release Binary
                  </span>
                  <span className="text-[10px] font-mono bg-sage-800/80 text-sage-200 px-2 py-0.5 rounded border border-sage-700">
                    v1.0.0
                  </span>
                </div>
                <h4 className="text-base font-bold font-display mt-2 text-white flex items-center gap-2">
                  sage.apk
                </h4>
                <p className="text-[11px] text-sage-200/80 mt-0.5 font-mono truncate">
                  Supabase Storage • app-releases
                </p>
              </div>

              <div className="pt-2 border-t border-sage-800/80 flex items-center justify-between text-[11px]">
                <span className="text-sage-300">Target OS</span>
                <span className="font-semibold text-sage-100">Android 8.0+ / Web</span>
              </div>
            </div>

          </div>

          {/* Recent Installs Feed (If any) */}
          {apkMetrics.recentDownloads.length > 0 && (
            <div className="pt-3 border-t border-slate-100 relative z-10">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2.5">
                Recent Campus Installations
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                {apkMetrics.recentDownloads.map((dl) => (
                  <div key={dl.log_id} className="p-2.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200/70 flex items-center justify-between gap-2 transition-colors">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{dl.actor}</p>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">{formatTimestamp(dl.timestamp)}</p>
                    </div>
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-semibold flex-shrink-0">
                      APK
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Two-Column Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          
          {/* Left Column: Recent Audit Logs */}
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xs lg:col-span-2 flex flex-col overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold font-display text-slate-900 flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 sm:h-5 sm:w-5 text-sage-600" /> Recent Administrative Activity
              </h3>
              <Link to="/admin/auditlog" className="text-xs font-bold text-sage-600 hover:text-sage-700 flex items-center gap-0.5 py-1 px-2 rounded-lg hover:bg-sage-50 cursor-pointer">
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
                  className="flex items-center gap-3 p-3 border border-slate-100 hover:border-sage-200 hover:bg-slate-50/70 rounded-xl text-slate-700 hover:text-slate-900 transition-all active:scale-[0.99] cursor-pointer"
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
                  className="flex items-center gap-3 p-3 border border-slate-100 hover:border-sage-200 hover:bg-slate-50/70 rounded-xl text-slate-700 hover:text-slate-900 transition-all active:scale-[0.99] cursor-pointer"
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
                  to="/admin/subjectform"
                  className="flex items-center gap-3 p-3 border border-slate-100 hover:border-sage-200 hover:bg-slate-50/70 rounded-xl text-slate-700 hover:text-slate-900 transition-all active:scale-[0.99] cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center flex-shrink-0">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">Add Subject</h4>
                    <p className="text-[11px] text-slate-500 truncate">Register course in curriculum catalog.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
                </Link>

                <Link 
                  to="/admin/gradecomputationslist"
                  className="flex items-center gap-3 p-3 border border-slate-100 hover:border-sage-200 hover:bg-slate-50/70 rounded-xl text-slate-700 hover:text-slate-900 transition-all active:scale-[0.99] cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-lg bg-sage-100 text-sage-700 flex items-center justify-center flex-shrink-0">
                    <Sliders className="h-4 w-4" />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">Grading Templates</h4>
                    <p className="text-[11px] text-slate-500 truncate">Configure 50-10-40 computation rules.</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0" />
                </Link>

                <Link 
                  to="/admin/gradeoverride"
                  className="flex items-center gap-3 p-3 border border-slate-100 hover:border-sage-200 hover:bg-slate-50/70 rounded-xl text-slate-700 hover:text-slate-900 transition-all active:scale-[0.99] cursor-pointer"
                >
                  <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                    <ShieldAlert className="h-4 w-4" />
                  </div>
                  <div className="text-left min-w-0 flex-1">
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">Grade Overrides</h4>
                    <p className="text-[11px] text-slate-500 truncate">Executive grade adjustment authority.</p>
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
