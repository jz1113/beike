import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isAllowedOrigin, isLoopbackOrigin } from './cors.ts';

test('allows only exact PUBLIC_WEB_ORIGIN values including protocol and port', () => {
  const extra = ['https://app.example.com', 'http://10.0.0.8:4173'];
  assert.equal(isAllowedOrigin('https://app.example.com', extra, { allowLoopback: false }), true);
  assert.equal(isAllowedOrigin('http://10.0.0.8:4173', extra, { allowLoopback: false }), true);
  assert.equal(isAllowedOrigin('https://app.example.com:443', extra, { allowLoopback: false }), false);
  assert.equal(isAllowedOrigin('http://app.example.com', extra, { allowLoopback: false }), false);
  assert.equal(isAllowedOrigin('https://evil.example.com', extra, { allowLoopback: false }), false);
});

test('does not treat hostname-only env values as a match for another origin', () => {
  assert.equal(isAllowedOrigin('https://cdn.example.com', ['cdn.example.com'], { allowLoopback: false }), false);
  assert.equal(isAllowedOrigin('https://cdn.example.com', ['https://cdn.example.com'], { allowLoopback: false }), true);
});

test('loopback origins stay allowed when the flag is on', () => {
  assert.equal(isLoopbackOrigin('http://localhost:5173'), true);
  assert.equal(isLoopbackOrigin('http://127.0.0.1:3000'), true);
  assert.equal(isLoopbackOrigin('http://[::1]:3000'), true);
  assert.equal(isLoopbackOrigin('tauri://localhost'), false);
  assert.equal(isAllowedOrigin('http://localhost:5173', [], { allowLoopback: true }), true);
  assert.equal(isAllowedOrigin('http://localhost:5173', [], { allowLoopback: false }), false);
});
