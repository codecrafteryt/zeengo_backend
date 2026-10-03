# ZEENGO — Production Feature Matrix

Verified 2026-10-03. This is not a code-existence checklist.

**Local API:** `devel` (health includes `schema` + `storage`) — live/ready **200**, `LIVE_E2E` **12/12**.  
**Railway production:** `zeengo_backend` last SUCCESS **12e8d93** (2026-09-30). `/system/health` **200**. `/system/health/live`, `/ready`, `/audit-logs`, `/client/documents` **404**.  
**Admin / website:** local `devel` ahead of origin. Netlify/customer hosts were not redeployed in this pass.

Column **Production Tested** means the *deployed Railway* environment unless marked Local.

| Feature | UI | API | DB | Auth | Permissions | Validation | Error Handling | Production Tested | Status |
| ------- | -- | --- | -- | ---- | ----------- | ---------- | -------------- | ----------------- | ------ |
| Staff login / refresh / logout | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Local YES · Railway health only | PARTIAL |
| Staff token expiry / invalid | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Local YES | VERIFIED |
| Customer ZN + phone login | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Local YES | PARTIAL |
| Customer session refresh | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Local YES | PARTIAL |
| Customer logout (client refresh JWT not revoked) | PASS | PARTIAL | PASS | PARTIAL | PASS | PASS | PASS | Local YES | PARTIAL |
| Driver login | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Local YES | PARTIAL |
| Driver booking IDOR | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Local YES (IDOR matrix) | PARTIAL |
| Support 403 vs dashboard/finance/users/audit | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Local YES | PARTIAL |
| Unauthenticated protected API | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Railway bookings **401** | VERIFIED |
| Customer request → ZN → pending | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Local YES | PARTIAL |
| OPS confirm request | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Local YES | PARTIAL |
| My Trip after confirm | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Local YES | PARTIAL |
| Customer A cannot read B booking/docs | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Local YES | PARTIAL |
| Documents upload/list/download/delete | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Railway **404** | BLOCKED |
| Document durable storage | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Railway: no volume, `STORAGE_*` unset | BLOCKED |
| Public catalog home | PASS | PASS | PASS | Public | PASS | PASS | PASS | Railway `/client/v2/home` **200** | PARTIAL |
| Hotels / rooms / activities browse | PASS | PASS | PASS | Public | PASS | PASS | PASS | Local YES · Railway incomplete vs local | PARTIAL |
| Admin catalog edit | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Local YES | PARTIAL |
| Dashboard Collected (all-time paid) | PASS | PASS | PASS | PASS | Support denied | PASS | PASS | Local YES | PARTIAL |
| Payments list / cash / paid_at | PASS | PASS | PASS | PASS | Support denied | PASS | PASS | Local YES | PARTIAL |
| Stripe payment links | PASS | PASS | PASS | PASS | PASS | PASS | 503 when unset | Railway `stripe: missing_key` | BLOCKED |
| Stripe webhook (unsigned rejected in prod) | n/a | FIXED | PASS | PASS | PASS | PASS | PASS | Not on Railway yet | FIXED |
| FCM / push | PASS | PASS | PASS | PASS | PASS | PASS | `configured:false` | Railway `fcm: missing_key` | BLOCKED |
| In-app notifications | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Local only | PARTIAL |
| Socket.IO `/ws` | PASS | PASS | n/a | PASS | PASS | PASS | PASS | Local only | PARTIAL |
| Audit logs API + admin page | PASS | PASS | PASS | PASS | admin/ops only | PASS | PASS | Railway **404** | PARTIAL |
| Booking history | PASS | PASS | PASS | PASS | PASS | PASS | PASS | Local YES | PARTIAL |
| Health live | n/a | PASS | n/a | Public | n/a | n/a | PASS | Railway **404** | PARTIAL |
| Health ready (Postgres+Redis+schema) | n/a | PASS | PASS | Public | n/a | n/a | 503 if down | Railway **404** | PARTIAL |
| Combined health | n/a | PASS | PASS | Public | n/a | n/a | PASS | Railway **200** | VERIFIED |
| Demo staff boot password reset | n/a | FIXED | PASS | PASS | n/a | n/a | n/a | Not deployed | FIXED |
| OTP / SMS | MISSING | MISSING | PARTIAL | n/a | n/a | PARTIAL | n/a | No | NOT IMPLEMENTED |
| AI / Anthropic | PASS | PASS | n/a | PASS | admin/ops | PASS | missing_key | Railway `claude: missing_key` | BLOCKED |
| Kitchen / Excel import | PASS | PASS | PASS | PASS | admin/ops | PASS | PASS | Dry-run only · not committed | BLOCKED |
| Customer OTP-less ZN-only login | n/a | Off unless env | PASS | Weak if on | n/a | PASS | PASS | `ALLOW_ZN_ONLY_LOGIN` default false | VERIFIED |
| Netlify SPA nested routes | Unknown | n/a | n/a | n/a | n/a | n/a | n/a | No `_redirects` in repo | PARTIAL |
| CORS / APP_WEB_ORIGIN | n/a | PASS | n/a | n/a | n/a | PASS | PASS | Railway SET (value not printed) | PARTIAL |

## How to read Status

- **VERIFIED** — real workflow tested successfully in the environment named.
- **FIXED** — found this session, corrected in local `devel`, unit-tested; **not on Railway**.
- **PARTIAL** — works on local `devel`, missing or older on Railway, or optional infra unset.
- **BLOCKED** — cannot be called production-ready until infra/config/deploy exists.
- **NOT IMPLEMENTED** — no production path (OTP SMS is not sent).
