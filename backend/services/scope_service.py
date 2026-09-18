"""Central data-scoping service. Builds Mongo filters and enforces record access
based on role: admin = all, team_leader = own team, recruiter = self/owned only."""
from typing import List
from core.errors import AppError


async def team_member_ids(db, leader_id: str) -> List[str]:
    """Ids of a team leader's members (recruiters reporting to them) + themselves."""
    ids = {leader_id}
    async for u in db.users.find({"manager_id": leader_id}, {"id": 1, "_id": 0}):
        ids.add(u["id"])
    return list(ids)


async def user_scope_filter(db, actor: dict) -> dict:
    """Filter for listing *user* records visible to the actor."""
    role = actor.get("role")
    if role == "admin":
        return {}
    if role == "team_leader":
        return {"id": {"$in": await team_member_ids(db, actor["id"])}}
    return {"id": actor["id"]}


async def assert_can_access_user(db, actor: dict, target: dict) -> None:
    """Record-level guard: prevents URL/ID tampering across recruiters/teams."""
    role = actor.get("role")
    if role == "admin":
        return
    if role == "team_leader":
        if target.get("id") == actor["id"] or target.get("manager_id") == actor["id"]:
            return
        raise AppError("forbidden", "Record is outside your team scope", 403)
    # recruiter
    if target.get("id") == actor["id"]:
        return
    raise AppError("forbidden", "Record is outside your scope", 403)


async def audit_scope_filter(db, actor: dict) -> dict:
    """Filter for audit logs visible to the actor."""
    role = actor.get("role")
    if role == "admin":
        return {}
    if role == "team_leader":
        return {"actor_id": {"$in": await team_member_ids(db, actor["id"])}}
    return {"actor_id": actor["id"]}


# ---------------- Recruitment (lead) scoping — permission-aware ----------------
async def recruiter_scope_ids(db, actor: dict, perms: set):
    """None => global (all recruiters). Otherwise the list of owner ids in scope."""
    if actor.get("role") == "admin":
        return None
    if {"leads.view_all", "recruiters.view", "users.manage"} & set(perms):
        return await team_member_ids(db, actor["id"])
    return [actor["id"]]


async def leads_filter(db, actor: dict, perms: set, recruiter_id: str | None = None) -> dict:
    ids = await recruiter_scope_ids(db, actor, perms)
    if ids is None:
        return {"owner_id": recruiter_id} if recruiter_id else {}
    if recruiter_id:
        return {"owner_id": recruiter_id if recruiter_id in ids else "__none__"}
    return {"owner_id": {"$in": ids}}


async def assert_lead_access(db, actor: dict, perms: set, lead: dict) -> None:
    if actor.get("role") == "admin":
        return
    ids = await recruiter_scope_ids(db, actor, perms)
    if ids is None or lead.get("owner_id") in ids:
        return
    raise AppError("forbidden", "Record is outside your scope", 403)
