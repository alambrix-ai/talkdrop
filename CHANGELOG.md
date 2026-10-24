# Changelog

All notable changes to Talkdrop are documented in this file.

## 0.1.1 — 2026-10-25

### Added
- In-process matcher inside the API (atomic Redis claim) so matching works without a separate worker
- End-to-end matching test: two sockets join queue → match → end → mutual keep → connection
- Local camera preview on lobby and call (getUserMedia); partner placeholder with blur-first
- Legal page stubs (`/legal/:slug`) linked from the landing footer

## 0.1.0 — 2026-10-24

### Added

- Monorepo scaffold: `apps/web`, `apps/api`, `apps/worker`, `packages/shared`, `packages/ui`
- Ink wash design tokens and UI primitives (Button, Chip, Tag, Card, Avatar, Switch, Input, ProgressBar, VideoTile, Orb, Modal, StatCard, DataTable, BarChart, Logo)
- Docker Compose for Postgres, Redis, MinIO, LiveKit, Mailhog
- Prisma schema, migrations, and demo seed (Arjun, Mei, Lucia, admin tenant)
- OTP auth (mock SMS), refresh rotation, age verification (mock), onboarding, profile
- Socket.IO matching gateway + BullMQ-style worker matcher with Redis pool and atomic claim
- Session lifecycle, LiveKit token mock, blur-first call UI, icebreakers
- Report/block, encrypted evidence snapshots (24h TTL), client-frame moderation mock cut
- After-call vibe/keep, connections + realtime chat, trust helpers
- Admin console: overview KPIs, moderation queue decisions, audit log
- Talkdrop branding (logos, favicon, copy); README and local `.env.example`

### Phases landed

- Phase 0 Foundation
- Phase 1 Identity and onboarding
- Phase 2 Matching and calls (mock LiveKit in dev)
- Phase 3 Safety v1 (mock moderation provider)
- Phase 4 Social
- Phase 5 Admin console (MVP tabs)

### Remaining / next

- Phase 6: server-side LiveKit moderation tap, load/chaos tests, full observability, a11y audit, legal page copy
- Phase 7 / v1: captions+translation, activity cards, rooms, Plus billing adapters
- Wire real LiveKit + coturn when `LIVEKIT_MOCK=false`; real S3 when `S3_MOCK=false`
- Playwright E2E two-browser suite from SPEC §16
