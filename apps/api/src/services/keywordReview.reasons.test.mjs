import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  normalizeCategoryReason,
  normalizeRejectReason,
  rewriteLookupCategoryReason,
} from './keywordReviewReasons.ts';

test('normalizeCategoryReason trims and clips to 28 characters', () => {
  assert.equal(normalizeCategoryReason('  被选的是手机，不是游戏内容  '), '被选的是手机，不是游戏内容');
  assert.equal(normalizeCategoryReason('一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十'), '一二三四五六七八九十一二三四五六七八九十一二三四五六七八');
  assert.throws(() => normalizeCategoryReason('  '), /垂类依据/);
});

test('normalizeRejectReason keeps empty string for producible rows', () => {
  assert.equal(normalizeRejectReason('制作', ''), '');
  assert.equal(normalizeRejectReason('制作', '   '), '');
  assert.throws(() => normalizeRejectReason('制作', '简单问答：只确认一个身份'), /可制作行/);
});

test('normalizeRejectReason requires a known prefix and a hit', () => {
  assert.equal(normalizeRejectReason('不制作', '简单问答：只确认一个身份'), '简单问答：只确认一个身份');
  assert.equal(normalizeRejectReason('不制作', '非笔记需求: 平台绑卡操作'), '非笔记需求：平台绑卡操作');
  assert.throws(() => normalizeRejectReason('不制作', '不适合做成笔记'), /否决类型/);
  assert.throws(() => normalizeRejectReason('不制作', '低价值：'), /命中点/);
});

test('rewriteLookupCategoryReason only replaces the reason when the vertical changes', () => {
  const previous = { category: '其他', categoryReason: '无法识别主体，暂归其他' };
  assert.equal(
    rewriteLookupCategoryReason(previous, '民俗文化', '日本神话天狗'),
    '日本神话天狗，联网确认后归类',
  );
  assert.equal(
    rewriteLookupCategoryReason({ category: '民俗文化', categoryReason: '神话实体，不是动物' }, '民俗文化', '日本神话天狗'),
    '神话实体，不是动物',
  );
  assert.equal(rewriteLookupCategoryReason(previous, '游戏'), '联网确认后归类');
});
