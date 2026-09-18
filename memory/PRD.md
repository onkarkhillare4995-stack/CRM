# Product Requirements Document — OAKsphere Recruitment CRM

## Original Problem Statement
Build a NEW production-grade Recruitment CRM from scratch, delivered over 37 feature prompts, one at a time. Roles: Admin, Team Leader, Recruiter with configurable granular permissions. Backend must enforce all permissions and record-level scoping (recruiters cannot access other recruiters' records via ID/URL/payload tampering). Immutable audit log, confirmation dialogs for destructive actions, preserve historical data on deactivation/archival, transactional multi-record operations, no mocks/fake buttons, no CMS. External careers site may push candidates via public recruitment APIs (future).

## User Choices
- Database: MongoDB (platform-native; adapted from the brief's PostgreSQL request)
- Auth: JWT custom auth (email + password) + revocable server-side sessions
- Stack: FastAPI + React (JS) + MongoDB
- Demo accounts for all three roles
- Owner/admin account email: okhillare23@gmail.com

## Architecture
- Backend: FastAPI, clean layering — `core/` (config, database, security, logging, errors), `models/`, `services/` (auth, user, permission, scope, audit, seed), `api/` (deps + routers). All routes under `/api`.
- Frontend: React + react-router (routes under `/admin/*`), react-query available, Tailwind + shadcn/ui, next-themes, sonner toasts. Auth via bearer token (localStorage) + httpOnly cookies; AuthContext.
- Data model (Mongo): users, sessions, password_reset_tokens, login_attempts, roles, audit_logs, organization_settings. UUID string ids; timezone-aware datetimes; indexes + TTL for sessions/reset tokens.

## Core Requirements (static)
- RBAC with DB-backed role permissions + per-user allow/deny overrides; admin always full.
- Backend enforcement via `require_permission()` dependency on every protected route.
- Data scoping via `scope_service`: admin=all, team_leader=team, recruiter=self; record-level guards.
- Immutable append-only audit log for meaningful actions.
- Confirmation dialogs for destructive actions; deactivation preserves records + revokes sessions.

## Implemented (2026-06 / Prompts 3-6 — Shell, Access Control, Dashboard, My Day)
- Full granular permission model (dashboard/leads/calls/followups/tasks/interviews/joinings/jobs/clients/vendors/templates/recruiters/users/reports/integrations/imports/settings/audit). Role migration via perm_model=v2.
- App shell: 3-group role-aware sidebar, mobile drawer, header (product label, Quick Actions, notification bell w/ live unread count, global candidate search, user menu). Canonical /admin/* routes.
- Admin Access Control (/admin/recruiters): Users, Roles, Permissions, Team Structure, Security/Sessions tabs. Role create/clone/rename/reset/delete + granular checkbox matrix; effective-permissions viewer; session revoke. Security: last-admin protection, no self-role-change, no self-escalation, admin role immutable, sessions revoked on role change; all changes audited old->new.
- Recruitment backbone (source-of-truth): leads + centralized status engine, calls/dispositions, follow-ups, tasks, interviews, joinings. Permission-aware scoping (admin=all, TL=team, recruiter=own); phone normalized separately for matching (display never mutated); transactional bulk transfer.
- Dashboard: 12 clickable KPI cards (carry filter state), funnel, leaderboard, recruiter comparison, date/recruiter filters, timezone-safe today, indexed aggregates.
- My Day: 7 live work queues (data-driven completion) + progress; per-candidate actions via shared LeadDrawer (Call, Disposition, WhatsApp deep-link, Tags, status, follow-up).
- Shared LeadDrawer/Add Lead/Add Task reused across Leads, Calling List, Follow-ups, Tasks, My Day (no duplicated logic).
- Tests: 21/21 backend pytest (tests/test_recruitment_prompts3to6.py) + full frontend E2E across roles. Exact seeded KPI/My-Day counts asserted.

## Implemented (2026-06 / Prompt #2 — Production Authentication)
- Strong password policy (>=8, upper, lower, digit) enforced backend + frontend on reset & change-password.
- Change Password for logged-in users (`/api/auth/change-password`): verifies current, keeps current session, revokes others; UI dialog in user menu with live policy checklist.
- Login rate limit raised to 10 fails/15 min per ip:email; disabled-account probes also throttled.
- Password reset emails now sent via Emergent-managed Resend (`services/email_service.py`) with anti-phishing guardrail gate; no token/link ever logged. Single active reset token per user; hashed at rest, 1h expiry, single-use; all sessions revoked after reset.
- Auth config endpoint (`/api/auth/config`) + gated Google OIDC endpoint (`/api/auth/google`, real tokeninfo verification, 503 when unconfigured); Google button hidden unless configured.
- Login show/hide password; user menu shows name/email/role. Security events audited without secrets.
- Tests: 13/13 new auth pytest cases pass (`tests/test_auth_prompt2.py`); frontend flows verified.

## Implemented (2026-06 / Prompt #1 — Foundation)
- JWT auth: login, logout (session revoke), /me, refresh, forgot-password (hashed one-time TTL token), reset-password. Brute-force lockout (5 fails / 15 min). bcrypt hashing.
- Users CRUD with scoping, role/manager validation, activate/deactivate (session revocation), permission overrides.
- Roles: catalog + list + update (admin locked). Granular permission matrix.
- Audit log viewer: filter (action/severity/date/search), expandable JSON detail, CSV export, pagination.
- Dashboard stats (scoped) + recent activity. Organization settings.
- Frontend: split-screen login, forgot/reset pages, admin shell (dark sidebar + glass topbar), dashboard, users, roles, audit, settings, honest placeholders for Leads/Jobs/Tasks. Theme toggle.
- Security headers, correlation-id middleware, structured logging, central error format.
- Tests: 25 passing (10 in-process pytest + 15 public-API). Frontend E2E verified for all 3 roles.

## Backlog (future prompts, P-order)
- P0: Leads (+ notes, activities, calls, tags), candidate assignment service, status/stage engine, public recruitment intake API.
- P1: Clients, Jobs, Applications, Interviews, Joinings, Vendors.
- P1: Followups & Tasks, Notifications, Communication Templates.
- P2: Import batches/rows, recruiter transfer (transactional), lead conversion, auto-distribution, integrations, marketing sources.

## Next Tasks
- Await Prompt #2 and implement only that feature, reusing the foundation services.

## Test Credentials
See /app/memory/test_credentials.md
