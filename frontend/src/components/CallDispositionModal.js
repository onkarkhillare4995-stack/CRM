import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Copy, Phone, MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatApiError } from "@/lib/api";
import {
  CONNECTED_OUTCOMES, NOT_CONNECTED_OUTCOMES, CALLBACK_OUTCOMES, AUTO_FINAL_MAP,
  ACTIVE_STATUSES, FINAL_STATUSES, REASON_REQUIRED_STATUSES, STATUS_OPTIONS, INTERVIEW_TYPES,
  quickFollowup, toDatetimeLocal, digitsOnly,
} from "@/lib/leadConstants";

const empty = { scheduled_at: "", client: "", job: "", type: "f2f", location: "", contact_person: "", notes: "" };

// Transactional Call Disposition engine. One submit may create call, change status,
// complete/create follow-up, create interview & joining, and append activity/audit.
export default function CallDispositionModal({ open, onClose, lead, initialDuration = 0, onDone }) {
  const [outcome, setOutcome] = useState("connected_interested");
  const [notes, setNotes] = useState("");
  const [duration, setDuration] = useState(0);
  const [nextFollowup, setNextFollowup] = useState("");
  const [followupReason, setFollowupReason] = useState("Follow-up");
  const [statusOverride, setStatusOverride] = useState("");
  const [interview, setInterview] = useState(empty);
  const [expectedJoining, setExpectedJoining] = useState("");
  const [closureReason, setClosureReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setOutcome("connected_interested"); setNotes(""); setDuration(initialDuration || 0);
      setNextFollowup(""); setFollowupReason("Follow-up"); setStatusOverride("");
      setInterview(empty); setExpectedJoining(""); setClosureReason("");
    }
  }, [open, initialDuration]);

  const target = useMemo(() => {
    const cur = lead?.status || "new";
    if (statusOverride) return statusOverride;
    if (AUTO_FINAL_MAP[outcome]) return AUTO_FINAL_MAP[outcome];
    if (outcome === "connected_interested") return ["new", "contacted"].includes(cur) ? "interested" : cur;
    if (outcome === "interview_scheduled") return "lineup";
    return cur;
  }, [outcome, statusOverride, lead]);

  const showInterview = outcome === "interview_scheduled";
  const requireJoining = target === "selected";
  const requireReason = REASON_REQUIRED_STATUSES.includes(target);
  const hasExistingFollowup = !!lead?.next_followup_at;
  const requireFollowup = CALLBACK_OUTCOMES.includes(outcome)
    || (!FINAL_STATUSES.includes(target) && ACTIVE_STATUSES.includes(target) && !hasExistingFollowup && !showInterview);

  if (!lead) return null;
  const setIv = (k, v) => setInterview((i) => ({ ...i, [k]: v }));
  const copy = () => { navigator.clipboard?.writeText(lead.phone); toast.success("Copied"); };

  const submit = async () => {
    if (requireFollowup && !nextFollowup) return toast.error("A next follow-up is required for this outcome");
    if (showInterview && (!interview.scheduled_at || !interview.client || !interview.job || !interview.type))
      return toast.error("Interview date, client, job and type are required");
    if (requireJoining && !expectedJoining) return toast.error("Expected joining date is required for Selected");
    if (requireReason && !closureReason.trim()) return toast.error("A closure reason is required");
    setSaving(true);
    try {
      const payload = {
        outcome, notes: notes || null, duration_seconds: Number(duration) || 0,
        status_override: statusOverride || null,
        next_followup_at: nextFollowup ? new Date(nextFollowup).toISOString() : null,
        next_followup_reason: nextFollowup ? followupReason : null,
        expected_joining_date: expectedJoining ? new Date(expectedJoining).toISOString() : null,
        closure_reason: closureReason || null,
        interview: showInterview ? {
          scheduled_at: new Date(interview.scheduled_at).toISOString(), client: interview.client,
          job: interview.job, type: interview.type, location: interview.location || null,
          contact_person: interview.contact_person || null, notes: interview.notes || null,
        } : null,
      };
      await api.post(`/leads/${lead.id}/disposition`, payload);
      toast.success("Disposition saved");
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 sm:max-w-lg" data-testid="disposition-modal">
        <DialogHeader><DialogTitle>Call Disposition — {lead.name}</DialogTitle></DialogHeader>

        <div className="mb-2 flex gap-2">
          <a href={`tel:${digitsOnly(lead.phone)}`}><Button type="button" size="sm" variant="outline" data-testid="dispo-dial"><Phone className="mr-1 h-4 w-4" /> Dial</Button></a>
          <Button type="button" size="sm" variant="outline" onClick={copy} data-testid="dispo-copy"><Copy className="mr-1 h-4 w-4" /> Copy</Button>
          <Button type="button" size="sm" variant="outline" onClick={() => window.open(`https://wa.me/${digitsOnly(lead.phone)}`, "_blank")} data-testid="dispo-whatsapp"><MessageCircle className="mr-1 h-4 w-4" /> WhatsApp</Button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Outcome</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger data-testid="dispo-outcome-select"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72 bg-white dark:bg-slate-900">
                <div className="px-2 py-1 text-xs font-semibold uppercase text-slate-400">Connected</div>
                {CONNECTED_OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                <div className="px-2 py-1 text-xs font-semibold uppercase text-slate-400">Not Connected</div>
                {NOT_CONNECTED_OUTCOMES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Call Duration (sec)</Label>
              <Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} data-testid="dispo-duration" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Status Override (optional)</Label>
              <Select value={statusOverride || undefined} onValueChange={(v) => setStatusOverride(v === "__none" ? "" : v)}>
                <SelectTrigger data-testid="dispo-status-override"><SelectValue placeholder="Auto" /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900">
                  <SelectItem value="__none">Auto ({target})</SelectItem>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(requireFollowup || (!FINAL_STATUSES.includes(target))) && (
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <p className="mb-2 text-sm font-medium">Next Follow-up {requireFollowup && <span className="text-red-500">*</span>}</p>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {[["+1 Hour", "1h"], ["Today 5 PM", "today5"], ["Tomorrow 10 AM", "tom10"], ["In 2 Days", "2days"]].map(([l, k]) => (
                  <Button key={k} type="button" size="sm" variant="outline" onClick={() => setNextFollowup(quickFollowup(k))} data-testid={`dispo-quick-${k}`}>{l}</Button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input type="datetime-local" value={nextFollowup} onChange={(e) => setNextFollowup(e.target.value)} data-testid="dispo-followup-date" />
                <Input placeholder="Reason" value={followupReason} onChange={(e) => setFollowupReason(e.target.value)} data-testid="dispo-followup-reason" />
              </div>
            </div>
          )}

          {showInterview && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 dark:border-violet-900 dark:bg-violet-950/20" data-testid="dispo-interview-block">
              <p className="mb-2 text-sm font-medium text-violet-800 dark:text-violet-300">Interview Details *</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2"><Input type="datetime-local" value={interview.scheduled_at} onChange={(e) => setIv("scheduled_at", e.target.value)} data-testid="dispo-iv-date" /></div>
                <Input placeholder="Client" value={interview.client} onChange={(e) => setIv("client", e.target.value)} data-testid="dispo-iv-client" />
                <Input placeholder="Job" value={interview.job} onChange={(e) => setIv("job", e.target.value)} data-testid="dispo-iv-job" />
                <Select value={interview.type} onValueChange={(v) => setIv("type", v)}>
                  <SelectTrigger data-testid="dispo-iv-type"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900">
                    {INTERVIEW_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input placeholder="Location (optional)" value={interview.location} onChange={(e) => setIv("location", e.target.value)} data-testid="dispo-iv-location" />
                <Input placeholder="Contact person (optional)" value={interview.contact_person} onChange={(e) => setIv("contact_person", e.target.value)} className="col-span-2" data-testid="dispo-iv-contact" />
              </div>
            </div>
          )}

          {requireJoining && (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Expected Joining Date *</Label>
              <Input type="datetime-local" value={expectedJoining} onChange={(e) => setExpectedJoining(e.target.value)} data-testid="dispo-joining-date" />
            </div>
          )}

          {requireReason && (
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Closure / Lost Reason *</Label>
              <Input value={closureReason} onChange={(e) => setClosureReason(e.target.value)} data-testid="dispo-closure-reason" />
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-slate-500">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="dispo-notes" />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="dispo-save">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save Disposition
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
