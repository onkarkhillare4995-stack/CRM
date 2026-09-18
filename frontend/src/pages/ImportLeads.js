import { useState } from "react";
import { toast } from "sonner";
import { Upload, Download, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { api, formatApiError } from "@/lib/api";

const FIELDS = ["name", "phone", "alt_phone", "email", "city", "age", "gender", "qualification", "experience", "current_salary", "expected_salary", "notice_period", "source", "priority", "client", "job", "notes"];

export default function ImportLeads() {
  const [preview, setPreview] = useState(null); const [mapping, setMapping] = useState({});
  const [rules, setRules] = useState({ assign: "unassigned", duplicates: "flag", invalid: "flag" });
  const [busy, setBusy] = useState(false); const [result, setResult] = useState(null);

  const downloadTpl = async () => { try { const res = await api.get("/import/template", { responseType: "blob" }); const u = URL.createObjectURL(res.data); const a = document.createElement("a"); a.href = u; a.download = "lead_import_template.xlsx"; a.click(); URL.revokeObjectURL(u); } catch (e) { toast.error(formatApiError(e)); } };
  const upload = async (file) => {
    if (!file) return; setBusy(true); setResult(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const { data } = await api.post("/import/preview", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setPreview(data);
      const auto = {}; data.columns.forEach((c) => { const m = FIELDS.find((f) => f.replace("_", "") === c.toLowerCase().replace(/[^a-z]/g, "")); if (m) auto[c] = m; });
      setMapping(auto);
    } catch (e) { toast.error(formatApiError(e)); } finally { setBusy(false); }
  };
  const commit = async () => {
    setBusy(true);
    try { const { data } = await api.post("/import/commit", { batch_id: preview.batch_id, mapping, rules }); setResult(data); toast.success(`Imported ${data.imported}`); }
    catch (e) { toast.error(formatApiError(e)); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" data-testid="import-page">
      <div className="flex items-center justify-between"><div><h1 className="font-heading text-2xl font-bold text-slate-900 dark:text-slate-100">Import Leads</h1><p className="text-sm text-slate-500">CSV / XLSX bulk import</p></div>
        <Button variant="outline" onClick={downloadTpl} data-testid="import-template"><Download className="mr-1 h-4 w-4" /> Download Template</Button></div>
      <Card className="p-6 text-center">
        <input type="file" accept=".csv,.xlsx" onChange={(e) => upload(e.target.files[0])} data-testid="import-file" className="hidden" id="imp" />
        <label htmlFor="imp" className="inline-flex cursor-pointer items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 px-6 py-8 text-sm text-slate-500 dark:border-slate-700">
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />} Choose CSV/XLSX to upload & preview</label>
      </Card>
      {preview && !result && (
        <>
          <Card className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-5" data-testid="import-summary">
            {[["Rows", preview.row_count], ["Columns", preview.columns.length], ["Invalid phones", preview.invalid_phones], ["File dupes", preview.duplicates_in_file], ["CRM dupes", preview.existing_crm_duplicates]].map(([l, v]) => <div key={l}><p className="text-2xl font-bold">{v}</p><p className="text-xs text-slate-500">{l}</p></div>)}
          </Card>
          <Card className="p-4"><p className="mb-2 text-sm font-medium">Step 1 — Map Columns (Phone required)</p>
            <div className="grid gap-2 sm:grid-cols-2">{preview.columns.map((c) => (
              <div key={c} className="flex items-center gap-2"><span className="w-1/2 truncate text-xs text-slate-500">{c}</span>
                <select className="h-8 w-1/2 rounded border border-slate-200 bg-white px-1 text-xs dark:border-slate-700 dark:bg-slate-900" value={mapping[c] || "not_mapped"} onChange={(e) => setMapping({ ...mapping, [c]: e.target.value })} data-testid={`map-${c}`}>
                  <option value="not_mapped">Not Mapped</option>{FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}</select></div>))}</div>
          </Card>
          <Card className="grid gap-3 p-4 sm:grid-cols-3"><div><Label className="text-xs text-slate-500">Assignment</Label>
            <select className="h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900" value={rules.assign} onChange={(e) => setRules({ ...rules, assign: e.target.value })} data-testid="rule-assign"><option value="unassigned">Keep unassigned</option><option value="auto">Auto-distribute</option></select></div>
            <div><Label className="text-xs text-slate-500">Duplicates</Label><select className="h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900" value={rules.duplicates} onChange={(e) => setRules({ ...rules, duplicates: e.target.value })} data-testid="rule-dupes"><option value="flag">Import but flag</option><option value="skip">Skip duplicates</option></select></div>
            <div><Label className="text-xs text-slate-500">Invalid phones</Label><select className="h-9 w-full rounded border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900" value={rules.invalid} onChange={(e) => setRules({ ...rules, invalid: e.target.value })} data-testid="rule-invalid"><option value="flag">Import but mark invalid</option><option value="skip">Skip invalid</option></select></div>
          </Card>
          <Button onClick={commit} disabled={busy} className="bg-indigo-600 hover:bg-indigo-700" data-testid="import-commit">{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Import Leads</Button>
        </>
      )}
      {result && <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3" data-testid="import-result">{Object.entries(result).map(([k, v]) => <div key={k}><p className="text-2xl font-bold">{v}</p><p className="text-xs capitalize text-slate-500">{k.replace(/_/g, " ")}</p></div>)}</Card>}
    </div>
  );
}
