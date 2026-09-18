import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, FileText, UserPlus, Trash2, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import LeadDrawer from "@/components/LeadDrawer";
import { fmtDateTime } from "@/lib/leadConstants";

const STATUS = { new: "New", shortlisted: "Shortlisted", converted: "Converted to Lead" };

export default function Applications() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [drawerLead, setDrawerLead] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/applications", { params: { search, status } });
      setRows(data);
    } catch (e) { toast.error(formatApiError(e)); } finally { setLoading(false); }
  }, [search, status]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const setStatusOf = async (id, s) => { try { await api.put(`/applications/${id}/status`, { status: s }); load(); } catch (e) { toast.error(formatApiError(e)); } };
  const convert = async (id) => {
    try {
      const { data } = await api.post(`/applications/${id}/convert`, { create_followup: true });
      if (data.existing) toast.info("Existing lead found — opening it");
      else if (data.already) toast.info("Already converted");
      else toast.success("Converted to lead");
      if (data.lead?.id) setDrawerLead(data.lead.id);
      load();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const archive = async (id) => { if (!window.confirm("Archive application?")) return; try { await api.delete(`/applications/${id}`); load(); } catch (e) { toast.error(formatApiError(e)); } };

  return (
    <div className="space-y-5" data-testid="applications-page">
      <div className="flex items-center gap-2"><FileText className="h-6 w-6 text-indigo-600" />
        <div><h1 className="font-heading text-2xl font-bold text-slate-900 dark:text-slate-100">Applications</h1>
          <p className="text-sm text-slate-500">Inbound candidate applications inbox</p></div></div>
      <Card className="p-4"><div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-9" placeholder="Search name / phone / role" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="app-search" /></div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[180px]" data-testid="app-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-white dark:bg-slate-900">
            <SelectItem value="all">All Applications</SelectItem><SelectItem value="new">New</SelectItem>
            <SelectItem value="shortlisted">Shortlisted</SelectItem><SelectItem value="converted">Converted to Lead</SelectItem>
          </SelectContent></Select>
      </div></Card>
      <Card className="overflow-x-auto"><Table>
        <TableHeader><TableRow className="bg-slate-50 dark:bg-slate-800/50">
          <TableHead>Candidate</TableHead><TableHead>Phone</TableHead><TableHead>Role</TableHead>
          <TableHead>City</TableHead><TableHead>Source</TableHead><TableHead>Applied</TableHead>
          <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={8} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></TableCell></TableRow>
          : rows.length === 0 ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-sm text-slate-500">No applications.</TableCell></TableRow>
          : rows.map((a) => (
            <TableRow key={a.id} data-testid={`app-row-${a.id}`}>
              <TableCell className="font-medium">{a.name}{a.resume_url && <a href={a.resume_url} target="_blank" rel="noreferrer" className="ml-1 text-indigo-600" data-testid={`app-resume-${a.id}`}><ExternalLink className="inline h-3 w-3" /></a>}</TableCell>
              <TableCell className="text-sm text-slate-500">{a.phone}</TableCell>
              <TableCell className="text-sm">{a.role || "—"}</TableCell>
              <TableCell className="text-sm text-slate-500">{a.city || "—"}</TableCell>
              <TableCell className="text-sm text-slate-500">{a.source || "—"}{a.utm_campaign ? ` · ${a.utm_campaign}` : ""}</TableCell>
              <TableCell className="text-sm text-slate-500">{fmtDateTime(a.applied_at)}</TableCell>
              <TableCell><Badge variant="secondary">{STATUS[a.status] || a.status}</Badge></TableCell>
              <TableCell><div className="flex justify-end gap-1">
                {a.status !== "converted" && a.status !== "shortlisted" && <Button size="sm" variant="ghost" className="h-7" onClick={() => setStatusOf(a.id, "shortlisted")} data-testid={`app-shortlist-${a.id}`}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Shortlist</Button>}
                {a.status !== "converted" && hasPermission("leads.create") && <Button size="sm" variant="outline" className="h-7" onClick={() => convert(a.id)} data-testid={`app-convert-${a.id}`}><UserPlus className="mr-1 h-3.5 w-3.5" /> Convert</Button>}
                {a.lead_id && <Button size="sm" variant="ghost" className="h-7" onClick={() => setDrawerLead(a.lead_id)} data-testid={`app-openlead-${a.id}`}>Open Lead</Button>}
                {hasPermission("leads.delete") && <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => archive(a.id)} data-testid={`app-archive-${a.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>}
              </div></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table></Card>
      <LeadDrawer leadId={drawerLead} open={!!drawerLead} onClose={() => setDrawerLead(null)} onChanged={load} />
    </div>
  );
}
