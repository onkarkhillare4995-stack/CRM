"""Public URL API smoke tests via REACT_APP_BACKEND_URL."""
import os
import requests
import pytest

BASE_URL = "https://talent-hub-936.preview.emergentagent.com"

ADMIN = {"email": "okhillare23@gmail.com", "password": "Admin@Oak2026"}
LEAD = {"email": "teamlead@oaksphere.demo", "password": "TeamLead@123"}
RECRUITER = {"email": "recruiter@oaksphere.demo", "password": "Recruiter@123"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(t):
    return {"Authorization": f"Bearer {t}"}


def test_health():
    r = requests.get(f"{BASE_URL}/api/health", timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "healthy"


def test_admin_login_and_me():
    t = _login(ADMIN)
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(t), timeout=10)
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "admin"


def test_admin_list_users():
    t = _login(ADMIN)
    r = requests.get(f"{BASE_URL}/api/users", headers=_h(t), timeout=10)
    assert r.status_code == 200
    users = r.json()
    assert len(users) >= 3
    for u in users:
        assert "_id" not in u  # Ensure mongo _id excluded


def test_recruiter_denied_list_users():
    t = _login(RECRUITER)
    r = requests.get(f"{BASE_URL}/api/users", headers=_h(t), timeout=10)
    assert r.status_code == 403


def test_recruiter_denied_create_user():
    t = _login(RECRUITER)
    r = requests.post(f"{BASE_URL}/api/users", headers=_h(t), json={
        "email": "TEST_x@y.com", "name": "X", "password": "password123", "role": "recruiter"}, timeout=10)
    assert r.status_code == 403


def test_recruiter_denied_other_user():
    admin_t = _login(ADMIN)
    users = requests.get(f"{BASE_URL}/api/users", headers=_h(admin_t), timeout=10).json()
    other = next(u for u in users if u["email"] != RECRUITER["email"])
    rec_t = _login(RECRUITER)
    r = requests.get(f"{BASE_URL}/api/users/{other['id']}", headers=_h(rec_t), timeout=10)
    assert r.status_code == 403


def test_team_leader_scope():
    t = _login(LEAD)
    r = requests.get(f"{BASE_URL}/api/users", headers=_h(t), timeout=10)
    assert r.status_code == 200
    emails = {u["email"] for u in r.json()}
    assert LEAD["email"] in emails
    assert ADMIN["email"] not in emails


def test_team_leader_cannot_access_admin_record():
    admin_t = _login(ADMIN)
    admin_user = next(u for u in requests.get(f"{BASE_URL}/api/users?role=admin", headers=_h(admin_t), timeout=10).json())
    t = _login(LEAD)
    r = requests.get(f"{BASE_URL}/api/users/{admin_user['id']}", headers=_h(t), timeout=10)
    assert r.status_code == 403


def test_logout_revokes_session():
    t = _login(ADMIN)
    assert requests.get(f"{BASE_URL}/api/auth/me", headers=_h(t), timeout=10).status_code == 200
    r = requests.post(f"{BASE_URL}/api/auth/logout", headers=_h(t), timeout=10)
    assert r.status_code in (200, 204)
    assert requests.get(f"{BASE_URL}/api/auth/me", headers=_h(t), timeout=10).status_code == 401


def test_forgot_password_generic_success():
    r = requests.post(f"{BASE_URL}/api/auth/forgot-password", json={"email": "nonexistent@example.com"}, timeout=10)
    assert r.status_code == 200
    # generic message; must not reveal existence
    body = r.json()
    assert "message" in body or "detail" in body


def test_reset_password_invalid_token():
    r = requests.post(f"{BASE_URL}/api/auth/reset-password", json={"token": "invalid-xxx", "new_password": "Newpass@123"}, timeout=10)
    assert r.status_code in (400, 401, 404, 422)


def test_admin_can_view_audit_logs():
    t = _login(ADMIN)
    r = requests.get(f"{BASE_URL}/api/audit-logs", headers=_h(t), timeout=10)
    assert r.status_code == 200


def test_admin_dashboard():
    t = _login(ADMIN)
    r = requests.get(f"{BASE_URL}/api/dashboard/stats", headers=_h(t), timeout=10)
    assert r.status_code == 200


def test_admin_settings_get():
    t = _login(ADMIN)
    r = requests.get(f"{BASE_URL}/api/settings", headers=_h(t), timeout=10)
    assert r.status_code == 200


def test_admin_roles_get():
    t = _login(ADMIN)
    r = requests.get(f"{BASE_URL}/api/roles", headers=_h(t), timeout=10)
    assert r.status_code == 200
