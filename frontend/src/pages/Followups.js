import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Search, Phone, MessageCircle, CalendarPlus, Check, Trash2, X, Loader2, Repeat,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import LeadDrawer from "@/components/LeadDrawer";
import {
  STATUS_OPTIONS, STATUS_LABEL, statusClasses, priorityClasses, fmtDateTime, digitsOnly,
  REASON_REQUIRED_STATUSES, nextWorkingSuggestion,
} from "@/lib/leadConstants";

const TABS = [
  { key: "due_today", label: "Due Today" }, { key: "overdue", label: "Overdue" },
  { key: "tomorrow", label: "Tomorrow" }, { key: "upcoming", label: "Upcoming" },
  { key: "missed", label: "Missed" }, { key: "completed", label: "Completed" },
];

function CompleteDialog({ open, onClose, followup, onDone }) {
  const [outcome, setOutcome] = useState("");
  const [mode, setMode] = useState("next");
  const [nextDue, setNextDue] = useState(nextWorkingSuggestion());
  const [nextReason, setNextReason] = useState("Follow-up");
  const [finalStatus, setFinalStatus] = useState("");
  const [closure, setClosure] = useState("");
  const [joining, setJoining] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) { setOutcome(""); setMode("next"); setNextDue(nextWorkingSuggestion()); setNextReason("Follow-up"); setFinalStatus(""); setClosure(""); setJoining(""); } }, [open]);
  if (!followup) return null;

  const submit = async () => {
    if (mode === "next" && !nextDue) return toast.error("Next date/time is required");
    if (mode === "next" && !nextReason.trim()) return toast.error("Reason is required");
    if (mode === "final" && !finalStatus) return toast.error("Choose a final status");
    if (mode === "final" && REASON_REQUIRED_STATUSES.includes(finalStatus) && !closure.trim()) return toast.error("Closure reason required");
    if (mode === "final" && finalStatus === "selected" && !joining) return toast.error("Expected joining date required");
    setSaving(true);
    try {
      await api.post(`/followups/${followup.id}/complete`, {
        outcome: outcome || null, mode,
        next_due_at: mode === "next" ? new Date(nextDue).toISOString() : null,
        next_reason: mode === "next" ? nextReason : null,
        final_status: mode === "final" ? finalStatus : null,
        closure_reason: mode === "final" ? (closure || null) : null,
        expected_joining_date: mode === "final" && joining ? new Date(joining).toISOString() : null,
      });
      toast.success("Follow-up completed"); onDone?.(); onClose();
    } catch (e) { toast.error(formatApiError(e)); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white dark:bg-slate-900 sm:max-w-md" data-testid="complete-followup-dialog">
        <DialogHeader><DialogTitle>Complete Follow-up — {followup.lead_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label className="text-xs text-slate-500">Outcome / Notes</Label>
            <Textarea value={outcome} onChange={(e) => setOutcome(e.target.value)} data-testid="complete-outcome" /></div>
          <div className="flex gap-2">
            <Button type="button" size="sm" variant={mode === "next" ? "default" : "outline"} className={mode === "next" ? "bg-indigo-600" : ""} onClick={() => setMode("next")} data-testid="complete-mode-next">Schedule next</Button>
            <Button type="button" size="sm" variant={mode === "final" ? "default" : "outline"} className={mode === "final" ? "bg-indigo-600" : ""} onClick={() => setMode("final")} data-testid="complete-mode-final">Move to final</Button>
          </div>
          {mode === "next" ? (
            <div className="grid grid-cols-2 gap-2">
              <Input type="datetime-local" value={nextDue} onChange={(e) => setNextDue(e.target.value)} data-testid="complete-next-date" />
              <Input placeholder="Reason" value={nextReason} onChange={(e) => setNextReason(e.target.value)} data-testid="complete-next-reason" />
            </div>
          ) : (
            <div className="space-y-2">
              <Select value={finalStatus || undefined} onValueChange={setFinalStatus}>
                <SelectTrigger data-testid="complete-final-status"><SelectValue placeholder="Final status" /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900">
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
              {finalStatus === "selected" && <Input type="datetime-local" value={joining} onChange={(e) => setJoining(e.target.value)} placeholder="Expected joining" data-testid="complete-joining" />}
              {REASON_REQUIRED_STATUSES.includes(finalStatus) && <Input value={closure} onChange={(e) => setClosure(e.target.value)} placeholder="Closure reason" data-testid="complete-closure" />}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="complete-save">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Complete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RescheduleDialog({ open, onClose, followup, onDone }) {
  const [due, setDue] = useState(nextWorkingSuggestion());
  const [reason, setReason] = useState("Follow-up");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setDue(nextWorkingSuggestion()); setReason("Follow-up"); } }, [open]);
  if (!followup) return null;
  const submit = async () => {
    if (!due) return toast.error("Date/time required");
    setSaving(true);
    try {
      await api.post(`/leads/${followup.lead_id}/followups`, { due_at: new Date(due).toISOString(), reason });
      toast.success("Rescheduled"); onDone?.(); onClose();
    } catch (e) { toast.error(formatApiError(e)); } finally { setSaving(false); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white dark:bg-slate-900 sm:max-w-md" data-testid="reschedule-dialog">
        <DialogHeader><DialogTitle>Reschedule — {followup.lead_name}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} data-testid="reschedule-date" />
          <Input placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="reschedule-reason" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="reschedule-save">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Followups() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState("due_today");
  const [counts, setCounts] = useState({});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [recruiter, setRecruiter] = useState("all");
  const [recruiters, setRecruiters] = useState([]);
  const [drawerLead, setDrawerLead] = useState(null);
  const [complete, setComplete] = useState(null);
  const [reschedule, setReschedule] = useState(null);
  const canRecView = hasPermission("recruiters.view");

  useEffect(() => { if (canRecView) api.get("/recruiters").then((r) => setRecruiters(r.data)).catch(() => {}); }, [canRecView]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { tab };
      if (search) params.search = search;
      if (recruiter !== "all") params.recruiter_id = recruiter;
      const { data } = await api.get("/followups/board", { params });
      setRows(data.items); setCounts(data.counts);
    } catch (e) { toast.error(formatApiError(e)); } finally { setLoading(false); }
  }, [tab, search, recruiter]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const done = async (f) => setComplete(f);
  const del = async (id) => { if (!window.confirm("Delete this follow-up?")) return; try { await api.delete(`/followups/${id}`); toast.success("Deleted"); load(); } catch (e) { toast.error(formatApiError(e)); } };
  const whatsapp = (f) => { window.open(`https://wa.me/${digitsOnly(f.phone)}`, "_blank"); api.post(`/leads/${f.lead_id}/whatsapp`).catch(() => {}); };

  return (
    <div className="space-y-5" data-testid="followups-page">
      <div><h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Follow-ups</h1>
        <p className="text-sm text-slate-500">Manage your scheduled candidate follow-ups</p></div>

      <div className="flex flex-wrap gap-2" data-testid="followup-tabs">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`fu-tab-${t.key}`}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${tab === t.key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
            {t.label}<span className={`rounded-full px-1.5 ${tab === t.key ? "bg-white/25" : "bg-slate-200 dark:bg-slate-700"}`} data-testid={`fu-count-${t.key}`}>{counts[t.key] ?? 0}</span>
          </button>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Search candidate or phone" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="fu-search-input" />
          </div>
          {canRecView && (
            <Select value={recruiter} onValueChange={setRecruiter}>
              <SelectTrigger className="w-[170px]" data-testid="fu-recruiter-filter"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900">
                <SelectItem value="all">All recruiters</SelectItem>
                {recruiters.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {canRecView && recruiter !== "all" && <Button variant="outline" onClick={() => setRecruiter("all")} data-testid="fu-clear-recruiter"><X className="mr-1 h-4 w-4" /> Clear recruiter</Button>}
        </div>
      </Card>

      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {loading ? <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
        : rows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No follow-ups here.</p>
        : rows.map((f) => (
          <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3" data-testid={`followup-${f.id}`}>
            <div className="min-w-0">
              <button className="text-left font-medium text-slate-900 hover:text-indigo-600 dark:text-slate-100" onClick={() => setDrawerLead(f.lead_id)} data-testid={`fu-name-${f.id}`}>{f.lead_name}</button>
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                {f.lead_status && <Badge className={statusClasses(f.lead_status)}>{STATUS_LABEL[f.lead_status]}</Badge>}
                {f.priority && <span className={priorityClasses(f.priority)}>{f.priority}</span>}
                <span>Due {fmtDateTime(f.due_at)}</span>
                {f.overdue && <Badge className="bg-red-100 px-1 py-0 text-[10px] text-red-700" data-testid={`fu-overdue-${f.id}`}>Overdue</Badge>}
                {f.reason && <span>· {f.reason}</span>}
                {f.outcome && <span>· {f.outcome}</span>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDrawerLead(f.lead_id)} title="Call" data-testid={`fu-call-${f.id}`}><Phone className="h-3.5 w-3.5" /></Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => whatsapp(f)} title="WhatsApp" data-testid={`fu-wa-${f.id}`}><MessageCircle className="h-3.5 w-3.5" /></Button>
              {f.status === "pending" && <>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setReschedule(f)} data-testid={`fu-reschedule-${f.id}`}><CalendarPlus className="mr-1 h-3.5 w-3.5" /> Reschedule</Button>
                <Button size="sm" variant="outline" className="h-7" onClick={() => done(f)} data-testid={`fu-complete-${f.id}`}><Check className="mr-1 h-3.5 w-3.5" /> Done</Button>
              </>}
              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => del(f.id)} title="Delete" data-testid={`fu-delete-${f.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ))}
      </Card>

      <LeadDrawer leadId={drawerLead} open={!!drawerLead} onClose={() => setDrawerLead(null)} onChanged={load} />
      <CompleteDialog open={!!complete} onClose={() => setComplete(null)} followup={complete} onDone={load} />
      <RescheduleDialog open={!!reschedule} onClose={() => setReschedule(null)} followup={reschedule} onDone={load} />
    </div>
  );
}
