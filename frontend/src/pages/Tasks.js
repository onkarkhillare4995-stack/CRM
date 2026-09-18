import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, formatApiError } from "@/lib/api";
import AddTaskDialog from "@/components/AddTaskDialog";

export default function Tasks() {
  const [rows, setRows] = useState([]);
  const [addOpen, setAddOpen] = useState(false);
  const load = () => api.get("/tasks").then((r) => setRows(r.data)).catch((e) => toast.error(formatApiError(e)));
  useEffect(() => { load(); }, []);

  const complete = async (id) => {
    try { await api.put(`/tasks/${id}`, { status: "done" }); toast.success("Task done"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <div className="space-y-6" data-testid="tasks-page">
      <div className="flex items-center justify-between">
        <div><h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Tasks & To-Dos</h1>
          <p className="text-sm text-slate-500">{rows.filter((t) => t.status === "pending").length} pending</p></div>
        <Button onClick={() => setAddOpen(true)} className="bg-indigo-600 hover:bg-indigo-700" data-testid="add-task-button"><Plus className="mr-1 h-4 w-4" /> Add Task</Button>
      </div>
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {rows.length === 0 && <p className="p-8 text-center text-sm text-slate-500">No tasks.</p>}
        {rows.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-5 py-3" data-testid={`task-${t.id}`}>
            <div><p className={`font-medium ${t.status === "done" ? "text-slate-400 line-through" : "text-slate-900 dark:text-slate-100"}`}>{t.title}</p>
              {t.due_at && <p className="text-xs text-slate-500">Due {new Date(t.due_at).toLocaleString()}</p>}</div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{t.priority}</Badge>
              {t.status === "pending" && <Button size="sm" variant="outline" onClick={() => complete(t.id)} data-testid={`task-done-${t.id}`}><Check className="mr-1 h-4 w-4" /> Done</Button>}
            </div>
          </div>
        ))}
      </Card>
      <AddTaskDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} />
    </div>
  );
}
