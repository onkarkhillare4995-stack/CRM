import { useEffect, useState, useCallback, Fragment } from "react";
import { toast } from "sonner";
import { Loader2, Search, Download, ChevronDown, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { api, formatApiError, tokenStore } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import PermissionGate from "@/components/PermissionGate";

const SEVERITY_STYLE = {
  info: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  error: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export default function AuditLog() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState([]);
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState(null);
  const pageSize = 25;

  const params = useCallback(() => {
    const p = {};
    if (search) p.search = search;
    if (action !== "all") p.action = action;
    if (severity !== "all") p.severity = severity;
    if (dateFrom) p.date_from = new Date(dateFrom).toISOString();
    if (dateTo) p.date_to = new Date(dateTo).toISOString();
    return p;
  }, [search, action, severity, dateFrom, dateTo]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/audit-logs", { params: { ...params(), page, page_size: pageSize } });
      setLogs(data.items);
      setTotal(data.total);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [params, page]);

  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  useEffect(() => { api.get("/audit-logs/actions").then((r) => setActions(r.data)).catch(() => {}); }, []);
  useEffect(() => { setPage(1); }, [search, action, severity, dateFrom, dateTo]);

  const exportCsv = async () => {
    try {
      const res = await api.get("/audit-logs/export", { params: params(), responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = "audit_logs.csv"; a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (e) {
      toast.error(formatApiError(e));
    }
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6" data-testid="audit-log-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Audit Log Viewer</h1>
          <p className="text-sm text-slate-500">Immutable, chronological record of meaningful actions.</p>
        </div>
        <PermissionGate permission="audit.view">
          <Button variant="outline" onClick={exportCsv} data-testid="audit-export-button">
            <Download className="mr-1 h-4 w-4" /> Export CSV
          </Button>
        </PermissionGate>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Search actor, action, id" data-testid="audit-search-input" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-[180px]" data-testid="audit-action-filter"><SelectValue placeholder="Action" /></SelectTrigger>
            <SelectContent className="max-h-64 bg-white dark:bg-slate-900">
              <SelectItem value="all">All actions</SelectItem>
              {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-[140px]" data-testid="audit-severity-filter"><SelectValue placeholder="Severity" /></SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900">
              <SelectItem value="all">All severity</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" className="w-[150px]" data-testid="audit-date-from" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input type="date" className="w-[150px]" data-testid="audit-date-to" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800/50">
              <TableHead className="w-8"></TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></TableCell></TableRow>
            ) : logs.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-slate-500">No audit entries.</TableCell></TableRow>
            ) : logs.map((log) => (
              <Fragment key={log.id}>
                <TableRow data-testid={`audit-row-${log.id}`} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => setExpanded(expanded === log.id ? null : log.id)}>
                  <TableCell>{expanded === log.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-slate-600 dark:text-slate-300">{new Date(log.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">
                    <div className="font-medium text-slate-900 dark:text-slate-100">{log.actor_email || "system"}</div>
                    <div className="text-xs text-slate-400">{log.actor_role || "—"}</div>
                  </TableCell>
                  <TableCell><span className="font-mono text-xs">{log.action}</span></TableCell>
                  <TableCell className="text-sm text-slate-600 dark:text-slate-300">{log.entity_type}</TableCell>
                  <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_STYLE[log.severity] || SEVERITY_STYLE.info}`}>{log.severity}</span></TableCell>
                  <TableCell className="text-xs text-slate-500">{log.ip || "—"}</TableCell>
                </TableRow>
                {expanded === log.id && (
                  <TableRow>
                    <TableCell colSpan={7} className="bg-slate-50 dark:bg-slate-900/60">
                      <pre className="max-h-64 overflow-auto rounded-lg bg-slate-900 p-4 text-xs text-slate-100" data-testid={`audit-detail-${log.id}`}>
{JSON.stringify({ entity_id: log.entity_id, correlation_id: log.correlation_id, details: log.details, user_agent: log.user_agent }, null, 2)}
                      </pre>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>{total} entries</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="audit-prev-page">Previous</Button>
          <span>Page {page} / {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} data-testid="audit-next-page">Next</Button>
        </div>
      </div>
    </div>
  );
}
