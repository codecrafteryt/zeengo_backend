# Zeengo Backend — Folder Structure & Ownership Map

> Architecture style: **domain-based** (not `admin/` vs `app/`).
> One NestJS API (`/api/v1`). Surfaces differ by **JWT type + `@Roles`**, not by separate folder trees.

| Surface | Who | JWT |
|---|---|---|
| Ops Dashboard (web) | `admin`, `ops_manager`, `splizer`, `support`, `driver` | `type: staff` |
| Client App (Flutter) | `client` | `type: client` |
| Public / system | anyone / Stripe | no auth or webhook |

**Legend**

| Tag | Meaning |
|---|---|
| 🟢 Shared | Staff + client (often row-scoped for client) |
| 🔵 Dashboard / Staff | Ops dashboard roles only |
| 🟣 Admin-only | `admin` only |
| 🟠 Client-app focused | Primary client actions (may still share module with staff) |
| ⚪ Infra / kernel | Internal — no product UI ownership |

---

## 1. Top-level layout

```
src/
├── main.ts / app.module.ts / app.controller.ts / app.service.ts   ⚪
├── common/     ⚪ shared kernel
├── config/     ⚪ env validation
├── prisma/     ⚪ DB client
├── redis/      ⚪ cache / tokens / GPS
├── system/     🟢 public health
├── auth/       🟢 staff + client auth
├── users/      🟣 admin staff accounts
├── settings/   🟣 admin settings
├── packages/   🟢 read shared · write admin
├── clients/    🔵 staff CRM
├── bookings/   🟢 shared (client = own booking)
├── itineraries/🟢 shared (client = own program)
├── payments/   🔵 money + splizer
├── finance/    🔵 admin/ops
├── webhooks/   ⚪ Stripe (public)
├── drivers/    🔵 ops + driver self
├── tasks/      🔵 staff
├── dashboard/  🔵 admin/ops
├── vendors/    🔵 staff
├── edit-requests/ 🟢 shared
├── vip/        🟢 shared
├── sos/        🟢 shared
├── chat/       🟢 shared
├── notifications/ 🟢 shared
├── ai/         🔵 staff tools
├── realtime/   🟢 WS gateway
└── jobs/       ⚪ BullMQ workers
```

Per domain file pattern:

```
{domain}/
  {domain}.module.ts
  {domain}.controller.ts
  {domain}.service.ts
  {domain}.schema.ts      # Zod inputs
  {domain}.mapper.ts      # DB → API (when needed)
```

---

## 2. Infra / kernel (⚪) — shared by everyone

| Folder / file | Purpose | Consumer |
|---|---|---|
| `main.ts` | Bootstrap, CORS, Helmet, Swagger `/api/docs` | All |
| `app.module.ts` | Wires all modules + global guards | All |
| `common/` | Envelope, errors, Zod pipe, pagination, JWT/Roles guards, audit, crypto | All modules |
| `common/auth/jwt.strategy.ts` | Passport JWT | Staff + client |
| `config/env.validation.ts` | Typed env (Zod) | Boot |
| `prisma/` | `PrismaService` | All domains |
| `redis/` | Cache, refresh tokens, GPS, dashboard TTL | Auth, drivers, bookings, dashboard, jobs |
| `jobs/` | BullMQ queues: translation, push, ai, payments, digest, cleanup | Async side-effects |
| `realtime/` | Socket.IO `/ws` + emitter | Live updates for dashboard + app |
| `webhooks/` | `POST /webhooks/stripe` (public) | Stripe → payments |
| `system/` | `GET /system/health` (public) | Ops Support page + monitoring |

---

## 3. Auth (🟢 Shared module — different routes)

**Folder:** `src/auth/`

| File | Role |
|---|---|
| `auth.controller.ts` | HTTP routes |
| `auth.service.ts` | Login, OTP, refresh (Redis), passwords |
| `auth.schema.ts` | Zod bodies |
| `auth.module.ts` | JwtModule + Passport |

| Endpoint | Audience |
|---|---|
| `POST /auth/staff/login` | 🔵 Dashboard |
| `POST /auth/client/register` | 🟠 Client app |
| `POST /auth/client/verify-otp` | 🟠 Client app |
| `POST /auth/client/login` | 🟠 Client app |
| `POST /auth/forgot-password` | 🟠 Client (phone OTP) |
| `POST /auth/reset-password` | 🟠 Client |
| `POST /auth/change-password` | 🟢 Both (authenticated) |
| `POST /auth/refresh` | 🟢 Both |
| `POST /auth/logout` | 🟢 Both |
| `GET /auth/me` | 🟢 Both |

---

## 4. Dashboard / Staff-only domains (🔵 / 🟣)

### `users/` — 🟣 Admin only

| Endpoint | Notes |
|---|---|
| `GET/POST /users`, `PATCH /users/:id` | Staff CRUD |
| `GET /users/stats` | Role counts |
| `POST /users/:id/reset-password` | Temp password |

Files: `users.controller|service|schema|mapper|module.ts`

### `settings/` — 🟣 Admin only

| Endpoint | Notes |
|---|---|
| `GET /settings`, `GET/PUT /settings/:key` | VIP price, Stripe expiry, company profile |

### `dashboard/` — 🔵 `admin`, `ops_manager`

| Endpoint | Notes |
|---|---|
| `GET /dashboard/summary` | KPIs (Redis ~30s) |
| `GET /dashboard/urgent-alerts` | SOS + edits + tasks |
| `GET /dashboard/schedule` | today / tomorrow |
| `POST /dashboard/eod-report` | create |
| `POST /dashboard/eod-report/:id/send` | distribute |

### `finance/` — 🔵 `admin`, `ops_manager`

| Endpoint | Notes |
|---|---|
| `GET /finance/summary` | Today stripe/cash/pending |
| `GET /finance/revenue-by-method` | Chart series |

### `payments/` + `splizer.controller.ts` — 🔵 Staff money

| Endpoint | Roles (typical) |
|---|---|
| `POST /payments/cash` | admin, ops, splizer |
| `POST /payments/stripe-link` | admin, ops, splizer |
| `GET /payments/history` | admin, ops, splizer |
| `GET /payments` | admin, ops |
| `GET /splizer/clients` | splizer (+ module policy) |
| `GET /splizer/clients/by-code/:znCode` | splizer |

Client still **sees own payments** via booking routes / app — not via Splizer UI.

### `clients/` — 🔵 Staff CRM (not Flutter “my profile”)

| Endpoint | Roles |
|---|---|
| `GET /clients?search=` | Staff |
| `GET /clients/:id` | Staff |
| `PATCH /clients/:id` | admin, ops, support |

Client profile self-service is mostly `/auth/me` + own booking.

### `drivers/` — 🔵 Ops + 🔵 Driver self

| Endpoint | Audience |
|---|---|
| `GET/PATCH /drivers…`, assignments, live-positions | Ops (admin/ops/support) |
| `GET /drivers/me/schedule` | Driver |
| `PUT /drivers/me/status` | Driver |
| `POST /drivers/me/gps` | Driver |

### `tasks/` — 🔵 Staff

| Endpoint | Notes |
|---|---|
| `GET/POST/PATCH /tasks`, `POST /tasks/:id/complete` | admin/ops (+ assignee complete) |

### `vendors/` — 🔵 Staff

| Endpoint | Notes |
|---|---|
| CRUD `/vendors`, `POST /vendors/:id/assign`, `GET /vendors/:id/finance` | admin/ops/support |

### `ai/` — 🔵 Staff tools

| Endpoint | Roles |
|---|---|
| `POST /ai/parse-itinerary` | admin, ops |
| `POST /ai/chatbot` | all staff |
| `POST /ai/email-draft` | admin, ops, support |
| `POST /ai/eod-report` | admin, ops |

---

## 5. Shared domains (🟢) — dashboard + Flutter

Same folder; **row scoping** for client (own booking / own SOS / own requests).

### `packages/`

| Endpoint | Audience |
|---|---|
| `GET /packages` | 🟢 Staff + client (active) |
| `POST/PATCH/DELETE /packages` | 🟣 Admin only |

### `bookings/`

| Endpoint | Audience |
|---|---|
| `POST /bookings` | 🔵 Staff create |
| `GET /bookings`, `GET /bookings/stats` | 🔵 Staff (+ splizer limited) |
| `GET /bookings/:id` | 🟢 Staff or **owning client** |
| `PATCH /bookings/:id` | 🔵 Staff write |
| Checklist / notes / payments sub-routes | Staff write; client may read/toggle per service rules |

### `itineraries/`

| Endpoint | Audience |
|---|---|
| `GET /bookings/:id/itinerary` | 🟢 Staff + owning client |
| Item CRUD / import | 🔵 Staff |
| `GET /daily-operations`, `/daily-operations/week` | 🔵 Ops dashboard |

### `edit-requests/`

| Endpoint | Audience |
|---|---|
| `POST /edit-requests` | 🟠 Client |
| `GET /edit-requests`, approve/reject | 🔵 Staff |
| `GET /edit-requests/:id`, nested under booking | 🟢 Staff + owner |

### `vip/`

| Endpoint | Audience |
|---|---|
| `GET /vip/overview|requests|clients`, `POST /vip/activate` | 🔵 Staff |
| `POST /vip/request` | 🟠 Client |

### `sos/`

| Endpoint | Audience |
|---|---|
| `POST /sos` | 🟠 Client |
| `GET /sos`, `POST /sos/:id/resolve` | 🔵 Staff |
| `GET /sos/:id` | 🟢 Staff + related client |

### `chat/`

| Endpoint | Audience |
|---|---|
| Conversations / messages / read | 🟢 Participants (staff + client) |
| `GET /chat/client-threads` | 🔵 Splizer / driver (+ ops) |

### `notifications/`

| Endpoint | Audience |
|---|---|
| `GET /notifications` | 🟢 **Own** inbox (staff or client) |
| unread-count / mark-read | 🔵 Staff only |

---

## 6. Who uses which folders (quick matrix)

| Folder | Dashboard (Admin/Ops/…) | Client App | Notes |
|---|:-:|:-:|---|
| `common`, `prisma`, `redis`, `config`, `jobs`, `realtime` | ✓ | ✓ | Infra |
| `auth` | ✓ | ✓ | Different login routes |
| `system` | ✓ | ✓ | Health |
| `users`, `settings` | ✓ (admin) | — | |
| `dashboard`, `finance`, `tasks`, `vendors`, `ai` | ✓ | — | |
| `clients`, `payments`, `splizer` | ✓ | △ | Client sees money via own booking |
| `drivers` | ✓ | △ | Client sees assigned driver on trip card |
| `packages`, `bookings`, `itineraries` | ✓ | ✓ | Client read/own |
| `edit-requests`, `vip`, `sos`, `chat`, `notifications` | ✓ | ✓ | Client initiates many actions |
| `webhooks` | — | — | Stripe only |

△ = data surfaces in app, but folder’s **write/list admin APIs** are staff-oriented.

---

## 7. File-type cheat sheet (every domain)

| File | Responsibility |
|---|---|
| `*.module.ts` | Nest DI wiring |
| `*.controller.ts` | Routes + `@Roles` / `@Public` |
| `*.service.ts` | Business logic + Prisma + Redis |
| `*.schema.ts` | Zod request/query validation |
| `*.mapper.ts` | Snake/Prisma → camelCase API DTO |
| `*.processors.ts` (jobs) | BullMQ workers |

---

## 8. Mental model (important)

```
❌ Wrong expectation
src/admin/...
src/app/...

✅ Actual design
src/{domain}/...     +  @Roles('admin'|'client'|...)  +  service row-scoping
```

- **Folders = business domains** (bookings, payments, SOS…).
- **Roles = which product surface may call which route.**
- **Client never gets a separate Nest app** in this repo — Flutter talks to the same `/api/v1` with a client JWT.

---

## 9. Related docs

- [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) — phases, quality rules, stack
- Specs (external): `BACKEND_SPEC.md`, `TECHNICAL_SPEC.md`, `USER_FLOW.md`
- Live contract: Swagger → `http://localhost:3000/api/docs`
