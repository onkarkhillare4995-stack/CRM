import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatApiError } from "@/lib/api";
import { PRIORITY_OPTIONS, TASK_CATEGORIES, toDatetimeLocal } from "@/lib/leadConstants";

const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return toDatetimeLocal(d); };
const EMPTY = { title: "", category: "general_admin", priority: "medium", related_entity: "", notes: "" };

export default function AddTaskDialog({ open, onClose, onCreated, editTask }) {
  const isEdit = !!editTask;
  const [form, setForm] = useState(EMPTY);
  const [due, setDue] = useState(tomorrow());
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      setForm({ title: editTask.title || "", category: editTask.category || "general_admin",
        priority: editTask.priority || "medium", related_entity: editTask.related_entity || "", notes: editTask.notes || "" });
      setDue(editTask.due_at ? toDatetimeLocal(new Date(editTask.due_at)) : "");
    } else { setForm(EMPTY); setDue(tomorrow()); }
  }, [open, isEdit, editTask]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error("Task title is required");
    setSaving(true);
    try {
      const payload = { ...form, due_at: due ? new Date(due).toISOString() : null };
      if (isEdit) await api.put(`/tasks/${editTask.id}`, payload);
      else await api.post("/tasks", payload);
      toast.success(isEdit ? "Task updated" : "Task added");
      onCreated?.(); onClose();
    } catch (err) { toast.error(formatApiError(err)); } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white dark:bg-slate-900" data-testid="add-task-dialog">
        <DialogHeader><DialogTitle>{isEdit ? "Edit Task" : "New Task / Reminder"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5"><Label className="text-xs text-slate-500">Task Title *</Label>
            <Input data-testid="task-title-input" value={form.title} onChange={(e) => set("title", e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">Category</Label>
              <Select value={form.category} onValueChange={(v) => set("category", v)}>
                <SelectTrigger data-testid="task-category-select"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900">
                  {TASK_CATEGORIES.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => set("priority", v)}>
                <SelectTrigger data-testid="task-priority-select"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900">
                  {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">Due date/time</Label>
              <Input type="datetime-local" data-testid="task-due-input" value={due} onChange={(e) => setDue(e.target.value)} /></div>
            <div className="space-y-1.5"><Label className="text-xs text-slate-500">Related Contact / Entity</Label>
              <Input data-testid="task-related-input" value={form.related_entity} onChange={(e) => set("related_entity", e.target.value)} /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-slate-500">Notes & Reminders</Label>
            <Textarea data-testid="task-notes-input" value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="task-save-button" className="bg-indigo-600 hover:bg-indigo-700">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{isEdit ? "Save Changes" : "Add Task"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
