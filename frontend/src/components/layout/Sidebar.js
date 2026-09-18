import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, Sun, Phone, CalendarClock, ListTodo, FileText, CalendarCheck2,
  UserCheck2, Briefcase, Building2, Handshake, Megaphone, MessageSquareText,
  Users2, BarChart3, AlertTriangle, Inbox, Plug, Upload, Bell, ScrollText, Settings, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

const GROUPS = [
  {
    title: "Recruitment Pipeline",
    items: [
      { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
      { to: "/admin/my-day", label: "My Day", icon: Sun, perm: "dashboard.view", roles: ["recruiter", "team_leader"] },
      { to: "/admin/leads", label: "All Leads", icon: Users2, anyPerm: ["leads.view_all"] },
      { to: "/admin/my-leads", label: "My Leads", icon: UserCheck2, anyPerm: ["leads.view_own"], roles: ["recruiter", "team_leader"] },
      { to: "/admin/calling-list", label: "Calling List", icon: Phone, perm: "calls.log" },
      { to: "/admin/followups", label: "Follow-ups", icon: CalendarClock, perm: "followups.manage" },
      { to: "/admin/tasks", label: "Tasks & To-Dos", icon: ListTodo, perm: "tasks.manage" },
      { to: "/admin/applications", label: "Applications", icon: FileText, anyPerm: ["leads.view_all", "leads.view_own"] },
      { to: "/admin/interviews", label: "Interviews", icon: CalendarCheck2, perm: "interviews.manage" },
      { to: "/admin/joining", label: "Joining", icon: CalendarCheck2, perm: "joinings.manage" },
    ],
  },
  {
    title: "Clients & Mandates",
    items: [
      { to: "/admin/jobs", label: "Jobs", icon: Briefcase, perm: "jobs.manage" },
      { to: "/admin/clients", label: "Clients", icon: Building2, perm: "clients.manage" },
      { to: "/admin/vendors", label: "Vendors & Empanelment", icon: Handshake, perm: "vendors.manage" },
      { to: "/admin/lead-sources", label: "Lead Sources & Ads", icon: Megaphone, anyPerm: ["reports.view", "leads.view_all"] },
      { to: "/admin/templates", label: "Templates", icon: MessageSquareText, perm: "templates.manage" },
    ],
  },
  {
    title: "Analytics & Settings",
    items: [
      { to: "/admin/recruiters", label: "Recruiters", icon: Users2, perm: "recruiters.view" },
      { to: "/admin/reports", label: "Reports", icon: BarChart3, perm: "reports.view" },
      { to: "/admin/action-required", label: "Action Required", icon: AlertTriangle, anyPerm: ["recruiters.view", "users.manage"] },
      { to: "/admin/lead-inbox", label: "Lead Inbox", icon: Inbox, anyPerm: ["recruiters.view", "users.manage"] },
      { to: "/admin/integrations", label: "Integrations", icon: Plug, perm: "integrations.manage" },
      { to: "/admin/import-leads", label: "Import Leads", icon: Upload, perm: "imports.run" },
      { to: "/admin/notifications", label: "Notifications", icon: Bell, perm: "dashboard.view" },
      { to: "/admin/audit-logs", label: "Audit Logs", icon: ScrollText, perm: "audit.view" },
      { to: "/admin/settings", label: "Settings", icon: Settings, perm: "settings.manage" },
    ],
  },
];

function SidebarContent({ onNavigate }) {
  const { user, hasPermission } = useAuth();
  const can = (item) => {
    if (item.roles && !item.roles.includes(user?.role)) return false;
    if (item.perm) return hasPermission(item.perm);
    if (item.anyPerm) return item.anyPerm.some((p) => hasPermission(p));
    return true;
  };
  return (
    <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" data-testid="sidebar-nav">
      {GROUPS.map((group) => {
        const visible = group.items.filter(can);
        if (!visible.length) return null;
        return (
          <div key={group.title}>
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500">{group.title}</p>
            {visible.map((item) => {
              const Icon = item.icon;
              const testId = item.to.split("/").pop();
              return (
                <NavLink
                  key={item.to} to={item.to} end onClick={onNavigate}
                  data-testid={`sidebar-nav-${testId}`}
                  className={({ isActive }) => cn(
                    "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive ? "bg-white/12 text-white" : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1">{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}

export default function Sidebar({ mobileOpen, onClose }) {
  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col bg-slate-900 text-slate-100 md:flex" data-testid="sidebar">
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 font-bold">O</div>
          <span className="font-heading text-lg font-bold tracking-tight">OAKsphere</span>
        </div>
        <SidebarContent />
        <div className="border-t border-white/10 px-6 py-3 text-[11px] text-slate-500">Recruitment CRM · v1.0</div>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden" data-testid="mobile-sidebar">
          <div className="absolute inset-0 bg-black/50" onClick={onClose} />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col bg-slate-900 text-slate-100">
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-6">
              <span className="font-heading text-lg font-bold">OAKsphere</span>
              <button onClick={onClose} data-testid="mobile-sidebar-close"><X className="h-5 w-5" /></button>
            </div>
            <SidebarContent onNavigate={onClose} />
          </aside>
        </div>
      )}
    </>
  );
}
