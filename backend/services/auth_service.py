"""Auth business logic: login (+brute force), sessions, password reset."""
import logging
from datetime import datetime, timezone, timedelta
from core.config import settings
from core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    generate_reset_token,
    hash_token,
    validate_password_policy,
)
from core.errors import AppError
from models.entities import new_id, now_utc

logger = logging.getLogger("app.auth")


def _clean_user(user: dict) -> dict:
    user = dict(user)
    user.pop("_id", None)
    user.pop("password_hash", None)
    return user


async def _check_lockout(db, identifier: str) -> None:
    rec = await db.login_attempts.find_one({"identifier": identifier})
    if not rec:
        return
    locked_until = rec.get("locked_until")
    if locked_until:
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if locked_until > now_utc():
            raise AppError(
                "rate_limited",
                "Too many failed attempts. Try again later.",
                429,
            )


async def _register_failure(db, identifier: str) -> None:
    rec = await db.login_attempts.find_one({"identifier": identifier})
    count = (rec.get("count", 0) if rec else 0) + 1
    update = {"count": count, "last_attempt": now_utc()}
    if count >= settings.max_failed_logins:
        update["locked_until"] = now_utc() + timedelta(minutes=settings.lockout_minutes)
        update["count"] = 0
    await db.login_attempts.update_one(
        {"identifier": identifier}, {"$set": update}, upsert=True
    )


async def _clear_failures(db, identifier: str) -> None:
    await db.login_attempts.delete_one({"identifier": identifier})


async def authenticate(db, email: str, password: str, ip: str) -> dict:
    email = email.lower().strip()
    identifier = f"{ip}:{email}"
    await _check_lockout(db, identifier)

    user = await db.users.find_one({"email": email})
    if not user or not verify_password(password, user.get("password_hash", "")):
        await _register_failure(db, identifier)
        raise AppError("invalid_credentials", "Invalid email or password", 401)

    if not user.get("is_active", True):
        await _register_failure(db, identifier)
        raise AppError("account_disabled", "Account is deactivated", 403)

    await _clear_failures(db, identifier)
    return user


async def create_session(db, user: dict, ip: str, user_agent: str) -> dict:
    session_id = new_id()
    expires_at = now_utc() + timedelta(days=settings.refresh_token_ttl_days)
    await db.sessions.insert_one(
        {
            "id": session_id,
            "user_id": user["id"],
            "ip": ip,
            "user_agent": user_agent,
            "revoked": False,
            "created_at": now_utc(),
            "expires_at": expires_at,
        }
    )
    await db.users.update_one({"id": user["id"]}, {"$set": {"last_login_at": now_utc()}})
    access = create_access_token(user["id"], session_id, user["role"])
    refresh = create_refresh_token(user["id"], session_id)
    return {"access_token": access, "refresh_token": refresh, "session_id": session_id}


async def revoke_session(db, session_id: str) -> None:
    await db.sessions.update_one({"id": session_id}, {"$set": {"revoked": True}})


async def session_is_valid(db, session_id: str) -> bool:
    s = await db.sessions.find_one({"id": session_id})
    if not s or s.get("revoked"):
        return False
    exp = s.get("expires_at")
    if exp:
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < now_utc():
            return False
    return True


async def create_password_reset(db, email: str) -> dict | None:
    """Create a single active one-time reset token. Returns {raw, user} or None."""
    email = email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        return None  # do not reveal existence
    # Enforce a single active token per user.
    await db.password_reset_tokens.delete_many({"user_id": user["id"], "used": False})
    raw, token_hash = generate_reset_token()
    await db.password_reset_tokens.insert_one(
        {
            "id": new_id(),
            "user_id": user["id"],
            "token_hash": token_hash,
            "used": False,
            "created_at": now_utc(),
            "expires_at": now_utc() + timedelta(hours=1),
        }
    )
    return {"raw": raw, "user": user}


async def reset_password(db, raw_token: str, new_password: str) -> dict:
    validate_password_policy(new_password)
    token_hash = hash_token(raw_token)
    rec = await db.password_reset_tokens.find_one({"token_hash": token_hash})
    if not rec or rec.get("used"):
        raise AppError("invalid_token", "Invalid or already-used reset token", 400)
    exp = rec.get("expires_at")
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if exp and exp < now_utc():
        raise AppError("invalid_token", "Reset token has expired", 400)

    user = await db.users.find_one({"id": rec["user_id"]})
    if not user:
        raise AppError("invalid_token", "Invalid reset token", 400)

    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(new_password), "updated_at": now_utc()}},
    )
    await db.password_reset_tokens.update_one(
        {"id": rec["id"]}, {"$set": {"used": True, "used_at": now_utc()}}
    )
    # revoke all active sessions for safety
    await db.sessions.update_many({"user_id": user["id"]}, {"$set": {"revoked": True}})
    return user


async def change_password(db, user: dict, current_password: str, new_password: str) -> None:
    """Change password for a logged-in user. Keeps the current session, revokes others."""
    full = await db.users.find_one({"id": user["id"]})
    if not full or not verify_password(current_password, full.get("password_hash", "")):
        raise AppError("invalid_credentials", "Current password is incorrect", 400)
    if verify_password(new_password, full.get("password_hash", "")):
        raise AppError("invalid_operation", "New password must differ from the current one", 400)
    validate_password_policy(new_password)
    await db.users.update_one(
        {"id": user["id"]},
        {"$set": {"password_hash": hash_password(new_password), "updated_at": now_utc()}},
    )
    # Revoke all OTHER sessions; keep the caller's current session active.
    await db.sessions.update_many(
        {"user_id": user["id"], "id": {"$ne": user.get("session_id")}},
        {"$set": {"revoked": True}},
    )
