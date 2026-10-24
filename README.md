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

OTP via mock SMS (`devCode` outside production).

| Person   | Phone           | Notes                        |
|----------|-----------------|------------------------------|
| Arjun K. | +919876543210   | Gold trust, tenant admin     |
| Mei      | +819012345678   | Connection + chat with Arjun |
| Priya S. | +919811122233   | Tenant admin                 |

## Adapters (done vs needs keys)

| Capability | Local default | Needs API keys / infra |
|------------|---------------|------------------------|
| LiveKit SFU + room join | Compose LiveKit, `LIVEKIT_MOCK=false` | Prod LiveKit project |
| Hidden mod subscriber | Token + rtc-node/meta sampler | `@livekit/rtc-node` for real frames |
| SMS OTP | `SMS_PROVIDER=mock` | `twilio` / `messagebird` + keys |
| Age verification | On-device thresholds | `AGE_DOCUMENT_REDIRECT_URL` vendor |
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
- Phones: SHA-256 lookup hash + AES-GCM at rest; OTP codes hashed; mock SMS never logs OTP/clear phone.
- End users: phone OTP (sha256). Admin passwords (if added): argon2id via `apps/api/src/lib/passwords.ts`.

**Residual — media is not classic E2EE:** LiveKit is an SFU with a trusted server moderation tap. The SFU operator and Talkdrop can observe media frames. Do not market this as end-to-end encryption.

**Billing** stays mock (`BILLING_PROVIDER=mock`); webhook auth still required so plan flips are not world-writable.

## Docs

- [`docs/SPEC.md`](docs/SPEC.md) · [`docs/AGE_VERIFICATION.md`](docs/AGE_VERIFICATION.md) · [`docs/SECURITY_AUDIT.md`](docs/SECURITY_AUDIT.md) · [`CHANGELOG.md`](CHANGELOG.md)
