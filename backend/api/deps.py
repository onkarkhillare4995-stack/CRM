from fastapi import Request, Depends
from core.security import decode_token
from core.errors import AppError
from core.database import db
from services import auth_service, permission_service
import jwt


def get_client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _extract_token(request: Request) -> str | None:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.cookies.get("access_token")


async def get_current_user(request: Request) -> dict:
    token = _extract_token(request)
    if not token:
        raise AppError("unauthenticated", "Not authenticated", 401)
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        raise AppError("token_expired", "Session expired", 401)
    except jwt.InvalidTokenError:
        raise AppError("invalid_token", "Invalid token", 401)

    if payload.get("type") != "access":
        raise AppError("invalid_token", "Invalid token type", 401)

    session_id = payload.get("sid")
    if not session_id or not await auth_service.session_is_valid(db, session_id):
        raise AppError("session_revoked", "Session is no longer valid", 401)

    user = await db.users.find_one({"id": payload.get("sub")})
    if not user:
        raise AppError("unauthenticated", "User not found", 401)
    if not user.get("is_active", True):
        raise AppError("account_disabled", "Account is deactivated", 403)

    user.pop("password_hash", None)
    user["session_id"] = session_id
    return user


def require_permission(permission: str):
    async def _dep(user: dict = Depends(get_current_user)) -> dict:
        await permission_service.require_permission_or_raise(db, user, permission)
        return user

    return _dep
