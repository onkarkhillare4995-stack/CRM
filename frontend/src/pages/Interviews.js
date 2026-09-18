import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, Phone, MessageCircle, Pencil, Trash2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import LeadDrawer from "@/components/LeadDrawer";
import { INTERVIEW_TYPES, fmtDateTime, digitsOnly, toDatetimeLocal } from "@/lib/leadConstants";

const STAGES = ["scheduled", "confirmed", "attended", "no_show", "selected", "rejected"];
const CONFIRMS = ["pending", "confirmed", "not_confirmed", "reschedule_requested"];

export default function Interviews() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const [drawerLead, setDrawerLead] = useState(null);
  const [edit, setEdit] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/interviews"); setRows(data); }
    catch (e) { toast.error(formatApiError(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const now = new Date(); const tomStart = new Date(now); tomStart.setDate(now.getDate() + 1); tomStart.setHours(0, 0, 0, 0);
  const tomEnd = new Date(tomStart); tomEnd.setDate(tomStart.getDate() + 1);
  const filtered = rows.filter((r) => {
    if (tab === "tomorrow") { const d = new Date(r.scheduled_at); if (!(d >= tomStart && d < tomEnd)) return false; }
    if (search) { const s = search.toLowerCase(); if (!(`${r.lead_name} ${r.client || ""} ${r.job || ""}`.toLowerCase().includes(s))) return false; }
    return true;
  });

  const setField = async (id, field, value) => { try { await api.put(`/interviews/${id}`, { [field]: value }); toast.success("Updated"); load(); } catch (e) { toast.error(formatApiError(e)); } };

  return (
    <div className="space-y-5" data-testid="interviews-page">
      <div><h1 className="font-heading text-2xl font-bold text-slate-900 dark:text-slate-100">Interviews</h1>
        <p className="text-sm text-slate-500">Track and manage candidate interviews</p></div>
      <div className="flex gap-2">
        {[["all", "All"], ["tomorrow", "Tomorrow's Interviews"]].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} data-testid={`iv-tab-${k}`}
            className={`rounded-full px-3 py-1 text-xs font-medium ${tab === k ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{l}</button>
        ))}
      </div>
      <Card className="p-4"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input className="pl-9" placeholder="Search candidate / client / job" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="iv-search" /></div></Card>
      <Card className="overflow-x-auto"><Table>
        <TableHeader><TableRow className="bg-slate-50 dark:bg-slate-800/50">
          <TableHead>Candidate</TableHead><TableHead>Client / Job</TableHead><TableHead>Date/Time</TableHead>
          <TableHead>Type</TableHead><TableHead>Stage</TableHead><TableHead>Confirmation</TableHead><TableHead className="text-right">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {loading ? <TableRow><TableCell colSpan={7} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></TableCell></TableRow>
          : filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">No interviews.</TableCell></TableRow>
          : filtered.map((r) => (
            <TableRow key={r.id} data-testid={`iv-row-${r.id}`}>
              <TableCell><button className="font-medium hover:text-indigo-600" onClick={() => setDrawerLead(r.lead_id)}>{r.lead_name}</button></TableCell>
              <TableCell className="text-sm text-slate-500">{r.client || "—"}{r.job ? ` · ${r.job}` : ""}{r.location ? ` · ${r.location}` : ""}</TableCell>
              <TableCell className="text-sm">{fmtDateTime(r.scheduled_at)}</TableCell>
              <TableCell className="text-sm">{r.type || r.mode}</TableCell>
              <TableCell>
                <Select value={r.status} onValueChange={(v) => setField(r.id, "status", v)}>
                  <SelectTrigger className="h-7 w-[130px]" data-testid={`iv-stage-${r.id}`}><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900">{STAGES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Select value={r.confirmation || "pending"} onValueChange={(v) => setField(r.id, "confirmation", v)}>
                  <SelectTrigger className="h-7 w-[130px]" data-testid={`iv-confirm-${r.id}`}><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900">{CONFIRMS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </TableCell>
              <TableCell><div className="flex justify-end gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDrawerLead(r.lead_id)} title="Call" data-testid={`iv-call-${r.id}`}><Phone className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { window.open(`https://wa.me/`, "_blank"); }} title="WhatsApp Reminder" data-testid={`iv-wa-${r.id}`}><MessageCircle className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEdit(r)} title="Edit / Reschedule" data-testid={`iv-edit-${r.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
              </div></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table></Card>
      <LeadDrawer leadId={drawerLead} open={!!drawerLead} onClose={() => setDrawerLead(null)} onChanged={load} />
      <EditDialog open={!!edit} onClose={() => setEdit(null)} interview={edit} onDone={load} />
    </div>
  );
}

function EditDialog({ open, onClose, interview, onDone }) {
  const [dt, setDt] = useState(""); const [notes, setNotes] = useState(""); const [saving, setSaving] = useState(false);
  useEffect(() => { if (open && interview) { setDt(interview.scheduled_at ? toDatetimeLocal(new Date(interview.scheduled_at)) : ""); setNotes(interview.notes || ""); } }, [open, interview]);
  if (!interview) return null;
  const submit = async () => {
    if (!dt) return toast.error("Date/time required");
    setSaving(true);
    try { await api.put(`/interviews/${interview.id}`, { scheduled_at: new Date(dt).toISOString(), notes, status: "scheduled" }); toast.success("Rescheduled"); onDone?.(); onClose(); }
    catch (e) { toast.error(formatApiError(e)); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white dark:bg-slate-900 sm:max-w-md" data-testid="iv-edit-dialog">
        <DialogHeader><DialogTitle>Edit / Reschedule — {interview.lead_name}</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs text-slate-500">Date & Time *</Label>
          <Input type="datetime-local" value={dt} onChange={(e) => setDt(e.target.value)} data-testid="iv-edit-date" />
          <Label className="text-xs text-slate-500">Notes</Label>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="iv-edit-notes" />
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="iv-edit-save">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
