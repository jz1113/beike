import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FashionSkillSheet } from './FashionSkillSheet';

describe('fashion skill sheet', () => {
  it('shows only the compact fashion skill and keeps its document closed', () => {
    const html = renderToStaticMarkup(createElement(FashionSkillSheet, { active: true, onClose: () => {} }));
    expect(html).toContain('带货规则');
    expect(html).toContain('服饰专属规则');
    expect(html).toContain('当前适用');
    expect(html).not.toContain('同一颜色的单品图');
    expect(html).toContain('aria-label="查看服饰专属规则详情"');
    expect(html).toContain('max-w-[640px]');
    expect(html).not.toContain('通用制作流程');
    expect(html).not.toContain('全品类');
    expect(html).not.toContain('服饰带货视频');
    expect(html).not.toContain('复制完整 SKILL.md');
  });

  it('labels the fashion skill without claiming it is active for another category', () => {
    const html = renderToStaticMarkup(createElement(FashionSkillSheet, { active: false, onClose: () => {} }));
    expect(html).toContain('服饰鞋包适用');
    expect(html).not.toContain('当前适用');
  });
});
