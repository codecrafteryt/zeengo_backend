# Zeengo API Reference — Junior Developer Guide

> **Base URL:** `http://localhost:3000/api/v1`  
> **Swagger (interactive):** `http://localhost:3000/api/docs`  
> **WebSocket:** `ws://localhost:3000/ws` (JWT in `handshake.auth.token`)  
> **Branch / code:** NestJS domain modules under `src/`

This doc explains **every HTTP API**: who can call it, JWT or not, path/query params, and JSON body.  
Read the **summary tables at the top first**, then jump to the domain you need.

---

# 📊 SUMMARY (read this first)

## Total APIs

| Metric | Count |
|---|---:|
| **Total APIs** | **111** |
| GET | 50 |
| POST | 44 |
| PATCH | 9 |
| PUT | 3 |
| DELETE | 5 |

### Surface split (how you should think about it)

| Surface | What it is | ≈ APIs |
|---|---|---:|
| **🔵 Dashboard (staff)** | Ops web dashboard — admin, ops manager, splizer, support, driver | **~76** staff-primary routes |
| **🟠 Client App (Flutter)** | Mobile app for tourists | **~3** client-only + **~23** shared with staff |
| **⚪ Public / system** | No login (or Stripe webhook) | **9** |

> There is **one** API server. Dashboard vs App is **not** two folders — it is **JWT role**.

---

## By HTTP method (formula view)

```
TOTAL 111
├── GET     50
├── POST    44
├── PATCH    9
├── PUT      3
└── DELETE   5
```

---

## By role — how many APIs each role can call

*(One API can be allowed for multiple roles. Public routes count for everyone.)*

| Role | ≈ APIs they can call | Typical use |
|---|---:|---|
| 👑 **admin** | **103** | Full dashboard + users/settings/packages write |
| 🧭 **ops_manager** | **92** | Day-to-day ops (no user mgmt / settings) |
| 🎧 **support** | **71** | SOS, clients, edit requests, vendors, chat |
| 💵 **splizer** | **46** | Cash / Stripe links + client dues + chat |
| 🚗 **driver** | **35** | My schedule, GPS, status, assigned chats |
| 📱 **client** (app) | **35** | Own trip, SOS, edit/VIP request, chat, pay view |

### Primary-owner buckets (each API counted once)

| Bucket | Count | Meaning |
|---|---:|---|
| ⚪ Public (no JWT) | 9 | Login, health, Stripe webhook |
| 🟣 Admin-only | 11 | Users, settings, package write |
| 🔵 Admin + Ops only | 17 | Dashboard KPIs, finance, some AI |
| 👥 Multi-staff (no client) | 43 | Bookings write, drivers ops, tasks, vendors… |
| 🚗 Driver self (`/drivers/me/*`) | 3 | Schedule / status / GPS |
| 💵 Splizer-only | 2 | `/splizer/clients…` |
| 🟠 Client-only | 3 | SOS create, edit request, VIP request |
| 🟢 Shared staff + client | 23 | Own booking read, chat, notifications… |

---

## Dashboard module quick counts

| Module | APIs | Methods (approx) | Who |
|---|---:|---|---|
| Auth (staff parts) | part of 11 | mostly POST | all staff |
| Dashboard KPIs | **5** | 3 GET + 2 POST | admin, ops |
| Users | **5** | 2 GET + 2 POST + 1 PATCH | admin |
| Settings | **3** | 2 GET + 1 PUT | admin |
| Packages | **4** | 1 GET + 1 POST + 1 PATCH + 1 DELETE | admin write / ops+client read |
| Clients | **3** | 2 GET + 1 PATCH | staff |
| Bookings (+ checklist/notes) | **12** | mix | staff (+ client read) |
| Itinerary + daily ops | **7** | mix | staff (+ client read program) |
| Payments + Splizer | **6** | 2 POST + 4 GET | admin/ops/splizer |
| Finance | **2** | 2 GET | admin, ops |
| Drivers | **11** | mix | ops + driver self |
| Tasks | **4** | mix | admin/ops/support |
| Vendors | **6** | mix | admin/ops/support |
| Edit requests | **6** | mix | staff + client create |
| VIP | **5** | mix | staff + client request |
| SOS | **4** | mix | client create + staff resolve |
| Chat | **6** | mix | staff + client |
| Notifications | **4** | mix | any logged-in user |
| AI | **4** | 4 POST | staff |
| System / webhook / root | **3** | GET/POST | public or any auth |

---

## How to call any API (copy-paste pattern)

### 1) Login (Dashboard staff)

```http
POST /api/v1/auth/staff/login
Content-Type: application/json

{
  "email": "admin@zeengo.com",
  "password": "Admin123!"
}
```

Response (shape):

```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ…",
    "refreshToken": "…",
    "user": { "id": "uuid", "fullName": "…", "role": "admin" }
  }
}
```

### 2) Login (Client app)

```http
POST /api/v1/auth/client/login
Content-Type: application/json

{ "phone": "+9665xxxxxxx", "password": "secret" }
```

### 3) Authenticated call

```http
GET /api/v1/dashboard/summary
Authorization: Bearer <accessToken>
```

### 4) Standard response envelope

**Success**

```json
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 20, "total": 100 } }
```

**Error**

```json
{
  "success": false,
  "error": { "code": "BOOKING_NOT_FOUND", "message": "…", "details": null }
}
```

### 5) JWT rules (remember these)

| Case | Header | Notes |
|---|---|---|
| `@Public()` | **not required** | Login, register, refresh, health, Stripe webhook |
| Everything else | `Authorization: Bearer <accessToken>` | Required |
| Wrong role | — | API returns **403 Forbidden** |
| Expired token | — | **401** → use `POST /auth/refresh` |

Access token TTL ≈ **15 minutes**. Refresh ≈ **30 days** (rotated).

---

# 📚 ALL APIs BY DOMAIN

Legend in each table:

| Column | Meaning |
|---|---|
| JWT | ✅ required · ❌ public |
| Roles | Who is allowed |
| Body / Query / Params | What to send |

---

## 1) Auth — `src/auth/`

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| POST | `/auth/staff/login` | ❌ | Public | **Body:** `email`, `password` | Dashboard login |
| POST | `/auth/client/register` | ❌ | Public | **Body:** `fullName`, `phone`, `password`, `email?`, `nationality?`, `preferredLang?` | Start register + OTP |
| POST | `/auth/client/verify-otp` | ❌ | Public | **Body:** `phone`, `code` (6 digits), `purpose` (`register`\|`login`\|`reset_password`) | Verify OTP → tokens (register) |
| POST | `/auth/client/login` | ❌ | Public | **Body:** `phone`, `password` | App login |
| POST | `/auth/forgot-password` | ❌ | Public | **Body:** `phone` | Send reset OTP |
| POST | `/auth/reset-password` | ❌ | Public | **Body:** `phone`, `code`, `newPassword` | Set new password |
| POST | `/auth/change-password` | ✅ | Any logged-in | **Body:** `currentPassword`, `newPassword` | Change password |
| POST | `/auth/refresh` | ❌ | Public | **Body:** `refreshToken` | New access + refresh pair |
| POST | `/auth/logout` | ✅ | Any logged-in | **Body:** `refreshToken` | Revoke refresh |
| GET | `/auth/me` | ✅ | Any logged-in | — | Current user profile |
| PUT | `/auth/me/fcm-token` | ✅ | Any logged-in | **Body:** `token`, `platform` (`ios`\|`android`\|`web`) | Save push token |

**Jr tip:** Staff use **email**. Clients use **phone + OTP**.

---

## 2) System / Webhooks

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| GET | `/system/health` | ❌ | Public | — | API / DB / Redis / Stripe / Claude status |
| GET | `/` | ✅ | Any logged-in | — | Simple hello probe |
| POST | `/webhooks/stripe` | ❌ | Public (Stripe) | Raw Stripe event + `Stripe-Signature` header. Dev: header `x-zeengo-dev-webhook: 1` | Payment status updates |

---

## 3) Dashboard KPIs — `src/dashboard/`  
**Who:** admin, ops_manager · **Count: 5** (3 GET + 2 POST)

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| GET | `/dashboard/summary` | ✅ | admin, ops | — | All KPI cards (cached ~30s) |
| GET | `/dashboard/urgent-alerts` | ✅ | admin, ops | — | SOS + pending edits + urgent tasks |
| GET | `/dashboard/schedule` | ✅ | admin, ops | **Query:** `date?` = `today` \| `tomorrow` | Day schedule |
| POST | `/dashboard/eod-report` | ✅ | admin, ops | **Body:** `reportDate?` (YYYY-MM-DD) | Create EOD report |
| POST | `/dashboard/eod-report/:id/send` | ✅ | admin, ops | **Params:** `id` | Mark/send EOD report |

---

## 4) Users (Admin) — `src/users/`  
**Who:** admin only · **Count: 5**

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| GET | `/users` | ✅ | admin | **Query:** `role?` | List staff |
| GET | `/users/stats` | ✅ | admin | — | Counts per role |
| POST | `/users` | ✅ | admin | **Body:** `fullName`, `email`, `password`, `role`, `phone?`, `avatarUrl?`, `isActive?` | Create staff (driver → also driver profile) |
| PATCH | `/users/:id` | ✅ | admin | **Params:** `id` · **Body:** any of `fullName`, `email`, `phone`, `role`, `avatarUrl`, `isActive` | Update staff |
| POST | `/users/:id/reset-password` | ✅ | admin | **Params:** `id` · **Body:** `password` | Reset staff password |

---

## 5) Settings (Admin) — `src/settings/`  
**Count: 3**

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| GET | `/settings` | ✅ | admin | — | All key/value settings |
| GET | `/settings/:key` | ✅ | admin | **Params:** `key` | One setting |
| PUT | `/settings/:key` | ✅ | admin | **Params:** `key` · **Body:** `{ "value": <any JSON> }` | Upsert setting |

Common keys: `vip_price`, `stripe_link_expiry_hours`, `company_profile`.

---

## 6) Packages — `src/packages/`  
**Count: 4**

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| GET | `/packages` | ✅ | client, admin, ops | — | List packages |
| POST | `/packages` | ✅ | admin | **Body:** `name`, `pricePerPerson`, `slug?`, `minPersons?`, `durationDays?`, `description?`, `inclusions?` | Create |
| PATCH | `/packages/:id` | ✅ | admin | **Params:** `id` · partial body | Update |
| DELETE | `/packages/:id` | ✅ | admin | **Params:** `id` | Soft delete |

---

## 7) Clients (Staff CRM) — `src/clients/`  
**Count: 3**

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| GET | `/clients` | ✅ | admin, ops, support, splizer, driver | **Query:** `page?`, `limit?`, `search?`, `sort?` | Search/list |
| GET | `/clients/:id` | ✅ | same | **Params:** `id` | Detail |
| PATCH | `/clients/:id` | ✅ | admin, ops, support | **Params:** `id` · **Body:** `fullName?`, `phone?`, `email?`, `nationality?`, `whatsapp?`, `preferredLang?` | Update |

---

## 8) Bookings — `src/bookings/`  
**Count: 12**

### Create example body

```json
{
  "client": {
    "fullName": "Mohammed Al-Rashidi",
    "phone": "+966512345678",
    "email": "client@email.com",
    "nationality": "Saudi Arabia"
  },
  "partySize": 5,
  "arrivalDate": "2026-07-29",
  "departureDate": "2026-08-14",
  "packageId": "uuid-of-package",
  "totalAmount": 6000,
  "internalNotes": "Any special requests…"
}
```

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| POST | `/bookings` | ✅ | admin, ops, support | create body above | Create booking + ZN code |
| GET | `/bookings` | ✅ | admin, ops, support, splizer, client | **Query:** `page?`, `limit?`, `search?`, `status?`, `view?`=`full`\|`codes` | List (client = own) |
| GET | `/bookings/stats` | ✅ | admin, ops, support, splizer | — | Total/active/completed/cancelled |
| GET | `/bookings/:id` | ✅ | admin, ops, support, splizer, client | **Params:** `id` | Full booking |
| PATCH | `/bookings/:id` | ✅ | admin, ops, support | **Params:** `id` · partial fields | Update |
| GET | `/bookings/:id/checklist` | ✅ | admin, ops, support, splizer, client | **Params:** `id` | List checklist |
| POST | `/bookings/:id/checklist` | ✅ | admin, ops, support | **Body:** `title`, `sortOrder?` | Add item |
| PATCH | `/bookings/:id/checklist/:itemId` | ✅ | admin, ops, support | **Body:** `title?`, `isDone?`, `sortOrder?` | Update item |
| DELETE | `/bookings/:id/checklist/:itemId` | ✅ | admin, ops, support | — | Delete item |
| GET | `/bookings/:id/notes` | ✅ | admin, ops, support | — | Internal notes |
| POST | `/bookings/:id/notes` | ✅ | admin, ops, support | **Body:** `body` | Add note |
| GET | `/bookings/:id/payments` | ✅ | admin, ops, support, splizer, client | — | Payments for booking |

**Jr tip:** `paidAmount` / `dueAmount` are **calculated** from paid payments — not a free-form field on booking.

---

## 9) Itinerary & Daily Operations — `src/itineraries/`  
**Count: 7**

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| GET | `/bookings/:id/itinerary` | ✅ | staff + driver + client | **Params:** `id` | Program day-by-day |
| POST | `/bookings/:id/itinerary/items` | ✅ | admin, ops, support | **Body:** `dayNumber`, `title`, `itemDate?`, `startTime?`, `description?`, `locationName?`, `lat?`, `lng?`, `vendorId?`, `driverId?`, `status?`, `sortOrder?` | Add item |
| POST | `/bookings/:id/itinerary/import` | ✅ | admin, ops, support | **Body:** `{ "days": [ { "dayNumber": 1, "items": [ { "time": "08:00", "title": "…" } ] } ] }` | Import from AI parser |
| PATCH | `/itinerary/items/:itemId` | ✅ | admin, ops, support | **Params:** `itemId` · partial body | Update item |
| DELETE | `/itinerary/items/:itemId` | ✅ | admin, ops, support | **Params:** `itemId` | Delete |
| GET | `/daily-operations` | ✅ | admin, ops, support, driver | **Query:** `date` (YYYY-MM-DD) **required** | Day execution board |
| GET | `/daily-operations/week` | ✅ | admin, ops, support, driver | **Query:** `start` (YYYY-MM-DD) **required** | Week counters |

---

## 10) Payments & Splizer — `src/payments/`  
**Count: 6**

### Cash collection body

```json
{
  "bookingId": "uuid",
  "amount": 500,
  "method": "cash",
  "location": "Hotel lobby, Red Square",
  "notes": "First installment"
}
```

`method` allowed: `cash` | `rajhi_transfer` | `usdt_trc20`

### Stripe link body

```json
{ "bookingId": "uuid", "amount": 6000, "expiresInHours": 48 }
```

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| POST | `/payments/cash` | ✅ | admin, ops, splizer | cash body | Record paid collection |
| POST | `/payments/stripe-link` | ✅ | admin, ops, splizer | stripe body | Create trackable link |
| GET | `/payments/history` | ✅ | admin, ops, splizer | **Query:** `from?`, `to?`, `search?`, `page?`, `limit?` | History |
| GET | `/payments` | ✅ | admin, ops | **Query:** `status?`, `method?`, pagination | All payments table |
| GET | `/splizer/clients` | ✅ | **splizer** | pagination | Clients with Total/Paid/Due |
| GET | `/splizer/clients/by-code/:znCode` | ✅ | **splizer** | **Params:** `znCode` | Jump by ZN |

---

## 11) Finance — `src/finance/`  
**Count: 2** · admin, ops

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| GET | `/finance/summary` | ✅ | admin, ops | — | Today / Stripe / Cash / Pending |
| GET | `/finance/revenue-by-method` | ✅ | admin, ops | **Query:** `days?` (default 30) | Chart series |

---

## 12) Drivers — `src/drivers/`  
**Count: 11**

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| GET | `/drivers` | ✅ | admin, ops, support | **Query:** `status?`, `search?`, pagination | Roster |
| GET | `/drivers/live-positions` | ✅ | admin, ops | — | Live map markers (Redis) |
| GET | `/drivers/:id` | ✅ | admin, ops, support | **Params:** `id` | Profile |
| PATCH | `/drivers/:id` | ✅ | admin, ops, support | vehicle fields + `status?` | Manage tab |
| GET | `/drivers/:id/schedule` | ✅ | admin, ops, support | **Query:** `date?` | Schedule |
| GET | `/drivers/:id/trips` | ✅ | admin, ops, support | — | Trip history |
| POST | `/drivers/assignments` | ✅ | admin, ops, support | **Body:** `bookingId`, `driverId`, `startDate`, `endDate?` | Assign |
| DELETE | `/drivers/assignments/:id` | ✅ | admin, ops, support | **Params:** `id` | Unassign |
| GET | `/drivers/me/schedule` | ✅ | **driver** | **Query:** `date?`=`today`\|`tomorrow`\|YYYY-MM-DD | My trips |
| PUT | `/drivers/me/status` | ✅ | **driver** | **Body:** `{ "status": "en_route" }` | Status toggle |
| POST | `/drivers/me/gps` | ✅ | **driver** | **Body:** `{ "lat": 55.75, "lng": 37.61 }` | GPS every ~30s |

`status` values: `available` | `en_route` | `resting` | `off_duty`

---

## 13) Tasks — `src/tasks/`  
**Count: 4**

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| GET | `/tasks` | ✅ | admin, ops, support | **Query:** `status?`, `priority?`, `assignee=me?`, pagination | List |
| POST | `/tasks` | ✅ | admin, ops | **Body:** `title`, `description?`, `priority?`, `bookingId?`, `assigneeId?`, `dueDate?` | Create |
| PATCH | `/tasks/:id` | ✅ | admin, ops | partial + `status?` | Update |
| POST | `/tasks/:id/complete` | ✅ | admin, ops, support | — | Complete |

`priority`: `urgent` | `normal` · `status`: `open` | `done`

---

## 14) Vendors — `src/vendors/`  
**Count: 6**

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| GET | `/vendors` | ✅ | admin, ops, support | **Query:** `type?`, `city?`, `search?`, `isActive?`, pagination | List |
| POST | `/vendors` | ✅ | admin, ops | **Body:** `name`, `type`, `city?`, `contactName?`, `phone?`, `email?`, `commissionPct?`, `notes?` | Create |
| PATCH | `/vendors/:id` | ✅ | admin, ops | partial + `isActive?` | Update |
| DELETE | `/vendors/:id` | ✅ | admin, ops | — | Soft delete |
| POST | `/vendors/:id/assign` | ✅ | admin, ops | **Body:** `bookingId`, `itineraryItemId?`, `amount?` | Assign to booking |
| GET | `/vendors/:id/finance` | ✅ | admin, ops, support | — | Commission ledger |

`type`: `hotel` | `restaurant` | `guide` | `bus` | `activity` | `driver`

---

## 15) Edit Requests — `src/edit-requests/`  
**Count: 6**

### Client create body

```json
{
  "type": "date_change",
  "originalValue": "2026-04-23",
  "requestedValue": "2026-04-24",
  "reason": "Family needs one extra day in Moscow…"
}
```

`type`: `date_change` | `itinerary_change` | `vip_upgrade` | `other`

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| GET | `/edit-requests` | ✅ | admin, ops, support, splizer | **Query:** `status?`, `type?`, `bookingId?`, pagination | Staff inbox |
| POST | `/edit-requests` | ✅ | **client** | create body | Submit request |
| GET | `/edit-requests/:id` | ✅ | staff + client | **Params:** `id` | Detail |
| POST | `/edit-requests/:id/approve` | ✅ | admin, ops, support | **Body:** `reviewNotes?` | Approve (+ apply) |
| POST | `/edit-requests/:id/reject` | ✅ | admin, ops, support | **Body:** `reviewNotes?` | Reject |
| GET | `/bookings/:bookingId/edit-requests` | ✅ | staff + client | **Params:** `bookingId` | Per booking |

---

## 16) VIP (Zeen Rafeq) — `src/vip/`  
**Count: 5**

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| GET | `/vip/overview` | ✅ | admin, ops, support, splizer | — | Price + services |
| POST | `/vip/activate` | ✅ | admin, ops, support | **Body:** `{ "bookingId": "uuid" }` | Staff activate (+$VIP) |
| GET | `/vip/requests` | ✅ | admin, ops, support, splizer | — | Pending VIP upgrades |
| GET | `/vip/clients` | ✅ | admin, ops, support, splizer | — | Active VIP bookings |
| POST | `/vip/request` | ✅ | **client** | **Body:** `reason?` | Client asks for VIP |

---

## 17) SOS — `src/sos/`  
**Count: 4**

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| POST | `/sos` | ✅ | **client** | **Body:** `message?`, `lat?`, `lng?` | Trigger emergency |
| GET | `/sos` | ✅ | admin, ops, support, splizer, driver | **Query:** `status?`, pagination | List alerts |
| GET | `/sos/:id` | ✅ | staff + client | **Params:** `id` | Detail |
| POST | `/sos/:id/resolve` | ✅ | admin, ops, support | **Params:** `id` | Resolve |

---

## 18) Chat — `src/chat/`  
**Count: 6**

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| GET | `/chat/conversations` | ✅ | all staff + client | — | My threads |
| POST | `/chat/conversations` | ✅ | all staff + client | **Body:** `type`, `participantIds?`, `bookingId?`, `title?` | New thread |
| GET | `/chat/conversations/:id/messages` | ✅ | participants | **Query:** `before?` (message id), `limit?` | History |
| POST | `/chat/conversations/:id/messages` | ✅ | participants | **Body:** `body`, `attachments?` | Send (translation queued) |
| POST | `/chat/conversations/:id/read` | ✅ | participants | **Body:** `lastMessageId` | Mark read |
| GET | `/chat/client-threads` | ✅ | splizer, driver, admin, ops, support | — | Client chat list (+ dues for splizer) |

`type`: `team` | `dm` | `booking_support` | `client_direct`

---

## 19) Notifications — `src/notifications/`  
**Count: 4** · any logged-in user (own inbox)

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| GET | `/notifications` | ✅ | any | **Query:** `filter?`=`all`\|`unread`, pagination | List |
| GET | `/notifications/unread-count` | ✅ | any | — | Badge number |
| POST | `/notifications/:id/read` | ✅ | any | **Params:** `id` | Mark one read |
| POST | `/notifications/read-all` | ✅ | any | — | Mark all read |

---

## 20) AI tools — `src/ai/`  
**Count: 4** · staff only

| Method | Endpoint | JWT | Roles | Body / Query / Params | What it does |
|---|---|---|---|---|---|
| POST | `/ai/parse-itinerary` | ✅ | admin, ops | **Body:** `{ "rawText": "Day 1 — …\n08:00 Arrival…" }` | Structured days/items |
| POST | `/ai/chatbot` | ✅ | all staff | **Body:** `message`, `sessionId?` | Russia ops assistant |
| POST | `/ai/email-draft` | ✅ | admin, ops, support | **Body:** vendor/purpose fields (see schema) | Draft vendor email |
| POST | `/ai/eod-report` | ✅ | admin, ops | **Body:** `reportDate?` | AI EOD narrative |

**Jr tip:** If `ANTHROPIC_API_KEY` is missing, APIs still work with **heuristic / stub** responses (good for local dev).

---

# 🧪 Mini test plan for a Jr Dev

1. `GET /system/health` → should be `success: true` (Postgres + Redis operational).
2. `POST /auth/staff/login` with seed admin → save `accessToken`.
3. `GET /dashboard/summary` with Bearer token → KPIs JSON.
4. `GET /packages` → seeded Love / Family / Relaxation / Royal.
5. `POST /bookings` → new `znCode` like `ZN0001`.
6. `POST /payments/cash` → paidAmount increases on booking.
7. (App path) register client → OTP (logged in server console in `development`) → verify → `POST /sos`.

---

# 🔗 Related docs

| Doc | Purpose |
|---|---|
| [`FOLDER_STRUCTURE.md`](./FOLDER_STRUCTURE.md) | Which folder is dashboard / app / shared |
| [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) | Architecture + build phases |
| Swagger UI | Live try-out of every route |

---

# ✅ Cheat sheet — enums you will type often

| Field | Values |
|---|---|
| Staff roles | `admin`, `ops_manager`, `splizer`, `support`, `driver` |
| Booking status | `active`, `completed`, `cancelled` |
| Payment status | `pending`, `sent`, `opened`, `paid`, `expired`, `failed` |
| Payment method | `cash`, `stripe`, `rajhi_transfer`, `usdt_trc20` |
| Driver status | `available`, `en_route`, `resting`, `off_duty` |
| Task priority | `urgent`, `normal` |
| SOS status | `active`, `resolved` |
| Edit request status | `pending`, `approved`, `rejected` |

---

**Remember:**  
Folders = **domains**.  
Dashboard vs App = **JWT role**.  
Always send `Authorization: Bearer …` unless the table says JWT ❌.
