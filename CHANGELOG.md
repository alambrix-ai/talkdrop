# Changelog

All notable changes to Talkdrop are documented in this file.

## 0.4.0 — 2026-10-25

### Auth: Sign in with Google (Gmail)
- Primary sign-in is **Continue with Google** (OAuth authorization code + ID token verification via `jose` / Google JWKS)
- Secondary path: email + password (argon2id) — signup `/auth/signup`, login `/auth/login`
- Phone SMS OTP sign-in retired (`POST /auth/otp/*` → `410`); age-verification phone fallback unchanged
- User model: `google_sub`, `password_hash`; seed accounts use Gmail + `TalkdropDev1!`
- Env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (required in production); `GOOGLE_OAUTH_MOCK` for local/CI mock login
- Billing unchanged (still deferred / mock)

## 0.3.2 — 2026-10-25

### Security hardening (Critical / High / Medium)
- Webhook shared secret (`INTERNAL_WEBHOOK_SECRET`) for LiveKit + billing webhooks
- Socket.IO participant checks on all session-scoped events; ban/suspend on handshake
- `authenticateAdmin` on admin routes; OTP `safeEqual`; phone hash + AES-GCM at rest
- Access JWT memory-only (no `localStorage`); refresh cookie Origin check + Strict/Secure in prod
- Helmet CSP, stricter rate limits, upload MIME allowlists, SMS/PII log redaction
- Privacy delete wipes OTPs/devices; production secret validation; argon2 helpers
- Docs: `docs/SECURITY_AUDIT.md`, README Security (SFU ≠ classic E2EE residual risk)
- Billing remains mock

## 0.3.1 — 2026-10-25

### Match filters (country / gender / language)
- Profile + onboarding collect **gender** and **country**; languages already collected
- Plus match filters UI: preferred countries, genders, languages (empty = any)
- Persisted on `user_profiles` (`filter_*` columns) + `PUT/GET /me/filters` (Plus-gated per SPEC)
- Matcher hard constraints enforce both sides’ filters on Redis tickets
- Unit tests for country/gender/language filter logic
- Billing unchanged (still mock)

## 0.3.0 — 2026-10-25

### Production adapters (billing deferred)
- **LiveKit SFU** — real `RoomServiceClient` + `AccessToken` when `LIVEKIT_MOCK=false` (default); Compose LiveKit is the local SFU; soft-fail if SFU down. Call UI joins via `livekit-client`.
- **Server mod tap** — hidden-subscriber token + `@livekit/rtc-node` frame sampler when installed; room-meta fallback; `MOD_FORCE_FLAG` retained for chaos.
- **SMS** — Twilio + MessageBird adapters; mock **only** when `SMS_PROVIDER=mock`.
- **Age** — `ondevice` default + document-check redirect stub (`AGE_DOCUMENT_REDIRECT_URL`); see `docs/AGE_VERIFICATION.md`.
- **Captions** — Deepgram / Whisper STT + LibreTranslate / MyMemory MT behind env; local streaming fallback still streams lines; audio upload + client-line sockets.
- **Co-draw / Co-watch** — shared canvas strokes + synced video player over sockets (no longer prompt stubs).
- **Effects** — client CSS filters + server redis hook on `effect:set`.
- **Billing** — **intentionally still mock** (`BILLING_PROVIDER=mock`); Stripe/Razorpay not expanded.
- **E2E** — Playwright critical path + LiveKit-aware call assertion when SFU reachable.

### Done vs needs API keys

| Capability | Ready locally | Needs keys / infra |
|------------|---------------|--------------------|
| LiveKit rooms + join | Compose `livekit` | Cloud LiveKit project for prod |
| Hidden mod tap frames | rtc-node optional; meta fallback | `@livekit/rtc-node` native for real frames |
| SMS OTP | `SMS_PROVIDER=mock` | Twilio or MessageBird keys |
| Age on-device | Yes | Document vendor URL |
| Captions stream | `STT_PROVIDER=local` | Deepgram / OpenAI Whisper |
| Translation | MyMemory / identity | LibreTranslate URL or paid MT |
| Co-draw / co-watch | Yes | — |
| Plus billing | Mock checkout only | **Deferred** — no Stripe/Razorpay |

## 0.2.0 — 2026-10-25

### Phase 6 — Hardening and launch prep
- **Server-side LiveKit moderation tap** in `apps/worker` (mock hidden-subscriber loop samples live sessions; flags publish `talkdrop:cut`)
- **Playwright critical-path E2E** (`apps/web/e2e/critical-path.spec.ts`) covering SPEC §16 flows
- **Observability:** `/metrics` Prometheus text, `/health/ready`, HTTP + match/cut counters, OTEL endpoint scaffold
- **a11y:** skip links, focus-visible, aria-live toasts/captions/lobby status, labelled call controls, dialog labels
- **Legal pages** expanded copy for rules, privacy, transparency, 18+, terms
- **i18n scaffolding** (`apps/web/src/lib/i18n.ts` en/hi/es/ja/fr)
- **Helm + Terraform skeletons** under `infra/` (API Deployment template + null_resource TF stub)
- **Load / chaos:** `infra/load/artillery-matching.yml`, `infra/load/chaos-moderation.mjs`
- **Security review checklist:** `docs/SECURITY_REVIEW.md`

### Phase 7 / v1
- **Live captions + translation hooks** (REST + socket `caption:line`; Plus unlocks translation target)
- **Activity cards:** Would you rather + Trivia + Co-draw/Co-watch stubs (REST + socket `activity:*`)
- **Rooms / group roulette:** list + join → LiveKit room session scaffolding
- **Avatar mode:** call control + `avatar:consent` / `avatar:mode` socket events
- **Video effects:** warm / mono / soft CSS filters via `effect:set` socket events
- **Plus match filters** (`PUT /me/filters`, Plus-gated; applied in matcher tickets)
- **Talkdrop Plus billing** mock checkout/webhook/status (Stripe/Razorpay redirect stub)

### Gaps closed from earlier phases
- GDPR/DPDP `GET/DELETE /me/data`
- Admin CSV export `GET /admin/export.csv`
- In-process API matcher (from 0.1.1) retained

### Mocks (documented)
| Integration | Mock behaviour |
|-------------|----------------|
| LiveKit SFU | Token mint + room create in-memory when `LIVEKIT_MOCK=true` |
| Moderation tap | Synthetic frame buffers; set `MOD_FORCE_FLAG=1` or payload `FLAG` to cut |
| Captions/STT/MT | Canned bilingual lines |
| Billing | Instant Plus activation when `BILLING_PROVIDER=mock` |
| SMS / age | Dev OTP in response; age mock pass ≥21 @ 0.8 confidence |
| Co-draw / Co-watch | Prompt + choice stubs; shared canvas/player later |
| Video effects | Client CSS filters synced over socket (no GPU pipeline) |
| Load (5k sockets) | Artillery smoke only; full load needs dedicated cluster |

## 0.1.1 — 2026-10-25

### Added
- In-process matcher inside the API; two-socket match/keep e2e test
- Local camera preview; legal route stubs

## 0.1.0 — 2026-10-24

### Added
- Monorepo Phases 0–5 MVP (auth → admin) with Talkdrop branding
