import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';

export default function RoleGuard({ allowedRoles }) {
  const { session, user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-xs text-slate-500 font-medium font-sans">Verifying permissions...</p>
        </div>
      </div>
    );
  }

  if (!session && !user) {
    return <Navigate to="/login" replace />;
  }

  if (!role) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-sage-600"></div>
          <p className="text-xs text-slate-500 font-medium font-sans">Loading user profile...</p>
        </div>
      </div>
    );
  }

  if (!allowedRoles.includes(role)) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}
