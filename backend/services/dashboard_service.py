"""Dashboard aggregations from source-of-truth collections (no manual counters)."""
from datetime import datetime, timezone, timedelta
from services import scope_service


def _owner_query(field, ids):
    return {} if ids is None else {field: {"$in": ids}}


async def compute(db, actor, perms, start, end, recruiter_id=None):
    ids = await scope_service.recruiter_scope_ids(db, actor, perms)
    if recruiter_id:
        ids = [recruiter_id] if (ids is None or recruiter_id in ids) else ["__none__"]

    lead_q = _owner_query("owner_id", ids)
    call_q = _owner_query("recruiter_id", ids)
    fu_q = _owner_query("recruiter_id", ids)
    iv_q = _owner_query("recruiter_id", ids)
    rng = {"$gte": start, "$lt": end}

    async def leads(extra):
        return await db.leads.count_documents({**lead_q, **extra})

    kpis = {
        "fresh_leads": await leads({"status": "new"}),
        "todays_followups": await db.followups.count_documents({**fu_q, "status": "pending", "due_at": rng}),
        "overdue_followups": await db.followups.count_documents({**fu_q, "status": "pending", "due_at": {"$lt": start}}),
        "no_answer": await leads({"last_call_outcome": "no_answer"}),
        "interested": await leads({"status": "interested"}),
        "interviews": await db.interviews.count_documents({**iv_q, "status": {"$in": ["scheduled", "confirmed"]}}),
        "selected": await leads({"status": "selected"}),
        "joined": await leads({"status": "joined"}),
        "rejected_lost": await leads({"status": {"$in": ["rejected", "not_interested"]}}),
        "calls_today": await db.calls.count_documents({**call_q, "created_at": rng}),
        "connected": await db.calls.count_documents({**call_q, "created_at": rng, "connected": True}),
        "leads_added_today": await leads({"created_at": rng}),
    }

    funnel = []
    for st in ["new", "contacted", "interested", "lineup", "selected", "joined"]:
        funnel.append({"status": st, "count": await leads({"status": st})})

    # Per-recruiter comparison + leaderboard
    recruiter_ids = ids
    if recruiter_ids is None:
        recruiter_ids = [u["id"] async for u in db.users.find(
            {"role": {"$in": ["recruiter", "team_leader"]}}, {"id": 1, "_id": 0})]
    users = await db.users.find({"id": {"$in": recruiter_ids}}, {"_id": 0, "id": 1, "name": 1, "role": 1}).to_list(500)
    umap = {u["id"]: u for u in users}

    comparison = []
    for rid in recruiter_ids:
        u = umap.get(rid)
        if not u:
            continue
        comparison.append({
            "recruiter_id": rid, "recruiter": u["name"], "role": u["role"],
            "leads": await db.leads.count_documents({"owner_id": rid, "created_at": rng}),
            "calls": await db.calls.count_documents({"recruiter_id": rid, "created_at": rng}),
            "connected": await db.calls.count_documents({"recruiter_id": rid, "created_at": rng, "connected": True}),
            "followups": await db.followups.count_documents({"recruiter_id": rid, "status": "done", "completed_at": rng}),
            "lineups": await db.interviews.count_documents({"recruiter_id": rid, "created_at": rng}),
            "attendance": await db.interviews.count_documents({"recruiter_id": rid, "status": "attended"}),
            "selected": await db.leads.count_documents({"owner_id": rid, "status": "selected"}),
            "joined": await db.leads.count_documents({"owner_id": rid, "status": "joined"}),
        })
    leaderboard = sorted(comparison, key=lambda r: (r["joined"], r["selected"]), reverse=True)[:5]

    scope_label = {"admin": "Organization Wide", "team_leader": "Team Scope"}.get(
        actor.get("role"), "My Pipeline")
    return {
        "scope_label": scope_label, "kpis": kpis, "funnel": funnel,
        "comparison": comparison, "leaderboard": leaderboard,
        "range": {"start": start.isoformat(), "end": end.isoformat()},
        "can_filter_recruiter": ids is None or len(ids) > 1,
    }
