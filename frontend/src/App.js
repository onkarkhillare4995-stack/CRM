import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminLayout from "@/components/layout/AdminLayout";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import Dashboard from "@/pages/Dashboard";
import MyDay from "@/pages/MyDay";
import Leads from "@/pages/Leads";
import Followups from "@/pages/Followups";
import Tasks from "@/pages/Tasks";
import AccessControl from "@/pages/AccessControl";
import AuditLog from "@/pages/AuditLog";
import Settings from "@/pages/Settings";
import Notifications from "@/pages/Notifications";
import Placeholder from "@/pages/Placeholder";

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<ProtectedRoute permission="dashboard.view"><Dashboard /></ProtectedRoute>} />
            <Route path="my-day" element={<ProtectedRoute permission="dashboard.view"><MyDay /></ProtectedRoute>} />
            <Route path="leads" element={<ProtectedRoute><Leads variant="all" /></ProtectedRoute>} />
            <Route path="my-leads" element={<ProtectedRoute><Leads variant="my" /></ProtectedRoute>} />
            <Route path="calling-list" element={<ProtectedRoute><Leads variant="calling" /></ProtectedRoute>} />
            <Route path="followups" element={<ProtectedRoute permission="followups.manage"><Followups /></ProtectedRoute>} />
            <Route path="tasks" element={<ProtectedRoute permission="tasks.manage"><Tasks /></ProtectedRoute>} />
            <Route path="recruiters" element={<ProtectedRoute permission="recruiters.view"><AccessControl /></ProtectedRoute>} />
            <Route path="notifications" element={<ProtectedRoute permission="dashboard.view"><Notifications /></ProtectedRoute>} />
            <Route path="audit-logs" element={<ProtectedRoute permission="audit.view"><AuditLog /></ProtectedRoute>} />
            <Route path="settings" element={<ProtectedRoute permission="settings.manage"><Settings /></ProtectedRoute>} />

            <Route path="applications" element={<Placeholder title="Applications" />} />
            <Route path="interviews" element={<Placeholder title="Interviews" />} />
            <Route path="joining" element={<Placeholder title="Joining" />} />
            <Route path="jobs" element={<Placeholder title="Jobs" />} />
            <Route path="clients" element={<Placeholder title="Clients" />} />
            <Route path="vendors" element={<Placeholder title="Vendors & Empanelment" />} />
            <Route path="lead-sources" element={<Placeholder title="Lead Sources & Ads" />} />
            <Route path="templates" element={<Placeholder title="Templates" />} />
            <Route path="reports" element={<Placeholder title="Reports" />} />
            <Route path="action-required" element={<Placeholder title="Action Required" />} />
            <Route path="lead-inbox" element={<Placeholder title="Lead Inbox" />} />
            <Route path="integrations" element={<Placeholder title="Integrations" />} />
            <Route path="import-leads" element={<Placeholder title="Import Leads" />} />
          </Route>

          <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
