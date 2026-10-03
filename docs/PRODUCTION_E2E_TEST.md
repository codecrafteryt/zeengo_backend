# ZEENGO — Production E2E Test Record

Date: 2026-10-03  
API: `https://zeengobackend-production-d058.up.railway.app/api/v1`  
Backend commit: `243538f`  
Railway deployment: `2d4442ca` SUCCESS  
Admin: `https://zeengo-admin.vercel.app`  
Website: `https://zeengo-website.vercel.app`  
Test account type: **labeled synthetic guests** (`ZEENGO PROD TEST A/B`). No real customer records were used. Credentials are not written here.

---

## Production critical path

| # | Step | Result |
|---|---|---|
| 1 | `GET /system/health/live` | PASS 200 |
| 2 | `GET /system/health/ready` | PASS 200 · postgres/redis/schema operational · storage local · stripe/fcm/claude missing_key |
| 3 | Staff login | PASS 201 |
| 4 | Staff wrong password | PASS 401 |
| 5 | Support → dashboard / audit / payments | PASS 403 |
| 6 | Driver login | PASS 201 |
| 7 | Customer A request | PASS 201 · ZN issued · pending |
| 8 | Customer B request | PASS 201 |
| 9 | ZN + wrong phone / wrong ZN | PASS 401 / 401 |
| 10 | Customer A/B ZN+phone login | PASS 201 |
| 11 | My Trip own booking | PASS 200 |
| 12 | A reads B booking | PASS 403 |
| 13 | Anonymous booking | PASS 401 |
| 14 | OPS open + confirm A | PASS 200 / 201 confirmed |
| 15 | Customer sees confirmed | PASS |
| 16 | OPS upload customer-visible PDF | PASS 201 |
| 17 | Reject `.exe` | PASS 400 |
| 18 | Customer lists + downloads own doc | PASS 200 · marker bytes match |
| 19 | Customer B / anonymous / unassigned driver download | PASS 403 / 401 / 403 |
| 20 | Booking history + audit-logs + payments + dashboard + notifications | PASS 200 |
| 21 | Staff refresh | PASS 201 |
| 22 | Client refresh then logout then refresh | PASS 201 / 201 / **401** |
| 23 | Invalid booking id | PASS 404 |
| 24 | Unsigned Stripe webhook | PASS 503 `STRIPE_WEBHOOK_NOT_CONFIGURED` |
| 25 | CORS website + admin | PASS allow those origins |
| 26 | CORS `https://evil.example` | PASS no `Access-Control-Allow-Origin` (after `243538f`) |
| 27 | Document download after backend redeploy | PASS 200 · 32 bytes · marker present |
| 28 | Website catalog / hotel detail / ZN login / My Trip | PASS in production browser |
| 29 | Admin login + nested `/documents` → login | PASS SPA |

---

## Frontend production builds

| App | `localhost:3000` in JS | Production API string | Nested routes |
|---|---|---|---|
| Website `index-24BLud52.js` | **0** | Railway d058 present | `/trip` `/hotels` `/experiences` `/account` 200 HTML |
| Admin `client-CxHomfcs.js` | **0** | Railway d058 present | `/documents` `/audit-logs` `/bookings` `/clients` 200 HTML |

---

## Not run (on purpose)

- Production Stripe checkout (no keys)
- FCM device delivery (no keys)
- Kitchen Excel commit
- Password rotation of historical demo staff (operator action)
- Lighthouse CLI (process hung; not recorded)
