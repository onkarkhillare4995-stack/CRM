import ResourceScreen from "@/components/ResourceScreen";
import { useAuth } from "@/context/AuthContext";

export default function Clients() {
  const { hasPermission } = useAuth();
  return <ResourceScreen testid="clients" title="Clients" subtitle="Client & company management"
    endpoint="/clients" canWrite={hasPermission("clients.manage")} canDelete={hasPermission("clients.manage")}
    fields={[
      { key: "name", label: "Client Name", required: true, full: true },
      { key: "company", label: "Company / Legal Name" },
      { key: "location", label: "Location" },
      { key: "contact_person", label: "Contact Person" },
      { key: "contact_phone", label: "Contact Phone" },
      { key: "contact_email", label: "Contact Email" },
      { key: "payment_terms", label: "Payment Terms" },
      { key: "replacement_terms", label: "Replacement Terms" },
      { key: "notes", label: "Notes", type: "textarea", full: true },
    ]}
    columns={[]}
    renderCell={(r) => (
      <div><p className="font-medium text-slate-900 dark:text-slate-100">{r.name}{r.company ? ` · ${r.company}` : ""}</p>
        <p className="mt-0.5 text-xs text-slate-500">{r.contact_person || "—"} · {r.contact_phone || "—"} · {r.location || "—"}</p>
        <p className="mt-0.5 text-xs text-slate-400">Submitted {r.stats?.submitted} · Interviewed {r.stats?.interviewed} · Selected {r.stats?.selected} · Joined {r.stats?.joined}</p></div>
    )} />;
}
