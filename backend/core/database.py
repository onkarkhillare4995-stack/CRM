from motor.motor_asyncio import AsyncIOMotorClient
from core.config import settings

client = AsyncIOMotorClient(settings.mongo_url)
db = client[settings.db_name]


async def ensure_indexes() -> None:
    # Auth / users
    await db.users.create_index("email", unique=True)
    await db.users.create_index("role")
    await db.users.create_index("manager_id")
    await db.users.create_index("team_id")
    await db.users.create_index("is_active")

    # Sessions (revocable) with TTL cleanup
    await db.sessions.create_index("user_id")
    await db.sessions.create_index("expires_at", expireAfterSeconds=0)

    # Password reset tokens (hashed, one-time, TTL)
    await db.password_reset_tokens.create_index("token_hash", unique=True)
    await db.password_reset_tokens.create_index("expires_at", expireAfterSeconds=0)

    # Login attempts (brute force)
    await db.login_attempts.create_index("identifier", unique=True)

    # Roles
    await db.roles.create_index("key", unique=True)

    # Audit logs (immutable, append-only)
    await db.audit_logs.create_index("created_at")
    await db.audit_logs.create_index("actor_id")
    await db.audit_logs.create_index("action")
    await db.audit_logs.create_index("entity_type")
    await db.audit_logs.create_index([("entity_type", 1), ("entity_id", 1)])

    # Org settings singleton
    await db.organization_settings.create_index("key", unique=True)

    # Recruitment
    await db.leads.create_index("owner_id")
    await db.leads.create_index("status")
    await db.leads.create_index("team_id")
    await db.leads.create_index("phone_normalized")
    await db.leads.create_index("last_call_outcome")
    await db.leads.create_index("created_at")
    await db.leads.create_index([("owner_id", 1), ("status", 1)])
    await db.calls.create_index([("recruiter_id", 1), ("created_at", 1)])
    await db.calls.create_index("lead_id")
    await db.followups.create_index([("recruiter_id", 1), ("status", 1), ("due_at", 1)])
    await db.followups.create_index("lead_id")
    await db.tasks.create_index([("owner_id", 1), ("status", 1)])
    await db.interviews.create_index([("recruiter_id", 1), ("status", 1)])
    await db.interviews.create_index("lead_id")
    await db.joinings.create_index([("recruiter_id", 1), ("status", 1)])
    await db.joinings.create_index("lead_id")
    await db.leads.create_index("lead_code")
    await db.leads.create_index("next_followup_at")
    await db.leads.create_index("source")
    await db.leads.create_index("tags")
    await db.notes.create_index([("lead_id", 1), ("created_at", -1)])
    await db.notes.create_index("author_id")
    await db.activities.create_index([("lead_id", 1), ("created_at", -1)])


async def close() -> None:
    client.close()
