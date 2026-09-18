from fastapi import APIRouter, Depends, Request, Query
from core.database import db
from core.logging_config import correlation_id_ctx
from models.entities import UserCreate, UserUpdate, PermissionOverrideUpdate
from services import user_service, audit_service, permission_service
from api.deps import get_current_user, require_permission, get_client_ip

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
async def list_users(
    search: str = Query(""),
    role: str = Query(""),
    status: str = Query(""),
    user: dict = Depends(require_permission("users.manage")),
):
    return await user_service.list_users(db, user, search=search, role=role, status=status)


@router.get("/assignable-managers")
async def assignable_managers(user: dict = Depends(require_permission("users.manage"))):
    leaders = await db.users.find(
        {"role": {"$in": ["team_leader", "admin"]}, "is_active": True}
    ).to_list(500)
    return [{"id": u["id"], "name": u["name"], "role": u["role"]} for u in leaders]


@router.get("/{user_id}")
async def get_user(user_id: str, user: dict = Depends(require_permission("users.manage"))):
    return await user_service.get_user(db, user, user_id)


@router.get("/{user_id}/effective-permissions")
async def effective_permissions(user_id: str, user: dict = Depends(require_permission("users.manage"))):
    return await user_service.get_effective(db, user, user_id)


@router.get("/{user_id}/sessions")
async def user_sessions(user_id: str, user: dict = Depends(require_permission("users.manage"))):
    return await user_service.list_sessions(db, user, user_id)


@router.post("/{user_id}/revoke-sessions")
async def revoke_sessions(user_id: str, request: Request,
                          user: dict = Depends(require_permission("users.manage"))):
    count = await user_service.revoke_all_sessions(db, user, user_id)
    await audit_service.record(db, actor=user, action="users.revoke_sessions", entity_type="user",
                               entity_id=user_id, details={"revoked": count}, severity="warning",
                               ip=get_client_ip(request), correlation_id=correlation_id_ctx.get())
    return {"revoked": count}


@router.post("")
async def create_user(
    payload: UserCreate, request: Request,
    user: dict = Depends(require_permission("users.manage")),
):
    created = await user_service.create_user(db, user, payload)
    await audit_service.record(
        db, actor=user, action="users.create", entity_type="user",
        entity_id=created["id"],
        details={"email": created["email"], "role": created["role"]},
        ip=get_client_ip(request), correlation_id=correlation_id_ctx.get(),
    )
    return created


@router.patch("/{user_id}")
async def update_user(
    user_id: str, payload: UserUpdate, request: Request,
    user: dict = Depends(require_permission("users.manage")),
):
    updated, changes = await user_service.update_user(db, user, user_id, payload)
    await audit_service.record(
        db, actor=user, action="users.update", entity_type="user",
        entity_id=user_id, details={"changes": changes},
        ip=get_client_ip(request), correlation_id=correlation_id_ctx.get(),
    )
    return updated


@router.post("/{user_id}/status")
async def set_status(
    user_id: str, request: Request, is_active: bool = Query(...),
    user: dict = Depends(require_permission("users.manage")),
):
    updated = await user_service.set_active(db, user, user_id, is_active)
    await audit_service.record(
        db, actor=user,
        action="users.activate" if is_active else "users.deactivate",
        entity_type="user", entity_id=user_id,
        details={"is_active": is_active}, severity="warning" if not is_active else "info",
        ip=get_client_ip(request), correlation_id=correlation_id_ctx.get(),
    )
    return updated


@router.put("/{user_id}/permissions")
async def set_permissions(
    user_id: str, payload: PermissionOverrideUpdate, request: Request,
    user: dict = Depends(require_permission("users.manage")),
):
    permission_service.validate_permissions(payload.allow + payload.deny)
    updated = await user_service.set_permission_overrides(db, user, user_id, payload.allow, payload.deny)
    await audit_service.record(
        db, actor=user, action="users.manage_permissions", entity_type="user",
        entity_id=user_id, details={"allow": payload.allow, "deny": payload.deny},
        ip=get_client_ip(request), correlation_id=correlation_id_ctx.get(),
    )
    return updated
