from core.config import settings  # loads .env first
from core.logging_config import configure_logging, correlation_id_ctx, new_correlation_id

configure_logging()

import logging
from fastapi import FastAPI, APIRouter, Request
from starlette.middleware.cors import CORSMiddleware

from core.database import db, ensure_indexes, close
from core.errors import register_exception_handlers
from services.seed_service import run_seed

from api.auth_routes import router as auth_router
from api.user_routes import router as user_router
from api.role_routes import router as role_router
from api.audit_routes import router as audit_router
from api.dashboard_routes import dashboard_router, myday_router
from api.settings_routes import router as settings_router
from api.recruitment_routes import router as recruitment_router
from api.modules_routes import router as modules_router

logger = logging.getLogger("app.main")

app = FastAPI(title="OAKsphere Recruitment CRM API")

api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"service": "recruitment-crm", "status": "ok"}


@api_router.get("/health")
async def health():
    return {"status": "healthy"}


api_router.include_router(auth_router)
api_router.include_router(user_router)
api_router.include_router(role_router)
api_router.include_router(audit_router)
api_router.include_router(dashboard_router)
api_router.include_router(myday_router)
api_router.include_router(settings_router)
api_router.include_router(recruitment_router)
api_router.include_router(modules_router)

app.include_router(api_router)


@app.middleware("http")
async def correlation_middleware(request: Request, call_next):
    cid = request.headers.get("x-correlation-id") or new_correlation_id()
    correlation_id_ctx.set(cid)
    response = await call_next(request)
    response.headers["x-correlation-id"] = cid
    return response


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-XSS-Protection"] = "0"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-correlation-id"],
)

register_exception_handlers(app)


@app.on_event("startup")
async def startup():
    await ensure_indexes()
    await run_seed(db)
    logger.info("Startup complete. CORS origins=%s", settings.cors_origins)


@app.on_event("shutdown")
async def shutdown():
    await close()
