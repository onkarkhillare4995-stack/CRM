import { useEffect, useState } from "react";
import { CheckCircle2, Circle, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import LeadDrawer from "@/components/LeadDrawer";

export default function MyDay() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [openStep, setOpenStep] = useState(null);
  const [drawerLead, setDrawerLead] = useState(null);

  const load = () => api.get("/my-day").then((r) => setData(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const itemLead = (step, it) => step.kind === "lead" ? it.id : it.lead_id;

  return (
    <div className="space-y-6" data-testid="my-day-page">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">My Day</h1>
        <p className="text-sm text-slate-500">Your prioritized execution checklist, live from CRM data.</p>
      </div>

      <Card className="p-5">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-900 dark:text-slate-100">Daily progress</span>
          <span className="text-slate-500" data-testid="myday-progress-text">{data?.completed_steps ?? 0} / {data?.total_steps ?? 0} steps cleared</span>
        </div>
        <Progress value={data?.progress_percent ?? 0} data-testid="myday-progress-bar" />
        <p className="mt-2 text-3xl font-bold text-indigo-600" data-testid="myday-progress-percent">{data?.progress_percent ?? 0}%</p>
      </Card>

      <div className="space-y-3">
        {(data?.steps || []).map((step) => (
          <Card key={step.key} className="overflow-hidden" data-testid={`myday-step-${step.key}`}>
            <button onClick={() => setOpenStep(openStep === step.key ? null : step.key)}
              className="flex w-full items-center justify-between px-5 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50">
              <span className="flex items-center gap-3">
                {step.complete ? <CheckCircle2 className="h-5 w-5 text-emerald-500" /> : <Circle className="h-5 w-5 text-slate-300" />}
                <span className="font-medium text-slate-900 dark:text-slate-100">{step.title}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300" data-testid={`myday-count-${step.key}`}>{step.count}</span>
              </span>
              <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${openStep === step.key ? "rotate-90" : ""}`} />
            </button>
            {openStep === step.key && (
              <div className="border-t border-slate-100 px-5 py-3 dark:border-slate-800">
                {step.count === 0 ? <p className="py-2 text-sm text-slate-500">Nothing here — cleared! 🎉</p> : (
                  <div className="space-y-1">
                    {step.items.map((it) => (
                      <div key={it.id} className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <span className="text-slate-700 dark:text-slate-300">{it.lead_name || it.name || it.title}</span>
                        {itemLead(step, it) && (
                          <Button size="sm" variant="outline" onClick={() => setDrawerLead(itemLead(step, it))} data-testid={`myday-open-${it.id}`}>Open</Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>

      <LeadDrawer leadId={drawerLead} open={!!drawerLead} onClose={() => setDrawerLead(null)} onChanged={load} />
    </div>
  );
}
