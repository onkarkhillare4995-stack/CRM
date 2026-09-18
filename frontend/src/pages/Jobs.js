import { Badge } from "@/components/ui/badge";
import ResourceScreen from "@/components/ResourceScreen";
import { useAuth } from "@/context/AuthContext";

export default function Jobs() {
  const { hasPermission } = useAuth();
  return <ResourceScreen testid="jobs" title="Jobs / Mandates" subtitle="Recruitment mandates"
    endpoint="/jobs" canWrite={hasPermission("jobs.manage")} canDelete={hasPermission("jobs.manage")}
    fields={[
      { key: "title", label: "Position Title", required: true, full: true },
      { key: "client", label: "Client", required: true },
      { key: "location", label: "Location" },
      { key: "openings", label: "Openings", type: "number" },
      { key: "salary_min", label: "Salary Min" },
      { key: "salary_max", label: "Salary Max" },
      { key: "experience", label: "Experience Range" },
      { key: "status", label: "Status", type: "select", default: "active", options: [{ value: "active", label: "Active" }, { value: "on_hold", label: "On Hold" }, { value: "closed", label: "Closed" }] },
      { key: "skills", label: "Skills / Tags", full: true },
      { key: "description", label: "Description / Notes", type: "textarea", full: true },
    ]}
    columns={[]}
    renderCell={(r) => (
      <div><p className="font-medium text-slate-900 dark:text-slate-100">{r.title} <span className="text-xs text-slate-400">· {r.client}</span></p>
        <div className="mt-0.5 text-xs text-slate-500">{r.location || "—"} · {r.openings || 0} openings · {r.salary_min || "?"}-{r.salary_max || "?"} · {r.linked_leads} linked leads
          <Badge className="ml-2" variant="secondary">{r.status}</Badge></div></div>
    )} />;
}
