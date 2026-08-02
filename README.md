# Zeengo Backend

NestJS REST + WebSocket API for Zeengo luxury travel operations (Russia focus). PostgreSQL, Redis, Prisma, JWT auth, Stripe payments, and AI-assisted ops tools.

## Stack

- **NestJS** + TypeScript
- **PostgreSQL 16** + **Prisma**
- **Redis** (cache, refresh tokens, pub/sub)
- **Stripe** payment links
- **Anthropic Claude** (optional — heuristic stubs when `ANTHROPIC_API_KEY` is unset)

## Local setup

```bash
cp .env.example .env
docker compose up -d   # Postgres :5432 + Redis :6379
npm install
npm run db:setup       # migrate + seed
npm run start:dev
```

If Docker is unavailable, run Redis (`redis-server`) and Homebrew `postgresql@16` (this machine uses port **5433**), then set `DATABASE_URL` accordingly before `npm run db:setup`.

| Resource | URL |
|---|---|
| API base | `http://localhost:3000/api/v1` |
| Health | `GET /api/v1/system/health` |
| OpenAPI | `http://localhost:3000/api/docs` |
| WebSocket | `ws://localhost:3000/ws` |

Default seed admin: `admin@zeengo.com` / `Admin123!`

Team plan: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md)


## Scripts

```bash
npm run start:dev    # watch mode
npm run build        # compile
npm run test         # unit tests
npm run test:e2e     # e2e (health + auth validation)
npm run lint         # ESLint
```

## Project layout

Domain modules live under `src/` (`auth`, `bookings`, `payments`, `dashboard`, `ai`, …). Shared kernels are in `src/common/` (guards, zod pipe, envelope, audit). See `docs/IMPLEMENTATION_PLAN.md` for the full architecture and phase plan.

## Environment

Copy `.env.example` and set at minimum:

- `DATABASE_URL`, `REDIS_URL`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`
- Optional: `STRIPE_SECRET_KEY`, `ANTHROPIC_API_KEY`

## License

UNLICENSED — private project.
