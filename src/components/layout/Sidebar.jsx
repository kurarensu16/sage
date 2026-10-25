import { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { 
  BookOpen, 
  LayoutDashboard, 
  Users, 
  FileText, 
  LogOut, 
  Calendar, 
  AlertCircle, 
  BarChart3, 
  FileDown, 
  Layers, 
  BookMarked, 
  Shield, 
  ClipboardList, 
  BrainCircuit, 
  Download, 
  X, 
  Smartphone, 
  Settings, 
  GraduationCap,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  ClipboardCheck,
  CheckCircle2,
  FileSpreadsheet,
  Building2,
  PlusCircle,
  BarChart2,
  TrendingUp
} from 'lucide-react';
import { cn } from '../../lib/utils';
import SageLogo from './SageLogo';
import SmartInstallModal from './SmartInstallModal';
import { useAuth } from '../../lib/AuthContext';
import { usePwaInstall } from '../../lib/usePwaInstall';

// Navigation configuration conforming to ASPIRE Sidebar Navigation Developer Documentation (§4 & §6)
const PORTAL_NAVIGATION = {
  student: [
    {
      standalone: true,
      to: '/student/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard
    },
    {
      id: 'grades',
      label: 'Courses & Grades',
      icon: BookOpen,
      items: [
        { to: '/student/mysubjects', label: 'My Subjects', icon: BookMarked },
        { to: '/student/mygradeslist', label: 'Grade Report', icon: FileText, activeOn: ['/student/grades'] }
      ]
    },
    {
      id: 'attendance',
      label: 'My Attendance',
      icon: Calendar,
      items: [
        { to: '/student/attendance', label: 'Attendance & Warnings', icon: Calendar }
      ]
    },
    {
      id: 'academic_support',
      label: 'Academic Support',
      icon: BrainCircuit,
      items: [
        { to: '/student/advising-inbox', label: 'Advisories & Study Plans', icon: ClipboardList },
        { to: '/student/academic-insights', label: 'AI Study Tutor', icon: BrainCircuit }
      ]
    },
    {
      id: 'consultations',
      label: 'Consultations',
      icon: MessageSquare,
      items: [
        { to: '/student/consultations', label: 'Consultations', icon: MessageSquare }
      ]
    }
  ],

  faculty: [
    {
      standalone: true,
      to: '/faculty/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard
    },
    {
      id: 'classes',
      label: 'Classes',
      icon: GraduationCap,
      items: [
        { to: '/faculty/classrecordslist', label: 'My Classes', icon: BookOpen },
        { to: '/faculty/classrecordslist?action=create', label: 'Create Classroom', icon: PlusCircle },
        { to: '/faculty/enrollmentrequests', label: 'Enrollment Requests', icon: Users }
      ]
    },
    {
      id: 'student_support',
      label: 'Student Support',
      icon: AlertCircle,
      items: [
        { to: '/faculty/evaluatestudent', label: 'Evaluate Students', icon: ClipboardCheck },
        { to: '/faculty/evaluatedstudents', label: 'Intervention Records', icon: CheckCircle2 }
      ]
    },
    {
      id: 'attendance',
      label: 'Attendance',
      icon: Calendar,
      items: [
        { to: '/faculty/classattendance', label: 'Attendance Monitoring', icon: Calendar }
      ]
    },
    {
      id: 'consultations',
      label: 'Consultations',
      icon: MessageSquare,
      items: [
        { to: '/faculty/consultations', label: 'Consultation Requests', icon: MessageSquare }
      ]
    },
    {
      id: 'reports',
      label: 'Performance Reports',
      icon: BarChart2,
      items: [
        { to: '/faculty/reports/class-performance', label: 'Class Performance', icon: BarChart2 },
        { to: '/faculty/reports/comparison', label: 'Comparisons & Trends', icon: TrendingUp }
      ]
    }
  ],

  dean: [
    {
      standalone: true,
      to: '/dean/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard
    },
    {
      id: 'grades',
      label: 'Grades',
      icon: FileText,
      items: [
        { to: '/dean/gradepostingstatus', label: 'Grade Submission Status', icon: BookOpen },
        { to: '/dean/remarkoverriderequests', label: 'Grade Corrections', icon: ClipboardList },
        { to: '/dean/gradedistribution', label: 'Grade Distribution', icon: BarChart3 }
      ]
    },
    {
      id: 'student_risk',
      label: 'Risk & Interventions',
      icon: AlertCircle,
      items: [
        { to: '/dean/atriskstudents', label: 'Risk & Honors Overview', icon: AlertCircle },
        { to: '/dean/escalatedcases', label: 'Escalated Cases', icon: Users, activeOn: ['/dean/atriskstudents?tab=discussion_queue'] },
        { to: '/dean/interventionresults', label: 'Intervention Results', icon: CheckCircle2, activeOn: ['/dean/atriskstudents?tab=outcomes_tracker'] }
      ]
    },
    {
      id: 'reports',
      label: 'Reports',
      icon: FileDown,
      items: [
        { to: '/dean/summaryreports', label: 'Generate Reports', icon: FileDown }
      ]
    }
  ],

  admin: [
    {
      standalone: true,
      to: '/admin/dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard
    },
    {
      id: 'user_accounts',
      label: 'User Accounts',
      icon: Users,
      items: [
        { to: '/admin/userlist', label: 'Manage Users', icon: Users },
        { to: '/admin/userlist?action=import', label: 'Import Users (CSV/Excel)', icon: FileSpreadsheet }
      ]
    },
    {
      id: 'academic_setup',
      label: 'Academic Setup',
      icon: BookMarked,
      items: [
        { to: '/admin/subjectlist', label: 'Subjects', icon: BookMarked },
        { to: '/admin/gradecomputationslist', label: 'Grading Templates', icon: Settings },
        { to: '/admin/sectionlist', label: 'Manage Sections', icon: Layers },
        { to: '/admin/sectionmasterlist', label: 'Section Rosters', icon: ClipboardList },
        { to: '/admin/departmentslist', label: 'Colleges & Departments', icon: Building2 },
        { to: '/admin/classrooms', label: 'Classroom Provisioning', icon: GraduationCap }
      ]
    },
    {
      id: 'system',
      label: 'System',
      icon: Shield,
      items: [
        { to: '/admin/auditlog', label: 'Audit Logs', icon: Shield },
        { to: '/admin/termmanagement', label: 'Academic Terms', icon: Calendar },
        { to: '/admin/gradeoverride', label: 'Grade Override', icon: AlertCircle }
      ]
    }
  ]
};

function getActiveTargets(item) {
  return [item.to, ...(item.activeOn || [])];
}

function targetMatchesLocation(target, location) {
  const [targetPathWithHash, targetQuery = ''] = target.split('?');
  const [targetPath] = targetPathWithHash.split('#');
  if (location.pathname !== targetPath) return false;

  const targetParams = new URLSearchParams(targetQuery);
  const currentParams = new URLSearchParams(location.search);
  for (const [key, val] of targetParams.entries()) {
    if (currentParams.get(key) !== val) return false;
  }
  return true;
}

// A base-path item stays active for ordinary query parameters, but yields to a
// sibling with a matching query-specific target (for example action=create).
function isItemActive(item, location, siblingItems = []) {
  const targets = getActiveTargets(item);
  const matchingTargets = targets.filter(target => targetMatchesLocation(target, location));
  if (!matchingTargets.length) return false;
  if (matchingTargets.some(target => target.includes('?'))) return true;

  return !siblingItems.some(sibling => sibling !== item && getActiveTargets(sibling).some(target => (
    target.includes('?') && targetMatchesLocation(target, location)
  )));
}

export default function Sidebar({ isCollapsed, mobileOpen, setMobileOpen }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user, profile } = useAuth();
  const { 
    platform,
    isInstalled,
    canNativeInstall,
    downloadApk,
    promptInstall, 
    showGuideModal, 
    setShowGuideModal,
    activeTab,
    setActiveTab
  } = usePwaInstall();
  
  const path = location.pathname;
  const role = path.split('/')[1] || 'faculty';
  const actorName = profile?.first_name ? `${profile.first_name} ${profile.last_name}` : (user?.email || 'Institutional User');

  const groups = PORTAL_NAVIGATION[role] || PORTAL_NAVIGATION.faculty;

  const standaloneTop = groups.find(g => g.standalone);
  const regularGroups = groups.filter(g => !g.standalone);

  // Auto-expand all groups by default, or auto-expand the active section
  const [expandedGroups, setExpandedGroups] = useState(() => {
    const allGroupIds = groups.filter(g => !g.standalone).map(g => g.id);
    return new Set(allGroupIds);
  });

  // Ensure the section containing the active route is always expanded
  useEffect(() => {
    groups.forEach(group => {
      if (group.items?.some(item => isItemActive(item, location, group.items))) {
        setExpandedGroups(prev => {
          if (prev.has(group.id)) return prev;
          const next = new Set(prev);
          next.add(group.id);
          return next;
        });
      }
    });
  }, [location, groups]);

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const handleSignOut = async () => {
    navigate('/login', { replace: true });
    await signOut();
  };

  // Platform-specific label and icon for install trigger
  const installButtonConfig = {
    android: {
      label: 'Download Android App (.APK)',
      icon: Smartphone,
      iconColor: 'text-sage-300'
    },
    ios: {
      label: 'Add to Home Screen',
      icon: Smartphone,
      iconColor: 'text-sage-300'
    },
    desktop: {
      label: 'Install Desktop App',
      icon: Download,
      iconColor: 'text-sage-300'
    }
  }[platform] || {
    label: 'Install ASPIRE App',
    icon: Download,
    iconColor: 'text-sage-300'
  };

  const InstallIcon = installButtonConfig.icon;

  const sidebarInner = (
    <aside className={cn(
      "bg-sage-900 h-full flex flex-col flex-shrink-0 transition-all duration-300 w-full",
      isCollapsed ? "lg:w-16" : "lg:w-60"
    )}>
      {/* Header section */}
      <div className={cn(
        "border-b border-sage-800 flex items-center justify-between transition-all duration-300 flex-shrink-0",
        isCollapsed && !mobileOpen ? "p-4 justify-center h-16" : "px-5 py-4 h-20"
      )}>
        {isCollapsed && !mobileOpen ? (
          <SageLogo variant="white" className="h-7 w-7" title="ASPIRE" />
        ) : (
          <div>
            <h1 className="text-xl font-bold font-display text-white tracking-tight flex items-center gap-2">
              <SageLogo variant="white" className="h-6 w-6" /> ASPIRE
            </h1>
            <p className="text-tiny font-semibold text-slate-400 mt-0.5 tracking-wider uppercase font-mono">
              {role.toUpperCase()} PORTAL
            </p>
          </div>
        )}

        {/* Mobile close button */}
        {mobileOpen && (
          <button 
            onClick={() => setMobileOpen && setMobileOpen(false)}
            className="lg:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-sage-800 cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
      
      {/* Navigation list */}
      <nav className="flex-1 p-2.5 space-y-2 overflow-y-auto min-h-0 text-left sleek-scrollbar-dark">
        {/* Standalone Dashboard */}
        {standaloneTop && (
          <NavLink 
            to={standaloneTop.to}
            onClick={() => setMobileOpen && setMobileOpen(false)}
            title={isCollapsed ? standaloneTop.label : undefined}
            className={({ isActive }) => cn(
              "flex items-center rounded-lg transition-all",
              isCollapsed ? "justify-center p-2.5" : "gap-3 px-3.5 py-2.5 text-sm font-medium",
              isActive 
                ? "bg-sage-800 text-white font-semibold border-l-2 border-sage-400 shadow-xs" 
                : "text-slate-300 hover:bg-sage-800/80 hover:text-white"
            )}
          >
            <standaloneTop.icon className={cn("flex-shrink-0", isCollapsed ? "h-5 w-5" : "h-4 w-4 text-sage-300")} /> 
            {(!isCollapsed || mobileOpen) && <span>{standaloneTop.label}</span>}
          </NavLink>
        )}

        {/* Grouped Collapsible Modules */}
        {regularGroups.map((group) => {
          const isExpanded = expandedGroups.has(group.id);
          const hasActiveChild = group.items.some(item => isItemActive(item, location, group.items));

          if (isCollapsed && !mobileOpen) {
            // Icon-only view when collapsed on desktop: show first item or group icon
            const primaryItem = group.items[0];
            return (
              <NavLink
                key={group.id}
                to={primaryItem.to}
                title={`${group.label}: ${primaryItem.label}`}
                className={cn(
                  "flex items-center justify-center p-2.5 rounded-lg transition-all",
                  hasActiveChild
                    ? "bg-sage-800 text-white font-semibold border-l-2 border-sage-400"
                    : "text-slate-300 hover:bg-sage-800/80 hover:text-white"
                )}
              >
                <group.icon className="h-5 w-5 flex-shrink-0" />
              </NavLink>
            );
          }

          return (
            <div key={group.id} className="space-y-0.5">
              {/* Collapsible Group Header */}
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                className="w-full flex items-center justify-between px-3 py-1.5 text-micro font-extrabold text-slate-400 hover:text-slate-200 tracking-wider uppercase rounded-md hover:bg-sage-800/40 transition-colors select-none cursor-pointer"
              >
                <div className="flex items-center gap-1.5">
                  {isExpanded ? (
                    <ChevronDown className="h-3 w-3 text-sage-400 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3 w-3 text-slate-500 shrink-0" />
                  )}
                  <span>{group.label}</span>
                </div>
              </button>

              {/* Sub-Pages List */}
              {isExpanded && (
                <div className="pl-3 space-y-0.5">
                  {group.items.map((item) => {
                    const active = isItemActive(item, location, group.items);
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileOpen && setMobileOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-xs transition-all",
                          active
                            ? "bg-sage-800 text-white font-semibold border-l-2 border-sage-400 shadow-xs"
                            : "text-slate-300 hover:text-white hover:bg-sage-800/60"
                        )}
                      >
                        <item.icon className={cn("h-3.5 w-3.5 flex-shrink-0", active ? "text-sage-300" : "text-slate-400")} />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
      
      {/* Footer section (Settings, Adaptive Install & Sign Out) */}
      <div className="p-2.5 border-t border-sage-800 space-y-1.5 flex-shrink-0 text-left">
        {/* Settings */}
        <NavLink
          to={`/${role}/settings`}
          title={isCollapsed ? "Settings" : undefined}
          onClick={() => setMobileOpen && setMobileOpen(false)}
          className={({ isActive }) => cn(
            "w-full flex items-center text-slate-300 hover:text-white hover:bg-sage-800 rounded-lg transition-colors cursor-pointer",
            isCollapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-1.5 text-xs font-medium",
            isActive && "bg-sage-800 text-white font-semibold border-l-2 border-sage-400"
          )}
        >
          <Settings className={cn("flex-shrink-0", isCollapsed ? "h-5 w-5" : "h-3.5 w-3.5")} />
          {(!isCollapsed || mobileOpen) && <span>Settings</span>}
        </NavLink>

        {/* Adaptive Device-Aware Install Button */}
        {!isInstalled && (
          <button
            type="button"
            onClick={promptInstall}
            title={isCollapsed ? installButtonConfig.label : undefined}
            className={cn(
              "w-full flex items-center bg-sage-800/90 hover:bg-sage-700 text-sage-100 hover:text-white rounded-lg transition-all border border-sage-700/60 font-medium cursor-pointer text-left shadow-2xs group",
              isCollapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-1.5 text-xs"
            )}
          >
            <InstallIcon className={cn("h-3.5 w-3.5 flex-shrink-0 group-hover:scale-110 transition-transform", installButtonConfig.iconColor)} />
            {(!isCollapsed || mobileOpen) && <span className="truncate">{installButtonConfig.label}</span>}
          </button>
        )}

        {/* Sign Out Button */}
        <button 
          type="button"
          onClick={handleSignOut}
          title={isCollapsed ? "Sign Out" : undefined}
          className={cn(
            "w-full flex items-center text-slate-400 hover:text-rose-300 hover:bg-rose-950/20 cursor-pointer transition-colors border-0 bg-transparent text-left rounded-lg",
            isCollapsed ? "justify-center p-2.5" : "gap-2.5 px-3 py-1.5 text-xs font-medium"
          )}
        >
          <LogOut className="h-3.5 w-3.5 flex-shrink-0" />
          {(!isCollapsed || mobileOpen) && <span>Sign Out</span>}
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <div className="hidden lg:block h-full">
        {sidebarInner}
      </div>

      {/* Mobile/Tablet drawer overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setMobileOpen && setMobileOpen(false)}
          />
          <div className="relative flex-1 max-w-xs w-full bg-sage-900 h-full shadow-2xl z-50">
            {sidebarInner}
          </div>
        </div>
      )}

      {/* Smart Adaptive Install Modal */}
      <SmartInstallModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        platform={platform}
        downloadApk={downloadApk}
        canNativeInstall={canNativeInstall}
        promptInstall={promptInstall}
        actorName={actorName}
      />
    </>
  );
}
