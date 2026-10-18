import { describe, expect, it } from 'vitest';
import {
  buildOutlinePrompt,
  buildSlideVisualPrompt,
  parseMarkdownToOutlinePages,
} from './pptPrompts';

describe('pptPrompts', () => {
  it('正确解析 markdown 大纲为结构化页面', () => {
    const md = `
# Part 1: 引言与背景
## 封面: AI Native 演示的未来
- 副标题: 贝壳云图新一代产品
- 演讲者: 产品团队

## 传统排版的死板与低效
- 样式模版千篇一律
- 微调耗时耗力

# Part 2: 核心突破
## 视觉模型端到端排版
- 保持文字锐利
- 构图自动平衡
    `;

    const pages = parseMarkdownToOutlinePages(md);
    expect(pages).toHaveLength(3);
    expect(pages[0].title).toBe('封面: AI Native 演示的未来');
    expect(pages[0].part).toBe('Part 1: 引言与背景');
    expect(pages[0].points).toHaveLength(2);

    expect(pages[1].title).toBe('传统排版的死板与低效');
    expect(pages[1].part).toBe('Part 1: 引言与背景');

    expect(pages[2].title).toBe('视觉模型端到端排版');
    expect(pages[2].part).toBe('Part 2: 核心突破');
  });

  it('生成生图 Prompt 包含核心约束', () => {
    const prompt = buildSlideVisualPrompt({
      pageIndex: 1,
      pageDesc: '页面文字：未来已来\n版式：居中大字报',
      aspectRatio: '16:9',
      hasTemplate: true,
    });

    expect(prompt).toContain('16:9');
    expect(prompt).toContain('封面页特别要求');
    expect(prompt).toContain('严格只参考视觉风格');
  });

  it('生成大纲 Prompt 包含论断式要求', () => {
    const prompt = buildOutlinePrompt({
      ideaPrompt: '具身智能商业化思考',
      language: 'zh',
    });

    expect(prompt).toContain('论断式标题规则');
    expect(prompt).toContain('具身智能商业化思考');
  });
});
