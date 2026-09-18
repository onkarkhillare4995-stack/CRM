from fastapi import APIRouter, Depends, Query
from core.database import db
from core.timeutil import parse_range
from services import dashboard_service, myday_service, permission_service
from api.deps import require_permission


async def _perms(user):
    return await permission_service.get_effective_permissions(db, user)


async def _tz():
    doc = await db.organization_settings.find_one({"key": "org"})
    return (doc or {}).get("timezone", "UTC")


dashboard_router = APIRouter(prefix="/dashboard", tags=["dashboard"])
myday_router = APIRouter(prefix="/my-day", tags=["my-day"])


@dashboard_router.get("/overview")
async def overview(date_from: str = Query(""), date_to: str = Query(""),
                   recruiter_id: str = Query(""), user: dict = Depends(require_permission("dashboard.view"))):
    perms = await _perms(user)
    start, end = parse_range(await _tz(), date_from or None, date_to or None)
    return await dashboard_service.compute(db, user, perms, start, end, recruiter_id or None)


@myday_router.get("")
async def my_day(user: dict = Depends(require_permission("dashboard.view"))):
    perms = await _perms(user)
    start, end = parse_range(await _tz(), None, None)
    return await myday_service.build(db, user, perms, start, end)
