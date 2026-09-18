"""Centralized recruitment business logic: leads, status engine, calls, dispositions,
follow-ups, notes, activities, tasks, interviews, joinings. All access is scoped via
scope_service. Immutable activity records are written by backend services only."""
from datetime import timezone, timedelta
from core.errors import AppError
from core.transactions import atomic
from models.entities import new_id, now_utc
from models.recruitment import (
    LEAD_STATUSES, ALLOWED_TRANSITIONS, NEGATIVE_STATUSES, ACTIVE_STATUSES,
    FINAL_STATUSES, REASON_REQUIRED_STATUSES, CALL_OUTCOMES, DISPOSITION_OUTCOMES,
    CONNECTED_OUTCOMES, CALLBACK_OUTCOMES, AUTO_FINAL_MAP, FOLLOWUP_STATUS, TASK_STATUS,
    INTERVIEW_STATUS, JOINING_STATUS, LEAD_PRIORITIES, GENDERS, INTERVIEW_TYPES,
)
from services import scope_service


def clean(doc: dict) -> dict:
    d = dict(doc)
    d.pop("_id", None)
    return d


def _as_utc(dt):
    if dt is not None and getattr(dt, "tzinfo", None) is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _normalize_phone(phone: str) -> str:
    # Normalize for matching/dedupe ONLY — never mutate the stored display phone.
    return "".join(ch for ch in (phone or "") if ch.isdigit())[-10:]


def _lead_code() -> str:
    return "LD-" + new_id().split("-")[0].upper()


LEAD_EDITABLE = ("name", "phone", "alt_phone", "email", "city", "age", "gender",
                 "qualification", "experience", "current_salary", "expected_salary",
                 "notice_period", "source", "role_applied", "priority", "client",
                 "job", "tags", "notes")


# ---------------- Activity (immutable) ----------------
async def write_activity(db, lead_id, type_, actor, summary, data=None, session=None):
    doc = {"id": new_id(), "lead_id": lead_id, "type": type_, "summary": summary,
           "data": data or {}, "actor_id": (actor or {}).get("id"),
           "actor_name": (actor or {}).get("name"), "actor_role": (actor or {}).get("role"),
           "created_at": now_utc()}
    await db.activities.insert_one(doc, session=session)


async def list_activities(db, actor, perms, lead_id):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise AppError("not_found", "Lead not found", 404)
    await scope_service.assert_lead_access(db, actor, perms, lead)
    return await db.activities.find({"lead_id": lead_id}, {"_id": 0}).sort("created_at", -1).to_list(500)


# ---------------- Leads ----------------
async def _resolve_owner(db, actor, perms, requested_owner):
    if requested_owner and requested_owner != actor["id"]:
        if "leads.assign" not in perms and actor.get("role") != "admin":
            raise AppError("forbidden", "You cannot assign leads to others", 403)
        ids = await scope_service.recruiter_scope_ids(db, actor, perms)
        if ids is not None and requested_owner not in ids:
            raise AppError("forbidden", "Target owner is outside your scope", 403)
        target = await db.users.find_one({"id": requested_owner, "is_active": True})
        if not target:
            raise AppError("invalid_owner", "Owner not found or inactive", 400)
        return requested_owner
    return actor["id"]


async def _view_query(db, actor, perms, view):
    """Return an extra query dict for a saved-view chip (server-side)."""
    now = now_utc()
    if not view or view == "all":
        return {}
    if view == "fresh":
        return {"status": "new"}
    if view == "not_called":
        return {"call_count": {"$lte": 0}}
    if view == "no_answer":
        return {"last_call_outcome": {"$in": ["no_answer", "busy", "switched_off", "unreachable"]}}
    if view == "interested":
        return {"status": "interested"}
    if view == "hot":
        return {"priority": "high"}
    if view == "selected":
        return {"status": "selected"}
    if view == "joined":
        return {"status": "joined"}
    if view == "interviews":
        return {"status": "lineup"}
    if view == "rejected_lost":
        return {"status": {"$in": NEGATIVE_STATUSES}}
    if view == "no_followup":
        return {"status": {"$in": ACTIVE_STATUSES},
                "$or": [{"next_followup_at": None}, {"next_followup_at": {"$exists": False}}]}
    if view == "overdue":
        return {"status": {"$in": ACTIVE_STATUSES}, "next_followup_at": {"$ne": None, "$lt": now}}
    if view == "todays_followups":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)
        return {"next_followup_at": {"$gte": start, "$lt": end}}
    if view == "attendance_pending":
        ids = await db.interviews.distinct("lead_id", {"status": {"$in": ["scheduled", "confirmed"]}})
        return {"id": {"$in": ids or ["__none__"]}}
    if view == "joining_this_week":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=7)
        ids = await db.joinings.distinct("lead_id", {"joining_date": {"$gte": start, "$lt": end}})
        return {"id": {"$in": ids or ["__none__"]}}
    return {}


async def list_leads(db, actor, perms, *, status="", search="", outcome="", priority="",
                     source="", tag="", recruiter_id="", view="", sort_by="last_activity_at",
                     sort_dir="desc", page=1, page_size=50):
    scope_q = await scope_service.leads_filter(db, actor, perms, recruiter_id or None)
    query = dict(scope_q)
    if status:
        query["status"] = {"$in": status.split(",")}
    if outcome:
        query["last_call_outcome"] = outcome
    if priority:
        query["priority"] = priority
    if source:
        query["source"] = source
    if tag:
        query["tags"] = tag
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"phone": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"city": {"$regex": search, "$options": "i"}},
        ]
    view_q = await _view_query(db, actor, perms, view)
    query.update(view_q)

    allowed_sort = {"last_activity_at", "created_at", "name", "next_followup_at",
                    "priority", "status"}
    sb = sort_by if sort_by in allowed_sort else "last_activity_at"
    direction = 1 if sort_dir == "asc" else -1

    total = await db.leads.count_documents(query)
    rows = (await db.leads.find(query, {"_id": 0}).sort(sb, direction)
            .skip((page - 1) * page_size).limit(page_size).to_list(page_size))
    await _attach_flags(db, actor, perms, rows, scope_q)
    return {"items": rows, "total": total, "page": page, "page_size": page_size}


async def _duplicate_set(db, scope_q):
    pipeline = [{"$match": scope_q},
                {"$group": {"_id": "$phone_normalized", "c": {"$sum": 1}}},
                {"$match": {"c": {"$gt": 1}, "_id": {"$nin": ["", None]}}}]
    return {r["_id"] async for r in db.leads.aggregate(pipeline)}


async def _attach_flags(db, actor, perms, rows, scope_q):
    if not rows:
        return
    dupset = await _duplicate_set(db, scope_q)
    now = now_utc()
    for r in rows:
        pn = r.get("phone_normalized") or ""
        nf = _as_utc(r.get("next_followup_at"))
        st = r.get("status")
        r["flags"] = {
            "invalid_phone": len(pn) != 10,
            "duplicate_phone": bool(pn) and pn in dupset,
            "overdue": bool(nf and nf < now and st in ACTIVE_STATUSES),
            "no_followup": st in ACTIVE_STATUSES and not nf,
        }


async def get_lead(db, actor, perms, lead_id):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise AppError("not_found", "Lead not found", 404)
    await scope_service.assert_lead_access(db, actor, perms, lead)
    scope_q = await scope_service.leads_filter(db, actor, perms, None)
    d = clean(lead)
    await _attach_flags(db, actor, perms, [d], scope_q)
    created = _as_utc(lead.get("created_at")) or now_utc()
    d["lead_age_days"] = (now_utc() - created).days
    owner = await db.users.find_one({"id": lead.get("owner_id")}, {"_id": 0, "name": 1, "email": 1})
    d["owner_name"] = (owner or {}).get("name")
    return d


async def check_duplicate(db, actor, perms, phone):
    norm = _normalize_phone(phone)
    if not norm:
        return {"duplicate": False}
    scope_q = await scope_service.leads_filter(db, actor, perms, None)
    q = dict(scope_q)
    q["phone_normalized"] = norm
    match = await db.leads.find_one(q, {"_id": 0})
    if not match:
        return {"duplicate": False}
    owner = await db.users.find_one({"id": match.get("owner_id")}, {"_id": 0, "name": 1})
    return {"duplicate": True, "lead": {
        "id": match["id"], "name": match["name"], "phone": match["phone"],
        "status": match["status"], "city": match.get("city"),
        "owner_name": (owner or {}).get("name"), "lead_code": match.get("lead_code"),
    }}


async def create_lead(db, actor, perms, data):
    if data.priority not in LEAD_PRIORITIES:
        raise AppError("bad_request", "Invalid priority", 400)
    if data.gender and data.gender.lower() not in GENDERS:
        raise AppError("bad_request", "Invalid gender", 400)
    owner = await _resolve_owner(db, actor, perms, data.owner_id)
    owner_user = await db.users.find_one({"id": owner})
    now = now_utc()
    lead_id = new_id()
    doc = {
        "id": lead_id, "lead_code": _lead_code(), "name": data.name.strip(),
        "phone": data.phone.strip(), "phone_normalized": _normalize_phone(data.phone),
        "alt_phone": (data.alt_phone or "").strip() or None,
        "email": (data.email or "").lower().strip() or None, "city": data.city,
        "age": data.age, "gender": (data.gender or "").lower() or None,
        "qualification": data.qualification, "experience": data.experience,
        "current_salary": data.current_salary, "expected_salary": data.expected_salary,
        "notice_period": data.notice_period, "source": data.source or "manual",
        "role_applied": data.role_applied, "client": data.client, "job": data.job,
        "priority": data.priority, "status": "new", "status_changed_at": now,
        "owner_id": owner, "team_id": (owner_user or {}).get("team_id"),
        "tags": data.tags or [], "notes": data.notes,
        "last_call_outcome": None, "call_count": 0, "last_activity_at": now,
        "next_followup_at": None, "closure_reason": None, "expected_joining_at": None,
        "duplicate_flagged": bool(data.duplicate_ack),
        "status_history": [{"status": "new", "at": now, "by": actor["id"]}],
        "created_at": now, "updated_at": now, "created_by": actor["id"], "updated_by": actor["id"],
    }
    async with atomic() as s:
        await db.leads.insert_one(doc, session=s)
        await write_activity(db, lead_id, "created", actor, f"Lead created ({doc['lead_code']})",
                             {"owner_id": owner}, session=s)
        if data.first_followup_at:
            fu = {"id": new_id(), "lead_id": lead_id, "lead_name": doc["name"],
                  "recruiter_id": owner, "due_at": data.first_followup_at, "status": "pending",
                  "reason": data.first_followup_reason or "First call", "notes": None,
                  "created_at": now, "created_by": actor["id"]}
            await db.followups.insert_one(fu, session=s)
            await db.leads.update_one({"id": lead_id}, {"$set": {"next_followup_at": data.first_followup_at}}, session=s)
            await write_activity(db, lead_id, "followup_scheduled", actor,
                                 f"First follow-up scheduled: {fu['reason']}",
                                 {"due_at": str(data.first_followup_at)}, session=s)
    return await get_lead(db, actor, perms, lead_id)


async def update_lead(db, actor, perms, lead_id, data):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise AppError("not_found", "Lead not found", 404)
    await scope_service.assert_lead_access(db, actor, perms, lead)
    updates, changed = {}, []
    payload = data.model_dump(exclude_unset=True)
    # owner reassignment (permission-guarded)
    if "owner_id" in payload and payload["owner_id"] and payload["owner_id"] != lead.get("owner_id"):
        new_owner = await _resolve_owner(db, actor, perms, payload["owner_id"])
        owner_user = await db.users.find_one({"id": new_owner})
        updates["owner_id"] = new_owner
        updates["team_id"] = (owner_user or {}).get("team_id")
        changed.append("owner_id")
    for f in LEAD_EDITABLE:
        if f in payload and payload[f] is not None and payload[f] != lead.get(f):
            updates[f] = payload[f]
            changed.append(f)
            if f == "phone":
                updates["phone_normalized"] = _normalize_phone(payload[f])
            if f == "email":
                updates["email"] = (payload[f] or "").lower().strip() or None
            if f == "gender":
                updates["gender"] = (payload[f] or "").lower() or None
    if updates:
        updates["updated_at"] = now_utc(); updates["updated_by"] = actor["id"]
        updates["last_activity_at"] = now_utc()
        await db.leads.update_one({"id": lead_id}, {"$set": updates})
        await write_activity(db, lead_id, "edited", actor,
                             f"Lead edited: {', '.join(changed)}", {"fields": changed})
    return await get_lead(db, actor, perms, lead_id), changed


async def _recompute_next_followup(db, lead_id, session=None):
    fu = await db.followups.find({"lead_id": lead_id, "status": "pending"}, {"_id": 0, "due_at": 1}) \
        .sort("due_at", 1).limit(1).to_list(1)
    nf = fu[0]["due_at"] if fu else None
    await db.leads.update_one({"id": lead_id}, {"$set": {"next_followup_at": nf}}, session=session)


async def transition_status(db, actor, perms, lead_id, new_status, note=None,
                            closure_reason=None, expected_joining_date=None, session=None,
                            _skip_access=False):
    if new_status not in LEAD_STATUSES:
        raise AppError("bad_request", f"Invalid status: {new_status}", 400)
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise AppError("not_found", "Lead not found", 404)
    if not _skip_access:
        await scope_service.assert_lead_access(db, actor, perms, lead)
    cur = lead.get("status", "new")
    if new_status != cur and new_status not in ALLOWED_TRANSITIONS.get(cur, []) \
            and new_status not in NEGATIVE_STATUSES:
        raise AppError("invalid_transition", f"Cannot move from {cur} to {new_status}", 400)
    if new_status in REASON_REQUIRED_STATUSES and not closure_reason and not lead.get("closure_reason"):
        raise AppError("reason_required", f"A closure reason is required to mark {new_status}", 400)
    if new_status == "selected" and not expected_joining_date and not lead.get("expected_joining_at"):
        raise AppError("joining_required", "Expected joining date is required for Selected", 400)
    now = now_utc()
    setf = {"status": new_status, "status_changed_at": now, "last_activity_at": now,
            "updated_at": now, "updated_by": actor["id"]}
    if closure_reason:
        setf["closure_reason"] = closure_reason
    if expected_joining_date:
        setf["expected_joining_at"] = expected_joining_date
    await db.leads.update_one({"id": lead_id}, {
        "$set": setf,
        "$push": {"status_history": {"status": new_status, "at": now, "by": actor["id"], "note": note}},
    }, session=session)
    await write_activity(db, lead_id, "status_change", actor,
                         f"Status {cur} → {new_status}", {"from": cur, "to": new_status,
                         "reason": closure_reason}, session=session)
    return clean(await db.leads.find_one({"id": lead_id})), cur


async def log_call(db, actor, perms, lead_id, data):
    if data.outcome not in CALL_OUTCOMES:
        raise AppError("bad_request", "Invalid call outcome", 400)
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise AppError("not_found", "Lead not found", 404)
    await scope_service.assert_lead_access(db, actor, perms, lead)
    now = now_utc()
    call = {"id": new_id(), "lead_id": lead_id, "recruiter_id": lead["owner_id"], "by": actor["id"],
            "outcome": data.outcome, "notes": data.notes, "duration_seconds": data.duration_seconds or 0,
            "connected": data.outcome in ("connected", "interested", "not_interested", "callback"),
            "created_at": now}
    await db.calls.insert_one(call)
    setf = {"last_call_outcome": data.outcome, "last_activity_at": now, "updated_at": now}
    if data.outcome == "interested" and lead.get("status") in ("new", "contacted"):
        setf["status"] = "interested"; setf["status_changed_at"] = now
    elif data.outcome == "not_interested":
        setf["status"] = "not_interested"; setf["status_changed_at"] = now
    elif lead.get("status") == "new":
        setf["status"] = "contacted"; setf["status_changed_at"] = now
    await db.leads.update_one({"id": lead_id}, {"$set": setf, "$inc": {"call_count": 1}})
    await write_activity(db, lead_id, "call", actor, f"Call logged: {data.outcome}",
                         {"outcome": data.outcome, "duration": call["duration_seconds"]})
    return clean(call)


# ---------------- Disposition engine (transactional) ----------------
async def dispose(db, actor, perms, lead_id, data):
    if data.outcome not in DISPOSITION_OUTCOMES:
        raise AppError("bad_request", "Invalid disposition outcome", 400)
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise AppError("not_found", "Lead not found", 404)
    await scope_service.assert_lead_access(db, actor, perms, lead)
    cur = lead.get("status", "new")

    # ---- Resolve target status (validation phase, before any write) ----
    if data.status_override:
        if data.status_override not in LEAD_STATUSES:
            raise AppError("bad_request", "Invalid status override", 400)
        target = data.status_override
    elif data.outcome in AUTO_FINAL_MAP:
        target = AUTO_FINAL_MAP[data.outcome]
    elif data.outcome == "connected_interested":
        target = "interested" if cur in ("new", "contacted") else cur
    elif data.outcome == "interview_scheduled" or data.interview:
        target = "lineup"
    else:
        target = cur

    connected = data.outcome in CONNECTED_OUTCOMES
    is_final = target in FINAL_STATUSES

    # ---- Validation rules ----
    if data.outcome in CALLBACK_OUTCOMES and not data.next_followup_at:
        raise AppError("followup_required", "A next follow-up is required for callbacks", 400)
    if (data.outcome == "interview_scheduled" or data.interview):
        iv = data.interview
        if not iv:
            raise AppError("interview_required", "Interview details are required", 400)
        if iv.type not in INTERVIEW_TYPES:
            raise AppError("bad_request", "Invalid interview type", 400)
    if target == "selected" and not data.expected_joining_date:
        raise AppError("joining_required", "Expected joining date is required for Selected", 400)
    if target in REASON_REQUIRED_STATUSES and not data.closure_reason:
        raise AppError("reason_required", f"A closure reason is required for {target}", 400)
    # active leads must keep a valid next follow-up
    existing_nf = _as_utc(lead.get("next_followup_at"))
    if not is_final and target in ACTIVE_STATUSES and not data.next_followup_at \
            and not existing_nf and not data.interview:
        raise AppError("followup_required",
                       "This lead is still active — schedule the next follow-up", 400)

    now = now_utc()
    async with atomic() as s:
        # 1. call record
        call = {"id": new_id(), "lead_id": lead_id, "recruiter_id": lead["owner_id"], "by": actor["id"],
                "outcome": data.outcome, "connected": connected, "notes": data.notes,
                "duration_seconds": data.duration_seconds or 0, "created_at": now}
        await db.calls.insert_one(call, session=s)
        await write_activity(db, lead_id, "call", actor, f"Call: {data.outcome}",
                             {"outcome": data.outcome, "duration": call["duration_seconds"],
                              "connected": connected}, session=s)

        # 2. lead base update
        setf = {"last_call_outcome": data.outcome, "last_activity_at": now,
                "updated_at": now, "updated_by": actor["id"]}
        if data.closure_reason:
            setf["closure_reason"] = data.closure_reason
        if data.expected_joining_date:
            setf["expected_joining_at"] = data.expected_joining_date
        await db.leads.update_one({"id": lead_id}, {"$set": setf, "$inc": {"call_count": 1}}, session=s)

        # 3. follow-up: complete/supersede existing pending, create new if provided
        pending = await db.followups.find({"lead_id": lead_id, "status": "pending"}).to_list(100)
        if data.next_followup_at:
            for p in pending:
                await db.followups.update_one({"id": p["id"]},
                    {"$set": {"status": "superseded", "completed_at": now}}, session=s)
            fu = {"id": new_id(), "lead_id": lead_id, "lead_name": lead["name"],
                  "recruiter_id": lead["owner_id"], "due_at": data.next_followup_at,
                  "status": "pending", "reason": data.next_followup_reason or "Follow-up",
                  "notes": None, "created_at": now, "created_by": actor["id"]}
            await db.followups.insert_one(fu, session=s)
            await write_activity(db, lead_id, "followup_scheduled", actor,
                                 f"Follow-up scheduled: {fu['reason']}",
                                 {"due_at": str(data.next_followup_at)}, session=s)
        elif connected:
            for p in pending:
                await db.followups.update_one({"id": p["id"]},
                    {"$set": {"status": "done", "completed_at": now}}, session=s)
                await write_activity(db, lead_id, "followup_completed", actor,
                                     "Follow-up completed", {}, session=s)

        # 4. interview
        if data.interview:
            iv = data.interview
            ivdoc = {"id": new_id(), "lead_id": lead_id, "lead_name": lead["name"],
                     "recruiter_id": lead["owner_id"], "scheduled_at": iv.scheduled_at,
                     "mode": iv.type, "type": iv.type, "client": iv.client, "job": iv.job,
                     "location": iv.location, "contact_person": iv.contact_person,
                     "status": "scheduled", "notes": iv.notes, "created_at": now,
                     "created_by": actor["id"]}
            await db.interviews.insert_one(ivdoc, session=s)
            await write_activity(db, lead_id, "interview", actor,
                                 f"Interview scheduled ({iv.type}) with {iv.client}",
                                 {"scheduled_at": str(iv.scheduled_at), "job": iv.job}, session=s)

        # 5. status change
        if target != cur:
            await db.leads.update_one({"id": lead_id}, {
                "$set": {"status": target, "status_changed_at": now},
                "$push": {"status_history": {"status": target, "at": now, "by": actor["id"],
                                             "note": data.notes}}}, session=s)
            await write_activity(db, lead_id, "status_change", actor,
                                 f"Status {cur} → {target}",
                                 {"from": cur, "to": target, "reason": data.closure_reason}, session=s)

        # 6. joining record
        if target == "selected" and data.expected_joining_date:
            existing = await db.joinings.find_one({"lead_id": lead_id})
            if existing:
                await db.joinings.update_one({"lead_id": lead_id},
                    {"$set": {"joining_date": data.expected_joining_date, "status": "pending"}}, session=s)
            else:
                await db.joinings.insert_one({"id": new_id(), "lead_id": lead_id,
                    "lead_name": lead["name"], "recruiter_id": lead["owner_id"],
                    "joining_date": data.expected_joining_date, "status": "pending",
                    "notes": None, "created_at": now, "created_by": actor["id"]}, session=s)
            await write_activity(db, lead_id, "joining", actor, "Joining record created",
                                 {"joining_date": str(data.expected_joining_date)}, session=s)

    await _recompute_next_followup(db, lead_id)
    return await get_lead(db, actor, perms, lead_id)


async def set_tags(db, actor, perms, lead_id, tags):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise AppError("not_found", "Lead not found", 404)
    await scope_service.assert_lead_access(db, actor, perms, lead)
    clean_tags = sorted({t.strip() for t in tags if t.strip()})
    await db.leads.update_one({"id": lead_id},
        {"$set": {"tags": clean_tags, "updated_at": now_utc(), "last_activity_at": now_utc()}})
    await write_activity(db, lead_id, "tag_change", actor, "Tags updated", {"tags": clean_tags})
    return await get_lead(db, actor, perms, lead_id)


async def log_whatsapp(db, actor, perms, lead_id):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise AppError("not_found", "Lead not found", 404)
    await scope_service.assert_lead_access(db, actor, perms, lead)
    await db.leads.update_one({"id": lead_id}, {"$set": {"last_activity_at": now_utc()}})
    await write_activity(db, lead_id, "whatsapp", actor, "WhatsApp message opened", {})
    return {"ok": True}


# ---------------- Bulk assign / transfer / auto-distribute ----------------
async def _authorize_bulk(db, actor, perms, lead_ids):
    leads = await db.leads.find({"id": {"$in": lead_ids}}).to_list(len(lead_ids) + 1)
    if len(leads) != len(set(lead_ids)):
        raise AppError("not_found", "Some leads were not found", 404)
    for l in leads:  # authorize EVERY selected record
        await scope_service.assert_lead_access(db, actor, perms, l)
    return leads


async def assign_leads(db, actor, perms, lead_ids, to_owner_id):
    target = await db.users.find_one({"id": to_owner_id, "is_active": True})
    if not target:
        raise AppError("invalid_owner", "Target recruiter not found or inactive", 400)
    ids = await scope_service.recruiter_scope_ids(db, actor, perms)
    if ids is not None and to_owner_id not in ids and actor.get("role") != "admin":
        raise AppError("forbidden", "Target owner is outside your scope", 403)
    leads = await _authorize_bulk(db, actor, perms, lead_ids)
    now = now_utc()
    async with atomic() as s:
        for l in leads:
            await db.leads.update_one({"id": l["id"]}, {
                "$set": {"owner_id": to_owner_id, "team_id": target.get("team_id"),
                         "updated_at": now, "updated_by": actor["id"], "last_activity_at": now},
                "$push": {"transfer_history": {"from": l["owner_id"], "to": to_owner_id,
                                               "at": now, "by": actor["id"]}}}, session=s)
            await write_activity(db, l["id"], "assignment", actor,
                                 f"Assigned to {target.get('name')}",
                                 {"from": l["owner_id"], "to": to_owner_id}, session=s)
    return {"assigned": len(leads), "to_owner_id": to_owner_id}


# transfer is an alias for assign (both re-authorize every record)
async def transfer_leads(db, actor, perms, lead_ids, to_owner_id):
    res = await assign_leads(db, actor, perms, lead_ids, to_owner_id)
    return {"transferred": res["assigned"], "to_owner_id": to_owner_id}


async def auto_distribute(db, actor, perms, lead_ids=None, recruiter_ids=None):
    # target pool: active recruiters within scope
    scope_ids = await scope_service.recruiter_scope_ids(db, actor, perms)
    pool_q = {"is_active": True, "role": {"$in": ["recruiter", "team_leader"]}}
    if scope_ids is not None:
        pool_q["id"] = {"$in": scope_ids}
    pool = await db.users.find(pool_q, {"_id": 0, "id": 1, "name": 1, "team_id": 1}).to_list(500)
    if recruiter_ids:
        pool = [u for u in pool if u["id"] in recruiter_ids]
    if not pool:
        raise AppError("no_recruiters", "No eligible recruiters in scope", 400)

    if lead_ids:
        leads = await _authorize_bulk(db, actor, perms, lead_ids)
    else:
        scope_q = await scope_service.leads_filter(db, actor, perms, None)
        leads = await db.leads.find(scope_q).sort("created_at", 1).to_list(2000)
    if not leads:
        raise AppError("no_leads", "No leads to distribute", 400)

    now = now_utc()
    result = {}
    async with atomic() as s:
        for i, l in enumerate(leads):
            tgt = pool[i % len(pool)]
            if tgt["id"] == l.get("owner_id"):
                continue
            await db.leads.update_one({"id": l["id"]}, {
                "$set": {"owner_id": tgt["id"], "team_id": tgt.get("team_id"),
                         "updated_at": now, "updated_by": actor["id"], "last_activity_at": now},
                "$push": {"transfer_history": {"from": l.get("owner_id"), "to": tgt["id"],
                                               "at": now, "by": actor["id"]}}}, session=s)
            await write_activity(db, l["id"], "assignment", actor,
                                 f"Auto-distributed to {tgt.get('name')}",
                                 {"to": tgt["id"]}, session=s)
            result[tgt["name"]] = result.get(tgt["name"], 0) + 1
    return {"distributed": sum(result.values()), "breakdown": result}


async def export_leads(db, actor, perms, **filters):
    """Return rows respecting scope + active filters (no pagination)."""
    filters.pop("page", None); filters.pop("page_size", None)
    data = await list_leads(db, actor, perms, page=1, page_size=100000, **filters)
    return data["items"]


# ---------------- Notes ----------------
async def add_note(db, actor, perms, lead_id, body):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise AppError("not_found", "Lead not found", 404)
    await scope_service.assert_lead_access(db, actor, perms, lead)
    now = now_utc()
    doc = {"id": new_id(), "lead_id": lead_id, "body": body.strip(),
           "author_id": actor["id"], "author_name": actor.get("name"),
           "author_role": actor.get("role"), "created_at": now, "updated_at": now}
    await db.notes.insert_one(doc)
    await db.leads.update_one({"id": lead_id}, {"$set": {"last_activity_at": now}})
    await write_activity(db, lead_id, "note", actor, "Note added", {"note_id": doc["id"]})
    return clean(doc)


async def list_notes(db, actor, perms, lead_id):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise AppError("not_found", "Lead not found", 404)
    await scope_service.assert_lead_access(db, actor, perms, lead)
    return await db.notes.find({"lead_id": lead_id}, {"_id": 0}).sort("created_at", -1).to_list(500)


def _can_mutate_note(actor, note):
    return actor.get("role") == "admin" or note.get("author_id") == actor["id"]


async def update_note(db, actor, perms, note_id, body):
    note = await db.notes.find_one({"id": note_id})
    if not note:
        raise AppError("not_found", "Note not found", 404)
    lead = await db.leads.find_one({"id": note["lead_id"]})
    await scope_service.assert_lead_access(db, actor, perms, lead or {"owner_id": None})
    if not _can_mutate_note(actor, note):
        raise AppError("forbidden", "You can only edit your own notes", 403)
    await db.notes.update_one({"id": note_id}, {"$set": {"body": body.strip(), "updated_at": now_utc()}})
    await write_activity(db, note["lead_id"], "note", actor, "Note edited", {"note_id": note_id})
    return clean(await db.notes.find_one({"id": note_id}))


async def delete_note(db, actor, perms, note_id):
    note = await db.notes.find_one({"id": note_id})
    if not note:
        raise AppError("not_found", "Note not found", 404)
    lead = await db.leads.find_one({"id": note["lead_id"]})
    await scope_service.assert_lead_access(db, actor, perms, lead or {"owner_id": None})
    if not _can_mutate_note(actor, note):
        raise AppError("forbidden", "You can only delete your own notes", 403)
    await db.notes.delete_one({"id": note_id})
    await write_activity(db, note["lead_id"], "note", actor, "Note deleted", {"note_id": note_id})
    return {"deleted": True}


# ---------------- Follow-ups ----------------
async def add_followup(db, actor, perms, lead_id, data):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise AppError("not_found", "Lead not found", 404)
    await scope_service.assert_lead_access(db, actor, perms, lead)
    now = now_utc()
    had_pending = await db.followups.count_documents({"lead_id": lead_id, "status": "pending"})
    async with atomic() as s:
        await db.followups.update_many({"lead_id": lead_id, "status": "pending"},
            {"$set": {"status": "superseded", "completed_at": now}}, session=s)
        doc = {"id": new_id(), "lead_id": lead_id, "lead_name": lead["name"],
               "recruiter_id": lead["owner_id"], "due_at": data.due_at, "status": "pending",
               "reason": data.reason or "Follow-up", "notes": data.notes,
               "created_at": now, "created_by": actor["id"]}
        await db.followups.insert_one(doc, session=s)
        await db.leads.update_one({"id": lead_id},
            {"$set": {"next_followup_at": data.due_at, "last_activity_at": now}}, session=s)
        await write_activity(db, lead_id, "followup_rescheduled" if had_pending else "followup_scheduled",
                             actor, f"Follow-up {'rescheduled' if had_pending else 'scheduled'}: {doc['reason']}",
                             {"due_at": str(data.due_at)}, session=s)
    return clean(doc)


async def update_followup(db, actor, perms, followup_id, data):
    fu = await db.followups.find_one({"id": followup_id})
    if not fu:
        raise AppError("not_found", "Follow-up not found", 404)
    lead = await db.leads.find_one({"id": fu["lead_id"]})
    await scope_service.assert_lead_access(db, actor, perms, lead or {"owner_id": fu["recruiter_id"]})
    updates = {}
    p = data.model_dump(exclude_unset=True)
    if p.get("status"):
        if p["status"] not in FOLLOWUP_STATUS:
            raise AppError("bad_request", "Invalid status", 400)
        updates["status"] = p["status"]
        if p["status"] == "done":
            updates["completed_at"] = now_utc()
            await write_activity(db, fu["lead_id"], "followup_completed", actor, "Follow-up completed", {})
    if p.get("due_at"):
        updates["due_at"] = p["due_at"]
    if p.get("reason"):
        updates["reason"] = p["reason"]
    if "notes" in p:
        updates["notes"] = p["notes"]
    await db.followups.update_one({"id": followup_id}, {"$set": updates})
    await _recompute_next_followup(db, fu["lead_id"])
    return clean(await db.followups.find_one({"id": followup_id}))


def _followup_display(fu, now):
    st = fu.get("status")
    if st == "pending" and _as_utc(fu.get("due_at")) and _as_utc(fu["due_at"]) < now:
        return "overdue"
    if st == "done":
        return "completed"
    return st


async def list_lead_followups(db, actor, perms, lead_id):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise AppError("not_found", "Lead not found", 404)
    await scope_service.assert_lead_access(db, actor, perms, lead)
    rows = await db.followups.find({"lead_id": lead_id}, {"_id": 0}).sort("due_at", -1).to_list(200)
    now = now_utc()
    for r in rows:
        r["display_status"] = _followup_display(r, now)
    return rows


async def list_followups(db, actor, perms, *, scope="all"):
    ids = await scope_service.recruiter_scope_ids(db, actor, perms)
    q = {} if ids is None else {"recruiter_id": {"$in": ids}}
    if scope == "pending":
        q["status"] = "pending"
    rows = await db.followups.find(q, {"_id": 0}).sort("due_at", 1).to_list(500)
    return rows


def _day_bounds(now):
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


async def followup_board(db, actor, perms, *, tab="due_today", search="", recruiter_id=""):
    ids = await scope_service.recruiter_scope_ids(db, actor, perms)
    base = {} if ids is None else {"recruiter_id": {"$in": ids}}
    if recruiter_id:
        if ids is not None and recruiter_id not in ids:
            base["recruiter_id"] = "__none__"
        else:
            base["recruiter_id"] = recruiter_id
    now = now_utc()
    ts, te = _day_bounds(now)
    tom_s, tom_e = te, te + timedelta(days=1)
    tabs = {
        "due_today": {**base, "status": "pending", "due_at": {"$gte": ts, "$lt": te}},
        "overdue": {**base, "status": "pending", "due_at": {"$lt": now}},
        "tomorrow": {**base, "status": "pending", "due_at": {"$gte": tom_s, "$lt": tom_e}},
        "upcoming": {**base, "status": "pending", "due_at": {"$gte": tom_e}},
        "missed": {**base, "status": "superseded"},
        "completed": {**base, "status": "done"},
    }
    counts = {}
    for k, q in tabs.items():
        counts[k] = await db.followups.count_documents(q)
    rows = await db.followups.find(tabs.get(tab, tabs["due_today"]), {"_id": 0}).sort("due_at", 1).to_list(500)
    # enrich with lead priority/status/phone (+ search filter)
    lead_ids = list({r["lead_id"] for r in rows})
    leads = {l["id"]: l for l in await db.leads.find({"id": {"$in": lead_ids}}).to_list(len(lead_ids) + 1)}
    out = []
    s = search.lower().strip()
    for r in rows:
        l = leads.get(r["lead_id"], {})
        if s and s not in (l.get("name", "").lower()) and s not in (l.get("phone", "")):
            continue
        r["priority"] = l.get("priority")
        r["lead_status"] = l.get("status")
        r["phone"] = l.get("phone")
        r["overdue"] = r.get("status") == "pending" and _as_utc(r.get("due_at")) and _as_utc(r["due_at"]) < now
        out.append(r)
    return {"items": out, "counts": counts, "tab": tab}


async def complete_followup(db, actor, perms, followup_id, data):
    fu = await db.followups.find_one({"id": followup_id})
    if not fu:
        raise AppError("not_found", "Follow-up not found", 404)
    lead = await db.leads.find_one({"id": fu["lead_id"]})
    await scope_service.assert_lead_access(db, actor, perms, lead or {"owner_id": fu["recruiter_id"]})

    if data.mode == "next":
        if not data.next_due_at:
            raise AppError("bad_request", "Next follow-up date/time is required", 400)
        if not (data.next_reason or "").strip():
            raise AppError("bad_request", "Next follow-up reason is required", 400)
    elif data.mode == "final":
        if not data.final_status or data.final_status not in LEAD_STATUSES:
            raise AppError("bad_request", "A valid final status is required", 400)
        if data.final_status in REASON_REQUIRED_STATUSES and not (data.closure_reason or "").strip():
            raise AppError("reason_required", f"A closure reason is required for {data.final_status}", 400)
        if data.final_status == "selected" and not data.expected_joining_date:
            raise AppError("joining_required", "Expected joining date is required for Selected", 400)
    else:
        raise AppError("bad_request", "Invalid completion mode", 400)

    now = now_utc()
    async with atomic() as s:
        await db.followups.update_one({"id": followup_id},
            {"$set": {"status": "done", "completed_at": now, "outcome": data.outcome,
                      "outcome_notes": data.notes}}, session=s)
        await write_activity(db, fu["lead_id"], "followup_completed", actor,
                             f"Follow-up completed{': ' + data.outcome if data.outcome else ''}",
                             {"outcome": data.outcome}, session=s)
        if data.mode == "next":
            ndoc = {"id": new_id(), "lead_id": fu["lead_id"], "lead_name": fu.get("lead_name"),
                    "recruiter_id": fu["recruiter_id"], "due_at": data.next_due_at, "status": "pending",
                    "reason": data.next_reason, "notes": None, "created_at": now, "created_by": actor["id"]}
            await db.followups.insert_one(ndoc, session=s)
            await db.leads.update_one({"id": fu["lead_id"]},
                {"$set": {"next_followup_at": data.next_due_at, "last_activity_at": now}}, session=s)
            await write_activity(db, fu["lead_id"], "followup_scheduled", actor,
                                 f"Next follow-up scheduled: {data.next_reason}",
                                 {"due_at": str(data.next_due_at)}, session=s)
    if data.mode == "final":
        await transition_status(db, actor, perms, fu["lead_id"], data.final_status,
                                note="Completed via follow-up", closure_reason=data.closure_reason,
                                expected_joining_date=data.expected_joining_date)
    await _recompute_next_followup(db, fu["lead_id"])
    return clean(await db.followups.find_one({"id": followup_id}))


async def delete_followup(db, actor, perms, followup_id):
    fu = await db.followups.find_one({"id": followup_id})
    if not fu:
        raise AppError("not_found", "Follow-up not found", 404)
    lead = await db.leads.find_one({"id": fu["lead_id"]})
    await scope_service.assert_lead_access(db, actor, perms, lead or {"owner_id": fu["recruiter_id"]})
    await db.followups.delete_one({"id": followup_id})
    await write_activity(db, fu["lead_id"], "followup_completed", actor, "Follow-up deleted", {})
    await _recompute_next_followup(db, fu["lead_id"])
    return {"deleted": True}


# ---------------- Tasks ----------------
async def list_tasks(db, actor, perms, *, status="", priority="", search=""):
    ids = await scope_service.recruiter_scope_ids(db, actor, perms)
    q = {} if ids is None else {"owner_id": {"$in": ids}}
    if status:
        q["status"] = status
    if priority:
        q["priority"] = priority
    if search:
        q["$or"] = [{"title": {"$regex": search, "$options": "i"}},
                    {"related_entity": {"$regex": search, "$options": "i"}}]
    return await db.tasks.find(q, {"_id": 0}).sort("due_at", 1).to_list(500)


async def task_summary(db, actor, perms):
    ids = await scope_service.recruiter_scope_ids(db, actor, perms)
    base = {} if ids is None else {"owner_id": {"$in": ids}}
    pending = await db.tasks.count_documents({**base, "status": {"$in": ["pending", "in_progress"]}})
    high = await db.tasks.count_documents({**base, "priority": "high", "status": {"$ne": "done"}})
    completed = await db.tasks.count_documents({**base, "status": "done"})
    return {"pending": pending, "high_priority": high, "completed": completed}


async def create_task(db, actor, perms, data):
    owner = data.owner_id or actor["id"]
    if owner != actor["id"]:
        ids = await scope_service.recruiter_scope_ids(db, actor, perms)
        if ids is not None and owner not in ids:
            raise AppError("forbidden", "Owner outside scope", 403)
    doc = {"id": new_id(), "title": data.title.strip(), "owner_id": owner,
           "category": data.category or "general_admin", "lead_id": data.lead_id,
           "related_entity": data.related_entity, "notes": data.notes,
           "due_at": data.due_at, "priority": data.priority, "status": "pending",
           "created_at": now_utc(), "created_by": actor["id"]}
    await db.tasks.insert_one(doc)
    return clean(doc)


async def update_task(db, actor, perms, task_id, data):
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise AppError("not_found", "Task not found", 404)
    ids = await scope_service.recruiter_scope_ids(db, actor, perms)
    if ids is not None and task["owner_id"] not in ids:
        raise AppError("forbidden", "Task outside scope", 403)
    p = data.model_dump(exclude_unset=True)
    if p.get("status") and p["status"] not in TASK_STATUS:
        raise AppError("bad_request", "Invalid status", 400)
    if p.get("status") == "done":
        p["completed_at"] = now_utc()
    if p.get("status") in ("pending", "in_progress"):
        p["completed_at"] = None
    await db.tasks.update_one({"id": task_id}, {"$set": p})
    return clean(await db.tasks.find_one({"id": task_id}))


async def delete_task(db, actor, perms, task_id):
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise AppError("not_found", "Task not found", 404)
    ids = await scope_service.recruiter_scope_ids(db, actor, perms)
    if ids is not None and task["owner_id"] not in ids:
        raise AppError("forbidden", "Task outside scope", 403)
    await db.tasks.delete_one({"id": task_id})
    return {"deleted": True}


# ---------------- Interviews ----------------
async def create_interview(db, actor, perms, lead_id, data):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise AppError("not_found", "Lead not found", 404)
    await scope_service.assert_lead_access(db, actor, perms, lead)
    doc = {"id": new_id(), "lead_id": lead_id, "lead_name": lead["name"],
           "recruiter_id": lead["owner_id"], "scheduled_at": data.scheduled_at,
           "mode": data.mode, "type": data.mode, "client": data.client, "job": data.job,
           "location": data.location, "contact_person": data.contact_person,
           "status": "scheduled", "notes": data.notes,
           "created_at": now_utc(), "created_by": actor["id"]}
    await db.interviews.insert_one(doc)
    await transition_status(db, actor, perms, lead_id, "lineup", note="Interview scheduled")
    await write_activity(db, lead_id, "interview", actor, "Interview scheduled",
                         {"scheduled_at": str(data.scheduled_at)})
    return clean(doc)


async def list_interviews(db, actor, perms):
    ids = await scope_service.recruiter_scope_ids(db, actor, perms)
    q = {} if ids is None else {"recruiter_id": {"$in": ids}}
    return await db.interviews.find(q, {"_id": 0}).sort("scheduled_at", 1).to_list(500)


async def update_interview(db, actor, perms, interview_id, data):
    iv = await db.interviews.find_one({"id": interview_id})
    if not iv:
        raise AppError("not_found", "Interview not found", 404)
    lead = await db.leads.find_one({"id": iv["lead_id"]})
    await scope_service.assert_lead_access(db, actor, perms, lead or {"owner_id": iv["recruiter_id"]})
    p = data.model_dump(exclude_unset=True)
    if p.get("status") and p["status"] not in INTERVIEW_STATUS:
        raise AppError("bad_request", "Invalid status", 400)
    await db.interviews.update_one({"id": interview_id}, {"$set": p})
    if p.get("status") == "selected":
        await transition_status(db, actor, perms, iv["lead_id"], "selected", note="Interview selected")
    elif p.get("status") == "rejected":
        await transition_status(db, actor, perms, iv["lead_id"], "rejected",
                                note="Interview rejected", closure_reason="Rejected at interview")
    return clean(await db.interviews.find_one({"id": interview_id}))


# ---------------- Joinings ----------------
async def create_joining(db, actor, perms, lead_id, data):
    lead = await db.leads.find_one({"id": lead_id})
    if not lead:
        raise AppError("not_found", "Lead not found", 404)
    await scope_service.assert_lead_access(db, actor, perms, lead)
    doc = {"id": new_id(), "lead_id": lead_id, "lead_name": lead["name"],
           "recruiter_id": lead["owner_id"], "joining_date": data.joining_date,
           "status": "pending", "notes": data.notes, "created_at": now_utc(), "created_by": actor["id"]}
    await db.joinings.insert_one(doc)
    await write_activity(db, lead_id, "joining", actor, "Joining record created", {})
    return clean(doc)


async def list_joinings(db, actor, perms):
    ids = await scope_service.recruiter_scope_ids(db, actor, perms)
    q = {} if ids is None else {"recruiter_id": {"$in": ids}}
    return await db.joinings.find(q, {"_id": 0}).sort("joining_date", 1).to_list(500)


async def update_joining(db, actor, perms, joining_id, data):
    jn = await db.joinings.find_one({"id": joining_id})
    if not jn:
        raise AppError("not_found", "Joining not found", 404)
    lead = await db.leads.find_one({"id": jn["lead_id"]})
    await scope_service.assert_lead_access(db, actor, perms, lead or {"owner_id": jn["recruiter_id"]})
    p = data.model_dump(exclude_unset=True)
    if p.get("status") and p["status"] not in JOINING_STATUS:
        raise AppError("bad_request", "Invalid status", 400)
    await db.joinings.update_one({"id": joining_id}, {"$set": p})
    if p.get("status") == "joined":
        await transition_status(db, actor, perms, jn["lead_id"], "joined", note="Candidate joined")
    return clean(await db.joinings.find_one({"id": joining_id}))
