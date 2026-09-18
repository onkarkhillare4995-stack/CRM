from fastapi import APIRouter, Depends, Request
from core.database import db
from core.logging_config import correlation_id_ctx
from core.errors import AppError
from models.entities import RoleUpdate, now_utc
from pydantic import BaseModel
from typing import Optional, List
from services import permission_service as ps, audit_service
from models.entities import new_id
from api.deps import require_permission, get_client_ip

router = APIRouter(prefix="/roles", tags=["roles"])


class RoleCreate(BaseModel):
    key: str
    name: str
    description: Optional[str] = ""
    permissions: List[str] = []


class RoleRename(BaseModel):
    name: str
    description: Optional[str] = None


class RoleClone(BaseModel):
    key: str
    name: str


async def _audit(user, request, action, role_key, details):
    await audit_service.record(db, actor=user, action=action, entity_type="role",
                               entity_id=role_key, details=details, severity="warning",
                               ip=get_client_ip(request), correlation_id=correlation_id_ctx.get())


@router.get("/permissions/catalog")
async def permission_catalog(user: dict = Depends(require_permission("users.manage"))):
    return {"groups": ps.PERMISSION_GROUPS, "all": ps.ALL_PERMISSIONS}


@router.get("")
async def list_roles(user: dict = Depends(require_permission("users.manage"))):
    roles = await db.roles.find({}, {"_id": 0}).to_list(100)
    order = {"admin": 0, "team_leader": 1, "recruiter": 2}
    roles.sort(key=lambda r: (order.get(r["key"], 9), r["name"]))
    for r in roles:
        r["user_count"] = await db.users.count_documents({"role": r["key"]})
    return roles


@router.post("")
async def create_role(payload: RoleCreate, request: Request,
                      user: dict = Depends(require_permission("users.manage"))):
    key = payload.key.strip().lower().replace(" ", "_")
    if not key.isidentifier():
        raise AppError("bad_request", "Role key must be alphanumeric/underscore", 400)
    if await ps.role_exists(db, key):
        raise AppError("conflict", "A role with this key already exists", 409)
    ps.validate_permissions(payload.permissions)
    doc = {"id": key, "key": key, "name": payload.name.strip(),
           "description": payload.description or "", "permissions": sorted(set(payload.permissions)),
           "is_system": False, "created_at": now_utc(), "updated_at": now_utc()}
    await db.roles.insert_one(doc)
    await _audit(user, request, "roles.create", key, {"permissions": doc["permissions"]})
    return {k: v for k, v in doc.items() if k != "_id"}


@router.put("/{role_key}")
async def update_role(role_key: str, payload: RoleUpdate, request: Request,
                      user: dict = Depends(require_permission("users.manage"))):
    role = await db.roles.find_one({"key": role_key})
    if not role:
        raise AppError("not_found", "Role not found", 404)
    if role_key == "admin":
        raise AppError("invalid_operation", "Administrator permissions cannot be modified", 400)
    ps.validate_permissions(payload.permissions)
    before = role.get("permissions", [])
    after = sorted(set(payload.permissions))
    await db.roles.update_one({"key": role_key}, {"$set": {"permissions": after, "updated_at": now_utc()}})
    await _audit(user, request, "roles.update", role_key, {"from": before, "to": after})
    return await db.roles.find_one({"key": role_key}, {"_id": 0})


@router.put("/{role_key}/rename")
async def rename_role(role_key: str, payload: RoleRename, request: Request,
                      user: dict = Depends(require_permission("users.manage"))):
    role = await db.roles.find_one({"key": role_key})
    if not role:
        raise AppError("not_found", "Role not found", 404)
    updates = {"name": payload.name.strip(), "updated_at": now_utc()}
    if payload.description is not None:
        updates["description"] = payload.description
    await db.roles.update_one({"key": role_key}, {"$set": updates})
    await _audit(user, request, "roles.rename", role_key, {"name": payload.name})
    return await db.roles.find_one({"key": role_key}, {"_id": 0})


@router.post("/{role_key}/clone")
async def clone_role(role_key: str, payload: RoleClone, request: Request,
                     user: dict = Depends(require_permission("users.manage"))):
    src = await db.roles.find_one({"key": role_key})
    if not src:
        raise AppError("not_found", "Role not found", 404)
    new_key = payload.key.strip().lower().replace(" ", "_")
    if not new_key.isidentifier():
        raise AppError("bad_request", "Role key must be alphanumeric/underscore", 400)
    if await ps.role_exists(db, new_key):
        raise AppError("conflict", "A role with this key already exists", 409)
    doc = {"id": new_key, "key": new_key, "name": payload.name.strip(),
           "description": f"Cloned from {src['name']}", "permissions": list(src.get("permissions", [])),
           "is_system": False, "created_at": now_utc(), "updated_at": now_utc()}
    await db.roles.insert_one(doc)
    await _audit(user, request, "roles.clone", new_key, {"from": role_key})
    return {k: v for k, v in doc.items() if k != "_id"}


@router.post("/{role_key}/reset")
async def reset_role(role_key: str, request: Request,
                     user: dict = Depends(require_permission("users.manage"))):
    role = await db.roles.find_one({"key": role_key})
    if not role:
        raise AppError("not_found", "Role not found", 404)
    if role_key not in ps.ROLE_DEFAULTS:
        raise AppError("invalid_operation", "Only system roles can be reset to default", 400)
    before = role.get("permissions", [])
    after = ps.default_permissions_for(role_key)
    await db.roles.update_one({"key": role_key}, {"$set": {"permissions": after, "updated_at": now_utc()}})
    await _audit(user, request, "roles.reset", role_key, {"from": before, "to": after})
    return await db.roles.find_one({"key": role_key}, {"_id": 0})


@router.delete("/{role_key}")
async def delete_role(role_key: str, request: Request,
                      user: dict = Depends(require_permission("users.manage"))):
    role = await db.roles.find_one({"key": role_key})
    if not role:
        raise AppError("not_found", "Role not found", 404)
    if role.get("is_system") or role_key in ps.ROLE_DEFAULTS:
        raise AppError("invalid_operation", "System roles cannot be deleted", 400)
    if await db.users.count_documents({"role": role_key}) > 0:
        raise AppError("invalid_operation", "Reassign users before deleting this role", 400)
    await db.roles.delete_one({"key": role_key})
    await _audit(user, request, "roles.delete", role_key, {})
    return {"deleted": True}
