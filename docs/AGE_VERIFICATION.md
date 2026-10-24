# Age verification

Talkdrop verifies age **before** a user can enter the matching pool (SPEC §7.2 / §13.4).

## On-device estimate (default)

1. The web client captures a brief camera frame **locally**.
2. An on-device estimator returns `{ estimatedAge, confidence, liveness }`.
3. Only that result is POSTed to `POST /api/v1/verification/age` — **no face image is uploaded**.
4. Server thresholds (`AGE_PROVIDER=ondevice` or `mock`):
   - **passed** — estimate ≥ 21, confidence ≥ 0.8, liveness true
   - **uncertain** — estimate ≥ 18 with lower confidence → route to fallback
   - **failed** — under 18 or no liveness → blocked from matching

## Document-check fallback (stub)

`POST /api/v1/verification/fallback/start` with `{ method: "document" }` returns a
`redirectUrl` from `AgeVerificationProvider.startDocumentCheck`.

Set `AGE_DOCUMENT_REDIRECT_URL` to your vendor’s hosted flow (Persona, Veriff, Yoti, …).
Talkdrop does **not** ship paid vendor credentials. Until configured, the stub redirects
to `https://example.com/age-document-check?user=…`.

Complete the loop with `POST /api/v1/verification/fallback/complete` once the vendor
callback confirms the check.

## Env

| Variable | Purpose |
|----------|---------|
| `AGE_PROVIDER` | `ondevice` (default) \| `mock` |
| `AGE_DOCUMENT_REDIRECT_URL` | Vendor document-check start URL |
| `WEB_ORIGIN` | Return URL query param for vendor redirect |
