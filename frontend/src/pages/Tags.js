import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, formatApiError } from "@/lib/api";

const COLORS = ["indigo", "emerald", "amber", "rose", "sky", "purple", "teal"];
const DOT = { indigo: "bg-indigo-500", emerald: "bg-emerald-500", amber: "bg-amber-500", rose: "bg-rose-500", sky: "bg-sky-500", purple: "bg-purple-500", teal: "bg-teal-500" };

export default function Tags() {
  const [rows, setRows] = useState([]); const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false); const [edit, setEdit] = useState(null);
  const [form, setForm] = useState({ name: "", color: "indigo" }); const [saving, setSaving] = useState(false);
  const load = () => { setLoading(true); api.get("/tags").then((r) => setRows(r.data)).catch((e) => toast.error(formatApiError(e))).finally(() => setLoading(false)); };
  useEffect(() => { load(); }, []);
  const submit = async (e) => { e.preventDefault(); setSaving(true); try { if (edit) await api.put(`/tags/${edit.id}`, form); else await api.post("/tags", form); toast.success("Saved"); setOpen(false); load(); } catch (err) { toast.error(formatApiError(err)); } finally { setSaving(false); } };
  const del = async (t) => { if (!window.confirm(`Delete tag "${t.name}"? It will be removed from ${t.lead_count} lead(s).`)) return; try { await api.delete(`/tags/${t.id}`); load(); } catch (e) { toast.error(formatApiError(e)); } };
  return (
    <div className="space-y-5" data-testid="tags-page">
      <div className="flex items-center justify-between"><div><h1 className="font-heading text-2xl font-bold text-slate-900 dark:text-slate-100">Lead Tags</h1><p className="text-sm text-slate-500">Manage candidate tags</p></div>
        <Button onClick={() => { setEdit(null); setForm({ name: "", color: "indigo" }); setOpen(true); }} className="bg-indigo-600 hover:bg-indigo-700" data-testid="tag-add"><Plus className="mr-1 h-4 w-4" /> Add Tag</Button></div>
      <Card className="divide-y divide-slate-100 dark:divide-slate-800">
        {loading ? <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
        : rows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No tags yet.</p>
        : rows.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-5 py-3" data-testid={`tag-${t.id}`}>
            <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${DOT[t.color] || "bg-slate-400"}`} /><span className="font-medium">{t.name}</span><Badge variant="secondary">{t.lead_count} leads</Badge></div>
            <div className="flex gap-1"><Button size="sm" variant="ghost" className="h-7" onClick={() => { setEdit(t); setForm({ name: t.name, color: t.color }); setOpen(true); }} data-testid={`tag-edit-${t.id}`}>Edit</Button>
              <Button size="sm" variant="ghost" className="h-7 text-red-500" onClick={() => del(t)} data-testid={`tag-del-${t.id}`}>Delete</Button></div>
          </div>
        ))}
      </Card>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent className="bg-white dark:bg-slate-900 sm:max-w-sm" data-testid="tag-dialog">
          <DialogHeader><DialogTitle>{edit ? "Edit" : "New"} Tag</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div><Label className="text-xs text-slate-500">Name *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="tag-name" /></div>
            <div><Label className="text-xs text-slate-500">Color</Label><div className="mt-1 flex gap-2">{COLORS.map((c) => <button key={c} type="button" onClick={() => setForm({ ...form, color: c })} className={`h-7 w-7 rounded-full ${DOT[c]} ${form.color === c ? "ring-2 ring-offset-2 ring-slate-400" : ""}`} data-testid={`tag-color-${c}`} />)}</div></div>
            <div className="flex items-center gap-2 text-sm"><span className="text-slate-500">Preview:</span><Badge className="gap-1"><span className={`h-2 w-2 rounded-full ${DOT[form.color]}`} />{form.name || "tag"}</Badge></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="tag-save">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
