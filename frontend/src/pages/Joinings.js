import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, MessageCircle, Pencil, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, formatApiError } from "@/lib/api";
import LeadDrawer from "@/components/LeadDrawer";
import { fmtDateTime, toDatetimeLocal } from "@/lib/leadConstants";

const STATUS = ["selected", "documents_pending", "offer_pending", "offer_released", "joining_confirmed", "joined", "delayed", "no_show", "dropped", "client_rejected", "pending", "confirmed"];
const CONFIRM = ["pending", "confirmed", "not_confirmed"];

export default function Joinings() {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("all");
  const [drawerLead, setDrawerLead] = useState(null); const [edit, setEdit] = useState(null);
  const load = useCallback(async () => { setLoading(true); try { const { data } = await api.get("/joinings"); setRows(data); } catch (e) { toast.error(formatApiError(e)); } finally { setLoading(false); } }, []);
  useEffect(() => { load(); }, [load]);
  const filtered = rows.filter((r) => (status === "all" || r.status === status) && (!search || (r.lead_name || "").toLowerCase().includes(search.toLowerCase())));
  const setField = async (id, f, v) => { try { await api.put(`/joinings/${id}`, { [f]: v }); load(); } catch (e) { toast.error(formatApiError(e)); } };
  return (
    <div className="space-y-5" data-testid="joinings-page">
      <div><h1 className="font-heading text-2xl font-bold text-slate-900 dark:text-slate-100">Joining Pipeline</h1><p className="text-sm text-slate-500">Offer-to-join tracking</p></div>
      <Card className="p-4"><div className="flex flex-wrap gap-3">
        <div className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" placeholder="Search candidate" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="jn-search" /></div>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-[190px]" data-testid="jn-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-72 bg-white dark:bg-slate-900"><SelectItem value="all">All statuses</SelectItem>{STATUS.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select>
      </div></Card>
      <Card className="overflow-x-auto"><Table>
        <TableHeader><TableRow className="bg-slate-50 dark:bg-slate-800/50"><TableHead>Candidate</TableHead><TableHead>Expected</TableHead><TableHead>Actual</TableHead><TableHead>Status</TableHead><TableHead>Confirmation</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={6} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></TableCell></TableRow>
          : filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="py-10 text-center text-sm text-slate-500">No joinings.</TableCell></TableRow>
          : filtered.map((r) => (
            <TableRow key={r.id} data-testid={`jn-row-${r.id}`}>
              <TableCell><button className="font-medium hover:text-indigo-600" onClick={() => setDrawerLead(r.lead_id)}>{r.lead_name}</button></TableCell>
              <TableCell className="text-sm">{fmtDateTime(r.joining_date)}</TableCell>
              <TableCell className="text-sm">{fmtDateTime(r.actual_joining_date)}</TableCell>
              <TableCell><Select value={r.status} onValueChange={(v) => setField(r.id, "status", v)}><SelectTrigger className="h-7 w-[150px]" data-testid={`jn-stage-${r.id}`}><SelectValue /></SelectTrigger><SelectContent className="max-h-72 bg-white dark:bg-slate-900">{STATUS.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select></TableCell>
              <TableCell><Select value={r.confirmation || "pending"} onValueChange={(v) => setField(r.id, "confirmation", v)}><SelectTrigger className="h-7 w-[130px]" data-testid={`jn-confirm-${r.id}`}><SelectValue /></SelectTrigger><SelectContent className="bg-white dark:bg-slate-900">{CONFIRM.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent></Select></TableCell>
              <TableCell><div className="flex justify-end gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDrawerLead(r.lead_id)} title="WhatsApp" data-testid={`jn-wa-${r.id}`}><MessageCircle className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEdit(r)} data-testid={`jn-edit-${r.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
              </div></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table></Card>
      <LeadDrawer leadId={drawerLead} open={!!drawerLead} onClose={() => setDrawerLead(null)} onChanged={load} />
      <JnEdit open={!!edit} onClose={() => setEdit(null)} jn={edit} onDone={load} />
    </div>
  );
}
function JnEdit({ open, onClose, jn, onDone }) {
  const [exp, setExp] = useState(""); const [act, setAct] = useState(""); const [salary, setSalary] = useState(""); const [remarks, setRemarks] = useState(""); const [saving, setSaving] = useState(false);
  useEffect(() => { if (open && jn) { setExp(jn.joining_date ? toDatetimeLocal(new Date(jn.joining_date)) : ""); setAct(jn.actual_joining_date ? toDatetimeLocal(new Date(jn.actual_joining_date)) : ""); setSalary(jn.salary || ""); setRemarks(jn.remarks || ""); } }, [open, jn]);
  if (!jn) return null;
  const submit = async () => { setSaving(true); try { await api.put(`/joinings/${jn.id}`, { joining_date: exp ? new Date(exp).toISOString() : null, actual_joining_date: act ? new Date(act).toISOString() : null, salary, remarks }); toast.success("Saved"); onDone?.(); onClose(); } catch (e) { toast.error(formatApiError(e)); } finally { setSaving(false); } };
  return (<Dialog open={open} onOpenChange={(o) => !o && onClose()}><DialogContent className="bg-white dark:bg-slate-900 sm:max-w-md" data-testid="jn-edit-dialog"><DialogHeader><DialogTitle>Edit Joining — {jn.lead_name}</DialogTitle></DialogHeader>
    <div className="grid grid-cols-2 gap-3"><div><Label className="text-xs text-slate-500">Expected</Label><Input type="datetime-local" value={exp} onChange={(e) => setExp(e.target.value)} data-testid="jn-exp" /></div>
      <div><Label className="text-xs text-slate-500">Actual</Label><Input type="datetime-local" value={act} onChange={(e) => setAct(e.target.value)} data-testid="jn-act" /></div>
      <div className="col-span-2"><Label className="text-xs text-slate-500">Salary</Label><Input value={salary} onChange={(e) => setSalary(e.target.value)} data-testid="jn-salary" /></div>
      <div className="col-span-2"><Label className="text-xs text-slate-500">Remarks</Label><Input value={remarks} onChange={(e) => setRemarks(e.target.value)} data-testid="jn-remarks" /></div></div>
    <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="jn-save">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button></DialogFooter></DialogContent></Dialog>);
}
