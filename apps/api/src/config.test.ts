import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, resetConfigCache } from './config.js';

const baseEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://talkdrop:talkdrop@localhost:5432/talkdrop',
  JWT_ACCESS_SECRET: 'test-access-secret-at-least-32-chars!!',
  JWT_REFRESH_SECRET: 'test-refresh-secret-at-least-32-chars!',
  TRUST_TOKEN_SECRET: 'test-trust-secret-at-least-32-chars!!',
  FIELD_ENCRYPTION_KEY: 'dGFsa2Ryb3AtZGV2LWZpZWxkLWtleS0zMmJ5dGVzISE=',
  GOOGLE_OAUTH_MOCK: 'true',
} as const;

describe('loadConfig origins + Google secrets', () => {
  afterEach(() => {
    resetConfigCache();
  });

  it('strips trailing slashes from WEB_ORIGIN and API_ORIGIN', () => {
    const config = loadConfig({
      ...baseEnv,
      WEB_ORIGIN: 'http://localhost:5173/',
      API_ORIGIN: 'http://localhost:4000///',
    });
    expect(config.WEB_ORIGIN).toBe('http://localhost:5173');
    expect(config.API_ORIGIN).toBe('http://localhost:4000');
  });

  it('treats blank Google credentials as unset', () => {
    const config = loadConfig({
      ...baseEnv,
      GOOGLE_CLIENT_ID: '   ',
      GOOGLE_CLIENT_SECRET: '',
    });
    expect(config.GOOGLE_CLIENT_ID).toBeUndefined();
    expect(config.GOOGLE_CLIENT_SECRET).toBeUndefined();
  });
});
