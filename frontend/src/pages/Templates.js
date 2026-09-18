import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Copy, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const VARS = ["candidate_name", "recruiter_name", "job_title", "company", "location", "salary", "interview_date", "interview_time", "joining_date", "contact_person"];
const SAMPLE = { candidate_name: "Rahul", recruiter_name: "Jordan", job_title: "Sales Exec", company: "Acme", location: "Pune", salary: "40000", interview_date: "25 Jun", interview_time: "11:00 AM", joining_date: "1 Jul", contact_person: "Priya" };
const render = (body) => body.replace(/\{\{(\w+)\}\}/g, (_, k) => SAMPLE[k] ?? `{{${k}}}`);
const unresolved = (body) => (body.match(/\{\{(\w+)\}\}/g) || []).filter((m) => !VARS.includes(m.slice(2, -2)));

export default function Templates() {
  const { hasPermission } = useAuth();
  const canWrite = hasPermission("templates.manage");
  const [tab, setTab] = useState("whatsapp"); const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(""); const [open, setOpen] = useState(false); const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({}); const [saving, setSaving] = useState(false);

  const load = useCallback(async () => { setLoading(true); try { const { data } = await api.get("/templates", { params: { channel: tab, search } }); setRows(data); } catch (e) { toast.error(formatApiError(e)); } finally { setLoading(false); } }, [tab, search]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const openNew = () => { setEdit(null); setForm({ name: "", channel: tab, category: "", subject: "", body: "" }); setOpen(true); };
  const openEdit = (r) => { setEdit(r); setForm({ name: r.name, channel: r.channel, category: r.category || "", subject: r.subject || "", body: r.body }); setOpen(true); };
  const dup = async (r) => { try { await api.post("/templates", { ...r, id: undefined, name: `${r.name} (copy)` }); toast.success("Duplicated"); load(); } catch (e) { toast.error(formatApiError(e)); } };
  const copyF = (r) => { navigator.clipboard?.writeText(render(r.body)); toast.success("Copied formatted"); };
  const del = async (r) => { if (!window.confirm("Delete template?")) return; try { await api.delete(`/templates/${r.id}`); load(); } catch (e) { toast.error(formatApiError(e)); } };
  const submit = async (e) => {
    e.preventDefault();
    if (unresolved(form.body).length) return toast.error(`Unsupported variables: ${unresolved(form.body).join(", ")}`);
    setSaving(true);
    try { if (edit) await api.put(`/templates/${edit.id}`, form); else await api.post("/templates", form); toast.success("Saved"); setOpen(false); load(); }
    catch (err) { toast.error(formatApiError(err)); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-5" data-testid="templates-page">
      <div className="flex items-center justify-between"><div><h1 className="font-heading text-2xl font-bold text-slate-900 dark:text-slate-100">Communication Templates</h1><p className="text-sm text-slate-500">Unified WhatsApp & Email library</p></div>
        {canWrite && <Button onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700" data-testid="tpl-add"><Plus className="mr-1 h-4 w-4" /> New Template</Button>}</div>
      <div className="flex gap-2">{[["whatsapp", "WhatsApp Templates"], ["email", "Email Templates"]].map(([k, l]) => (
        <button key={k} onClick={() => setTab(k)} data-testid={`tpl-tab-${k}`} className={`rounded-full px-3 py-1 text-xs font-medium ${tab === k ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{l}</button>))}</div>
      <Card className="p-4"><Input placeholder="Search name / category / body" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="tpl-search" /></Card>
      <div className="grid gap-4 md:grid-cols-2">
        {loading ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
        : rows.length === 0 ? <p className="p-4 text-sm text-slate-500">No templates.</p>
        : rows.map((r) => (
          <Card key={r.id} className="space-y-2 p-4" data-testid={`tpl-card-${r.id}`}>
            <div className="flex items-center justify-between"><p className="font-medium">{r.name}</p><Badge variant="secondary">{r.channel}</Badge></div>
            {r.channel === "email" && r.subject && <p className="text-xs text-slate-500">Subject: {r.subject}</p>}
            <p className="whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">{r.body}</p>
            <div className="flex flex-wrap gap-1">
              <Button size="sm" variant="ghost" className="h-7" onClick={() => copyF(r)} data-testid={`tpl-copy-${r.id}`}><Copy className="mr-1 h-3.5 w-3.5" /> Copy Formatted</Button>
              {canWrite && <><Button size="sm" variant="ghost" className="h-7" onClick={() => openEdit(r)} data-testid={`tpl-edit-${r.id}`}>Edit</Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => dup(r)} data-testid={`tpl-dup-${r.id}`}>Duplicate</Button>
                <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => del(r)} data-testid={`tpl-del-${r.id}`}>Delete</Button></>}
            </div>
          </Card>
        ))}
      </div>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900" data-testid="tpl-dialog">
          <DialogHeader><DialogTitle>{edit ? "Edit" : "New"} Template</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div><Label className="text-xs text-slate-500">Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="tpl-name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs text-slate-500">Type</Label>
                <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })} data-testid="tpl-channel"><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select></div>
              <div><Label className="text-xs text-slate-500">Category</Label><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} data-testid="tpl-category" /></div>
            </div>
            {form.channel === "email" && <div><Label className="text-xs text-slate-500">Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} data-testid="tpl-subject" /></div>}
            <div><Label className="text-xs text-slate-500">Body *</Label><Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} data-testid="tpl-body" /></div>
            <div className="flex flex-wrap gap-1">{VARS.map((v) => <Button key={v} type="button" size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setForm({ ...form, body: (form.body || "") + `{{${v}}}` })} data-testid={`tpl-var-${v}`}>{v}</Button>)}</div>
            {form.body && <div className="rounded bg-slate-50 p-2 text-xs dark:bg-slate-800" data-testid="tpl-preview"><span className="font-semibold">Preview: </span>{render(form.body)}</div>}
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="tpl-save">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
