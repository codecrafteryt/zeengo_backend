# ZEENGO — Final Completion Plan

**Date:** 2026-10-03  
**Source of truth:** current source, Prisma schema/migrations, `docs/PRODUCTION_AUDIT.md`, live API/DB behavior.

Do not rebuild existing booking, ZN, finance, catalog, chat, SOS, or import systems.

---

## 1. Remaining blockers

| # | Blocker | Decision |
|---|---|---|
| 1 | Documents / object storage missing | Implement Document model + StorageService + authorized APIs + OPS tab + My Trip |
| 2 | Railway backend behind local `devel` | Document exact commits/migrations in `RELEASE_READINESS.md`. Do not push until that doc exists |
| 3 | Admin `devel` not on production `main` | Same — readiness only |
| 4 | Critical-path E2E missing | Add live HTTP e2e (test/local DB only) + IDOR suite |
| 5 | Stripe / FCM / Anthropic | Remain configuration-aware. Never fake success |
| 6 | Booking history coverage | History API exists; add itinerary / assignment / task / document audit writes |
| 7 | Staff audit-log API missing | `GET /audit-logs` for admin + ops_manager |
| 8 | Support dashboard 403 | **Intentional.** Support has no dashboard nav; home is `/clients`. Keep restricted; no broken nav |
| 9 | Schema drift class | Health live/ready + migrate-on-boot already present; add readiness schema probe |
| 10 | Roles page | Fixed `StaffRole` enum is the architecture. Clarify UX; no dynamic RBAC table |

---

## 2. Implementation order

1. Prisma Document + indexes + migrate  
2. Storage abstraction (`local` volume / `s3` when configured)  
3. Document API + MIME/size/auth  
4. OPS Booking Documents tab + customer My Trip documents  
5. Audit writes for itinerary, assignment, task, document  
6. `GET /audit-logs` + admin Audit Logs page  
7. Health `/system/health/live` + `/system/health/ready`  
8. Support / roles copy (no permission expansion)  
9. E2E: booking lifecycle + IDOR + documents  
10. Typecheck / lint / tests  
11. Update audit, completion report, release readiness  

---

## 3. Affected files / modules

**Backend** (`backend/zeengo_backend`)

- `prisma/schema.prisma` + new migration  
- `src/storage/*`  
- `src/documents/*`  
- `src/config/env.validation.ts`  
- `src/system/system.controller.ts`  
- `src/app.module.ts`  
- `src/itineraries/itineraries.service.ts`  
- `src/drivers/drivers.service.ts`  
- `src/tasks/tasks.service.ts`  
- `src/bookings/bookings.service.ts` (history related IDs + summaries)  
- `src/common/interceptors/response-envelope.interceptor.ts`  
- `test/*` e2e  

**Admin** (`frontend`)

- Booking Documents tab  
- `/audit-logs` (admin / ops_manager)  
- Roles page clarification  
- permissions / nav  

**Website** (`Website_frontend`)

- My Trip documents list + authorized download  

**Docs**

- `PRODUCTION_AUDIT.md` (append Final Verification)  
- `PRODUCTION_COMPLETION_REPORT.md`  
- `RELEASE_READINESS.md`  

---

## 4. Migrations required

`20261003200000_booking_documents`

- `DocumentCategory` enum  
- `documents` table (booking, client, uploader, storage key, category, visibility)  
- Indexes: `bookingId`, `clientId`, `createdAt`  
- `audit_logs.created_at` + `action` indexes (justified for staff query)

---

## 5. Tests required

- Document validation + authorization unit tests  
- Live HTTP e2e (skipped unless `LIVE_E2E=1` or local API): customer request → ZN → OPS confirm → My Trip  
- IDOR: customer A/B bookings + documents; driver scope; support cannot hit dashboard/admin  
- Payment record → finance collected → history  
- Health live/ready  

Never against production data.

---

## 6. Deployment requirements

- Do **not** push in this pass.  
- Production start remains `prisma migrate deploy` then Nest.  
- Env: existing secrets + `STORAGE_PROVIDER` / `STORAGE_LOCAL_DIR` or S3 keys.  
- `SEED_BOOTSTRAP_TOKEN` unset in production.  
- After a later approved deploy: `prisma migrate status`, zn-login, payments/history, dashboard Collected, documents upload/download.

---

## Roles / Support (product decision)

- Fixed `StaffRole` enum is authoritative. Backend remains the permission source.  
- Support may operate bookings, chat, SOS, catalog, clients.  
- Support must **not** see dashboard/finance/users/settings. Nav already excludes `/`.  
- Deep-link to `/` redirects Support to `/clients`. No unexplained 403 from sidebar.
