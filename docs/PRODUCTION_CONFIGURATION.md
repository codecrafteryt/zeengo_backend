# PRODUCTION CONFIGURATION

Verified against Railway project **overflowing-elegance** / service **zeengo_backend** / environment **production** on 2026-10-03.

Values are **never** printed. Status only: SET / MISSING / NOT REQUIRED.

---

## Railway variables (live service)

| Variable | Required? | Railway | Purpose |
|---|---|---|---|
| `DATABASE_URL` | YES | SET | Postgres |
| `REDIS_URL` | YES | SET | Cache / refresh / health |
| `JWT_SECRET` | YES | SET | Access JWT |
| `JWT_REFRESH_SECRET` | YES | SET | Refresh JWT |
| `JWT_ACCESS_TTL` | optional | SET | Default 15m if unset |
| `JWT_REFRESH_TTL` | optional | SET | Default 30d if unset |
| `NODE_ENV` | YES | SET | Must be `production` |
| `APP_WEB_ORIGIN` | YES | SET | CORS allowlist (admin + website origins) |
| `STORAGE_PROVIDER` | YES for durable files | MISSING (defaults local) | `local` or `s3` |
| `STORAGE_LOCAL_DIR` | if local | MISSING | Must be a mounted volume path |
| `STORAGE_BUCKET` + keys + region | if s3 | MISSING | Object storage |
| `STRIPE_SECRET_KEY` | optional | MISSING | Payment links → 503 in prod |
| `STRIPE_WEBHOOK_SECRET` | optional | MISSING | Webhooks. Local code now **rejects** unsigned events in production |
| FCM JSON / path | optional | MISSING | Push → `configured:false` |
| `ANTHROPIC_API_KEY` | optional | MISSING | AI → `missing_key` |
| `SEED_BOOTSTRAP_TOKEN` | keep unset | MISSING (correct) | Enables `POST /system/seed-demo` in production |
| `ALLOW_DEMO_STAFF` | keep unset | MISSING (correct) | New. Production boot will not seed demo staff |
| `ALLOW_ZN_ONLY_LOGIN` | keep unset | not listed | If `true`, phone check is skipped |

---

## Railway runtime

| Item | Status |
|---|---|
| Start command | `sh scripts/start-prod.sh` (migrate deploy, then Nest) |
| Last SUCCESS deploy | `12e8d93` · 2026-09-30 |
| Domain | `https://zeengobackend-production-d058.up.railway.app` |
| Volume mounts | **none** |
| Postgres service | present |
| Redis service | present |

---

## Storage

| Variable | Purpose |
|---|---|
| `STORAGE_PROVIDER` | `local` (default) or `s3` |
| `STORAGE_LOCAL_DIR` | Persistent directory. On Railway, mount a volume here. Ephemeral disks lose files on redeploy |
| `STORAGE_BUCKET` | Required when `STORAGE_PROVIDER=s3` |
| `STORAGE_REGION` | S3 region |
| `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | S3 credentials |
| `STORAGE_ENDPOINT` | Optional S3-compatible endpoint |

Downloads always go through authorized API endpoints. Do not expose raw public object URLs.

---

## Health

| Path | Local `devel` | Railway `12e8d93` |
|---|---|---|
| `GET /api/v1/system/health` | 200 + schema/storage flags | 200 (no schema/storage keys) |
| `GET /api/v1/system/health/live` | 200 | **404** |
| `GET /api/v1/system/health/ready` | 200 (Postgres + Redis + `bookings.children_count`) | **404** |
| `GET /api/v1/health/live` | alias | missing |

Stripe / FCM / AI `missing_key` does **not** fail readiness on local `devel`.

---

## Frontends

| App | Dev API | Production API env |
|---|---|---|
| Admin (`frontend`) | `VITE_API_BASE_URL_LOCAL` | `VITE_API_BASE_URL_PRODUCTION` → Railway origin |
| Website (`Website_frontend`) | same | same |

Build/prod does not use localhost. Fallback origin in source is the Railway URL, not `127.0.0.1`.

Netlify: no `netlify.toml` / `_redirects` in this repo. Confirm SPA fallback on the host.

---

## Development-only behaviors (must not apply in production)

- Stripe placeholder URL `https://pay.zeengo.local/dev/{id}` only when `NODE_ENV≠production`
- Unsigned Stripe webhook only when `NODE_ENV≠production` **and** `x-zeengo-dev-webhook: 1`
- Demo staff password reset on boot only when `NODE_ENV≠production`
- `POST /system/seed-demo` in production requires `SEED_BOOTSTRAP_TOKEN` (keep unset)

Never commit real secrets. Prefer platform secret stores.
