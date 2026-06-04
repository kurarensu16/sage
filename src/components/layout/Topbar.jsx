import React from 'react';
import { useAuth } from '../../lib/AuthContext';
import { useLocation, Link } from 'react-router-dom';
import { Search, Bell, Settings, PanelLeft } from 'lucide-react';

export default function Topbar({ toggleSidebar, isCollapsed }) {
  const location = useLocation();
  const path = location.pathname;
  const role = path.split('/')[1] || 'faculty';

  // Role details mapping
  const roleMeta = {
    admin: {
      name: 'Admin System Control',
      email: 'admin@sage.edu.ph',
      title: 'Administrator',
      avatarBg: 'bg-indigo-100 text-indigo-700 border-indigo-200'
    },
    faculty: {
      name: 'Prof. Amanda Rivera',
      email: 'a.rivera@sage.edu.ph',
      title: 'Senior Faculty',
      avatarBg: 'bg-sage-100 text-sage-800 border-sage-200'
    },
    dean: {
      name: 'Dr. Carlos Valdes',
      email: 'c.valdes@sage.edu.ph',
      title: 'College Dean',
      avatarBg: 'bg-emerald-100 text-emerald-800 border-emerald-200'
    },
    student: {
      name: 'Student',
      email: 'student@sage.edu.ph',
      title: 'Student',
      avatarBg: 'bg-blue-100 text-blue-800 border-blue-200'
    }
  };

  const { profile } = useAuth();
  const currentMeta = roleMeta[role] || roleMeta.faculty;
  const displayName = profile?.first_name ? `${profile.first_name} ${profile.last_name}` : currentMeta.name;
  // Determine title based on role
  const displayTitle = (() => {
    if (role === 'student') {
      const prog = profile?.program || '';
      const year = profile?.year_level || profile?.yearLevel || '';
      return [prog, year].filter(Boolean).join(' • ') || currentMeta.title;
    }
    // faculty and dean (and admin) show department/college
    const dept = profile?.departments?.name || profile?.department || profile?.department_name || '';
    return dept || currentMeta.title;
  })();

  return (
    <header className="bg-white border-b border-slate-200 h-16 px-8 flex items-center justify-between flex-shrink-0 z-20">
      
      {/* Left controls: Toggle button & Search bar */}
      <div className="flex items-center gap-4 flex-1 max-w-lg">
        <button 
          onClick={toggleSidebar}
          className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors"
          title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          <PanelLeft className="h-5 w-5" />
        </button>

        <div className="relative w-full hidden md:block">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input 
            type="text" 
            placeholder="Search files, grades, evaluations..." 
            className="block w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:ring-1 focus:ring-sage-500 focus:border-sage-500 transition-all outline-none"
          />
        </div>
      </div>


      <div className="md:hidden flex items-center">
        <span className="font-bold font-display text-slate-900 tracking-tight">SAGE Portal</span>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-4">
        
        {/* Settings Icon */}
        <Link 
          to={`/${role}/settings`}
          title="Account Settings"
          className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors block"
        >
          <Settings className="h-5 w-5" />
        </Link>

        {/* Notifications Icon */}
        <div className="relative">
          <Link 
            to={`/${role}/notifications`}
            title="Notifications"
            className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-900 transition-colors block"
          >
            <Bell className="h-5 w-5" />
            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-rose-600 rounded-full border-2 border-white"></span>
          </Link>
        </div>

        {/* Vertical Divider */}
        <div className="h-8 w-px bg-slate-200"></div>

        {/* Profile Dropdown Block */}
        <div className="flex items-center gap-3 cursor-pointer group select-none">
          <div className={`w-8 h-8 rounded-full border font-bold text-xs flex items-center justify-center font-mono ${currentMeta.avatarBg}`}>
            {currentMeta.name.split(' ').map(n => n[0]).filter(Boolean).slice(-2).join('')}
          </div>
          
          <div className="hidden lg:block text-left">
            <h4 className="text-xs font-bold text-slate-800 leading-tight group-hover:text-slate-900">
              {displayName}
            </h4>
            <span className="text-[10px] text-slate-400 font-medium">
              {displayTitle}
            </span>
          </div>
        </div>

      </div>

    </header>
  );
}
