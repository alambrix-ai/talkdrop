# Talkdrop

Safe, beautiful, interest-first 1:1 video chat. Adults (18+) match by interests, mood, and language — with blur-first starts, AI icebreakers, and a visible safety stack.

This monorepo implements SPEC §15 **Phases 0–7** from `docs/SPEC.md`, plus production adapters for LiveKit, SMS, captions, and co-activities. Product name is **Talkdrop**.

## Stack (LOCKED)

- **Web:** React 18 + Vite + TypeScript + Tailwind (Ink wash tokens)
- **API / worker:** Node 20 + Fastify + Socket.IO + BullMQ-style jobs + Prisma
- **Data:** PostgreSQL 16, Redis 7
- **Media:** LiveKit SFU (real by default via Compose; `LIVEKIT_MOCK=true` for offline)
- **Storage:** S3-compatible MinIO for encrypted evidence only (24h expiry)

## Repo layout

```
apps/web          React SPA
apps/api          Fastify REST + Socket.IO (`/rt`)
apps/worker       Matcher + mod tap + evidence/trust jobs
packages/shared   Zod schemas, socket contracts, matcher/trust math
packages/ui       Design tokens + components
infra/            docker-compose, livekit.yaml, helm, load
docs/             SPEC, FRONTEND, BACKEND, AGE_VERIFICATION, brand
```

## Quick start

### 1. Infra (includes real LiveKit)

```bash
pnpm dev:infra
# docker compose -f infra/docker-compose.yml up -d
```

Postgres, Redis, MinIO, **LiveKit** (`:7880`, keys `devkey`/`secret`), Mailhog.

### Web Docker image (static SPA + brand portraits)

Landing/match portraits live under `apps/web/public/brand/portraits/` and must be copied into the nginx image. Build and run:

```bash
pnpm docker:web:build   # or: docker compose -f infra/docker-compose.yml -f infra/docker-compose.app.yml build web
pnpm docker:web:up      # serves http://localhost:8080
```

Verify files are in the image and served:

```bash
# JPEG magic bytes from inside the container
docker compose -f infra/docker-compose.yml -f infra/docker-compose.app.yml run --rm --no-deps web \
  wget -q -O - http://127.0.0.1/brand/portraits/mei.jpg | head -c 3 | od -An -tx1
# expect: ff d8 ff

curl -fsSI http://localhost:8080/brand/portraits/mei.jpg
curl -fsSI http://localhost:8080/brand/portraits/tomas.jpg
# After a local Vite build (no Docker): pnpm --filter @talkdrop/web build && pnpm verify:web-brand
```

### 2. Env

```bash
cp .env.example .env
# Defaults: LIVEKIT_MOCK=false, SMS_PROVIDER=mock, BILLING_PROVIDER=mock (deferred)
```

### 3. Install, migrate, seed

```bash
pnpm install
pnpm --filter @talkdrop/shared build
pnpm --filter @talkdrop/ui build
pnpm db:generate && pnpm db:migrate && pnpm db:seed
```

### 4. Run

```bash
pnpm dev
```

- Web http://localhost:5173 · API http://localhost:4000/health · Socket `/rt`

### Demo accounts

**Primary auth:** Sign in with Google (`GET /api/v1/auth/google`). Locally without Google Cloud credentials, use **Dev: mock Google** on `/verify` or `POST /api/v1/auth/google/mock` (`GOOGLE_OAUTH_MOCK=true`).

**Secondary:** email + password (seed password `TalkdropDev1!`).

| Person   | Email            | Notes                        |
|----------|------------------|------------------------------|
| Arjun K. | arjun@gmail.com  | Gold trust, tenant admin     |
| Mei      | mei@gmail.com    | Connection + chat with Arjun |
| Priya S. | priya@gmail.com  | Tenant admin                 |

### Google OAuth setup

1. Create an OAuth 2.0 **Web** client in Google Cloud Console.
2. Set authorized redirect URI to **exactly** `{API_ORIGIN}/api/v1/auth/google/callback`  
   (local: `http://localhost:4000/api/v1/auth/google/callback`). No trailing slash on `API_ORIGIN`.
3. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in the API environment (required when `NODE_ENV=production`).
4. Set `WEB_ORIGIN` to the exact browser origin of the web app (scheme + host + port, no path) so the OAuth callback can redirect back and CORS/cookies work.
5. Verify: open `/verify` → **Continue with Google** should hit Google’s account picker (not bounce with `google_not_configured`). After consent you return to `/verify` and the 18+ Yes/No modal.  
   `GET /api/v1/auth/methods` should report `{ "google": true, ... }`.

Without Cloud credentials on a non-production API, enable `GOOGLE_OAUTH_MOCK=true` and use **Dev: mock Google** (or email under Other options). The real Google button will explain that OAuth is not configured instead of failing silently.

## Adapters (done vs needs keys)

| Capability | Local default | Needs API keys / infra |
|------------|---------------|------------------------|
| LiveKit SFU + room join | Compose LiveKit, `LIVEKIT_MOCK=false` | Prod LiveKit project |
| Hidden mod subscriber | Token + rtc-node/meta sampler | `@livekit/rtc-node` for real frames |
| Sign in with Google | `GOOGLE_OAUTH_MOCK=true` (dev/CI) | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` |
| SMS (optional / unused for auth) | `SMS_PROVIDER=mock` | `twilio` / `messagebird` + keys |
| Age gate (18+) | Yes/No self-attestation | — (see `docs/AGE_VERIFICATION.md`) |
| Captions STT | `STT_PROVIDER=local` streaming | `deepgram` / `whisper` keys |
| Translation | `MT_PROVIDER=mymemory` or `identity` | LibreTranslate URL |
| Co-draw / co-watch | Socket canvas + player | — |
| Match filters (country / gender / language) | Plus-gated prefs; profile gender/country for all | Upgrade to Plus (mock OK in dev) |
| **Plus billing** | **Mock only (deferred)** | Stripe/Razorpay **not** wired |

## Scripts

| Script | Purpose |
|--------|---------|
| `pnpm lint` / `typecheck` / `test` | Quality gates |
| `pnpm --filter @talkdrop/web test:e2e` | Playwright §16 (API on `:4000`; LiveKit optional) |
| `pnpm build` | Build all |
| `pnpm docker:web:build` / `docker:web:up` | nginx image with `/brand/portraits/*` |
| `pnpm verify:web-brand` | Assert Vite dist includes brand portraits |

## Safety

- Raw A/V never stored; evidence encrypted, TTL 24h.
- Server moderation tap always runs; `MOD_FORCE_FLAG=1` for chaos cuts.
- CSAM path stubbed pending legal + T&S.

## Security

Hardening summary: [`docs/SECURITY_AUDIT.md`](docs/SECURITY_AUDIT.md). Checklist: [`docs/SECURITY_REVIEW.md`](docs/SECURITY_REVIEW.md).

**Defaults (do not ship placeholders to production):**

- Generate `JWT_*`, `TRUST_TOKEN_SECRET`, `FIELD_ENCRYPTION_KEY` (`openssl rand -base64 48` / `32`), and `INTERNAL_WEBHOOK_SECRET`.
- Production boot **rejects** `change-me` / known-weak secrets and requires the webhook secret.
- Refresh cookie: `httpOnly`, `Secure` + `SameSite=Strict` in production; access JWT stays **in memory** (not `localStorage`).
- Webhooks (`/internal/livekit/webhook`, `/api/v1/billing/webhook`) require header `X-Talkdrop-Webhook-Secret`.
- CORS in production allows only `WEB_ORIGIN`.
- Phones (legacy / age fallback): SHA-256 lookup hash + AES-GCM at rest; mock SMS never logs clear phone.
- End users: **Sign in with Google** is the primary path (OIDC ID token verified via Google JWKS); email+password (argon2id) is under Other options. Phone OTP sign-in retired (`410`).

**Residual — media is not classic E2EE:** LiveKit is an SFU with a trusted server moderation tap. The SFU operator and Talkdrop can observe media frames. Do not market this as end-to-end encryption.

**Billing** stays mock (`BILLING_PROVIDER=mock`); webhook auth still required so plan flips are not world-writable.

## Docs

- [`docs/SPEC.md`](docs/SPEC.md) · [`docs/AGE_VERIFICATION.md`](docs/AGE_VERIFICATION.md) · [`docs/SECURITY_AUDIT.md`](docs/SECURITY_AUDIT.md) · [`CHANGELOG.md`](CHANGELOG.md)
