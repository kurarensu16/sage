import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="h-screen flex overflow-hidden bg-slate-50">
      <Sidebar isCollapsed={sidebarCollapsed} />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <Topbar toggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} isCollapsed={sidebarCollapsed} />
        <main className="flex-1 flex flex-col h-full overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}


