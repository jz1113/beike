import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
  applyCachedLookupCategories,
  extractResponsesText,
  parseLookupCategory,
  parseLookupResult,
  recalledLookupCategory,
  rememberLookupCategory,
  resetLookupCacheForTests,
  selectLookupRows,
  setLookupPersistenceForTests,
  hydrateLookupCache,
  storeLookupHit,
} from './keywordReviewLookup.ts';

afterEach(() => {
  resetLookupCacheForTests();
});

const allowed = new Set(['民俗文化', '游戏', '其他', '3C数码']);

function row(id, query) {
  return { id, query };
}

function result(id, category, needsLookup = false) {
  return {
    id,
    category,
    producible: '制作',
    categoryReason: '测试主体，用于校验归类',
    rejectReason: '',
    needsLookup,
  };
}

test('selectLookupRows searches only needsLookup rows and caps at 2', () => {
  const rows = [
    row('1', '乌天狗'),
    row('2', '未知品牌A'),
    row('3', '未知品牌A'),
    row('4', '花菜焯水多久好吃'),
    row('5', '游戏手机推荐'),
    row('6', '陌生机构'),
    row('7', '外文词X'),
    row('8', '作品Y'),
    row('9', '品牌Z'),
  ];
  const results = [
    result('1', '其他', true),
    result('2', '其他'),
    result('3', '其他'),
    result('4', '美食', false),
    result('5', '3C数码', false),
    result('6', '其他', true),
    result('7', '其他', true),
    result('8', '其他', true),
    result('9', '其他', true),
  ];
  const picked = selectLookupRows(results, rows);
  assert.deepEqual(picked.map((item) => item.query), ['乌天狗', '陌生机构']);
});

test('selectLookupRows skips cached queries so retries do not search again', () => {
  rememberLookupCategory('乌天狗', '民俗文化');
  const picked = selectLookupRows(
    [result('1', '其他', true), result('2', '其他', true)],
    [row('1', '乌天狗'), row('2', '未知品牌A')],
  );
  assert.deepEqual(picked.map((item) => item.query), ['未知品牌A']);
});

test('lookup cache does not cross review rule versions', () => {
  rememberLookupCategory('乌天狗', '民俗文化', '日本神话天狗', 1);
  const rows = [row('1', '乌天狗')];
  const results = [result('1', '其他', true)];
  assert.equal(selectLookupRows(results, rows, 5, 1).length, 0);
  assert.equal(selectLookupRows(results, rows, 5, 2).length, 1);
  assert.equal(applyCachedLookupCategories(results, rows, 2)[0].category, '其他');
});

test('applyCachedLookupCategories rewrites vertical and reason when category changes', () => {
  rememberLookupCategory('乌天狗', '民俗文化', '日本神话天狗');
  const next = applyCachedLookupCategories(
    [{
      id: '1',
      category: '其他',
      producible: '不制作',
      categoryReason: '无法识别主体，暂归其他',
      rejectReason: '简单问答：测试',
      needsLookup: true,
    }],
    [row('1', '乌天狗')],
  );
  assert.equal(next[0].category, '民俗文化');
  assert.equal(next[0].producible, '不制作');
  assert.equal(next[0].categoryReason, '日本神话天狗，联网确认后归类');
  assert.equal(next[0].rejectReason, '简单问答：测试');
});

test('applyCachedLookupCategories keeps original reason when category is unchanged', () => {
  rememberLookupCategory('乌天狗', '民俗文化', '日本神话天狗');
  const next = applyCachedLookupCategories(
    [{
      id: '1',
      category: '民俗文化',
      producible: '制作',
      categoryReason: '神话实体，不是动物',
      rejectReason: '',
      needsLookup: true,
    }],
    [row('1', '乌天狗')],
  );
  assert.equal(next[0].category, '民俗文化');
  assert.equal(next[0].categoryReason, '神话实体，不是动物');
});

test('extractResponsesText reads output_text and message blocks', () => {
  assert.equal(extractResponsesText({ output_text: '{"category":"游戏"}' }), '{"category":"游戏"}');
  assert.equal(
    extractResponsesText({
      output: [{
        type: 'message',
        content: [{ type: 'output_text', text: '{"category":"民俗文化"}' }],
      }],
    }),
    '{"category":"民俗文化"}',
  );
});

test('parseLookupCategory accepts only allowed verticals', () => {
  assert.equal(parseLookupCategory('{"category":"民俗文化"}', allowed), '民俗文化');
  assert.equal(parseLookupCategory('```json\n{"category":"游戏"}\n```', allowed), '游戏');
  assert.equal(parseLookupCategory('{"category":"不存在"}', allowed), undefined);
  assert.equal(parseLookupCategory('not json', allowed), undefined);
});

test('parseLookupResult reads optional subject phrases', () => {
  assert.deepEqual(
    parseLookupResult('{"category":"民俗文化","subject":"日本神话天狗"}', allowed),
    { category: '民俗文化', subject: '日本神话天狗' },
  );
  assert.deepEqual(parseLookupResult('{"category":"游戏"}', allowed), { category: '游戏' });
});

test('persistent lookup cache survives an in-memory reset', async () => {
  const saved = [];
  setLookupPersistenceForTests({
    async read(_workspaceId, rulesVersion, queries) {
      return saved.filter((item) => item.rulesVersion === rulesVersion && queries.includes(item.query));
    },
    async write(_workspaceId, rulesVersion, query, hit) {
      saved.push({ rulesVersion, query, category: hit.category, subject: hit.subject || '' });
    },
  });
  await storeLookupHit('乌天狗', '民俗文化', '日本神话天狗', 3, 'workspace');
  resetLookupCacheForTests();
  setLookupPersistenceForTests({
    async read(_workspaceId, rulesVersion, queries) {
      return saved.filter((item) => item.rulesVersion === rulesVersion && queries.includes(item.query));
    },
    async write() {},
  });
  await hydrateLookupCache(['乌天狗'], 3, 'workspace');
  assert.equal(recalledLookupCategory('乌天狗', 3), '民俗文化');
});

test('lookup cache stores trimmed queries', () => {
  rememberLookupCategory('  乌天狗  ', '民俗文化');
  assert.equal(recalledLookupCategory('乌天狗'), '民俗文化');
});
