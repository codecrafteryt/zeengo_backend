# ZEENGO — Production Issues

Updated 2026-10-03 after Railway `243538f` / Vercel frontends.

An issue is removed only after code/config → deployed → tested.

---

## P0 — BLOCKER

| ID | Issue | Evidence | Action |
|---|---|---|---|
| P0-5 | Historical demo staff accounts still accept the old shared password on production. New boots do **not** reset hashes (`Demo staff bootstrap skipped`). | Staff login against Railway succeeded with the historical demo account type | Operator must rotate every demo-named staff password in the live DB. Do not set `ALLOW_DEMO_STAFF`. |

Closed this pass (were P0): Railway behind `12e8d93`; no volume; unsigned Stripe webhook; missing `dist/main.js`; CORS reflected `*`.

---

## P1 — CRITICAL (accepted or optional)

| ID | Issue | Evidence | Action |
|---|---|---|---|
| P1-2 | Stripe / FCM / AI unset | ready `missing_key` | Leave unset. Honest 503 / configured:false |
| P1-3 | ~~Client logout did not revoke refresh JWT~~ | After `243538f`, refresh after logout is 401 | **Closed** |
| P1-4 | ~~Staff JWT ignored isActive until TTL~~ | JwtStrategy now Redis-caches isActive (45s); user update deletes cache | **Closed** |

---

## P2 — IMPORTANT

| ID | Issue | Evidence | Action |
|---|---|---|---|
| P2-1 | S3 unset; local volume in use | ready `storage: local`; volume mounted `/data/documents` | Accept for this release |
| P2-5 | OTP/SMS never sent | register/forgot cannot SMS | Production login is ZN+phone |
| P2-6 | Socket.IO not event-proven from the live SPAs this pass | Origins now allowlisted | Connect from admin/website once and watch a booking event |
| P2-7 | Lighthouse scores not recorded | CLI hung | Re-run Lighthouse on `zeengo-website.vercel.app` |

---

## Security decisions (not silent)

1. **Client refresh-token logout:** immediate revocation **is required**. Implemented: logout writes `refresh:revoked:{hash}` in Redis for the refresh TTL; refresh checks the denylist.
2. **Staff deactivation:** access JWTs **must** stop working without waiting 15m. Implemented: JwtStrategy reads `staff:active:{id}` (45s Redis cache) and loads Prisma on miss. `users.update` deletes the cache when `isActive` changes.

---

## Intentionally not done

- No Excel import, no production seed, no `prisma db push`
- Stripe/FCM/AI left unconfigured
- No password rotation of live staff (operator-owned)
