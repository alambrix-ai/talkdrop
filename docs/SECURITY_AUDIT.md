# Talkdrop security audit & hardening

Critical / High / Medium findings fixed in code (billing mock unchanged).

## Fixed

| Sev | Issue | Fix |
|-----|-------|-----|
| Critical | Unsigned LiveKit / billing webhooks | `INTERNAL_WEBHOOK_SECRET` + `X-Talkdrop-Webhook-Secret` |
| Critical | `peerLivekit` returned to caller (SFU impersonation) | Caller token only; peer uses `GET /sessions/:id` |
| Critical | Age fallback client self-pass | Fallbacks retired (410); age gate is Yes/No self-attestation only |
| Crit/High | Socket session join IDOR | `assertParticipant` on session-scoped events |
| High | Plaintext phones | `phoneHash` + AES-GCM `phoneE164` |
| High | Access JWT in `localStorage` | Memory-only + httpOnly refresh bootstrap |
| High | Incomplete GDPR delete | Wipe OTPs, devices, verifications, vibe checks, geo PII; retain reports/enforcements under legal hold |
| Medium | Admin routes | `authenticateAdmin` |
| Medium | OTP compare / SMS logs / CSP / rate limits / MIME allowlist / handshake ban / cookie Origin / appeals ownership / prod secret + mock gates | Implemented |
| Medium | OTP `devCode` in JSON | Only `development`/`test` (or `OTP_RETURN_DEV_CODE`); never production |

Argon2 helpers: `apps/api/src/lib/passwords.ts` (OTP remains sha256; no end-user passwords).

## Residual risks

1. **SFU ≠ classic E2EE** — trusted SFU + server mod tap can observe media.
2. LiveKit webhook = shared secret today (not full LiveKit JWT verify).
3. Stripe/Razorpay signatures when billing leaves mock.
4. 18+ gate is self-attestation (Yes/No) — not biometric proof; under-18 reports + moderation remain the escalation path.
5. Secrets → secret manager; SPA CSP for LiveKit origins; disposable-number blocklist; refresh reuse families.

See also `docs/SECURITY_REVIEW.md` and README **Security**.
