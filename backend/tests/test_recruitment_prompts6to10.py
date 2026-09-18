"""Backend tests for Prompts 06-10: All Leads grid, saved views, filters, sort/pagination,
duplicate check, create lead (+first followup), bulk assign/auto-distribute, export,
lead detail, notes, activities, followups, disposition engine, RBAC/scope."""
import os
import time
import pytest
import requests
from datetime import datetime, timedelta, timezone

def _load_env():
    p = "/app/frontend/.env"
    if os.path.exists(p):
        for line in open(p):
            if line.strip().startswith("REACT_APP_BACKEND_URL"):
                return line.split("=", 1)[1].strip()
    return os.environ.get("REACT_APP_BACKEND_URL", "")

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or _load_env()).rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL missing"
API = f"{BASE_URL}/api"

ADMIN = ("okhillare23@gmail.com", "Admin@Oak2026")
TL = ("teamlead@oaksphere.demo", "TeamLead@123")
REC1 = ("recruiter@oaksphere.demo", "Recruiter@123")
REC2 = ("recruiter2@oaksphere.demo", "Recruiter@456")


def _login(email, pw):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=30)
    assert r.status_code == 200, f"login {email} -> {r.status_code} {r.text}"
    tok = r.json().get("access_token") or r.json().get("token")
    assert tok, r.json()
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="module")
def admin_h():
    return _login(*ADMIN)


@pytest.fixture(scope="module")
def tl_h():
    return _login(*TL)


@pytest.fixture(scope="module")
def rec1_h():
    return _login(*REC1)


@pytest.fixture(scope="module")
def rec2_h():
    return _login(*REC2)


@pytest.fixture(scope="module")
def recruiter_ids(admin_h):
    r = requests.get(f"{API}/recruiters", headers=admin_h, timeout=30)
    assert r.status_code == 200
    data = r.json()
    out = {}
    for u in data:
        out[u.get("email")] = u.get("id")
    return out


# --------------- Prompt 06: list + views + filters + sort + pagination ---------------
class TestLeadsGrid:
    def test_admin_list_default(self, admin_h):
        r = requests.get(f"{API}/leads", headers=admin_h, timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert "items" in data and "total" in data and "page" in data and "page_size" in data
        assert isinstance(data["items"], list)
        assert data["total"] >= 1
        # Row shape
        row = data["items"][0]
        for f in ("id", "name", "phone", "status", "priority", "owner_id"):
            assert f in row, f"missing {f} in row"
        assert "flags" in row

    @pytest.mark.parametrize("view,expect_status", [
        ("fresh", "new"),
        ("interested", "interested"),
        ("joined", "joined"),
    ])
    def test_view_chip(self, admin_h, view, expect_status):
        r = requests.get(f"{API}/leads", headers=admin_h, params={"view": view}, timeout=30)
        assert r.status_code == 200
        data = r.json()
        for it in data["items"]:
            assert it["status"] == expect_status, f"view={view} returned status={it['status']}"

    def test_view_hot(self, admin_h):
        r = requests.get(f"{API}/leads", headers=admin_h, params={"view": "hot"}, timeout=30)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["priority"] == "high"

    def test_search_filter(self, admin_h):
        # first grab any name
        r = requests.get(f"{API}/leads", headers=admin_h, params={"page_size": 1}, timeout=30)
        name = r.json()["items"][0]["name"]
        frag = name.split(" ")[0][:3]
        r2 = requests.get(f"{API}/leads", headers=admin_h, params={"search": frag}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["total"] >= 1

    def test_pagination(self, admin_h):
        r = requests.get(f"{API}/leads", headers=admin_h, params={"page": 1, "page_size": 2}, timeout=30)
        assert r.status_code == 200
        assert len(r.json()["items"]) <= 2
        assert r.json()["page"] == 1 and r.json()["page_size"] == 2

    def test_sort_by_name_asc(self, admin_h):
        r = requests.get(f"{API}/leads", headers=admin_h,
                         params={"sort_by": "name", "sort_dir": "asc", "page_size": 20}, timeout=30)
        assert r.status_code == 200
        names = [x["name"] for x in r.json()["items"]]
        assert names == sorted(names, key=lambda s: s.lower())

    def test_priority_filter(self, admin_h):
        r = requests.get(f"{API}/leads", headers=admin_h, params={"priority": "high"}, timeout=30)
        assert r.status_code == 200
        for it in r.json()["items"]:
            assert it["priority"] == "high"


# --------------- Prompt 07: create + duplicate check ---------------
class TestCreateAndDuplicate:
    def test_check_duplicate_negative(self, admin_h):
        r = requests.post(f"{API}/leads/check-duplicate", headers=admin_h,
                          json={"phone": "9000000001"}, timeout=30)  # unlikely seeded
        assert r.status_code == 200
        assert r.json()["duplicate"] in (True, False)  # either but shape valid

    def test_create_unique_and_first_followup(self, admin_h):
        phone = f"98{int(time.time()) % 100000000:08d}"
        tomorrow = (datetime.now(timezone.utc) + timedelta(days=1)).replace(microsecond=0)
        payload = {
            "name": "TEST_Prompt7_Unique",
            "phone": phone,
            "priority": "medium",
            "first_followup_at": tomorrow.isoformat(),
            "first_followup_reason": "First call",
        }
        r = requests.post(f"{API}/leads", headers=admin_h, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        lead = r.json()
        assert lead["name"] == payload["name"]
        assert lead["status"] == "new"
        assert lead["next_followup_at"] is not None
        # Duplicate check now finds it
        r2 = requests.post(f"{API}/leads/check-duplicate", headers=admin_h,
                           json={"phone": phone}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["duplicate"] is True
        assert r2.json()["lead"]["id"] == lead["id"]
        # followups list on the lead
        r3 = requests.get(f"{API}/leads/{lead['id']}/followups", headers=admin_h, timeout=30)
        assert r3.status_code == 200
        assert len(r3.json()) >= 1
        pytest.created_lead_id = lead["id"]
        pytest.created_lead_phone = phone

    def test_duplicate_flagged_creation(self, admin_h):
        phone = getattr(pytest, "created_lead_phone", None)
        assert phone, "prior test must have created"
        payload = {"name": "TEST_Dup_Flag", "phone": phone, "priority": "low", "duplicate_ack": True}
        r = requests.post(f"{API}/leads", headers=admin_h, json=payload, timeout=30)
        assert r.status_code == 200
        assert r.json()["duplicate_flagged"] is True


# --------------- Prompt 08: detail, notes, followups, activities ---------------
class TestDetailNotesActivity:
    def test_get_detail(self, admin_h):
        lid = pytest.created_lead_id
        r = requests.get(f"{API}/leads/{lid}", headers=admin_h, timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == lid
        assert "flags" in d
        assert "owner_name" in d
        assert "lead_age_days" in d

    def test_notes_crud(self, admin_h):
        lid = pytest.created_lead_id
        # add
        r = requests.post(f"{API}/leads/{lid}/notes", headers=admin_h,
                          json={"body": "TEST_note first"}, timeout=30)
        assert r.status_code == 200, r.text
        nid = r.json()["id"]
        assert r.json()["body"] == "TEST_note first"
        # list
        r2 = requests.get(f"{API}/leads/{lid}/notes", headers=admin_h, timeout=30)
        assert r2.status_code == 200 and any(n["id"] == nid for n in r2.json())
        # update
        r3 = requests.put(f"{API}/notes/{nid}", headers=admin_h,
                          json={"body": "TEST_note edited"}, timeout=30)
        assert r3.status_code == 200 and r3.json()["body"] == "TEST_note edited"
        # delete
        r4 = requests.delete(f"{API}/notes/{nid}", headers=admin_h, timeout=30)
        assert r4.status_code == 200
        # verify gone
        r5 = requests.get(f"{API}/leads/{lid}/notes", headers=admin_h, timeout=30)
        assert not any(n["id"] == nid for n in r5.json())

    def test_activities_recorded(self, admin_h):
        lid = pytest.created_lead_id
        r = requests.get(f"{API}/leads/{lid}/activities", headers=admin_h, timeout=30)
        assert r.status_code == 200
        types = {a["type"] for a in r.json()}
        # We should at least see created + a note event + followup_scheduled
        assert "created" in types
        assert "note" in types
        assert "followup_scheduled" in types


# --------------- Prompt 10: disposition engine ---------------
class TestDisposition:
    def _fresh_lead(self, admin_h, name):
        phone = f"97{int(time.time()*1000) % 100000000:08d}"
        r = requests.post(f"{API}/leads", headers=admin_h, json={
            "name": name, "phone": phone, "priority": "medium",
        }, timeout=30)
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_connected_interested_moves_status(self, admin_h):
        lid = self._fresh_lead(admin_h, "TEST_Dispo_Interested")
        r = requests.post(f"{API}/leads/{lid}/disposition", headers=admin_h,
                          json={"outcome": "connected_interested", "duration_seconds": 60,
                                "next_followup_at": (datetime.now(timezone.utc)+timedelta(days=1)).isoformat()},
                          timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "interested"

    def test_callback_requires_followup(self, admin_h):
        lid = self._fresh_lead(admin_h, "TEST_Dispo_Callback_NoFU")
        r = requests.post(f"{API}/leads/{lid}/disposition", headers=admin_h,
                          json={"outcome": "callback_requested", "duration_seconds": 30},
                          timeout=30)
        assert r.status_code == 400
        assert "followup" in r.text.lower() or "follow-up" in r.text.lower()

    def test_callback_with_followup_ok(self, admin_h):
        lid = self._fresh_lead(admin_h, "TEST_Dispo_Callback_OK")
        due = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        r = requests.post(f"{API}/leads/{lid}/disposition", headers=admin_h,
                          json={"outcome": "callback_requested", "next_followup_at": due,
                                "duration_seconds": 30}, timeout=30)
        assert r.status_code == 200, r.text
        # next_followup_at should be set
        d = requests.get(f"{API}/leads/{lid}", headers=admin_h, timeout=30).json()
        assert d["next_followup_at"] is not None

    def test_interview_scheduled_requires_details_and_moves_to_lineup(self, admin_h):
        lid = self._fresh_lead(admin_h, "TEST_Dispo_Interview_Missing")
        # missing interview details
        r = requests.post(f"{API}/leads/{lid}/disposition", headers=admin_h,
                          json={"outcome": "interview_scheduled"}, timeout=30)
        assert r.status_code == 400
        # now with details
        sched = (datetime.now(timezone.utc) + timedelta(days=2)).isoformat()
        r2 = requests.post(f"{API}/leads/{lid}/disposition", headers=admin_h,
                           json={"outcome": "interview_scheduled",
                                 "interview": {"scheduled_at": sched, "client": "Acme",
                                               "job": "Ops", "type": "telephonic"}}, timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "lineup"

    def test_not_interested_requires_reason_then_finalizes(self, admin_h):
        lid = self._fresh_lead(admin_h, "TEST_Dispo_NotInt_NoReason")
        r = requests.post(f"{API}/leads/{lid}/disposition", headers=admin_h,
                          json={"outcome": "not_interested"}, timeout=30)
        assert r.status_code == 400
        r2 = requests.post(f"{API}/leads/{lid}/disposition", headers=admin_h,
                           json={"outcome": "not_interested", "closure_reason": "salary low"}, timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "not_interested"

    def test_invalid_number_finalizes_invalid(self, admin_h):
        lid = self._fresh_lead(admin_h, "TEST_Dispo_Invalid")
        r = requests.post(f"{API}/leads/{lid}/disposition", headers=admin_h,
                          json={"outcome": "invalid_number", "closure_reason": "wrong digits"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == "invalid"


# --------------- Prompt 06 bulk actions + export + auto-distribute ---------------
class TestBulkAndExport:
    def test_admin_export_csv(self, admin_h):
        r = requests.get(f"{API}/leads/export", headers=admin_h, timeout=30)
        assert r.status_code == 200
        assert "text/csv" in r.headers.get("content-type", "")
        head = r.text.splitlines()[0]
        assert "lead_code" in head and "name" in head and "phone" in head

    def test_recruiter_cannot_export(self, rec1_h):
        r = requests.get(f"{API}/leads/export", headers=rec1_h, timeout=30)
        assert r.status_code == 403

    def test_bulk_assign_admin(self, admin_h, recruiter_ids):
        # take 2 leads owned by anyone
        rows = requests.get(f"{API}/leads", headers=admin_h, params={"page_size": 2},
                            timeout=30).json()["items"]
        ids = [r["id"] for r in rows]
        target = recruiter_ids.get(REC2[0])
        assert target, f"recruiter2 id missing: {recruiter_ids}"
        r = requests.post(f"{API}/leads/assign", headers=admin_h,
                          json={"lead_ids": ids, "to_owner_id": target}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["assigned"] == len(ids)
        # verify persisted
        for lid in ids:
            d = requests.get(f"{API}/leads/{lid}", headers=admin_h, timeout=30).json()
            assert d["owner_id"] == target

    def test_recruiter_cannot_assign(self, rec1_h, recruiter_ids):
        target = recruiter_ids.get(REC2[0])
        r = requests.post(f"{API}/leads/assign", headers=rec1_h,
                          json={"lead_ids": ["x"], "to_owner_id": target or "x"}, timeout=30)
        assert r.status_code == 403

    def test_auto_distribute_admin(self, admin_h):
        # create a few TEST leads, then distribute
        ids = []
        for i in range(3):
            r = requests.post(f"{API}/leads", headers=admin_h, json={
                "name": f"TEST_AutoDist_{i}",
                "phone": f"96{int(time.time()*1000)%100000000 + i:08d}",
                "priority": "low",
            }, timeout=30)
            assert r.status_code == 200, r.text
            ids.append(r.json()["id"])
        r = requests.post(f"{API}/leads/auto-distribute", headers=admin_h,
                         json={"lead_ids": ids}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["distributed"] >= 1


# --------------- RBAC ---------------
class TestRBAC:
    def test_recruiter_only_sees_own(self, rec1_h, recruiter_ids):
        r = requests.get(f"{API}/leads", headers=rec1_h, timeout=30)
        assert r.status_code == 200
        own = recruiter_ids.get(REC1[0])
        for it in r.json()["items"]:
            assert it["owner_id"] == own, f"recruiter saw a lead owned by {it['owner_id']}"

    def test_recruiter_cannot_read_other_lead(self, rec1_h, rec2_h, admin_h, recruiter_ids):
        # find a lead owned by rec2
        rec2_id = recruiter_ids[REC2[0]]
        data = requests.get(f"{API}/leads", headers=admin_h,
                            params={"recruiter_id": rec2_id, "page_size": 1}, timeout=30).json()
        if not data["items"]:
            pytest.skip("no rec2 lead")
        lid = data["items"][0]["id"]
        r = requests.get(f"{API}/leads/{lid}", headers=rec1_h, timeout=30)
        assert r.status_code == 403

    def test_recruiter_cannot_auto_distribute(self, rec1_h):
        r = requests.post(f"{API}/leads/auto-distribute", headers=rec1_h,
                          json={"lead_ids": []}, timeout=30)
        assert r.status_code == 403
