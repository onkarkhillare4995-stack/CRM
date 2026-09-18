"""Immutable, append-only audit log."""
import logging
from typing import Optional
from models.entities import new_id, now_utc

logger = logging.getLogger("app.audit")


async def record(
    db,
    *,
    actor: Optional[dict],
    action: str,
    entity_type: str,
    entity_id: Optional[str] = None,
    details: Optional[dict] = None,
    ip: Optional[str] = None,
    user_agent: Optional[str] = None,
    correlation_id: Optional[str] = None,
    severity: str = "info",
) -> None:
    doc = {
        "id": new_id(),
        "action": action,
        "entity_type": entity_type,
        "entity_id": entity_id,
        "actor_id": (actor or {}).get("id"),
        "actor_email": (actor or {}).get("email"),
        "actor_role": (actor or {}).get("role"),
        "details": details or {},
        "ip": ip,
        "user_agent": user_agent,
        "correlation_id": correlation_id,
        "severity": severity,
        "created_at": now_utc(),
    }
    await db.audit_logs.insert_one(doc)
    logger.info("AUDIT %s %s %s by %s", action, entity_type, entity_id, doc["actor_email"])
