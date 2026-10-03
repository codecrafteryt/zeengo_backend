# ZEENGO — Release Readiness

**Date:** 2026-10-03  
**Decision:** Do **not** push or deploy yet. Local `devel` contains the production-required work. Railway `zeengo_backend` is still `12e8d93` (2026-09-30).

---

## Commits to deploy

Three separate git roots. None of the new work in this pass is committed until the operator asks; uncommitted files are listed below.

### Backend (`backend/zeengo_backend`, branch `devel`)

Already on `devel` ahead of `origin/devel` (not on Railway):

| Commit | Why it must ship |
|---|---|
| `d13e69e` | Customer booking request + ZN workflow |
| `5de1764` / `1531c57` / `20bbc06` | Public catalog, rooms/vehicles/trains, request summary |
| `2ec3b34` | ZN login requires phone; session bound to one booking |
| `12e8d93` | **Already on Railway** — `scripts/start-prod.sh` (`prisma migrate deploy` then Nest) |

Uncommitted on local `devel` (this pass + prior hardening):

- Documents + storage + audit-logs API
- Health live/ready + schema probe
- Itinerary / assignment / task audit writes
- `20261003190000_payment_paid_at_index`
- `20261003200000_booking_documents`
- Dashboard/finance collected + schema-drift filter (from the previous audit pass)

### Admin (`frontend`, branch `devel`)

Already ahead: customer request panel (`16a5fb9`). Uncommitted: Documents tab, audit logs page, Collected card, Support/roles copy.

### Website (`Website_frontend`, branch `devel`)

Already ahead: tutu-style booking flow (`c55c7f5`). Uncommitted: My Trip documents.

---

## Migrations

Run **only** `prisma migrate deploy` (already in `scripts/start-prod.sh`).

Order after Railway’s current head:

1. Any catalog / booking-request migrations already on `devel` and not on `12e8d93`
2. `20261003190000_payment_paid_at_index`
3. `20261003200000_booking_documents`

After deploy:

```
npx prisma migrate status
```

Must report up to date. Confirm `bookings.children_count` and `documents` exist.

Do **not** use `prisma db push` in production.

---

## Environment variables

Required (already expected):

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET` / `JWT_REFRESH_SECRET`
- `APP_WEB_ORIGIN` / `CORS_ORIGIN`
- `NODE_ENV=production`

Storage (new):

- `STORAGE_PROVIDER=local` **and** a Railway volume on `STORAGE_LOCAL_DIR`, **or**
- `STORAGE_PROVIDER=s3` + `STORAGE_BUCKET` + keys (+ optional `STORAGE_ENDPOINT`)

Keep unset unless doing a controlled bootstrap:

- `SEED_BOOTSTRAP_TOKEN`

Config-aware (do not fake):

- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`
- FCM JSON/path
- `ANTHROPIC_API_KEY`

Do not print or commit secrets.

---

## Frontend / website / backend change summary

| Surface | What ships |
|---|---|
| Backend | Documents, audit-logs, health ready, history coverage, catalog+request already on devel |
| Admin | Documents tab, audit logs, Collected (not Revenue Today), roles honesty |
| Website | Real request flow (already) + My Trip documents |

---

## Rollback

1. Railway: redeploy previous successful commit (`12e8d93` if nothing else has shipped).
2. Do **not** roll back `20261003200000_booking_documents` unless the table is empty — it is additive.
3. `paid_at` index is additive and safe to leave.
4. Frontends: revert to last production build if API is rolled back before documents exist (Documents tab will 404 until API is up).

---

## Verification checklist (after an approved deploy)

- [ ] `GET /api/v1/system/health/live` → 200
- [ ] `GET /api/v1/system/health/ready` → 200, schema operational
- [ ] `POST /auth/client/zn-login` → not 500, no P2021/P2022
- [ ] `GET /payments/history` → 200
- [ ] `GET /dashboard/overview` Collected = all-time paid (local reference: US$225 cash)
- [ ] Customer `POST /client/bookings/request` → ZN + pending
- [ ] OPS confirm → customer My Trip confirmed
- [ ] Upload document → customer visible download
- [ ] Unrelated customer/driver cannot download
- [ ] Support cannot open dashboard or `/audit-logs`
- [ ] Catalog endpoints match website
- [ ] Railway logs: no Prisma unknown column / missing table

---

## Can deployment proceed?

**Not yet from this pass.**

Reasons:

1. Operator has not approved push to `main` / Railway.
2. Storage on Railway must be a volume or S3 before treating documents as durable.
3. Stripe/FCM/AI remain configuration-gated.

When approved: commit the three repos on `devel`, review the diff, then merge/deploy without force-push.
