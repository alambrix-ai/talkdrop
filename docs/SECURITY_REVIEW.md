# Talkdrop Phase 6 — security review checklist

Working checklist for launch prep (SPEC §14 / §15 Phase 6). Mark owners before public launch.

## Auth & sessions
- [x] Phone OTP only for end users; refresh cookie httpOnly + SameSite=Lax
- [x] Access JWT short-lived; refresh rotation on `/auth/refresh`
- [ ] Production secrets via secret manager (not `.env`)
- [ ] Disposable-number blocklist + bot detection hook

## Transport & headers
- [x] Helmet + CORS allowlist in API
- [ ] TLS termination at edge; Secure cookies in production
- [ ] CSP tightened for LiveKit/WebRTC origins

## Media & moderation
- [x] Client frame samples signed/authenticated endpoint
- [x] **Server-side LiveKit moderation tap** (mock hidden-subscriber in `LIVEKIT_MOCK`)
- [x] Evidence encrypted at rest with TTL
- [ ] Real LiveKit subscriber + vendor classifiers before public launch
- [ ] CSAM/underage path reviewed by T&S + counsel

## Data protection
- [x] `GET/DELETE /me/data` (GDPR/DPDP)
- [x] Phone hashed + field encryption helpers
- [ ] DPIA / records of processing per launch market

## Abuse
- [x] Rate limits on OTP, reports, messages (in-process)
- [x] Block + enforcement ladder
- [ ] OWASP ZAP baseline in CI

## Billing
- [x] Mock checkout/webhook in dev (`BILLING_PROVIDER=mock`)
- [ ] Stripe/Razorpay signature verification in production

## Residual risks (SPEC §18)
1. Client-only moderation is insufficient — server tap required before public launch.
2. Age/CSAM rules vary by market — legal + T&S sign-off required.
3. TURN/SFU cost — monitor 540p default.
4. Empty lobby — seed rooms + bot waiting games.
