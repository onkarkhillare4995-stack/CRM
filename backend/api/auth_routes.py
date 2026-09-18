import logging
import httpx
from fastapi import APIRouter, Request, Response, Depends
from core.database import db
from core.config import settings
from core.errors import AppError
from core.logging_config import correlation_id_ctx
from models.entities import (
    LoginRequest, ForgotPasswordRequest, ResetPasswordRequest,
    ChangePasswordRequest, GoogleAuthRequest,
)
from services import auth_service, audit_service, permission_service, email_service
from services.user_service import public
from api.deps import get_current_user, get_client_ip

logger = logging.getLogger("app.auth.api")
router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookies(response: Response, tokens: dict) -> None:
    response.set_cookie(
        "access_token", tokens["access_token"], httponly=True, secure=True,
        samesite="none", max_age=settings.access_token_ttl_minutes * 60, path="/",
    )
    response.set_cookie(
        "refresh_token", tokens["refresh_token"], httponly=True, secure=True,
        samesite="none", max_age=settings.refresh_token_ttl_days * 86400, path="/",
    )


@router.post("/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    ip = get_client_ip(request)
    user = await auth_service.authenticate(db, payload.email, payload.password, ip)
    tokens = await auth_service.create_session(db, user, ip, request.headers.get("user-agent", ""))
    _set_auth_cookies(response, tokens)
    await audit_service.record(
        db, actor=user, action="auth.login", entity_type="session",
        entity_id=tokens["session_id"], ip=ip,
        user_agent=request.headers.get("user-agent"),
        correlation_id=correlation_id_ctx.get(),
    )
    data = public(user)
    permissions = sorted(await permission_service.get_effective_permissions(db, user))
    return {"user": data, "access_token": tokens["access_token"], "permissions": permissions}


@router.post("/logout")
async def logout(request: Request, response: Response, user: dict = Depends(get_current_user)):
    await auth_service.revoke_session(db, user["session_id"])
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")
    await audit_service.record(
        db, actor=user, action="auth.logout", entity_type="session",
        entity_id=user["session_id"], ip=get_client_ip(request),
        correlation_id=correlation_id_ctx.get(),
    )
    return {"ok": True}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    permissions = sorted(await permission_service.get_effective_permissions(db, user))
    return {"user": public(user), "permissions": permissions}


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    token = request.cookies.get("refresh_token")
    if not token:
        from core.errors import AppError
        raise AppError("unauthenticated", "No refresh token", 401)
    import jwt
    from core.security import decode_token, create_access_token
    from core.errors import AppError
    try:
        payload = decode_token(token)
    except jwt.InvalidTokenError:
        raise AppError("invalid_token", "Invalid refresh token", 401)
    if payload.get("type") != "refresh":
        raise AppError("invalid_token", "Invalid token type", 401)
    sid = payload.get("sid")
    if not sid or not await auth_service.session_is_valid(db, sid):
        raise AppError("session_revoked", "Session is no longer valid", 401)
    user = await db.users.find_one({"id": payload.get("sub")})
    if not user or not user.get("is_active", True):
        raise AppError("unauthenticated", "User unavailable", 401)
    access = create_access_token(user["id"], sid, user["role"])
    response.set_cookie(
        "access_token", access, httponly=True, secure=True, samesite="none",
        max_age=settings.access_token_ttl_minutes * 60, path="/",
    )
    return {"access_token": access}


@router.post("/forgot-password")
async def forgot_password(payload: ForgotPasswordRequest, request: Request):
    result = await auth_service.create_password_reset(db, payload.email)
    if result:
        link = f"{settings.frontend_url}/reset-password?token={result['raw']}"
        email_id = None
        if email_service.is_configured():
            try:
                email_id = await email_service.send_password_reset(
                    to=result["user"]["email"],
                    name=result["user"].get("name", "there"),
                    link=link,
                )
            except Exception as e:  # never reveal to caller; never log token
                logger.error("Password reset email failed to send: %s", e)
        else:
            logger.warning("Email provider not configured; reset email not sent.")
        # Audit: record the event WITHOUT the token or the link.
        await audit_service.record(
            db, actor=None, action="auth.forgot_password", entity_type="user",
            entity_id=result["user"]["id"],
            details={"email": payload.email.lower(), "email_sent": bool(email_id)},
            ip=get_client_ip(request), correlation_id=correlation_id_ctx.get(),
        )
    return {"message": "If that email exists, a reset link has been sent."}


@router.post("/reset-password")
async def reset_password(payload: ResetPasswordRequest, request: Request):
    user = await auth_service.reset_password(db, payload.token, payload.password)
    await audit_service.record(
        db, actor=user, action="auth.reset_password", entity_type="user",
        entity_id=user["id"], severity="warning", ip=get_client_ip(request),
        correlation_id=correlation_id_ctx.get(),
    )
    return {"message": "Password updated successfully."}


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest, request: Request,
    user: dict = Depends(get_current_user),
):
    await auth_service.change_password(db, user, payload.current_password, payload.new_password)
    await audit_service.record(
        db, actor=user, action="auth.change_password", entity_type="user",
        entity_id=user["id"], severity="warning", ip=get_client_ip(request),
        correlation_id=correlation_id_ctx.get(),
    )
    return {"message": "Password changed successfully."}


@router.get("/config")
async def auth_config():
    """Public config so the UI only shows genuinely-configured options."""
    return {"google_enabled": settings.google_enabled, "email_enabled": settings.email_enabled}


@router.post("/google")
async def google_login(payload: GoogleAuthRequest, request: Request, response: Response):
    if not settings.google_enabled:
        raise AppError("not_configured", "Google sign-in is not configured", 503)
    # Real OIDC verification against Google's token endpoint.
    async with httpx.AsyncClient(timeout=10) as client:
        r = await client.get(
            "https://oauth2.googleapis.com/tokeninfo", params={"id_token": payload.id_token}
        )
    if r.status_code != 200:
        raise AppError("invalid_token", "Invalid Google token", 401)
    info = r.json()
    if info.get("aud") != settings.google_client_id:
        raise AppError("invalid_token", "Google token audience mismatch", 401)
    if info.get("email_verified") not in (True, "true"):
        raise AppError("invalid_token", "Google email not verified", 401)
    email = (info.get("email") or "").lower().strip()
    user = await db.users.find_one({"email": email})
    if not user:
        raise AppError("no_account", "No account exists for this Google email", 403)
    if not user.get("is_active", True):
        raise AppError("account_disabled", "Account is deactivated", 403)
    ip = get_client_ip(request)
    tokens = await auth_service.create_session(db, user, ip, request.headers.get("user-agent", ""))
    _set_auth_cookies(response, tokens)
    await audit_service.record(
        db, actor=user, action="auth.login_google", entity_type="session",
        entity_id=tokens["session_id"], ip=ip,
        user_agent=request.headers.get("user-agent"), correlation_id=correlation_id_ctx.get(),
    )
    permissions = sorted(await permission_service.get_effective_permissions(db, user))
    return {"user": public(user), "access_token": tokens["access_token"], "permissions": permissions}
