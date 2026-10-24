# Changelog

All notable changes to Talkdrop are documented in this file.

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
