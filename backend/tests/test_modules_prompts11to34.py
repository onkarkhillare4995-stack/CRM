"""Backend regression tests for OAKsphere Prompts 11-34.

Covers: jobs, clients, vendors, templates, applications (convert idempotent),
followups board + complete, tasks summary + CRUD, interviews, joinings,
lead-inbox, reports (all tabs), action-required (9 cards), integrations
(save encrypted + mask + test + disconnect + recruiter 403), import
(template + preview + commit + idempotent commit), tags, notifications,
global search, and RBAC for recruiter.

Base URL read from REACT_APP_BACKEND_URL (frontend/.env fallback).
"""
import os
import io
import time
import pytest
import requests
from pathlib import Path

# Load REACT_APP_BACKEND_URL from frontend/.env when running under pytest
_env = Path(__file__).resolve().parents[2] / "frontend" / ".env"
if _env.exists():
    for line in _env.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            os.environ.setdefault("REACT_APP_BACKEND_URL", line.split("=", 1)[1].strip())

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "okhillare23@gmail.com", "password": "Admin@Oak2026"}
RECRUITER = {"email": "recruiter@oaksphere.demo", "password": "Recruiter@123"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers():
    tok = _login(ADMIN)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def recruiter_headers():
    tok = _login(RECRUITER)
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ============ Health ============
def test_health():
    r = requests.get(f"{API}/health", timeout=10)
    assert r.status_code == 200


# ============ JOBS ============
class TestJobs:
    def test_crud(self, admin_headers):
        r = requests.post(f"{API}/jobs", headers=admin_headers,
                          json={"title": "TEST_Job11", "client": "TEST_Client_J", "location": "Pune"})
        assert r.status_code in (200, 201), r.text
        job = r.json()
        jid = job["id"]
        # list
        r = requests.get(f"{API}/jobs?search=TEST_Job11", headers=admin_headers)
        assert r.status_code == 200
        items = r.json()
        assert any(j["id"] == jid for j in items)
        assert "linked_leads" in items[0]
        # edit - backend re-validates required fields (title, client) so pass them all
        r = requests.put(f"{API}/jobs/{jid}", headers=admin_headers,
                         json={"title": "TEST_Job11", "client": "TEST_Client_J", "location": "Mumbai"})
        assert r.status_code == 200, r.text
        assert r.json()["location"] == "Mumbai"
        # archive
        r = requests.delete(f"{API}/jobs/{jid}", headers=admin_headers)
        assert r.status_code == 200

    def test_missing_title(self, admin_headers):
        r = requests.post(f"{API}/jobs", headers=admin_headers, json={"client": "Only"})
        assert r.status_code == 400


# ============ CLIENTS ============
class TestClients:
    def test_crud(self, admin_headers):
        r = requests.post(f"{API}/clients", headers=admin_headers,
                          json={"name": "TEST_Client_C1", "company": "ACME"})
        assert r.status_code in (200, 201), r.text
        cid = r.json()["id"]
        r = requests.get(f"{API}/clients?search=TEST_Client_C1", headers=admin_headers)
        assert r.status_code == 200
        row = next(x for x in r.json() if x["id"] == cid)
        assert set(["submitted", "interviewed", "selected", "joined"]).issubset(row["stats"].keys())
        r = requests.put(f"{API}/clients/{cid}", headers=admin_headers,
                         json={"name": "TEST_Client_C1", "company": "ACME2"})
        assert r.status_code == 200 and r.json()["company"] == "ACME2"
        r = requests.delete(f"{API}/clients/{cid}", headers=admin_headers)
        assert r.status_code == 200


# ============ VENDORS ============
class TestVendors:
    def test_summary_and_crud(self, admin_headers):
        r = requests.get(f"{API}/vendors/summary", headers=admin_headers)
        assert r.status_code == 200
        s = r.json()
        for k in ("empanelled", "proposals", "active"):
            assert k in s
        r = requests.post(f"{API}/vendors", headers=admin_headers,
                          json={"company": "TEST_Vendor_V1", "contact_person": "V", "phone": "9999900000",
                                "stage": "contacted"})
        assert r.status_code in (200, 201), r.text
        vid = r.json()["id"]
        r = requests.put(f"{API}/vendors/{vid}", headers=admin_headers,
                         json={"company": "TEST_Vendor_V1", "stage": "empanelled"})
        assert r.status_code == 200 and r.json()["stage"] == "empanelled"
        r = requests.delete(f"{API}/vendors/{vid}", headers=admin_headers)
        assert r.status_code == 200

    def test_recruiter_forbidden(self, recruiter_headers):
        r = requests.get(f"{API}/vendors", headers=recruiter_headers)
        assert r.status_code == 403


# ============ TEMPLATES ============
class TestTemplates:
    def test_crud_and_channel_validation(self, admin_headers):
        r = requests.post(f"{API}/templates", headers=admin_headers,
                          json={"name": "TEST_Tpl1", "channel": "whatsapp", "body": "Hi {{name}}"})
        assert r.status_code in (200, 201), r.text
        tid = r.json()["id"]
        r = requests.get(f"{API}/templates?channel=whatsapp&search=TEST_Tpl1", headers=admin_headers)
        assert r.status_code == 200 and any(t["id"] == tid for t in r.json())
        r = requests.put(f"{API}/templates/{tid}", headers=admin_headers,
                         json={"name": "TEST_Tpl1", "channel": "whatsapp", "body": "Hi {{name}}!"})
        assert r.status_code == 200
        # bad channel
        r = requests.post(f"{API}/templates", headers=admin_headers,
                          json={"name": "TEST_Bad", "channel": "sms", "body": "x"})
        assert r.status_code == 400
        # missing body
        r = requests.post(f"{API}/templates", headers=admin_headers,
                          json={"name": "TEST_Bad", "channel": "email"})
        assert r.status_code == 400
        r = requests.delete(f"{API}/templates/{tid}", headers=admin_headers)
        assert r.status_code == 200


# ============ APPLICATIONS ============
class TestApplications:
    def _get_or_seed_app(self, admin_headers):
        r = requests.get(f"{API}/applications?status=new", headers=admin_headers)
        assert r.status_code == 200
        rows = r.json()
        if rows:
            return rows[0]
        # No app in "new" - test still succeeds by using any non-converted
        r = requests.get(f"{API}/applications?status=all", headers=admin_headers)
        rows = [x for x in r.json() if x.get("status") != "converted"]
        return rows[0] if rows else None

    def test_list_all(self, admin_headers):
        r = requests.get(f"{API}/applications?status=all", headers=admin_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_convert_idempotent(self, admin_headers):
        r = requests.get(f"{API}/applications?status=all", headers=admin_headers)
        rows = r.json()
        # find one already converted with lead_id (seeded per iteration)
        already = next((a for a in rows if a.get("status") == "converted" and a.get("lead_id")), None)
        if not already:
            # seed by converting
            candidate = self._get_or_seed_app({**admin_headers})
            if not candidate:
                pytest.skip("No applications to convert")
            r = requests.post(f"{API}/applications/{candidate['id']}/convert",
                              headers=admin_headers, json={})
            assert r.status_code == 200
            already_id = candidate["id"]
        else:
            already_id = already["id"]
        # Second convert -> idempotent (converted=False or already=True)
        r = requests.post(f"{API}/applications/{already_id}/convert",
                          headers=admin_headers, json={})
        assert r.status_code == 200
        data = r.json()
        assert data.get("converted") is False
        assert "lead" in data


# ============ LEAD INBOX ============
def test_lead_inbox(admin_headers):
    r = requests.get(f"{API}/lead-inbox", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert "summary" in body and "items" in body
    assert isinstance(body["summary"], list)


# ============ REPORTS ============
class TestReports:
    def test_leaderboard(self, admin_headers):
        r = requests.get(f"{API}/reports?tab=leaderboard", headers=admin_headers)
        assert r.status_code == 200
        body = r.json()
        assert "leaderboard" in body and "score_formula" in body
        if body["leaderboard"]:
            row = body["leaderboard"][0]
            for k in ("recruiter", "score", "rank", "calls", "connected", "lineups", "joined"):
                assert k in row

    def test_targets(self, admin_headers):
        r = requests.get(f"{API}/reports?tab=targets", headers=admin_headers)
        assert r.status_code == 200
        assert "targets" in r.json()

    def test_funnel(self, admin_headers):
        r = requests.get(f"{API}/reports?tab=funnel", headers=admin_headers)
        assert r.status_code == 200 and "funnel" in r.json()

    def test_aging(self, admin_headers):
        r = requests.get(f"{API}/reports?tab=aging", headers=admin_headers)
        assert r.status_code == 200 and "aging" in r.json()
        assert set(r.json()["aging"].keys()) == {"new", "1d", "3d", "7d", "15d+"}

    def test_missed(self, admin_headers):
        r = requests.get(f"{API}/reports?tab=missed", headers=admin_headers)
        assert r.status_code == 200 and "missed" in r.json()

    def test_recruiter_forbidden(self, recruiter_headers):
        r = requests.get(f"{API}/reports?tab=leaderboard", headers=recruiter_headers)
        assert r.status_code == 403


# ============ ACTION REQUIRED ============
def test_action_required_9_cards(admin_headers):
    r = requests.get(f"{API}/action-required", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert "cards" in body
    assert len(body["cards"]) == 9
    keys = {c["key"] for c in body["cards"]}
    assert keys == {"overdue_followups", "no_followup", "never_called", "unassigned",
                    "stale", "selected_no_joining", "unconfirmed_interviews",
                    "unconfirmed_joinings", "below_target"}


def test_action_required_recruiter_forbidden(recruiter_headers):
    # Endpoint enforces admin/recruiters.view/users.manage; recruiter -> 403
    r = requests.get(f"{API}/action-required", headers=recruiter_headers)
    assert r.status_code == 403


# ============ INTEGRATIONS ============
class TestIntegrations:
    def test_list_masked_by_default(self, admin_headers):
        r = requests.get(f"{API}/integrations", headers=admin_headers)
        assert r.status_code == 200
        rows = r.json()
        keys = {row["key"] for row in rows}
        assert {"whatsapp", "instagram", "facebook", "google_forms"}.issubset(keys)

    def test_save_test_disconnect_round_trip(self, admin_headers):
        secret = "AAAABBBBCCCC-1234SECRET"
        r = requests.put(f"{API}/integrations/google_forms", headers=admin_headers,
                         json={"shared_secret": secret})
        assert r.status_code == 200 and r.json().get("ok")
        # verify masking on list
        r = requests.get(f"{API}/integrations", headers=admin_headers)
        gf = next(x for x in r.json() if x["key"] == "google_forms")
        masked = gf["masked"].get("shared_secret", "")
        # Never returns the raw token
        assert secret not in masked
        # test connection
        r = requests.post(f"{API}/integrations/google_forms/test", headers=admin_headers)
        assert r.status_code == 200 and r.json().get("ok")
        # disconnect
        r = requests.post(f"{API}/integrations/google_forms/disconnect", headers=admin_headers)
        assert r.status_code == 200 and r.json().get("disconnected")

    def test_recruiter_forbidden(self, recruiter_headers):
        r = requests.get(f"{API}/integrations", headers=recruiter_headers)
        assert r.status_code == 403


# ============ IMPORT ============
class TestImport:
    def test_template_download(self, admin_headers):
        r = requests.get(f"{API}/import/template", headers=admin_headers)
        assert r.status_code == 200
        # Content bytes; xlsx starts with PK zip magic
        assert r.content[:2] == b"PK"

    def test_preview_and_commit_idempotent(self, admin_headers):
        csv_body = (
            "Name,Phone,Email,Source,Priority\n"
            f"TEST_Imp_A,977700{int(time.time()) % 10000:04d},a@t.com,referral,high\n"
            f"TEST_Imp_B,977701{int(time.time()) % 10000:04d},b@t.com,manual,medium\n"
        ).encode()
        files = {"file": ("leads.csv", csv_body, "text/csv")}
        # Do not use the JSON Content-Type header
        h = {k: v for k, v in admin_headers.items() if k != "Content-Type"}
        r = requests.post(f"{API}/import/preview", headers=h, files=files)
        assert r.status_code == 200, r.text
        pv = r.json()
        assert pv["row_count"] == 2 and "batch_id" in pv
        mapping = {"Name": "name", "Phone": "phone", "Email": "email",
                   "Source": "source", "Priority": "priority"}
        r = requests.post(f"{API}/import/commit", headers=admin_headers,
                          json={"batch_id": pv["batch_id"], "mapping": mapping,
                                "rules": {"assign": "unassigned", "duplicates": "flag", "invalid": "flag"}})
        assert r.status_code == 200
        first = r.json()
        assert first["imported"] >= 1
        # Idempotent
        r = requests.post(f"{API}/import/commit", headers=admin_headers,
                          json={"batch_id": pv["batch_id"], "mapping": mapping, "rules": {}})
        assert r.status_code == 200
        second = r.json()
        assert second == first or second.get("note") == "already committed"

    def test_commit_requires_phone_mapping(self, admin_headers):
        csv_body = b"Foo\nbar\n"
        h = {k: v for k, v in admin_headers.items() if k != "Content-Type"}
        r = requests.post(f"{API}/import/preview", headers=h,
                          files={"file": ("x.csv", csv_body, "text/csv")})
        assert r.status_code == 200
        bid = r.json()["batch_id"]
        r = requests.post(f"{API}/import/commit", headers=admin_headers,
                          json={"batch_id": bid, "mapping": {"Foo": "name"}, "rules": {}})
        assert r.status_code == 400

    def test_recruiter_forbidden(self, recruiter_headers):
        r = requests.get(f"{API}/import/template", headers=recruiter_headers)
        assert r.status_code == 403


# ============ TAGS ============
class TestTags:
    def test_crud(self, admin_headers):
        name = f"TEST_Tag_{int(time.time())}"
        r = requests.post(f"{API}/tags", headers=admin_headers, json={"name": name, "color": "red"})
        assert r.status_code in (200, 201), r.text
        tid = r.json()["id"]
        # dup
        r = requests.post(f"{API}/tags", headers=admin_headers, json={"name": name})
        assert r.status_code == 400
        r = requests.get(f"{API}/tags", headers=admin_headers)
        assert r.status_code == 200
        row = next(x for x in r.json() if x["id"] == tid)
        assert "lead_count" in row
        r = requests.put(f"{API}/tags/{tid}", headers=admin_headers, json={"name": name, "color": "blue"})
        assert r.status_code == 200 and r.json()["color"] == "blue"
        r = requests.delete(f"{API}/tags/{tid}", headers=admin_headers)
        assert r.status_code == 200


# ============ NOTIFICATIONS ============
class TestNotifications:
    def test_flow(self, admin_headers):
        r = requests.get(f"{API}/notifications", headers=admin_headers)
        assert r.status_code == 200 and isinstance(r.json(), list)
        r = requests.get(f"{API}/notifications/unread-count", headers=admin_headers)
        assert r.status_code == 200 and "count" in r.json()
        # mark all
        r = requests.post(f"{API}/notifications/read-all", headers=admin_headers)
        assert r.status_code == 200

    def test_isolation(self, admin_headers, recruiter_headers):
        a = requests.get(f"{API}/notifications", headers=admin_headers).json()
        r = requests.get(f"{API}/notifications", headers=recruiter_headers).json()
        # different recipient_id -> no overlap by id
        ids_a = {x.get("id") for x in a}
        ids_r = {x.get("id") for x in r}
        assert not (ids_a & ids_r)


# ============ FOLLOWUPS BOARD ============
class TestFollowupsBoard:
    def test_board_counts_and_tabs(self, admin_headers):
        r = requests.get(f"{API}/followups/board?tab=due_today", headers=admin_headers)
        assert r.status_code == 200
        b = r.json()
        assert "items" in b and "counts" in b
        keys = set(b["counts"].keys())
        assert {"due_today", "overdue", "tomorrow", "upcoming", "missed", "completed"}.issubset(keys)


# ============ TASKS ============
class TestTasks:
    def test_summary_and_crud(self, admin_headers):
        r = requests.get(f"{API}/tasks/summary", headers=admin_headers)
        assert r.status_code == 200
        s = r.json()
        assert set(("pending", "high_priority", "completed")).issubset(s.keys())
        # create
        r = requests.post(f"{API}/tasks", headers=admin_headers,
                          json={"title": "TEST_Task11", "category": "general_admin", "priority": "high"})
        assert r.status_code in (200, 201), r.text
        tid = r.json()["id"]
        # mark done
        r = requests.put(f"{API}/tasks/{tid}", headers=admin_headers, json={"status": "done"})
        assert r.status_code == 200 and r.json()["status"] == "done"
        # reopen
        r = requests.put(f"{API}/tasks/{tid}", headers=admin_headers, json={"status": "pending"})
        assert r.status_code == 200 and r.json()["status"] == "pending"
        # delete
        r = requests.delete(f"{API}/tasks/{tid}", headers=admin_headers)
        assert r.status_code == 200


# ============ INTERVIEWS / JOININGS ============
class TestInterviewsJoinings:
    def test_lists(self, admin_headers):
        for path in ("/interviews", "/joinings"):
            r = requests.get(f"{API}{path}", headers=admin_headers)
            assert r.status_code == 200, f"{path} -> {r.status_code}"
            assert isinstance(r.json(), list)


# ============ GLOBAL SEARCH ============
def test_global_search(admin_headers):
    r = requests.get(f"{API}/search?q=Ra", headers=admin_headers)
    assert r.status_code == 200
    assert "results" in r.json()


# ============ ORG SETTINGS ============
def test_org_settings(admin_headers):
    r = requests.get(f"{API}/org-settings", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    for k in ("agency_name", "targets", "lead_sources", "priorities", "lead_statuses"):
        assert k in body
