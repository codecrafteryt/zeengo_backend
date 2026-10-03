# ZEENGO — Production E2E Test Record

Date: 2026-10-03  
Local API: `http://127.0.0.1:3000/api/v1`  
Railway: `https://zeengobackend-production-d058.up.railway.app`  
Command: `LIVE_E2E=1 npx jest --config ./test/jest-e2e.json --runInBand test/critical-path.e2e-spec.ts`

This suite **never** targets Railway. It creates a real booking in the **local** database only.

---

## Local critical path — 12/12 PASS (this session)

| # | Step | Result |
|---|---|---|
| 1 | `GET /system/health/live` | 200 |
| 2 | `GET /system/health/ready` | 200 |
| 3 | Staff login `admin@zeengo.com` | 201 + access token |
| 4 | Support login → `GET /dashboard/overview` | **403** |
| 5 | Customer `POST /client/bookings/request` | 200/201, ZN issued, `requestStatus=pending` |
| 6 | Client ZN + phone login | 201, booking-bound JWT |
| 7 | OPS confirm request | 200, customer sees confirmed |
| 8 | Staff upload customer-visible document | 201 |
| 9 | Client lists/downloads own document | 200 |
| 10 | Other customer / anonymous document | 403 / 401 |
| 11 | Driver not assigned | 403 |
| 12 | Booking history includes request + document | 200 |

Prior gate (same day, same machine): IDOR matrix ZN0502/ZN0503 also passed (A/B booking 403, A/B document 403, anon 401, driver 403).

---

## Railway production — read-only probes (this session)

No writes. No Excel. No seed. No login with production customer data.

| Probe | HTTP | Meaning |
|---|---|---|
| `GET /api/v1/system/health` | 200 | Process + Postgres + Redis up. `stripe/fcm/claude=missing_key` |
| `GET /api/v1/system/health/live` | 404 | New live endpoint **not deployed** |
| `GET /api/v1/system/health/ready` | 404 | New ready endpoint **not deployed** |
| `GET /api/v1/client/v2/home` | 200 | Home catalog route exists on current Railway |
| `GET /api/v1/client/documents` | 404 | Documents API **not deployed** |
| `GET /api/v1/audit-logs` | 404 | Audit API **not deployed** |
| `GET /api/v1/bookings` (no token) | 401 | Auth guard is live |

Full customer→OPS→document download **cannot** be marked VERIFIED on Railway until `devel` (with documents + tsconfig entrypoint fix) is deployed and storage is durable.

---

## Admin / website unit tests (this session)

| Suite | Result |
|---|---|
| Admin `npm test` (RBAC: Support / Splizer / Driver / Admin) | **4/4 PASS** |
| Website `npm test` (ZN normalize, locale, API base) | **3/3 PASS** |
| Backend Jest (incl. new demo-staff + Stripe webhook policies) | **31/31 PASS** |

These prove authorization *rules* and URL/ZN helpers. They do not replace the live HTTP booking suite.

---

## Not run (on purpose)

- Production Stripe checkout
- Production document upload (route missing; would also hit ephemeral disk)
- Production Excel commit
- Production seed-demo
- Mutating Railway bookings
