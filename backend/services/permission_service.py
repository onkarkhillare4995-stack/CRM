"""Central permission registry + resolution. Single source of truth."""
from typing import List, Dict, Set
from core.errors import AppError

# Grouped for the frontend permission matrix. Each entry: module + labelled perms.
PERMISSION_GROUPS = [
    {"module": "dashboard", "label": "Dashboard", "perms": [["dashboard.view", "View dashboard"]]},
    {"module": "leads", "label": "Leads", "perms": [
        ["leads.view_all", "View all leads (scope)"], ["leads.view_own", "View own leads"],
        ["leads.create", "Create leads"], ["leads.edit", "Edit leads"],
        ["leads.delete", "Delete leads"], ["leads.assign", "Assign leads"],
        ["leads.transfer", "Transfer leads"], ["leads.auto_distribute", "Auto-distribute"],
        ["leads.export", "Export leads"]]},
    {"module": "calls", "label": "Calls", "perms": [["calls.log", "Log calls"]]},
    {"module": "followups", "label": "Follow-ups", "perms": [["followups.manage", "Manage follow-ups"]]},
    {"module": "tasks", "label": "Tasks", "perms": [["tasks.manage", "Manage tasks"]]},
    {"module": "interviews", "label": "Interviews", "perms": [["interviews.manage", "Manage interviews"]]},
    {"module": "joinings", "label": "Joinings", "perms": [["joinings.manage", "Manage joinings"]]},
    {"module": "jobs", "label": "Jobs", "perms": [["jobs.manage", "Manage jobs"]]},
    {"module": "clients", "label": "Clients", "perms": [["clients.manage", "Manage clients"]]},
    {"module": "vendors", "label": "Vendors", "perms": [["vendors.manage", "Manage vendors"]]},
    {"module": "templates", "label": "Templates", "perms": [["templates.manage", "Manage templates"]]},
    {"module": "recruiters", "label": "Recruiters", "perms": [["recruiters.view", "View recruiters"]]},
    {"module": "users", "label": "Access Control", "perms": [["users.manage", "Manage users, roles & sessions"]]},
    {"module": "reports", "label": "Reports", "perms": [["reports.view", "View reports"]]},
    {"module": "integrations", "label": "Integrations", "perms": [["integrations.manage", "Manage integrations"]]},
    {"module": "imports", "label": "Imports", "perms": [["imports.run", "Run imports"]]},
    {"module": "settings", "label": "Settings", "perms": [["settings.manage", "Manage settings"]]},
    {"module": "audit", "label": "Audit", "perms": [["audit.view", "View audit logs"]]},
]

ALL_PERMISSIONS: List[str] = [p[0] for g in PERMISSION_GROUPS for p in g["perms"]]

# Defaults used to seed the roles collection AND to reset a role to default.
ROLE_DEFAULTS: Dict[str, List[str]] = {
    "admin": list(ALL_PERMISSIONS),
    "team_leader": [
        "dashboard.view", "leads.view_all", "leads.view_own", "leads.create", "leads.edit",
        "leads.assign", "leads.transfer", "leads.export", "calls.log", "followups.manage",
        "tasks.manage", "interviews.manage", "joinings.manage", "jobs.manage", "clients.manage",
        "vendors.manage", "templates.manage", "recruiters.view", "reports.view",
    ],
    "recruiter": [
        "dashboard.view", "leads.view_own", "leads.create", "leads.edit", "calls.log",
        "followups.manage", "tasks.manage", "interviews.manage", "joinings.manage",
    ],
}

ROLE_META = {
    "admin": {"name": "Administrator", "description": "Full organization-wide access."},
    "team_leader": {"name": "Team Leader", "description": "Manages team members and team scope."},
    "recruiter": {"name": "Recruiter", "description": "Manages own assigned records."},
}


def validate_permissions(perms: List[str]) -> None:
    unknown = [p for p in perms if p not in ALL_PERMISSIONS]
    if unknown:
        raise AppError("invalid_permission", f"Unknown permissions: {', '.join(unknown)}", 400)


CURRENT_PERM_MODEL = "v2"


async def seed_roles(db) -> None:
    from models.entities import now_utc
    for key, perms in ROLE_DEFAULTS.items():
        existing = await db.roles.find_one({"key": key})
        if existing is None:
            await db.roles.insert_one(
                {
                    "id": key, "key": key, "name": ROLE_META[key]["name"],
                    "description": ROLE_META[key]["description"], "permissions": perms,
                    "is_system": True, "perm_model": CURRENT_PERM_MODEL,
                    "created_at": now_utc(), "updated_at": now_utc(),
                }
            )
        elif existing.get("perm_model") != CURRENT_PERM_MODEL:
            # One-time migration to the new permission model.
            await db.roles.update_one(
                {"key": key},
                {"$set": {"permissions": perms, "perm_model": CURRENT_PERM_MODEL, "updated_at": now_utc()}},
            )


def default_permissions_for(role_key: str) -> List[str]:
    return list(ROLE_DEFAULTS.get(role_key, []))


async def role_exists(db, key: str) -> bool:
    return (await db.roles.find_one({"key": key})) is not None


async def get_role(db, role_key: str) -> dict:
    role = await db.roles.find_one({"key": role_key}, {"_id": 0})
    return role


async def get_role_permissions(db, role_key: str) -> Set[str]:
    if role_key == "admin":
        return set(ALL_PERMISSIONS)
    role = await db.roles.find_one({"key": role_key})
    if not role:
        return set(ROLE_DEFAULTS.get(role_key, []))
    return set(role.get("permissions", []))


async def get_effective_permissions(db, user: dict) -> Set[str]:
    """Role grants + per-user allow overrides − deny overrides. Admin always full."""
    if user.get("role") == "admin":
        return set(ALL_PERMISSIONS)
    perms = await get_role_permissions(db, user.get("role", ""))
    overrides = user.get("permission_overrides") or {}
    for p in overrides.get("allow", []):
        perms.add(p)
    for p in overrides.get("deny", []):
        perms.discard(p)
    return perms


async def has_permission(db, user: dict, permission: str) -> bool:
    return permission in await get_effective_permissions(db, user)


async def require_permission_or_raise(db, user: dict, permission: str) -> None:
    if not await has_permission(db, user, permission):
        raise AppError("forbidden", f"Missing permission: {permission}", 403)
