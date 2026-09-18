import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Plus, MoreHorizontal, ShieldCheck, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { api, formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import RoleBadge from "@/components/RoleBadge";
import ConfirmDialog from "@/components/ConfirmDialog";
import PermissionGate from "@/components/PermissionGate";

export default function AccessControl() {
  const { hasPermission } = useAuth();
  const canManage = hasPermission("users.manage");
  const [tab, setTab] = useState(canManage ? "users" : "team");

  return (
    <div className="space-y-6" data-testid="access-control-page">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">Recruiters & Access</h1>
        <p className="text-sm text-slate-500">Users, roles, granular permissions, team structure and sessions.</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          {canManage && <TabsTrigger value="users" data-testid="tab-users">Users</TabsTrigger>}
          {canManage && <TabsTrigger value="roles" data-testid="tab-roles">Roles</TabsTrigger>}
          {canManage && <TabsTrigger value="permissions" data-testid="tab-permissions">Permissions</TabsTrigger>}
          <TabsTrigger value="team" data-testid="tab-team">Team Structure</TabsTrigger>
          {canManage && <TabsTrigger value="sessions" data-testid="tab-sessions">Security / Sessions</TabsTrigger>}
        </TabsList>
        {canManage && <TabsContent value="users"><UsersTab /></TabsContent>}
        {canManage && <TabsContent value="roles"><RolesTab /></TabsContent>}
        {canManage && <TabsContent value="permissions"><PermissionsTab /></TabsContent>}
        <TabsContent value="team"><TeamTab canManage={canManage} /></TabsContent>
        {canManage && <TabsContent value="sessions"><SessionsTab /></TabsContent>}
      </Tabs>
    </div>
  );
}

function UsersTab() {
  const { user: me } = useAuth();
  const [rows, setRows] = useState([]);
  const [managers, setManagers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ email: "", name: "", password: "", role: "recruiter", manager_id: "" });
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(() => api.get("/users").then((r) => setRows(r.data)).catch((e) => toast.error(formatApiError(e))), []);
  useEffect(() => {
    load();
    api.get("/users/assignable-managers").then((r) => setManagers(r.data)).catch(() => {});
    api.get("/roles").then((r) => setRoles(r.data)).catch(() => {});
  }, [load]);

  const save = async (e) => {
    e.preventDefault();
    try {
      if (editing) { await api.patch(`/users/${editing.id}`, { name: form.name, role: form.role, manager_id: form.manager_id || null }); toast.success("Updated"); }
      else { await api.post("/users", { ...form, manager_id: form.manager_id || null }); toast.success("User created"); }
      setOpen(false); load();
    } catch (err) { toast.error(formatApiError(err)); }
  };
  const openCreate = () => { setEditing(null); setForm({ email: "", name: "", password: "", role: "recruiter", manager_id: "" }); setOpen(true); };
  const openEdit = (u) => { setEditing(u); setForm({ email: u.email, name: u.name, password: "", role: u.role, manager_id: u.manager_id || "" }); setOpen(true); };
  const setStatus = async () => {
    try { await api.post(`/users/${confirm.user.id}/status`, null, { params: { is_active: confirm.next } }); toast.success("Updated"); load(); }
    catch (e) { toast.error(formatApiError(e)); } finally { setConfirm(null); }
  };
  const revoke = async (u) => {
    try { const { data } = await api.post(`/users/${u.id}/revoke-sessions`); toast.success(`Revoked ${data.revoked} session(s)`); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <Card className="mt-4 overflow-hidden">
      <div className="flex items-center justify-between p-4">
        <span className="text-sm text-slate-500">{rows.length} users</span>
        <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700" data-testid="add-user-button"><Plus className="mr-1 h-4 w-4" /> Add User</Button>
      </div>
      <Table>
        <TableHeader><TableRow className="bg-slate-50 dark:bg-slate-800/50">
          <TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
        </TableRow></TableHeader>
        <TableBody>
          {rows.map((u) => (
            <TableRow key={u.id} data-testid={`user-row-${u.id}`}>
              <TableCell><div className="font-medium text-slate-900 dark:text-slate-100">{u.name}</div><div className="text-xs text-slate-500">{u.email}</div></TableCell>
              <TableCell><RoleBadge role={u.role} /></TableCell>
              <TableCell><div className="flex items-center gap-2"><Switch checked={u.is_active} disabled={u.id === me.id} onCheckedChange={(next) => setConfirm({ user: u, next })} data-testid={`user-status-toggle-${u.id}`} /><span className="text-xs">{u.is_active ? "Active" : "Inactive"}</span></div></TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" data-testid={`user-actions-${u.id}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="bg-white dark:bg-slate-900">
                    <DropdownMenuItem onClick={() => openEdit(u)} data-testid={`edit-user-${u.id}`}>Edit / Assign role</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => revoke(u)} data-testid={`revoke-user-${u.id}`}>Revoke all sessions</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-white dark:bg-slate-900" data-testid="user-dialog">
          <DialogHeader><DialogTitle>{editing ? "Edit user" : "Add user"}</DialogTitle></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input required data-testid="user-name-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" required disabled={!!editing} data-testid="user-email-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            {!editing && <div className="space-y-2"><Label>Temp password</Label><Input required minLength={8} data-testid="user-password-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 8, upper+lower+digit" /></div>}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Role</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger data-testid="user-role-select"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900">{roles.map((r) => <SelectItem key={r.key} value={r.key}>{r.name}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="space-y-2"><Label>Team Leader</Label>
                <Select value={form.manager_id || "none"} onValueChange={(v) => setForm({ ...form, manager_id: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="user-manager-select"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-900"><SelectItem value="none">Unassigned</SelectItem>{managers.filter((m) => m.role === "team_leader").map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select></div>
            </div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" className="bg-indigo-600 hover:bg-indigo-700" data-testid="user-save-button">{editing ? "Save" : "Create"}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)} title={confirm?.next ? "Activate user?" : "Deactivate user?"} description={confirm?.next ? "User regains access." : "User loses access; sessions revoked. History preserved."} confirmLabel={confirm?.next ? "Activate" : "Deactivate"} destructive={!confirm?.next} onConfirm={setStatus} testId="user-status-confirm" />
    </Card>
  );
}

function RolesTab() {
  const [roles, setRoles] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [active, setActive] = useState(null);
  const [sel, setSel] = useState(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [newRole, setNewRole] = useState({ key: "", name: "" });
  const [delRole, setDelRole] = useState(null);

  const load = () => api.get("/roles").then((r) => { setRoles(r.data); if (!active && r.data[1]) setActive(r.data[1].key); }).catch((e) => toast.error(formatApiError(e)));
  useEffect(() => { load(); api.get("/roles/permissions/catalog").then((r) => setCatalog(r.data)).catch(() => {}); }, []);
  useEffect(() => { const r = roles.find((x) => x.key === active); if (r) setSel(new Set(r.permissions)); }, [active, roles]);

  const isAdmin = active === "admin";
  const toggle = (p) => { if (isAdmin) return; const s = new Set(sel); s.has(p) ? s.delete(p) : s.add(p); setSel(s); };
  const savePerms = async () => { try { await api.put(`/roles/${active}`, { permissions: [...sel] }); toast.success("Saved"); load(); } catch (e) { toast.error(formatApiError(e)); } };
  const reset = async () => { try { await api.post(`/roles/${active}/reset`); toast.success("Reset to default"); load(); } catch (e) { toast.error(formatApiError(e)); } };
  const clone = async () => { const name = prompt("New role name?"); if (!name) return; const key = name.toLowerCase().replace(/\s+/g, "_"); try { await api.post(`/roles/${active}/clone`, { key, name }); toast.success("Cloned"); load(); } catch (e) { toast.error(formatApiError(e)); } };
  const rename = async () => { const name = prompt("Rename role", roles.find((r) => r.key === active)?.name); if (!name) return; try { await api.put(`/roles/${active}/rename`, { name }); toast.success("Renamed"); load(); } catch (e) { toast.error(formatApiError(e)); } };
  const create = async (e) => { e.preventDefault(); try { await api.post("/roles", { key: newRole.key || newRole.name.toLowerCase().replace(/\s+/g, "_"), name: newRole.name, permissions: [] }); toast.success("Role created"); setCreateOpen(false); setNewRole({ key: "", name: "" }); load(); } catch (err) { toast.error(formatApiError(err)); } };
  const doDelete = async () => { try { await api.delete(`/roles/${delRole.key}`); toast.success("Deleted"); setDelRole(null); setActive("recruiter"); load(); } catch (e) { toast.error(formatApiError(e)); setDelRole(null); } };

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
      <Card className="h-fit p-3">
        <Button size="sm" className="mb-2 w-full bg-indigo-600 hover:bg-indigo-700" onClick={() => setCreateOpen(true)} data-testid="create-role-button"><Plus className="mr-1 h-4 w-4" /> Create Role</Button>
        {roles.map((r) => (
          <button key={r.key} onClick={() => setActive(r.key)} data-testid={`role-item-${r.key}`} className={`mb-1 flex w-full items-center justify-between rounded-lg px-3 py-2 text-left ${active === r.key ? "bg-indigo-50 dark:bg-indigo-900/30" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}>
            <span><span className="block font-medium text-slate-900 dark:text-slate-100">{r.name}</span><span className="text-xs text-slate-500">{r.permissions.length} perms · {r.user_count} users</span></span>
            {!r.is_system && <Badge variant="secondary" className="text-[10px]">custom</Badge>}
          </button>
        ))}
      </Card>
      <Card className="p-5">
        {active && (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <RoleBadge role={active} />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={rename} data-testid="rename-role-button">Rename</Button>
                <Button size="sm" variant="outline" onClick={clone} data-testid="clone-role-button">Clone</Button>
                {!isAdmin && roles.find((r) => r.key === active)?.is_system && <Button size="sm" variant="outline" onClick={reset} data-testid="reset-role-button">Reset default</Button>}
                {!roles.find((r) => r.key === active)?.is_system && <Button size="sm" variant="outline" className="text-red-600" onClick={() => setDelRole(roles.find((r) => r.key === active))} data-testid="delete-role-button">Delete</Button>}
                {!isAdmin && <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700" onClick={savePerms} data-testid="save-role-button"><Save className="mr-1 h-4 w-4" /> Save</Button>}
              </div>
            </div>
            {isAdmin && <p className="mb-3 text-xs text-amber-600">Administrator has full access and is locked.</p>}
            {!catalog ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : (
              <div className="space-y-4">
                {catalog.groups.map((g) => (
                  <div key={g.module} className="rounded-lg border border-slate-100 p-3 dark:border-slate-800">
                    <p className="mb-2 text-sm font-semibold">{g.label}</p>
                    <div className="flex flex-wrap gap-4">
                      {g.perms.map(([key, lbl]) => (
                        <label key={key} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                          <Checkbox checked={isAdmin || sel.has(key)} disabled={isAdmin} onCheckedChange={() => toggle(key)} data-testid={`perm-${key}`} />{lbl}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </Card>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-white dark:bg-slate-900" data-testid="create-role-dialog">
          <DialogHeader><DialogTitle>Create Role</DialogTitle></DialogHeader>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-2"><Label>Name</Label><Input required data-testid="new-role-name" value={newRole.name} onChange={(e) => setNewRole({ ...newRole, name: e.target.value })} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button><Button type="submit" className="bg-indigo-600 hover:bg-indigo-700" data-testid="new-role-save">Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <ConfirmDialog open={!!delRole} onOpenChange={(o) => !o && setDelRole(null)} title="Delete role?" description="Only custom roles with no assigned users can be deleted." confirmLabel="Delete" onConfirm={doDelete} testId="delete-role-confirm" />
    </div>
  );
}

function PermissionsTab() {
  const [users, setUsers] = useState([]);
  const [uid, setUid] = useState("");
  const [eff, setEff] = useState(null);
  useEffect(() => { api.get("/users").then((r) => setUsers(r.data)).catch(() => {}); }, []);
  useEffect(() => { if (uid) api.get(`/users/${uid}/effective-permissions`).then((r) => setEff(r.data)).catch((e) => toast.error(formatApiError(e))); }, [uid]);

  return (
    <Card className="mt-4 p-5" data-testid="permissions-tab">
      <div className="mb-4 max-w-sm">
        <Label>View effective permissions for</Label>
        <Select value={uid} onValueChange={setUid}>
          <SelectTrigger className="mt-1" data-testid="effective-user-select"><SelectValue placeholder="Select a user" /></SelectTrigger>
          <SelectContent className="max-h-64 bg-white dark:bg-slate-900">{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name} ({u.role})</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {eff && (
        <div className="space-y-3" data-testid="effective-permissions">
          <p className="text-sm text-slate-500">Role: <b>{eff.role}</b> · {eff.effective.length} effective permissions</p>
          <div className="flex flex-wrap gap-1">{eff.effective.map((p) => <Badge key={p} variant="secondary">{p}</Badge>)}</div>
        </div>
      )}
    </Card>
  );
}

function TeamTab({ canManage }) {
  const [recruiters, setRecruiters] = useState([]);
  const [leaders, setLeaders] = useState([]);
  const load = () => api.get("/recruiters").then((r) => {
    setRecruiters(r.data);
    setLeaders(r.data.filter((u) => u.role === "team_leader"));
  }).catch((e) => toast.error(formatApiError(e)));
  useEffect(() => { load(); }, []);

  const assign = async (recruiterId, managerId) => {
    try { await api.patch(`/users/${recruiterId}`, { manager_id: managerId || null }); toast.success("Team updated"); load(); }
    catch (e) { toast.error(formatApiError(e)); }
  };

  return (
    <Card className="mt-4 p-5" data-testid="team-tab">
      <div className="space-y-2">
        {recruiters.filter((u) => u.role === "recruiter").map((u) => (
          <div key={u.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800" data-testid={`team-recruiter-${u.id}`}>
            <div><span className="font-medium text-slate-900 dark:text-slate-100">{u.name}</span><span className="ml-2 text-xs text-slate-500">{u.email}</span></div>
            {canManage ? (
              <Select value={u.manager_id || "none"} onValueChange={(v) => assign(u.id, v === "none" ? "" : v)}>
                <SelectTrigger className="w-48" data-testid={`assign-manager-${u.id}`}><SelectValue placeholder="Team Leader" /></SelectTrigger>
                <SelectContent className="bg-white dark:bg-slate-900"><SelectItem value="none">Unassigned</SelectItem>{leaders.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
              </Select>
            ) : <Badge variant="secondary">{leaders.find((l) => l.id === u.manager_id)?.name || "Unassigned"}</Badge>}
          </div>
        ))}
        {recruiters.length === 0 && <p className="text-sm text-slate-500">No recruiters in scope.</p>}
      </div>
    </Card>
  );
}

function SessionsTab() {
  const [users, setUsers] = useState([]);
  const [uid, setUid] = useState("");
  const [sessions, setSessions] = useState([]);
  const load = (id) => api.get(`/users/${id}/sessions`).then((r) => setSessions(r.data)).catch(() => {});
  useEffect(() => { api.get("/users").then((r) => setUsers(r.data)).catch(() => {}); }, []);
  useEffect(() => { if (uid) load(uid); }, [uid]);
  const revoke = async () => { try { const { data } = await api.post(`/users/${uid}/revoke-sessions`); toast.success(`Revoked ${data.revoked}`); load(uid); } catch (e) { toast.error(formatApiError(e)); } };

  return (
    <Card className="mt-4 p-5" data-testid="sessions-tab">
      <div className="mb-4 flex items-end gap-3">
        <div className="max-w-sm flex-1"><Label>User</Label>
          <Select value={uid} onValueChange={setUid}><SelectTrigger className="mt-1" data-testid="sessions-user-select"><SelectValue placeholder="Select a user" /></SelectTrigger>
            <SelectContent className="max-h-64 bg-white dark:bg-slate-900">{users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent></Select></div>
        {uid && <Button variant="outline" className="text-red-600" onClick={revoke} data-testid="revoke-all-sessions-button">Revoke all sessions</Button>}
      </div>
      <div className="space-y-2">
        {sessions.map((s) => (
          <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm dark:border-slate-800">
            <span className="text-slate-600 dark:text-slate-300">{s.ip} · {(s.user_agent || "").slice(0, 40)}</span>
            <Badge variant={s.revoked ? "secondary" : "default"}>{s.revoked ? "revoked" : "active"}</Badge>
          </div>
        ))}
        {uid && sessions.length === 0 && <p className="text-sm text-slate-500">No sessions.</p>}
      </div>
    </Card>
  );
}
