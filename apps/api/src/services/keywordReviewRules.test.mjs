import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatKeywordReviewRuleAdditions, ruleEntriesForMode } from './keywordReviewRules.ts';

test('supplemental rules keep fixed output contract in prompt', () => {
  const text = formatKeywordReviewRuleAdditions([
    { section: '垂类边界', text: '宠物行为训练归动物，涉及疾病治疗才归医疗健康。' },
  ]);
  assert.match(text, /\[垂类边界\].*宠物行为训练归动物/);
  assert.match(text, /不得改变允许垂类、制作结论、否决类型或 JSON 字段/);
});

test('image and video supplemental rules are isolated, including old untagged rules', () => {
  const entries = [
    { section: '垂类边界', text: '旧图文规则归图文。' },
    { section: '其他说明', text: '视频规则归视频。', mode: 'video' },
  ];
  assert.equal(ruleEntriesForMode(entries, 'image').length, 1);
  assert.equal(ruleEntriesForMode(entries, 'video').length, 1);
  assert.equal(ruleEntriesForMode(entries, 'video')[0].text, '视频规则归视频。');
});
