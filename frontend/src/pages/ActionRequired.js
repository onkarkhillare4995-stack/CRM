import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";

export default function ActionRequired() {
  const [cards, setCards] = useState(null);
  useEffect(() => { api.get("/action-required").then((r) => setCards(r.data.cards)).catch(() => setCards([])); }, []);
  if (!cards) return <Loader2 className="mx-auto mt-10 h-5 w-5 animate-spin text-slate-400" />;
  return (
    <div className="space-y-5" data-testid="action-required-page">
      <div><h1 className="font-heading text-2xl font-bold text-slate-900 dark:text-slate-100">Action Required</h1><p className="text-sm text-slate-500">Operational exceptions from live data</p></div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.key} className="p-4" data-testid={`ar-card-${c.key}`}>
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                {c.count === 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className={`h-4 w-4 ${c.tone === "red" ? "text-red-500" : "text-amber-500"}`} />}{c.title}</p>
              <Badge className={c.count === 0 ? "bg-emerald-100 text-emerald-700" : c.tone === "red" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"} data-testid={`ar-count-${c.key}`}>{c.count}</Badge>
            </div>
            <div className="mt-2 space-y-1">
              {c.count === 0 ? <p className="text-xs text-emerald-600">All clear 🎉</p>
                : (c.items || []).map((it, i) => <p key={i} className="truncate text-xs text-slate-500">• {it.name || it.lead_name || it.title || "item"}{it.calls != null ? ` (${it.calls}/${it.target} calls)` : ""}</p>)}
              {c.count > (c.items || []).length && <p className="text-xs text-indigo-600">View all ({c.count})</p>}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
