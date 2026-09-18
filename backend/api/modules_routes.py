from fastapi import APIRouter, Depends, Request, Query, UploadFile, File, Form
from fastapi.responses import Response
import json
from core.database import db
from core.logging_config import correlation_id_ctx
from services import modules_service as ms, notify_service, audit_service, permission_service
from api.deps import get_current_user, require_permission, get_client_ip
from core.errors import AppError

router = APIRouter(tags=["modules"])


async def _perms(u):
    return await permission_service.get_effective_permissions(db, u)


async def _audit(user, request, action, etype, eid, details=None, severity="info"):
    await audit_service.record(db, actor=user, action=action, entity_type=etype, entity_id=eid,
                               details=details or {}, severity=severity,
                               ip=get_client_ip(request) if request else None,
                               correlation_id=correlation_id_ctx.get())


# ---------- Jobs ----------
@router.get("/jobs")
async def jobs(search: str = "", status: str = "", user=Depends(get_current_user)):
    return await ms.list_jobs(db, user, await _perms(user), search=search, status=status)

@router.post("/jobs")
async def create_job(payload: dict, request: Request, user=Depends(require_permission("jobs.manage"))):
    j = await ms.save_job(db, user, payload)
    await _audit(user, request, "jobs.create", "job", j["id"], {"title": j.get("title")})
    return j

@router.put("/jobs/{job_id}")
async def update_job(job_id: str, payload: dict, request: Request, user=Depends(require_permission("jobs.manage"))):
    j = await ms.save_job(db, user, payload, job_id)
    await _audit(user, request, "jobs.update", "job", job_id, {})
    return j

@router.delete("/jobs/{job_id}")
async def del_job(job_id: str, request: Request, user=Depends(require_permission("jobs.manage"))):
    await _audit(user, request, "jobs.archive", "job", job_id, {}, "warning")
    return await ms.archive_job(db, job_id)


# ---------- Clients ----------
@router.get("/clients")
async def clients(search: str = "", user=Depends(get_current_user)):
    return await ms.list_clients(db, user, await _perms(user), search=search)

@router.post("/clients")
async def create_client(payload: dict, request: Request, user=Depends(require_permission("clients.manage"))):
    c = await ms.save_client(db, user, payload)
    await _audit(user, request, "clients.create", "client", c["id"], {"name": c.get("name")})
    return c

@router.put("/clients/{cid}")
async def update_client(cid: str, payload: dict, request: Request, user=Depends(require_permission("clients.manage"))):
    c = await ms.save_client(db, user, payload, cid)
    await _audit(user, request, "clients.update", "client", cid, {})
    return c

@router.delete("/clients/{cid}")
async def del_client(cid: str, request: Request, user=Depends(require_permission("clients.manage"))):
    await _audit(user, request, "clients.archive", "client", cid, {}, "warning")
    return await ms.archive_client(db, cid)


# ---------- Vendors ----------
@router.get("/vendors")
async def vendors(search: str = "", stage: str = "", user=Depends(require_permission("vendors.manage"))):
    return await ms.list_vendors(db, user, await _perms(user), search=search, stage=stage)

@router.get("/vendors/summary")
async def vendors_summary(user=Depends(require_permission("vendors.manage"))):
    return await ms.vendor_summary(db, user, await _perms(user))

@router.post("/vendors")
async def create_vendor(payload: dict, request: Request, user=Depends(require_permission("vendors.manage"))):
    v = await ms.save_vendor(db, user, await _perms(user), payload)
    await _audit(user, request, "vendors.create", "vendor", v["id"], {"company": v.get("company"), "stage": v.get("stage")})
    return v

@router.put("/vendors/{vid}")
async def update_vendor(vid: str, payload: dict, request: Request, user=Depends(require_permission("vendors.manage"))):
    v = await ms.save_vendor(db, user, await _perms(user), payload, vid)
    await _audit(user, request, "vendors.update", "vendor", vid, {"stage": v.get("stage")})
    return v

@router.delete("/vendors/{vid}")
async def del_vendor(vid: str, request: Request, user=Depends(require_permission("vendors.manage"))):
    await _audit(user, request, "vendors.delete", "vendor", vid, {}, "warning")
    return await ms.delete_vendor(db, user, await _perms(user), vid)


# ---------- Templates (unified) ----------
@router.get("/templates")
async def templates(channel: str = "", search: str = "", user=Depends(get_current_user)):
    return await ms.list_templates(db, channel=channel, search=search)

@router.post("/templates")
async def create_template(payload: dict, request: Request, user=Depends(require_permission("templates.manage"))):
    t = await ms.save_template(db, user, payload)
    await _audit(user, request, "templates.create", "template", t["id"], {"name": t.get("name")})
    return t

@router.put("/templates/{tid}")
async def update_template(tid: str, payload: dict, request: Request, user=Depends(require_permission("templates.manage"))):
    t = await ms.save_template(db, user, payload, tid)
    await _audit(user, request, "templates.update", "template", tid, {})
    return t

@router.delete("/templates/{tid}")
async def del_template(tid: str, request: Request, user=Depends(require_permission("templates.manage"))):
    await _audit(user, request, "templates.delete", "template", tid, {}, "warning")
    return await ms.delete_template(db, tid)


# ---------- Applications ----------
@router.get("/applications")
async def applications(search: str = "", status: str = "all", user=Depends(get_current_user)):
    return await ms.list_applications(db, user, await _perms(user), search=search, status=status)

@router.put("/applications/{aid}/status")
async def app_status(aid: str, payload: dict, request: Request, user=Depends(require_permission("leads.edit"))):
    a = await ms.update_application_status(db, aid, payload.get("status"))
    await _audit(user, request, "applications.status", "application", aid, {"status": payload.get("status")})
    return a

@router.post("/applications/{aid}/convert")
async def app_convert(aid: str, payload: dict, request: Request, user=Depends(require_permission("leads.create"))):
    res = await ms.convert_application(db, user, await _perms(user), aid,
                                       assign_to=payload.get("assign_to"),
                                       create_followup=payload.get("create_followup", True))
    await _audit(user, request, "applications.convert", "application", aid,
                 {"converted": res.get("converted"), "lead_id": res.get("lead", {}).get("id")})
    return res

@router.delete("/applications/{aid}")
async def app_delete(aid: str, request: Request, user=Depends(require_permission("leads.delete"))):
    await _audit(user, request, "applications.archive", "application", aid, {}, "warning")
    return await ms.archive_application(db, aid)


# ---------- Lead Inbox ----------
@router.get("/lead-inbox")
async def lead_inbox(search: str = "", source: str = "all", user=Depends(get_current_user)):
    perms = await _perms(user)
    if not ({"leads.view_all", "leads.view_own"} & perms) and user.get("role") != "admin":
        raise AppError("forbidden", "Missing permission", 403)
    return await ms.lead_inbox(db, user, perms, search=search, source=source)


# ---------- Reports ----------
@router.get("/reports")
async def reports(tab: str = Query("leaderboard"), user=Depends(require_permission("reports.view"))):
    return await ms.reports(db, user, await _perms(user), tab=tab)


# ---------- Action Required ----------
@router.get("/action-required")
async def action_required(user=Depends(get_current_user)):
    perms = await _perms(user)
    if not ({"recruiters.view", "users.manage"} & perms) and user.get("role") != "admin":
        raise AppError("forbidden", "Missing permission", 403)
    return await ms.action_required(db, user, perms)


# ---------- Integrations ----------
@router.get("/integrations")
async def integrations(user=Depends(require_permission("integrations.manage"))):
    return await ms.list_integrations(db)

@router.put("/integrations/{key}")
async def save_integration(key: str, payload: dict, request: Request, user=Depends(require_permission("integrations.manage"))):
    r = await ms.save_integration(db, user, key, payload)
    await _audit(user, request, "integrations.configure", "integration", key, {"key": key}, "warning")
    return r

@router.post("/integrations/{key}/test")
async def test_integration(key: str, user=Depends(require_permission("integrations.manage"))):
    return await ms.test_integration(db, key)

@router.post("/integrations/{key}/disconnect")
async def disconnect_integration(key: str, request: Request, user=Depends(require_permission("integrations.manage"))):
    await _audit(user, request, "integrations.disconnect", "integration", key, {"key": key}, "warning")
    return await ms.disconnect_integration(db, key)


# ---------- Settings (org + lists) ----------
@router.get("/org-settings")
async def get_org(user=Depends(get_current_user)):
    return await ms.get_org_settings(db)

@router.put("/org-settings")
async def update_org(payload: dict, request: Request, user=Depends(require_permission("settings.manage"))):
    res = await ms.update_org_settings(db, user, payload)
    await _audit(user, request, "settings.update", "settings", "org", res, "warning")
    return res


# ---------- Tags ----------
@router.get("/tags")
async def tags(user=Depends(get_current_user)):
    return await ms.list_tags(db)

@router.post("/tags")
async def create_tag(payload: dict, request: Request, user=Depends(get_current_user)):
    perms = await _perms(user)
    if "settings.manage" not in perms and "leads.edit" not in perms and user.get("role") != "admin":
        raise AppError("forbidden", "Not allowed", 403)
    t = await ms.save_tag(db, payload)
    await _audit(user, request, "tags.create", "tag", t["id"], {"name": t.get("name")})
    return t

@router.put("/tags/{tid}")
async def update_tag(tid: str, payload: dict, request: Request, user=Depends(require_permission("settings.manage"))):
    t = await ms.save_tag(db, payload, tid)
    await _audit(user, request, "tags.update", "tag", tid, {})
    return t

@router.delete("/tags/{tid}")
async def delete_tag(tid: str, request: Request, user=Depends(require_permission("settings.manage"))):
    await _audit(user, request, "tags.delete", "tag", tid, {}, "warning")
    return await ms.delete_tag(db, tid)


# ---------- Global Search ----------
@router.get("/search")
async def global_search(q: str = "", user=Depends(get_current_user)):
    return await ms.global_search(db, user, await _perms(user), q)


# ---------- Notifications ----------
@router.get("/notifications")
async def notifications(unread: bool = False, user=Depends(get_current_user)):
    return await notify_service.list_for(db, user, only_unread=unread)

@router.get("/notifications/unread-count")
async def notif_unread(user=Depends(get_current_user)):
    return {"count": await notify_service.unread_count(db, user)}

@router.post("/notifications/{nid}/read")
async def notif_read(nid: str, user=Depends(get_current_user)):
    return await notify_service.mark_read(db, user, nid)

@router.post("/notifications/read-all")
async def notif_read_all(user=Depends(get_current_user)):
    return await notify_service.mark_all_read(db, user)


# ---------- Import ----------
@router.get("/import/template")
async def import_template(user=Depends(require_permission("imports.run"))):
    data = ms.import_template_xlsx()
    return Response(content=data, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": "attachment; filename=lead_import_template.xlsx"})

@router.post("/import/preview")
async def import_preview(request: Request, file: UploadFile = File(...), user=Depends(require_permission("imports.run"))):
    content = await file.read()
    res = await ms.import_preview(db, user, await _perms(user), file.filename, content)
    await _audit(user, request, "imports.preview", "import", res["batch_id"], {"rows": res["row_count"]})
    return res

@router.post("/import/commit")
async def import_commit(payload: dict, request: Request, user=Depends(require_permission("imports.run"))):
    res = await ms.import_commit(db, user, await _perms(user), payload.get("batch_id"),
                                 payload.get("mapping", {}), payload.get("rules", {}))
    await _audit(user, request, "imports.commit", "import", payload.get("batch_id"), res, "warning")
    return res
