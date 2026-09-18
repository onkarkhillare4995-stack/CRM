"""Idempotent seeding of roles, admin, and demo accounts. No hard-coded prod passwords —
all credentials come from environment."""
import logging
from pathlib import Path
from datetime import timedelta
from core.config import settings
from core.security import hash_password, verify_password
from models.entities import new_id, now_utc
from services.permission_service import seed_roles

logger = logging.getLogger("app.seed")

DEMO_TEAM_ID = "team-east"
DEMO_LEAD_EMAIL = "teamlead@oaksphere.demo"
DEMO_LEAD_PASSWORD = "TeamLead@123"
DEMO_RECRUITER_EMAIL = "recruiter@oaksphere.demo"
DEMO_RECRUITER_PASSWORD = "Recruiter@123"
DEMO_RECRUITER2_EMAIL = "recruiter2@oaksphere.demo"
DEMO_RECRUITER2_PASSWORD = "Recruiter@456"


async def _upsert_user(db, *, email, name, password, role, team_id=None, manager_id=None):
    existing = await db.users.find_one({"email": email})
    if existing is None:
        doc = {
            "id": new_id(), "email": email, "name": name,
            "password_hash": hash_password(password), "role": role,
            "phone": None, "team_id": team_id, "manager_id": manager_id,
            "is_active": True, "permission_overrides": {"allow": [], "deny": []},
            "avatar_url": None, "last_login_at": None,
            "created_at": now_utc(), "updated_at": now_utc(),
            "created_by": "system", "updated_by": "system",
        }
        await db.users.insert_one(doc)
        logger.info("Seeded %s user %s", role, email)
        return doc
    # keep admin password in sync with env
    if role == "admin" and not verify_password(password, existing.get("password_hash", "")):
        await db.users.update_one({"email": email}, {"$set": {"password_hash": hash_password(password)}})
    return existing


async def run_seed(db) -> None:
    await seed_roles(db)

    admin = await _upsert_user(
        db, email=settings.admin_email, name="Administrator",
        password=settings.admin_password, role="admin",
    )

    lead = recruiter = None
    if settings.seed_demo:
        lead = await _upsert_user(
            db, email=DEMO_LEAD_EMAIL, name="Taylor Reed (Team Leader)",
            password=DEMO_LEAD_PASSWORD, role="team_leader", team_id=DEMO_TEAM_ID,
        )
        recruiter = await _upsert_user(
            db, email=DEMO_RECRUITER_EMAIL, name="Jordan Blake (Recruiter)",
            password=DEMO_RECRUITER_PASSWORD, role="recruiter",
            team_id=DEMO_TEAM_ID, manager_id=lead["id"],
        )
        recruiter2 = await _upsert_user(
            db, email=DEMO_RECRUITER2_EMAIL, name="Sam Rivera (Recruiter)",
            password=DEMO_RECRUITER2_PASSWORD, role="recruiter",
            team_id=DEMO_TEAM_ID, manager_id=lead["id"],
        )
        await seed_recruitment(db, recruiter, recruiter2)

    _write_credentials(admin, lead, recruiter)
    await _backfill_next_followup(db)


async def _backfill_next_followup(db) -> None:
    """Idempotent: set each lead's next_followup_at from its earliest pending follow-up."""
    pipeline = [{"$match": {"status": "pending"}},
                {"$group": {"_id": "$lead_id", "due": {"$min": "$due_at"}}}]
    async for row in db.followups.aggregate(pipeline):
        await db.leads.update_one({"id": row["_id"], "next_followup_at": {"$in": [None]}},
                                  {"$set": {"next_followup_at": row["due"]}})
        await db.leads.update_one({"id": row["_id"], "next_followup_at": {"$exists": False}},
                                  {"$set": {"next_followup_at": row["due"]}})


async def seed_recruitment(db, jordan, sam) -> None:
    """Deterministic demo dataset for Dashboard/My Day. Idempotent (skips if leads exist)."""
    if await db.leads.count_documents({}) > 0:
        return
    now = now_utc()
    today = now
    yesterday = now - timedelta(days=1)

    def lead(owner, name, status, phone, outcome=None, calls=0, priority="medium"):
        return {
            "id": new_id(), "name": name, "phone": phone,
            "phone_normalized": "".join(c for c in phone if c.isdigit())[-10:],
            "email": None, "source": "seed", "role_applied": "Sales Executive",
            "priority": priority, "status": status, "status_changed_at": now,
            "owner_id": owner["id"], "team_id": owner.get("team_id"), "tags": [],
            "notes": None, "last_call_outcome": outcome, "call_count": calls,
            "last_activity_at": now, "status_history": [{"status": status, "at": now, "by": "system"}],
            "created_at": now, "updated_at": now, "created_by": "system", "updated_by": "system",
            "seed": True,
        }

    leads = []
    # Jordan: 5 new(never called), 2 contacted(1 no_answer), 3 interested, 2 lineup,
    #         2 selected, 1 joined, 1 not_interested, 1 rejected  => 17 total
    for i in range(5):
        leads.append(lead(jordan, f"Fresh J{i+1}", "new", f"90000000{i:02d}", priority="high" if i < 2 else "medium"))
    leads.append(lead(jordan, "Contacted J1", "contacted", "9111111101", outcome="no_answer", calls=1))
    leads.append(lead(jordan, "Contacted J2", "contacted", "9111111102", outcome="connected", calls=1))
    for i in range(3):
        leads.append(lead(jordan, f"Interested J{i+1}", "interested", f"92222220{i}", outcome="interested", calls=2))
    for i in range(2):
        leads.append(lead(jordan, f"Lineup J{i+1}", "lineup", f"93333330{i}", outcome="connected", calls=2))
    for i in range(2):
        leads.append(lead(jordan, f"Selected J{i+1}", "selected", f"94444440{i}", calls=3))
    leads.append(lead(jordan, "Joined J1", "joined", "9555555501", calls=4))
    leads.append(lead(jordan, "NotInterested J1", "not_interested", "9666666601", outcome="not_interested", calls=1))
    leads.append(lead(jordan, "Rejected J1", "rejected", "9777777701", calls=2))
    # Sam: 3 new, 1 interested, 1 joined => 5 total
    for i in range(3):
        leads.append(lead(sam, f"Fresh S{i+1}", "new", f"98000000{i:02d}"))
    leads.append(lead(sam, "Interested S1", "interested", "9822222201", outcome="interested", calls=1))
    leads.append(lead(sam, "Joined S1", "joined", "9855555501", calls=3))
    await db.leads.insert_many(leads)

    # Calls today for Jordan: 4 calls, 2 connected
    calls = []
    for i, conn in enumerate([True, True, False, False]):
        calls.append({"id": new_id(), "lead_id": leads[i]["id"], "recruiter_id": jordan["id"],
                      "by": jordan["id"], "outcome": "connected" if conn else "no_answer",
                      "notes": None, "duration_seconds": 60 if conn else 0, "connected": conn,
                      "created_at": today, "seed": True})
    await db.calls.insert_many(calls)

    # Follow-ups: 2 overdue + 3 today (all pending) for Jordan
    fus = []
    for i in range(2):
        fus.append({"id": new_id(), "lead_id": leads[i]["id"], "lead_name": leads[i]["name"],
                    "recruiter_id": jordan["id"], "due_at": yesterday, "status": "pending",
                    "notes": "overdue", "created_at": now, "created_by": "system", "seed": True})
    for i in range(3):
        fus.append({"id": new_id(), "lead_id": leads[i]["id"], "lead_name": leads[i]["name"],
                    "recruiter_id": jordan["id"], "due_at": today, "status": "pending",
                    "notes": "today", "created_at": now, "created_by": "system", "seed": True})
    await db.followups.insert_many(fus)

    # Tasks: 2 pending for Jordan
    await db.tasks.insert_many([
        {"id": new_id(), "title": f"Prepare shortlist {i+1}", "owner_id": jordan["id"],
         "lead_id": None, "due_at": today, "priority": "medium", "status": "pending",
         "created_at": now, "created_by": "system", "seed": True} for i in range(2)
    ])

    # Interviews: 2 scheduled (today) + 1 attended for Jordan
    ivs = [{"id": new_id(), "lead_id": leads[10]["id"], "lead_name": leads[10]["name"],
            "recruiter_id": jordan["id"], "scheduled_at": today, "mode": "phone",
            "status": "scheduled", "notes": None, "created_at": today, "created_by": "system", "seed": True},
           {"id": new_id(), "lead_id": leads[11]["id"], "lead_name": leads[11]["name"],
            "recruiter_id": jordan["id"], "scheduled_at": today, "mode": "phone",
            "status": "confirmed", "notes": None, "created_at": today, "created_by": "system", "seed": True},
           {"id": new_id(), "lead_id": leads[12]["id"], "lead_name": leads[12]["name"],
            "recruiter_id": jordan["id"], "scheduled_at": yesterday, "mode": "phone",
            "status": "attended", "notes": None, "created_at": yesterday, "created_by": "system", "seed": True}]
    await db.interviews.insert_many(ivs)

    # Joinings: 1 pending for Jordan
    await db.joinings.insert_one({"id": new_id(), "lead_id": leads[16]["id"], "lead_name": leads[16]["name"],
                                  "recruiter_id": jordan["id"], "joining_date": today + timedelta(days=3),
                                  "status": "pending", "notes": None, "created_at": now,
                                  "created_by": "system", "seed": True})
    logger.info("Seeded recruitment demo data: %d leads", len(leads))


def _write_credentials(admin, lead, recruiter) -> None:
    lines = [
        "# Test Credentials",
        "",
        "## Admin",
        f"- Email: {settings.admin_email}",
        f"- Password: {settings.admin_password}",
        "- Role: admin (full access)",
        "",
    ]
    if lead:
        lines += [
            "## Team Leader (demo)",
            f"- Email: {DEMO_LEAD_EMAIL}",
            f"- Password: {DEMO_LEAD_PASSWORD}",
            "- Role: team_leader (team scope)",
            "",
        ]
    if recruiter:
        lines += [
            "## Recruiter (demo)",
            f"- Email: {DEMO_RECRUITER_EMAIL}",
            f"- Password: {DEMO_RECRUITER_PASSWORD}",
            "- Role: recruiter (self scope)",
            "",
            "## Recruiter 2 (demo)",
            f"- Email: {DEMO_RECRUITER2_EMAIL}",
            f"- Password: {DEMO_RECRUITER2_PASSWORD}",
            "- Role: recruiter (self scope, same team)",
            "",
        ]
    lines += [
        "## Auth Endpoints",
        "- POST /api/auth/login",
        "- POST /api/auth/logout",
        "- GET  /api/auth/me",
        "- POST /api/auth/refresh",
        "- POST /api/auth/forgot-password",
        "- POST /api/auth/reset-password",
        "",
    ]
    try:
        Path("/app/memory").mkdir(parents=True, exist_ok=True)
        Path("/app/memory/test_credentials.md").write_text("\n".join(lines))
    except Exception as e:  # noqa
        logger.warning("Could not write test_credentials.md: %s", e)
