# Talkdrop Phase 6 — security review checklist

Working checklist for launch prep (SPEC §14 / §15 Phase 6). Full findings + remediations: [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md).

## Auth & sessions
- [x] Sign in with Google (OIDC) primary + email/password secondary; refresh cookie httpOnly + SameSite (Strict in prod); phone OTP sign-in retired
- [x] Access JWT short-lived (memory-only on web); refresh rotation on `/auth/refresh`
- [x] OTP hashed (sha256) + timing-safe compare; phones hashed + encrypted at rest
- [x] Origin check on cookie refresh/logout
- [ ] Production secrets via secret manager (not `.env`)
- [ ] Disposable-number blocklist + bot detection hook (prefix stub only)
- [ ] Admin email+password + TOTP when SSO not used (argon2 helpers ready)

## Transport & headers
- [x] Helmet + CSP (`default-src 'none'` on API) + CORS allowlist (prod = `WEB_ORIGIN`)
- [x] Secure cookies in production
- [ ] SPA CSP tightened for LiveKit/WebRTC origins

## Media & moderation
- [x] Client frame samples authenticated endpoint + MIME allowlist
- [x] **Server-side LiveKit moderation tap** (mock hidden-subscriber in `LIVEKIT_MOCK`)
- [x] Evidence encrypted at rest with TTL (`FIELD_ENCRYPTION_KEY` from env)
- [ ] Real LiveKit subscriber + vendor classifiers before public launch
- [ ] LiveKit webhook → full provider signature verify (shared secret today)
- [ ] CSAM/underage path reviewed by T&S + counsel

## Data protection
- [x] `GET/DELETE /me/data` (GDPR/DPDP); delete wipes OTPs/devices/phoneHash
- [x] Phone hashed + field encryption
- [x] PII redaction in API logs (auth headers, phone, OTP)
- [ ] DPIA / records of processing per launch market

## Abuse
- [x] Rate limits on OTP, reports, messages (+ lower prod global cap)
- [x] Block + enforcement ladder
- [x] Socket auth on handshake + participant checks on session events (no IDOR join)
- [x] Admin routes gated by `authenticateAdmin`
- [ ] OWASP ZAP baseline in CI

## Billing
- [x] Mock checkout/webhook in dev (`BILLING_PROVIDER=mock`) + webhook secret required
- [ ] Stripe/Razorpay signature verification in production

## Residual risks (SPEC §18)
1. **SFU ≠ classic E2EE** — trusted SFU + server mod tap can observe media; do not claim E2EE.
2. Client-only moderation is insufficient — server tap required before public launch.
3. Age/CSAM rules vary by market — legal + T&S sign-off required.
4. TURN/SFU cost — monitor 540p default.
5. Empty lobby — seed rooms + bot waiting games.
