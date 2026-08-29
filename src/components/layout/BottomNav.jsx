import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  FileText, 
  BrainCircuit, 
  Calendar, 
  BookOpen, 
  Users, 
  BookMarked, 
  Layers, 
  Settings as SettingsIcon, 
  AlertCircle, 
  Shield, 
  ClipboardList, 
  BarChart3, 
  Star, 
  FileDown, 
  MoreHorizontal, 
  X, 
  ChevronRight
} from 'lucide-react';
import { cn } from '../../lib/utils';

export default function BottomNav() {
  const location = useLocation();
  const path = location.pathname;
  const role = path.split('/')[1] || '';

  const [moreOpen, setMoreOpen] = useState(false);

  // Close sheet on route change
  useEffect(() => {
    setMoreOpen(false);
  }, [location.pathname]);

  // If outside known portals, do not render
  if (!['student', 'faculty', 'dean', 'office', 'admin'].includes(role)) {
    return null;
  }

  // Navigation configuration per role
  const roleConfig = {
    student: {
      primary: [
        { to: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/student/dashboard' || p === '/student' },
        { to: '/student/mygradeslist', label: 'Grades', icon: FileText, match: (p) => p.startsWith('/student/mygrades') },
        { to: '/student/academic-insights', label: 'Insights', icon: BrainCircuit, match: (p) => p.startsWith('/student/academic-insights') || p.startsWith('/student/airecommendation') },
        { to: '/student/attendance', label: 'Attendance', icon: Calendar, match: (p) => p.startsWith('/student/attendance') },
        { to: '/student/evallist', label: 'Evaluations', icon: BookOpen, match: (p) => p.startsWith('/student/eval') },
      ],
      more: []
    },
    faculty: {
      primary: [
        { to: '/faculty/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/faculty/dashboard' || p === '/faculty' },
        { to: '/faculty/classrecordslist', label: 'Classes', icon: BookOpen, match: (p) => p.startsWith('/faculty/classrecords') || p.startsWith('/faculty/gradecomponents') || p.startsWith('/faculty/postedgrades') },
        { to: '/faculty/scoreinput', label: 'Scores', icon: FileText, match: (p) => p.startsWith('/faculty/scoreinput') || p.startsWith('/faculty/gradecomputation') },
        { to: '/faculty/classattendance', label: 'Attendance', icon: Calendar, match: (p) => p.startsWith('/faculty/classattendance') },
        { to: '/faculty/evalresultsmy', label: 'Eval Results', icon: FileText, match: (p) => p.startsWith('/faculty/evalresults') },
      ],
      more: []
    },
    dean: {
      primary: [
        { to: '/dean/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/dean/dashboard' || p === '/dean' },
        { to: '/dean/gradepostingstatus', label: 'Grading', icon: BookOpen, match: (p) => p.startsWith('/dean/gradeposting') },
        { to: '/dean/remarkoverriderequests', label: 'Remarks', icon: ClipboardList, match: (p) => p.startsWith('/dean/remarkoverride') },
        { to: '/dean/gradedistribution', label: 'Analytics', icon: BarChart3, match: (p) => p.startsWith('/dean/gradedistribution') },
      ],
      more: [
        { to: '/dean/evalresultsoverview', label: 'Faculty Evaluations', description: 'Monitor dean & student ratings', icon: Star },
        { to: '/dean/atriskstudents', label: 'At-Risk Students', description: 'Early warning indicators & intervention', icon: AlertCircle },
        { to: '/dean/summaryreports', label: 'Summary Reports', description: 'Export grade summaries & dean lists', icon: FileDown },
      ]
    },
    office: {
      primary: [
        { to: '/office/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/office/dashboard' || p === '/office' },
        { to: '/office/rosterimport', label: 'Roster', icon: Users, match: (p) => p.startsWith('/office/roster') },
        { to: '/office/subjectassignmentlist', label: 'Subjects', icon: BookOpen, match: (p) => p.startsWith('/office/subjectassignment') },
        { to: '/office/complianceaudit', label: 'Clearance', icon: ClipboardList, match: (p) => p.startsWith('/office/compliance') },
      ],
      more: [
        { to: '/office/evalformslist', label: 'Evaluation Forms', description: 'Build and manage survey instruments', icon: FileText },
        { to: '/office/evalwindowlist', label: 'Evaluation Windows', description: 'Open/close evaluation timelines', icon: Calendar },
        { to: '/office/studentsections', label: 'Student Sections', description: 'Academic load & section assignments', icon: Layers },
      ]
    },
    admin: {
      primary: [
        { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/admin/dashboard' || p === '/admin' },
        { to: '/admin/userlist', label: 'Users', icon: Users, match: (p) => p.startsWith('/admin/user') },
        { to: '/admin/subjectlist', label: 'Subjects', icon: BookMarked, match: (p) => p.startsWith('/admin/subject') },
        { to: '/admin/gradeoverride', label: 'Overrides', icon: AlertCircle, match: (p) => p.startsWith('/admin/gradeoverride') },
      ],
      more: [
        { to: '/admin/sectionlist', label: 'Sections Database', description: 'Manage class sections & capacities', icon: Layers },
        { to: '/admin/gradecomputationslist', label: 'Grading Templates', description: 'Configure dynamic component formulas', icon: SettingsIcon },
        { to: '/admin/departmentslist', label: 'Colleges & Depts', description: 'Manage academic divisions', icon: Layers },
        { to: '/admin/termmanagement', label: 'Term Management', description: 'Academic calendar & terms', icon: Calendar },
        { to: '/admin/auditlog', label: 'Audit Logs', description: 'Security audit trail & Manila timestamps', icon: Shield },
      ]
    }
  };

  const currentNav = roleConfig[role] || roleConfig.student;
  const hasMore = currentNav.more && currentNav.more.length > 0;

  // Check if current active route lives inside the "More" menu
  const isMoreActive = hasMore && currentNav.more.some(item => path.startsWith(item.to));

  return (
    <>
      {/* Bottom Tab Bar */}
      <nav 
        aria-label="Mobile Navigation" 
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-2 pt-1 pb-[max(env(safe-area-inset-bottom),0.5rem)]"
      >
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {/* Primary Tabs */}
          {currentNav.primary.map((item) => {
            const active = item.match(path);
            const Icon = item.icon;

            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-150 min-h-[48px] select-none",
                  active 
                    ? "text-sage-700 font-semibold" 
                    : "text-slate-500 hover:text-slate-800 font-medium"
                )}
              >
                {/* Active indicator bar */}
                {active && (
                  <span className="absolute -top-1 w-8 h-1 bg-sage-600 rounded-full animate-in fade-in zoom-in-50 duration-150" />
                )}

                {/* Icon */}
                <div className={cn(
                  "p-1 rounded-lg transition-transform duration-150",
                  active ? "bg-sage-100/70 text-sage-700 scale-105" : "text-slate-400"
                )}>
                  <Icon className="h-5 w-5" />
                </div>

                {/* Label */}
                <span className={cn(
                  "text-[10px] tracking-tight leading-tight mt-0.5 transition-colors",
                  active ? "text-sage-800 font-bold" : "text-slate-500"
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}

          {/* "More" Tab for roles with overflow items */}
          {hasMore && (
            <button
              type="button"
              onClick={() => setMoreOpen(!moreOpen)}
              className={cn(
                "relative flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-150 min-h-[48px] select-none cursor-pointer",
                (isMoreActive || moreOpen)
                  ? "text-sage-700 font-semibold" 
                  : "text-slate-500 hover:text-slate-800 font-medium"
              )}
            >
              {(isMoreActive || moreOpen) && (
                <span className="absolute -top-1 w-8 h-1 bg-sage-600 rounded-full animate-in fade-in zoom-in-50 duration-150" />
              )}

              <div className={cn(
                "p-1 rounded-lg transition-transform duration-150",
                (isMoreActive || moreOpen) ? "bg-sage-100/70 text-sage-700 scale-105" : "text-slate-400"
              )}>
                <MoreHorizontal className="h-5 w-5" />
              </div>

              <span className={cn(
                "text-[10px] tracking-tight leading-tight mt-0.5 transition-colors",
                (isMoreActive || moreOpen) ? "text-sage-800 font-bold" : "text-slate-500"
              )}>
                More
              </span>
            </button>
          )}
        </div>
      </nav>

      {/* "More" Slide-up Bottom Sheet Modal */}
      {hasMore && moreOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
            onClick={() => setMoreOpen(false)}
          />

          {/* Sheet Body */}
          <div className="relative w-full bg-white rounded-t-3xl shadow-2xl border-t border-slate-200 z-50 max-h-[82vh] flex flex-col animate-in slide-in-from-bottom duration-250 pb-[max(env(safe-area-inset-bottom),1rem)]">
            
            {/* Grab Handle */}
            <div className="pt-3 pb-1 flex justify-center">
              <div className="w-10 h-1.25 bg-slate-300 rounded-full" />
            </div>

            {/* Sheet Header */}
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-bold font-display text-slate-900 text-base">More Portals & Tools</h3>
                <p className="text-xs text-slate-400 capitalize">{role} Management</p>
              </div>
              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Sheet Items List */}
            <div className="p-4 space-y-2 overflow-y-auto flex-1 divide-y divide-slate-100">
              <div className="space-y-1.5 pb-2">
                {currentNav.more.map((item) => {
                  const active = path.startsWith(item.to);
                  const Icon = item.icon;

                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={() => setMoreOpen(false)}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-2xl transition-all",
                        active 
                          ? "bg-sage-50 border border-sage-200 text-sage-900 shadow-xs" 
                          : "hover:bg-slate-50 text-slate-800 border border-transparent"
                      )}
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors",
                          active ? "bg-sage-600 text-white" : "bg-slate-100 text-slate-600"
                        )}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className={cn("text-sm font-bold truncate", active ? "text-sage-900" : "text-slate-900")}>
                            {item.label}
                          </h4>
                          {item.description && (
                            <p className="text-xs text-slate-400 truncate mt-0.5">
                              {item.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className={cn("h-4 w-4 flex-shrink-0", active ? "text-sage-600" : "text-slate-300")} />
                    </Link>
                  );
                })}
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
}
