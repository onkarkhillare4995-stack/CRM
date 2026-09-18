import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict
from pydantic import BaseModel, Field, EmailStr


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


ROLES = ("admin", "team_leader", "recruiter")


# ---------- Users ----------
class UserPublic(BaseModel):
    id: str
    email: EmailStr
    name: str
    role: str
    phone: Optional[str] = None
    team_id: Optional[str] = None
    manager_id: Optional[str] = None
    is_active: bool = True
    permission_overrides: Dict[str, List[str]] = Field(default_factory=lambda: {"allow": [], "deny": []})
    avatar_url: Optional[str] = None
    last_login_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class UserCreate(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=120)
    password: str = Field(min_length=8, max_length=128)
    role: str
    phone: Optional[str] = None
    team_id: Optional[str] = None
    manager_id: Optional[str] = None


class UserUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    role: Optional[str] = None
    phone: Optional[str] = None
    team_id: Optional[str] = None
    manager_id: Optional[str] = None
    is_active: Optional[bool] = None
    avatar_url: Optional[str] = None


class PermissionOverrideUpdate(BaseModel):
    allow: List[str] = Field(default_factory=list)
    deny: List[str] = Field(default_factory=list)


# ---------- Auth ----------
class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8, max_length=128)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class GoogleAuthRequest(BaseModel):
    id_token: str


# ---------- Roles ----------
class RoleUpdate(BaseModel):
    permissions: List[str]


# ---------- Settings ----------
class OrgSettingsUpdate(BaseModel):
    company_name: Optional[str] = None
    timezone: Optional[str] = None
    date_format: Optional[str] = None
