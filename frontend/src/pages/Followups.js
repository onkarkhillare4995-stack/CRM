import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, formatApiError } from "@/lib/api";
import LeadDrawer from "@/components/LeadDrawer";

export default function Followups() {
  const [rows, setRows] = useState([]);
  const [drawerLead, setDrawerLead] = useState(null);
  const load = () => api.get("/followups").then((r) => setRows(r.data)).catch((e) => toast.error(formatApiError(e)));
  useEffect(() => { load(); }, []);

  const complete = async (id) => {
    try { await api.put(`/followups/${id}`, { status: "done" }); toast.success("Marked done"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const now = new Date();
  return (
    <div className="space-y-6" data-testid="followups-page">
      <div><h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Follow-ups</h1>
        <p className="text-sm text-slate-500">{rows.filter((r) => r.status === "pending").length} pending</p></div>
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No follow-ups.</p>}
        {rows.map((f) => {
          const overdue = f.status === "pending" && new Date(f.due_at) < now;
          return (
            <div key={f.id} className="flex items-center justify-between px-5 py-3" data-testid={`followup-${f.id}`}>
              <button className="text-left" onClick={() => setDrawerLead(f.lead_id)}>
                <p className="font-medium text-slate-900 dark:text-slate-100">{f.lead_name}</p>
                <p className="text-xs text-slate-500">Due {new Date(f.due_at).toLocaleString()}</p>
              </button>
              <div className="flex items-center gap-2">
                {f.status === "done" ? <Badge className="bg-emerald-100 text-emerald-700">Done</Badge>
                  : overdue ? <Badge className="bg-red-100 text-red-700">Overdue</Badge>
                  : <Badge variant="secondary">Pending</Badge>}
                {f.status === "pending" && <Button size="sm" variant="outline" onClick={() => complete(f.id)} data-testid={`followup-done-${f.id}`}><Check className="mr-1 h-4 w-4" /> Done</Button>}
              </div>
            </div>
          );
        })}
      </Card>
      <LeadDrawer leadId={drawerLead} open={!!drawerLead} onClose={() => setDrawerLead(null)} onChanged={load} />
    </div>
  );
}
