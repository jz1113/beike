import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveGridRecoverySource } from './gridRecoverySource.ts';

const failed = (shot_no) => ({ shot_no, status: 'FAILURE' });

test('failed grid without a stored slice falls back to the product master image', () => {
  const source = resolveGridRecoverySource({
    recoveryOnly: false,
    masterGridUrl: '/storage/grid.png',
    tasks: [failed(1), failed(2), failed(3), failed(4)],
    pendingShotNos: [1, 2, 3, 4],
  });
  assert.equal(source, '/storage/grid.png');
});

test('a fresh pending run does not reuse an older master image', () => {
  const source = resolveGridRecoverySource({
    recoveryOnly: false,
    masterGridUrl: '/storage/grid.png',
    tasks: [1, 2, 3, 4].map((shot_no) => ({ shot_no, status: 'PENDING' })),
    pendingShotNos: [1, 2, 3, 4],
  });
  assert.equal(source, undefined);
});

test('an explicit recovery uses the master image even before tasks are marked failed', () => {
  const source = resolveGridRecoverySource({
    recoveryOnly: true,
    masterGridUrl: '/storage/grid.png',
    tasks: [{ shot_no: 1, status: 'IN_PROGRESS' }],
    pendingShotNos: [1],
  });
  assert.equal(source, '/storage/grid.png');
});

test('a stored slice url wins over the product master image', () => {
  const source = resolveGridRecoverySource({
    recoveryOnly: true,
    masterGridUrl: '/storage/grid.png',
    tasks: [{ shot_no: 1, status: 'FAILURE', gridSourceUrl: '/storage/slice-source.png' }],
    pendingShotNos: [1],
  });
  assert.equal(source, '/storage/slice-source.png');
});

test('page connect-src allows blob and data urls', () => {
  const html = fs.readFileSync(new URL('../../../../../index.html', import.meta.url), 'utf8');
  const policy = html.match(/connect-src[^;"]+/)?.[0] || '';
  assert.match(policy, /blob:/);
  assert.match(policy, /data:/);
});
