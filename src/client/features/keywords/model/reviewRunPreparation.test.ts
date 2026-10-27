import { describe, expect, it } from 'vitest';
import { validateReviewInputs } from './reviewRunPreparation';
import type { KeywordReviewRecord } from './keywordReviewWorkbookTypes';

function row(patch: Partial<KeywordReviewRecord> = {}): KeywordReviewRecord {
  return { id: 'Sheet:1234', query: '猫砂', sheetName: '长词包', rowNumber: 1234, status: 'idle', sourceValues: {}, ...patch };
}

describe('review run input preflight', () => {
  it.each([
    ['query', '词'.repeat(501), '关键词超过 500'],
    ['expansion', '词'.repeat(4001), '相关拓展词超过 4000'],
    ['entityExpansion', '词'.repeat(4001), '实体拓展词超过 4000'],
    ['contentType', '词'.repeat(501), '内容类型超过 500'],
    ['query', '   ', '关键词为空'],
  ])('identifies the source row for invalid %s without truncating it', (field, value, detail) => {
    const invalid = row({ [field]: value });
    expect(() => validateReviewInputs([row({ id: 'valid' }), invalid])).toThrow(`工作表“长词包”第 1,234 行的${detail}`);
    expect(Reflect.get(invalid, field)).toBe(value);
    expect(invalid.status).toBe('idle');
  });

  it('accepts exact field limits and keeps the original source text', () => {
    const valid = row({ query: '词'.repeat(500), expansion: '词'.repeat(4000), entityExpansion: '词'.repeat(4000), contentType: '词'.repeat(500) });
    expect(() => validateReviewInputs([valid])).not.toThrow();
    expect(valid.query).toHaveLength(500);
  });
});
