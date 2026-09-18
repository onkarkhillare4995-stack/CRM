import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Loader2, ShieldAlert } from "lucide-react";

export default function ProtectedRoute({ children, permission }) {
  const { user, hasPermission } = useAuth();
  const location = useLocation();

  if (user === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="h-6 w-6 animate-spin text-indigo-600" data-testid="auth-loading" />
      </div>
    );
  }
  if (user === null) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (permission && !hasPermission(permission)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-12 text-center" data-testid="unauthorized">
        <ShieldAlert className="h-10 w-10 text-amber-500" />
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Access denied</h2>
        <p className="text-sm text-slate-500">You do not have permission to view this section.</p>
      </div>
    );
  }
  return children;
}
