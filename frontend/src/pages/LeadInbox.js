import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, ShieldAlert, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import LeadDrawer from "@/components/LeadDrawer";
import { statusClasses, STATUS_LABEL, fmtDateTime } from "@/lib/leadConstants";

const CHIPS = ["all", "careers", "whatsapp", "instagram", "facebook", "meta", "google_form", "referral", "manual"];

export default function LeadInbox() {
  const { user } = useAuth();
  const [data, setData] = useState({ summary: [], items: [] }); const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(""); const [source, setSource] = useState("all"); const [drawerLead, setDrawerLead] = useState(null);
  const load = useCallback(async () => { setLoading(true); try { const { data } = await api.get("/lead-inbox", { params: { search, source } }); setData(data); } catch (e) { toast.error(formatApiError(e)); } finally { setLoading(false); } }, [search, source]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  return (
    <div className="space-y-5" data-testid="lead-inbox-page">
      <div><h1 className="font-heading text-2xl font-bold text-slate-900 dark:text-slate-100">Lead Inbox</h1><p className="text-sm text-slate-500">Inbound leads across acquisition channels</p></div>
      <Card className="overflow-x-auto"><Table>
        <TableHeader><TableRow className="bg-slate-50 dark:bg-slate-800/50">{["Source", "Total", "Connected", "Interview", "Selected", "Joined"].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{data.summary.map((s) => <TableRow key={s.source} data-testid={`inbox-source-${s.source}`}><TableCell className="font-medium capitalize">{s.source}</TableCell><TableCell>{s.total}</TableCell><TableCell>{s.connected}</TableCell><TableCell>{s.interview}</TableCell><TableCell>{s.selected}</TableCell><TableCell>{s.joined}</TableCell></TableRow>)}</TableBody>
      </Table></Card>
      <div className="flex flex-wrap gap-2">{CHIPS.map((c) => <button key={c} onClick={() => setSource(c)} data-testid={`inbox-chip-${c}`} className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${source === c ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{c.replace("_", " ")}</button>)}</div>
      <Card className="p-4"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Search name / phone / email" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="inbox-search" /></div></Card>
      <Card className="overflow-x-auto"><Table>
        <TableHeader><TableRow className="bg-slate-50 dark:bg-slate-800/50">{["Name", "Phone", "Source", "Role", "Status", "Recruiter", "Added"].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
        <TableBody>{loading ? <TableRow><TableCell colSpan={7} className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></TableCell></TableRow>
          : data.items.length === 0 ? <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-slate-500">No leads.</TableCell></TableRow>
          : data.items.map((l) => <TableRow key={l.id} className="cursor-pointer" onClick={() => setDrawerLead(l.id)} data-testid={`inbox-row-${l.id}`}>
            <TableCell className="font-medium">{l.name}{l.flags?.duplicate_phone && <ShieldAlert className="ml-1 inline h-3 w-3 text-amber-500" />}</TableCell>
            <TableCell className="text-sm text-slate-500">{l.phone}</TableCell><TableCell className="text-sm capitalize">{l.source}</TableCell>
            <TableCell className="text-sm">{l.job || l.role_applied || "—"}</TableCell><TableCell><Badge className={statusClasses(l.status)}>{STATUS_LABEL[l.status]}</Badge></TableCell>
            <TableCell className="text-sm text-slate-500">{l.owner_id === user.id ? "Me" : "—"}</TableCell><TableCell className="text-sm text-slate-500">{fmtDateTime(l.created_at)}</TableCell>
          </TableRow>)}</TableBody>
      </Table></Card>
      <LeadDrawer leadId={drawerLead} open={!!drawerLead} onClose={() => setDrawerLead(null)} onChanged={load} />
    </div>
  );
}
