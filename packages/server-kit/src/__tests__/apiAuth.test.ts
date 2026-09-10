import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createMediaSignature, verifyMediaSignature } from '../mediaSign';
import { getAdminToken, getAccessToken } from '../apiAuth';

describe('mediaSign', () => {
  it('creates and verifies valid signature', () => {
    const secret = 'test-secret';
    const url = 'https://example.com/a.jpg';
    const { exp, sig } = createMediaSignature(url, secret, 300);
    expect(verifyMediaSignature(url, exp, sig, secret)).toBe(true);
  });

  it('rejects tampered url', () => {
    const secret = 'test-secret';
    const { exp, sig } = createMediaSignature('https://example.com/a.jpg', secret, 300);
    expect(verifyMediaSignature('https://example.com/b.jpg', exp, sig, secret)).toBe(false);
  });
});

describe('apiAuth admin separation', () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it('admin token does not fall back to access token', () => {
    process.env.LOCAL_ACCESS_TOKEN = 'user-token';
    delete process.env.ADMIN_ACCESS_TOKEN;
    expect(getAccessToken()).toBe('user-token');
    expect(getAdminToken()).toBeNull();
  });
});
