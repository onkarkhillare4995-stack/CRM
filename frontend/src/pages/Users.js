import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, MoreHorizontal, Search, Loader2, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import RoleBadge from "@/components/RoleBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import PermissionGate from "@/components/PermissionGate";
import PermissionsDialog from "@/pages/PermissionsDialog";

const EMPTY = { email: "", name: "", password: "", role: "recruiter", phone: "", manager_id: "" };

export default function Users() {
  const { hasPermission, user: me } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [managers, setManagers] = useState([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const [confirm, setConfirm] = useState(null); // {user, next}
  const [permsUser, setPermsUser] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (roleFilter !== "all") params.role = roleFilter;
      if (statusFilter !== "all") params.status = statusFilter;
      const { data } = await api.get("/users", { params });
      setRows(data);
    } catch (e) {
      toast.error(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    api.get("/users/assignable-managers").then((r) => setManagers(r.data)).catch(() => {});
  }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (u) => {
    setEditing(u);
    setForm({ email: u.email, name: u.name, password: "", role: u.role, phone: u.phone || "", manager_id: u.manager_id || "" });
    setDialogOpen(true);
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        const payload = { name: form.name, phone: form.phone || null, manager_id: form.manager_id || null };
        if (hasPermission("users.update") && me.role === "admin") payload.role = form.role;
        await api.patch(`/users/${editing.id}`, payload);
        toast.success("User updated");
      } else {
        await api.post("/users", {
          email: form.email, name: form.name, password: form.password,
          role: form.role, phone: form.phone || null,
          manager_id: form.manager_id || null,
        });
        toast.success("User created");
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setSaving(false);
    }
  };

  const applyStatus = async () => {
    const { user, next } = confirm;
    try {
      await api.post(`/users/${user.id}/status`, null, { params: { is_active: next } });
      toast.success(next ? "User activated" : "User deactivated");
      load();
    } catch (err) {
      toast.error(formatApiError(err));
    } finally {
      setConfirm(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="users-page">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">User Management</h1>
          <p className="text-sm text-slate-500">Manage accounts, roles, and access scope.</p>
        </div>
        <PermissionGate permission="users.create">
          <Button onClick={openCreate} data-testid="add-user-button" className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="mr-1 h-4 w-4" /> Add User
          </Button>
        </PermissionGate>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" placeholder="Search name or email" data-testid="user-search-input" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-[160px]" data-testid="user-role-filter"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900">
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Administrator</SelectItem>
              <SelectItem value="team_leader">Team Leader</SelectItem>
              <SelectItem value="recruiter">Recruiter</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]" data-testid="user-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-white dark:bg-slate-900">
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-slate-800/50">
              <TableHead>Name</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Team Leader</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /></TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-sm text-slate-500">No users found.</TableCell></TableRow>
            ) : rows.map((u) => {
              const mgr = managers.find((m) => m.id === u.manager_id);
              const canToggle = hasPermission("users.update") && u.id !== me.id;
              return (
                <TableRow key={u.id} data-testid={`user-row-${u.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <TableCell>
                    <div className="font-medium text-slate-900 dark:text-slate-100">{u.name}</div>
                    <div className="text-xs text-slate-500">{u.email}</div>
                  </TableCell>
                  <TableCell><RoleBadge role={u.role} /></TableCell>
                  <TableCell className="text-sm text-slate-600 dark:text-slate-300">{mgr?.name || "—"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={u.is_active} disabled={!canToggle}
                        data-testid={`user-status-toggle-${u.id}`}
                        onCheckedChange={(next) => setConfirm({ user: u, next })}
                      />
                      <span className={`text-xs font-medium ${u.is_active ? "text-emerald-600" : "text-slate-400"}`}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" data-testid={`user-actions-${u.id}`}><MoreHorizontal className="h-4 w-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="bg-white dark:bg-slate-900">
                        <PermissionGate permission="users.update">
                          <DropdownMenuItem onClick={() => openEdit(u)} data-testid={`edit-user-${u.id}`}>Edit</DropdownMenuItem>
                        </PermissionGate>
                        <PermissionGate permission="users.manage_permissions">
                          {u.role !== "admin" && (
                            <DropdownMenuItem onClick={() => setPermsUser(u)} data-testid={`perms-user-${u.id}`}>
                              <ShieldCheck className="mr-2 h-4 w-4" /> Permissions
                            </DropdownMenuItem>
                          )}
                        </PermissionGate>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white dark:bg-slate-900" data-testid="user-dialog">
          <DialogHeader><DialogTitle>{editing ? "Edit user" : "Add user"}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label>Full name</Label>
              <Input required data-testid="user-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" required disabled={!!editing} data-testid="user-email-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            {!editing && (
              <div className="space-y-2">
                <Label>Temporary password</Label>
                <Input type="text" required minLength={8} data-testid="user-password-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8 characters" />
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })} disabled={editing && me.role !== "admin"}>
                  <SelectTrigger data-testid="user-role-select"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900">
                    <SelectItem value="recruiter">Recruiter</SelectItem>
                    <SelectItem value="team_leader">Team Leader</SelectItem>
                    <SelectItem value="admin">Administrator</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input data-testid="user-phone-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            {form.role === "recruiter" && (
              <div className="space-y-2">
                <Label>Assigned Team Leader</Label>
                <Select value={form.manager_id || "none"} onValueChange={(v) => setForm({ ...form, manager_id: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="user-manager-select"><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900">
                    <SelectItem value="none">Unassigned</SelectItem>
                    {managers.filter((m) => m.role === "team_leader").map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} data-testid="user-save-button" className="bg-indigo-600 hover:bg-indigo-700">
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Save" : "Create"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.next ? "Activate user?" : "Deactivate user?"}
        description={confirm?.next
          ? "The user will regain access. Historical records are preserved."
          : "The user will lose access and active sessions are revoked. All their historical records are preserved."}
        confirmLabel={confirm?.next ? "Activate" : "Deactivate"}
        destructive={!confirm?.next} onConfirm={applyStatus}
        testId="user-status-confirm"
      />

      {permsUser && (
        <PermissionsDialog user={permsUser} onClose={() => setPermsUser(null)} onSaved={load} />
      )}
    </div>
  );
}
