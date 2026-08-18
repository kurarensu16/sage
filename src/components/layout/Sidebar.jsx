import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { BookOpen, LayoutDashboard, Users, FileText, LogOut, Calendar, AlertCircle, BarChart3, Star, FileDown, Layers, BookMarked, Shield, ClipboardList, BrainCircuit, Download, X, Smartphone, Monitor, Settings } from 'lucide-react';
import { cn } from '../../lib/utils';
import SageLogo from './SageLogo';
import { useAuth } from '../../lib/AuthContext';
import { usePwaInstall } from '../../lib/usePwaInstall';

export default function Sidebar({ isCollapsed, mobileOpen, setMobileOpen }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { promptInstall, showGuideModal, setShowGuideModal, canNativeInstall } = usePwaInstall();
  const path = location.pathname;
  
  const role = path.split('/')[1] || 'faculty';

  const links = {
    admin: [
      { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/admin/userlist', icon: Users, label: 'User Management' },
      { to: '/admin/subjectlist', icon: BookMarked, label: 'Subjects Database' },
      { to: '/admin/sectionlist', icon: Layers, label: 'Sections Database' },
      { to: '/admin/gradeoverride', icon: AlertCircle, label: 'Grade Override' },
      { to: '/admin/auditlog', icon: Shield, label: 'Audit Logs' },
    ],
    office: [
      { to: '/office/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/office/rosterimport', icon: Users, label: 'Roster Import' },
      { to: '/office/complianceaudit', icon: ClipboardList, label: 'Clearance Audit' },
      { to: '/office/subjectassignmentlist', icon: BookOpen, label: 'Subject Assignments' },
      { to: '/office/evalformslist', icon: FileText, label: 'Evaluation Forms' },
      { to: '/office/evalwindowlist', icon: Calendar, label: 'Evaluation Windows' },
      { to: '/office/studentsections', icon: Layers, label: 'Student Sections' },
    ],
    faculty: [
      { to: '/faculty/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/faculty/classrecordslist', icon: BookOpen, label: 'Class Records' },
      { to: '/faculty/scoreinput', icon: FileText, label: 'Score Input' },
      { to: '/faculty/evalresultsmy', icon: FileText, label: 'Eval Results' },
    ],
    dean: [
      { to: '/dean/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/dean/gradepostingstatus', icon: BookOpen, label: 'Grading Status' },
      { to: '/dean/remarkoverriderequests', icon: ClipboardList, label: 'Remark Requests' },
      { to: '/dean/gradedistribution', icon: BarChart3, label: 'Grade Distribution' },
      { to: '/dean/evalresultsoverview', icon: Star, label: 'Faculty Evaluations' },
      { to: '/dean/atriskstudents', icon: AlertCircle, label: 'At-Risk Students' },
      { to: '/dean/summaryreports', icon: FileDown, label: 'Summary Reports' },
    ],
    student: [
      { to: '/student/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/student/mygradeslist', icon: FileText, label: 'My Grades' },
      { to: '/student/academic-insights', icon: BrainCircuit, label: 'Academic Insights' },
      { to: '/student/evallist', icon: BookOpen, label: 'Evaluations' },
    ]
  };

  const currentLinks = links[role] || links.faculty;

  const handleSignOut = async () => {
    navigate('/login', { replace: true });
    await signOut();
  };

  const sidebarInner = (
    <aside className={cn(
      "bg-sage-900 h-full flex flex-col flex-shrink-0 transition-all duration-300 w-full",
      isCollapsed ? "lg:w-16" : "lg:w-56"
    )}>
        {/* Header section */}
        <div className={cn(
          "border-b border-sage-800 flex items-center justify-between transition-all duration-300 flex-shrink-0",
          isCollapsed ? "p-4 justify-center h-16" : "px-6 py-4 h-20"
        )}>
            {isCollapsed ? (
              <SageLogo className="h-7 w-7 text-sage-400" title="SAGE" />
            ) : (
              <div>
                <h1 className="text-xl font-bold font-display text-white tracking-tight flex items-center gap-2">
                    <SageLogo className="h-6 w-6 text-sage-400" /> SAGE
                </h1>
                <p className="text-xs text-slate-400 mt-0.5 capitalize">{role} Portal</p>
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
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto min-h-0">
            {currentLinks.map((link) => (
                <NavLink 
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileOpen && setMobileOpen(false)}
                    title={isCollapsed ? link.label : undefined}
                    className={({ isActive }) => cn(
                        "flex items-center rounded-lg transition-all",
                        isCollapsed ? "justify-center p-2.5" : "gap-3 px-4 py-2.5 text-sm font-medium",
                        isActive 
                            ? "bg-sage-800 text-white border-l-2 border-sage-400" 
                            : "text-slate-300 hover:bg-sage-800 hover:text-white"
                    )}
                >
                    <link.icon className={cn("flex-shrink-0", isCollapsed ? "h-5 w-5" : "h-4 w-4")} /> 
                    {(!isCollapsed || mobileOpen) && <span>{link.label}</span>}
                </NavLink>
            ))}
        </nav>
        
        {/* Footer section (Settings, PWA Install & Sign Out) */}
        <div className="p-3 border-t border-sage-800 space-y-1 flex-shrink-0">
            {/* Account Settings Link */}
            <NavLink
              to={`/${role}/settings`}
              onClick={() => setMobileOpen && setMobileOpen(false)}
              title={isCollapsed ? "Account Settings" : undefined}
              className={({ isActive }) => cn(
                "w-full flex items-center rounded-lg transition-colors border-0 bg-transparent text-left",
                isCollapsed ? "justify-center p-2.5" : "gap-3 px-4 py-2 text-xs font-medium",
                isActive 
                  ? "bg-sage-800 text-white font-semibold" 
                  : "text-slate-300 hover:bg-sage-800 hover:text-white"
              )}
            >
              <Settings className="h-4 w-4 flex-shrink-0 text-slate-400" />
              {(!isCollapsed || mobileOpen) && <span>Account Settings</span>}
            </NavLink>

            {/* PWA Install Button */}
            <button
              onClick={promptInstall}
              title={isCollapsed ? "Install SAGE App" : undefined}
              className={cn(
                "w-full flex items-center bg-sage-800/90 hover:bg-sage-700 text-sage-100 hover:text-white rounded-lg transition-all border border-sage-700/60 font-medium cursor-pointer text-left shadow-sm group",
                isCollapsed ? "justify-center p-2.5" : "gap-3 px-3.5 py-2 text-xs"
              )}
            >
              <Download className="h-4 w-4 flex-shrink-0 text-emerald-400 group-hover:scale-110 transition-transform" />
              {(!isCollapsed || mobileOpen) && <span>Install SAGE App</span>}
            </button>

            {/* Sign Out Button */}
            <button 
              onClick={handleSignOut}
              title={isCollapsed ? "Sign Out" : undefined}
              className={cn(
                "w-full flex items-center text-slate-400 hover:text-white cursor-pointer transition-colors border-0 bg-transparent text-left rounded-lg",
                isCollapsed ? "justify-center p-2.5" : "gap-3 px-4 py-2 text-xs font-medium"
              )}
            >
                <LogOut className="h-4 w-4 flex-shrink-0" />
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

      {/* PWA Install Guide Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 text-slate-800 relative animate-in fade-in zoom-in duration-200">
            <button 
              onClick={() => setShowGuideModal(false)}
              className="absolute top-4 right-4 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-sage-100 text-sage-700 flex items-center justify-center font-bold">
                <Download className="h-5 w-5 text-sage-600" />
              </div>
              <div>
                <h3 className="font-bold font-display text-slate-900 text-lg">Install SAGE PWA</h3>
                <p className="text-xs text-slate-500">Run SAGE as a standalone app</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-600">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Monitor className="h-4 w-4 text-indigo-600" />
                  <span>Desktop (Chrome / Edge)</span>
                </div>
                <p>Click the <strong>Install icon (⊕)</strong> on the right side of your browser address bar above.</p>
              </div>

              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-1.5">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Smartphone className="h-4 w-4 text-emerald-600" />
                  <span>Mobile (Android / Safari iOS)</span>
                </div>
                <p><strong>Android:</strong> Tap browser menu <span className="font-bold">(⋮)</span> → <strong>Add to Home screen</strong>.</p>
                <p><strong>iOS Safari:</strong> Tap Share button <span className="font-bold">[⎋]</span> → <strong>Add to Home Screen</strong>.</p>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              {canNativeInstall && (
                <button
                  onClick={promptInstall}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  Install App Now
                </button>
              )}
              <button
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium text-xs transition-colors cursor-pointer"
              >
                {canNativeInstall ? 'Cancel' : 'Got It'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
