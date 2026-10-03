# ZEENGO — Production Release Scope

Date: 2026-10-03  
Decision log for what ships from local `devel` to Railway / admin / website hosts.

---

## What will be released

### Backend (`codecrafteryt/zeengo_backend` · branch `devel`)

Unpushed commits (keep):

1. `2ec3b34` — ZN login requires phone; session bound to one booking  
2. `5de1764` — public catalog fields, rooms, vehicles, trains  
3. `1531c57` — public catalog browse + structured booking requests  
4. `20bbc06` — vendor catalog editor + customer request summary  
5. `09708d0` — documents, audit-logs, health live/ready, paid_at index  

Plus new local commits (required before push):

- `tsconfig.build.json` so `nest build` emits `dist/main.js`  
- Demo-staff production bootstrap protection  
- Stripe unsigned-webhook protection in production  

### Admin (`muhammadzayanali/Zeengo_admin` · `devel`)

Unpushed: ZN phone on client portal, request panel, documents + audit UI.  
Also: RBAC unit tests (vitest). No visual rewrite of working ops screens beyond token consistency.

### Website (`muhammadzayanali/zeengo_website` · `devel`)

Unpushed: ZN phone login, booking flow, My Trip documents.  
Plus the organic design pass after research (website only; brand colors and IA stay).

### Infrastructure

- Railway volume on `zeengo_backend` at `/data/documents`  
- `STORAGE_PROVIDER=local`, `STORAGE_LOCAL_DIR=/data/documents`  
- Migrations via existing `scripts/start-prod.sh`

---

## What will not be released / not configured

| Item | Why |
|---|---|
| `tsconfig.build.tsbuildinfo` | generated |
| Kitchen Excel commit / 193 creates | not approved |
| Stripe / FCM / Anthropic keys | optional, not faked |
| OTP/SMS | not implemented; ZN+phone is the login |
| `SEED_BOOTSTRAP_TOKEN` / `ALLOW_DEMO_STAFF` | stay unset |
| Production seed | never |
| Force-push / history rewrite | never |

---

## REQUIRED FOR THIS CLIENT RELEASE

- Staff login / RBAC (Admin, Ops, Support, Driver, Splizer)  
- Customer catalog browse + request → ZN → pending  
- ZN + phone login, booking-bound session  
- OPS see request, confirm, booking hub  
- My Trip: status, services, hotel, activities, customer-visible documents  
- Document upload/list/download/delete with durable storage + IDOR  
- Audit log of key mutations  
- Health live + ready  
- Payments history / collected / cash as already defined (Stripe link optional)  
- In-app notifications if already wired; Socket.IO must not crash the apps  
- Production frontends talking only to Railway (no localhost in prod build)

## OPTIONAL / NOT CONFIGURED

- Stripe payment links + signed webhooks  
- FCM push  
- Anthropic AI  
- OTP/SMS  
- Kitchen Excel production import  

These must stay configuration-aware. They are not release blockers unless the client later requires them.
