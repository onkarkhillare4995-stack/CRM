import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plug, Copy, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { api, formatApiError } from "@/lib/api";

const LABEL = { phone_number_id: "Phone Number ID", waba_id: "WhatsApp Business Account ID", access_token: "Access Token", webhook_verify_token: "Webhook Verify Token", app_secret: "Meta App Secret", page_id: "Page ID", shared_secret: "Shared Secret" };
const WEBHOOK = `${process.env.REACT_APP_BACKEND_URL}/api/webhooks`;

export default function Integrations() {
  const [rows, setRows] = useState([]); const [open, setOpen] = useState(null); const [form, setForm] = useState({}); const [saving, setSaving] = useState(false);
  const load = () => api.get("/integrations").then((r) => setRows(r.data)).catch((e) => toast.error(formatApiError(e)));
  useEffect(() => { load(); }, []);
  const save = async () => { setSaving(true); try { await api.put(`/integrations/${open.key}`, form); toast.success("Saved securely"); setOpen(null); load(); } catch (e) { toast.error(formatApiError(e)); } finally { setSaving(false); } };
  const test = async (k) => { try { const { data } = await api.post(`/integrations/${k}/test`); toast.success(data.message); load(); } catch (e) { toast.error(formatApiError(e)); } };
  const disconnect = async (k) => { if (!window.confirm("Disconnect and delete credentials?")) return; try { await api.post(`/integrations/${k}/disconnect`); toast.success("Disconnected"); load(); } catch (e) { toast.error(formatApiError(e)); } };
  return (
    <div className="space-y-5" data-testid="integrations-page">
      <div className="flex items-center gap-2"><Plug className="h-6 w-6 text-indigo-600" /><div><h1 className="font-heading text-2xl font-bold text-slate-900 dark:text-slate-100">Integrations</h1><p className="text-sm text-slate-500">Secure provider connections</p></div></div>
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((it) => (
          <Card key={it.key} className="space-y-3 p-4" data-testid={`intg-${it.key}`}>
            <div className="flex items-center justify-between"><p className="font-medium">{it.name}</p>
              {it.coming_soon ? <Badge variant="secondary">Coming Soon</Badge>
                : <Badge className={it.connected ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}>{it.connected ? "Connected" : "Not Connected"}</Badge>}</div>
            {it.last_sync && <p className="text-xs text-slate-400">Last sync {new Date(it.last_sync).toLocaleString()}</p>}
            {it.connected && <p className="text-xs text-slate-500">Stored: {Object.entries(it.masked || {}).map(([k, v]) => `${LABEL[k] || k}=${v}`).join(", ")}</p>}
            {!it.coming_soon && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(`${WEBHOOK}/${it.key}`); toast.success("Webhook URL copied"); }} data-testid={`intg-copy-${it.key}`}><Copy className="mr-1 h-3.5 w-3.5" /> Webhook URL</Button>
                <Button size="sm" onClick={() => { setForm({}); setOpen(it); }} className="bg-indigo-600 hover:bg-indigo-700" data-testid={`intg-config-${it.key}`}>Configure</Button>
                {it.connected && <><Button size="sm" variant="outline" onClick={() => test(it.key)} data-testid={`intg-test-${it.key}`}>Test</Button>
                  <Button size="sm" variant="outline" className="text-red-500" onClick={() => disconnect(it.key)} data-testid={`intg-disconnect-${it.key}`}>Disconnect</Button></>}
              </div>
            )}
          </Card>
        ))}
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="bg-white dark:bg-slate-900" data-testid="intg-dialog">
          <DialogHeader><DialogTitle>Configure {open?.name}</DialogTitle></DialogHeader>
          <div className="space-y-2">{(open?.fields || []).map((f) => (
            <div key={f}><Label className="text-xs text-slate-500">{LABEL[f] || f}</Label><Input type="password" placeholder="•••• (write-only)" value={form[f] || ""} onChange={(e) => setForm({ ...form, [f]: e.target.value })} data-testid={`intg-field-${f}`} /></div>))}</div>
          <p className="text-xs text-slate-400">Secrets are encrypted at rest and never returned to the browser.</p>
          <DialogFooter><Button variant="outline" onClick={() => setOpen(null)}>Cancel</Button><Button onClick={save} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="intg-save">{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
