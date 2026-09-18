"""Business-rule + API integration tests. Run: cd /app/backend && python -m pytest tests -q"""
import os
import asyncio
import pytest
from httpx import AsyncClient, ASGITransport

os.environ.setdefault("SEED_DEMO", "true")

import server  # noqa: E402
from core.database import db  # noqa: E402
from services import permission_service  # noqa: E402

ADMIN = {"email": "okhillare23@gmail.com", "password": "Admin@Oak2026"}
LEAD = {"email": "teamlead@oaksphere.demo", "password": "TeamLead@123"}
RECRUITER = {"email": "recruiter@oaksphere.demo", "password": "Recruiter@123"}


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest.fixture(scope="module")
async def client():
    await server.startup()
    transport = ASGITransport(app=server.app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def _login(client, creds):
    r = await client.post("/api/auth/login", json=creds)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _h(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- permission resolution (unit) ----------
@pytest.mark.anyio
async def test_effective_permissions_admin_all(client):
    admin = await db.users.find_one({"email": ADMIN["email"]})
    perms = await permission_service.get_effective_permissions(db, admin)
    assert set(perms) == set(permission_service.ALL_PERMISSIONS)


@pytest.mark.anyio
async def test_recruiter_defaults(client):
    rec = await db.users.find_one({"email": RECRUITER["email"]})
    perms = await permission_service.get_effective_permissions(db, rec)
    assert perms == {"dashboard.view"}


# ---------- auth smoke ----------
@pytest.mark.anyio
async def test_login_and_me(client):
    token = await _login(client, ADMIN)
    r = await client.get("/api/auth/me", headers=_h(token))
    assert r.status_code == 200
    assert r.json()["user"]["role"] == "admin"


@pytest.mark.anyio
async def test_login_bad_password(client):
    r = await client.post("/api/auth/login", json={"email": ADMIN["email"], "password": "wrong"})
    assert r.status_code == 401


@pytest.mark.anyio
async def test_me_requires_auth(client):
    r = await client.get("/api/auth/me")
    assert r.status_code == 401


# ---------- authorization denial ----------
@pytest.mark.anyio
async def test_recruiter_cannot_create_user(client):
    token = await _login(client, RECRUITER)
    r = await client.post("/api/users", headers=_h(token), json={
        "email": "x@y.com", "name": "X", "password": "password123", "role": "recruiter"})
    assert r.status_code == 403


@pytest.mark.anyio
async def test_recruiter_cannot_list_users(client):
    # recruiter lacks users.view entirely
    token = await _login(client, RECRUITER)
    r = await client.get("/api/users", headers=_h(token))
    assert r.status_code == 403


@pytest.mark.anyio
async def test_team_leader_cannot_access_admin_record(client):
    admin_token = await _login(client, ADMIN)
    admin = (await client.get("/api/users?role=admin", headers=_h(admin_token))).json()[0]
    token = await _login(client, LEAD)
    r = await client.get(f"/api/users/{admin['id']}", headers=_h(token))
    assert r.status_code == 403


@pytest.mark.anyio
async def test_team_leader_scope(client):
    token = await _login(client, LEAD)
    r = await client.get("/api/users", headers=_h(token))
    assert r.status_code == 200
    emails = {u["email"] for u in r.json()}
    assert LEAD["email"] in emails
    assert ADMIN["email"] not in emails  # admin not in team scope


# ---------- session revocation ----------
@pytest.mark.anyio
async def test_logout_revokes_session(client):
    token = await _login(client, ADMIN)
    assert (await client.get("/api/auth/me", headers=_h(token))).status_code == 200
    await client.post("/api/auth/logout", headers=_h(token))
    assert (await client.get("/api/auth/me", headers=_h(token))).status_code == 401
