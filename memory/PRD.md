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

## Implemented (2026-06 / Prompts 11-34 — Full CRM module suite)
- Follow-ups (11): tabbed board (Due Today/Overdue/Tomorrow/Upcoming/Missed/Completed) with live counts, search + recruiter filter, Complete dialog (schedule-next OR move-to-final with reason/joining rules), Reschedule (supersedes prior), delete; timezone-safe overdue.
- Tasks (12): summary cards, categories, priority/status filters, in-progress/done/reopen, edit/delete, audited.
- Applications inbox (13): list/shortlist/convert-to-lead (transactional + idempotent — re-convert returns existing lead, no dup), preserves source/UTM/campaign, archive.
- Interviews (14): All/Tomorrow tabs, inline stage + confirmation, edit/reschedule; Joinings (15): full status/confirmation pipeline, expected/actual date, salary, remarks; both update lead status via shared service.
- Jobs (16), Clients (17 with submitted/interviewed/selected/joined stats), Vendors (18 with stages + industry + summary cards) — CRUD via reusable ResourceScreen, archive over hard-delete, linked counts.
- Lead Sources & Marketing (19): channel KPIs + distribution + admin webhook simulation. Unified Templates (20): WhatsApp/Email tabs, variable insert + validation + preview + copy-formatted + duplicate (single templates collection).
- Reports (22): Targets, Leaderboard (explicit score formula), Funnel, Lead Aging buckets, Missed Follow-ups — server-side aggregates. Action Required (23): 9 live exception cards. Lead Inbox (24): source summary + chips.
- Integrations (25): AES/Fernet-encrypted secrets at rest, write-only fields, masked metadata returned (raw never), test/disconnect, audited, recruiter-blocked. Import (26): XLSX template, CSV/XLSX upload → batch preview → mapping/rules → idempotent chunked commit with per-row invalid/dup handling.
- Notifications (27): per-user, unread count, mark read/all. Lead Tags (30): color catalog + counts + rename cascade. Global search (32) scope-safe. Centralized assignment/duplicate/status/SLA services (33/34) reused across modules.
- Backend enforcement: every module scoped + permission-gated + audited; recruiter isolation verified (403 on integrations/reports/import/vendors/cross-recruiter).
- Tests: 33/33 backend pytest (test_modules_prompts11to34.py) + full frontend E2E. Zero critical/minor blocking issues.

## Implemented (2026-06 / Prompts 6-10 — Leads Master Grid, Add/Edit, Detail Drawer, Dialer, Disposition)
- Leads master grid (All Leads / My Leads): 15 saved-view chips (All, Fresh, Not Called, Today's Follow-ups, Overdue, No Follow-up, No Answer, Interested, Hot, Interviews, Attendance Pending, Selected, Joining This Week, Joined, Rejected/Lost) resolved server-side; filters (search name/phone/email/city, priority, status, source, tag, recruiter) with Clear-Filters active count; server-side pagination + sort; columns Candidate/Phone/Priority/Status/Tags/Recruiter/Next Follow-up/Actions; row flags (invalid phone, duplicate phone, overdue, no follow-up); row actions Call/Disposition/WhatsApp/Tags/Edit/Archive; bulk select (row + page) with Assign/Transfer/Auto-distribute/Clear; top actions Add/Export CSV/Auto-distribute (permission-gated).
- Add/Edit Lead dialog: full field set (name, phone, alt phone, email, city, age, gender, qualification, experience, salaries, notice period, source, role, priority, assigned recruiter [hidden for recruiter], client, job, notes); create-only first follow-up (default tomorrow 10:00, reason 'First call'); duplicate check on phone blur + submit with Cancel/Open Existing/Create-as-flagged-duplicate; validation.
- Lead Detail Drawer (360°): header (name, lead code, priority, status, closed badge, invalid/duplicate warnings, tags), follow-up banner (overdue/next/none/closed) with Add/Reschedule, primary actions (Call, Disposition, WhatsApp, Edit, Change Status w/ reason+joining prompts, Assign, Archive), full detail fields incl. lead age; Notes CRUD (own-only for non-admin, author+timestamp); Follow-up history (pending/overdue/completed/superseded); immutable Activity timeline written by backend services.
- Call Action modal (reusable): candidate context, Copy Number, explicit tel: dial (primary+alt), WhatsApp, Start/Pause/Reset timer passing measured duration into disposition. No auto-dial. QR intentionally skipped (user choice).
- Call Disposition engine (transactional): 8 connected + 7 not-connected outcomes; auto-final (Not Interested->not_interested, Invalid Number->invalid); mandatory next follow-up for callbacks/active leads with quick buttons; interview block (datetime+client+job+type) -> lineup; Selected requires expected joining; lost statuses require closure reason; one submit creates call + status change + follow-up complete/create + interview + joining + activity + audit. MongoDB is standalone so a transaction helper (core/transactions.py) uses real txns when a replica set exists, else validated-sequential.
- Data rules enforced: recruiters scoped to own leads (403 on cross-recruiter GET/bulk), bulk APIs authorize every record, all search/filter/pagination/export server-side and scope-respecting.
- Tests: 29/29 backend pytest (tests/test_recruitment_prompts6to10.py) + full frontend E2E (admin + recruiter RBAC). Zero open bugs.
- Free-text client/job fields (user choice); auto-distribute round-robin across active recruiters/TLs in scope.

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
