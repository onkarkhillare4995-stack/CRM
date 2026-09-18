import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Megaphone } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function LeadSources() {
  const { user } = useAuth();
  const [data, setData] = useState({ summary: [] });
  const [sim, setSim] = useState({ name: "", phone: "", role: "", source: "meta" });
  const load = () => api.get("/lead-inbox").then((r) => setData(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  const total = data.summary.reduce((a, s) => a + s.total, 0) || 1;
  const kpi = (src) => data.summary.filter((s) => src.includes(s.source)).reduce((a, s) => a + s.total, 0);
  const simulate = async () => {
    if (!sim.name || !sim.phone) return toast.error("Name and phone required");
    try { await api.post("/leads", { name: sim.name, phone: sim.phone, role_applied: sim.role, source: sim.source, first_followup_at: new Date(Date.now() + 86400000).toISOString(), first_followup_reason: "First call" }); toast.success(`Simulated ${sim.source} lead ingested`); setSim({ name: "", phone: "", role: "", source: sim.source }); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  return (
    <div className="space-y-5" data-testid="lead-sources-page">
      <div className="flex items-center gap-2"><Megaphone className="h-6 w-6 text-indigo-600" /><div><h1 className="font-heading text-2xl font-bold text-slate-900 dark:text-slate-100">Lead Sources & Marketing</h1><p className="text-sm text-slate-500">Inbound channel performance</p></div></div>
      <div className="grid gap-4 sm:grid-cols-4">
        {[["Total Ingested", total === 1 && !data.summary.length ? 0 : total], ["Meta / Instagram", kpi(["meta", "instagram", "facebook"])], ["Google Form", kpi(["google_form"])], ["Careers / Form", kpi(["careers", "application"])]].map(([l, v]) => (
          <Card key={l} className="p-4" data-testid="ls-kpi"><p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{v}</p><p className="text-sm text-slate-500">{l}</p></Card>))}
      </div>
      <Card className="p-4"><p className="mb-2 text-sm font-medium">Channel Distribution</p>
        {data.summary.map((s) => <div key={s.source} className="mb-1 flex items-center gap-2 text-sm"><span className="w-28 capitalize text-slate-600">{s.source}</span><div className="h-2 flex-1 rounded bg-slate-100 dark:bg-slate-800"><div className="h-2 rounded bg-indigo-500" style={{ width: `${(s.total / total) * 100}%` }} /></div><span className="w-16 text-right text-xs text-slate-500">{s.total} ({Math.round((s.total / total) * 100)}%)</span></div>)}
      </Card>
      {user?.role === "admin" && (
        <Card className="space-y-3 p-4" data-testid="ls-webhook-sim">
          <p className="text-sm font-medium">Webhook Testing (Admin)</p>
          <div className="grid gap-2 sm:grid-cols-3">
            <div><Label className="text-xs text-slate-500">Candidate Name</Label><Input value={sim.name} onChange={(e) => setSim({ ...sim, name: e.target.value })} data-testid="sim-name" /></div>
            <div><Label className="text-xs text-slate-500">Phone</Label><Input value={sim.phone} onChange={(e) => setSim({ ...sim, phone: e.target.value })} data-testid="sim-phone" /></div>
            <div><Label className="text-xs text-slate-500">Target Role</Label><Input value={sim.role} onChange={(e) => setSim({ ...sim, role: e.target.value })} data-testid="sim-role" /></div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setSim({ ...sim, source: "meta" }); setTimeout(simulate, 0); }} className="bg-indigo-600 hover:bg-indigo-700" data-testid="sim-meta">Simulate Meta Lead</Button>
            <Button size="sm" variant="outline" onClick={() => { setSim({ ...sim, source: "google_form" }); setTimeout(simulate, 0); }} data-testid="sim-google">Simulate Google Form Lead</Button>
          </div>
        </Card>
      )}
    </div>
  );
}
