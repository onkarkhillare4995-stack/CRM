from fastapi import APIRouter, Depends, Request
from core.database import db
from core.logging_config import correlation_id_ctx
from models.entities import OrgSettingsUpdate, now_utc
from services import audit_service
from api.deps import require_permission, get_client_ip

router = APIRouter(prefix="/settings", tags=["settings"])

DEFAULTS = {"company_name": "OAKsphere Recruitment", "timezone": "UTC", "date_format": "YYYY-MM-DD"}


@router.get("")
async def get_settings(user: dict = Depends(require_permission("settings.manage"))):
    doc = await db.organization_settings.find_one({"key": "org"}, {"_id": 0})
    if not doc:
        return {"key": "org", **DEFAULTS}
    return doc


@router.put("")
async def update_settings(
    payload: OrgSettingsUpdate, request: Request,
    user: dict = Depends(require_permission("settings.manage")),
):
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    updates["updated_at"] = now_utc()
    updates["updated_by"] = user["id"]
    await db.organization_settings.update_one(
        {"key": "org"}, {"$set": updates, "$setOnInsert": {"key": "org", **DEFAULTS}}, upsert=True
    )
    await audit_service.record(
        db, actor=user, action="settings.update", entity_type="organization_settings",
        entity_id="org", details={"changes": updates},
        ip=get_client_ip(request), correlation_id=correlation_id_ctx.get(),
    )
    return await db.organization_settings.find_one({"key": "org"}, {"_id": 0})
