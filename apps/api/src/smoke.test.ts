import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig, resetConfigCache } from './config.js';
import { buildApp } from './app.js';
import type { FastifyInstance } from 'fastify';

describe('API smoke', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetConfigCache();
    process.env.NODE_ENV = 'test';
    const config = loadConfig();
    const built = await buildApp(config);
    app = built.app;
  }, 30_000);

  afterAll(async () => {
    await app.close();
  });

  it('health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });

  it('public stats', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/public/stats' });
    expect(res.statusCode).toBe(200);
    expect(res.json().languages).toBe(41);
  });

  it('otp sign-in → age verify → me', async () => {
    const phone = `+1555010${String(Date.now()).slice(-4)}`;
    const req = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      payload: { phoneE164: phone },
    });
    expect(req.statusCode).toBe(200);
    const { devCode } = req.json() as { devCode: string };

    const verify = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/verify',
      payload: { phoneE164: phone, code: devCode, displayName: 'Smoke Test' },
    });
    expect(verify.statusCode).toBe(200);
    const { accessToken } = verify.json() as { accessToken: string };
    expect(accessToken).toBeTruthy();

    const age = await app.inject({
      method: 'POST',
      url: '/api/v1/verification/age',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { estimatedAge: 25, confidence: 0.95, liveness: true },
    });
    expect(age.statusCode).toBe(200);
    expect(age.json().result).toBe('passed');

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().ageVerified).toBe(true);
  });
});
