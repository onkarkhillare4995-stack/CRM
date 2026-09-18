import { Badge } from "@/components/ui/badge";
import ResourceScreen from "@/components/ResourceScreen";
import { useAuth } from "@/context/AuthContext";

const STAGES = ["new", "contacted", "followup", "meeting", "proposal_sent", "negotiation", "empanelled", "rejected"];
const INDUSTRIES = ["IT Services", "BFSI", "BPO / ITES", "Healthcare & Pharma", "Manufacturing", "Retail & E-commerce", "EdTech", "Other"];

export default function Vendors() {
  const { hasPermission } = useAuth();
  return <ResourceScreen testid="vendors" title="Vendors & Empanelment" subtitle="Corporate empanelment pipeline"
    endpoint="/vendors" summary="/vendors/summary" canWrite={hasPermission("vendors.manage")} canDelete={hasPermission("vendors.manage")}
    fields={[
      { key: "company", label: "Company Name", required: true, full: true },
      { key: "industry", label: "Industry", type: "select", default: "IT Services", options: INDUSTRIES.map((i) => ({ value: i, label: i })) },
      { key: "stage", label: "Stage", type: "select", default: "new", options: STAGES.map((s) => ({ value: s, label: s.replace(/_/g, " ") })) },
      { key: "contact_person", label: "Contact Person" },
      { key: "designation", label: "Designation" },
      { key: "phone", label: "Phone" },
      { key: "work_email", label: "Work Email" },
      { key: "linkedin", label: "LinkedIn" },
      { key: "commercials", label: "Commercials Proposed" },
      { key: "next_action", label: "Next Follow-up Action" },
      { key: "notes", label: "Notes", type: "textarea", full: true },
    ]}
    columns={[]}
    renderCell={(r) => (
      <div><div className="font-medium text-slate-900 dark:text-slate-100">{r.company} <Badge className="ml-2" variant="secondary">{(r.stage || "").replace(/_/g, " ")}</Badge></div>
        <p className="mt-0.5 text-xs text-slate-500">{r.industry || "—"} · {r.contact_person || "—"} · {r.phone || "—"}</p></div>
    )} />;
}
