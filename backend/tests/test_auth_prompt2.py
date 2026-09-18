"""Prompt #2 auth suite: login, rate limit, logout, forgot/reset, change-password,
policy, google config, inactive-user block. Run against the public URL.

Uses direct Mongo access only for setup/cleanup of tokens & inactive-user toggle.
Rate-limit test uses a throwaway email so seeded accounts are not locked.
"""
import os
import hashlib
import secrets
import asyncio
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient

BACKEND_ENV = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(BACKEND_ENV)

FRONTEND_ENV = Path("/app/frontend/.env")
load_dotenv(FRONTEND_ENV, override=False)

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "okhillare23@gmail.com", "password": "Admin@Oak2026"}
LEAD = {"email": "teamlead@oaksphere.demo", "password": "TeamLead@123"}
RECRUITER = {"email": "recruiter@oaksphere.demo", "password": "Recruiter@123"}

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]


# ---------- fixtures ----------
@pytest.fixture(scope="session")
def db():
    client = MongoClient(MONGO_URL)
    return client[DB_NAME]


def _login(email, password):
    return requests.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=15)


def _headers(token):
    return {"Authorization": f"Bearer {token}"}


def _clear_lockout(db, email):
    db.login_attempts.delete_many({"identifier": {"$regex": f":{email.lower()}$"}})


# ---------- 1. auth config + google gating ----------
def test_auth_config_endpoint():
    r = requests.get(f"{API}/auth/config", timeout=10)
    assert r.status_code == 200
    data = r.json()
    assert data == {"google_enabled": False, "email_enabled": True}


def test_google_login_not_configured():
    r = requests.post(f"{API}/auth/google", json={"id_token": "dummy"}, timeout=10)
    assert r.status_code == 503
    body = r.json()
    # errors formatted by AppError: {"error":{"code":..., "message":...}}
    assert "not_configured" in str(body)


# ---------- 2. correct login ----------
def test_admin_login_success(db):
    _clear_lockout(db, ADMIN["email"])
    r = _login(**ADMIN)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data and data["user"]["role"] == "admin"
    assert data["user"]["email"] == ADMIN["email"]


# ---------- 3. wrong password ----------
def test_wrong_password_returns_401(db):
    _clear_lockout(db, LEAD["email"])
    r = requests.post(f"{API}/auth/login",
                      json={"email": LEAD["email"], "password": "WrongPass1"}, timeout=10)
    assert r.status_code == 401
    assert "invalid_credentials" in str(r.json())
    _clear_lockout(db, LEAD["email"])


# ---------- 4. logout revokes bearer session ----------
def test_logout_revokes_session(db):
    _clear_lockout(db, ADMIN["email"])
    r = _login(**ADMIN)
    token = r.json()["access_token"]
    me = requests.get(f"{API}/auth/me", headers=_headers(token), timeout=10)
    assert me.status_code == 200
    lo = requests.post(f"{API}/auth/logout", headers=_headers(token), timeout=10)
    assert lo.status_code == 200
    me2 = requests.get(f"{API}/auth/me", headers=_headers(token), timeout=10)
    assert me2.status_code == 401


# ---------- 5. forgot-password neutral for both existing & unknown ----------
def test_forgot_password_neutral_message():
    r1 = requests.post(f"{API}/auth/forgot-password",
                       json={"email": ADMIN["email"]}, timeout=15)
    r2 = requests.post(f"{API}/auth/forgot-password",
                       json={"email": "no-such-user@example.com"}, timeout=15)
    assert r1.status_code == 200 and r2.status_code == 200
    assert r1.json() == r2.json()
    assert "reset link" in r1.json()["message"].lower()


# ---------- 6. rate limit after 10 failed attempts ----------
def test_rate_limit_after_10_failures(db):
    throwaway = "test_ratelimit_unused@example.com"
    _clear_lockout(db, throwaway)
    saw_429 = False
    last_status = None
    for i in range(1, 13):
        r = requests.post(f"{API}/auth/login",
                          json={"email": throwaway, "password": f"BadPw{i}"}, timeout=10)
        last_status = r.status_code
        if r.status_code == 429:
            saw_429 = True
            assert "rate_limited" in str(r.json())
            break
    _clear_lockout(db, throwaway)
    assert saw_429, f"never hit 429 after 12 attempts, last={last_status}"


# ---------- 7. inactive user blocked ----------
def test_inactive_user_blocked(db):
    _clear_lockout(db, RECRUITER["email"])
    try:
        db.users.update_one({"email": RECRUITER["email"]}, {"$set": {"is_active": False}})
        r = _login(**RECRUITER)
        assert r.status_code == 403
        assert "account_disabled" in str(r.json())
    finally:
        db.users.update_one({"email": RECRUITER["email"]}, {"$set": {"is_active": True}})
        _clear_lockout(db, RECRUITER["email"])
    # After reactivation, login works
    r2 = _login(**RECRUITER)
    assert r2.status_code == 200


# ---------- 8. change password: wrong current, weak, valid + persistence ----------
def test_change_password_full_flow(db):
    _clear_lockout(db, RECRUITER["email"])
    original = RECRUITER["password"]
    new_pw = "NewPass1Word"

    r = _login(**RECRUITER)
    assert r.status_code == 200
    token = r.json()["access_token"]

    # Wrong current password -> 400
    r1 = requests.post(f"{API}/auth/change-password", headers=_headers(token),
                       json={"current_password": "WrongCurrent1", "new_password": new_pw}, timeout=15)
    assert r1.status_code == 400
    assert "invalid_credentials" in str(r1.json())

    # Weak new password (no digit) -> 400 weak_password
    r2 = requests.post(f"{API}/auth/change-password", headers=_headers(token),
                       json={"current_password": original, "new_password": "NoDigitsHere"}, timeout=15)
    assert r2.status_code == 400
    assert "weak_password" in str(r2.json())

    # Too short -- pydantic-level 422
    r2b = requests.post(f"{API}/auth/change-password", headers=_headers(token),
                        json={"current_password": original, "new_password": "Ab1"}, timeout=15)
    assert r2b.status_code in (400, 422)

    # Valid change -> success
    r3 = requests.post(f"{API}/auth/change-password", headers=_headers(token),
                       json={"current_password": original, "new_password": new_pw}, timeout=15)
    assert r3.status_code == 200, r3.text

    # Persistence: new password logs in, old one does not
    try:
        r_new = _login(RECRUITER["email"], new_pw)
        assert r_new.status_code == 200
        r_old = requests.post(f"{API}/auth/login",
                              json={"email": RECRUITER["email"], "password": original}, timeout=10)
        assert r_old.status_code == 401
    finally:
        # Revert password so other suites keep working
        _clear_lockout(db, RECRUITER["email"])
        r_login2 = _login(RECRUITER["email"], new_pw)
        tok2 = r_login2.json()["access_token"]
        revert = requests.post(f"{API}/auth/change-password", headers=_headers(tok2),
                               json={"current_password": new_pw, "new_password": original}, timeout=15)
        assert revert.status_code == 200


# ---------- 9. reset-password: policy + single-use + expiry ----------
def _seed_reset_token(db, user_id, expired=False, used=False):
    raw = secrets.token_urlsafe(32)
    h = hashlib.sha256(raw.encode()).hexdigest()
    now = datetime.now(timezone.utc)
    expires_at = now - timedelta(minutes=5) if expired else now + timedelta(hours=1)
    doc = {
        "id": f"TEST_{secrets.token_hex(6)}",
        "user_id": user_id,
        "token_hash": h,
        "used": used,
        "created_at": now,
        "expires_at": expires_at,
    }
    db.password_reset_tokens.insert_one(doc)
    return raw, doc["id"]


def test_reset_password_weak_policy_rejected(db):
    uid = db.users.find_one({"email": RECRUITER["email"]})["id"]
    raw, doc_id = _seed_reset_token(db, uid)
    try:
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": raw, "password": "weakpass"}, timeout=15)
        assert r.status_code == 400
        assert "weak_password" in str(r.json())
    finally:
        db.password_reset_tokens.delete_one({"id": doc_id})


def test_reset_password_expired_token_rejected(db):
    uid = db.users.find_one({"email": RECRUITER["email"]})["id"]
    raw, doc_id = _seed_reset_token(db, uid, expired=True)
    try:
        r = requests.post(f"{API}/auth/reset-password",
                          json={"token": raw, "password": "ValidPass1"}, timeout=15)
        assert r.status_code == 400
        assert "invalid_token" in str(r.json()) or "expired" in str(r.json()).lower()
    finally:
        db.password_reset_tokens.delete_one({"id": doc_id})


def test_reset_password_single_use(db):
    _clear_lockout(db, RECRUITER["email"])
    uid = db.users.find_one({"email": RECRUITER["email"]})["id"]
    raw, doc_id = _seed_reset_token(db, uid)
    temp_pw = "TempReset1Pw"
    try:
        # 1st use succeeds
        r1 = requests.post(f"{API}/auth/reset-password",
                           json={"token": raw, "password": temp_pw}, timeout=15)
        assert r1.status_code == 200, r1.text
        # 2nd use fails
        r2 = requests.post(f"{API}/auth/reset-password",
                           json={"token": raw, "password": "AnotherPw2"}, timeout=15)
        assert r2.status_code == 400
        assert "invalid" in str(r2.json()).lower() or "used" in str(r2.json()).lower()
    finally:
        # cleanup token doc and restore recruiter password
        db.password_reset_tokens.delete_one({"id": doc_id})
        _clear_lockout(db, RECRUITER["email"])
        # login with temp and revert
        r_login = _login(RECRUITER["email"], temp_pw)
        if r_login.status_code == 200:
            tok = r_login.json()["access_token"]
            requests.post(f"{API}/auth/change-password", headers=_headers(tok),
                          json={"current_password": temp_pw,
                                "new_password": RECRUITER["password"]}, timeout=15)


# ---------- 10. RBAC endpoints re-check ----------
def test_recruiter_cannot_access_admin_endpoints(db):
    _clear_lockout(db, RECRUITER["email"])
    r = _login(**RECRUITER)
    assert r.status_code == 200
    token = r.json()["access_token"]
    a = requests.get(f"{API}/users", headers=_headers(token), timeout=10)
    b = requests.post(f"{API}/users", headers=_headers(token),
                     json={"email": "x@y.com", "name": "X",
                           "password": "Password1!", "role": "recruiter"}, timeout=10)
    # some other user id
    admin_login = _login(**ADMIN)
    admin_tok = admin_login.json()["access_token"]
    users = requests.get(f"{API}/users", headers=_headers(admin_tok), timeout=10).json()
    other_id = next(u["id"] for u in users if u["email"] != RECRUITER["email"])
    c = requests.get(f"{API}/users/{other_id}", headers=_headers(token), timeout=10)
    assert a.status_code == 403
    assert b.status_code == 403
    assert c.status_code == 403
