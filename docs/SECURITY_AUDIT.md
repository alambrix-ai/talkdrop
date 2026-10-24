# Talkdrop security audit & hardening

Branch work targeting Critical / High / Medium findings. Prefer **fixes in code** over checklist-only items. Billing remains mock; webhook auth still required.

## Threat model (media)

Talkdrop uses a **LiveKit SFU** with a **server-side moderation tap**. This is **transport security + a trusted SFU**, **not classic end-to-end encryption**:

- Media frames can be observed by the SFU operator and by Talkdrop’s hidden subscriber for safety.
- Client-only E2EE that blocks server moderation is **out of scope** for public launch (SPEC residual risk).
- Evidence blobs are AES-256-GCM encrypted at rest (`FIELD_ENCRYPTION_KEY`); raw A/V is not archived.

## Findings → remediations

| Sev | Finding | Status | Fix |
|-----|---------|--------|-----|
| Critical | Unsigned LiveKit webhook could end/live sessions | **Fixed** | `INTERNAL_WEBHOOK_SECRET` + `X-Talkdrop-Webhook-Secret` |
| Critical | Unsigned billing webhook could flip Plus | **Fixed** | Same shared secret (mock billing unchanged) |
| Critical/High | Socket `MATCH_ACCEPT` / activities join session room without participant check (IDOR) | **Fixed** | `assertParticipant` on all session-scoped socket events |
| High | Phones stored plaintext | **Fixed** | `phoneHash` + AES-GCM `phoneE164`; OTP rows keyed by hash |
| High | Access JWT in `localStorage` (XSS) | **Fixed** | In-memory access token + httpOnly refresh cookie bootstrap |
| Medium | Admin routes only `authenticate` | **Fixed** | `authenticateAdmin` preHandler + service RBAC |
| Medium | OTP compare not timing-safe | **Fixed** | `safeEqual` on sha256 hashes |
| Medium | Helmet CSP disabled | **Fixed** | Restrictive API CSP (`default-src 'none'`) |
| Medium | Global rate limit too loose for OTP/reports | **Fixed** | Route limits: OTP 5/10/min, reports 10/min, messages 60/min; prod global 120/min |
| Medium | Mock SMS logged phone + OTP | **Fixed** | Masked phone; never log OTP |
| Medium | Socket handshake no banned/suspended check | **Fixed** | DB status check after JWT |
| Medium | Weak prod secrets / placeholders | **Fixed** | Min length 32; production rejects `change-me` / known weak values; requires webhook secret |
| Medium | Privacy delete left OTPs/devices | **Fixed** | Wipe devices + OTPs + phoneHash |
| Medium | Multipart no content-type allowlist | **Fixed** | Frame/audio MIME allowlists on upload routes |
| Medium | Cookie refresh CSRF | **Fixed** | Origin/Referer check vs `WEB_ORIGIN`; `SameSite=Strict` + `Secure` in production |
| — | Passwords / argon2 | **N/A product** | End users are OTP-only; `lib/passwords.ts` argon2id helpers ready for admin email+password |

## Already solid (verified)

- Refresh token rotation + hashed storage
- OTP stored as sha256 (now compared with `safeEqual`)
- REST session/connection participant checks
- Evidence AES-GCM + TTL
- CORS allowlist (production locked to `WEB_ORIGIN`)
- Helmet (now with CSP)
- GDPR export/delete endpoints

## Residual risks (accepted / deferred)

1. **SFU ≠ E2EE** — platform and SFU can access media; document for users/T&S.
2. **LiveKit webhook** uses shared secret, not full LiveKit JWT signature verify — upgrade when wiring production LiveKit webhooks.
3. **Stripe/Razorpay** signature verification still needed when billing leaves mock.
4. **Secrets** should live in a secret manager in production (not `.env` on disk).
5. **Web CSP** for LiveKit/WebRTC origins still needs tightening on the SPA host (API CSP is strict; SPA is separate).
6. **Disposable-number / bot** detection is prefix-stub only.
7. **Refresh reuse detection** (family revocation) not fully implemented beyond rotate-on-use.
8. **Age/CSAM** market rules need legal + T&S sign-off before public launch.

## Safe defaults

See root `.env.example` and README **Security** section. Never commit real secrets. Set `INTERNAL_WEBHOOK_SECRET` even in local Compose so webhook paths match production shape.
