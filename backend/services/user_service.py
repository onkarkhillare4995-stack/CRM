"""User CRUD with scoping, validation and referenced-record preservation."""
from core.security import hash_password
from core.errors import AppError
from models.entities import new_id, now_utc, ROLES
from services import scope_service, permission_service


async def _active_admin_count(db) -> int:
    return await db.users.count_documents({"role": "admin", "is_active": True})


def public(user: dict) -> dict:
    u = dict(user)
    u.pop("_id", None)
    u.pop("password_hash", None)
    u.setdefault("permission_overrides", {"allow": [], "deny": []})
    return u


async def list_users(db, actor: dict, *, search: str = "", role: str = "", status: str = "") -> list[dict]:
    query = await scope_service.user_scope_filter(db, actor)
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
        ]
    if role:
        query["role"] = role
    if status == "active":
        query["is_active"] = True
    elif status == "inactive":
        query["is_active"] = False
    users = await db.users.find(query).sort("created_at", -1).to_list(1000)
    return [public(u) for u in users]


async def get_user(db, actor: dict, user_id: str) -> dict:
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise AppError("not_found", "User not found", 404)
    await scope_service.assert_can_access_user(db, actor, user)
    return public(user)


async def _validate_role(db, role: str) -> None:
    if not await db.roles.find_one({"key": role}):
        raise AppError("invalid_role", f"Unknown role: {role}", 400)


async def create_user(db, actor: dict, data) -> dict:
    await _validate_role(db, data.role)
    email = data.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise AppError("conflict", "A user with this email already exists", 409)

    manager_id = data.manager_id
    if data.role == "recruiter" and manager_id:
        mgr = await db.users.find_one({"id": manager_id})
        if not mgr or mgr.get("role") not in ("team_leader", "admin"):
            raise AppError("invalid_manager", "Assigned manager must be a team leader", 400)

    doc = {
        "id": new_id(),
        "email": email,
        "name": data.name.strip(),
        "password_hash": hash_password(data.password),
        "role": data.role,
        "phone": data.phone,
        "team_id": data.team_id,
        "manager_id": manager_id,
        "is_active": True,
        "permission_overrides": {"allow": [], "deny": []},
        "avatar_url": None,
        "last_login_at": None,
        "created_at": now_utc(),
        "updated_at": now_utc(),
        "created_by": actor["id"],
        "updated_by": actor["id"],
    }
    await db.users.insert_one(doc)
    return public(doc)


async def update_user(db, actor: dict, user_id: str, data) -> tuple[dict, dict]:
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise AppError("not_found", "User not found", 404)
    await scope_service.assert_can_access_user(db, actor, user)

    updates = {}
    changes = {}
    payload = data.model_dump(exclude_unset=True)

    # Team leaders may not change roles or elevate; only admin can change role.
    if "role" in payload and payload["role"] is not None:
        if actor.get("role") != "admin":
            raise AppError("forbidden", "Only an admin can change roles", 403)
        if user_id == actor["id"]:
            raise AppError("invalid_operation", "You cannot change your own role", 400)
        await _validate_role(db, payload["role"])
        if user.get("role") == "admin" and payload["role"] != "admin" and await _active_admin_count(db) <= 1:
            raise AppError("invalid_operation", "Cannot demote the last active administrator", 400)

    for field in ("name", "role", "phone", "team_id", "manager_id", "is_active", "avatar_url"):
        if field in payload and payload[field] is not None and payload[field] != user.get(field):
            updates[field] = payload[field]
            changes[field] = {"from": user.get(field), "to": payload[field]}

    if updates:
        updates["updated_at"] = now_utc()
        updates["updated_by"] = actor["id"]
        await db.users.update_one({"id": user_id}, {"$set": updates})
        if "role" in updates:
            # Role changed -> revoke sessions so cached permission scopes cannot outlive it.
            await db.sessions.update_many({"user_id": user_id}, {"$set": {"revoked": True}})
    fresh = await db.users.find_one({"id": user_id})
    return public(fresh), changes


async def set_active(db, actor: dict, user_id: str, is_active: bool) -> dict:
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise AppError("not_found", "User not found", 404)
    await scope_service.assert_can_access_user(db, actor, user)
    if user["id"] == actor["id"] and not is_active:
        raise AppError("invalid_operation", "You cannot deactivate your own account", 400)
    if not is_active and user.get("role") == "admin" and await _active_admin_count(db) <= 1:
        raise AppError("invalid_operation", "Cannot deactivate the last active administrator", 400)
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"is_active": is_active, "updated_at": now_utc(), "updated_by": actor["id"]}},
    )
    if not is_active:
        # Deactivation preserves the record; only revoke live sessions.
        await db.sessions.update_many({"user_id": user_id}, {"$set": {"revoked": True}})
    fresh = await db.users.find_one({"id": user_id})
    return public(fresh)


async def set_permission_overrides(db, actor: dict, user_id: str, allow, deny) -> dict:
    if user_id == actor["id"]:
        raise AppError("invalid_operation", "You cannot change your own permissions", 400)
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise AppError("not_found", "User not found", 404)
    if user.get("role") == "admin":
        raise AppError("invalid_operation", "Admin permissions cannot be overridden", 400)
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "permission_overrides": {"allow": list(set(allow)), "deny": list(set(deny))},
                "updated_at": now_utc(),
                "updated_by": actor["id"],
            }
        },
    )
    fresh = await db.users.find_one({"id": user_id})
    return public(fresh)


async def get_effective(db, actor: dict, user_id: str) -> dict:
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise AppError("not_found", "User not found", 404)
    perms = sorted(await permission_service.get_effective_permissions(db, user))
    role_perms = sorted(await permission_service.get_role_permissions(db, user.get("role", "")))
    return {"user_id": user_id, "role": user.get("role"), "role_permissions": role_perms,
            "overrides": user.get("permission_overrides", {"allow": [], "deny": []}),
            "effective": perms}


async def list_sessions(db, actor: dict, user_id: str) -> list:
    return await db.sessions.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).to_list(100)


async def revoke_all_sessions(db, actor: dict, user_id: str) -> int:
    res = await db.sessions.update_many({"user_id": user_id, "revoked": False}, {"$set": {"revoked": True}})
    return res.modified_count


async def list_recruiters(db, actor: dict) -> list:
    role = actor.get("role")
    if role == "admin":
        q = {"role": {"$in": ["recruiter", "team_leader"]}}
    else:
        q = {"id": {"$in": await scope_service.team_member_ids(db, actor["id"])}}
    users = await db.users.find(q).sort("name", 1).to_list(1000)
    return [public(u) for u in users]
