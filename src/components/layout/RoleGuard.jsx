import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/AuthContext';

export default function RoleGuard({ allowedRoles }) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50 text-slate-500 font-semibold text-sm">
        Checking permissions...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to="/403" replace />;
  }

  return <Outlet />;
}
