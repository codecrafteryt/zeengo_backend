# ZEENGO — Production Deployment Runbook

Operator-executed. This document does **not** deploy anything by itself.

Current verified local HEADs:

- Backend `devel` `09708d0` + uncommitted `tsconfig.build.json` fix  
- Admin `devel` `98a46b5`  
- Website `devel` `29a1d4a`  
- Railway backend **now:** `12e8d93`

---

## PHASE A — PRE-DEPLOY

1. Read `docs/RELEASE_READINESS.md` and approve this release in writing.  
2. Review diffs: `git log origin/devel..HEAD` in all three repos.  
3. Commit the Nest entrypoint fix if still uncommitted:

   ```
   cd backend/zeengo_backend
   git add tsconfig.build.json
   git commit -m "fix: emit Nest dist/main.js for production start"
   ```

   Do not add `tsconfig.build.tsbuildinfo`.  
4. Configure storage **before** traffic uses documents:

   - Railway volume mounted at `STORAGE_LOCAL_DIR`, or  
   - `STORAGE_PROVIDER=s3` + `STORAGE_BUCKET` + `STORAGE_ACCESS_KEY` + `STORAGE_SECRET_KEY` (+ region / endpoint).  

5. Confirm env on Railway (names only): `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `NODE_ENV=production`, `APP_WEB_ORIGIN` (live admin + website).  
6. Keep `SEED_BOOTSTRAP_TOKEN` **unset**.  
7. Snapshot / backup production Postgres.  
8. Confirm Railway start command is still `sh scripts/start-prod.sh` (migrate deploy, then Nest).  
9. Do **not** run Excel commit against production.

---

## PHASE B — GIT

1. `git status` — working trees clean except intended commit.  
2. Push **devel** with a normal push (no `--force`):

   ```
   git push -u origin devel
   ```

   Repeat in `backend/zeengo_backend`, `frontend`, `Website_frontend`.  
3. Merge to the production branch the operator already uses (`main` for backend + admin; website has no `origin/main` — use the existing Vercel/host branch).  
4. No force-push. No history rewrite.

---

## PHASE C — DATABASE

Performed by `scripts/start-prod.sh` on boot:

```
npx prisma migrate deploy
exec node dist/main.js
```

Pending after `12e8d93`:

1. `20261001090000_public_catalog`  
2. `20261003190000_payment_paid_at_index`  
3. `20261003200000_booking_documents`  

After the new deploy is healthy:

```
npx prisma migrate status
```

Must be up to date. Confirm columns/tables exist:

- `bookings.children_count`  
- `documents`  
- `payments.paid_at` index  
- `audit_logs.created_at` / `action` indexes  

Never `prisma db push` in production.

---

## PHASE D — BACKEND

1. Railway deploys the Dockerfile (`test -f dist/main.js` must pass).  
2. Check logs: migrate deploy succeeded, Nest listening.  
3. From outside the container:

   - `GET /api/v1/system/health/live` → 200  
   - `GET /api/v1/system/health/ready` → 200, postgres/redis/schema operational  
   - Stripe/FCM/claude may be `missing_key` — that must **not** fail ready.  

4. No Prisma `P2021` / `P2022` / unknown column.

---

## PHASE E — FRONTS

1. Deploy admin (`frontend`) production build pointed at the new API.  
2. Deploy website (`Website_frontend`) production build pointed at the same API.  
3. Confirm CORS origins include both production hosts.

---

## PHASE F — SMOKE TEST

Use a **new** test customer. Do not seed production demo data.

1. Health live + ready  
2. Staff login (admin + support)  
3. Support opens Clients, not Dashboard; `/dashboard/overview` is 403  
4. Website: catalog → request → booking + ZN + pending  
5. OPS confirms the same ZN  
6. Customer ZN + phone login → My Trip confirmed  
7. OPS uploads a customer-visible document  
8. Customer downloads it  
9. Other customer / anonymous download denied  
10. Cash payment still shows Dashboard **Collected** (all-time) vs Today vs Cash — do not rename  
11. Chat / notifications: in-app + socket; push only if FCM is configured  
12. `GET /payments/history` and `POST /auth/client/zn-login` are not 500  

---

## PHASE G — MONITOR (first 30–60 minutes)

Watch Railway logs for:

- Prisma schema errors  
- 500 / 502  
- Redis down  
- JWT failures  
- storage upload/download errors  
- Socket.IO handshake failures  

---

## PHASE H — ROLLBACK

1. Railway: redeploy previous successful commit (`12e8d93` if this is the first lift).  
2. Do not automatically drop `documents` or catalog columns. Additive schema can stay.  
3. If documents were written and you roll back API without the Document model, downloads will 404 — communicate that.  
4. Frontends: revert the production frontend deploy to the last known build.  
5. Re-run health + zn-login + payments/history.

---

## Explicitly forbidden in this runbook unless the operator says so

- `git push --force`  
- `prisma db push`  
- Production `seed-demo`  
- Production Excel **commit**  
- Inventing Stripe/FCM/AI credentials  
- Claiming push or AI is live without keys  
