import os
from pathlib import Path
from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")


class Settings:
    """Central config. All values sourced from environment only."""

    def __init__(self) -> None:
        self.mongo_url: str = os.environ["MONGO_URL"]
        self.db_name: str = os.environ["DB_NAME"]
        self.jwt_secret: str = os.environ["JWT_SECRET"]
        self.admin_email: str = os.environ["ADMIN_EMAIL"].lower().strip()
        self.admin_password: str = os.environ["ADMIN_PASSWORD"]
        self.cors_origins = [
            o.strip() for o in os.environ.get("CORS_ORIGINS", "*").split(",") if o.strip()
        ]
        # Seed demo (non-admin) accounts flag
        self.seed_demo: bool = os.environ.get("SEED_DEMO", "true").lower() == "true"

        self.jwt_algorithm = "HS256"
        self.access_token_ttl_minutes = 60 * 8  # 8h working session
        self.refresh_token_ttl_days = 7
        self.max_failed_logins = 10
        self.lockout_minutes = 15

        # Public frontend origin for building reset links (email).
        self.frontend_url = (
            os.environ.get("FRONTEND_URL")
            or next((o for o in self.cors_origins if o and o != "*"), "")
        ).rstrip("/")

        # Email provider (Emergent-managed Resend). Enabled only when key present.
        self.email_key = os.environ.get("EMERGENT_EMAIL_KEY")
        self.email_from_name = os.environ.get("EMAIL_FROM_NAME", "OAKsphere Recruitment CRM")
        self.email_reply_to = os.environ.get("EMAIL_REPLY_TO")
        self.email_enabled = bool(self.email_key)

        # Google OIDC (optional). Enabled only when a client id is configured.
        self.google_client_id = os.environ.get("GOOGLE_CLIENT_ID", "").strip()
        self.google_enabled = bool(self.google_client_id)


settings = Settings()
