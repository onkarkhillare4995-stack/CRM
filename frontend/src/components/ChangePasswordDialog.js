import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, Check } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, formatApiError } from "@/lib/api";
import { PASSWORD_RULES, passwordValid } from "@/lib/passwordPolicy";
import { cn } from "@/lib/utils";

export default function ChangePasswordDialog({ open, onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => { setCurrent(""); setNext(""); setConfirm(""); setShow(false); };

  const submit = async (e) => {
    e.preventDefault();
    if (!passwordValid(next)) return toast.error("New password does not meet the policy");
    if (next !== confirm) return toast.error("Passwords do not match");
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: current, new_password: next });
      toast.success("Password changed successfully");
      reset();
      onClose();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="bg-white dark:bg-slate-900" data-testid="change-password-dialog">
        <DialogHeader>
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription>Other active sessions will be signed out for security.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Current password</Label>
            <Input type={show ? "text" : "password"} required data-testid="current-password-input" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>New password</Label>
              <button type="button" onClick={() => setShow((s) => !s)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200" data-testid="change-password-toggle">
                {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{show ? "Hide" : "Show"}
              </button>
            </div>
            <Input type={show ? "text" : "password"} required data-testid="new-password-input" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Confirm new password</Label>
            <Input type={show ? "text" : "password"} required data-testid="confirm-password-input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          <ul className="grid grid-cols-2 gap-1 text-xs">
            {PASSWORD_RULES.map((r) => {
              const ok = r.test(next);
              return (
                <li key={r.key} className={cn("flex items-center gap-1", ok ? "text-emerald-600" : "text-slate-400")}>
                  <Check className={cn("h-3 w-3", ok ? "opacity-100" : "opacity-30")} /> {r.label}
                </li>
              );
            })}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
            <Button type="submit" disabled={saving} data-testid="change-password-submit" className="bg-indigo-600 hover:bg-indigo-700">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Update password
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
