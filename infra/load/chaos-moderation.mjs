#!/usr/bin/env node
/**
 * Phase 6 chaos smoke: force a server-side moderation cut against a live session.
 *
 * Usage (API + worker + Redis + Postgres running, LIVEKIT_MOCK=true):
 *   MOD_FORCE_FLAG=1 node infra/load/chaos-moderation.mjs
 *
 * Or call with an existing sessionId:
 *   SESSION_ID=... ACCESS_TOKEN=... node infra/load/chaos-moderation.mjs
 */
const API = process.env.API_ORIGIN ?? 'http://localhost:4000';
const phone = `+155599${String(Date.now()).slice(-6)}`;

async function json(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  if (process.env.SESSION_ID && process.env.ACCESS_TOKEN) {
    console.log('[chaos] using provided session', process.env.SESSION_ID);
    console.log('[chaos] set MOD_FORCE_FLAG=1 on worker and wait for tap cycle (~2s)');
    return;
  }

  const req = await json('/api/v1/auth/otp/request', {
    method: 'POST',
    body: JSON.stringify({ phoneE164: phone }),
  });
  const verify = await json('/api/v1/auth/otp/verify', {
    method: 'POST',
    body: JSON.stringify({
      phoneE164: phone,
      code: req.devCode,
      displayName: 'Chaos User',
    }),
  });
  const token = verify.accessToken;
  const headers = { Authorization: `Bearer ${token}` };

  await json('/api/v1/verification/age', {
    method: 'POST',
    headers,
    body: JSON.stringify({ confirmed18Plus: true }),
  });
  await json('/api/v1/me', {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ languages: ['en'], defaultMood: 'chill', city: 'Chaos' }),
  });
  await json('/api/v1/me/interests', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ interestSlugs: ['jazz', 'film', 'travel', 'cooking'] }),
  });

  console.log('[chaos] user ready; create a live session via two-browser match, then:');
  console.log('  MOD_FORCE_FLAG=1  (on worker) → server tap should cut within ~2s');
  console.log('  ACCESS_TOKEN=' + token);
  console.log('[chaos] health', await json('/health'));
  console.log('[chaos] metrics snippet length', (await fetch(`${API}/metrics`)).status);
}

main().catch((err) => {
  console.error('[chaos] failed', err);
  process.exit(1);
});
