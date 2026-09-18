import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, UserPlus, Briefcase, ListTodo, CalendarClock, CalendarCheck2, Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/AuthContext";
import AddLeadDialog from "@/components/AddLeadDialog";
import AddTaskDialog from "@/components/AddTaskDialog";

export default function QuickActions() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [leadOpen, setLeadOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);

  const actions = [
    { label: "New Candidate Lead", icon: UserPlus, perm: "leads.create", onClick: () => setLeadOpen(true), testId: "qa-new-lead" },
    { label: "Add Task / Reminder", icon: ListTodo, perm: "tasks.manage", onClick: () => setTaskOpen(true), testId: "qa-new-task" },
    { label: "Schedule Follow-up", icon: CalendarClock, perm: "followups.manage", onClick: () => navigate("/admin/followups"), testId: "qa-followup" },
    { label: "Schedule Interview", icon: CalendarCheck2, perm: "interviews.manage", onClick: () => navigate("/admin/interviews"), testId: "qa-interview" },
    { label: "New Job Opening", icon: Briefcase, perm: "jobs.manage", onClick: () => navigate("/admin/jobs"), testId: "qa-new-job" },
    { label: "Add Vendor Lead", icon: Handshake, perm: "vendors.manage", onClick: () => navigate("/admin/vendors"), testId: "qa-new-vendor" },
  ].filter((a) => hasPermission(a.perm));

  if (!actions.length) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" className="gap-1 bg-indigo-600 hover:bg-indigo-700" data-testid="quick-action-trigger">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Quick Action</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56 bg-white dark:bg-slate-900">
          <DropdownMenuLabel>Quick actions</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {actions.map((a) => (
            <DropdownMenuItem key={a.label} onClick={a.onClick} data-testid={a.testId}>
              <a.icon className="mr-2 h-4 w-4" /> {a.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <AddLeadDialog open={leadOpen} onClose={() => setLeadOpen(false)} />
      <AddTaskDialog open={taskOpen} onClose={() => setTaskOpen(false)} />
    </>
  );
}
