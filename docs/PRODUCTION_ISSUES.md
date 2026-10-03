# ZEENGO — Production Issues

Verified 2026-10-03. Only issues with evidence.

---

## P0 — BLOCKER

| ID | Issue | Evidence | Action |
|---|---|---|---|
| P0-1 | Railway backend is **12e8d93** (2026-09-30). Local `devel` has documents, audit, live/ready, ZN+phone bind, catalog browse that production does not fully serve. | Deploy list + HTTP: `/client/documents` 404, `/audit-logs` 404, `/health/live` 404, `/health/ready` 404 | Operator must approve push + Railway deploy of `devel` **after** the Nest `dist/main.js` fix |
| P0-2 | Document files are **not durable** on Railway. No volume on `zeengo_backend`. `STORAGE_*` unset. Default is local disk. | `describe-service`: no mounts; variables do not include `STORAGE_PROVIDER` / `STORAGE_LOCAL_DIR` | Mount a volume **or** configure S3 **before** advertising documents |
| P0-3 | **Was:** demo staff passwords reset to `1234567` on every boot. | `ensure-demo-staff.ts` upsert `update.passwordHash` + `DemoStaffBootstrap.onModuleInit` | **FIXED locally:** production skips bootstrap unless `ALLOW_DEMO_STAFF=true`; existing hashes are not overwritten |
| P0-4 | **Was:** Stripe webhook accepted unsigned JSON when `STRIPE_WEBHOOK_SECRET` empty and `x-zeengo-dev-webhook: 1`. | `webhooks.service.ts` | **FIXED locally:** production always rejects unsigned webhooks (`STRIPE_WEBHOOK_NOT_CONFIGURED`) |

---

## P1 — CRITICAL

| ID | Issue | Evidence | Action |
|---|---|---|---|
| P1-1 | Uncommitted `tsconfig.build.json` (`rootDir: ./src`). Docker `test -f dist/main.js` fails if `devel` is deployed without it. | Local nest build previously emitted `dist/src/main.js` | Commit this file before push. Do not commit `tsconfig.build.tsbuildinfo` |
| P1-2 | Stripe / FCM / AI not configured on Railway. | Health: `missing_key` | Leave unset (honest 503 / configured:false) or add real keys. Do not fake success |
| P1-3 | Client logout does not revoke client refresh JWTs (staff refresh is Redis-deleted). | `auth.service.ts` | Accept as 30d TTL or add a client denylist later — not changed this pass |
| P1-4 | Staff JWT is not re-checked for `isActive` on every request. | `jwt.strategy.ts` | Refresh path re-checks; access TTL is 15m |
| P1-5 | Website organic UI + hardening tests are uncommitted. | `Website_frontend` dirty tree | Commit only if that UI is part of the release |

---

## P2 — IMPORTANT

| ID | Issue | Evidence | Action |
|---|---|---|---|
| P2-1 | S3 misconfig silently falls back to local disk. | `storage.service.ts` | Health reports `storage: local`. Operator must read it |
| P2-2 | Stripe `sent` row can be created before a 503 if prod key is invalid. | `payments.service.ts` | Not “paid”. Clean orphans in ops if it happens |
| P2-3 | No `_redirects` / `netlify.toml` in repo. Nested admin routes may 404 on a raw Netlify static host. | glob found none | Confirm Netlify “SPA fallback” in the host UI |
| P2-4 | Kitchen JSON dry-run would create 193 + update 59. | Prior gate | Do **not** commit that import |
| P2-5 | OTP/SMS is never sent. Register/forgot-password cannot work as SMS. | `auth.service.ts` `sendOtp` | Production login path is ZN+phone, not OTP |

---

## P3 — POLISH

| ID | Issue | Notes |
|---|---|---|
| P3-1 | Website visual pass is local-only | Not a production blocker |
| P3-2 | Hardcoded bootstrap token exists for **non-production** seed | Production `POST /system/seed-demo` is 403 unless `SEED_BOOTSTRAP_TOKEN` is set (unset on Railway) |

---

## Intentionally not “fixed”

- Did not rewrite booking, catalog, or admin UI.
- Did not deploy, push, migrate Railway, or import Excel.
- Did not reset or seed the production database.
- Did not add fake Stripe/FCM success.
