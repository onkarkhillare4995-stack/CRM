import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import RoleBadge from "@/components/RoleBadge";

const KPIS = [
  { key: "fresh_leads", label: "Fresh Leads", to: "/admin/leads?status=new", tone: "text-indigo-600" },
  { key: "todays_followups", label: "Today's Follow-ups", to: "/admin/followups", tone: "text-sky-600" },
  { key: "overdue_followups", label: "Overdue Follow-ups", to: "/admin/followups", tone: "text-red-600" },
  { key: "no_answer", label: "No Answer", to: "/admin/leads?outcome=no_answer", tone: "text-amber-600" },
  { key: "interested", label: "Interested", to: "/admin/leads?status=interested", tone: "text-emerald-600" },
  { key: "interviews", label: "Interviews", to: "/admin/interviews", tone: "text-violet-600" },
  { key: "selected", label: "Selected", to: "/admin/leads?status=selected", tone: "text-teal-600" },
  { key: "joined", label: "Joined", to: "/admin/leads?status=joined", tone: "text-green-600" },
  { key: "rejected_lost", label: "Rejected / Lost", to: "/admin/leads?status=rejected,not_interested", tone: "text-slate-500" },
  { key: "calls_today", label: "Calls Today", to: "/admin/calling-list", tone: "text-blue-600" },
  { key: "connected", label: "Connected", to: "/admin/calling-list", tone: "text-cyan-600" },
  { key: "leads_added_today", label: "Leads Added Today", to: "/admin/leads", tone: "text-fuchsia-600" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [recruiter, setRecruiter] = useState("all");
  const [recruiters, setRecruiters] = useState([]);

  const load = useCallback(() => {
    const p = {};
    if (from) p.date_from = new Date(from).toISOString();
    if (to) p.date_to = new Date(to).toISOString();
    if (recruiter !== "all") p.recruiter_id = recruiter;
    api.get("/dashboard/overview", { params: p }).then((r) => setData(r.data)).catch(() => {});
  }, [from, to, recruiter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/recruiters").then((r) => setRecruiters(r.data)).catch(() => {}); }, []);

  const k = data?.kpis || {};
  const maxFunnel = Math.max(1, ...(data?.funnel || []).map((f) => f.count));

  return (
    <div className="space-y-6" data-testid="dashboard-page">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Recruitment Dashboard</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-slate-500"><RoleBadge role={user?.role} /> {data?.scope_label || "—"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" data-testid="dash-date-from" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" data-testid="dash-date-to" />
          {data?.can_filter_recruiter && (
            <Select value={recruiter} onValueChange={setRecruiter}>
              <SelectTrigger className="w-[180px]" data-testid="dash-recruiter-filter"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900 max-h-64">
                <SelectItem value="all">All recruiters</SelectItem>
                {recruiters.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {KPIS.map((kpi) => (
          <button key={kpi.key} onClick={() => navigate(kpi.to)} data-testid={`kpi-${kpi.key}`}
            className="rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{kpi.label}</p>
            <p className={`mt-1 font-heading text-3xl font-bold ${kpi.tone}`}>{k[kpi.key] ?? "—"}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 font-heading text-lg font-semibold text-slate-900 dark:text-slate-100">Recruitment Funnel</h2>
          <div className="space-y-3" data-testid="funnel-chart">
            {(data?.funnel || []).map((f) => (
              <div key={f.status}>
                <div className="mb-1 flex justify-between text-sm"><span className="capitalize text-slate-600 dark:text-slate-300">{f.status}</span><span className="font-medium">{f.count}</span></div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-2 rounded-full bg-indigo-500" style={{ width: `${(f.count / maxFunnel) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-lg font-semibold text-slate-900 dark:text-slate-100">Leaderboard</h2>
            <button className="text-xs font-medium text-indigo-600 hover:underline" onClick={() => navigate("/admin/reports")} data-testid="leaderboard-view-all">View all</button>
          </div>
          <div className="space-y-2" data-testid="leaderboard">
            {(data?.leaderboard || []).map((r, i) => (
              <div key={r.recruiter_id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
                <span className="flex items-center gap-2"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">{i + 1}</span>{r.recruiter}</span>
                <span className="text-slate-500">Joined <b className="text-slate-900 dark:text-slate-100">{r.joined}</b> · Selected {r.selected}</span>
              </div>
            ))}
            {(data?.leaderboard || []).length === 0 && <p className="text-sm text-slate-500">No data.</p>}
          </div>
        </Card>
      </div>

      <Card className="overflow-x-auto p-5">
        <h2 className="mb-4 font-heading text-lg font-semibold text-slate-900 dark:text-slate-100">Recruiter Comparison (range)</h2>
        <table className="w-full min-w-[720px] text-sm" data-testid="comparison-table">
          <thead><tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500 dark:border-slate-800">
            {["Recruiter", "Leads", "Calls", "Connected", "Follow-ups", "Lineups", "Attendance", "Selected", "Joined"].map((h) => <th key={h} className="py-2 pr-4">{h}</th>)}
          </tr></thead>
          <tbody>
            {(data?.comparison || []).map((r) => (
              <tr key={r.recruiter_id} className="border-b border-slate-100 dark:border-slate-800" data-testid={`comparison-row-${r.recruiter_id}`}>
                <td className="py-2 pr-4 font-medium text-slate-900 dark:text-slate-100">{r.recruiter}</td>
                <td className="py-2 pr-4">{r.leads}</td><td className="py-2 pr-4">{r.calls}</td><td className="py-2 pr-4">{r.connected}</td>
                <td className="py-2 pr-4">{r.followups}</td><td className="py-2 pr-4">{r.lineups}</td><td className="py-2 pr-4">{r.attendance}</td>
                <td className="py-2 pr-4">{r.selected}</td><td className="py-2 pr-4">{r.joined}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
