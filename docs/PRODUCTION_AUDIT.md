# ZEENGO — Production Audit

**Date:** 2026-10-03  
**Method:** Source inspection of `frontend`, `Website_frontend`, `backend/zeengo_backend` (Prisma, controllers, services, Railway logs). Not a paper review of older docs.

**Repos (separate git roots):**

| App | Path | Current branch (local) | Production |
|---|---|---|---|
| Admin / OPS | `frontend/` | `devel` (ahead of `origin/devel` by 2) | Last merge to `main` is older than current `devel` |
| Customer website | `Website_frontend/` | `devel` (ahead of `origin/devel` by 2) | Separate deploy |
| API | `backend/zeengo_backend/` | `devel` (ahead of `origin/devel` by 4) | Railway `zeengo_backend` on commit `12e8d93` (2026-09-30) |

---

## A. Architecture

### Frontend (admin / OPS)

Vite + React 19 + React Router + TanStack Query + Socket.IO client. Official staff UI lives only in `/frontend`. Routes in `frontend/src/app/router.tsx`. Talks to Nest at `/api/v1` and `/ws`.

### Customer website

Existing Vite app in `/Website_frontend`. Approved customer IA: Home, Around, Explore, My Trip, Account, catalog, booking flow. Calls the **same** Nest API (`/client/v2/*`, `/client/bookings/request`, `/auth/client/zn-login`, `/client/*`).

### Backend

NestJS, global prefix `/api/v1`, OpenAPI `/api/docs`, Socket.IO `/ws`. Prisma/PostgreSQL. Redis for staff refresh tokens, dashboard cache, BullMQ. No Socket.IO Redis adapter (single instance).

### Database

38 Prisma models. Latest local migrations include booking request workflow (`20260930180000`) and public catalog (`20261001090000`). Production applied migrations through the 2026-09-30 start-script fix. Local `devel` still has catalog + `paid_at` index migrations that Railway has not deployed.

### Realtime

`RealtimeGateway` namespace `/ws`, JWT handshake. Events include `booking.*`, `payment.*`, `message.*`, `notification.new`, `sos.*`, `task.updated`, `assignment.*`. Admin invalidates React Query on those events. Website only joins chat rooms.

### Integrations

| Integration | Status |
|---|---|
| Stripe | Real SDK when `STRIPE_SECRET_KEY` is a live `sk_`. Production create-link returns 503 if missing. Dev placeholder URL only when `NODE_ENV ≠ production`. |
| FCM | Stub if credentials missing. Login no longer fails if token persist throws. |
| Anthropic / AI | Config-aware. Admin `/ai-parser` and `/russia-chatbot` are gated “unavailable” pages. |
| CBR FX | Website money page calls public CBR (not Zeengo DB). |
| Object storage / documents | **Not implemented.** |

### Deployment

Railway project `overflowing-elegance`: Postgres + Redis + `zeengo_backend`. Start: `scripts/start-prod.sh` → `prisma migrate deploy` then Nest. Admin/website frontends are separate deploys.

---

## B. Feature matrix

Classification: **COMPLETE** | **PARTIAL** | **BROKEN** | **MOCK** | **PLACEHOLDER** | **MISSING** | **PRODUCTION BLOCKER**

| Feature | UI | API | DB | Realtime | Auth | Production ready | Missing |
|---|---|---|---|---|---|---|---|
| Staff auth | Yes | Yes | Yes | — | JWT + Redis refresh | **COMPLETE** | — |
| Client ZN login | Yes (website + `/client`) | Yes | Yes | — | JWT bound to booking | **PARTIAL** | Sequential ZN is guessable; phone required unless `ALLOW_ZN_ONLY_LOGIN` |
| Customer booking request | Yes (`BookingFlowPages`) | `POST /client/bookings/request` | `request_status`, `source`, ZN | `booking.*` | Public create | **COMPLETE** (local); **PARTIAL** on prod until `devel` is deployed | Deploy + migrate |
| Booking + ZN lifecycle | Yes | Yes | Unique `zn_code` | Yes | Staff write / client scoped | **COMPLETE** | — |
| OPS dashboard | Yes | `/dashboard/overview` | Aggregates | Cache + socket invalidate | admin / ops_manager only | **PARTIAL** | Was showing $0 “today” while Finance showed all-time cash; collected is now first-class |
| Finance / payments | Yes | `/finance/*`, `/payments/*` | `payments` | `payment.*` | Role split | **PARTIAL** | Stripe needs prod key; chart empty for days with no payments (expected) |
| Hotels / activities / services / guides / B2B | Admin vendor typed pages + website catalog | `/vendors`, `/client/v2/catalog/*` | `vendors` + rooms / vehicles / trains | vendor events | Staff + public catalog | **PARTIAL** | Catalog fields live on `devel` not Railway `12e8d93` |
| Drivers | Yes | Yes | profiles, assignments, GPS | Yes | Staff + driver self | **COMPLETE** | GPS empty if never reported |
| Clients | Yes | Yes | Yes | — | Staff | **COMPLETE** | — |
| Itinerary / daily ops | Yes | Yes | `itinerary_items`, day plans | Weak | Staff | **COMPLETE** | Customer My Trip depends on portal mapping |
| Tasks | Yes | Yes | Yes | `task.updated` | Staff + portal | **COMPLETE** | — |
| Chat | Admin + website guest | Yes | conversations/messages | Yes | Scoped | **COMPLETE** | Translation queue is stub if worker fails |
| Notifications | Yes | Yes | Yes | `notification.new` | Recipient scoped | **PARTIAL** | FCM often unconfigured |
| Edit requests | Yes | Yes | Yes | Yes | Staff + client create | **COMPLETE** | — |
| VIP | Yes | Yes | booking flags | — | Mixed | **COMPLETE** | Price default from env |
| SOS | Yes | Yes | Yes | Yes | Client create / staff resolve | **COMPLETE** | — |
| Excel / master-data import | Yes | preview + commit | `master_data_imports` | — | admin / ops_manager | **COMPLETE** | 25MB in-memory upload |
| Packages | Yes | Yes | Yes | — | Staff | **COMPLETE** | — |
| Users / roles | Users yes; Roles page | Users API | `StaffRole` enum | — | admin | **PARTIAL** | Roles page is UI over fixed enum, not a dynamic RBAC table |
| Documents | Empty states | No | No | — | — | **MISSING** | No Document model or storage |
| Booking history (admin tab) | Yes | `GET /bookings/:id/history` | `audit_logs` | — | Same as booking read | **COMPLETE** | Documents still missing |
| AI parser / Russia chatbot | Gated pages | `/ai` when key set | — | — | Staff | **PLACEHOLDER** | Do not present as live AI |
| E2E suite | — | — | — | — | — | **MISSING** | Unit/service tests exist; no critical-path Playwright/E2E |
| Seed-demo endpoint | — | `POST /system/seed-demo` | — | — | Token | **PRODUCTION BLOCKER** (mitigated) | Hardcoded token now refused in production unless `SEED_BOOTSTRAP_TOKEN` is set |

---

## C. Data model audit

**Sound**

- Booking is the hub. ZN unique. Payments `Restrict` on booking delete.
- Customer request fields (`request_status`, `source`, `children_count`, notes, idempotency) are additive.
- Vendor is the catalog/ops supplier record (hotel, activity, service, guide, b2b).

**Risks**

- Two discovery systems: `Vendor` public catalog fields vs `DiscoveryPlace` / `DiscoveryDestination`.
- `AuditLog` has no FK to actors.
- `ConversationParticipant` cascades on user delete.
- `payments.paid_at` had no index (added `20261003190000_payment_paid_at_index`).
- Prisma always selects all Booking scalars. If Railway schema lags the client (as on 2026-09-30: missing `children_count`), **every** booking include 500s — including ZN login and payment history.

**Unused / stub**

- BullMQ `ai`, `payments`, `digest`, `cleanup` processors log only.
- `EodReport.content` is a generated markdown stub.

---

## D. API audit

Prefix: `/api/v1`. Controllers: auth, users, settings, system, packages, clients, bookings, `client/bookings`, itineraries, operations, payments, finance, webhooks, drivers, reviews, tasks, dashboard, edit-requests, vip, sos, chat, notifications, vendors, emails, ai, client portal, client-v2, master-data, splizer.

**Strengths:** Zod pipes on write endpoints, global JWT + roles, client booking scope via `client-auth.policy`, pagination on lists.

**Gaps**

- Schema drift used to surface as opaque `INTERNAL_ERROR` 500. Filter now maps Prisma `P2021`/`P2022` to `SCHEMA_DRIFT` 503.
- Dashboard is admin/ops_manager only. Support login gets **403** on `/dashboard/overview` (seen on Railway 2026-10-02).
- No staff REST to query `audit_logs`.
- No document endpoints.
- `GET /payments/history` `search` is implemented in the service but not exposed on the query schema.

---

## E. Frontend audit

**Admin**

- Real APIs for core ops. Dead unused: `frontend/src/ops-demo/*`, `modules/admin/stubs/*`.
- Dashboard labels were mixed hardcoded English; collected card now uses i18n.
- Booking workspace Documents / History tabs are honest empty states.
- `/client/*` embedded portal is English-only.

**Website**

- Booking flow is real (`POST /client/bookings/request`), not WhatsApp-only. Session draft in `sessionStorage` is a UX draft, not a fake booking.
- Trip bag is client-side until submit.
- `BookingRequestPage.tsx` **does not exist**. The Sept 30 Railway website build error (`FormEvent` / `payload` possibly undefined) was from that old file. Current implementation is `Website_frontend/src/pages/BookingFlowPages.tsx` (`type FormEvent`). `tsc --noEmit` is clean locally.
- Dead: `HubPages.tsx` (not routed).
- i18n/RTL exists (`en`/`ar`/`ru`); some marketing copy still English.

---

## F. UX audit

| Flow | Friction |
|---|---|
| Dashboard vs Finance | **Fixed in this pass.** Finance “Cash paid $225” is all-time. Dashboard previously showed only “Revenue today” ($0 when the cash row is 19 Aug 2026). Headline is now **Collected**. |
| Finance chart | Last-7-days empty is correct if the only paid row is older. Year range shows it. |
| Customer book | Progressive details → review → ZN. WhatsApp remains a fallback CTA, not the create path. |
| Support role | Can operate bookings/chat but cannot open dashboard overview (403). |
| Documents | Customer and OPS cannot attach/download files. |

---

## G. Security audit

| Item | Severity | Notes |
|---|---|---|
| Public `POST /system/seed-demo` | **High** (mitigated) | Production now requires `SEED_BOOTSTRAP_TOKEN`. Hardcoded fallback token is development-only. |
| Stripe webhook without `STRIPE_WEBHOOK_SECRET` | High if misconfigured | Dev header bypass. Must set secret in prod. |
| ZN sequential | Medium | Phone match required by default. |
| Client JWT `bookingId` | Good | Reduces cross-booking IDOR. |
| Excel upload | Medium | MIME includes `application/octet-stream`; 25MB memory. |
| File/document uploads | N/A | No general upload API yet. |
| CORS / WS origin | Config | `APP_WEB_ORIGIN` / `CORS_ORIGIN`. |
| Rate limit | Present | Throttler 120/min. |

Ownership checks inspected on client portal, SOS create, chat join, and booking read. Drivers are scoped in assignment services. Treat IDOR as a regression test target, not “proven absent.”

---

## Railway 500s (zn-login + payments/history)

Verified from Railway HTTP logs:

| Time (UTC) | What happened |
|---|---|
| 2026-09-30 14:35–14:40 | `GET /payments/history` and `POST /auth/client/zn-login` → **500** |
| 2026-09-30 14:45–14:46 | **502** while the service was restarting |
| 2026-09-30 14:51+ | Both endpoints **200/201** after `prisma migrate deploy` on start |

Root cause recorded on the deploy that added `start-prod.sh`: **schema drift** (`bookings.children_count` missing) while Prisma selected the new Booking scalars. Local DB was migrated; Railway was not. That is why “local 100%, Railway 500.”

After 14:51 those two routes are healthy on the current production deploy. This pass hardens the same class of failure: migrate on boot (already), Prisma drift → 503, FCM/audit cannot fail ZN login, payment history mapper tolerates missing client name.

---

## Production blockers (honest)

1. **Documents** — no storage, no model, no API. Booking Documents tab is empty by design.
2. **Railway backend is behind local `devel`** — catalog fields, rooms, vehicles, trains, request-summary work are not on `12e8d93`.
3. **Admin `devel` not fully on `main`/prod** — collected-revenue UI and listing editor live on `devel`.
4. **No E2E** for customer request → OPS confirm → My Trip.
5. **Stripe / FCM / Anthropic** — configuration-dependent; do not fake success.
6. **Seed-demo** — keep `SEED_BOOTSTRAP_TOKEN` unset in production unless a controlled bootstrap is required.

---

## Reusable existing functionality (do not duplicate)

- `BookingsService` + `ClientBookingsController` for customer requests
- Server-side ZN generation
- `PaymentsService` / `FinanceService`
- `MasterDataImportService`
- `RealtimeEmitter` + admin `useOpsRealtime`
- Vendor as the single catalog/ops supplier
- `client-auth.policy` for ZN + ownership

---

## What this audit pass implemented

- Dashboard + Operations show **Collected** (all-time paid, including the $225 cash) with today + cash in the hint
- Dashboard cache invalidates on payment create/update
- Finance “today” matches dashboard (includes `paidAt` null + `createdAt` today)
- Prisma schema drift mapped to `SCHEMA_DRIFT`
- ZN login no longer 500s on bad `fcmTokens` JSON or audit insert failure
- Production seed-demo disabled without env token
- `payments.paid_at` index

Remaining product work (documents, E2E, deploy `devel` → Railway, booking history API) is listed above and is not claimed complete.

---

## Final Verification

Verification date: 2026-10-03. Historical findings above are unchanged. This section records what the final completion pass closed.

| BLOCKER | STATUS | EVIDENCE | TEST | RESULT |
|---|---|---|---|---|
| Documents / storage missing | **CLOSED (local)** | Prisma `Document` + `20261003200000_booking_documents`; `StorageService` (`local` volume or `s3`); staff `POST/GET /bookings/:id/documents`; authorized `GET /documents/:id/download`; client `GET /client/documents`; OPS Documents tab; My Trip documents | `LIVE_E2E=1` critical-path: upload + customer download + unauthenticated 401 | **PASS** on local API |
| Railway backend behind local `devel` | **OPEN (deploy)** | Local `devel` still ahead of Railway `12e8d93`. New commits include catalog, paid_at index, documents, health, audit API | Do not push in this pass. See `docs/RELEASE_READINESS.md` | **NOT DEPLOYED** |
| Admin `devel` not on production `main` | **OPEN (deploy)** | Documents tab, audit logs, Collected card live on local `devel` | Same — readiness only | **NOT DEPLOYED** |
| Critical-path E2E missing | **CLOSED (local)** | `backend/zeengo_backend/test/critical-path.e2e-spec.ts` hits a real running API + local DB | `LIVE_E2E=1 npx jest --config ./test/jest-e2e.json --testPathPatterns=critical-path` | **12/12 PASS** |
| Stripe / FCM / Anthropic | **CONFIG-AWARE** | Ready health: stripe/claude/fcm `missing_key` locally. No fake payment/push/AI | `GET /system/health/ready` | **PASS** (honest unavailable) |
| Booking history gaps | **CLOSED (local)** | History now includes documents, itinerary items, assignments, tasks. Audit writes added for those actions | Live history assertion in critical-path | **PASS** |
| Staff audit-log API | **CLOSED (local)** | `GET /audit-logs` admin/ops_manager; Support 403; admin `/audit-logs` page | Support 403 in critical-path | **PASS** |
| Support dashboard 403 | **INTENDED** | Support nav excludes `/`. `homeForRole` → `/clients`. Roles page states this | Support `/dashboard/overview` → 403; sidebar does not link it | **PASS** |
| Schema drift class | **HARDENED** | `start-prod.sh` migrate deploy; P2021/P2022 → `SCHEMA_DRIFT`; ready checks `bookings.children_count` | `GET /system/health/ready` schema=operational locally; `prisma migrate status` up to date | **PASS** local |
| Roles / dynamic RBAC | **WONTFIX (by design)** | Fixed `StaffRole` enum. Roles page is a matrix over `ROLE_PERMISSIONS` | UX copy updated | **PASS** |

### Builds actually run

| Command | Result |
|---|---|
| `npx prisma migrate deploy` (local) | Applied `20261003200000_booking_documents` |
| `npx prisma migrate status` (local) | Database schema is up to date |
| backend `npx tsc --noEmit` | PASS |
| backend `npx jest --runInBand` | 26/26 PASS |
| backend mocked e2e `app.e2e-spec` | 3/3 PASS |
| backend live e2e critical-path | 12/12 PASS |
| frontend `npx tsc --noEmit` + `npm run build` | PASS |
| website `npx tsc --noEmit` + `npm run build` | PASS |
| Dashboard collected | today 0 · total 225 · cash 225 (unchanged, correct) |
