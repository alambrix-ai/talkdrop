# Talkdrop: Backend (Node.js) Build Guide

Everything needed to build apps/api, apps/worker, the PostgreSQL schema and infra.

> Read together with SPEC.md (shared sections: stack, architecture, plan, testing). If anything conflicts, SPEC.md wins.

# 2. Locked technology stack

| Layer                             | Choice                                                                                                                                                                                                                         | Notes                                                                                                                                              |
|-----------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------|
| Web client **(LOCKED: React)**    | React 18, TypeScript, Vite, React Router 6, TanStack Query, Zustand, Tailwind CSS (mapped to design tokens), Framer Motion, react-hook-form + zod, react-i18next, livekit-client + @livekit/components-react, socket.io-client | SPA with code-splitting per route. SSR not needed for the app; the marketing landing page is a normal route (add prerender later if SEO needs it). |
| Backend **(LOCKED: Node.js)**     | Node 20 LTS, TypeScript, Fastify, zod, Socket.IO, BullMQ, Prisma, ioredis, pino, jose (JWT), argon2                                                                                                                            | Modular monolith (apps/api) plus a worker app (apps/worker) for matcher, moderation and jobs.                                                      |
| Database **(LOCKED: PostgreSQL)** | PostgreSQL 16 with Prisma migrations; extensions `pgcrypto`, `citext`, `pg_trgm`                                                                                                                                               | Source of truth for users, sessions, reports, enforcement, billing, audit.                                                                         |
| Ephemeral state                   | Redis 7                                                                                                                                                                                                                        | Matching pool (sorted sets), presence, rate limits, BullMQ queues, socket.io adapter.                                                              |
| Realtime media                    | LiveKit (self-hosted SFU) + coturn TURN                                                                                                                                                                                        | 1:1 routed through the SFU (not P2P) so media can be moderated. Server SDK `livekit-server-sdk` issues short-lived tokens.                         |
| Object storage                    | S3-compatible (MinIO in dev)                                                                                                                                                                                                   | Evidence clips only, encrypted, 24 h lifecycle expiry.                                                                                             |
| Moderation                        | Provider adapters (`ModerationProvider` interface) with a mock for dev; real: cloud image moderation + speech-to-text + text toxicity                                                                                          | Swappable. Never call providers directly from routes.                                                                                              |
| Age/identity                      | `AgeVerificationProvider` interface; on-device face-age estimation in browser (TensorFlow.js) + phone OTP; document check via third-party provider later                                                                       | Mock provider in dev that always returns "18+ verified".                                                                                           |
| Tooling                           | pnpm workspaces, ESLint, Prettier, Vitest, Supertest, Playwright, Docker Compose, GitHub Actions                                                                                                                               |                                                                                                                                                    |


# 3. System architecture

### 3.1 Planes

- **Control plane** (apps/api): auth, profiles, trust, connections, chat, reports, admin, billing.
- **Realtime plane** (apps/api Socket.IO gateway + apps/worker matcher + LiveKit): signalling, matching, session lifecycle, media.
- **Safety plane** (apps/worker moderation queue + admin review tooling): verification gate, frame/audio moderation, enforcement.

### 3.2 Life of a call

1.  User signs in (phone OTP), passes age check; the API issues a signed **trust token** (short JWT: userId, ageVerified, trustTier).
2.  Client opens a Socket.IO connection (auth with access token) and emits `queue:join` with preferences.
3.  The matcher worker pairs two users (Section 11), creates a `sessions` row and a LiveKit room, and emits `match:found` to both with a LiveKit join token.
4.  Both clients connect to LiveKit. First 15 seconds are blurred (Section 12). Icebreaker is shown.
5.  Moderation receives sampled frames/audio (Section 13). A violation cuts the room (`session:cut`) and writes an enforcement event.
6.  On end, the outcome (duration, vibe, report) is stored; the trust score is updated; both users see the After-call screen.

### 3.3 Deployment topology (MVP)

    [ Browser (React SPA) ] --HTTPS--> [ Reverse proxy / CDN ] --> apps/web (static)
                                   \--> apps/api (Fastify REST + Socket.IO)  --> PostgreSQL
                                                             |                 --> Redis
                                                             \--> LiveKit (SFU) <--> coturn (TURN/STUN)
    apps/worker (matcher, moderation, jobs) --> Redis (BullMQ), PostgreSQL, S3, moderation providers
    LiveKit ----(sampled frames/audio, Phase 2 server tap)----> apps/worker moderation


# 5. Repository layout

    talkdrop/
      apps/
        web/                 # React + Vite SPA
          src/
            app/             # router, providers, layouts (PublicLayout, AppLayout, AdminLayout)
            features/        # auth, verify, onboarding, lobby, match, call, after, connections, chat, profile, report, admin
            components/      # feature-agnostic composites
            lib/             # api client, socket client, livekit helper, i18n
            styles/          # tailwind.css, imports packages/ui/tokens.css
        api/                 # Fastify server
          src/
            modules/         # auth, users, profiles, verification, trust, sessions, matching-gateway, connections, messages,
                             # reports, enforcement, moderation, admin, billing, tenants, audit
            plugins/         # auth, rateLimit, errorHandler, swagger, socket
            providers/       # age/, moderation/, sms/, email/, storage/ (interfaces + mock + real)
            prisma/          # schema.prisma, migrations, seed.ts
        worker/              # BullMQ workers: matcher, moderation, evidence-expiry, trust-recompute, notifications
      packages/
        shared/              # zod schemas, TS types, enums, socket event contracts, constants
        ui/                  # tokens.css, tailwind preset, React components
      infra/
        docker-compose.yml   # postgres, redis, minio, livekit, coturn, mailhog
        livekit.yaml
      docs/
        SPEC.md, design/ (mockup PNGs), openapi.json (generated)
      .github/workflows/ci.yml
      .env.example, pnpm-workspace.yaml, turbo.json (optional)


# 8. PostgreSQL schema

Use Prisma models mirroring the SQL below (snake_case in DB via `@map`). All tables have `created_at timestamptz default now()`. Primary keys are UUID v7 (or `gen_random_uuid()`). Enable extensions: `pgcrypto`, `citext`, `pg_trgm`.

    -- Enums
    CREATE TYPE account_status AS ENUM ('active','restricted','suspended','banned');
    CREATE TYPE trust_tier AS ENUM ('new','bronze','silver','gold','platinum','flagged');
    CREATE TYPE verification_method AS ENUM ('face_estimate','phone','document');
    CREATE TYPE verification_result AS ENUM ('passed','uncertain','failed');
    CREATE TYPE session_status AS ENUM ('matching','connecting','live','ended','cut');
    CREATE TYPE end_reason AS ENUM ('hangup','next','partner_left','report','moderation_cut','network','timeout');
    CREATE TYPE report_category AS ENUM ('nudity','harassment','underage','spam','other');
    CREATE TYPE report_status AS ENUM ('open','in_review','actioned','dismissed','escalated');
    CREATE TYPE enforcement_action AS ENUM ('warn','video_block','shadow_pool','suspend','ban');
    CREATE TYPE vibe AS ENUM ('great','okay','not_for_me');
    CREATE TYPE admin_role AS ENUM ('owner','admin','reviewer','viewer');

    -- Identity
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      phone_e164 text UNIQUE, email citext UNIQUE,
      display_name text NOT NULL, avatar_url text,
      birth_year_range text,                -- e.g. '18-24'; never store DOB or face
      age_verified boolean NOT NULL DEFAULT false,
      trust_score int NOT NULL DEFAULT 0, trust_tier trust_tier NOT NULL DEFAULT 'new',
      status account_status NOT NULL DEFAULT 'active',
      region text, country text, timezone text,
      tenant_id uuid REFERENCES tenants(id),
      plan text NOT NULL DEFAULT 'free',    -- 'free' | 'plus'
      streak_days int NOT NULL DEFAULT 0, last_active_date date,
      created_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz
    );
    CREATE TABLE user_profiles (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      bio text, city text, languages text[] NOT NULL DEFAULT '{}',
      default_mood text, blur_first boolean NOT NULL DEFAULT true,
      avatar_first boolean NOT NULL DEFAULT false, captions boolean NOT NULL DEFAULT true,
      translate_to text, locale text DEFAULT 'en'
    );
    CREATE TABLE interests (id serial PRIMARY KEY, slug text UNIQUE NOT NULL, label text NOT NULL, category text);
    CREATE TABLE user_interests (user_id uuid REFERENCES users(id) ON DELETE CASCADE, interest_id int REFERENCES interests(id), PRIMARY KEY(user_id, interest_id));
    CREATE TABLE verifications (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      method verification_method NOT NULL, result verification_result NOT NULL,
      estimated_age_range text, provider text, provider_ref text, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE devices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id) ON DELETE CASCADE,
      fingerprint_hash text NOT NULL, user_agent text, ip_hash text, first_seen timestamptz DEFAULT now(), last_seen timestamptz DEFAULT now(),
      UNIQUE(user_id, fingerprint_hash)
    );
    CREATE INDEX devices_fp ON devices(fingerprint_hash);
    CREATE TABLE auth_otps (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), phone_e164 text NOT NULL, code_hash text NOT NULL, expires_at timestamptz NOT NULL, attempts int DEFAULT 0, consumed_at timestamptz);
    CREATE TABLE refresh_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id) ON DELETE CASCADE, token_hash text NOT NULL, device_id uuid, expires_at timestamptz NOT NULL, revoked_at timestamptz);

    -- Realtime
    CREATE TABLE sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), kind text NOT NULL DEFAULT 'pair',  -- 'pair' | 'room'
      status session_status NOT NULL DEFAULT 'matching', region text, livekit_room text UNIQUE,
      started_at timestamptz, ended_at timestamptz, duration_sec int, end_reason end_reason, tenant_id uuid
    );
    CREATE TABLE session_participants (
      session_id uuid REFERENCES sessions(id) ON DELETE CASCADE, user_id uuid REFERENCES users(id),
      joined_at timestamptz, left_at timestamptz, kept boolean DEFAULT false, PRIMARY KEY(session_id, user_id)
    );
    CREATE TABLE match_events (
      id bigserial PRIMARY KEY, session_id uuid REFERENCES sessions(id), user_a uuid, user_b uuid,
      score numeric, score_breakdown jsonb, wait_ms_a int, wait_ms_b int,
      outcome text, skipped_within_10s boolean, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE vibe_checks (session_id uuid REFERENCES sessions(id), from_user uuid REFERENCES users(id), about_user uuid REFERENCES users(id), vibe vibe NOT NULL, compliments text[] DEFAULT '{}', created_at timestamptz DEFAULT now(), PRIMARY KEY(session_id, from_user));

    -- Social
    CREATE TABLE connections (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_a uuid REFERENCES users(id) ON DELETE CASCADE, user_b uuid REFERENCES users(id) ON DELETE CASCADE,
      origin_session uuid REFERENCES sessions(id), status text NOT NULL DEFAULT 'active', created_at timestamptz DEFAULT now(),
      CHECK (user_a < user_b), UNIQUE(user_a, user_b)
    );
    CREATE TABLE messages (
      id bigserial PRIMARY KEY, connection_id uuid REFERENCES connections(id) ON DELETE CASCADE, sender_id uuid REFERENCES users(id),
      body text NOT NULL, created_at timestamptz DEFAULT now(), read_at timestamptz, moderation_flag boolean DEFAULT false
    );
    CREATE INDEX messages_conn ON messages(connection_id, id DESC);
    CREATE TABLE blocks (blocker_id uuid REFERENCES users(id) ON DELETE CASCADE, blocked_id uuid REFERENCES users(id) ON DELETE CASCADE, created_at timestamptz DEFAULT now(), PRIMARY KEY(blocker_id, blocked_id));

    -- Safety
    CREATE TABLE reports (
      id bigserial PRIMARY KEY, session_id uuid REFERENCES sessions(id), reporter_id uuid REFERENCES users(id), reported_id uuid REFERENCES users(id),
      category report_category NOT NULL, details text, status report_status NOT NULL DEFAULT 'open', severity text DEFAULT 'medium',
      reviewer_id uuid, decision text, decided_at timestamptz, retention_deadline timestamptz, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE evidence (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), report_id bigint REFERENCES reports(id) ON DELETE CASCADE,
      storage_key text NOT NULL, kind text NOT NULL, encrypted boolean DEFAULT true, expires_at timestamptz NOT NULL, deleted_at timestamptz
    );
    CREATE TABLE moderation_events (
      id bigserial PRIMARY KEY, session_id uuid, user_id uuid, kind text NOT NULL,  -- 'frame'|'audio'|'text'|'gate'
      label text, score numeric, action_taken text, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE enforcement (
      id bigserial PRIMARY KEY, user_id uuid REFERENCES users(id), action enforcement_action NOT NULL, reason text,
      report_id bigint, expires_at timestamptz, actor_id uuid, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE appeals (id bigserial PRIMARY KEY, enforcement_id bigint REFERENCES enforcement(id), user_id uuid, message text, status text DEFAULT 'open', decided_at timestamptz, created_at timestamptz DEFAULT now());

    -- Enterprise and billing
    CREATE TABLE tenants (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, slug text UNIQUE, branding jsonb DEFAULT '{}', policy jsonb DEFAULT '{}', sso jsonb, created_at timestamptz DEFAULT now());
    CREATE TABLE tenant_members (tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE, user_id uuid REFERENCES users(id) ON DELETE CASCADE, role admin_role NOT NULL, PRIMARY KEY(tenant_id,user_id));
    CREATE TABLE subscriptions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id), provider text, provider_ref text, plan text, status text, current_period_end timestamptz);
    CREATE TABLE audit_log (id bigserial PRIMARY KEY, tenant_id uuid, actor_id uuid, action text NOT NULL, target_type text, target_id text, meta jsonb, created_at timestamptz DEFAULT now());
    CREATE TABLE icebreakers (id serial PRIMARY KEY, text text NOT NULL, interest_id int REFERENCES interests(id), mood text, locale text DEFAULT 'en', active boolean DEFAULT true);
    CREATE TABLE rooms (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), title text, host_id uuid, starts_at timestamptz, capacity int DEFAULT 6, language text, tenant_id uuid);

### 8.1 Data rules

- Never store DOB, face images, raw video or audio. Store only the estimated range and result.
- `audit_log` and `enforcement` are append-only (revoke UPDATE/DELETE from the app role).
- Evidence rows are deleted with their object after `expires_at` by the evidence-expiry worker (runs every 10 minutes).
- Index every foreign key and the hot paths: `sessions(status)`, `reports(status, created_at)`, `messages(connection_id,id)`, `blocks(blocked_id)`.
- Seed script: interests (30), icebreakers (100), demo tenant, demo users and the dummy data in 7.12.


# 9. REST API

Base path `/api/v1`. JSON, zod-validated, errors as `{ "error": { "code", "message", "details?" } }`. Auth: `Authorization: Bearer <accessJWT>` (15 min) plus httpOnly refresh cookie (30 days, rotating). Rate limits via Redis (per IP and per user). OpenAPI generated from zod (fastify-zod-openapi / zod-to-openapi) at `/docs`.

| Method and path                                    | Purpose                                                                                                                                  | Auth          |
|----------------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------|---------------|
| POST /auth/otp/request                             | Send OTP to phone (rate-limited, disposable-number block)                                                                                | public        |
| POST /auth/otp/verify                              | Verify code, create user if new, return access token + set refresh cookie                                                                | public        |
| POST /auth/refresh, POST /auth/logout              | Rotate / revoke refresh token                                                                                                            | cookie        |
| POST /verification/age                             | Submit client-side face-age estimate result + liveness signal; server validates and records `verifications`; sets `age_verified` on pass | user          |
| POST /verification/fallback/start, /complete       | Phone-code or document provider flow                                                                                                     | user          |
| GET /me, PATCH /me                                 | Profile, settings (blur, avatar-first, captions, languages, mood)                                                                        | verified      |
| PUT /me/interests                                  | Replace interest set (3 to 12)                                                                                                           | verified      |
| GET /interests                                     | Interest catalogue                                                                                                                       | verified      |
| GET /matching/estimate                             | Online count + expected wait for current preferences                                                                                     | verified      |
| GET /sessions/:id                                  | Session summary for participants (partner public card, shared interests, icebreaker)                                                     | participant   |
| POST /sessions/:id/end                             | End session (hangup, next)                                                                                                               | participant   |
| POST /sessions/:id/vibe                            | Vibe check + compliments                                                                                                                 | participant   |
| POST /sessions/:id/keep                            | Tap "keep in touch"; creates connection when mutual                                                                                      | participant   |
| POST /sessions/:id/icebreaker/next                 | Another icebreaker                                                                                                                       | participant   |
| POST /sessions/:id/moderation/frame                | MVP client-side frame sample for classification (multipart, rate-limited, signed with session key)                                       | participant   |
| POST /reports                                      | Create report (sessionId, category, details, alsoBlock); snapshots evidence; ends session                                                | participant   |
| POST /blocks, DELETE /blocks/:userId, GET /blocks  | Manage blocks                                                                                                                            | verified      |
| GET /connections, GET /connections/:id             | List with last message and unread count; detail                                                                                          | verified      |
| GET /connections/:id/messages?before=              | Cursor pagination                                                                                                                        | verified      |
| POST /connections/:id/messages                     | Send message (also over socket)                                                                                                          | verified      |
| POST /connections/:id/call                         | Start a call with a connection (creates session, notifies partner)                                                                       | verified      |
| GET /public/stats                                  | Landing stats (cached)                                                                                                                   | public        |
| POST /appeals                                      | Appeal an enforcement                                                                                                                    | user          |
| POST /billing/checkout, POST /billing/webhook      | Talkdrop Plus (Stripe/Razorpay adapter)                                                                                                  | user / signed |
| GET /admin/overview                                | KPIs, calls per hour, active policy                                                                                                      | admin         |
| GET /admin/reports?status=, GET /admin/reports/:id | Moderation queue and case detail (evidence URL signed, short-lived, blurred by default)                                                  | reviewer+     |
| POST /admin/reports/:id/decision                   | Dismiss, warn, suspend, ban, escalate (writes enforcement + audit)                                                                       | reviewer+     |
| GET /admin/audit                                   | Audit log (paginated)                                                                                                                    | admin         |
| GET/PATCH /admin/policy                            | Tenant policy JSON (age band, regions, moderation strictness, blur default)                                                              | admin         |


# 10. Realtime events (Socket.IO)

Namespace `/rt`. Auth with access token in handshake. Rooms: `user:{id}` for personal events, `session:{id}` for call events. Payloads are zod schemas in `packages/shared/src/events.ts`. Use acknowledgements for client-to-server events.

| Direction       | Event                                           | Payload / meaning                                                                                                                |
|-----------------|-------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------|
| C to S          | queue:join                                      | { interests\[\], mood, languages\[\], region?, filters? } joins matching pool; ack { estimatedWaitMs }                           |
| C to S          | queue:leave                                     | leave pool                                                                                                                       |
| S to C          | match:found                                     | { sessionId, partner:{ displayName, age?, city, trustTier, verified }, sharedInterests\[\], icebreaker, livekit:{ url, token } } |
| C to S          | match:accept / match:decline                    | decline requeues; both accept (or timeout 5 s) starts the call                                                                   |
| S to C          | session:started                                 | { sessionId, startedAt, blurUntilMs }                                                                                            |
| C to S          | session:next, session:end                       | ends session; next requeues with same preferences                                                                                |
| S to C          | session:ended                                   | { reason: hangup\|partner_left\|report\|moderation_cut\|network }                                                                |
| S to C          | session:cut                                     | { reason, userMessage } moderation cut (shown in a modal)                                                                        |
| C to S / S to C | session:keep, session:partnerKept               | mutual keep signalling                                                                                                           |
| C to S / S to C | activity:start, activity:update                 | shared activity state (would-you-rather rounds)                                                                                  |
| S to C          | icebreaker:new                                  | { text }                                                                                                                         |
| C to S / S to C | chat:send, chat:message, chat:read, chat:typing | connection chat                                                                                                                  |
| S to C          | presence:update                                 | { userId, online } for connections                                                                                               |
| S to C          | call:incoming                                   | call from a connection { connectionId, sessionId, from }                                                                         |
| S to C          | trust:updated, account:restricted               | live status changes                                                                                                              |


# 11. Matching engine (apps/worker)

1.  On `queue:join` the gateway stores the ticket in Redis: sorted set `pool:{region}:{lang}` scored by join time, with a hash `ticket:{userId}` holding preferences, trust tier, blocked ids snapshot (cap 500) and recent partners (last 20).
2.  A BullMQ repeatable job per shard runs every 300 ms: read up to 200 oldest tickets, build candidate pairs, filter on **hard constraints**, then score.
3.  **Hard constraints:** both age_verified; not blocked either way; not in each other's recent partners; compatible trust pools (flagged users only with flagged); same tenant; filters satisfied (Plus); both online (heartbeat within 10 s).
4.  **Score (0 to 100, tune with data):** shared interests 40 (Jaccard), mood match 15, language overlap 15, wait-time bonus up to 15 (so nobody starves), vibe-history bonus 10, diversity penalty up to -10 for over-used partners.
5.  Pick best pairs greedily; claim atomically with a Lua script that removes both tickets or neither. On success: insert `sessions`, `session_participants`, `match_events`; create LiveKit room; emit `match:found` to both.
6.  **Widening:** after 8 s relax mood, then interests (require at least 1 shared, then 0), then region. After 20 s offer "Play a game while you wait" (solo icebreaker cards) and keep searching.
7.  **Targets:** p95 time to match under 2 s with at least 50 waiting users; no user matched twice; atomicity verified by a concurrency test with 1,000 simulated tickets.
8.  Log the outcome (duration, skip under 10 s, vibe, report) to `match_events`; a weekly job exports a training set (later ranking model).


# 12. Media layer (LiveKit)

- One LiveKit room per session; room name = session id; participants identity = user id; token TTL 10 minutes, grants: publish/subscribe own room only.
- Default 540p video (720p for Plus), Opus audio; simulcast on; adaptive stream and dynacast on. TURN via coturn (UDP 3478 plus TLS 5349); configure in `infra/livekit.yaml`.
- **Blur-first:** the client applies a CSS/WebGL blur to the remote video element for the first 15 s (`blurUntilMs`), then animates it away. The sender-side also blurs outgoing video via a processor when the account is restricted. Avatar-first mode sends audio only and an avatar stream until both consent.
- Webhook endpoint `/internal/livekit/webhook` (signature verified) updates participant join/leave, track published, room finished. Use it to set `sessions.status` and `duration_sec`.
- Reconnection: client shows a "Reconnecting" banner for up to 15 s; session ends with reason `network` after that.


# 13. Moderation and safety pipeline

### 13.1 Layers

| Layer                | What                                                                                                                                                                                  | Implementation                                                                                                                                                                                                                                                                                                                                                                                    |
|----------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1 Gate (before call) | Age result, risk score (device reuse, phone, velocity), ban-evasion fingerprint; selfie preview nudity scan before first match                                                        | Verification service + `ModerationProvider.scanImage`; reject to restricted pool when uncertain                                                                                                                                                                                                                                                                                                   |
| 2 Live (during call) | Sampled video frames (about 1 per second) to image classifier (nudity, sexual activity, weapons, self-harm, minors-in-frame); audio chunks to speech-to-text then toxicity classifier | MVP: client captures frames from its own camera (canvas, 1 per 2 s, low resolution) and posts them signed to `/sessions/:id/moderation/frame`. **Phase 2 (required before public launch):** a server-side worker joins the LiveKit room as a hidden subscriber and samples remote tracks, so a malicious client cannot bypass it. Violation above threshold emits `session:cut` within about 1 s. |
| 3 After (review)     | Human review of reports and borderline cases; enforcement ladder; appeals                                                                                                             | Admin console moderation queue; evidence viewer blurred by default; reviewer actions logged to `audit_log`                                                                                                                                                                                                                                                                                        |

### 13.2 Enforcement ladder

warn, video_block (24 h), shadow_pool (matched only with flagged users), suspend (7 or 30 days), ban (account + device + phone fingerprint). Every action writes `enforcement` and `audit_log` rows, notifies the user with a reason and an appeal link, and updates `users.status` and trust tier. Appeals target 72 h response.

### 13.3 Reports and evidence

- Report snapshots the rolling evidence buffer: the last 30 seconds of sampled frames plus transcript lines (not full video) from the moderation event log into an encrypted object (AES-256-GCM with per-object key wrapped by a KMS key or an env master key in dev). `expires_at = now + 24 h` unless the case is escalated.
- Severe categories (underage, nudity) auto-escalate to the top of the queue; a hook `handleCsamSuspicion()` is stubbed with a clear TODO for hash-matching and the legal reporting workflow, which requires a specialist and legal sign-off before launch. Do not implement storage of any suspected CSAM beyond what that workflow mandates.

### 13.4 Provider interfaces (packages/shared)

    interface ModerationProvider {
      scanImage(buf: Buffer): Promise<{ labels: {name:string; score:number}[]; flagged: boolean }>;
      transcribeAndScore(audio: Buffer, locale?: string): Promise<{ text: string; toxicity: number; labels: string[] }>;
      scoreText(text: string): Promise<{ toxicity: number; labels: string[] }>;
    }
    interface AgeVerificationProvider {
      verifyFromEstimate(input: { estimatedAge: number; confidence: number; liveness: boolean }): Promise<'passed'|'uncertain'|'failed'>;
      startDocumentCheck(userId: string): Promise<{ redirectUrl: string }>;
    }
    // Thresholds in config: nudity cut >= 0.85, review 0.6-0.85; toxicity cut >= 0.9; age pass requires estimate >= 21 (buffer) with confidence >= 0.8, else uncertain.

### 13.5 Weekly safety metrics (admin Overview)

Time to cut a violating stream, reports per 1,000 calls, false-positive cut rate, reviewer queue age, repeat-offender rate, appeal overturn rate.


# 14. Security, privacy and quality requirements

- TLS everywhere; DTLS-SRTP for media; cookies httpOnly + Secure + SameSite=Lax; CSRF protection on cookie-authenticated endpoints; strict CORS allowlist; Helmet headers and CSP.
- Passwords are not used for end users (OTP). Admin accounts: SSO or email+password with argon2 and TOTP 2FA.
- Rate limits: OTP (3 per 10 min per phone, 10 per hour per IP), queue joins, reports, messages. Disposable phone number blocking. Bot detection hook.
- PII minimisation: phone stored hashed + encrypted (field-level encryption), IPs stored as hashes, no DOB, no face data. Data export and deletion endpoints (`GET/DELETE /me/data`) for GDPR/DPDP.
- Secrets from env/secret manager. Dependency and container scanning in CI. Structured logs (pino) without PII. OpenTelemetry traces for API, matcher and moderation; metrics for matching latency, cut latency, call setup time.
- Accessibility: WCAG 2.1 AA, keyboard-complete call controls, ARIA labels on icon buttons, live captions, reduced-motion support, minimum 44 px targets.
- Performance budgets: landing LCP under 2.5 s on 4G; app JS under 250 KB gzipped per route; call connect (match to first frame) under 3 s p95.
- Legal and policy pages to scaffold: Community rules, Privacy centre, Transparency report, 18+ notice, Terms. Final text needs legal review per launch market.


# 17. Configuration

    # .env.example
    NODE_ENV=development
    DATABASE_URL=postgresql://talkdrop:talkdrop@localhost:5432/talkdrop
    REDIS_URL=redis://localhost:6379
    JWT_ACCESS_SECRET=change-me  JWT_REFRESH_SECRET=change-me  TRUST_TOKEN_SECRET=change-me
    FIELD_ENCRYPTION_KEY=base64-32-bytes
    LIVEKIT_URL=ws://localhost:7880  LIVEKIT_API_KEY=devkey  LIVEKIT_API_SECRET=devsecret
    S3_ENDPOINT=http://localhost:9000  S3_BUCKET=talkdrop-evidence  S3_ACCESS_KEY=minio  S3_SECRET_KEY=minio123
    SMS_PROVIDER=mock  EMAIL_PROVIDER=mock  AGE_PROVIDER=mock  MODERATION_PROVIDER=mock
    MOD_NUDITY_CUT=0.85  MOD_NUDITY_REVIEW=0.6  MOD_TOXICITY_CUT=0.9
    EVIDENCE_TTL_HOURS=24  BLUR_FIRST_SECONDS=15  MATCH_WIDEN_AFTER_MS=8000
    WEB_ORIGIN=http://localhost:5173  API_ORIGIN=http://localhost:4000
    VITE_API_URL=http://localhost:4000/api/v1  VITE_RT_URL=http://localhost:4000/rt  VITE_LIVEKIT_URL=ws://localhost:7880


# 15. Phased build plan for Cursor

| Phase                           | Deliverables                                                                                                                                                                                                                         | Done when                                                                                                                   |
|---------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| **0 Foundation**                | Monorepo, tooling, Docker Compose (postgres, redis, minio, livekit, coturn, mailhog), CI, Prisma schema + migrations + seed, shared package, UI tokens + base components (Section 4.4), Storybook (optional)                         | `pnpm dev` starts everything; migrations + seed run; CI green                                                               |
| **1 Identity and onboarding**   | OTP auth (mock SMS provider), refresh rotation, route guards; age verification screen with on-device estimate + mock provider; onboarding (interests, mood, languages, toggles); profile and settings; landing page                  | New user can sign up, verify, pick interests and reach the lobby; all screens match mockups on desktop and mobile           |
| **2 Matching and calls**        | Socket gateway, Redis pool, matcher worker, session lifecycle, LiveKit tokens + webhooks, lobby, match-found, live call UI (controls, PiP, timer, blur-first, icebreakers, captions placeholder), next/end flows, reconnect handling | Two browsers get matched and see each other; Next requeues; concurrency test passes; p95 match under 2 s in load test       |
| **3 Safety v1**                 | Report and block flows, evidence service, moderation queue API, gate checks, client-frame moderation endpoint with provider adapter, cut flow + modal, enforcement ladder, appeals, rate limits and abuse defences                   | Reporting ends a call, creates a case with evidence; a flagged frame (mock) cuts the call in under 2 s; bans block re-entry |
| **4 Social**                    | After-call (vibe, compliments, keep), connections list, chat (real-time, unread, presence), call a connection, trust score and streak jobs                                                                                           | Mutual keep creates a connection; chat works across two browsers; trust tier updates                                        |
| **5 Admin console**             | Tenant model, admin auth + roles, Overview (KPIs, chart, policy), moderation queue + case view + decisions, audit log, CSV export                                                                                                    | Reviewer can action a report end to end; audit log immutable                                                                |
| **6 Hardening and launch prep** | Server-side moderation tap (LiveKit hidden subscriber), load and chaos tests, observability dashboards, security review, a11y audit, i18n scaffolding, legal pages, production Terraform/Helm skeleton                               | All Section 16 acceptance tests pass; no critical findings open                                                             |
| **7 v1 features**               | Live captions + translation, activity cards, rooms, avatar mode, effects, filters, Plus billing                                                                                                                                      | Per feature acceptance criteria                                                                                             |


# 16. Testing and acceptance

- **Unit:** services, matcher scoring and constraints, trust score math, enforcement ladder, zod schemas (Vitest).
- **Integration:** API with real Postgres/Redis in Docker (Supertest); socket flows; migration up/down.
- **E2E (Playwright, two browser contexts with fake media devices):** (1) sign up, verify, onboard; (2) two users match and connect; (3) Next requeues; (4) report ends the session and creates a case; (5) mutual keep creates a connection and chat message arrives live; (6) admin actions a report.
- **Load:** k6 or Artillery: 5,000 simulated sockets in queue, matcher p95 under 2 s; API p95 under 200 ms at 500 rps.
- **Visual:** Playwright screenshots at 1440 px and 390 px for every route compared with the mockups in `docs/design`.
- **Security:** OWASP ZAP baseline in CI; authorisation tests for every endpoint (participant-only, admin-only).

