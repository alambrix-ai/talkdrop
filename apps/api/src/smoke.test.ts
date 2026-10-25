import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig, resetConfigCache } from './config.js';
import { buildApp } from './app.js';
import type { FastifyInstance } from 'fastify';

describe('API smoke', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    resetConfigCache();
    process.env.NODE_ENV = 'test';
    process.env.GOOGLE_OAUTH_MOCK = 'true';
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

  it('phone OTP endpoints are retired', async () => {
    const req = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/otp/request',
      payload: { phoneE164: '+15550101234' },
    });
    expect(req.statusCode).toBe(410);
  });

  it('Google mock sign-in → age verify → me', async () => {
    const email = `smoke.${Date.now()}@gmail.com`;
    const signin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google/mock',
      payload: { email, displayName: 'Smoke Test' },
    });
    expect(signin.statusCode).toBe(200);
    const { accessToken } = signin.json() as { accessToken: string };
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
    expect(me.json().email).toBe(email);
  });

  it('email+password signup and login', async () => {
    const email = `pass.${Date.now()}@gmail.com`;
    const password = 'TalkdropTest1!';
    const signup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/signup',
      payload: { email, password, displayName: 'Pass User' },
    });
    expect(signup.statusCode).toBe(200);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password },
    });
    expect(login.statusCode).toBe(200);
    expect(login.json().accessToken).toBeTruthy();

    const bad = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: 'wrong-password' },
    });
    expect(bad.statusCode).toBe(401);
  });
});
