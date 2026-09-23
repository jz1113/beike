import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatKeywordReviewRuleAdditions } from './keywordReviewRules.ts';

test('supplemental rules keep fixed output contract in prompt', () => {
  const text = formatKeywordReviewRuleAdditions([
    { section: '垂类边界', text: '宠物行为训练归动物，涉及疾病治疗才归医疗健康。' },
  ]);
  assert.match(text, /\[垂类边界\].*宠物行为训练归动物/);
  assert.match(text, /不得改变允许垂类、制作结论、否决类型或 JSON 字段/);
});
