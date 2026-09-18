import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Search, Plus, Check, RotateCcw, Pencil, Trash2, ListTodo, Flame, CheckCircle2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatApiError } from "@/lib/api";
import AddTaskDialog from "@/components/AddTaskDialog";
import { priorityClasses, fmtDateTime, TASK_CATEGORY_LABEL } from "@/lib/leadConstants";

const STATUS_LABEL = { pending: "Pending", in_progress: "In Progress", done: "Completed", cancelled: "Cancelled" };

export default function Tasks() {
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({ pending: 0, high_priority: 0, completed: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [priority, setPriority] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editTask, setEditTask] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (status !== "all") params.status = status;
      if (priority !== "all") params.priority = priority;
      const [t, s] = await Promise.all([api.get("/tasks", { params }), api.get("/tasks/summary")]);
      setRows(t.data); setSummary(s.data);
    } catch (e) { toast.error(formatApiError(e)); } finally { setLoading(false); }
  }, [search, status, priority]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const setStatusOf = async (id, st) => { try { await api.put(`/tasks/${id}`, { status: st }); load(); } catch (e) { toast.error(formatApiError(e)); } };
  const del = async (id) => { if (!window.confirm("Delete this task?")) return; try { await api.delete(`/tasks/${id}`); toast.success("Deleted"); load(); } catch (e) { toast.error(formatApiError(e)); } };

  const cards = [
    { label: "Pending Action Items", value: summary.pending, icon: ListTodo, tone: "text-indigo-600" },
    { label: "High Priority Tasks", value: summary.high_priority, icon: Flame, tone: "text-red-600" },
    { label: "Completed Tasks", value: summary.completed, icon: CheckCircle2, tone: "text-emerald-600" },
  ];
  const now = new Date();

  return (
    <div className="space-y-6" data-testid="tasks-page">
      <div className="flex items-center justify-between">
        <div><h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Tasks & To-Dos</h1>
          <p className="text-sm text-slate-500">Your action items and reminders</p></div>
        <Button onClick={() => { setEditTask(null); setAddOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700" data-testid="add-task-button"><Plus className="mr-1 h-4 w-4" /> New Task</Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="flex items-center gap-4 p-5" data-testid={`task-summary-${c.label.split(" ")[0].toLowerCase()}`}>
            <c.icon className={`h-8 w-8 ${c.tone}`} />
            <div><p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{c.value}</p><p className="text-sm text-slate-500">{c.label}</p></div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Search title / entity" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="task-search-input" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[150px]" data-testid="task-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900">
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="done">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-[140px]" data-testid="task-priority-filter"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900">
              <SelectItem value="all">All priority</SelectItem>
              <SelectItem value="high">High</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {loading ? <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
        : rows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No tasks found.</p>
        : rows.map((t) => {
          const done = t.status === "done";
          const overdue = !done && t.due_at && new Date(t.due_at) < now;
          return (
            <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-3" data-testid={`task-${t.id}`}>
              <div className="flex items-start gap-3">
                <Checkbox checked={done} onCheckedChange={() => setStatusOf(t.id, done ? "pending" : "done")} data-testid={`task-toggle-${t.id}`} className="mt-1" />
                <div>
                  <p className={`font-medium ${done ? "text-slate-400 line-through" : "text-slate-900 dark:text-slate-100"}`}>{t.title}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <Badge variant="secondary" className="text-[10px]">{TASK_CATEGORY_LABEL[t.category] || t.category}</Badge>
                    <span className={priorityClasses(t.priority)}>{t.priority}</span>
                    {t.due_at && <span>Due {fmtDateTime(t.due_at)}</span>}
                    {overdue && <Badge className="bg-red-100 px-1 py-0 text-[10px] text-red-700" data-testid={`task-overdue-${t.id}`}>Overdue</Badge>}
                    {t.related_entity && <span>· {t.related_entity}</span>}
                  </div>
                  {t.notes && <p className="mt-1 text-xs text-slate-400">{t.notes}</p>}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[10px]">{STATUS_LABEL[t.status]}</Badge>
                {!done && t.status !== "in_progress" && <Button size="sm" variant="ghost" className="h-7" onClick={() => setStatusOf(t.id, "in_progress")} data-testid={`task-progress-${t.id}`}>Start</Button>}
                {done ? <Button size="sm" variant="ghost" className="h-7" onClick={() => setStatusOf(t.id, "pending")} data-testid={`task-reopen-${t.id}`}><RotateCcw className="mr-1 h-3.5 w-3.5" /> Reopen</Button>
                  : <Button size="sm" variant="ghost" className="h-7" onClick={() => setStatusOf(t.id, "done")} data-testid={`task-done-${t.id}`}><Check className="mr-1 h-3.5 w-3.5" /> Done</Button>}
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditTask(t); setAddOpen(true); }} data-testid={`task-edit-${t.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => del(t.id)} data-testid={`task-delete-${t.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          );
        })}
      </Card>

      <AddTaskDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} editTask={editTask} />
    </div>
  );
}
