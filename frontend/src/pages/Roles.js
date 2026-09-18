import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Lock, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { ROLE_LABEL, ACTION_LABEL } from "@/lib/permissions";
import RoleBadge from "@/components/RoleBadge";

export default function Roles() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("roles.update");
  const [catalog, setCatalog] = useState(null);
  const [roles, setRoles] = useState([]);
  const [active, setActive] = useState("team_leader");
  const [selected, setSelected] = useState(new Set());
  const [saving, setSaving] = useState(false);

  const loadRoles = () => api.get("/roles").then((r) => setRoles(r.data)).catch((e) => toast.error(formatApiError(e)));

  useEffect(() => {
    api.get("/roles/permissions/catalog").then((r) => setCatalog(r.data)).catch(() => {});
    loadRoles();
  }, []);

  useEffect(() => {
    const role = roles.find((r) => r.key === active);
    if (role) setSelected(new Set(role.permissions));
  }, [active, roles]);

  const toggle = (perm) => {
    if (!canEdit || active === "admin") return;
    const s = new Set(selected);
    s.has(perm) ? s.delete(perm) : s.add(perm);
    setSelected(s);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/roles/${active}`, { permissions: [...selected] });
      toast.success("Role permissions updated");
      loadRoles();
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setSaving(false);
    }
  };

  const isAdminRole = active === "admin";
  const readOnly = !canEdit || isAdminRole;

  return (
    <div className="space-y-6" data-testid="roles-page">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Roles & Permissions</h1>
        <p className="text-sm text-slate-500">Configure granular access for each role. Backend enforces every grant.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit p-3">
          {roles.map((r) => (
            <button
              key={r.key} onClick={() => setActive(r.key)}
              data-testid={`role-tab-${r.key}`}
              className={`mb-1 flex w-full flex-col items-start rounded-lg px-3 py-2 text-left transition-colors ${
                active === r.key ? "bg-indigo-50 dark:bg-indigo-900/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
            >
              <span className="flex items-center gap-2 font-medium text-slate-900 dark:text-slate-100">
                {ROLE_LABEL[r.key]}
                {r.key === "admin" && <Lock className="h-3 w-3 text-slate-400" />}
              </span>
              <span className="text-xs text-slate-500">{r.permissions.length} permissions</span>
            </button>
          ))}
        </Card>

        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RoleBadge role={active} />
              {isAdminRole && <span className="text-xs text-slate-500">(full access, locked)</span>}
            </div>
            {!readOnly && (
              <Button onClick={save} disabled={saving} data-testid="save-role-button" className="bg-indigo-600 hover:bg-indigo-700">
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save
              </Button>
            )}
          </div>

          {!catalog ? (
            <div className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></div>
          ) : (
            <div className="space-y-5">
              {catalog.groups.map((g) => (
                <div key={g.module} className="rounded-lg border border-slate-100 p-4 dark:border-slate-800">
                  <p className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{g.label}</p>
                  <div className="flex flex-wrap gap-4">
                    {g.actions.map((a) => {
                      const perm = `${g.module}.${a}`;
                      const checked = isAdminRole || selected.has(perm);
                      return (
                        <label key={perm} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <Checkbox
                            checked={checked} disabled={readOnly}
                            data-testid={`role-permission-checkbox-${g.module}-${a}`}
                            onCheckedChange={() => toggle(perm)}
                          />
                          {ACTION_LABEL[a] || a}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
