# PRODUCTION CONFIGURATION

## Required

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `REDIS_URL` | Bull + health |
| `JWT_SECRET` | Access tokens (≥16) |
| `JWT_REFRESH_SECRET` | Refresh tokens (≥16) |
| `NODE_ENV` | `production` in prod |

## Strongly required in production

| Variable | Behavior if missing |
|---|---|
| `STRIPE_SECRET_KEY` | Stripe link create returns **503** (no fake URL) |
| `STRIPE_WEBHOOK_SECRET` | Webhooks fail verification |
| `FCM_SERVICE_ACCOUNT_JSON` or `PATH` | Push returns `configured:false` / not delivered |
| `APP_WEB_ORIGIN` / CORS | Browser access |

## Storage

| Variable | Purpose |
|---|---|
| `STORAGE_PROVIDER` | `local` (default) or `s3` |
| `STORAGE_LOCAL_DIR` | Persistent directory. On Railway, mount a volume here. Ephemeral disks lose files on redeploy |
| `STORAGE_BUCKET` | Required when `STORAGE_PROVIDER=s3` |
| `STORAGE_REGION` | S3 region |
| `STORAGE_ACCESS_KEY` / `STORAGE_SECRET_KEY` | S3 credentials |
| `STORAGE_ENDPOINT` | Optional S3-compatible endpoint (Railway bucket / MinIO) |

Downloads always go through authorized API endpoints. Do not expose raw public object URLs.

## Optional

`ANTHROPIC_API_KEY`, VIP price, Stripe link expiry hours.

`SEED_BOOTSTRAP_TOKEN` — required to enable `POST /system/seed-demo` when `NODE_ENV=production`. Leave unset to keep the endpoint disabled.

## Development-only behaviors

- Stripe DEV placeholder URL `https://pay.zeengo.local/dev/{id}` **only when NODE_ENV≠production**
- FCM may be unconfigured; logs `fcm_not_configured`

## Health

| Path | Meaning |
|---|---|
| `GET /api/v1/system/health/live` | Process is up |
| `GET /api/v1/health/live` | Same alias |
| `GET /api/v1/system/health/ready` | Postgres + Redis + `bookings.children_count` present. 503 if not |
| `GET /api/v1/system/health` | Combined status + config flags (no secrets) |

Never commit real secrets. Prefer platform secret stores.
