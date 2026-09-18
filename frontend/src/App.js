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
import Applications from "@/pages/Applications";
import Interviews from "@/pages/Interviews";
import Joinings from "@/pages/Joinings";
import Jobs from "@/pages/Jobs";
import Clients from "@/pages/Clients";
import Vendors from "@/pages/Vendors";
import Templates from "@/pages/Templates";
import Reports from "@/pages/Reports";
import ActionRequired from "@/pages/ActionRequired";
import LeadInbox from "@/pages/LeadInbox";
import LeadSources from "@/pages/LeadSources";
import Integrations from "@/pages/Integrations";
import ImportLeads from "@/pages/ImportLeads";
import Tags from "@/pages/Tags";
import AccessControl from "@/pages/AccessControl";
import AuditLog from "@/pages/AuditLog";
import Settings from "@/pages/Settings";
import Notifications from "@/pages/Notifications";

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
            <Route path="applications" element={<ProtectedRoute><Applications /></ProtectedRoute>} />
            <Route path="interviews" element={<ProtectedRoute permission="interviews.manage"><Interviews /></ProtectedRoute>} />
            <Route path="joining" element={<ProtectedRoute permission="joinings.manage"><Joinings /></ProtectedRoute>} />
            <Route path="jobs" element={<ProtectedRoute><Jobs /></ProtectedRoute>} />
            <Route path="clients" element={<ProtectedRoute><Clients /></ProtectedRoute>} />
            <Route path="vendors" element={<ProtectedRoute permission="vendors.manage"><Vendors /></ProtectedRoute>} />
            <Route path="lead-sources" element={<ProtectedRoute><LeadSources /></ProtectedRoute>} />
            <Route path="templates" element={<ProtectedRoute permission="templates.manage"><Templates /></ProtectedRoute>} />
            <Route path="recruiters" element={<ProtectedRoute permission="recruiters.view"><AccessControl /></ProtectedRoute>} />
            <Route path="reports" element={<ProtectedRoute permission="reports.view"><Reports /></ProtectedRoute>} />
            <Route path="action-required" element={<ProtectedRoute><ActionRequired /></ProtectedRoute>} />
            <Route path="lead-inbox" element={<ProtectedRoute><LeadInbox /></ProtectedRoute>} />
            <Route path="integrations" element={<ProtectedRoute permission="integrations.manage"><Integrations /></ProtectedRoute>} />
            <Route path="import-leads" element={<ProtectedRoute permission="imports.run"><ImportLeads /></ProtectedRoute>} />
            <Route path="lead-tags" element={<ProtectedRoute permission="settings.manage"><Tags /></ProtectedRoute>} />
            <Route path="notifications" element={<ProtectedRoute permission="dashboard.view"><Notifications /></ProtectedRoute>} />
            <Route path="audit-logs" element={<ProtectedRoute permission="audit.view"><AuditLog /></ProtectedRoute>} />
            <Route path="settings" element={<ProtectedRoute permission="settings.manage"><Settings /></ProtectedRoute>} />
          </Route>

          <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/admin/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
