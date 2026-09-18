import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PRIORITY_OPTIONS, GENDER_OPTIONS, nextWorkingSuggestion, digitsOnly } from "@/lib/leadConstants";

const EMPTY = {
  name: "", phone: "", alt_phone: "", email: "", city: "", age: "", gender: "",
  qualification: "", experience: "", current_salary: "", expected_salary: "",
  notice_period: "", source: "manual", role_applied: "", priority: "medium",
  owner_id: "", client: "", job: "", notes: "",
};

// Reusable Add / Edit candidate lead. Edit mode when `editLead` is provided.
export default function AddLeadDialog({ open, onClose, onCreated, onSaved, editLead, onOpenExisting }) {
  const { user, hasPermission } = useAuth();
  const isEdit = !!editLead;
  const canAssign = hasPermission("leads.assign");
  const [form, setForm] = useState(EMPTY);
  const [firstFollowup, setFirstFollowup] = useState(nextWorkingSuggestion());
  const [firstReason, setFirstReason] = useState("First call");
  const [saving, setSaving] = useState(false);
  const [recruiters, setRecruiters] = useState([]);
  const [dup, setDup] = useState(null);
  const [ack, setAck] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    setDup(null); setAck(false);
    if (canAssign) api.get("/recruiters").then((r) => setRecruiters(r.data)).catch(() => {});
    if (isEdit) {
      setForm({
        ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, editLead[k] ?? EMPTY[k]])),
        age: editLead.age ?? "", owner_id: editLead.owner_id || "",
      });
    } else {
      setForm(EMPTY); setFirstFollowup(nextWorkingSuggestion()); setFirstReason("First call");
    }
  }, [open, isEdit, editLead, canAssign]);

  const runDuplicate = useCallback(async () => {
    if (digitsOnly(form.phone).length < 10) return;
    try {
      const { data } = await api.post("/leads/check-duplicate", { phone: form.phone });
      if (data.duplicate && (!isEdit || data.lead.id !== editLead.id)) setDup(data.lead);
      else setDup(null);
    } catch { /* ignore */ }
  }, [form.phone, isEdit, editLead]);

  const validate = () => {
    if (!form.name.trim() || form.name.trim().length < 2) return "Enter a valid full name";
    if (digitsOnly(form.phone).length < 10) return "Enter a valid phone number (min 10 digits)";
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return "Enter a valid email";
    if (!isEdit && !firstFollowup) return "First follow-up date & time is required";
    return null;
  };

  const submit = async (e) => {
    e?.preventDefault?.();
    const err = validate();
    if (err) return toast.error(err);
    if (dup && !ack && !isEdit) return toast.error("Resolve the duplicate below before creating");
    setSaving(true);
    try {
      const payload = {
        ...form,
        age: form.age === "" ? null : Number(form.age),
        email: form.email || null,
        owner_id: canAssign ? (form.owner_id || null) : undefined,
      };
      if (isEdit) {
        const { data } = await api.patch(`/leads/${editLead.id}`, payload);
        toast.success("Changes saved");
        onSaved?.(data);
      } else {
        const { data } = await api.post("/leads", {
          ...payload, first_followup_at: new Date(firstFollowup).toISOString(),
          first_followup_reason: firstReason || "First call", duplicate_ack: !!ack,
        });
        toast.success("Lead created");
        onCreated?.(data);
      }
      onClose();
    } catch (err2) {
      toast.error(formatApiError(err2));
    } finally {
      setSaving(false);
    }
  };

  const F = ({ label, k, type = "text", span }) => (
    <div className={`space-y-1.5 ${span ? "col-span-2" : ""}`}>
      <Label className="text-xs text-slate-500">{label}</Label>
      <Input type={type} value={form[k]} onChange={(e) => set(k, e.target.value)} data-testid={`lead-${k}-input`} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900 sm:max-w-2xl" data-testid="add-lead-dialog">
        <DialogHeader><DialogTitle>{isEdit ? "Edit Lead" : "New Candidate Lead"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs text-slate-500">Full Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} data-testid="lead-name-input" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Phone *</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} onBlur={runDuplicate} data-testid="lead-phone-input" />
            </div>
            {F({ label: "Alternate Phone", k: "alt_phone" })}
            {F({ label: "Email", k: "email", type: "email" })}
            {F({ label: "City", k: "city" })}
            {F({ label: "Age", k: "age", type: "number" })}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Gender</Label>
              <Select value={form.gender || undefined} onValueChange={(v) => set("gender", v)}>
                <SelectTrigger data-testid="lead-gender-select"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900">
                  {GENDER_OPTIONS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {F({ label: "Qualification", k: "qualification" })}
            {F({ label: "Experience", k: "experience" })}
            {F({ label: "Current Salary", k: "current_salary" })}
            {F({ label: "Expected Salary", k: "expected_salary" })}
            {F({ label: "Notice Period", k: "notice_period" })}
            {F({ label: "Source", k: "source" })}
            {F({ label: "Role Applied", k: "role_applied" })}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-500">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger data-testid="lead-priority-select"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900">
                  {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {F({ label: "Client", k: "client" })}
            {F({ label: "Job", k: "job" })}
            {canAssign && (
              <div className="space-y-1.5 col-span-2">
                <Label className="text-xs text-slate-500">Assigned Recruiter</Label>
                <Select value={form.owner_id || undefined} onValueChange={(v) => set("owner_id", v)}>
                  <SelectTrigger data-testid="lead-owner-select"><SelectValue placeholder={isEdit ? "Keep current" : "Assign to me"} /></SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900">
                    {recruiters.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5 col-span-2">
              <Label className="text-xs text-slate-500">Notes</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} data-testid="lead-notes-input" />
            </div>
          </div>

          {!isEdit && (
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900 dark:bg-indigo-950/30">
              <p className="mb-2 text-sm font-medium text-indigo-800 dark:text-indigo-300">First Follow-up (required)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Date & Time</Label>
                  <Input type="datetime-local" value={firstFollowup} onChange={(e) => setFirstFollowup(e.target.value)} data-testid="lead-first-followup-input" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Reason</Label>
                  <Input value={firstReason} onChange={(e) => setFirstReason(e.target.value)} data-testid="lead-first-reason-input" />
                </div>
              </div>
            </div>
          )}

          {dup && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/30" data-testid="duplicate-banner">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" /> Possible duplicate found
              </p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                {dup.name} · {dup.phone} · {dup.status} {dup.owner_name ? `· ${dup.owner_name}` : ""} {dup.lead_code ? `(${dup.lead_code})` : ""}
              </p>
              {!isEdit && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={onClose} data-testid="dup-cancel">Cancel</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => { onOpenExisting?.(dup.id); onClose(); }} data-testid="dup-open-existing">Open Existing</Button>
                  <Button type="button" size="sm" variant={ack ? "default" : "outline"} className={ack ? "bg-amber-600 hover:bg-amber-700" : ""} onClick={() => setAck((a) => !a)} data-testid="dup-flag">
                    {ack ? "Will create as duplicate ✓" : "Create as flagged duplicate"}
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="lead-save-button" className="bg-indigo-600 hover:bg-indigo-700">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{isEdit ? "Save Changes" : "Create Lead"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
