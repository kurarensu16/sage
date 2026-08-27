import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import { 
  Users, 
  Building2, 
  CheckCircle2, 
  XCircle, 
  BookOpen, 
  Calendar, 
  Layers, 
  ClipboardList, 
  ArrowRight, 
  ShieldCheck, 
  GraduationCap,
  Loader2,
  Sparkles,
  FileSpreadsheet
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/AuthContext';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [activeTerm, setActiveTerm] = useState(null);
  const [stats, setStats] = useState({
    totalStudents: 0,
    totalFaculty: 0,
    totalSections: 0,
    totalClassrooms: 0,
    clearedStudents: 0,
    pendingStudents: 0,
    clearancePct: 0,
    programBreakdown: []
  });

  const userDepartmentId = profile?.department_id;
  const userDepartmentName = profile?.departments?.name || profile?.department_name || 'College Department';

  useEffect(() => {
    let isMounted = true;

    async function loadOfficeDashboardData() {
      if (!userDepartmentId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // 1. Fetch active term
        const { data: termData } = await supabase
          .from('academic_terms')
          .select('*')
          .eq('is_active', true)
          .maybeSingle();

        if (isMounted) setActiveTerm(termData);

        // 2. Fetch department students
        const { data: students, error: stuErr } = await supabase
          .from('users')
          .select('user_id, first_name, last_name, email, section_id, sections(name)')
          .eq('role', 'student')
          .eq('status', 'active')
          .eq('department_id', userDepartmentId);

        if (stuErr) throw stuErr;

        // 3. Fetch department faculty
        const { data: faculty, error: facErr } = await supabase
          .from('users')
          .select('user_id')
          .eq('role', 'faculty')
          .eq('status', 'active')
          .eq('department_id', userDepartmentId);

        if (facErr) throw facErr;

        // 4. Fetch department sections
        const { data: sections, error: secErr } = await supabase
          .from('sections')
          .select('section_id, name')
          .eq('department_id', userDepartmentId);

        if (secErr) throw secErr;

        // 5. Fetch department classrooms (subject assignments)
        const { data: classrooms, error: clsErr } = await supabase
          .from('class_records')
          .select('class_record_id, section_id, subjects!inner(department_id)')
          .eq('subjects.department_id', userDepartmentId);

        if (clsErr && !clsErr.message.includes('foreign key')) {
          console.warn('Classroom query note:', clsErr);
        }

        // 6. Fetch clearance records for active students
        let clearedCount = 0;
        if (termData && (students || []).length > 0) {
          const studentIds = students.map(s => s.user_id);
          const { data: clearances } = await supabase
            .from('clearance_records')
            .select('student_id, status')
            .eq('term_id', termData.term_id)
            .in('student_id', studentIds);

          clearedCount = (clearances || []).filter(c => c.status === 'SIGNED').length;
        }

        // Calculate program distribution
        const progCounts = {};
        (students || []).forEach(s => {
          const sectionName = s.sections?.name || '';
          const progCode = sectionName.match(/^([A-Z]+)/)?.[1] || 'General';
          progCounts[progCode] = (progCounts[progCode] || 0) + 1;
        });

        const programBreakdown = Object.entries(progCounts).map(([prog, count]) => ({
          name: prog,
          count,
          percentage: students.length > 0 ? Math.round((count / students.length) * 100) : 0
        })).sort((a, b) => b.count - a.count);

        const totalStu = (students || []).length;
        const pendingCount = Math.max(0, totalStu - clearedCount);
        const clearancePct = totalStu > 0 ? Math.round((clearedCount / totalStu) * 100) : 0;

        if (isMounted) {
          setStats({
            totalStudents: totalStu,
            totalFaculty: (faculty || []).length,
            totalSections: (sections || []).length,
            totalClassrooms: (classrooms || []).length,
            clearedStudents: clearedCount,
            pendingStudents: pendingCount,
            clearancePct,
            programBreakdown
          });
        }

      } catch (err) {
        console.error('Error loading office dashboard:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadOfficeDashboardData();

    return () => {
      isMounted = false;
    };
  }, [userDepartmentId]);

  return (
    <>
      <PageHeader title="College Office Dashboard" breadcrumb="College Office Portal">
        {/* Prominent College/Department Badge in Header */}
        <div className="bg-white/15 backdrop-blur-md px-3.5 py-1.5 rounded-lg text-xs md:text-sm text-white font-bold flex items-center gap-2 border border-white/20 shadow-xs">
          <Building2 className="h-4 w-4 text-emerald-300 flex-shrink-0" />
          <span>{userDepartmentName}</span>
        </div>
      </PageHeader>

      <div className="p-6 md:p-8 overflow-y-auto flex-1 space-y-6">

        {/* Institutional College Overview Banner */}
        <div className="bg-sage-900 rounded-2xl border border-sage-800 p-6 md:p-8 text-white shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative overflow-hidden">
          {/* Subtle brand tint accent */}
          <div className="absolute top-0 right-0 w-96 h-full bg-gradient-to-l from-emerald-500/10 via-transparent to-transparent pointer-events-none" />
          
          <div className="space-y-3 max-w-2xl relative z-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-bold uppercase tracking-wider">
              <Building2 className="h-3.5 w-3.5 text-emerald-400 flex-shrink-0" />
              <span>{userDepartmentName}</span>
            </div>
            <h2 className="text-2xl md:text-3xl font-extrabold font-display tracking-tight text-white">
              College Administration Overview
            </h2>
            <p className="text-xs md:text-sm text-sage-200/95 leading-relaxed">
              Oversee student roster enrollments, curriculum subject pairings, and student clearance compliance for <strong className="text-white font-semibold">{userDepartmentName}</strong>.
            </p>
          </div>

          {activeTerm && (
            <div className="bg-sage-800/90 border border-sage-700/80 rounded-xl p-4 flex items-center gap-4 flex-shrink-0 min-w-[240px] relative z-10 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 flex items-center justify-center flex-shrink-0">
                <Calendar className="h-5 w-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-sage-300">
                    Active Academic Term
                  </span>
                </div>
                <p className="text-base font-bold text-white font-mono tracking-tight">
                  {activeTerm.school_year}
                </p>
                <p className="text-xs font-semibold text-emerald-300">
                  {activeTerm.semester} Semester
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Live Department Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* Total Students */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Department Students</span>
              <div className="p-2.5 bg-sage-50 text-sage-600 rounded-lg">
                <GraduationCap className="h-5 w-5" />
              </div>
            </div>
            <div>
              <p className="text-3xl font-black text-slate-800 font-mono">
                {loading ? <Loader2 className="h-7 w-7 animate-spin text-slate-400" /> : stats.totalStudents}
              </p>
              <p className="text-xs text-slate-400 mt-1 font-medium">Active enrolled students</p>
            </div>
          </div>

          {/* Department Faculty */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Faculty Instructors</span>
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div>
              <p className="text-3xl font-black text-slate-800 font-mono">
                {loading ? <Loader2 className="h-7 w-7 animate-spin text-slate-400" /> : stats.totalFaculty}
              </p>
              <p className="text-xs text-slate-400 mt-1 font-medium">Department teaching staff</p>
            </div>
          </div>

          {/* Active Sections */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Active Sections</span>
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-lg">
                <Layers className="h-5 w-5" />
              </div>
            </div>
            <div>
              <p className="text-3xl font-black text-slate-800 font-mono">
                {loading ? <Loader2 className="h-7 w-7 animate-spin text-slate-400" /> : stats.totalSections}
              </p>
              <p className="text-xs text-slate-400 mt-1 font-medium">Section cohorts</p>
            </div>
          </div>

          {/* Clearance Progress */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Clearance Status</span>
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <CheckCircle2 className="h-5 w-5" />
              </div>
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <p className="text-3xl font-black text-emerald-600 font-mono">
                  {loading ? <Loader2 className="h-7 w-7 animate-spin text-slate-400" /> : stats.clearedStudents}
                </p>
                <span className="text-xs font-bold text-slate-500">
                  {stats.clearancePct}% Cleared
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 mt-2.5 overflow-hidden">
                <div className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${stats.clearancePct}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Quick Action Navigation Modules */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Department Management Modules
            </h3>
            <span className="text-xs text-slate-400 font-medium">Direct Access</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Clearance Audit Card */}
            <div 
              onClick={() => navigate('/office/complianceaudit')}
              className="bg-white rounded-xl border border-slate-200 hover:border-sage-400 p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900 group-hover:text-sage-700 transition-colors">
                    Clearance Audit
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Verify faculty evaluation survey completion and execute single or bulk clearance sign-offs for {userDepartmentName} students.
                  </p>
                </div>
              </div>
              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-sage-600 group-hover:text-sage-800">
                <span>Open Clearance Audit</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Subject Assignments Card */}
            <div 
              onClick={() => navigate('/office/subjectassignmentlist')}
              className="bg-white rounded-xl border border-slate-200 hover:border-sage-400 p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900 group-hover:text-sage-700 transition-colors">
                    Subject Assignments
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Map faculty instructors to curriculum subjects and section cohorts with auto student roster enrolment.
                  </p>
                </div>
              </div>
              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-sage-600 group-hover:text-sage-800">
                <span>Manage Classrooms</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Department Roster Card */}
            <div 
              onClick={() => navigate('/office/rosterimport')}
              className="bg-white rounded-xl border border-slate-200 hover:border-sage-400 p-5 shadow-xs hover:shadow-md transition-all cursor-pointer group flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="w-10 h-10 rounded-xl bg-sage-50 text-sage-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900 group-hover:text-sage-700 transition-colors">
                    Department Roster
                  </h4>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    View department students & faculty directory, register single late enrollees, or batch import Excel/CSV class rosters.
                  </p>
                </div>
              </div>
              <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-sage-600 group-hover:text-sage-800">
                <span>Manage Department Roster</span>
                <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </div>

        {/* Program Distribution & Summary */}
        {stats.programBreakdown.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 font-display">
                  Department Program Cohorts
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Student distribution across active degree programs in {userDepartmentName}
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-sage-700 bg-sage-50 px-2.5 py-1 rounded-lg border border-sage-200">
                {stats.totalStudents} Enrolled
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-1">
              {stats.programBreakdown.map((prog) => (
                <div key={prog.name} className="p-3.5 bg-slate-50 rounded-xl border border-slate-200/80 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 font-mono">{prog.name}</span>
                    <span className="text-[10px] font-semibold text-slate-400">{prog.percentage}%</span>
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-xl font-bold text-slate-900 font-mono">{prog.count}</span>
                    <span className="text-[11px] text-slate-500">Students</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </>
  );
}
