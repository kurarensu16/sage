import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  BrainCircuit,
  BookOpen,
  Users,
  BookMarked,
  AlertCircle,
  ClipboardList,
  Shield,
  GraduationCap,
  UserCheck,
  MoreHorizontal
} from 'lucide-react';
import { cn } from '../../lib/utils';

// Four shortcuts per role plus "More", which opens the full sidebar menu.
//
// TWO RULES THESE HAVE TO FOLLOW
// 1. Matches must not overlap. Each tab tests the path independently, so two
//    tabs matching the same page would both light up. `/registrar/section` as a
//    prefix would swallow `/registrar/sectionmasterlist`, which belongs to a
//    different tab -- hence the exact paths below rather than a loose prefix.
// 2. The four should cover the pages a role opens daily. Anything they miss
//    falls back to "More", which is correct for occasional pages (reports) and
//    wrong for core workflow -- Enrollment Management and Faculty Loading had
//    no tab at all before this.
const PRIMARY_TABS = {
  student: [
    { to: '/student/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/student/dashboard' || p === '/student' },
    // Attendance rides with Subjects: it is recorded per subject, and the
    // sidebar groups it there too.
    { to: '/student/mysubjects', label: 'Subjects', icon: BookMarked, match: (p) => p.startsWith('/student/mysubjects') || p.startsWith('/student/attendance') },
    { to: '/student/mygradeslist', label: 'Grades', icon: FileText, match: (p) => p.startsWith('/student/mygrades') || p === '/student/grades' },
    { to: '/student/advising-inbox', label: 'Support', icon: BrainCircuit, match: (p) => p.startsWith('/student/advising-inbox') || p.startsWith('/student/academic-insights') || p.startsWith('/student/airecommendation') || p.startsWith('/student/consultations') || p.startsWith('/student/graderequests') || p.startsWith('/student/tutor') },
  ],
  faculty: [
    { to: '/faculty/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/faculty/dashboard' || p === '/faculty' },
    // Attendance folded in here, matching the sidebar: it is taken per class,
    // and this frees a slot for Grades, which had none.
    { to: '/faculty/classrecordslist', label: 'Classes', icon: BookOpen, match: (p) => p.startsWith('/faculty/classrecords') || p.startsWith('/faculty/gradecomponents') || p.startsWith('/faculty/scoreinput') || p.startsWith('/faculty/gradecomputation') || p.startsWith('/faculty/postedgrades') || p.startsWith('/faculty/classattendance') },
    { to: '/faculty/evaluatestudent', label: 'Support', icon: ClipboardList, match: (p) => p.startsWith('/faculty/evaluate') },
    { to: '/faculty/consultations', label: 'Grades', icon: FileText, match: (p) => p.startsWith('/faculty/consultations') || p.startsWith('/faculty/graderequests') },
  ],
  dean: [
    { to: '/dean/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/dean/dashboard' || p === '/dean' },
    { to: '/dean/gradepostingstatus', label: 'Grades', icon: BookOpen, match: (p) => p.startsWith('/dean/gradeposting') || p.startsWith('/dean/remarkoverride') || p.startsWith('/dean/graderequests') || p.startsWith('/dean/gradedistribution') },
    { to: '/dean/atriskstudents', label: 'Risk', icon: AlertCircle, match: (p) => p.startsWith('/dean/atriskstudents') || p.startsWith('/dean/escalatedcases') || p.startsWith('/dean/interventionresults') },
    // Replaces the Reports tab. Faculty loading is a term-start workflow with
    // several steps; generating a report is one occasional page, so it is the
    // better candidate for "More".
    { to: '/dean/facultyloading', label: 'Loading', icon: GraduationCap, match: (p) => p.startsWith('/dean/facultyloading') },
  ],
  admin: [
    { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/admin/dashboard' || p === '/admin' },
    { to: '/admin/userlist', label: 'Users', icon: Users, match: (p) => p.startsWith('/admin/user') },
    { to: '/admin/studentaccountrequests', label: 'Requests', icon: BookMarked, match: (p) => p.startsWith('/admin/studentaccountrequests') },
    // One tab for the whole System Maintenance group, so Storage Health,
    // Maintenance Mode and Backup & Restore each highlight it rather than
    // leaving no tab active.
    { to: '/admin/auditlog', label: 'System', icon: Shield, match: (p) => p.startsWith('/admin/auditlog') || p.startsWith('/admin/systemhealth') || p.startsWith('/admin/storagehealth') || p.startsWith('/admin/maintenance') || p.startsWith('/admin/backup') },
  ],
  registrar: [
    { to: '/registrar/dashboard', label: 'Dashboard', icon: LayoutDashboard, match: (p) => p === '/registrar/dashboard' || p === '/registrar' },
    // Exact section paths, not a '/registrar/section' prefix: that would also
    // swallow sectionmasterlist, which belongs to the Enrolment tab.
    { to: '/registrar/subjectlist', label: 'Setup', icon: BookMarked, match: (p) => p.startsWith('/registrar/subject') || p.startsWith('/registrar/program') || p.startsWith('/registrar/gradecomputations') || p.startsWith('/registrar/sectionlist') || p.startsWith('/registrar/sectionform') || p.startsWith('/registrar/departments') || p.startsWith('/registrar/termmanagement') },
    // The registrar's term-start workflow, which had no tab at all: enrolment,
    // faculty loading and rosters were all reachable only through "More".
    { to: '/registrar/enrollment', label: 'Enrolment', icon: UserCheck, match: (p) => p.startsWith('/registrar/enrollment') || p.startsWith('/registrar/facultyloading') || p.startsWith('/registrar/sectionmasterlist') || p.startsWith('/registrar/newstudentaccounts') || p.startsWith('/registrar/viewusers') },
    { to: '/registrar/gradeoverride', label: 'Grades', icon: Shield, match: (p) => p.startsWith('/registrar/gradeoverride') || p.startsWith('/registrar/lategradechanges') },
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
