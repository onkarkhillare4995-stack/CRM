from fastapi import APIRouter, Depends, Request, Query
from fastapi.responses import Response
import csv
import io
from core.database import db
from core.logging_config import correlation_id_ctx
from models.recruitment import (
    LeadCreate, LeadUpdate, StatusChange, CallCreate, DispositionCreate, FollowupCreate,
    FollowupUpdate, TagsUpdate, NoteCreate, NoteUpdate, AssignRequest, TransferRequest,
    AutoDistributeRequest, TaskCreate, TaskUpdate, InterviewCreate, InterviewUpdate,
    JoiningCreate, JoiningUpdate,
)
from services import recruitment_service as rs, audit_service, permission_service
from api.deps import get_current_user, require_permission, get_client_ip

router = APIRouter(tags=["recruitment"])


@router.get("/recruiters")
async def list_recruiters(user: dict = Depends(require_permission("recruiters.view"))):
    from services import user_service
    return await user_service.list_recruiters(db, user)


async def _perms(user):
    return await permission_service.get_effective_permissions(db, user)


async def _audit(user, request, action, entity_type, entity_id, details=None, severity="info"):
    await audit_service.record(db, actor=user, action=action, entity_type=entity_type,
                               entity_id=entity_id, details=details or {}, severity=severity,
                               ip=get_client_ip(request) if request else None,
                               correlation_id=correlation_id_ctx.get())


def _require(perms, user, perm):
    if perm not in perms and user.get("role") != "admin":
        from core.errors import AppError
        raise AppError("forbidden", f"Missing permission: {perm}", 403)


# ---------------- Leads: static routes FIRST ----------------
@router.get("/leads")
async def list_leads(
    status: str = Query(""), search: str = Query(""), outcome: str = Query(""),
    priority: str = Query(""), source: str = Query(""), tag: str = Query(""),
    view: str = Query(""), recruiter_id: str = Query(""),
    sort_by: str = Query("last_activity_at"), sort_dir: str = Query("desc"),
    page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
    user: dict = Depends(get_current_user),
):
    perms = await _perms(user)
    if not ({"leads.view_all", "leads.view_own"} & perms) and user.get("role") != "admin":
        from core.errors import AppError
        raise AppError("forbidden", "Missing permission: leads.view_own", 403)
    return await rs.list_leads(db, user, perms, status=status, search=search, outcome=outcome,
                               priority=priority, source=source, tag=tag, view=view,
                               recruiter_id=recruiter_id, sort_by=sort_by, sort_dir=sort_dir,
                               page=page, page_size=page_size)


@router.get("/leads/export")
async def export_leads(
    status: str = Query(""), search: str = Query(""), outcome: str = Query(""),
    priority: str = Query(""), source: str = Query(""), tag: str = Query(""),
    view: str = Query(""), recruiter_id: str = Query(""),
    user: dict = Depends(require_permission("leads.export")),
):
    perms = await _perms(user)
    rows = await rs.export_leads(db, user, perms, status=status, search=search, outcome=outcome,
                                 priority=priority, source=source, tag=tag, view=view,
                                 recruiter_id=recruiter_id)
    cols = ["lead_code", "name", "phone", "alt_phone", "email", "city", "status", "priority",
            "source", "role_applied", "client", "job", "call_count", "last_call_outcome",
            "next_followup_at", "created_at"]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(cols)
    for r in rows:
        w.writerow([r.get(c, "") for c in cols])
    await _audit(user, None, "leads.export", "lead", None, {"count": len(rows)})
    return Response(content=buf.getvalue(), media_type="text/csv",
                    headers={"Content-Disposition": "attachment; filename=leads_export.csv"})


@router.post("/leads/check-duplicate")
async def check_duplicate(payload: dict, user: dict = Depends(get_current_user)):
    perms = await _perms(user)
    return await rs.check_duplicate(db, user, perms, payload.get("phone", ""))


@router.post("/leads/assign")
async def assign_leads(payload: AssignRequest, request: Request,
                       user: dict = Depends(require_permission("leads.assign"))):
    perms = await _perms(user)
    result = await rs.assign_leads(db, user, perms, payload.lead_ids, payload.to_owner_id)
    await _audit(user, request, "leads.assign", "lead", None, result, severity="warning")
    return result


@router.post("/leads/transfer")
async def transfer(payload: TransferRequest, request: Request,
                   user: dict = Depends(require_permission("leads.transfer"))):
    perms = await _perms(user)
    result = await rs.transfer_leads(db, user, perms, payload.lead_ids, payload.to_owner_id)
    await _audit(user, request, "leads.transfer", "lead", None, result, severity="warning")
    return result


@router.post("/leads/auto-distribute")
async def auto_distribute(payload: AutoDistributeRequest, request: Request,
                          user: dict = Depends(require_permission("leads.auto_distribute"))):
    perms = await _perms(user)
    result = await rs.auto_distribute(db, user, perms, payload.lead_ids, payload.recruiter_ids)
    await _audit(user, request, "leads.auto_distribute", "lead", None, result, severity="warning")
    return result


@router.post("/leads")
async def create_lead(payload: LeadCreate, request: Request,
                      user: dict = Depends(require_permission("leads.create"))):
    perms = await _perms(user)
    lead = await rs.create_lead(db, user, perms, payload)
    await _audit(user, request, "leads.create", "lead", lead["id"],
                 {"name": lead["name"], "owner_id": lead["owner_id"], "code": lead.get("lead_code")})
    return lead


# ---------------- Leads: dynamic routes ----------------
@router.get("/leads/{lead_id}")
async def get_lead(lead_id: str, user: dict = Depends(get_current_user)):
    perms = await _perms(user)
    return await rs.get_lead(db, user, perms, lead_id)


@router.patch("/leads/{lead_id}")
async def update_lead(lead_id: str, payload: LeadUpdate, request: Request,
                      user: dict = Depends(require_permission("leads.edit"))):
    perms = await _perms(user)
    lead, changes = await rs.update_lead(db, user, perms, lead_id, payload)
    await _audit(user, request, "leads.update", "lead", lead_id, {"changes": changes})
    return lead


@router.delete("/leads/{lead_id}")
async def delete_lead(lead_id: str, request: Request,
                      user: dict = Depends(require_permission("leads.delete"))):
    perms = await _perms(user)
    lead = await rs.get_lead(db, user, perms, lead_id)  # asserts access
    await db.leads.update_one({"id": lead_id}, {"$set": {"archived": True, "status": lead["status"]}})
    await rs.write_activity(db, lead_id, "edited", user, "Lead archived", {})
    await _audit(user, request, "leads.delete", "lead", lead_id, {"name": lead["name"]}, severity="warning")
    return {"archived": True}


@router.post("/leads/{lead_id}/status")
async def change_status(lead_id: str, payload: StatusChange, request: Request,
                        user: dict = Depends(require_permission("leads.edit"))):
    perms = await _perms(user)
    lead, prev = await rs.transition_status(db, user, perms, lead_id, payload.status, payload.note,
                                            closure_reason=payload.closure_reason,
                                            expected_joining_date=payload.expected_joining_date)
    await _audit(user, request, "leads.status", "lead", lead_id, {"from": prev, "to": payload.status})
    return lead


@router.post("/leads/{lead_id}/calls")
async def log_call(lead_id: str, payload: CallCreate, request: Request,
                   user: dict = Depends(require_permission("calls.log"))):
    perms = await _perms(user)
    call = await rs.log_call(db, user, perms, lead_id, payload)
    await _audit(user, request, "calls.log", "lead", lead_id, {"outcome": payload.outcome})
    return call


@router.post("/leads/{lead_id}/disposition")
async def disposition(lead_id: str, payload: DispositionCreate, request: Request,
                      user: dict = Depends(require_permission("calls.log"))):
    perms = await _perms(user)
    lead = await rs.dispose(db, user, perms, lead_id, payload)
    await _audit(user, request, "calls.disposition", "lead", lead_id,
                 {"outcome": payload.outcome, "status": lead["status"]})
    return lead


@router.post("/leads/{lead_id}/whatsapp")
async def log_whatsapp(lead_id: str, user: dict = Depends(get_current_user)):
    perms = await _perms(user)
    return await rs.log_whatsapp(db, user, perms, lead_id)


@router.put("/leads/{lead_id}/tags")
async def set_tags(lead_id: str, payload: TagsUpdate, request: Request,
                   user: dict = Depends(require_permission("leads.edit"))):
    perms = await _perms(user)
    lead = await rs.set_tags(db, user, perms, lead_id, payload.tags)
    await _audit(user, request, "leads.tags", "lead", lead_id, {"tags": lead["tags"]})
    return lead


# ---- Notes ----
@router.get("/leads/{lead_id}/notes")
async def list_notes(lead_id: str, user: dict = Depends(get_current_user)):
    perms = await _perms(user)
    return await rs.list_notes(db, user, perms, lead_id)


@router.post("/leads/{lead_id}/notes")
async def add_note(lead_id: str, payload: NoteCreate, request: Request,
                   user: dict = Depends(require_permission("leads.edit"))):
    perms = await _perms(user)
    note = await rs.add_note(db, user, perms, lead_id, payload.body)
    await _audit(user, request, "leads.note_add", "lead", lead_id, {"note_id": note["id"]})
    return note


@router.put("/notes/{note_id}")
async def update_note(note_id: str, payload: NoteUpdate, request: Request,
                      user: dict = Depends(require_permission("leads.edit"))):
    perms = await _perms(user)
    note = await rs.update_note(db, user, perms, note_id, payload.body)
    await _audit(user, request, "leads.note_edit", "note", note_id, {})
    return note


@router.delete("/notes/{note_id}")
async def delete_note(note_id: str, request: Request,
                      user: dict = Depends(require_permission("leads.edit"))):
    perms = await _perms(user)
    res = await rs.delete_note(db, user, perms, note_id)
    await _audit(user, request, "leads.note_delete", "note", note_id, {}, severity="warning")
    return res


# ---- Activity & follow-up history ----
@router.get("/leads/{lead_id}/activities")
async def list_activities(lead_id: str, user: dict = Depends(get_current_user)):
    perms = await _perms(user)
    return await rs.list_activities(db, user, perms, lead_id)


@router.get("/leads/{lead_id}/followups")
async def lead_followups(lead_id: str, user: dict = Depends(get_current_user)):
    perms = await _perms(user)
    return await rs.list_lead_followups(db, user, perms, lead_id)


# ---------------- Follow-ups ----------------
@router.get("/followups")
async def list_followups(scope: str = Query("all"), user: dict = Depends(require_permission("followups.manage"))):
    perms = await _perms(user)
    return await rs.list_followups(db, user, perms, scope=scope)


@router.post("/leads/{lead_id}/followups")
async def add_followup(lead_id: str, payload: FollowupCreate, request: Request,
                       user: dict = Depends(require_permission("followups.manage"))):
    perms = await _perms(user)
    fu = await rs.add_followup(db, user, perms, lead_id, payload)
    await _audit(user, request, "followups.create", "lead", lead_id, {"due_at": str(payload.due_at)})
    return fu


@router.put("/followups/{followup_id}")
async def update_followup(followup_id: str, payload: FollowupUpdate, request: Request,
                          user: dict = Depends(require_permission("followups.manage"))):
    perms = await _perms(user)
    fu = await rs.update_followup(db, user, perms, followup_id, payload)
    await _audit(user, request, "followups.update", "followup", followup_id, {"status": fu.get("status")})
    return fu


# ---------------- Tasks ----------------
@router.get("/tasks")
async def list_tasks(status: str = Query(""), user: dict = Depends(require_permission("tasks.manage"))):
    perms = await _perms(user)
    return await rs.list_tasks(db, user, perms, status=status)


@router.post("/tasks")
async def create_task(payload: TaskCreate, request: Request,
                      user: dict = Depends(require_permission("tasks.manage"))):
    perms = await _perms(user)
    task = await rs.create_task(db, user, perms, payload)
    await _audit(user, request, "tasks.create", "task", task["id"], {"title": task["title"]})
    return task


@router.put("/tasks/{task_id}")
async def update_task(task_id: str, payload: TaskUpdate, request: Request,
                      user: dict = Depends(require_permission("tasks.manage"))):
    perms = await _perms(user)
    task = await rs.update_task(db, user, perms, task_id, payload)
    await _audit(user, request, "tasks.update", "task", task_id, {"status": task.get("status")})
    return task


# ---------------- Interviews ----------------
@router.get("/interviews")
async def list_interviews(user: dict = Depends(require_permission("interviews.manage"))):
    perms = await _perms(user)
    return await rs.list_interviews(db, user, perms)


@router.post("/leads/{lead_id}/interviews")
async def create_interview(lead_id: str, payload: InterviewCreate, request: Request,
                           user: dict = Depends(require_permission("interviews.manage"))):
    perms = await _perms(user)
    iv = await rs.create_interview(db, user, perms, lead_id, payload)
    await _audit(user, request, "interviews.create", "lead", lead_id, {"scheduled_at": str(payload.scheduled_at)})
    return iv


@router.put("/interviews/{interview_id}")
async def update_interview(interview_id: str, payload: InterviewUpdate, request: Request,
                           user: dict = Depends(require_permission("interviews.manage"))):
    perms = await _perms(user)
    iv = await rs.update_interview(db, user, perms, interview_id, payload)
    await _audit(user, request, "interviews.update", "interview", interview_id, {"status": iv.get("status")})
    return iv


# ---------------- Joinings ----------------
@router.get("/joinings")
async def list_joinings(user: dict = Depends(require_permission("joinings.manage"))):
    perms = await _perms(user)
    return await rs.list_joinings(db, user, perms)


@router.post("/leads/{lead_id}/joinings")
async def create_joining(lead_id: str, payload: JoiningCreate, request: Request,
                         user: dict = Depends(require_permission("joinings.manage"))):
    perms = await _perms(user)
    jn = await rs.create_joining(db, user, perms, lead_id, payload)
    await _audit(user, request, "joinings.create", "lead", lead_id, {})
    return jn


@router.put("/joinings/{joining_id}")
async def update_joining(joining_id: str, payload: JoiningUpdate, request: Request,
                         user: dict = Depends(require_permission("joinings.manage"))):
    perms = await _perms(user)
    jn = await rs.update_joining(db, user, perms, joining_id, payload)
    await _audit(user, request, "joinings.update", "joining", joining_id, {"status": jn.get("status")})
    return jn
