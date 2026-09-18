import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { api, formatApiError } from "@/lib/api";
import { ACTION_LABEL } from "@/lib/permissions";

// Per-user grant/deny overrides on top of role defaults.
export default function PermissionsDialog({ user, onClose, onSaved }) {
  const [catalog, setCatalog] = useState(null);
  const [allow, setAllow] = useState(new Set(user.permission_overrides?.allow || []));
  const [deny, setDeny] = useState(new Set(user.permission_overrides?.deny || []));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/roles/permissions/catalog").then((r) => setCatalog(r.data)).catch((e) => toast.error(formatApiError(e)));
  }, []);

  const cycle = (perm) => {
    const a = new Set(allow), d = new Set(deny);
    if (!a.has(perm) && !d.has(perm)) a.add(perm);
    else if (a.has(perm)) { a.delete(perm); d.add(perm); }
    else d.delete(perm);
    setAllow(a); setDeny(d);
  };

  const state = (perm) => (allow.has(perm) ? "allow" : deny.has(perm) ? "deny" : "default");

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/users/${user.id}/permissions`, { allow: [...allow], deny: [...deny] });
      toast.success("Permissions updated");
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-white dark:bg-slate-900" data-testid="user-permissions-dialog">
        <DialogHeader>
          <DialogTitle>Permission overrides — {user.name}</DialogTitle>
          <DialogDescription>
            Click a permission to cycle: <span className="text-slate-500">default</span> →{" "}
            <span className="text-emerald-600">allow</span> → <span className="text-red-600">deny</span>. Overrides stack on the role's defaults.
          </DialogDescription>
        </DialogHeader>
        {!catalog ? (
          <div className="py-8 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
        ) : (
          <div className="max-h-[50vh] space-y-4 overflow-y-auto pr-1">
            {catalog.groups.map((g) => (
              <div key={g.module}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">{g.label}</p>
                <div className="grid grid-cols-2 gap-2">
                  {g.actions.map((a) => {
                    const perm = `${g.module}.${a}`;
                    const s = state(perm);
                    return (
                      <button
                        type="button" key={perm} onClick={() => cycle(perm)}
                        data-testid={`override-${perm}`}
                        className={`flex items-center justify-between rounded-md border px-3 py-1.5 text-sm transition-colors ${
                          s === "allow" ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : s === "deny" ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                          : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300"}`}
                      >
                        {ACTION_LABEL[a] || a}
                        <span className="text-[10px] uppercase">{s === "default" ? "" : s}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving} data-testid="save-permissions-button" className="bg-indigo-600 hover:bg-indigo-700">
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
