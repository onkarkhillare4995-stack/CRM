import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

export default function Notifications() {
  const navigate = useNavigate();
  const [steps, setSteps] = useState([]);
  useEffect(() => { api.get("/my-day").then((r) => setSteps((r.data.steps || []).filter((s) => s.count > 0))).catch(() => {}); }, []);

  return (
    <div className="space-y-6" data-testid="notifications-page">
      <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Notifications</h1>
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {steps.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">You're all caught up.</p>
        : steps.map((s) => (
          <button key={s.key} onClick={() => navigate("/admin/my-day")} className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`notification-${s.key}`}>
            <span className="flex items-center gap-3"><Bell className="h-4 w-4 text-indigo-500" /><span className="text-slate-800 dark:text-slate-200">{s.title}</span></span>
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300">{s.count}</span>
          </button>
        ))}
      </Card>
    </div>
  );
}
