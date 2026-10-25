# Age verification (18+ consent)

Talkdrop gates matching with a **single Yes/No self-attestation** before a user can enter
the matching pool. There is **no** on-device camera age estimate, document-check vendor, or
multi-step age scoring.

## Flow

1. User signs in (Google or email/password — separate from this consent).
2. If they have not answered yet (`ageConsent: pending`), the web app shows a modal:
   **“Are you 18 or older?”** with **Yes** / **No**.
3. Client POSTs to `POST /api/v1/verification/age` with `{ "confirmed18Plus": true|false }`.
4. Server records a `verifications` row (`method: self_attestation`) and updates the user:
   - **Yes** — `age_verified = true`, `age_consent_at = now` → matching / gated surfaces unlock
   - **No** — `age_verified = false`, `age_consent_at = now` → matching stays locked with a clear message
5. Refresh does not re-ask while `age_consent_at` is set. Declined users see a blocked state
   (they can still confirm Yes later if they answered by mistake).

## API

| Method | Path | Body | Notes |
|--------|------|------|-------|
| POST | `/api/v1/verification/age` | `{ confirmed18Plus: boolean }` | Auth required |
| POST | `/api/v1/verification/fallback/*` | — | **410 Gone** — camera/document/phone age paths retired |

`GET /api/v1/me` includes `ageVerified` and `ageConsent`: `pending` \| `accepted` \| `declined`.

## What we do **not** do

- On-device face age estimation / TensorFlow.js camera flow
- Document-check redirect vendors (`AGE_DOCUMENT_REDIRECT_URL` removed)
- Phone OTP as an age fallback (phone OTP for sign-in remains retired separately)
- Pass / uncertain / failed thresholds based on a face estimate

## Env

No age-provider env vars. Google OAuth and other auth settings are unchanged.

## Safety elsewhere

Report, block, live moderation, and under-18 report escalation stay as documented in SPEC /
SECURITY. This consent gate does not replace those controls.
