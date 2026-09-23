import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWithWorkspace } from '@beike/server-kit/workspaceContext';
import { guardSubmission, isExpiredReceipt, purgeExpiredSubmissionReceipts, SUBMISSION_RECEIPT_TTL_MS } from './submissionGuard.ts';

test('submission receipts expire after 24 hours', () => {
  const now = Date.now();
  assert.equal(isExpiredReceipt(now, now), false);
  assert.equal(isExpiredReceipt(now - SUBMISSION_RECEIPT_TTL_MS + 1, now), false);
  assert.equal(isExpiredReceipt(now - SUBMISSION_RECEIPT_TTL_MS, now), true);
  assert.equal(isExpiredReceipt(undefined, now), true);
});

test('the same keyword batch returns its receipt without another model submission', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'beike-keyword-receipt-'));
  const previous = process.env.AZHUO_DATA_DIR;
  process.env.AZHUO_DATA_DIR = dir;
  let submits = 0;
  const request = () => new Request('http://127.0.0.1/api/generate/keyword-review', {
    method: 'POST',
    headers: { 'x-idempotency-key': 'keyword:test:0' },
    body: JSON.stringify({ model: 'deepseek-flash', rows: [{ id: '1', query: '猫砂' }] }),
  });
  try {
    await runWithWorkspace('receipt-test', async () => {
      const submit = async () => {
        submits += 1;
        return Response.json({ success: true, results: [{ id: '1', category: '动物' }] });
      };
      const first = await guardSubmission(request(), 'keyword-review', { baseUrl: 'https://api.deepseek.com', apiKey: 'test' }, submit);
      const second = await guardSubmission(request(), 'keyword-review', { baseUrl: 'https://api.deepseek.com', apiKey: 'test' }, submit);
      assert.deepEqual(await first.json(), await second.json());
      assert.equal(submits, 1);
      const receiptDir = join(dir, 'submission-receipts', 'receipt-test');
      const [name] = await readdir(receiptDir);
      const receiptFile = join(receiptDir, name);
      const saved = JSON.parse(await readFile(receiptFile, 'utf8'));
      await writeFile(receiptFile, JSON.stringify({ ...saved, createdAt: Date.now() - SUBMISSION_RECEIPT_TTL_MS - 1000 }));
      assert.equal(await purgeExpiredSubmissionReceipts(), 0);
      const afterExpiry = await guardSubmission(request(), 'keyword-review', { baseUrl: 'https://api.deepseek.com', apiKey: 'test' }, submit);
      assert.equal((await afterExpiry.json()).success, true);
      assert.equal(submits, 1);
    });
  } finally {
    if (previous === undefined) delete process.env.AZHUO_DATA_DIR;
    else process.env.AZHUO_DATA_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
