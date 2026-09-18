import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Phone, MessageCircle, Tag as TagIcon, X, Loader2, ClipboardList, Pencil, StickyNote,
  UserCog, Trash2, AlertTriangle, CalendarClock, CalendarPlus, Repeat, ShieldAlert,
  Activity, History, CheckCircle2,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import {
  STATUS_LABEL, STATUS_OPTIONS, statusClasses, priorityClasses, FINAL_STATUSES,
  REASON_REQUIRED_STATUSES, fmtDateTime, nextWorkingSuggestion, digitsOnly,
} from "@/lib/leadConstants";
import CallActionModal from "@/components/CallActionModal";
import CallDispositionModal from "@/components/CallDispositionModal";
import AddLeadDialog from "@/components/AddLeadDialog";
import AssignDialog from "@/components/AssignDialog";

const Field = ({ label, value }) => (
  <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5 text-sm dark:border-slate-800">
    <span className="text-slate-500">{label}</span>
    <span className="text-right font-medium text-slate-800 dark:text-slate-200">{value || "—"}</span>
  </div>
);

export default function LeadDrawer({ leadId, open, onClose, onChanged }) {
  const { user, hasPermission } = useAuth();
  const [lead, setLead] = useState(null);
  const [notes, setNotes] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [activities, setActivities] = useState([]);
  const [newTag, setNewTag] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [editNote, setEditNote] = useState(null);
  const [fuDate, setFuDate] = useState(nextWorkingSuggestion());
  const [fuReason, setFuReason] = useState("Follow-up");
  const [showFu, setShowFu] = useState(false);
  const [statusTarget, setStatusTarget] = useState("");
  const [statusReason, setStatusReason] = useState("");
  const [statusJoining, setStatusJoining] = useState("");
  const [callOpen, setCallOpen] = useState(false);
  const [dispoOpen, setDispoOpen] = useState(false);
  const [dispoDuration, setDispoDuration] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);

  const load = useCallback(() => {
    if (!leadId) return;
    api.get(`/leads/${leadId}`).then((r) => setLead(r.data)).catch((e) => toast.error(formatApiError(e)));
    api.get(`/leads/${leadId}/notes`).then((r) => setNotes(r.data)).catch(() => {});
    api.get(`/leads/${leadId}/followups`).then((r) => setFollowups(r.data)).catch(() => {});
    api.get(`/leads/${leadId}/activities`).then((r) => setActivities(r.data)).catch(() => {});
  }, [leadId]);

  useEffect(() => { if (open && leadId) load(); }, [open, leadId, load]);

  const after = (msg) => { toast.success(msg); load(); onChanged?.(); };
  const flags = lead?.flags || {};
  const isFinal = lead && FINAL_STATUSES.includes(lead.status);

  const addTag = async () => {
    if (!newTag.trim()) return;
    try { await api.put(`/leads/${leadId}/tags`, { tags: [...(lead.tags || []), newTag.trim()] }); setNewTag(""); after("Tags updated"); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const removeTag = async (t) => {
    try { await api.put(`/leads/${leadId}/tags`, { tags: (lead.tags || []).filter((x) => x !== t) }); after("Tags updated"); }
    catch (e) { toast.error(formatApiError(e)); }
  };
  const whatsapp = () => { window.open(`https://wa.me/${digitsOnly(lead.phone)}`, "_blank"); api.post(`/leads/${leadId}/whatsapp`).then(() => load()).catch(() => {}); };

  const saveNote = async () => {
    if (!noteBody.trim()) return;
    try {
      if (editNote) { await api.put(`/notes/${editNote}`, { body: noteBody }); setEditNote(null); }
      else await api.post(`/leads/${leadId}/notes`, { body: noteBody });
      setNoteBody(""); after("Note saved");
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const delNote = async (id) => { try { await api.delete(`/notes/${id}`); after("Note deleted"); } catch (e) { toast.error(formatApiError(e)); } };

  const addFollowup = async () => {
    if (!fuDate) return toast.error("Pick a date");
    try { await api.post(`/leads/${leadId}/followups`, { due_at: new Date(fuDate).toISOString(), reason: fuReason }); setShowFu(false); after("Follow-up scheduled"); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const applyStatus = async () => {
    try {
      await api.post(`/leads/${leadId}/status`, {
        status: statusTarget,
        closure_reason: statusReason || null,
        expected_joining_date: statusJoining ? new Date(statusJoining).toISOString() : null,
      });
      setStatusTarget(""); setStatusReason(""); setStatusJoining(""); after("Status updated");
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const onPickStatus = (s) => {
    setStatusTarget(s); setStatusReason(""); setStatusJoining("");
    if (!REASON_REQUIRED_STATUSES.includes(s) && s !== "selected") {
      // no extra input needed → apply immediately
      api.post(`/leads/${leadId}/status`, { status: s })
        .then(() => { setStatusTarget(""); after("Status updated"); })
        .catch((e) => { setStatusTarget(""); toast.error(formatApiError(e)); });
    }
  };

  const archive = async () => {
    if (!window.confirm("Archive this lead? Historical data is preserved.")) return;
    try { await api.delete(`/leads/${leadId}`); toast.success("Lead archived"); onChanged?.(); onClose(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  const canEdit = hasPermission("leads.edit");
  const needsStatusInput = statusTarget && (REASON_REQUIRED_STATUSES.includes(statusTarget) || statusTarget === "selected");

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto bg-white p-0 dark:bg-slate-900 sm:max-w-xl" data-testid="lead-drawer">
        {!lead ? (
          <div className="py-16 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
        ) : (
          <div className="p-6">
            <SheetHeader>
              <SheetTitle className="flex flex-wrap items-center gap-2">
                <span data-testid="lead-drawer-name">{lead.name}</span>
                <span className="text-xs font-normal text-slate-400">{lead.lead_code}</span>
              </SheetTitle>
            </SheetHeader>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge className={statusClasses(lead.status)} data-testid="drawer-status-badge">{STATUS_LABEL[lead.status]}</Badge>
              <span className={`text-xs ${priorityClasses(lead.priority)}`}>{lead.priority} priority</span>
              {isFinal && <Badge variant="outline" className="border-slate-300">Closed</Badge>}
              {flags.invalid_phone && <Badge className="gap-1 bg-red-100 text-red-700"><AlertTriangle className="h-3 w-3" /> Invalid phone</Badge>}
              {flags.duplicate_phone && <Badge className="gap-1 bg-amber-100 text-amber-700"><ShieldAlert className="h-3 w-3" /> Duplicate</Badge>}
            </div>
            {(lead.tags || []).length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">{lead.tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</div>
            )}

            {/* Follow-up banner */}
            <div className="mt-3 rounded-lg border p-3 text-sm" data-testid="followup-banner">
              {isFinal ? <span className="text-slate-500">Lead closed — {STATUS_LABEL[lead.status]}{lead.closure_reason ? ` · ${lead.closure_reason}` : ""}</span>
                : flags.overdue ? <span className="flex items-center gap-2 font-medium text-red-600"><CalendarClock className="h-4 w-4" /> Overdue follow-up · {fmtDateTime(lead.next_followup_at)}</span>
                : lead.next_followup_at ? <span className="flex items-center gap-2 text-slate-700 dark:text-slate-300"><CalendarClock className="h-4 w-4 text-indigo-500" /> Next follow-up · {fmtDateTime(lead.next_followup_at)}</span>
                : <span className="flex items-center gap-2 font-medium text-amber-600"><AlertTriangle className="h-4 w-4" /> Active lead with no follow-up scheduled</span>}
              {!isFinal && (
                <div className="mt-2 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setShowFu((s) => !s); setFuDate(nextWorkingSuggestion()); }} data-testid="drawer-add-followup">
                    <CalendarPlus className="mr-1 h-4 w-4" /> {lead.next_followup_at ? "Reschedule" : "Add Follow-up"}
                  </Button>
                </div>
              )}
              {showFu && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Input type="datetime-local" value={fuDate} onChange={(e) => setFuDate(e.target.value)} data-testid="drawer-followup-date" />
                  <div className="flex gap-2">
                    <Input placeholder="Reason" value={fuReason} onChange={(e) => setFuReason(e.target.value)} />
                    <Button size="sm" onClick={addFollowup} className="bg-indigo-600 hover:bg-indigo-700" data-testid="drawer-followup-save"><Repeat className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </div>

            {/* Primary actions */}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setCallOpen(true)} data-testid="drawer-call"><Phone className="mr-1 h-4 w-4" /> Call</Button>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => { setDispoDuration(0); setDispoOpen(true); }} data-testid="drawer-disposition"><ClipboardList className="mr-1 h-4 w-4" /> Disposition</Button>
              <Button size="sm" variant="outline" onClick={whatsapp} data-testid="drawer-whatsapp"><MessageCircle className="mr-1 h-4 w-4" /> WhatsApp</Button>
              {canEdit && <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} data-testid="drawer-edit"><Pencil className="mr-1 h-4 w-4" /> Edit</Button>}
              {hasPermission("leads.assign") && <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)} data-testid="drawer-assign"><UserCog className="mr-1 h-4 w-4" /> Assign</Button>}
              {hasPermission("leads.delete") && <Button size="sm" variant="outline" className="text-red-600" onClick={archive} data-testid="drawer-delete"><Trash2 className="mr-1 h-4 w-4" /> Archive</Button>}
            </div>

            {canEdit && !isFinal && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs text-slate-500">Change status</span>
                <Select value={statusTarget || undefined} onValueChange={onPickStatus}>
                  <SelectTrigger className="w-48" data-testid="drawer-status-select"><SelectValue placeholder="Select status" /></SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900">
                    {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {needsStatusInput && (
              <div className="mt-2 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
                {statusTarget === "selected" && <Input type="datetime-local" value={statusJoining} onChange={(e) => setStatusJoining(e.target.value)} placeholder="Joining" data-testid="drawer-status-joining" />}
                {REASON_REQUIRED_STATUSES.includes(statusTarget) && <Input value={statusReason} onChange={(e) => setStatusReason(e.target.value)} placeholder="Closure reason" data-testid="drawer-status-reason" />}
                <Button size="sm" onClick={applyStatus} className="bg-indigo-600 hover:bg-indigo-700" data-testid="drawer-status-apply">Apply</Button>
              </div>
            )}

            {/* Tabs */}
            <Tabs defaultValue="details" className="mt-5">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
                <TabsTrigger value="notes" data-testid="tab-notes">Notes ({notes.length})</TabsTrigger>
                <TabsTrigger value="followups" data-testid="tab-followups">Follow-ups</TabsTrigger>
                <TabsTrigger value="activity" data-testid="tab-activity">Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-3">
                <Field label="Phone" value={lead.phone} />
                <Field label="Alternate Phone" value={lead.alt_phone} />
                <Field label="Email" value={lead.email} />
                <Field label="City" value={lead.city} />
                <Field label="Age / Gender" value={[lead.age, lead.gender].filter(Boolean).join(" / ")} />
                <Field label="Qualification" value={lead.qualification} />
                <Field label="Experience" value={lead.experience} />
                <Field label="Notice Period" value={lead.notice_period} />
                <Field label="Current / Expected Salary" value={[lead.current_salary, lead.expected_salary].filter(Boolean).join(" / ")} />
                <Field label="Source" value={lead.source} />
                <Field label="Recruiter" value={lead.owner_name} />
                <Field label="Client" value={lead.client} />
                <Field label="Job" value={lead.job || lead.role_applied} />
                <Field label="Call Attempts" value={lead.call_count} />
                <Field label="Last Call Outcome" value={lead.last_call_outcome} />
                <Field label="Expected Joining" value={fmtDateTime(lead.expected_joining_at)} />
                <Field label="Closure / Lost Reason" value={lead.closure_reason} />
                <Field label="Lead Age" value={lead.lead_age_days != null ? `${lead.lead_age_days} days` : "—"} />
                <div className="mt-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  <p className="mb-2 flex items-center gap-1 text-sm font-medium"><TagIcon className="h-4 w-4" /> Tags</p>
                  <div className="mb-2 flex flex-wrap gap-1">
                    {(lead.tags || []).map((t) => (
                      <Badge key={t} variant="secondary" className="gap-1">{t}
                        {canEdit && <button onClick={() => removeTag(t)} data-testid={`remove-tag-${t}`}><X className="h-3 w-3" /></button>}
                      </Badge>
                    ))}
                    {(lead.tags || []).length === 0 && <span className="text-xs text-slate-400">No tags</span>}
                  </div>
                  {canEdit && (
                    <div className="flex gap-2">
                      <Input placeholder="Add tag" value={newTag} onChange={(e) => setNewTag(e.target.value)} data-testid="tag-input" />
                      <Button size="sm" variant="outline" onClick={addTag} data-testid="add-tag-button">Add</Button>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="notes" className="mt-3 space-y-3">
                {canEdit && (
                  <div className="flex gap-2">
                    <Textarea placeholder={editNote ? "Edit note…" : "Add a note…"} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} data-testid="note-input" />
                    <Button size="sm" onClick={saveNote} className="bg-indigo-600 hover:bg-indigo-700" data-testid="note-save"><StickyNote className="h-4 w-4" /></Button>
                  </div>
                )}
                {notes.length === 0 && <p className="text-sm text-slate-500">No notes yet.</p>}
                {notes.map((n) => {
                  const mine = n.author_id === user?.id || user?.role === "admin";
                  return (
                    <div key={n.id} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800" data-testid={`note-${n.id}`}>
                      <p className="text-sm text-slate-800 dark:text-slate-200">{n.body}</p>
                      <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
                        <span>{n.author_name} · {fmtDateTime(n.created_at)}</span>
                        {mine && (
                          <span className="flex gap-2">
                            <button onClick={() => { setEditNote(n.id); setNoteBody(n.body); }} data-testid={`note-edit-${n.id}`}>Edit</button>
                            <button className="text-red-500" onClick={() => delNote(n.id)} data-testid={`note-delete-${n.id}`}>Delete</button>
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </TabsContent>

              <TabsContent value="followups" className="mt-3 space-y-2">
                {followups.length === 0 && <p className="text-sm text-slate-500">No follow-ups.</p>}
                {followups.map((f) => (
                  <div key={f.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800" data-testid={`fu-${f.id}`}>
                    <div>
                      <p className="font-medium text-slate-800 dark:text-slate-200">{fmtDateTime(f.due_at)}</p>
                      <p className="text-xs text-slate-500">{f.reason || "Follow-up"}</p>
                    </div>
                    <Badge className={
                      f.display_status === "overdue" ? "bg-red-100 text-red-700"
                        : f.display_status === "completed" ? "bg-emerald-100 text-emerald-700"
                        : f.display_status === "superseded" ? "bg-slate-100 text-slate-500"
                        : "bg-indigo-100 text-indigo-700"
                    }>{f.display_status}</Badge>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="activity" className="mt-3">
                <div className="relative space-y-3 pl-4">
                  {activities.length === 0 && <p className="text-sm text-slate-500">No activity yet.</p>}
                  {activities.map((a) => (
                    <div key={a.id} className="relative border-l-2 border-slate-200 pl-4 dark:border-slate-800" data-testid={`activity-${a.id}`}>
                      <span className="absolute -left-[7px] top-1 h-3 w-3 rounded-full bg-indigo-500" />
                      <p className="text-sm text-slate-800 dark:text-slate-200">{a.summary}</p>
                      <p className="text-xs text-slate-400">{a.actor_name} · {fmtDateTime(a.created_at)}</p>
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>

      {lead && <>
        <CallActionModal open={callOpen} onClose={() => setCallOpen(false)} lead={lead}
          onLogDisposition={(dur) => { setCallOpen(false); setDispoDuration(dur); setDispoOpen(true); }} />
        <CallDispositionModal open={dispoOpen} onClose={() => setDispoOpen(false)} lead={lead} initialDuration={dispoDuration} onDone={() => after("Disposition saved")} />
        <AddLeadDialog open={editOpen} onClose={() => setEditOpen(false)} editLead={lead} onSaved={() => after("Lead updated")} />
        <AssignDialog open={assignOpen} onClose={() => setAssignOpen(false)} leadIds={[lead.id]} mode="assign" onDone={() => after("Reassigned")} />
      </>}
    </Sheet>
  );
}
