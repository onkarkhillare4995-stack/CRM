"""End-to-end backend tests for OAKsphere Recruitment CRM prompts 3-6.
Covers: dashboard KPIs & scoping, My Day queues + live update, quick actions
(lead + task creation), notification unread count derivation, access-control
(users/roles/permissions/team/sessions), security (recruiter capability/scope
denials, self-escalation prevention), lead status engine + audit trail.
"""
import os
import time
import uuid
import pytest
import requests

_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not _URL:
    # fall back to frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for line in f:
                if line.startswith("REACT_APP_BACKEND_URL="):
                    _URL = line.strip().split("=", 1)[1]
                    break
    except FileNotFoundError:
        pass
assert _URL, "REACT_APP_BACKEND_URL not configured"
BASE = _URL.rstrip("/") + "/api"

ADMIN = ("okhillare23@gmail.com", "Admin@Oak2026")
TL = ("teamlead@oaksphere.demo", "TeamLead@123")
REC = ("recruiter@oaksphere.demo", "Recruiter@123")     # Jordan
REC2 = ("recruiter2@oaksphere.demo", "Recruiter@456")    # Sam


def _login(email, password):
    r = requests.post(f"{BASE}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def admin_tok():
    return _login(*ADMIN)["access_token"]


@pytest.fixture(scope="module")
def tl_tok():
    return _login(*TL)["access_token"]


@pytest.fixture(scope="module")
def rec_tok():
    d = _login(*REC)
    return d["access_token"], d["user"]["id"]


@pytest.fixture(scope="module")
def rec2_tok():
    d = _login(*REC2)
    return d["access_token"], d["user"]["id"]


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------- Dashboard ----------------

class TestDashboard:
    def test_admin_kpis_seeded(self, admin_tok):
        r = requests.get(f"{BASE}/dashboard/overview", headers=H(admin_tok))
        assert r.status_code == 200
        data = r.json()
        k = data["kpis"]
        # exact seeded values from spec
        assert k["fresh_leads"] == 8, k
        assert k["interested"] == 4, k
        assert k["selected"] == 2, k
        assert k["joined"] == 2, k
        assert k["calls_today"] == 4, k
        assert k["connected"] == 2, k
        assert k["leads_added_today"] == 22, k
        assert data["scope_label"] == "Organization Wide"
        assert data["can_filter_recruiter"] is True
        # funnel + leaderboard + comparison present
        assert isinstance(data["funnel"], list) and len(data["funnel"]) == 6
        assert isinstance(data["leaderboard"], list) and len(data["leaderboard"]) <= 5
        assert isinstance(data["comparison"], list) and len(data["comparison"]) >= 2

    def test_recruiter_scope_only_own(self, rec_tok):
        tok, rid = rec_tok
        r = requests.get(f"{BASE}/dashboard/overview", headers=H(tok))
        assert r.status_code == 200
        data = r.json()
        assert data["scope_label"] == "My Pipeline"
        assert data["can_filter_recruiter"] is False
        # Jordan has 17 leads => leads_added_today for today's seed = 17
        assert data["kpis"]["leads_added_today"] == 17, data["kpis"]

    def test_team_leader_scope_team(self, tl_tok):
        r = requests.get(f"{BASE}/dashboard/overview", headers=H(tl_tok))
        assert r.status_code == 200
        data = r.json()
        assert data["scope_label"] == "Team Scope"
        assert data["kpis"]["leads_added_today"] == 22, data["kpis"]

    def test_admin_recruiter_filter(self, admin_tok, rec_tok):
        _, rid = rec_tok
        r = requests.get(f"{BASE}/dashboard/overview",
                         headers=H(admin_tok), params={"recruiter_id": rid})
        assert r.status_code == 200
        assert r.json()["kpis"]["leads_added_today"] == 17

    def test_fresh_leads_link_filter(self, admin_tok):
        r = requests.get(f"{BASE}/leads", headers=H(admin_tok), params={"status": "new"})
        assert r.status_code == 200
        payload = r.json()
        items = payload.get("items") if isinstance(payload, dict) else payload
        assert all(l["status"] == "new" for l in items)
        assert len(items) == 8


# ---------------- My Day ----------------

class TestMyDay:
    def test_recruiter_myday_counts(self, rec_tok):
        tok, _ = rec_tok
        r = requests.get(f"{BASE}/my-day", headers=H(tok))
        assert r.status_code == 200
        d = r.json()
        counts = {s["key"]: s["count"] for s in d["steps"]}
        assert counts == {
            "overdue_followups": 2,
            "today_followups": 3,
            "never_called": 5,
            "high_priority": 2,
            "interview_confirmations": 2,
            "joining_confirmations": 1,
            "pending_tasks": 2,
        }, counts
        assert isinstance(d["progress_percent"], int)
        assert d["total_steps"] == 7

    def test_myday_live_update_on_followup_done(self, rec_tok):
        tok, _ = rec_tok
        before = requests.get(f"{BASE}/my-day", headers=H(tok)).json()
        today_step = next(s for s in before["steps"] if s["key"] == "today_followups")
        assert today_step["count"] >= 1
        fu_id = today_step["items"][0]["id"]

        u = requests.put(f"{BASE}/followups/{fu_id}",
                         headers=H(tok), json={"status": "done"})
        assert u.status_code == 200, u.text
        after = requests.get(f"{BASE}/my-day", headers=H(tok)).json()
        after_today = next(s for s in after["steps"] if s["key"] == "today_followups")
        assert after_today["count"] == today_step["count"] - 1


# ---------------- Quick Actions (Lead + Task creation) ----------------

class TestQuickActions:
    def test_create_lead_persists(self, rec_tok):
        tok, rid = rec_tok
        payload = {
            "name": f"TEST_Lead_{uuid.uuid4().hex[:6]}",
            "phone": f"+91900000{int(time.time()) % 10000:04d}",
            "source": "referral",
            "priority": "medium",
        }
        c = requests.post(f"{BASE}/leads", headers=H(tok), json=payload)
        assert c.status_code == 200, c.text
        lead = c.json()
        assert lead["name"] == payload["name"]
        assert lead["owner_id"] == rid
        # appears in list
        g = requests.get(f"{BASE}/leads", headers=H(tok), params={"search": payload["name"]})
        items = g.json().get("items") if isinstance(g.json(), dict) else g.json()
        assert any(x["id"] == lead["id"] for x in items)

    def test_create_task_persists(self, rec_tok):
        tok, rid = rec_tok
        payload = {"title": f"TEST_Task_{uuid.uuid4().hex[:6]}", "due_at": "2026-06-01T10:00:00Z"}
        c = requests.post(f"{BASE}/tasks", headers=H(tok), json=payload)
        assert c.status_code == 200, c.text
        t = c.json()
        g = requests.get(f"{BASE}/tasks", headers=H(tok))
        assert g.status_code == 200
        assert any(x["id"] == t["id"] for x in g.json())


# ---------------- Access Control ----------------

class TestAccessControl:
    def test_users_list_and_permissions_catalog(self, admin_tok):
        r = requests.get(f"{BASE}/users", headers=H(admin_tok))
        assert r.status_code == 200
        assert len(r.json()) >= 4
        cat = requests.get(f"{BASE}/roles/permissions/catalog", headers=H(admin_tok))
        assert cat.status_code == 200
        body = cat.json()
        assert "groups" in body and "all" in body
        assert "leads.view_all" in body["all"]
        assert "users.manage" in body["all"]

    def test_effective_permissions_endpoint(self, admin_tok, rec_tok):
        _, rid = rec_tok
        r = requests.get(f"{BASE}/users/{rid}/effective-permissions", headers=H(admin_tok))
        assert r.status_code == 200
        d = r.json()
        assert d["role"] == "recruiter"
        assert "leads.view_own" in d["effective"]
        assert "users.manage" not in d["effective"]

    def test_role_lifecycle_clone_rename_reset_update_delete(self, admin_tok):
        key = f"test_role_{uuid.uuid4().hex[:6]}"
        # clone from recruiter
        c = requests.post(f"{BASE}/roles/recruiter/clone",
                          headers=H(admin_tok), json={"key": key, "name": "TEST Role"})
        assert c.status_code == 200, c.text
        # rename
        rn = requests.put(f"{BASE}/roles/{key}/rename",
                          headers=H(admin_tok), json={"name": "TEST Role Renamed"})
        assert rn.status_code == 200
        assert rn.json()["name"] == "TEST Role Renamed"
        # update perms (audit will record old->new)
        upd = requests.put(f"{BASE}/roles/{key}",
                           headers=H(admin_tok),
                           json={"permissions": ["dashboard.view", "leads.view_own"]})
        assert upd.status_code == 200
        assert sorted(upd.json()["permissions"]) == ["dashboard.view", "leads.view_own"]
        # audit of update
        a = requests.get(f"{BASE}/audit-logs", headers=H(admin_tok),
                         params={"entity_type": "role", "entity_id": key}).json()
        entries = a.get("items") if isinstance(a, dict) else a
        actions = [e["action"] for e in entries]
        assert "roles.update" in actions
        upd_entry = next(e for e in entries if e["action"] == "roles.update")
        assert "from" in upd_entry["details"] and "to" in upd_entry["details"]
        # delete
        d = requests.delete(f"{BASE}/roles/{key}", headers=H(admin_tok))
        assert d.status_code == 200

    def test_admin_role_cannot_be_modified(self, admin_tok):
        r = requests.put(f"{BASE}/roles/admin", headers=H(admin_tok),
                         json={"permissions": ["dashboard.view"]})
        assert r.status_code == 400

    def test_sessions_and_revoke(self, admin_tok, rec2_tok):
        _, rid = rec2_tok
        s = requests.get(f"{BASE}/users/{rid}/sessions", headers=H(admin_tok))
        assert s.status_code == 200
        rv = requests.post(f"{BASE}/users/{rid}/revoke-sessions", headers=H(admin_tok))
        assert rv.status_code == 200
        assert "revoked" in rv.json()


# ---------------- Security / RBAC ----------------

class TestSecurity:
    def test_recruiter_forbidden_admin_endpoints(self, rec_tok):
        tok, _ = rec_tok
        for method, path, body in [
            ("GET", "/users", None),
            ("POST", "/users", {"email": "x@x.com", "name": "x", "password": "Pass1234", "role": "recruiter"}),
            ("GET", "/roles", None),
            ("POST", "/leads/transfer", {"lead_ids": ["x"], "to_owner_id": "y"}),
            ("GET", "/audit-logs", None),
        ]:
            r = requests.request(method, f"{BASE}{path}", headers=H(tok), json=body)
            assert r.status_code == 403, f"{method} {path} -> {r.status_code}"

    def test_recruiter_cannot_read_or_edit_other_recruiters_lead(self, admin_tok, rec_tok, rec2_tok):
        rec_tok_v, _ = rec_tok
        rec2_tok_v, rec2_id = rec2_tok
        # find a Sam-owned lead via admin
        r = requests.get(f"{BASE}/leads", headers=H(admin_tok),
                         params={"recruiter_id": rec2_id})
        items = r.json().get("items") if isinstance(r.json(), dict) else r.json()
        assert len(items) >= 1
        other_id = items[0]["id"]
        # Jordan tries to view -> 403
        g = requests.get(f"{BASE}/leads/{other_id}", headers=H(rec_tok_v))
        assert g.status_code == 403
        # patch -> 403
        p = requests.patch(f"{BASE}/leads/{other_id}",
                           headers=H(rec_tok_v), json={"notes": "hax"})
        assert p.status_code == 403

    def test_recruiter_filter_bypass_returns_zero(self, rec_tok, rec2_tok):
        rec_tok_v, _ = rec_tok
        _, rec2_id = rec2_tok
        r = requests.get(f"{BASE}/leads", headers=H(rec_tok_v),
                         params={"recruiter_id": rec2_id})
        assert r.status_code == 200
        items = r.json().get("items") if isinstance(r.json(), dict) else r.json()
        assert len(items) == 0

    def test_recruiter_cannot_change_own_role(self, rec_tok):
        tok, rid = rec_tok
        r = requests.patch(f"{BASE}/users/{rid}", headers=H(tok), json={"role": "admin"})
        assert r.status_code == 403

    def test_admin_cannot_change_own_role(self, admin_tok):
        me = requests.get(f"{BASE}/auth/me", headers=H(admin_tok)).json()["user"]
        aid = me["id"]
        r = requests.patch(f"{BASE}/users/{aid}", headers=H(admin_tok),
                           json={"role": "recruiter"})
        assert r.status_code == 400

    def test_admin_cannot_deactivate_last_admin(self, admin_tok):
        me = requests.get(f"{BASE}/auth/me", headers=H(admin_tok)).json()["user"]
        aid = me["id"]
        # only one active admin in seed => must be blocked
        active_admins = requests.get(f"{BASE}/users", headers=H(admin_tok),
                                     params={"role": "admin", "status": "active"}).json()
        if len(active_admins) == 1:
            r = requests.post(f"{BASE}/users/{aid}/status",
                              headers=H(admin_tok), params={"is_active": False})
            assert r.status_code == 400


# ---------------- Lead Status Engine + Audit ----------------

class TestStatusEngineAudit:
    def test_status_transition_and_call_audit(self, rec_tok, admin_tok):
        tok, _ = rec_tok
        # create a fresh lead for isolation
        payload = {"name": f"TEST_Audit_{uuid.uuid4().hex[:6]}",
                   "phone": f"+9199999{int(time.time()) % 100000:05d}"}
        lead = requests.post(f"{BASE}/leads", headers=H(tok), json=payload).json()
        lid = lead["id"]
        prev_status = lead["status"]

        # status change
        s = requests.post(f"{BASE}/leads/{lid}/status",
                          headers=H(tok), json={"status": "contacted"})
        assert s.status_code == 200, s.text
        assert s.json()["status"] == "contacted"

        # log call
        c = requests.post(f"{BASE}/leads/{lid}/calls",
                          headers=H(tok),
                          json={"outcome": "connected", "connected": True, "notes": "audit test"})
        assert c.status_code == 200, c.text

        # audit as admin
        a = requests.get(f"{BASE}/audit-logs", headers=H(admin_tok),
                         params={"entity_id": lid}).json()
        entries = a.get("items") if isinstance(a, dict) else a
        actions = [e["action"] for e in entries]
        assert "leads.status" in actions
        assert "calls.log" in actions
        st = next(e for e in entries if e["action"] == "leads.status")
        assert st["details"]["from"] == prev_status
        assert st["details"]["to"] == "contacted"
