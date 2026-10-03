# PRODUCTION CONFIGURATION

Verified 2026-10-03 against Railway project **overflowing-elegance** / service **zeengo_backend** / environment **production**.

Values are never printed. Status only: SET / MISSING / NOT REQUIRED.

---

## Railway variables

| Variable | Required? | Railway | Purpose |
|---|---|---|---|
| `DATABASE_URL` | YES | SET | Postgres |
| `REDIS_URL` | YES | SET | Cache / refresh / health / revoke list |
| `JWT_SECRET` | YES | SET | Access JWT |
| `JWT_REFRESH_SECRET` | YES | SET | Refresh JWT |
| `JWT_ACCESS_TTL` | optional | SET | Default 15m |
| `JWT_REFRESH_TTL` | optional | SET | Default 30d |
| `NODE_ENV` | YES | SET | `production` |
| `APP_WEB_ORIGIN` | YES | SET | Code now **ignores `*` in production** and always allows the two Vercel hosts |
| `STORAGE_PROVIDER` | YES | SET | `local` |
| `STORAGE_LOCAL_DIR` | YES | SET | Volume mount path |
| `STRIPE_*` | optional | MISSING | Honest 503 |
| FCM | optional | MISSING | configured:false |
| `ANTHROPIC_API_KEY` | optional | MISSING | missing_key |
| `SEED_BOOTSTRAP_TOKEN` | keep unset | MISSING | Correct |
| `ALLOW_DEMO_STAFF` | keep unset | MISSING | Correct — boot does not seed/reset demo staff |

---

## Runtime

| Item | Status |
|---|---|
| Start command | `sh scripts/start-prod.sh` (`prisma migrate deploy` then `node dist/main.js`) |
| Last SUCCESS deploy | `243538f` · `2d4442ca` · 2026-10-03 |
| Domain | `https://zeengobackend-production-d058.up.railway.app` |
| Volume | `zeengo-documents` 500MB sfo → `/data/documents` |
| Postgres / Redis | present, ready operational |

---

## Frontends

| App | Host | Production API |
|---|---|---|
| Admin | `https://zeengo-admin.vercel.app` | Railway d058 (JS has no localhost:3000) |
| Website | `https://zeengo-website.vercel.app` | Railway d058 (JS has no localhost:3000) |

SPA fallback: website `vercel.json` rewrites; admin `vercel.json` + `netlify.toml` + `public/_redirects`.
