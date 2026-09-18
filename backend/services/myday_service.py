"""My Day: prioritized work queues derived from live data. Completion = data-driven."""
from services import scope_service


async def build(db, actor, perms, start, end):
    ids = await scope_service.recruiter_scope_ids(db, actor, perms)
    lead_q = {} if ids is None else {"owner_id": {"$in": ids}}
    fu_q = {} if ids is None else {"recruiter_id": {"$in": ids}}
    iv_q = {} if ids is None else {"recruiter_id": {"$in": ids}}
    task_q = {} if ids is None else {"owner_id": {"$in": ids}}
    jn_q = {} if ids is None else {"recruiter_id": {"$in": ids}}
    rng = {"$gte": start, "$lt": end}

    async def leads_list(extra, limit=50):
        rows = await db.leads.find({**lead_q, **extra}, {"_id": 0}).sort("last_activity_at", -1).limit(limit).to_list(limit)
        return rows

    overdue = await db.followups.find({**fu_q, "status": "pending", "due_at": {"$lt": start}}, {"_id": 0}).sort("due_at", 1).limit(50).to_list(50)
    today_fu = await db.followups.find({**fu_q, "status": "pending", "due_at": rng}, {"_id": 0}).sort("due_at", 1).limit(50).to_list(50)
    never_called = await leads_list({"status": "new", "call_count": 0})
    high_priority = await leads_list({"priority": "high", "status": {"$in": ["new", "contacted", "interested", "lineup"]}})
    interview_conf = await db.interviews.find({**iv_q, "status": {"$in": ["scheduled", "confirmed"]}, "scheduled_at": rng}, {"_id": 0}).sort("scheduled_at", 1).limit(50).to_list(50)
    joining_conf = await db.joinings.find({**jn_q, "status": {"$in": ["pending", "confirmed"]}}, {"_id": 0}).sort("joining_date", 1).limit(50).to_list(50)
    pending_tasks = await db.tasks.find({**task_q, "status": "pending"}, {"_id": 0}).sort("due_at", 1).limit(50).to_list(50)

    steps = [
        {"key": "overdue_followups", "title": "Overdue Follow-ups", "kind": "followup", "items": overdue},
        {"key": "today_followups", "title": "Today's Follow-ups", "kind": "followup", "items": today_fu},
        {"key": "never_called", "title": "Never-Called Fresh Leads", "kind": "lead", "items": never_called},
        {"key": "high_priority", "title": "High-Priority Calls", "kind": "lead", "items": high_priority},
        {"key": "interview_confirmations", "title": "Interview Confirmations", "kind": "interview", "items": interview_conf},
        {"key": "joining_confirmations", "title": "Joining Confirmations", "kind": "joining", "items": joining_conf},
        {"key": "pending_tasks", "title": "Pending Tasks", "kind": "task", "items": pending_tasks},
    ]
    for s in steps:
        s["count"] = len(s["items"])
        s["complete"] = s["count"] == 0

    total = len(steps)
    done = sum(1 for s in steps if s["complete"])
    total_items = sum(s["count"] for s in steps)
    return {
        "steps": steps,
        "progress_percent": round(done / total * 100) if total else 100,
        "completed_steps": done, "total_steps": total, "total_items": total_items,
    }
