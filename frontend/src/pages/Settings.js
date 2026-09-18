import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function Settings() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("settings.manage");
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings").then((r) => setForm(r.data)).catch((e) => toast.error(formatApiError(e)));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put("/settings", {
        company_name: form.company_name, timezone: form.timezone, date_format: form.date_format,
      });
      setForm(data);
      toast.success("Settings saved");
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  if (!form) return <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>;

  return (
    <div className="space-y-6" data-testid="settings-page">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Organization Settings</h1>
        <p className="text-sm text-slate-500">Core configuration for your workspace.</p>
      </div>
      <Card className="max-w-xl p-6">
        <form onSubmit={save} className="space-y-5">
          <div className="space-y-2">
            <Label>Company name</Label>
            <Input disabled={!canEdit} data-testid="settings-company-input" value={form.company_name || ""} onChange={(e) => setForm({ ...form, company_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input disabled={!canEdit} data-testid="settings-timezone-input" value={form.timezone || ""} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Date format</Label>
              <Input disabled={!canEdit} data-testid="settings-dateformat-input" value={form.date_format || ""} onChange={(e) => setForm({ ...form, date_format: e.target.value })} />
            </div>
          </div>
          {canEdit && (
            <Button type="submit" disabled={saving} data-testid="settings-save-button" className="bg-indigo-600 hover:bg-indigo-700">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save changes
            </Button>
          )}
        </form>
      </Card>
    </div>
  );
}
