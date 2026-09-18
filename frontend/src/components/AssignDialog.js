import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api, formatApiError } from "@/lib/api";

// Bulk assign / transfer selected leads to a recruiter. Backend re-authorizes every record.
export default function AssignDialog({ open, onClose, leadIds, mode = "assign", onDone }) {
  const [recruiters, setRecruiters] = useState([]);
  const [target, setTarget] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setTarget(""); api.get("/recruiters").then((r) => setRecruiters(r.data)).catch(() => {}); }
  }, [open]);

  const submit = async () => {
    if (!target) return toast.error("Select a recruiter");
    setSaving(true);
    try {
      const path = mode === "transfer" ? "/leads/transfer" : "/leads/assign";
      const { data } = await api.post(path, { lead_ids: leadIds, to_owner_id: target });
      toast.success(`${mode === "transfer" ? "Transferred" : "Assigned"} ${data.assigned ?? data.transferred} lead(s)`);
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-white dark:bg-slate-900 sm:max-w-md" data-testid="assign-dialog">
        <DialogHeader><DialogTitle>{mode === "transfer" ? "Transfer" : "Assign"} {leadIds?.length} lead(s)</DialogTitle></DialogHeader>
        <div className="space-y-1.5">
          <Label className="text-xs text-slate-500">Target recruiter</Label>
          <Select value={target || undefined} onValueChange={setTarget}>
            <SelectTrigger data-testid="assign-target-select"><SelectValue placeholder="Select recruiter" /></SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900">
              {recruiters.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-indigo-600 hover:bg-indigo-700" data-testid="assign-confirm">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
