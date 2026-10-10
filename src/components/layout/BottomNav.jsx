import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  BrainCircuit,
  Calendar,
  BookOpen,
  Users,
  BookMarked,
  AlertCircle,
  ClipboardList,
  BarChart3,
  MoreHorizontal
} from 'lucide-react';
import { cn } from '../../lib/utils';

// Shortcuts to the most-used pages per role. Every page, including these, is also
// reachable from "More", which opens the full sidebar menu (all groups and pages).
const PRIMARY_TABS = {
  student: [
    { to: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/student/dashboard' || p === '/student' },
    { to: '/student/mygradeslist', label: 'Grades', icon: FileText, match: (p) => p.startsWith('/student/mygrades') },
    { to: '/student/advising-inbox', label: 'Advising', icon: ClipboardList, match: (p) => p.startsWith('/student/advising-inbox') },
    { to: '/student/academic-insights', label: 'Insights', icon: BrainCircuit, match: (p) => p.startsWith('/student/academic-insights') || p.startsWith('/student/airecommendation') },
  ],
  faculty: [
    { to: '/faculty/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/faculty/dashboard' || p === '/faculty' },
    { to: '/faculty/classrecordslist', label: 'Classes', icon: BookOpen, match: (p) => p.startsWith('/faculty/classrecords') || p.startsWith('/faculty/gradecomponents') || p.startsWith('/faculty/postedgrades') },
    { to: '/faculty/scoreinput', label: 'Scores', icon: FileText, match: (p) => p.startsWith('/faculty/scoreinput') || p.startsWith('/faculty/gradecomputation') },
    { to: '/faculty/classattendance', label: 'Attendance', icon: Calendar, match: (p) => p.startsWith('/faculty/classattendance') },
  ],
  dean: [
    { to: '/dean/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/dean/dashboard' || p === '/dean' },
    { to: '/dean/gradepostingstatus', label: 'Grading', icon: BookOpen, match: (p) => p.startsWith('/dean/gradeposting') },
    { to: '/dean/atriskstudents', label: 'At-Risk Matrix', icon: AlertCircle, match: (p) => p.startsWith('/dean/atriskstudents') },
    { to: '/dean/gradedistribution', label: 'Analytics', icon: BarChart3, match: (p) => p.startsWith('/dean/gradedistribution') },
  ],
  admin: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/admin/dashboard' || p === '/admin' },
    { to: '/admin/userlist', label: 'Users', icon: Users, match: (p) => p.startsWith('/admin/user') },
    { to: '/admin/subjectlist', label: 'Subjects', icon: BookMarked, match: (p) => p.startsWith('/admin/subject') },
    { to: '/admin/gradeoverride', label: 'Overrides', icon: AlertCircle, match: (p) => p.startsWith('/admin/gradeoverride') },
  ],
};

function TabContent({ icon: Icon, label, active }) {
  return (
    <>
      {active && (
        <span className="absolute -top-1 w-8 h-1 bg-sage-600 rounded-full animate-in fade-in zoom-in-50 duration-150" />
      )}
      <div className={cn(
        "p-1 rounded-lg transition-transform duration-150",
        active ? "bg-sage-100/70 text-sage-700 scale-105" : "text-slate-400"
      )}>
        <Icon className="h-5 w-5" />
      </div>
      <span className={cn(
        "text-[10px] tracking-tight leading-tight mt-0.5 transition-colors",
        active ? "text-sage-800 font-bold" : "text-slate-500"
      )}>
        {label}
      </span>
    </>
  );
}

export default function BottomNav({ onOpenMenu, menuOpen = false }) {
  const { pathname: path } = useLocation();
  const role = path.split('/')[1] || '';
  const tabs = PRIMARY_TABS[role];

  // If outside known portals, do not render
  if (!tabs) return null;

  // "More" is highlighted while the menu is open or the current page has no shortcut tab.
  const moreActive = menuOpen || !tabs.some(item => item.match(path));
  const tabClass = (active) => cn(
    "relative flex flex-col items-center justify-center flex-1 py-1 px-1 rounded-xl transition-all duration-150 min-h-[48px] select-none",
    active ? "text-sage-700 font-semibold" : "text-slate-500 hover:text-slate-800 font-medium"
  );

  return (
    <nav
      aria-label="Mobile Navigation"
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] px-2 pt-1 pb-[max(env(safe-area-inset-bottom),0.5rem)]"
    >
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {tabs.map((item) => {
          const active = !menuOpen && item.match(path);
          return (
            <Link key={item.to} to={item.to} className={tabClass(active)} aria-current={active ? 'page' : undefined}>
              <TabContent icon={item.icon} label={item.label} active={active} />
            </Link>
          );
        })}

        <button
          type="button"
          onClick={onOpenMenu}
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          aria-label="More: open the full menu"
          className={cn(tabClass(moreActive), "cursor-pointer")}
        >
          <TabContent icon={MoreHorizontal} label="More" active={moreActive} />
        </button>
      </div>
    </nav>
  );
}
