import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  Search, Loader2, Plus, Download, Shuffle, X, Phone, ClipboardList, MessageCircle,
  Tag as TagIcon, Pencil, Trash2, AlertTriangle, ShieldAlert, CalendarClock, ChevronLeft,
  ChevronRight, ArrowUpDown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import LeadDrawer from "@/components/LeadDrawer";
import AddLeadDialog from "@/components/AddLeadDialog";
import CallActionModal from "@/components/CallActionModal";
import CallDispositionModal from "@/components/CallDispositionModal";
import AssignDialog from "@/components/AssignDialog";
import {
  SAVED_VIEWS, STATUS_OPTIONS, STATUS_LABEL, PRIORITY_OPTIONS, statusClasses, priorityClasses,
  fmtDateTime, digitsOnly,
} from "@/lib/leadConstants";

const TITLES = { all: "All Leads", my: "My Leads", calling: "Calling List" };
const PAGE_SIZE = 25;
const SORTS = [
  { value: "last_activity_at", label: "Last Activity" }, { value: "created_at", label: "Created" },
  { value: "name", label: "Name" }, { value: "next_followup_at", label: "Next Follow-up" },
  { value: "priority", label: "Priority" }, { value: "status", label: "Status" },
];

export default function Leads({ variant = "all" }) {
  const { user, hasPermission } = useAuth();
  const [params] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [view, setView] = useState("all");
  const [search, setSearch] = useState(params.get("search") || "");
  const [status, setStatus] = useState(params.get("status") || "all");
  const [priority, setPriority] = useState("all");
  const [source, setSource] = useState("");
  const [tag, setTag] = useState("");
  const [recruiter, setRecruiter] = useState("all");
  const [sortBy, setSortBy] = useState("last_activity_at");
  const [sortDir, setSortDir] = useState("desc");
  const [recruiters, setRecruiters] = useState([]);
  const [recMap, setRecMap] = useState({});
  const [sel, setSel] = useState(new Set());
  const [drawerLead, setDrawerLead] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [callLead, setCallLead] = useState(null);
  const [dispoLead, setDispoLead] = useState(null);
  const [dispoDuration, setDispoDuration] = useState(0);
  const [assign, setAssign] = useState(null); // {ids, mode}

  const canRecView = hasPermission("recruiters.view");
  const outcome = params.get("outcome") || "";

  useEffect(() => {
    if (canRecView) api.get("/recruiters").then((r) => {
      setRecruiters(r.data);
      setRecMap(Object.fromEntries(r.data.map((u) => [u.id, u.name])));
    }).catch(() => {});
  }, [canRecView]);

  const buildParams = useCallback(() => {
    const p = { page, page_size: PAGE_SIZE, sort_by: sortBy, sort_dir: sortDir };
    if (search) p.search = search;
    if (view !== "all") p.view = view;
    if (variant === "calling") p.status = "new,contacted";
    else if (status !== "all") p.status = status;
    if (priority !== "all") p.priority = priority;
    if (source) p.source = source;
    if (tag) p.tag = tag;
    if (outcome) p.outcome = outcome;
    if (variant === "my") p.recruiter_id = user.id;
    else if (recruiter !== "all") p.recruiter_id = recruiter;
    return p;
  }, [page, sortBy, sortDir, search, view, status, priority, source, tag, outcome, variant, recruiter, user.id]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/leads", { params: buildParams() });
      setRows(data.items); setTotal(data.total);
    } catch (e) { toast.error(formatApiError(e)); } finally { setLoading(false); }
  }, [buildParams]);

  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  useEffect(() => { setPage(1); }, [view, search, status, priority, source, tag, recruiter, sortBy, sortDir]);
  useEffect(() => { setSel(new Set()); }, [rows]);

  const activeFilters = [search, view !== "all", status !== "all", priority !== "all", source, tag, recruiter !== "all"].filter(Boolean).length;
  const clearFilters = () => { setSearch(""); setView("all"); setStatus("all"); setPriority("all"); setSource(""); setTag(""); setRecruiter("all"); };

  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const togglePage = () => setSel((s) => {
    const ids = rows.map((r) => r.id);
    const all = ids.every((id) => s.has(id));
    const n = new Set(s); ids.forEach((id) => all ? n.delete(id) : n.add(id)); return n;
  });
  const pageAllChecked = rows.length > 0 && rows.every((r) => sel.has(r.id));

  const enrich = (r) => ({ ...r, owner_name: recMap[r.owner_id] || (r.owner_id === user.id ? "Me" : "—") });

  const exportCsv = async () => {
    try {
      const p = buildParams(); delete p.page; delete p.page_size;
      const res = await api.get("/leads/export", { params: p, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url; a.download = "leads_export.csv"; a.click();
      URL.revokeObjectURL(url); toast.success("Export ready");
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const autoDistribute = async (ids) => {
    try {
      const { data } = await api.post("/leads/auto-distribute", ids ? { lead_ids: ids } : {});
      toast.success(`Distributed ${data.distributed} lead(s)`); setSel(new Set()); load();
    } catch (e) { toast.error(formatApiError(e)); }
  };
  const archive = async (id) => {
    if (!window.confirm("Archive this lead?")) return;
    try { await api.delete(`/leads/${id}`); toast.success("Archived"); load(); } catch (e) { toast.error(formatApiError(e)); }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selIds = [...sel];

  return (
    <div className="space-y-5" data-testid="leads-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{TITLES[variant]}</h1>
          <p className="text-sm text-slate-500">{total} records in scope</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasPermission("leads.export") && <Button variant="outline" onClick={exportCsv} data-testid="export-csv-button"><Download className="mr-1 h-4 w-4" /> Export CSV</Button>}
          {hasPermission("leads.auto_distribute") && <Button variant="outline" onClick={() => autoDistribute(null)} data-testid="auto-distribute-button"><Shuffle className="mr-1 h-4 w-4" /> Auto-distribute</Button>}
          {hasPermission("leads.create") && <Button onClick={() => setAddOpen(true)} className="bg-indigo-600 hover:bg-indigo-700" data-testid="add-lead-button"><Plus className="mr-1 h-4 w-4" /> Add Lead</Button>}
        </div>
      </div>

      {/* Saved view chips */}
      <div className="flex flex-wrap gap-2" data-testid="saved-views">
        {SAVED_VIEWS.map((v) => (
          <button key={v.key} onClick={() => setView(v.key)} data-testid={`view-chip-${v.key}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${view === v.key ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"}`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Search name / phone / email / city" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="leads-search-input" />
          </div>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger className="w-[130px]" data-testid="leads-priority-filter"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900">
              <SelectItem value="all">All priority</SelectItem>
              {PRIORITY_OPTIONS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {variant !== "calling" && (
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-[150px]" data-testid="leads-status-filter"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900">
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Input className="w-[120px]" placeholder="Source" value={source} onChange={(e) => setSource(e.target.value)} data-testid="leads-source-filter" />
          <Input className="w-[110px]" placeholder="Tag" value={tag} onChange={(e) => setTag(e.target.value)} data-testid="leads-tag-filter" />
          {variant !== "my" && canRecView && (
            <Select value={recruiter} onValueChange={setRecruiter}>
              <SelectTrigger className="w-[150px]" data-testid="leads-recruiter-filter"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-white dark:bg-slate-900">
                <SelectItem value="all">All recruiters</SelectItem>
                {recruiters.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[150px]" data-testid="leads-sort-by"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900">
              {SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={() => setSortDir((d) => d === "asc" ? "desc" : "asc")} data-testid="leads-sort-dir" title={sortDir}>
            <ArrowUpDown className="h-4 w-4" />
          </Button>
          {activeFilters > 0 && (
            <Button variant="outline" onClick={clearFilters} data-testid="clear-filters-button">
              <X className="mr-1 h-4 w-4" /> Clear <Badge className="ml-1 bg-indigo-600 text-white">{activeFilters}</Badge>
            </Button>
          )}
        </div>
      </Card>

      {/* Bulk actions */}
      {sel.size > 0 && (
        <Card className="flex flex-wrap items-center gap-3 border-indigo-300 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-950/30" data-testid="bulk-bar">
          <span className="text-sm font-medium text-indigo-800 dark:text-indigo-300" data-testid="bulk-count">{sel.size} selected</span>
          {hasPermission("leads.assign") && <Button size="sm" variant="outline" onClick={() => setAssign({ ids: selIds, mode: "assign" })} data-testid="bulk-assign">Assign</Button>}
          {hasPermission("leads.transfer") && <Button size="sm" variant="outline" onClick={() => setAssign({ ids: selIds, mode: "transfer" })} data-testid="bulk-transfer">Transfer</Button>}
          {hasPermission("leads.auto_distribute") && <Button size="sm" variant="outline" onClick={() => autoDistribute(selIds)} data-testid="bulk-distribute">Auto-distribute</Button>}
          <Button size="sm" variant="ghost" onClick={() => setSel(new Set())} data-testid="bulk-clear">Clear selection</Button>
        </Card>
      )}

      {/* Table */}
      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800/50">
              <TableHead className="w-10"><Checkbox checked={pageAllChecked} onCheckedChange={togglePage} data-testid="select-page-checkbox" /></TableHead>
              <TableHead>Candidate</TableHead><TableHead>Phone</TableHead><TableHead>Priority</TableHead>
              <TableHead>Status</TableHead><TableHead>Tags</TableHead><TableHead>Recruiter</TableHead>
              <TableHead>Next Follow-up</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={9} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></TableCell></TableRow>
            : rows.length === 0 ? <TableRow><TableCell colSpan={9} className="py-10 text-center text-sm text-slate-500">No leads found.</TableCell></TableRow>
            : rows.map((l) => {
              const f = l.flags || {};
              return (
                <TableRow key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50" data-testid={`lead-row-${l.id}`}>
                  <TableCell><Checkbox checked={sel.has(l.id)} onCheckedChange={() => toggle(l.id)} data-testid={`select-lead-${l.id}`} /></TableCell>
                  <TableCell>
                    <button className="text-left font-medium text-slate-900 hover:text-indigo-600 dark:text-slate-100" onClick={() => setDrawerLead(l.id)} data-testid={`lead-name-${l.id}`}>{l.name}</button>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      <span className="text-xs text-slate-400">{l.lead_code}</span>
                      {f.invalid_phone && <span title="Invalid phone" data-testid={`flag-invalid-${l.id}`}><AlertTriangle className="h-3 w-3 text-red-500" /></span>}
                      {f.duplicate_phone && <span title="Duplicate phone" data-testid={`flag-dup-${l.id}`}><ShieldAlert className="h-3 w-3 text-amber-500" /></span>}
                      {f.overdue && <span title="Overdue follow-up" data-testid={`flag-overdue-${l.id}`}><CalendarClock className="h-3 w-3 text-red-500" /></span>}
                      {f.no_followup && <Badge variant="outline" className="border-amber-300 px-1 py-0 text-[10px] text-amber-600" data-testid={`flag-nofu-${l.id}`}>no follow-up</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <button className="text-sm text-slate-600 hover:text-indigo-600 dark:text-slate-300" onClick={() => setCallLead(enrich(l))} data-testid={`lead-phone-${l.id}`}>{l.phone}</button>
                  </TableCell>
                  <TableCell><span className={`text-sm ${priorityClasses(l.priority)}`}>{l.priority}</span></TableCell>
                  <TableCell><Badge className={statusClasses(l.status)}>{STATUS_LABEL[l.status] || l.status}</Badge></TableCell>
                  <TableCell><div className="flex flex-wrap gap-1">{(l.tags || []).slice(0, 2).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}{(l.tags || []).length > 2 && <span className="text-xs text-slate-400">+{l.tags.length - 2}</span>}</div></TableCell>
                  <TableCell className="text-sm text-slate-500">{recMap[l.owner_id] || (l.owner_id === user.id ? "Me" : "—")}</TableCell>
                  <TableCell className="text-sm text-slate-500">{fmtDateTime(l.next_followup_at)}</TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setCallLead(enrich(l))} title="Call" data-testid={`row-call-${l.id}`}><Phone className="h-3.5 w-3.5" /></Button>
                      {hasPermission("calls.log") && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setDispoDuration(0); setDispoLead(enrich(l)); }} title="Log Disposition" data-testid={`row-dispo-${l.id}`}><ClipboardList className="h-3.5 w-3.5" /></Button>}
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { window.open(`https://wa.me/${digitsOnly(l.phone)}`, "_blank"); api.post(`/leads/${l.id}/whatsapp`).catch(() => {}); }} title="WhatsApp" data-testid={`row-wa-${l.id}`}><MessageCircle className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDrawerLead(l.id)} title="Manage Tags" data-testid={`row-tags-${l.id}`}><TagIcon className="h-3.5 w-3.5" /></Button>
                      {hasPermission("leads.edit") && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setDrawerLead(l.id)} title="Edit" data-testid={`row-edit-${l.id}`}><Pencil className="h-3.5 w-3.5" /></Button>}
                      {hasPermission("leads.delete") && <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => archive(l.id)} title="Archive" data-testid={`row-delete-${l.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span data-testid="pagination-info">Page {page} of {totalPages} · {total} total</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} data-testid="prev-page"><ChevronLeft className="h-4 w-4" /></Button>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} data-testid="next-page"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <LeadDrawer leadId={drawerLead} open={!!drawerLead} onClose={() => setDrawerLead(null)} onChanged={load} />
      <AddLeadDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={load} onOpenExisting={(id) => setDrawerLead(id)} />
      <CallActionModal open={!!callLead} onClose={() => setCallLead(null)} lead={callLead}
        onLogDisposition={(dur) => { setDispoDuration(dur); setDispoLead(callLead); setCallLead(null); }} />
      <CallDispositionModal open={!!dispoLead} onClose={() => setDispoLead(null)} lead={dispoLead} initialDuration={dispoDuration} onDone={load} />
      {assign && <AssignDialog open={!!assign} onClose={() => setAssign(null)} leadIds={assign.ids} mode={assign.mode} onDone={() => { setSel(new Set()); load(); }} />}
    </div>
  );
}
