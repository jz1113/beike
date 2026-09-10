import { describe, it, expect } from 'vitest';
import { sanitizeJsonControlChars, repairAndParseDeconstructJson } from '../deconstruct';

describe('Asset Deconstruct JSON Robust Parser & Healer', () => {
  it('correctly sanitizes unescaped newlines and tabs inside strings', () => {
    const raw = '{"text": "第一行\n第二行\t含Tab"}';
    const sanitized = sanitizeJsonControlChars(raw);
    const parsed = JSON.parse(sanitized);
    expect(parsed.text).toBe('第一行\n第二行\t含Tab');
  });

  it('parses Gemini multi-image JSON with unescaped newlines in prompt strings', () => {
    const rawGeminiOutput = `\`\`\`json
{
  "theme_category": "chinese_style",
  "per_image": [
    {
      "image_index": 1,
      "title": "金光晨曦",
      "reverse_prompt_zh": "【主体】少女侧身回望
【发型与面部】乌黑微卷长发
【穿搭】白丝绸长裙
【场景】中式园林
【光影】晨曦金光"
    },
    {
      "image_index": 2,
      "title": "长廊回眸",
      "reverse_prompt_zh": "【主体】漫步背影
【场景】朱红木质长廊
【光影】斑驳侧光"
    }
  ],
  "persona": {
    "name": "江南佳人",
    "hair": "乌黑长发"
  },
  "scenes": [
    {
      "title": "中式园林"
    }
  ]
}
\`\`\``;

    const parsed = repairAndParseDeconstructJson(rawGeminiOutput);
    expect(parsed).toBeDefined();
    expect(parsed.theme_category).toBe('chinese_style');
    expect(parsed.per_image).toHaveLength(2);
    expect(parsed.per_image[0].image_index).toBe(1);
    expect(parsed.per_image[0].title).toBe('金光晨曦');
    expect(parsed.per_image[0].reverse_prompt_zh).toContain('【主体】少女侧身回望');
    expect(parsed.per_image[1].image_index).toBe(2);
    expect(parsed.per_image[1].title).toBe('长廊回眸');
    expect(parsed.persona?.name).toBe('江南佳人');
  });

  it('heals and extracts per_image even when token limit cuts off output mid-string', () => {
    // 模拟输出在第 3 张图描述一半时被截断
    const truncatedOutput = `\`\`\`json
{
  "theme_category": "chinese_style",
  "per_image": [
    {
      "image_index": 1,
      "title": "晨光微曦",
      "reverse_prompt_zh": "【主体】少女侧身回望"
    },
    {
      "image_index": 2,
      "title": "竹林漫步",
      "reverse_prompt_zh": "【主体】漫步背影
【场景】青翠竹林"
    },
    {
      "image_index": 3,
      "title": "凭栏远眺",
      "reverse_prompt_zh": "【主体】凭栏眺望远方水波`;

    const parsed = repairAndParseDeconstructJson(truncatedOutput);
    expect(parsed).toBeDefined();
    expect(parsed.per_image).toBeDefined();
    expect(parsed.per_image.length).toBeGreaterThanOrEqual(2);
    expect(parsed.per_image[0].image_index).toBe(1);
    expect(parsed.per_image[1].image_index).toBe(2);
  });

  it('regex fallback extracts per_image objects on severely malformed JSON', () => {
    const malformedText = `Some leading thoughts from model...
{
  "theme_category": "luxury_modern",
  "per_image": [
    {
      "image_index": 1,
      "title": "大片风采",
      "reverse_prompt_zh": "【主体】模特立于展厅"
    },
    {
      "image_index": 2,
      "title": "腕间特写",
      "reverse_prompt_zh": "【主体】手腕戴表"
    }
  ],
  "scenes": [{"title": "现代展厅"}]
Broken ending without proper closing tokens`;

    const parsed = repairAndParseDeconstructJson(malformedText);
    expect(parsed).toBeDefined();
    expect(parsed.per_image).toBeDefined();
    expect(parsed.per_image.length).toBe(2);
    expect(parsed.per_image[0].title).toBe('大片风采');
    expect(parsed.per_image[1].title).toBe('腕间特写');
  });
});
