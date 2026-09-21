import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HeadlineDesignRequestSchema, HeadlineTitleRequestSchema } from '@beike/contracts/generate';
import { HeadlineContractError, headlineErrorHttpStatus, validateCoverDesign } from './headline-design-contract.ts';

test('headline design schema rejects non-object bodies', () => {
  assert.equal(HeadlineDesignRequestSchema.safeParse('oops').success, false);
  assert.equal(HeadlineDesignRequestSchema.safeParse({ aspectRatio: '16:9' }).success, false);
  assert.equal(HeadlineDesignRequestSchema.safeParse({ originalTitle: '轻盈贴合出行听得舒心', coverTitle: '轻盈贴合出行听得舒心', imageUrls: ['https://cdn.example/a.jpg'] }).success, true);
});

test('headline title schema accepts optional product name and images', () => {
  assert.equal(HeadlineTitleRequestSchema.safeParse({ originalTitle: '轻盈贴合出行听得舒心' }).success, true);
  assert.equal(HeadlineTitleRequestSchema.safeParse({ originalTitle: 12 }).success, false);
});

test('contract errors map to 400 and malformed model JSON maps to 502', () => {
  assert.equal(headlineErrorHttpStatus(new HeadlineContractError('设计方案缺少 imagePrompt，未提交生图')), 400);
  assert.equal(headlineErrorHttpStatus(new SyntaxError('设计模型没有返回合法 JSON')), 502);
  assert.equal(headlineErrorHttpStatus(new Error('设计模型 gemini 返回 HTTP 500')), 500);
});

test('validateCoverDesign throws HeadlineContractError for invalid payloads', () => {
  assert.throws(
    () => validateCoverDesign({ title: 'x' }, '轻盈贴合出行听得舒心'),
    (error) => error instanceof HeadlineContractError && headlineErrorHttpStatus(error) === 400,
  );
});
