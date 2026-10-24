# Talkdrop

Safe, beautiful, interest-first 1:1 video chat. Adults (18+) match by interests, mood, and language — with blur-first starts, AI icebreakers, and a visible safety stack.

This monorepo implements SPEC §15 **Phases 0–7** (MVP + v1) from `docs/SPEC.md`. Product name is **Talkdrop** (specs originally said Meetglow).

## Stack (LOCKED)

- **Web:** React 18 + Vite + TypeScript + Tailwind (Ink wash tokens)
- **API / worker:** Node 20 + Fastify + Socket.IO + BullMQ-style jobs + Prisma
- **Data:** PostgreSQL 16, Redis 7
- **Media:** LiveKit SFU (mockable in dev)
- **Storage:** S3-compatible MinIO for encrypted evidence only (24h expiry)

## Repo layout

```
apps/web          React SPA
apps/api          Fastify REST + Socket.IO (`/rt`)
apps/worker       Matcher + evidence expiry + trust/streak jobs
packages/shared   Zod schemas, socket contracts, matcher/trust math
packages/ui       Design tokens + components
infra/            docker-compose, livekit.yaml
docs/             SPEC, FRONTEND, BACKEND, brand assets
```

## Quick start

### 1. Infra

```bash
# Preferred: Docker Compose
pnpm dev:infra
# or: docker compose -f infra/docker-compose.yml up -d
```

Without Docker, run local PostgreSQL 16 + Redis 7 and create DB `talkdrop` / user `talkdrop` with extensions `pgcrypto`, `citext`, `pg_trgm`.

### 2. Env

```bash
cp .env.example .env
# Defaults work for local mock LiveKit + mock S3
```

### 3. Install, migrate, seed

```bash
pnpm install
pnpm --filter @talkdrop/shared build
pnpm --filter @talkdrop/ui build
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

### 4. Run (full stack)

```bash
pnpm dev
```

- Web: http://localhost:5173  
- API: http://localhost:4000/health · REST `/api/v1` · Socket `/rt`  
- Matcher: runs in-process in the API (and also in `apps/worker`) every 300ms  

Open two browsers (or a private window), sign in as Arjun and Mei, finish onboarding if needed, tap **Start meeting** in both — you should get a match within a second.  

### Demo accounts (after seed)

OTP codes are printed by the mock SMS provider (and returned as `devCode` outside production).

| Person   | Phone           | Notes                          |
|----------|-----------------|--------------------------------|
| Arjun K. | +919876543210   | Gold trust, tenant owner/admin |
| Mei      | +819012345678   | Connection + chat with Arjun   |
| Priya S. | +919811122233   | Tenant admin                   |

## Phase checklist (SPEC §15)

| Phase | Status |
|-------|--------|
| 0 Foundation | Done |
| 1 Identity & onboarding | Done |
| 2 Matching & calls | Done (LiveKit mockable) |
| 3 Safety v1 | Done |
| 4 Social | Done |
| 5 Admin console | Done (+ CSV export) |
| 6 Hardening | Done (server mod tap, Playwright E2E, metrics, a11y, legal, i18n, Helm/TF, load/chaos smoke, security checklist) |
| 7 v1 features | Done with mocks (captions/MT, activities+co-draw/co-watch stubs, rooms, avatar, effects, Plus filters/billing) |

Blocked / mock-only until real vendors: LiveKit hidden subscriber (real SFU), STT/MT, Stripe/Razorpay signatures, full 5k-socket load, CSAM counsel path. See CHANGELOG mocks table.

## Scripts

| Script            | Purpose                |
|-------------------|------------------------|
| `pnpm lint`       | ESLint all packages    |
| `pnpm typecheck`  | `tsc --noEmit`         |
| `pnpm test`       | Vitest unit tests      |
| `pnpm --filter @talkdrop/web test:e2e` | Playwright SPEC §16 (API must be on :4000) |
| `pnpm build`      | Build all packages/apps|

## Safety notes

- Raw video/audio are **never** stored. Evidence is encrypted, TTL 24h.
- Worker runs a **server-side moderation tap** (mock samples when `LIVEKIT_MOCK=true`).
- CSAM/underage path is stubbed (`handleCsamSuspicion`) pending legal + T&S.

## Brand

Ink wash palette: charcoal `#4A4A4A`, cream `#FFFFE3`, slate `#6D8196`, grey `#CBCBCB`. Logos live in `docs/brand/` and `apps/web/public/brand/`.

## Docs

- [`docs/SPEC.md`](docs/SPEC.md) — source of truth  
- [`docs/FRONTEND.md`](docs/FRONTEND.md) · [`docs/BACKEND.md`](docs/BACKEND.md)  
- [`CHANGELOG.md`](CHANGELOG.md)
