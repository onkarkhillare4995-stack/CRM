import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, formatApiError } from "@/lib/api";
import { fmtDateTime } from "@/lib/leadConstants";

const TABS = [["targets", "Targets"], ["leaderboard", "Leaderboard"], ["funnel", "Funnel"], ["aging", "Lead Aging"], ["missed", "Missed Follow-ups"]];

export default function Reports() {
  const [tab, setTab] = useState("leaderboard"); const [data, setData] = useState(null); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); try { const { data } = await api.get("/reports", { params: { tab } }); setData(data); } catch (e) { toast.error(formatApiError(e)); } finally { setLoading(false); } }, [tab]);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-5" data-testid="reports-page">
      <div><h1 className="font-heading text-2xl font-bold text-slate-900 dark:text-slate-100">Reports</h1><p className="text-sm text-slate-500">Recruitment performance analytics</p></div>
      <div className="flex flex-wrap gap-2">{TABS.map(([k, l]) => <button key={k} onClick={() => setTab(k)} data-testid={`rep-tab-${k}`} className={`rounded-full px-3 py-1 text-xs font-medium ${tab === k ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{l}</button>)}</div>
      {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /> : (
        <Card className="overflow-x-auto p-2">
          {tab === "targets" && (data?.targets || []).map((c, i) => (
            <div key={i} className="border-b border-slate-100 p-3 dark:border-slate-800" data-testid="rep-target-card">
              <p className="font-medium">{c.recruiter}</p>
              {c.metrics.map((m) => <div key={m.metric} className="mt-1"><div className="flex justify-between text-xs text-slate-500"><span>{m.metric}</span><span>{m.actual}/{m.target} ({m.pct}%)</span></div><Progress value={Math.min(m.pct, 100)} /></div>)}
            </div>))}
          {tab === "leaderboard" && (
            <Table><TableHeader><TableRow>{["Rank", "Recruiter", "Calls", "Connected", "Lineups", "Attended", "Selected", "Joined", "Missed", "Score"].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
              <TableBody>{(data?.leaderboard || []).map((r) => <TableRow key={r.recruiter_id} data-testid="rep-board-row"><TableCell>{r.rank}</TableCell><TableCell className="font-medium">{r.recruiter}</TableCell><TableCell>{r.calls}</TableCell><TableCell>{r.connected}</TableCell><TableCell>{r.lineups}</TableCell><TableCell>{r.attended}</TableCell><TableCell>{r.selected}</TableCell><TableCell>{r.joined}</TableCell><TableCell>{r.missed}</TableCell><TableCell className="font-semibold text-indigo-600">{r.score}</TableCell></TableRow>)}</TableBody></Table>)}
          {tab === "funnel" && <div className="space-y-2 p-3">{(data?.funnel || []).map((f) => <div key={f.stage} data-testid="rep-funnel-row"><div className="flex justify-between text-sm"><span>{f.label}</span><span>{f.count}</span></div><Progress value={data.funnel[0].count ? (f.count / data.funnel[0].count) * 100 : 0} /></div>)}</div>}
          {tab === "aging" && <div className="grid grid-cols-5 gap-3 p-3">{Object.entries(data?.aging || {}).map(([k, v]) => <Card key={k} className="p-3 text-center" data-testid="rep-aging-bucket"><p className="text-2xl font-bold">{v}</p><p className="text-xs text-slate-500">{k}</p></Card>)}</div>}
          {tab === "missed" && <Table><TableHeader><TableRow>{["Recruiter", "Candidate", "Phone", "Original Time", "Delay (h)", "Priority", "Status"].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{(data?.missed || []).map((r) => <TableRow key={r.id} data-testid="rep-missed-row"><TableCell>{r.recruiter}</TableCell><TableCell>{r.lead_name}</TableCell><TableCell>{r.phone}</TableCell><TableCell>{fmtDateTime(r.due_at)}</TableCell><TableCell>{r.delay_hours}</TableCell><TableCell>{r.priority}</TableCell><TableCell>{r.lead_status}</TableCell></TableRow>)}</TableBody></Table>}
        </Card>)}
      {data?.score_formula && <p className="text-xs text-slate-400">Score = {data.score_formula}</p>}
    </div>
  );
}
