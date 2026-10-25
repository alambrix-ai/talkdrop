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

  it('auth methods reports mock when Google Cloud creds are absent', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/auth/methods' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      google: false,
      googleMock: true,
      emailPassword: true,
    });
  });

  it('GET /auth/google redirects to /verify when Google is not configured', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/google',
      // follow redirects off — inject does not follow by default
    });
    expect(res.statusCode).toBe(302);
    const location = res.headers.location as string;
    expect(location).toContain('/verify?authError=');
    expect(location).toContain('google_not_configured');
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
      payload: { confirmed18Plus: true },
    });
    expect(age.statusCode).toBe(200);
    expect(age.json().result).toBe('passed');
    expect(age.json().ageConsent).toBe('accepted');

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().ageVerified).toBe(true);
    expect(me.json().ageConsent).toBe('accepted');
    expect(me.json().email).toBe(email);
  });

  it('18+ decline blocks matching and persists', async () => {
    const email = `decline.${Date.now()}@gmail.com`;
    const signin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/google/mock',
      payload: { email, displayName: 'Decline Test' },
    });
    expect(signin.statusCode).toBe(200);
    const { accessToken } = signin.json() as { accessToken: string };

    const age = await app.inject({
      method: 'POST',
      url: '/api/v1/verification/age',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { confirmed18Plus: false },
    });
    expect(age.statusCode).toBe(200);
    expect(age.json().result).toBe('failed');
    expect(age.json().ageConsent).toBe('declined');

    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(me.json().ageVerified).toBe(false);
    expect(me.json().ageConsent).toBe('declined');

    const fallback = await app.inject({
      method: 'POST',
      url: '/api/v1/verification/fallback/start',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { method: 'document' },
    });
    expect(fallback.statusCode).toBe(410);
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
