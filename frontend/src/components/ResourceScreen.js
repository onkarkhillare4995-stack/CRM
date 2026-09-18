import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, formatApiError } from "@/lib/api";

// Generic CRUD resource screen used by Jobs, Clients, Vendors.
export default function ResourceScreen({ title, subtitle, endpoint, columns, fields, canWrite, canDelete,
  extraParams = {}, renderCell, testid, summary }) {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(""); const [open, setOpen] = useState(false);
  const [editRow, setEditRow] = useState(null); const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false); const [sum, setSum] = useState(null);
  const extraKey = JSON.stringify(extraParams);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(endpoint, { params: { search, ...extraParams } });
      setRows(data);
      if (summary) { const s = await api.get(summary); setSum(s.data); }
    } catch (e) { toast.error(formatApiError(e)); } finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, search, extraKey, summary]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);

  const openNew = () => { setEditRow(null); setForm(Object.fromEntries(fields.map((f) => [f.key, f.default ?? ""]))); setOpen(true); };
  const openEdit = (r) => { setEditRow(r); setForm(Object.fromEntries(fields.map((f) => [f.key, r[f.key] ?? ""]))); setOpen(true); };
  const submit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      if (editRow) await api.put(`${endpoint}/${editRow.id}`, form);
      else await api.post(endpoint, form);
      toast.success("Saved"); setOpen(false); load();
    } catch (err) { toast.error(formatApiError(err)); } finally { setSaving(false); }
  };
  const del = async (r) => { if (!window.confirm("Archive / delete this record?")) return; try { await api.delete(`${endpoint}/${r.id}`); toast.success("Removed"); load(); } catch (e) { toast.error(formatApiError(e)); } };

  return (
    <div className="space-y-5" data-testid={`${testid}-page`}>
      <div className="flex items-center justify-between">
        <div><h1 className="font-heading text-2xl font-bold text-slate-900 dark:text-slate-100">{title}</h1><p className="text-sm text-slate-500">{subtitle}</p></div>
        {canWrite && <Button onClick={openNew} className="bg-indigo-600 hover:bg-indigo-700" data-testid={`${testid}-add`}>Add</Button>}
      </div>
      {sum && <div className="grid gap-4 sm:grid-cols-3">{Object.entries(sum).map(([k, v]) => (
        <Card key={k} className="p-4"><p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{v}</p><p className="text-sm capitalize text-slate-500">{k.replace(/_/g, " ")}</p></Card>))}</div>}
      <Card className="p-4"><Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid={`${testid}-search`} /></Card>
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {loading ? <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
        : rows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No records.</p>
        : rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-3 px-5 py-3" data-testid={`${testid}-row-${r.id}`}>
            <div className="min-w-0 flex-1">{renderCell ? renderCell(r) : columns.map((c) => <span key={c.key} className="mr-4 text-sm">{r[c.key]}</span>)}</div>
            <div className="flex gap-1">
              {canWrite && <Button size="sm" variant="ghost" className="h-7" onClick={() => openEdit(r)} data-testid={`${testid}-edit-${r.id}`}>Edit</Button>}
              {canDelete && <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => del(r)} data-testid={`${testid}-del-${r.id}`}>Remove</Button>}
            </div>
          </div>
        ))}
      </Card>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-900" data-testid={`${testid}-dialog`}>
          <DialogHeader><DialogTitle>{editRow ? "Edit" : "New"} {title}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="grid grid-cols-2 gap-3">
            {fields.map((f) => (
              <div key={f.key} className={`space-y-1.5 ${f.full ? "col-span-2" : ""}`}>
                <Label className="text-xs text-slate-500">{f.label}{f.required ? " *" : ""}</Label>
                {f.type === "textarea" ? <Textarea value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} data-testid={`${testid}-field-${f.key}`} />
                  : f.type === "select" ? (
                    <select className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900" value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} data-testid={`${testid}-field-${f.key}`}>
                      {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>)
                  : <Input type={f.type || "text"} value={form[f.key] || ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} data-testid={`${testid}-field-${f.key}`} />}
              </div>
            ))}
            <DialogFooter className="col-span-2"><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid={`${testid}-save`}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
