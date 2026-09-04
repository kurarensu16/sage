import { useState } from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BottomNav from './BottomNav';
import OfflineBadge from '../pwa/OfflineBadge';
import { useAuth } from '../../lib/AuthContext';
import { DashboardSkeleton } from '../common/Skeleton';

export default function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen w-screen overflow-hidden bg-slate-50 flex flex-col">
        <DashboardSkeleton />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  if (profile?.status === 'inactive' || profile?.status === 'archived') {
    return <Navigate to="/login" replace />;
  }

  if (profile?.must_change_password) {
    return <Navigate to="/change-password" replace />;
  }

  return (
    <div className="h-screen flex overflow-hidden bg-slate-50 relative">
      <Sidebar 
        isCollapsed={sidebarCollapsed} 
        mobileOpen={mobileOpen} 
        setMobileOpen={setMobileOpen} 
      />
      <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
        <Topbar 
          toggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} 
          isCollapsed={sidebarCollapsed} 
        />
        <main className="flex-1 flex flex-col h-full overflow-y-auto min-w-0 pb-20 lg:pb-0">
          <Outlet />
        </main>
      </div>

      <BottomNav />
      <OfflineBadge />
    </div>
  );
}
