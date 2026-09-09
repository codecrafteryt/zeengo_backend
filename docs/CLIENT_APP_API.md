# Zeengo Client App APIs

Client (Flutter / tourist) app ke liye **sirf woh endpoints** jo JWT `type: "client"` se accessible hain, plus public auth/health.

> **Base URL (local):** `http://localhost:3000/api/v1`  
> **Base URL (live):** `https://zeengobackend-production.up.railway.app/api/v1`  
> **Swagger:** `{BASE}/../api/docs` → `https://zeengobackend-production.up.railway.app/api/docs`  
> **WebSocket:** `{HOST}/ws` (Socket.IO namespace `/ws`)

Har successful JSON response envelope mein aata hai. Pagination wale endpoints `data` + `meta` return karte hain; baqi `data` mein object/array.

---

## Conventions

### Auth header

```http
Authorization: Bearer <accessToken>
```

Access token JWT claims: `{ sub: clientId, type: "client" }`.  
Default access TTL: **15m**. Refresh TTL: **30d**.

### Success envelope

```json
{
  "success": true,
  "data": {}
}
```

Paginated:

```json
{
  "success": true,
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 0 }
}
```

### Error envelope

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Unauthorized",
    "details": null
  }
}
```

Common HTTP / codes:

| HTTP | `error.code` | Kab |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Zod body/query fail, invalid OTP |
| 401 | `UNAUTHORIZED` | Missing/invalid JWT, bad login |
| 403 | `FORBIDDEN` | Staff-only route, ya dusre client ka resource |
| 404 | `CLIENT_NOT_FOUND` / `BOOKING_NOT_FOUND` / `ACTIVE_BOOKING_NOT_FOUND` | Missing row |
| 409 | `PHONE_ALREADY_REGISTERED`, `ALREADY_VIP`, `VIP_REQUEST_PENDING`, … | Conflict |

### Pagination query (jahan likha ho)

| Query | Type | Default |
|---|---|---|
| `page` | int ≥ 1 | `1` |
| `limit` | int 1–100 | `20` |
| `sort` | string | endpoint-specific |
| `search` | string | optional |

---

## Shared shapes

### `ClientUser`

```json
{
  "id": "uuid",
  "fullName": "string",
  "phone": "string",
  "email": "string | null",
  "nationality": "string | null",
  "whatsapp": "string | null",
  "phoneVerifiedAt": "ISO-8601 | null",
  "emailVerifiedAt": "ISO-8601 | null",
  "preferredLang": "ar | en",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

### `Tokens`

```json
{
  "accessToken": "jwt",
  "refreshToken": "opaque-string"
}
```

### `Booking`

```json
{
  "id": "uuid",
  "znCode": "ZN-…",
  "clientId": "uuid",
  "packageId": "uuid",
  "arrivalDate": "YYYY-MM-DD | null",
  "departureDate": "YYYY-MM-DD | null",
  "partySize": 2,
  "totalAmount": 0,
  "paidAmount": 0,
  "dueAmount": 0,
  "status": "active | completed | cancelled",
  "isVip": false,
  "internalNotes": "string | null",
  "createdBy": "uuid",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601",
  "client": {
    "id": "uuid",
    "fullName": "string",
    "phone": "string",
    "email": "string | null",
    "nationality": "string | null"
  },
  "package": { "id": "uuid", "name": "string", "slug": "string" },
  "activeDriverAssignment": {
    "id": "uuid",
    "driverId": "uuid",
    "driverName": "string | null",
    "startDate": "YYYY-MM-DD",
    "endDate": "YYYY-MM-DD | null",
    "status": "string"
  }
}
```

`client` / `package` / `activeDriverAssignment` tab aate hain jab service un relations ko load karti hai (detail/list full view).

---

# 1. Auth (public + logged-in client)

## `POST /auth/client/register`

**Auth:** public (throttle 10/min)

Register karta hai (ya unverified phone update). OTP phone pe bhejta hai. Tokens **nahi** milte jab tak OTP verify na ho.

**Body**

```json
{
  "fullName": "string (1–200)",
  "phone": "string (6–32)",
  "password": "string (8–128)",
  "email": "email (optional)",
  "nationality": "string (optional, max 100)",
  "preferredLang": "ar | en (optional, default ar)"
}
```

**Response `200/201` `data`**

```json
{
  "message": "OTP sent to phone",
  "phone": "+9665…",
  "expiresInSeconds": 600
}
```

**Errors:** `409 PHONE_ALREADY_REGISTERED` agar phone already verified registered hai.

---

## `POST /auth/client/verify-otp`

**Auth:** public (throttle 10/min)

**Body**

```json
{
  "phone": "string",
  "code": "string (exactly 6 digits)",
  "purpose": "register | login | reset_password"
}
```

> Implemented purposes: **`register`** (tokens + user) aur **`reset_password`** (message only). `login` currently `VALIDATION_ERROR: Unsupported OTP purpose`.

**Response — `purpose: "register"`**

```json
{
  "accessToken": "jwt",
  "refreshToken": "string",
  "user": { "...ClientUser" }
}
```

**Response — `purpose: "reset_password"`**

```json
{
  "message": "OTP verified. You may now reset your password.",
  "phone": "+9665…"
}
```

**Errors:** invalid/expired OTP, too many attempts, `CLIENT_NOT_FOUND`.

---

## `POST /auth/client/login`

**Auth:** public (throttle 10/min)

Guest app login with the booking ZN code only — no phone, no password.

**Body** — `bookingCode` required (or alias `znCode`). Device push token optional (`deviceToken` or `fcmToken`). `platform` optional.

```json
{
  "bookingCode": "ZN0001",
  "deviceToken": "optional-fcm-device-token",
  "platform": "android"
}
```

Aliases: `fcmToken` = same as `deviceToken`. `platform`: `ios` | `android` | `web` (default `android` if a token is sent). Saved on `clients.fcm_tokens`. Same platform/token overwrites.

**Response `data`**

```json
{
  "accessToken": "jwt",
  "refreshToken": "string",
  "user": { "...ClientUser" },
  "booking": {
    "id": "uuid",
    "znCode": "ZN0001",
    "status": "active"
  }
}
```

**Errors:** `401` invalid booking code.

---

# 2. Home screen (single API — use this)

## `GET /client/home`

**Auth:** Bearer client JWT (`type: client`)  
**Method:** `GET`  
**Endpoint:** `/api/v1/client/home`  
**Params:** none  
**Query:** none  
**Body / payload:** none  

Flutter home screen ke liye **sirf yahi ek call** kaafi hai: days left, guests, due/paid/total, today schedule, driver, package, VIP.

**Response `data`**

```json
{
  "bookingId": "uuid",
  "znCode": "ZN0001",
  "status": "active",
  "clientName": "Mohammed Al-Rashidi",
  "packageName": "Family Package",
  "packageId": "uuid",
  "partySize": 5,
  "guests": 5,
  "arrivalDate": "2026-07-29",
  "departureDate": "2026-08-14",
  "daysLeft": 12,
  "isVip": false,
  "balance": {
    "total": 6000,
    "paid": 500,
    "due": 5500
  },
  "todayProgram": [
    {
      "id": "uuid",
      "dayNumber": 1,
      "itemDate": "2026-07-29",
      "startTime": "08:00:00",
      "title": "Airport transfer",
      "description": "Meet & greet",
      "locationName": "SVO Terminal C",
      "status": "pending",
      "carPlan": null,
      "meetingPoint": null,
      "guideContact": null,
      "pdfUrl": null,
      "notes": null,
      "vendorName": null,
      "vendorType": null,
      "qrPayload": "{\"znCode\":\"ZN0001\",\"activityId\":\"…\",\"title\":\"…\"}"
    }
  ],
  "tasks": [
    {
      "id": "uuid",
      "title": "VIP escalate: ZN0006",
      "description": "Guest needs airport fast-track in 45 minutes",
      "priority": "urgent",
      "status": "open",
      "dueDate": "2026-08-07",
      "completedAt": null,
      "bookingId": "uuid",
      "znCode": "ZN0006",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "open": [
    {
      "id": "uuid",
      "title": "tour to the misichilli garden in moscow",
      "priority": "urgent",
      "status": "open",
      "dueDate": "2026-09-09",
      "completedAt": null,
      "bookingId": "uuid",
      "znCode": "ZN0006",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "done": [
    {
      "id": "uuid",
      "title": "Take the dinner at the moscow resturants",
      "priority": "urgent",
      "status": "done",
      "dueDate": "2026-09-09",
      "completedAt": "2026-09-09T10:00:00.000Z",
      "bookingId": "uuid",
      "znCode": "ZN0006",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "taskCounts": { "open": 4, "done": 1, "total": 5 },
  "assignment": {
    "id": "uuid",
    "status": "active",
    "acceptedAt": null,
    "startedAt": null,
    "completedAt": null
  },
  "driver": {
    "name": "Alexei Sokolov",
    "phone": "+7…",
    "vehicle": "Mercedes E-Class"
  }
}
```

| Home UI | Field |
|---|---|
| Days left | `daysLeft` |
| Guests | `guests` (same as `partySize`) |
| Due | `balance.due` |
| Paid / Total | `balance.paid` / `balance.total` |
| Today schedule | `todayProgram` |
| Today's Schedule → **Open** tab | `open` (also mirrored in `tasks` for older builds) |
| Today's Schedule → **Done** tab | `done` (admin Complete → appears here) |
| Tab badges | `taskCounts.open` / `taskCounts.done` |
| Driver card | `driver` (null if not assigned yet) |

**Errors:** `403` if not client JWT · `404 BOOKING_NOT_FOUND` if no trip.

**Related (optional, not needed for home cards):**

- Full multi-day program → `GET /client/itinerary`
- One activity detail → `GET /client/activities/:id`
- Paginated / filter-only task lists → `GET /client/tasks`

---

## `GET /client/tasks`

**Auth:** Bearer client JWT  
**Endpoint:** `/api/v1/client/tasks`

Guest ko **sirf unke active booking (znCode)** ke tasks milte hain — wohi jo admin/ops Tasks board pe booking se link karke banate hain.

Jab admin **Complete** dabaata hai → task `status: "done"` + `completedAt` set → guest **Done** list mein aata hai, **Open** se hat jata hai.

**Query**

| Param | Values | Default |
|---|---|---|
| `page` / `limit` | pagination (used when `filter=open` or `done`) | `1` / `20` |
| `filter` | `all` \| `open` \| `done` | `all` |
| `status` | `open` \| `done` | optional (overrides filter) |

**Response `data`** (default `filter=all` — best for Today's Schedule)

```json
{
  "znCode": "ZN0006",
  "bookingId": "uuid",
  "open": [
    {
      "id": "uuid",
      "title": "tour to the misichilli garden in moscow",
      "description": "…",
      "priority": "urgent",
      "status": "open",
      "dueDate": "2026-09-09",
      "completedAt": null,
      "bookingId": "uuid",
      "znCode": "ZN0006",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "done": [
    {
      "id": "uuid",
      "title": "Take the dinner at the moscow resturants",
      "description": null,
      "priority": "urgent",
      "status": "done",
      "dueDate": "2026-09-09",
      "completedAt": "2026-09-09T10:00:00.000Z",
      "bookingId": "uuid",
      "znCode": "ZN0006",
      "createdAt": "ISO-8601",
      "updatedAt": "ISO-8601"
    }
  ],
  "data": [],
  "counts": { "open": 4, "done": 1, "total": 5 },
  "meta": { "total": 5, "page": 1, "limit": 20, "totalPages": 1 }
}
```

- **Open tab** → render `open[]`
- **Done tab** → render `done[]`
- `data` = flat `open + done` (legacy)
- `filter=open` → only `open` filled (paginated); `filter=done` → only `done` filled

## `GET /client/tasks/:id`

**Auth:** Bearer client JWT — own booking task only.

**Response `data`:** single task object (same shape as list item).

---

## `POST /auth/forgot-password`

**Auth:** public (throttle 10/min)

**Body:** `{ "phone": "string" }`

**Response `data`** (hamesha same, enumeration avoid)

```json
{
  "message": "If the phone is registered, an OTP has been sent"
}
```

OTP purpose: `reset_password`.

---

## `POST /auth/reset-password`

**Auth:** public

**Body**

```json
{
  "phone": "string",
  "code": "string (6)",
  "newPassword": "string (8–128)"
}
```

**Response `data`**

```json
{ "message": "Password reset successfully" }
```

---

## `POST /auth/refresh`

**Auth:** public (body mein refresh token)

Session restore: access JWT ~15m ka hota hai. App start / 401 pe ye call karo. Client refresh token **JWT** hai (30d) — Redis pe depend nahi karta. Same refresh token dubara use ho sakta hai jab tak expire na ho.

**Body:** `{ "refreshToken": "string" }`

**Response `data`**

```json
{
  "accessToken": "jwt",
  "refreshToken": "string"
}
```

Naya `refreshToken` store kar lo. Purana client refresh JWT bhi 30d tak valid rehta hai.

---

## `POST /auth/logout`

**Auth:** any logged-in user (client JWT OK)

**Body:** `{ "refreshToken": "string" }`

**Response `data`**

```json
{ "message": "Logged out successfully" }
```

---

## `POST /auth/change-password`

**Auth:** Bearer client JWT

**Body**

```json
{
  "currentPassword": "string",
  "newPassword": "string (8–128)"
}
```

**Response `data`**

```json
{ "message": "Password changed successfully" }
```

**Errors:** `401` current password galat.

---

## `GET /auth/me`

**Auth:** Bearer client JWT

**Response `data`**

```json
{
  "type": "client",
  "user": { "...ClientUser" }
}
```

---

### Push delivery (server → client app)

Jab ops/admin schedule banata / update karta hai, ya driver trip start/complete karta hai:

1. Backend `notifications` row create karta hai (`recipientType=client`)
2. WebSocket `notification.new` → room `client:{clientId}`
3. Agar client ne FCM token login pe bheja ho → Firebase push queue se device pe bhejta hai

Client app ko:
- Login pe `POST /auth/client/login` body mein `fcmToken` / `platform` bhejna chahiye
- Inbox ke liye `GET /notifications` (`filter=unread` + `meta.total` se badge)
- Realtime ke liye `/ws` pe `notification.new` sunna chahiye
- Push tap pe `data.znCode` / `data.bookingId` / `data.event` se deep-link

`FCM_SERVICE_ACCOUNT_JSON` (inline JSON **or** base64 JSON) **ya** `FCM_SERVICE_ACCOUNT_PATH` (local file path to Firebase Admin SDK JSON) set hona chahiye. Bina iske inbox + WS kaam karte hain, lekin device push **stub** rehta hai (`[fcm-stub]` logs).

---

# 2. Packages

## `GET /packages`

**Auth:** Bearer client JWT

Client ko **sirf `isActive: true`** packages milte hain.

**Response `data`:** `Package[]`

```json
{
  "id": "uuid",
  "name": "string",
  "slug": "string",
  "pricePerPerson": 0,
  "minPersons": 1,
  "durationDays": 7,
  "description": "string | null",
  "inclusions": ["string"],
  "isActive": true,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

---

# 3. Bookings (own trip only)

Client list/detail **apne `clientId`** se scoped hain. Dusre booking pe `403`.

## `GET /bookings`

**Auth:** Bearer client JWT

**Query:** pagination + optional `status=active|completed|cancelled`, optional `view=full|codes`

Default client ko **full** `Booking` objects milte hain. `view=codes` compact list:

```json
{
  "id": "uuid",
  "znCode": "string",
  "clientName": "string",
  "status": "active | completed | cancelled",
  "totalAmount": 0,
  "paidAmount": 0,
  "dueAmount": 0,
  "arrivalDate": "YYYY-MM-DD | null"
}
```

**Response:** paginated `{ data: Booking[] | BookingCode[], meta }`

---

## `GET /bookings/:id`

**Auth:** Bearer client JWT — must own booking

**Response `data`:** `Booking` (relations included)

---

## `GET /bookings/:id/checklist`

**Auth:** Bearer client JWT — own booking

**Response `data`:** `ChecklistItem[]`

```json
{
  "id": "uuid",
  "bookingId": "uuid",
  "title": "string",
  "isDone": false,
  "sortOrder": 0,
  "createdBy": "uuid | null",
  "createdAt": "ISO-8601"
}
```

Client **create/update/delete checklist nahi** kar sakta (staff write).

---

## `GET /bookings/:id/payments`

**Auth:** Bearer client JWT — own booking

**Response `data`:** `Payment[]`

```json
{
  "id": "uuid",
  "bookingId": "uuid",
  "amount": 0,
  "method": "cash | stripe | rajhi_transfer | usdt_trc20",
  "status": "pending | sent | opened | paid | expired | failed",
  "location": "string | null",
  "notes": "string | null",
  "paidAt": "ISO-8601 | null",
  "createdAt": "ISO-8601"
}
```

Client payments **create nahi** kar sakta (`POST /payments/*` staff/splizer).

---

# 4. Itinerary

## `GET /bookings/:id/itinerary`

**Auth:** Bearer client JWT — own booking

**Response `data`:** `ItineraryItem[]` (dayNumber, sortOrder, startTime ASC)

```json
{
  "id": "uuid",
  "bookingId": "uuid",
  "dayNumber": 1,
  "itemDate": "YYYY-MM-DD | null",
  "startTime": "HH:mm:ss | null",
  "title": "string",
  "description": "string | null",
  "locationName": "string | null",
  "lat": 0,
  "lng": 0,
  "vendorId": "uuid | null",
  "driverId": "uuid | null",
  "status": "pending | active | done | cancelled",
  "sortOrder": 0,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

Itinerary write (add/import/patch/delete items) **staff only**.

---

# 5. Edit requests

Client create **apni latest active booking** pe lagta hai (`bookingId` body mein nahi).

## `POST /edit-requests`

**Auth:** Bearer client JWT **only**

**Body**

```json
{
  "type": "date_change | itinerary_change | vip_upgrade | other",
  "requestedValue": "string (optional)",
  "originalValue": "string (optional — server booking se default bhi set karta hai)",
  "reason": "string (optional)"
}
```

**Response `data`:** `EditRequest`

```json
{
  "id": "uuid",
  "bookingId": "uuid",
  "znCode": "string | null",
  "clientName": "string | null",
  "clientPhone": "string | null",
  "type": "date_change | itinerary_change | vip_upgrade | other",
  "originalValue": "string | null",
  "requestedValue": "string | null",
  "reason": "string | null",
  "status": "pending | approved | rejected",
  "reviewNotes": "string | null",
  "reviewedBy": "uuid | null",
  "reviewedByName": "string | null",
  "reviewedAt": "ISO-8601 | null",
  "targetDate": "YYYY-MM-DD | null",
  "arrivalDate": "YYYY-MM-DD | null",
  "departureDate": "YYYY-MM-DD | null",
  "createdAt": "ISO-8601"
}
```

**Errors:** no active booking → `ACTIVE_BOOKING_NOT_FOUND`.

Approve/reject **staff only**.

---

## `GET /edit-requests/:id`

**Auth:** Bearer client JWT — sirf apni booking ka request

**Response `data`:** `EditRequest`

---

## `GET /bookings/:bookingId/edit-requests`

**Auth:** Bearer client JWT — own booking

**Response `data`:** `EditRequest[]`

---

# 6. VIP request

## `POST /vip/request`

**Auth:** Bearer client JWT **only**

Latest **active** booking pe `vip_upgrade` edit-request create karta hai.

**Body**

```json
{ "reason": "string (optional)" }
```

**Response `data`:** same `EditRequest` as above (`type: "vip_upgrade"`).

**Errors:**

- `404 ACTIVE_BOOKING_NOT_FOUND`
- `409 ALREADY_VIP`
- `409 VIP_REQUEST_PENDING`

---

# 7. SOS

SOS bhi client ki **latest active booking** se bind hota hai.

## `POST /sos`

**Auth:** Bearer client JWT **only**

**Body**

```json
{
  "message": "string (optional)",
  "lat": 0,
  "lng": 0
}
```

Agar `message` na ho to default Arabic emergency text booking `znCode` ke sath.

**Response `data`:** `SosAlert`

```json
{
  "id": "uuid",
  "bookingId": "uuid",
  "znCode": "string | null",
  "clientName": "string | null",
  "clientPhone": "string | null",
  "message": "string | null",
  "lat": 0,
  "lng": 0,
  "status": "active | resolved",
  "resolvedBy": "uuid | null",
  "resolvedByName": "string | null",
  "resolvedAt": "ISO-8601 | null",
  "createdAt": "ISO-8601"
}
```

**Errors:** `404 ACTIVE_BOOKING_NOT_FOUND`

---

## `GET /sos/:id`

**Auth:** Bearer client JWT — sirf apni booking ka SOS

**Response `data`:** `SosAlert`

List-all SOS (`GET /sos`) **staff only**.

---

# 8. Driver reviews

## `GET /reviews/me`

**Auth:** Bearer client JWT **only**

Apni reviews, paginated.

**Query:** `page`, `limit`, optional `driverId`, `bookingId`, `minRating` (1–5)

**Response:** `{ data: DriverReview[], meta }`

```json
{
  "id": "uuid",
  "bookingId": "uuid",
  "znCode": "string",
  "clientId": "uuid",
  "clientName": "string",
  "driverId": "uuid",
  "driverName": "string",
  "rating": 1,
  "comment": "string | null",
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

---

## `POST /reviews`

**Auth:** Bearer client JWT **only**

Create **ya upsert** (same booking+driver). Booking client ki honi chahiye; driver assignment se resolve hota hai agar `driverId` skip ho.

**Body**

```json
{
  "bookingId": "uuid",
  "driverId": "uuid (optional)",
  "rating": 1,
  "comment": "string max 1000 (optional)"
}
```

**Response `data`:** `DriverReview`

---

# 9. Chat

Client `CHAT_ROLES` mein hai. Sirf un conversations ka access jin ka participant hai (`client:{id}`).

`ConversationType` values: `team | dm | booking_support | client_direct`.

## `GET /chat/conversations`

**Auth:** Bearer client JWT

**Response `data`:** `Conversation[]`

```json
{
  "id": "uuid",
  "type": "booking_support",
  "bookingId": "uuid | null",
  "title": "string | null",
  "createdAt": "ISO-8601",
  "lastMessageAt": "ISO-8601 | null",
  "unreadCount": 0,
  "znCode": "ZN0001",
  "clientName": "Guest Name"
}
```

---

## `POST /chat/conversations`

**Auth:** Bearer client JWT

**Client allowed types only:** `booking_support` | `client_direct`  
**Client must send `bookingId`** (own booking). `team` / `dm` → 403.

**Preferred for support chat:** `POST /chat/bookings/:bookingId/thread` (below).

**Body**

```json
{
  "type": "booking_support",
  "bookingId": "uuid",
  "title": "string (optional)"
}
```

**Response `data`:** `Conversation`

---

## `POST /chat/bookings/:bookingId/thread`

**Auth:** Bearer client JWT — booking must belong to this client

Get-or-create the single `booking_support` thread for that trip (idempotent).  
Participants: guest + ops/support/admin (+ assigned driver if any).

**Body:** none  
**Response `data`:** `Conversation`

---

## `GET /chat/conversations/:id/messages`

**Auth:** Bearer client JWT — must be participant

**Query**

| Query | Type | Default |
|---|---|---|
| `before` | message uuid (cursor) | — older than that message |
| `limit` | 1–100 | `50` |

**Response `data`:** `Message[]` chronological (oldest → newest)

```json
{
  "id": "uuid",
  "conversationId": "uuid",
  "senderType": "staff | client | system",
  "senderRole": "admin | driver | splizer | null",
  "senderStaffId": "uuid | null",
  "senderClientId": "uuid | null",
  "senderName": "string | null",
  "body": "string",
  "bodyTranslated": { "en": "…", "ar": "…" },
  "sourceLang": "ar | en | ru | null",
  "attachments": [],
  "createdAt": "ISO-8601"
}
```

`senderRole` is the chat channel (`admin` | `driver` | `splizer`).  
Staff ops roles (`ops_manager`, `support`) map to `admin`. Staff list/unread/realtime only receive messages for their own channel.

---

## `POST /chat/conversations/:id/messages`

**Auth:** Bearer client JWT — participant

**Body**

```json
{
  "body": "string (min 1)",
  "senderRole": "admin | driver | splizer",
  "attachments": [{ "any": "json object" }]
}
```

`senderRole` is **required for clients** (Support → `admin`, Driver → `driver`, Splizer → `splizer`).  
Staff may omit it (derived from their role) or set it explicitly.

**Response `data`:** `Message`  
Realtime: `message.new` only to the guest + staff on that same channel (not other roles).

---

## `POST /chat/conversations/:id/read`

**Auth:** Bearer client JWT — participant

**Body:** `{ "lastMessageId": "uuid" }`

**Response `data`**

```json
{ "read": true }
```

`GET /chat/client-threads` **staff only**.

---

# 10. Notifications

Controller pe list **koi bhi authenticated user** (client ko sirf apni rows). Unread-count / mark-read **staff-only** hain — client app unhe use nahi karti.

## `GET /notifications`

**Query:** pagination + `filter=all|unread` (optional)

**Response:** `{ data: Notification[], meta }`

```json
{
  "id": "uuid",
  "recipientType": "staff | client",
  "staffId": "uuid | null",
  "clientId": "uuid | null",
  "type": "sos | payment | task | chat | edit_request | vip | system | assignment | program",
  "title": "string",
  "body": "string | null",
  "data": {},
  "readAt": "ISO-8601 | null",
  "isRead": false,
  "createdAt": "ISO-8601"
}
```

Client unread count locally `filter=unread` + `meta.total` se nikal sakta hai.

---

# 11. Health (optional)

## `GET /system/health`

**Auth:** public

**Response `data`**

```json
{
  "status": "ok | degraded",
  "checks": {
    "api": { "status": "operational" },
    "postgres": { "status": "operational | down", "detail": "optional" },
    "redis": { "status": "operational | down" },
    "stripe": { "status": "configured | missing_key" },
    "claude": { "status": "configured | missing_key" }
  },
  "websocket": "see /ws namespace"
}
```

---

# 12. WebSocket (client)

| | |
|---|---|
| Namespace | `/ws` |
| Auth | `socket.handshake.auth.token` = **access JWT** |
| Auto room | `client:{clientId}` |
| Conversation room | emit `chat.join` / `chat.leave` |
| Fail | token missing/invalid → disconnect |

**Listen (server → client):**

| Event | Payload | Kab |
|---|---|---|
| `notification.new` | `Notification` | Inbox event |
| `message.new` | `Message` | New chat message |
| `message.translated` | `Message` | Translations ready |
| `message.read` | `{ conversationId, lastMessageId, readerType, readerId }` | Read receipt |
| `chat.typing` | `{ conversationId, userType, userId, role }` | Other party typing (needs `chat.join`) |

**Emit (client → server):**

| Event | Body |
|---|---|
| `chat.join` | `{ "conversationId": "uuid" }` |
| `chat.leave` | `{ "conversationId": "uuid" }` |
| `chat.typing` | `{ "conversationId": "uuid" }` (throttle ~1s) |

Broadcast ops events (`booking.created`, `payment.recorded`, …) ignore karo unless payload apni booking ka ho.

Connect example:

```ts
io("https://zeengobackend-production.up.railway.app/ws", {
  auth: { token: accessToken },
});
```

Full mobile prompt: `docs/MOBILE_CHAT_WEBSOCKET_PROMPT.md`

---

# Endpoint index (client surface)

| Method | Path | Auth |
|---|---|---|
| POST | `/auth/client/register` | public |
| POST | `/auth/client/verify-otp` | public |
| POST | `/auth/client/login` | public |
| POST | `/auth/forgot-password` | public |
| POST | `/auth/reset-password` | public |
| POST | `/auth/refresh` | public |
| POST | `/auth/logout` | JWT |
| POST | `/auth/change-password` | JWT |
| GET | `/auth/me` | JWT |
| GET | `/client/home` | JWT client — **home screen all-in-one** |
| GET | `/client/itinerary` | JWT client |
| GET | `/client/tasks` | JWT client — tasks for this znCode |
| GET | `/client/tasks/:id` | JWT client |
| GET | `/client/activities/:id` | JWT client |
| GET | `/packages` | JWT |
| GET | `/bookings` | JWT (own) |
| GET | `/bookings/:id` | JWT (own) |
| GET | `/bookings/:id/checklist` | JWT (own) |
| GET | `/bookings/:id/payments` | JWT (own) |
| GET | `/bookings/:id/itinerary` | JWT (own) |
| GET | `/bookings/:bookingId/edit-requests` | JWT (own) |
| POST | `/edit-requests` | JWT client-only |
| GET | `/edit-requests/:id` | JWT (own) |
| POST | `/vip/request` | JWT client-only |
| POST | `/sos` | JWT client-only |
| GET | `/sos/:id` | JWT (own) |
| GET | `/reviews/me` | JWT client-only |
| POST | `/reviews` | JWT client-only |
| GET | `/chat/conversations` | JWT |
| POST | `/chat/conversations` | JWT client — booking_support / client_direct only |
| POST | `/chat/bookings/:bookingId/thread` | JWT client — preferred support chat |
| GET | `/chat/conversations/:id/messages` | JWT |
| POST | `/chat/conversations/:id/messages` | JWT |
| POST | `/chat/conversations/:id/read` | JWT |
| GET | `/notifications` | JWT |
| GET | `/system/health` | public |

**Client-only writes (staff cannot):** SOS create, edit-request create, VIP request, review create/list-mine.

**Typical client cannot:** create booking, pay cash/stripe-link, mutate itinerary, resolve SOS, dashboard, drivers ops, vendors, finance, users, settings.

---

*Generated from Nest controllers, Zod schemas, and mappers in `src/` (`devel`).*
