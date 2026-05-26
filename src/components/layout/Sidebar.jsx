import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { BookOpen, LayoutDashboard, Users, FileText, Bell, LogOut, Plus, Calendar, AlertCircle, BarChart3, Star, FileDown } from 'lucide-react';
import { cn } from '../../lib/utils';
import SageLogo from './SageLogo';

export default function Sidebar({ isCollapsed }) {
  const location = useLocation();
  const path = location.pathname;
  
  const role = path.split('/')[1] || 'faculty';

  const links = {
    admin: [
      { to: '/admin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/admin/userlist', icon: Users, label: 'User Management' },
      { to: '/admin/classmanagementlist', icon: BookOpen, label: 'Classrooms' },
      { to: '/admin/evalformslist', icon: FileText, label: 'Evaluation Forms' },
      { to: '/admin/evalwindowlist', icon: Calendar, label: 'Evaluation Windows' },
      { to: '/admin/gradeoverride', icon: AlertCircle, label: 'Grade Override' },
      { to: '/admin/activitylog', icon: Bell, label: 'Activity Log' },
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
      { to: '/dean/gradedistribution', icon: BarChart3, label: 'Grade Distribution' },
      { to: '/dean/evalresultsoverview', icon: Star, label: 'Faculty Evaluations' },
      { to: '/dean/atriskstudents', icon: AlertCircle, label: 'At-Risk Students' },
      { to: '/dean/summaryreports', icon: FileDown, label: 'Summary Reports' },
    ],
    student: [
      { to: '/student/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { to: '/student/mygradeslist', icon: FileText, label: 'My Grades' },
      { to: '/student/evallist', icon: BookOpen, label: 'Evaluations' },
    ]
  };

  const currentLinks = links[role] || links.faculty;

  return (
    <aside className={cn(
      "bg-sage-900 h-full flex flex-col flex-shrink-0 transition-all duration-300",
      isCollapsed ? "w-16" : "w-56"
    )}>
        {/* Header section */}
        <div className={cn(
          "border-b border-sage-800 flex flex-col justify-center transition-all duration-300",
          isCollapsed ? "p-4 items-center h-16" : "p-6 h-24"
        )}>
            {isCollapsed ? (
              <SageLogo className="h-7 w-7 text-sage-400" title="SAGE Portal" />
            ) : (
              <>
                <h1 className="text-xl font-bold font-display text-white tracking-tight flex items-center gap-2">
                    <SageLogo className="h-6 w-6 text-sage-400" /> SAGE
                </h1>
                <p className="text-xs text-slate-400 mt-1 capitalize">{role} Portal</p>
              </>
            )}
        </div>
        
        {/* Navigation list */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {currentLinks.map((link) => (
                <NavLink 
                    key={link.to}
                    to={link.to}
                    title={isCollapsed ? link.label : undefined}
                    className={({ isActive }) => cn(
                        "flex items-center rounded-lg transition-all",
                        isCollapsed ? "justify-center p-2.5" : "gap-3 px-4 py-2.5 text-sm",
                        isActive 
                            ? "bg-sage-800 text-white border-l-2 border-sage-400" 
                            : "text-slate-300 hover:bg-sage-800 hover:text-white"
                    )}
                >
                    <link.icon className={cn("flex-shrink-0", isCollapsed ? "h-5 w-5" : "h-4 w-4")} /> 
                    {!isCollapsed && <span>{link.label}</span>}
                </NavLink>
            ))}
        </nav>
        
        {/* Sign out section */}
        <div className="p-3 border-t border-sage-800">
            <NavLink 
              to="/login" 
              title={isCollapsed ? "Sign Out" : undefined}
              className={cn(
                "flex items-center text-slate-400 hover:text-white cursor-pointer transition-colors",
                isCollapsed ? "justify-center py-2" : "gap-3 px-4 py-2 text-sm"
              )}
            >
                <LogOut className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && <span>Sign Out</span>}
            </NavLink>
        </div>
    </aside>
  );
}

