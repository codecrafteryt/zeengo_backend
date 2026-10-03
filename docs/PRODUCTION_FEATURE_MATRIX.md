# ZEENGO — Production Feature Matrix

Verified 2026-10-03 against deployed Railway + Vercel.

**Backend:** `243538f` on Railway `2d4442ca` · `https://zeengobackend-production-d058.up.railway.app`  
**Admin:** `https://zeengo-admin.vercel.app` · no `localhost:3000` in JS · Railway API present  
**Website:** `https://zeengo-website.vercel.app` · no `localhost:3000` in JS · Fraunces + IBM Plex + `#12372A`

Status is only one of: **VERIFIED (deployed)** · **PARTIAL** · **BLOCKED** · **OPTIONAL — NOT CONFIGURED** · **NOT IMPLEMENTED**.

| Feature | Scope | Deployed? | UI works | API works | Auth/permissions | Error states | Mobile | Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Health live | Required | Yes | n/a | 200 | Public | n/a | n/a | `GET /system/health/live` | **VERIFIED (deployed)** |
| Health ready (Postgres+Redis+schema) | Required | Yes | n/a | 200 | Public; Stripe/FCM/AI missing_key does not fail | n/a | n/a | ready checks operational; storage local | **VERIFIED (deployed)** |
| Public catalog / home | Required | Yes | Yes | Yes | Public | Yes | Yes | Website Around: 767 hotels, 164 activities, live FX | **VERIFIED (deployed)** |
| Offering detail | Required | Yes | Yes | Yes | Public | Price on request | Yes | `/hotels/25865df8-…` Adagio + Add to trip | **VERIFIED (deployed)** |
| Customer request → ZN pending | Required | Yes | Yes | Yes | Public create | 4xx on bad body | Yes | Labeled TEST A `ZN0488` pending then confirmed | **VERIFIED (deployed)** |
| ZN + phone login | Required | Yes | Yes | Yes | Phone bind | Wrong ZN/phone 401 | Yes | Website `/login` → `/trip` for TEST A | **VERIFIED (deployed)** |
| My Trip | Required | Yes | Yes | Yes | Own booking only | Empty itinerary copy | Yes | ZN0488 dates, 2 travellers, hotel night, ₽0 due, voucher | **VERIFIED (deployed)** |
| Customer isolation / IDOR | Required | Yes | n/a | Yes | A 403 on B booking/doc | 401 anon | n/a | API: A/B 403, anon 401, unassigned driver 403 | **VERIFIED (deployed)** |
| OPS confirm request | Required | Yes | Admin request review | Yes | Staff write roles | 404 unknown id | n/a | TEST A confirmed; customer saw confirmed | **VERIFIED (deployed)** |
| Documents upload/list/download | Required | Yes | My Trip View | Yes | Staff write; client own | exe 400 | Yes | voucher 32 B after redeploy | **VERIFIED (deployed)** |
| Durable storage | Required | Yes | n/a | Yes | Authorized download | n/a | n/a | Volume `/data/documents`; file survived `243538f` deploy | **VERIFIED (deployed)** |
| Audit logs | Required | Yes | Admin `/audit-logs` SPA | Yes | admin/ops; support 403 | 401 anon | n/a | API 200; history n=4 | **VERIFIED (deployed)** |
| Staff login / wrong password / refresh | Required | Yes | Admin login | Yes | JWT | 401 wrong password | Yes | 201 / 401 / refresh 201 | **VERIFIED (deployed)** |
| Support RBAC | Required | Yes | Hidden nav | Yes | 403 dashboard/payments/audit | 403 | n/a | support token 403 | **VERIFIED (deployed)** |
| Driver login + unassigned 403 | Required | Yes | Driver home | Yes | Assignment IDOR | 403 | n/a | driver 201; doc 403 | **VERIFIED (deployed)** |
| Payments history / collected / paid_at | Required | Yes | Finance pages | Yes | Support denied | 200 empty ok | n/a | `/payments/history` 200 | **VERIFIED (deployed)** |
| In-app notifications | Required | Yes | Admin list | Yes | Auth | 200 | n/a | `/notifications` 200 | **VERIFIED (deployed)** |
| Client refresh revocation | Required | Yes | Sign out | Yes | Logout denylist | 401 after logout | n/a | refresh 201 then logout 201 then 401 | **VERIFIED (deployed)** |
| Staff isActive on access JWT | Required | Yes | n/a | Yes | Redis cache 45s | 401 inactive | n/a | Deployed `jwt.strategy.ts`; deactivate clears cache | **VERIFIED (deployed)** |
| CORS allowlist | Required | Yes | Browser OK | Yes | Website+admin only | evil Origin none | n/a | After `243538f`: evil.example → none | **VERIFIED (deployed)** |
| Stripe links / webhook | Optional | No keys | Config-aware | 503 unsigned | n/a | Honest missing | n/a | `STRIPE_WEBHOOK_NOT_CONFIGURED` | **OPTIONAL — NOT CONFIGURED** |
| FCM / push | Optional | No keys | Honest | missing_key | n/a | n/a | n/a | ready `fcm: missing_key` | **OPTIONAL — NOT CONFIGURED** |
| Anthropic AI | Optional | No keys | Admin pages exist | missing_key | admin/ops | n/a | n/a | ready `claude: missing_key` | **OPTIONAL — NOT CONFIGURED** |
| OTP / SMS | Out of scope | No sender | n/a | Not sent | n/a | n/a | n/a | ZN+phone is the login path | **NOT IMPLEMENTED** |
| Kitchen Excel import | Not this release | No | Admin dry-run | Yes local | admin/ops | n/a | n/a | Not run on production | **OPTIONAL — NOT CONFIGURED** |
| Socket.IO from deployed SPAs | Required | Yes code | Connect path exists | `/ws` | JWT | n/a | n/a | CORS origins include both Vercel hosts; no live event captured this pass | **PARTIAL** |
| Lighthouse scores | Required doc | Site live | n/a | n/a | n/a | n/a | n/a | CLI hung; scores not recorded | **PARTIAL** |
| Historical demo staff password | Security | Yes accounts | Login works | Yes | Old shared hash | n/a | n/a | Production still accepts historical demo staff login | **BLOCKED** |
