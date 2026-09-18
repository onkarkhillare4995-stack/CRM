import bcrypt
import jwt
import re
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from core.config import settings
from core.errors import AppError


def validate_password_policy(password: str) -> None:
    """Strong password policy: >=8 chars with upper, lower, and a digit."""
    if len(password) < 8:
        raise AppError("weak_password", "Password must be at least 8 characters", 400)
    if not re.search(r"[A-Z]", password):
        raise AppError("weak_password", "Password must include an uppercase letter", 400)
    if not re.search(r"[a-z]", password):
        raise AppError("weak_password", "Password must include a lowercase letter", 400)
    if not re.search(r"\d", password):
        raise AppError("weak_password", "Password must include a number", 400)


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: str, session_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "sid": session_id,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_ttl_minutes),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_refresh_token(user_id: str, session_id: str) -> str:
    payload = {
        "sub": user_id,
        "sid": session_id,
        "type": "refresh",
        "exp": datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_ttl_days),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])


def generate_reset_token() -> tuple[str, str]:
    """Returns (raw_token, sha256_hash). Only the hash is stored at rest."""
    raw = secrets.token_urlsafe(32)
    return raw, hash_token(raw)


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()
