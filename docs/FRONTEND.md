# Talkdrop: Frontend (React) Build Guide

Everything needed to build apps/web and packages/ui. Backend contracts (REST and Socket.IO events) are in BACKEND.md and SPEC.md sections 9 and 10.

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
| Age/identity                      | Yes/No 18+ self-attestation modal after sign-in; durable server consent flag                                                                                                                                                   | Declined → blocked matching message; see `docs/AGE_VERIFICATION.md`.                                                                               |
| Tooling                           | pnpm workspaces, ESLint, Prettier, Vitest, Supertest, Playwright, Docker Compose, GitHub Actions                                                                                                                               |                                                                                                                                                    |


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


# 6. Information architecture and routes

| Route                              | Screen                                                                    | Auth                | Next screens                               |
|------------------------------------|---------------------------------------------------------------------------|---------------------|--------------------------------------------|
| `/`                                | Landing                                                                   | public              | /verify, /admin                            |
| `/verify`                          | Age verification (step 1 of 3)                                            | signed in (Google)  | /onboarding                                |
| `/onboarding`                      | Interests, mood, languages, safety toggles (step 2 of 3)                  | verified            | /lobby                                     |
| `/lobby`                           | Lobby (step 3)                                                            | verified            | /match, /onboarding (edit), /profile       |
| `/match`                           | Match found (blurred preview + icebreaker)                                | verified            | /call/:id                                  |
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
- **Sections:** How it works (3 cards: Verify once, Pick your vibe, Say hello); Safety (4 points + "Live session check" card); **Vibe rooms** (3 preview cards with energy tags — Open now / Filling up / Always on — not clock times); For teams and communities (CTA "Talk to sales"); footer links (18+ only, Community rules, Privacy centre, Transparency report, Contact).
- **Mobile:** single column; hero CTAs full width (54 px high).

### 7.2 Age verification (`/verify`, step 1 of 3)

- Header shows step tags ("Step 1 of 3 · Confirm 18+", "2 · Interests", "3 · Meet"); Exit button.
- **Google is the only primary path** on first visit (large "Continue with Google" CTA). Dev mock Google may appear in local/dev builds.
- Email/password lives under a collapsed **Other options** disclosure — not shown side-by-side with Google by default. No phone OTP.
- After sign-in, a **modal only**: "Are you 18 or older?" with **Yes** / **No** (no camera age estimate, no document/ID path, no phone age fallback).
- Yes → record consent server-side, continue to onboarding / lobby.
- No → blocked matching message; consent persisted so refresh does not re-prompt as the primary popup.
- See `docs/AGE_VERIFICATION.md`.

### 7.3 Onboarding / interests (`/onboarding`, step 2 of 3)

- H1 "What are you into?"; interest chips (Jazz, Night walks, Street food, Startups, Football, Film, Travel, Anime, Cooking, Gaming, Fitness, Books, Photography, Stand-up comedy, Language practice, Design) with counter "6 selected"; minimum 3, maximum 12.
- Mood: four selectable cards (Chill, Curious, Debate, Play a game), single choice.
- Languages: chips (English, Hindi, Spanish, Japanese, French), multi-select, at least 1.
- Side card (desktop) / bottom card (mobile): live estimate "2,184 people online match your vibe right now. Typical wait about 3 seconds." (from `/api/matching/estimate`); switches: Blur my first 15 seconds (default on, locked on for new accounts), Avatar first, camera by consent, Live captions; primary "Enter the lobby".

### 7.4 Lobby (`/lobby`)

- Centre: animated orb with three pulse rings; H1 "Ready when you are, {firstName}."; sub-line with live match count; interest tags; primary large "Start hanging out" (58 px high on mobile).
- Device card: tiny self-preview, "Camera and mic ready", "Blur first 15 s on", "Tweak vibe" (to /onboarding). Handle permission errors here.
- **Vibe rooms** card (not a clock schedule): section title "Vibe rooms" + Preview tag; one-liner "Shared energy, no schedule…". Each row shows a playful name (e.g. Español soft start, Wild pitch roulette, Lo-fi couch), vibe chip, energy chip (**Open now** / **Filling up** / **Warming up** / **Always on** — never hard clock times), short blurb, live-ish people count, and a ready-feeling **Join** (MVP may still be scaffolding/preview).

### 7.5 Match found (`/match`)

- Tag "Match found · 00:04" and H1 "Found someone who likes Jazz and Night walks."
- Large blurred partner tile (name tag "Mei, 24 · Tokyo", tag "Blur first 15 s"), small self PiP bottom-right.
- Card: "You both like" tags; ICEBREAKER text; tags "Verified 18+", "Trust: Gold".
- **Single primary action: Join** (to /call/:id). Do **not** show "Find someone else" on this screen — skipping/requeue belongs to **Next** on the live call.
- Optional auto-join after ~5 seconds so Join remains the obvious action without a competing CTA. Footer tags show active filters (Anywhere, English/Hindi, Chill).

### 7.6 Live call (`/call/:sessionId`)

- Full-bleed remote video (blurred for the first 15 s, then animated unblur 600 ms); self PiP top-right (96x128 mobile, 200x150 desktop, draggable).
- Top-left card: partner name/age/city, tags 18+ and trust tier, elapsed timer (tabular numbers). Below it: "AI safety on" tag with live dot.
- Flag button (report) at left edge under the safety tag.
- Caption box (if captions on): "Mei, translated from Japanese" plus latest line. Icebreaker box: "ICEBREAKER: What is the first song you ever bought?" (rotates on request).
- Activity chips row (horizontal scroll): Would you rather, Co-draw, Trivia duel, Co-watch (v1; MVP shows "Would you rather" only).
- Floating control bar (pill, overlay white): mute, camera off, **Next** (primary — ends session and requeues), chat, **End** (danger). Keyboard: M mute, V video, N next, Esc end.
- At 3:00 show a gentle toast: "Enjoying this? Keep in touch or play a game."
- States: connecting, reconnecting (banner), partner left (auto to After-call), cut by moderation (modal explaining why, then lobby).

### 7.7 Report (modal on desktop, bottom sheet on mobile)

- Title "Report {name}"; sub "The call has ended for both of you." (reporting immediately ends the session).
- Radio list: Nudity or sexual content; Harassment or hate; Seems under 18; Spam or scam; Something else. Optional details textarea; checkbox "Also block {name}" (default on).
- Info strip: "A short clip is kept for review and deleted after 24 hours unless action is needed." Buttons: danger "Submit report", ghost "Cancel".
- On submit: API call, evidence snapshot saved, session ended, go to After-call with a confirmation toast.

### 7.8 After-call (`/after/:sessionId`)

- Header block: partner avatar, tag "Call ended · 07:42", H1 "Nice hang. Want another?", name and city, shared interest tags.
- **Primary path:** one-tap **Keep** (keep in touch) and **Next** (next person / lobby). Low-emphasis "Back to lobby" link for navigation if needed.
- Mutual-save banner: "{name} also wants to keep in touch." when the partner already tapped keep.
- Vibe check (Great / Okay / Not for me) and compliment chips ("Say something kind") are **optional** — hidden by default behind a "Rate this chat" disclosure (APIs remain). Do not force them on the primary path.
- Side cards (desktop): Streak, Trust level, Tonight so far.

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
    Rooms (Vibe rooms — energy, not clock times): Español soft start · Open now (126); Wild pitch roulette · Filling up (84); Lo-fi couch · Always on (312)
    Admin: tenant Northfield University; queue #48213 Harassment High 4 min In review; #48207 Nudity (auto-cut) High 9 min; #48190 Spam Low 21 min; #48177 Seems under 18 High 32 min Escalated
    Audit: "Policy updated: moderation set to Strict" Priya S. 10:42; "User banned: case #48170" Reviewer 07 10:15; "SSO certificate rotated" Admin yesterday


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

# 15. Phased build plan for Cursor

| Phase                           | Deliverables                                                                                                                                                                                                                         | Done when                                                                                                                   |
|---------------------------------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------|
| **0 Foundation**                | Monorepo, tooling, Docker Compose (postgres, redis, minio, livekit, coturn, mailhog), CI, Prisma schema + migrations + seed, shared package, UI tokens + base components (Section 4.4), Storybook (optional)                         | `pnpm dev` starts everything; migrations + seed run; CI green                                                               |
| **1 Identity and onboarding**   | Google-primary auth (email under Other options), refresh rotation, route guards; Yes/No 18+ consent modal; onboarding (interests, mood, languages, toggles); profile and settings; landing page                                    | New user can sign up, confirm 18+, pick interests and reach the lobby; all screens match mockups on desktop and mobile      |
| **2 Matching and calls**        | Socket gateway, Redis pool, matcher worker, session lifecycle, LiveKit tokens + webhooks, lobby, match-found, live call UI (controls, PiP, timer, blur-first, icebreakers, captions placeholder), next/end flows, reconnect handling | Two browsers get matched and see each other; Next requeues; concurrency test passes; p95 match under 2 s in load test       |
| **3 Safety v1**                 | Report and block flows, evidence service, moderation queue API, gate checks, client-frame moderation endpoint with provider adapter, cut flow + modal, enforcement ladder, appeals, rate limits and abuse defences                   | Reporting ends a call, creates a case with evidence; a flagged frame (mock) cuts the call in under 2 s; bans block re-entry |
| **4 Social**                    | After-call (Keep / Next primary; optional vibe + compliments), connections list, chat (real-time, unread, presence), call a connection, trust score and streak jobs                                                                  | Mutual keep creates a connection; chat works across two browsers; trust tier updates                                        |
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

