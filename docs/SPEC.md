# Talkdrop: Build Specification

A safe, beautiful, interest-first random video chat platform. Stack: React + TypeScript (web), Node.js + TypeScript (API and workers), PostgreSQL, Redis, LiveKit. Palette "Ink wash": \#4A4A4A, \#CBCBCB, \#FFFFE3, \#6D8196. Web only (responsive desktop 1440 px and mobile 390 px).

# 0. How to use this document with Cursor

This document is the single source of truth. Give Cursor this file together with the design reference (Section 4 and the mockup screenshots in `/docs/design`). Cursor should build in the phase order of Section 15, finishing and testing one phase before starting the next.

### Suggested first prompt to Cursor

    Read docs/SPEC.md fully. Create the monorepo exactly as in Section 5. Then implement Phase 0 and Phase 1 from Section 15.
    Rules: TypeScript strict everywhere; zod for all input validation; no business logic in route handlers (use services);
    every endpoint and socket event must match Sections 9 and 10; use the design tokens in Section 4 (never hard-code colours);
    write tests for each service; keep a CHANGELOG.md; after each phase run lint, typecheck and tests and fix everything before continuing.
    Ask me before changing any decision marked LOCKED.

### Suggested .cursor/rules (create as .cursor/rules/talkdrop.mdc)

    - Monorepo with pnpm workspaces. Packages: apps/web, apps/api, apps/worker, packages/shared, packages/ui.
    - All request/response/socket payload types and zod schemas live in packages/shared and are imported by web and api.
    - API: Fastify + zod + Prisma. Controllers thin, services hold logic, repositories wrap Prisma. No raw SQL except migrations and the matcher.
    - Web: React 18, Vite, React Router, TanStack Query for server state, Zustand only for ephemeral UI/call state.
    - Styling: CSS variables from packages/ui/tokens.css exposed through Tailwind theme. No hex values in components.
    - Accessibility: every interactive element has a label, visible focus ring, keyboard support; respect prefers-reduced-motion.
    - Safety first: never store raw video or audio. Evidence clips only through the evidence service, encrypted, 24h expiry.
    - Secrets only via environment variables; never commit .env files. Provide .env.example.
    - Every PR-sized change: lint + typecheck + unit tests green. E2E for the critical path (Section 16).

<div class="note">

**Decisions marked LOCKED** were given by the product owner: PostgreSQL as the database, React for the website, Node.js for the backend. Everything else in this document is a recommended default Cursor may implement as written; change only with approval.

</div>

# 1. Product overview

### 1.1 Vision

The winning position is not "another random video chat" but a **safe, beautiful, interest-first** way to meet new people live, built with the controls and compliance an enterprise or brand partner can sign off on. Omegle shut down in November 2023 after years of abuse and litigation; most clones copied its weakness (anonymous, unmoderated, empty-feeling). We own three gaps:

- **Trust:** verified 18+ humans, real-time AI moderation, clear reporting.
- **Match quality:** match by interests, language, mood and intent, not pure chance.
- **Experience:** a premium look and shared activities (icebreakers, games) that remove the awkward first 10 seconds.

### 1.2 Audience

Adults (18+), both men and women, Gen Z and millennials: social discovery, language exchange, communities. Visual design is therefore deliberately gender-neutral (Section 4). Later: white-label for colleges, brands and events (enterprise admin console).

### 1.3 Principles

- Safety is a visible feature, not fine print.
- The first 10 seconds decide retention: ship an easy opener on every call.
- Ephemeral by default: no recordings unless a report is filed.
- Restricted by default for new accounts (blurred first 15 seconds), widening as trust is earned.

### 1.4 Scope of this build

| Phase           | Contents                                                                                                                                                                                                                                                                                                                                       |
|-----------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| MVP (build now) | Landing, age verification, onboarding (interests, mood, languages, safety toggles), lobby, interest-based 1:1 matching, SFU video call, AI icebreakers, blur-first start, report/block, after-call vibe check, connections and text chat, profile and settings, moderation pipeline v1, admin console (overview, moderation queue, audit log). |
| v1              | Live captions and translation, activity cards (would-you-rather, trivia, co-draw, co-watch), rooms and group roulette, avatar mode, effects, match filters (Premium), Talkdrop Plus billing.                                                                                                                                                   |
| v2              | Reputation and streak depth, hosted events, white-label theming, public API/SDK, SSO and policy engine for tenants.                                                                                                                                                                                                                            |

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

# 4. Design system ("Ink wash")

The look is calm, light and neutral so it appeals to every audience. Charcoal and cream lead; slate blue marks active and safe states. These exact tokens are used by every screen in the mockups. The complete CSS used by the mockups is in Appendix A and can be copied into `packages/ui/tokens.css` as the starting point.

### 4.1 Colour tokens

| Token      | Value                 | Use                                                                                   |
|------------|-----------------------|---------------------------------------------------------------------------------------|
| --white    | \#FFFFFF              | Page and card base                                                                    |
| --cream    | \#FFFFE3              | Highlight cards, selected chips, own chat bubbles, verified tag fill                  |
| --grey     | \#CBCBCB              | Secondary surfaces, interest tags, switch-off track, progress track                   |
| --slate    | \#6D8196              | Active nav tab, switches on, progress fill, live dot, focus border, video placeholder |
| --charcoal | \#4A4A4A              | Primary buttons (cream text), muted text, borders, emphasis                           |
| --ink      | \#262626              | Body and heading text                                                                 |
| --alert    | \#A33A3A              | Report/Block/destructive only (the single non-palette colour)                         |
| --line     | rgba(74,74,74,.28)    | Borders and dividers                                                                  |
| --overlay  | rgba(255,255,255,.86) | Controls and labels over video                                                        |

Contrast rules: text on white/cream/grey is ink or charcoal (AA). Never put white text on slate for body-size text; use slate as a fill or border only, or white bold text at 15 px+ for the active nav tab.

### 4.2 Typography

Display: **Bricolage Grotesque** 500-800 (headings, numbers, logo), letter-spacing -0.03em, line-height 1.04. Body/UI: **DM Sans** 400-700, 16 px base, line-height 1.5. Load via Google Fonts (or self-host). Scale (desktop): H1 52-64 px, H2 34-44 px, H3 20-24 px, body 16-19 px, small 13-14 px. Mobile: H1 34-44 px, H2 30-34 px.

### 4.3 Shape, spacing and motion

- Radius: cards 24 px (22 on small), buttons and chips fully pill (999 px), inputs 14 px, video tiles 28 px (PiP 16 px).
- Touch targets: buttons min-height 48 px (small 44 px), chips 44 px, tags 13 px bold, avatar 44-104 px.
- Page gutters: desktop 48 px (max width 1200-1280 px, centred), mobile 20 px. Card padding 24-40 px desktop, 18-24 px mobile.
- Shadows: soft grey only (`0 6px 18px rgba(74,74,74,.22)`), never coloured glow.
- Motion: 150-250 ms ease-out for hovers; "portal" cross-fade between matches (400 ms); pulsing rings in the lobby; all disabled under `prefers-reduced-motion`.

### 4.4 Component inventory (build in `packages/ui`)

| Component                     | Variants / behaviour                                                                                                                                                                          |
|-------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Button                        | primary (charcoal bg, cream text), ghost (white bg, ink text, line border), danger (alert bg, white text), sizes md/sm; icon-only 48 px round for call controls; loading and disabled states. |
| Chip                          | toggle; off = white + line border; on = cream bg + charcoal border + bold. Used for interests, languages, moods, vibe tags.                                                                   |
| Tag                           | default (white), mint/verified (cream bg, slate border), rose/interest (grey bg), deep (white, slate border). 13 px bold pill.                                                                |
| Card                          | default white; cream; grey; sizes with 24 px radius and line border.                                                                                                                          |
| Avatar                        | circle with initials, fills white/cream/grey; sizes 44/52/64/88/104.                                                                                                                          |
| NavLink / Tabs                | pill; active = slate bg + white bold text. Desktop top nav (Meet, Connections, Profile); mobile floating bottom tab bar (white, 94% opacity, grey shadow).                                    |
| Switch                        | 46x28 pill, off grey, on slate, white knob.                                                                                                                                                   |
| Input / Textarea              | 48 px, 14 px radius, line border, slate focus border.                                                                                                                                         |
| ProgressBar                   | 8 px, grey track, slate fill.                                                                                                                                                                 |
| VideoTile                     | rounded tile; shows LiveKit track or a slate-to-grey placeholder with silhouette; overlay slots for name tag, blur layer, safety badge.                                                       |
| Orb + PulseRings              | lobby waiting animation (conic slate/grey/cream orb with 3 expanding rings).                                                                                                                  |
| BottomSheet / Modal           | report dialog; mobile bottom sheet (radius 28 px top corners, handle), desktop centred modal.                                                                                                 |
| StatCard, DataTable, BarChart | admin console only.                                                                                                                                                                           |

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

# 6. Information architecture and routes

| Route                              | Screen                                                                    | Auth                | Next screens                               |
|------------------------------------|---------------------------------------------------------------------------|---------------------|--------------------------------------------|
| `/`                                | Landing                                                                   | public              | /verify, /admin                            |
| `/verify`                          | Age verification (step 1 of 3)                                            | signed in (OTP)     | /onboarding                                |
| `/onboarding`                      | Interests, mood, languages, safety toggles (step 2 of 3)                  | verified            | /lobby                                     |
| `/lobby`                           | Lobby (step 3)                                                            | verified            | /match, /onboarding (edit), /profile       |
| `/match`                           | Match found (blurred preview + icebreaker)                                | verified            | /call/:id, /match (find someone else)      |
| `/call/:sessionId`                 | Live call                                                                 | session participant | /after/:id, report modal, /connections/:id |
| `/call/:sessionId?report=1`        | Report (modal / bottom sheet)                                             | session participant | /after/:id                                 |
| `/after/:sessionId`                | After-call                                                                | session participant | /connections, /match, /lobby               |
| `/connections`, `/connections/:id` | Connections list + chat (split view on desktop, separate pages on mobile) | verified            | /call/:id (call a connection)              |
| `/profile`                         | Profile and settings                                                      | verified            | \-                                         |
| `/admin`                           | Enterprise admin console (desktop-first)                                  | tenant admin        | sub-tabs below                             |

Route guards: not signed in goes to `/verify`; signed in but unverified goes to `/verify`; restricted or banned accounts see a status page explaining the state and appeal option.

# 7. Screens: detailed UI specification

Layout rule for all screens: desktop uses a centred max-width container with 48 px gutters; mobile stacks to one column with 20 px gutters. Responsive breakpoint: 768 px. The signed-in desktop header is: logo (left), nav pills Meet / Connections / Profile (centre), "Verified 18+" tag + avatar (right). On mobile the header is logo + verified tag, and the nav becomes a floating bottom tab bar.

### 7.1 Landing (`/`)

- **Hero:** live-count tag ("128,400 people online now"); H1 "Meet someone new, live. Without the weirdness."; supporting sentence; primary CTA "Start a conversation" (to /verify) and ghost CTA "See how safety works" (scroll to \#safety); trust chips: 18+ verified, Live AI moderation, No recordings kept.
- **Hero visual:** two tilted video tiles (Mei, 24 and Tomás, 26) plus a floating card "You both like Jazz, Night walks, Street food" with icebreaker.
- **Stats strip:** 128,400 online; 6 min 42 s median conversation; 1.8 reports per 1,000 calls; 41 languages (values from `/api/public/stats`, cached 60 s).
- **Sections:** How it works (3 cards: Verify once, Pick your vibe, Say hello); Safety (4 points + "Live session check" card); Rooms and activities (3 cards with times); For teams and communities (CTA "Talk to sales"); footer links (18+ only, Community rules, Privacy centre, Transparency report, Contact).
- **Mobile:** single column; hero CTAs full width (54 px high).

### 7.2 Age verification (`/verify`, step 1 of 3)

- Header shows step tags ("Step 1 of 3 · Verify", "2 · Interests", "3 · Meet"); Exit button.
- Left (desktop): H1 "Let us confirm you are 18 or older."; three reassurance lines (photo checked on device and never uploaded; only the result is stored; a failed check never enters the matching pool).
- Right card: "Quick age check" with "On-device" tag; camera preview in an oval guide; status chip "Hold still for a moment"; progress bar (e.g. 72%); result strip "Estimated age range: 18 and over"; primary "Continue" (enabled only on pass); fallback chips "Phone number code" and "ID document".
- States: camera permission denied, checking, passed, uncertain (route to fallback), failed (blocked with explanation).
- Prior to this step the user enters phone number and OTP (modal or inline step; not in mockups: design with the same card style).

### 7.3 Onboarding / interests (`/onboarding`, step 2 of 3)

- H1 "What are you into?"; interest chips (Jazz, Night walks, Street food, Startups, Football, Film, Travel, Anime, Cooking, Gaming, Fitness, Books, Photography, Stand-up comedy, Language practice, Design) with counter "6 selected"; minimum 3, maximum 12.
- Mood: four selectable cards (Chill, Curious, Debate, Play a game), single choice.
- Languages: chips (English, Hindi, Spanish, Japanese, French), multi-select, at least 1.
- Side card (desktop) / bottom card (mobile): live estimate "2,184 people online match your vibe right now. Typical wait about 3 seconds." (from `/api/matching/estimate`); switches: Blur my first 15 seconds (default on, locked on for new accounts), Avatar first, camera by consent, Live captions; primary "Enter the lobby".

### 7.4 Lobby (`/lobby`)

- Centre: animated orb with three pulse rings; H1 "Ready when you are, {firstName}."; sub-line with live match count; interest tags; primary large "Start meeting" (58 px high on mobile).
- Device card: tiny self-preview, "Camera and mic ready", "Blur first 15 s on", "Edit" (to /onboarding). Handle permission errors here.
- "Rooms tonight" list (e.g. Speak Spanish night 8:30 PM 126 joined; Startup pitch roulette 9:00 PM 84 joined) with "Join" buttons (v1; render disabled with "Soon" in MVP).

### 7.5 Match found (`/match`)

- Tag "Match found · 00:04" and H1 "Found someone who likes Jazz and Night walks."
- Large blurred partner tile (name tag "Mei, 24 · Tokyo", tag "Blur first 15 s"), small self PiP bottom-right.
- Card: "You both like" tags; ICEBREAKER text; tags "Verified 18+", "Trust: Gold".
- Buttons: primary "Join the call" (to /call/:id), ghost "Find someone else" (requeue). Footer tags show active filters (Anywhere, English/Hindi, Chill).
- Auto-join after 5 seconds unless the user taps "Find someone else".

### 7.6 Live call (`/call/:sessionId`)

- Full-bleed remote video (blurred for the first 15 s, then animated unblur 600 ms); self PiP top-right (96x128 mobile, 200x150 desktop, draggable).
- Top-left card: partner name/age/city, tags 18+ and trust tier, elapsed timer (tabular numbers). Below it: "AI safety on" tag with live dot.
- Flag button (report) at left edge under the safety tag.
- Caption box (if captions on): "Mei, translated from Japanese" plus latest line. Icebreaker box: "ICEBREAKER: What is the first song you ever bought?" (rotates on request).
- Activity chips row (horizontal scroll): Would you rather, Co-draw, Trivia duel, Co-watch (v1; MVP shows "Would you rather" only).
- Floating control bar (pill, overlay white): mute, camera off, **Next** (primary), chat, **End** (danger). Keyboard: M mute, V video, N next, Esc end.
- At 3:00 show a gentle toast: "Enjoying this? Keep in touch or play a game."
- States: connecting, reconnecting (banner), partner left (auto to After-call), cut by moderation (modal explaining why, then lobby).

### 7.7 Report (modal on desktop, bottom sheet on mobile)

- Title "Report {name}"; sub "The call has ended for both of you." (reporting immediately ends the session).
- Radio list: Nudity or sexual content; Harassment or hate; Seems under 18; Spam or scam; Something else. Optional details textarea; checkbox "Also block {name}" (default on).
- Info strip: "A short clip is kept for review and deleted after 24 hours unless action is needed." Buttons: danger "Submit report", ghost "Cancel".
- On submit: API call, evidence snapshot saved, session ended, go to After-call with a confirmation toast.

### 7.8 After-call (`/after/:sessionId`)

- Header block: partner avatar, tag "Call ended · 07:42", H1 "That was a good one.", name and city, shared interest tags.
- Vibe check: three big buttons Great / Okay / Not for me (one-tap, stored as `vibe_checks`).
- "Say something kind" optional chips: Kind, Funny, Great listener, Thoughtful.
- Mutual-save banner: "Mei also wants to keep in touch." appears only when the partner has already tapped keep. Buttons: primary "Keep in touch", ghost "Next person", ghost "Back to lobby".
- Side cards (desktop): Streak (12 days), Trust level (Gold, progress bar, "320 points to Platinum"), Tonight so far (conversations 4, time chatting 31 min, new connections 1).

### 7.9 Connections and chat (`/connections`)

- **Desktop split view:** left list (search + people with last message, online dot, unread badge), centre chat (header with Video call button, grouped messages, composer), right profile card (avatar, "Mei, 24", Tokyo, languages, tags, "You both like", Block and Report).
- **Mobile:** list page, then full-screen chat page (back button, avatar, online state, video-call icon); floating composer pill at bottom.
- Messages: own bubbles cream, partner bubbles white with line border; "Today" divider; shared-interest system card. Real-time via Socket.IO; delivered/read states; text only in MVP; link and image sharing later with scanning.

### 7.10 Profile and settings (`/profile`)

- Header card: avatar with initials, name "Arjun K.", city/languages, tags (Verified 18+, Trust: Gold, 12-day streak), "Edit profile".
- Interests tags (editable). Privacy and safety switches: Blur my first 15 seconds, Avatar first (camera by consent), Live captions, Translate to English (Plus); "Blocked people" (3) with Manage.
- Talkdrop Plus card: price (e.g. 399 INR per month), HD video, region and language filters, live translation, priority matching, "Upgrade".
- Desktop left sub-nav: Profile, Privacy and safety, Verification, Notifications, Talkdrop Plus, Sign out. Mobile: sections stacked + Sign out button.

### 7.11 Admin console (`/admin`, desktop-first)

- Left sidebar: Overview, Live sessions, Moderation queue, Policies, Members and SSO, Audit log, Branding, API and webhooks (MVP builds Overview, Moderation queue, Audit log; others are stubs with "Coming in v2").
- Header: tenant name ("Northfield University · Language Exchange"), status tag "All systems normal", "Export report" (CSV).
- KPI cards: Active now 1,284; Calls today 18,402; Average call length 6:42; Reports per 1,000 calls 1.8.
- Bar chart "Calls per hour today" (10 bars, peak highlighted charcoal). "Active policy" card (age band 18 to 25, regions, moderation Strict, camera blur first, SAML on) with Edit policy.
- Moderation queue table: Case, Category, Severity, Waiting, Status; actions: open case (evidence viewer with blurred preview by default), warn, suspend, ban, escalate, dismiss.
- Audit log: append-only list (action, actor, timestamp).

### 7.12 Dummy data / seed (use in dev and for Storybook-style fixtures)

    Current user: Arjun K., Delhi India, languages English+Hindi, interests Jazz, Night walks, Street food, Startups, Football, Film, trust Gold, streak 12 days
    Partners: Mei (24, Tokyo, Japanese+English), Lucia (Madrid, 2 unread: "See you at Spanish night!"), Kofi ("That match was wild"),
              Priya ("Send me the film list"), Tomas ("Lisbon in March?")
    Chat: Mei: "Great talking to you earlier! Still thinking about that jazz bar." / me: "Same here. Which album should I start with?" /
          Mei: "Kind of Blue is the classic. For something newer, try Kamasi Washington." / me: "Perfect, adding both to my night walk playlist." /
          Mei: "I will share my favourite spots in Tokyo too."
    Icebreakers: "What song have you replayed all week?", "What is the first song you ever bought?", "Would you rather ..." (seed 100)
    Rooms: Speak Spanish night 20:30 (126), Startup pitch roulette 21:00 (84), Lo-fi listening room (open, 312)
    Admin: tenant Northfield University; queue #48213 Harassment High 4 min In review; #48207 Nudity (auto-cut) High 9 min; #48190 Spam Low 21 min; #48177 Seems under 18 High 32 min Escalated
    Audit: "Policy updated: moderation set to Strict" Priya S. 10:42; "User banned: case #48170" Reviewer 07 10:15; "SSO certificate rotated" Admin yesterday

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

# 18. Assumptions, open decisions and risks

| Item                    | Default taken in this spec                       | Needs owner decision                        |
|-------------------------|--------------------------------------------------|---------------------------------------------|
| Brand name              | Talkdrop (working)                               | Final name and domain                       |
| Auth                    | Phone OTP only for users                         | Add email / social sign-in?                 |
| Age verification vendor | On-device estimate + mock; document vendor later | Pick vendor per market                      |
| Moderation vendors      | Provider adapters, mock in dev                   | Pick image, speech and text vendors; budget |
| Payments                | Stripe/Razorpay adapter stub for Plus            | Launch markets and currency                 |
| Hosting                 | Docker Compose in dev; Kubernetes later          | Cloud provider and regions                  |
| Native mobile apps      | Out of scope (web only, responsive)              | Later via React Native or PWA               |

<div class="rule">

**Key risks:** (1) The MVP client-side moderation tap can be bypassed; the server-side tap in Phase 6 is mandatory before any public launch. (2) Child-safety, CSAM reporting and age-assurance rules differ by country (for example EU DSA, UK Online Safety Act, US reporting duties): get legal counsel and a trust-and-safety lead before launch. (3) TURN and SFU egress are the main cost lines; keep 540p default and monitor. (4) An empty lobby kills retention: seed with scheduled hosted rooms and bot-hosted waiting games in new markets.

</div>

# Appendix A. Design token and component CSS (copy to packages/ui/tokens.css)

This is the exact stylesheet used by all mockups (Ink wash theme). Port it into Tailwind theme variables and React components; class names map to the component inventory in Section 4.4.

    :root{--white:#FFFFFF;--cream:#FFFFE3;--grey:#CBCBCB;--slate:#6D8196;--charcoal:#4A4A4A;--blush:#CBCBCB;--mint:#FFFFE3;--rose:#CBCBCB;--deep:#4A4A4A;--ok:#4A4A4A;--ink:#262626;--mute:#4A4A4A;--card:#FFFFFF;--line:rgba(74,74,74,.28);--overlay:rgba(255,255,255,.86);--alert:#A33A3A}
    *,*::before,*::after{box-sizing:border-box}
    html,body{margin:0;background:#FFFFFF}
    a{color:inherit;text-decoration:none}
    button,input,textarea{font:inherit;color:inherit}
    .app{position:relative;overflow:hidden;width:100%;color:var(--ink);font-family:'DM Sans',system-ui,sans-serif;font-size:16px;line-height:1.5;background:var(--white)}
    .disp{font-family:'Bricolage Grotesque','DM Sans',system-ui,sans-serif;letter-spacing:-.03em;line-height:1.04;font-weight:700;margin:0}
    .mute{color:var(--mute)}
    .card{background:var(--card);border:1px solid var(--line);border-radius:24px}
    .card.blush{background:var(--cream)}
    .card.mint{background:var(--cream)}
    .card.rose{background:var(--grey)}
    .card.white{background:var(--white)}
    .btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:48px;padding:0 26px;border-radius:999px;border:1px solid var(--charcoal);background:var(--charcoal);color:var(--cream);font-weight:700;font-size:16px;cursor:pointer;box-shadow:0 6px 18px rgba(74,74,74,.22);white-space:nowrap}
    .btn.ghost{background:var(--white);color:var(--ink);border:1px solid var(--line);box-shadow:none}
    .btn.sm{min-height:44px;padding:0 20px;font-size:15px}
    .btn.danger{background:var(--alert);border-color:var(--alert);color:#FFFFFF;box-shadow:none}
    .chip{display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:0 18px;border-radius:999px;border:1px solid var(--line);background:var(--white);cursor:pointer;font-weight:500;font-size:15px}
    .chip.on{background:var(--cream);border-color:var(--charcoal);font-weight:700}
    .tag{display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;font-size:13px;font-weight:600;background:var(--white);border:1px solid var(--line);white-space:nowrap}
    .tag.mint{background:var(--cream);color:var(--charcoal);border-color:rgba(109,129,150,.7)}
    .tag.rose{background:var(--grey);border-color:rgba(74,74,74,.35)}
    .tag.deep{background:var(--white);color:var(--charcoal);border-color:var(--slate)}
    .logo{display:inline-flex;align-items:center;gap:10px;font-family:'Bricolage Grotesque','DM Sans',sans-serif;font-weight:800;font-size:22px;letter-spacing:-.03em}
    .logo i{display:block;width:26px;height:26px;border-radius:50%;background:conic-gradient(from 200deg,#6D8196,#CBCBCB,#FFFFE3,#6D8196);border:2px solid var(--charcoal)}
    .navlink{display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:999px;color:var(--mute);font-weight:600;font-size:15px}
    .navlink.on{background:var(--slate);color:#FFFFFF}
    .ava{display:inline-flex;align-items:center;justify-content:center;border-radius:50%;font-weight:700;color:var(--ink);flex:none;font-family:'Bricolage Grotesque','DM Sans',sans-serif}
    .ic{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;flex:none}
    .live{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--slate);flex:none}
    .vid{position:relative;overflow:hidden;border-radius:28px;background:linear-gradient(160deg,var(--g1,#6D8196),var(--g2,#CBCBCB))}
    .vid::before{content:"";position:absolute;left:50%;top:24%;width:22%;aspect-ratio:1;transform:translateX(-50%);border-radius:50%;background:var(--sk,rgba(255,255,227,.92))}
    .vid::after{content:"";position:absolute;left:50%;top:50%;width:54%;height:80%;transform:translateX(-50%);border-radius:50% 50% 0 0;background:var(--sh,rgba(74,74,74,.35))}
    .vid>*{z-index:2}
    .in{width:100%;min-height:48px;border-radius:14px;border:1px solid var(--line);background:var(--white);padding:0 16px;outline:none}
    .in:focus{border-color:var(--slate)}
    .sw{position:relative;display:inline-block;width:46px;height:28px;flex:none}
    .sw input{-webkit-appearance:none;appearance:none;position:absolute;inset:0;margin:0;border-radius:999px;background:var(--grey);cursor:pointer}
    .sw input:checked{background:var(--slate)}
    .sw input::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#FFFFFF}
    .sw input:checked::after{left:21px}
    .orb{position:relative;border-radius:50%;background:conic-gradient(from 210deg,#6D8196,#CBCBCB,#FFFFE3,#6D8196);border:3px solid var(--white);box-shadow:0 0 0 2px var(--charcoal),0 24px 60px rgba(109,129,150,.5)}
    .pulse{position:absolute;inset:0;border-radius:50%;border:2px solid rgba(109,129,150,.6);animation:ring 3s ease-out infinite}
    .pulse.b{animation-delay:1s}
    .pulse.c{animation-delay:2s}
    @keyframes ring{0%{transform:scale(.7);opacity:.8}100%{transform:scale(1.8);opacity:0}}
    @media (prefers-reduced-motion:reduce){.pulse{animation:none;opacity:.35}}
    .bar{height:8px;border-radius:99px;background:var(--grey);overflow:hidden}
    .bar>i{display:block;height:100%;border-radius:99px;background:var(--slate)}
    .hr{height:1px;background:var(--line);border:0;margin:0}

# Appendix B. Mockup index (design reference)

The Talkdrop mockups are a canvas with 12 desktop artboards (1440 px) and 11 mobile artboards (390 px). Export each as PNG into `docs/design/` with these names so Cursor and the visual tests can reference them.

| File                                              | Screen               | Route        |
|---------------------------------------------------|----------------------|--------------|
| d-landing.png / m-landing.png                     | Landing              | /            |
| d-verify.png / m-verify.png                       | Age verification     | /verify      |
| d-interests.png / m-interests.png                 | Interests and mood   | /onboarding  |
| d-lobby.png / m-lobby.png                         | Lobby                | /lobby       |
| d-matching.png / m-matching.png                   | Match found          | /match       |
| d-call.png / m-call.png                           | Live call            | /call/:id    |
| d-report.png / m-report.png                       | Report               | report modal |
| d-after.png / m-after.png                         | After-call           | /after/:id   |
| d-connections.png / m-connections.png, m-chat.png | Connections and chat | /connections |
| d-profile.png / m-profile.png                     | Profile and settings | /profile     |
| d-admin.png                                       | Admin console        | /admin       |

Prototype flow in the mockups: Landing, Verify, Interests, Lobby, Match, Call (Report, Chat, End), After-call, Connections, Chat; the tab bar links Meet, Connections, Profile.
