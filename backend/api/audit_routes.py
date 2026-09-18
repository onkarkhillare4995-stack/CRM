import csv
import io
from datetime import datetime
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from core.database import db
from services import scope_service
from api.deps import get_current_user, require_permission

router = APIRouter(prefix="/audit-logs", tags=["audit"])


async def _build_query(actor, action, entity_type, actor_id, severity, search, date_from, date_to):
    query = await scope_service.audit_scope_filter(db, actor)
    if action:
        query["action"] = action
    if entity_type:
        query["entity_type"] = entity_type
    if actor_id:
        # respect scope: intersect
        scoped = query.get("actor_id")
        if isinstance(scoped, dict) and "$in" in scoped:
            if actor_id in scoped["$in"]:
                query["actor_id"] = actor_id
            else:
                query["actor_id"] = "__none__"
        else:
            query["actor_id"] = actor_id
    if severity:
        query["severity"] = severity
    if search:
        query["$or"] = [
            {"actor_email": {"$regex": search, "$options": "i"}},
            {"action": {"$regex": search, "$options": "i"}},
            {"entity_id": {"$regex": search, "$options": "i"}},
        ]
    date_filter = {}
    if date_from:
        date_filter["$gte"] = datetime.fromisoformat(date_from)
    if date_to:
        date_filter["$lte"] = datetime.fromisoformat(date_to)
    if date_filter:
        query["created_at"] = date_filter
    return query


@router.get("")
async def list_logs(
    action: str = Query(""), entity_type: str = Query(""), actor_id: str = Query(""),
    severity: str = Query(""), search: str = Query(""),
    date_from: str = Query(""), date_to: str = Query(""),
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    user: dict = Depends(require_permission("audit.view")),
):
    query = await _build_query(user, action, entity_type, actor_id, severity, search, date_from, date_to)
    total = await db.audit_logs.count_documents(query)
    logs = (
        await db.audit_logs.find(query, {"_id": 0})
        .sort("created_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list(page_size)
    )
    return {"items": logs, "total": total, "page": page, "page_size": page_size}


@router.get("/actions")
async def distinct_actions(user: dict = Depends(require_permission("audit.view"))):
    scope = await scope_service.audit_scope_filter(db, user)
    actions = await db.audit_logs.distinct("action", scope)
    return sorted(actions)


@router.get("/export")
async def export_csv(
    action: str = Query(""), entity_type: str = Query(""), actor_id: str = Query(""),
    severity: str = Query(""), search: str = Query(""),
    date_from: str = Query(""), date_to: str = Query(""),
    user: dict = Depends(require_permission("audit.view")),
):
    query = await _build_query(user, action, entity_type, actor_id, severity, search, date_from, date_to)
    logs = await db.audit_logs.find(query, {"_id": 0}).sort("created_at", -1).to_list(10000)
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["timestamp", "actor_email", "actor_role", "action", "entity_type", "entity_id", "severity", "ip"])
    for log in logs:
        writer.writerow([
            log.get("created_at"), log.get("actor_email"), log.get("actor_role"),
            log.get("action"), log.get("entity_type"), log.get("entity_id"),
            log.get("severity"), log.get("ip"),
        ])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=audit_logs.csv"},
    )
