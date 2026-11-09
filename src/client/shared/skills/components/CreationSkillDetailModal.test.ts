import { createElement, isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CreationSkillDetailModal } from './CreationSkillDetailModal';
import { SkillCard } from './SkillCard';
import type { SkillItem } from '../model/skillTypes';

vi.mock('react-dom', () => ({ createPortal: (children: unknown) => children }));

const item: SkillItem = { id: 'test', title: '分镜', description: '规划镜头', models: '', category: '专业影视', prompt: '# 分镜指令', author: '创作者', usageCount: 0, tags: ['创意发散'] };

describe('creation skill detail metadata', () => {
  it('shows the full content and keeps the example action for built-in skills', () => {
    vi.stubGlobal('document', { body: {} });
    try {
      const html = renderToStaticMarkup(createElement(CreationSkillDetailModal, {
        item: { ...item, id: 'assistant:beike-cinematic-storyboard', coverUrl: '/station.mp4', coverPosterUrl: '/poster.jpg',
          example: { prompt: '雨后车站，10秒16:9，先给分镜表。', referenceImages: ['/reference.jpg'] } }, onClose: vi.fn(), onUse: vi.fn(),
      }));
      expect(html).toContain('poster="/poster.jpg"');
      expect(html).toContain('使用示例');
      expect(html).toContain('完整技能内容');
      expect(html).toContain('技能文件目录');
      expect(html).toContain('分镜指令');
      expect(html.indexOf('规划镜头')).toBeLessThan(html.indexOf('完整技能内容'));
      expect(html).not.toContain('准备什么');
    } finally { vi.unstubAllGlobals(); }
  });
  it.each([['platform', '平台来源原版', 'https://example.com/skill'], ['local', '贝壳内置', '/skills']] as const)('shows %s provenance and the actual license statement', (kind, label, url) => {
    vi.stubGlobal('document', { body: {} });
    try {
      const html = renderToStaticMarkup(createElement(CreationSkillDetailModal, {
        item: { ...item, source: { kind, url, revision: 'snapshot-1', license: '未提供许可证；授权未核验', files: {} } }, onClose: vi.fn(), onUse: vi.fn(),
      }));
      expect(html).toContain(label);
      if (kind === 'local') expect(html).not.toContain(`href="${url}"`);
      else expect(html).toContain(`href="${url}"`);
      expect(html).toContain('snapshot-1');
      expect(html).toContain('未提供许可证；授权未核验');
      expect(html).not.toContain('官方原版');
      expect(html).not.toContain('MIT');
    } finally { vi.unstubAllGlobals(); }
  });

  it('offers native playback controls for an imported video example', () => {
    vi.stubGlobal('document', { body: {} });
    try {
      const html = renderToStaticMarkup(createElement(CreationSkillDetailModal, {
        item: { ...item, coverUrl: '/example.mp4' }, onClose: vi.fn(), onUse: vi.fn(),
      }));
      expect(html).toContain('<video');
      expect(html).toContain('controls=""');
      expect(html).toContain('aria-label="分镜 案例视频"');
      expect(html).not.toContain('autoplay');
    } finally { vi.unstubAllGlobals(); }
  });

  it('shows actual metadata and favorite state without inventing model names or counts', () => {
    vi.stubGlobal('document', { body: {} });
    try {
      const html = renderToStaticMarkup(createElement(CreationSkillDetailModal, {
        item, onClose: vi.fn(), onUse: vi.fn(), isFavorite: true, onToggleFavorite: vi.fn(),
      }));
      expect(html).toContain('aria-label="取消收藏 分镜"');
      expect(html).toContain('aria-pressed="true"');
      expect(html).toContain('创作者');
      expect(html).toContain('使用次数');
      expect(html).not.toContain('收藏数');
      expect(html).toContain('跟随当前创作配置');
      expect(html).not.toContain('SD 2.5');
      expect(html).toContain('创意发散');
      expect(html).toContain('完整技能内容');
      expect(html).toContain('分镜指令');
    } finally { vi.unstubAllGlobals(); }
  });
});

const skill: SkillItem = {
  id: 'assistant:storyboard', title: '电影分镜', description: '生成镜头方案',
  models: '已配置视频模型 · 已配置图像模型', category: '专业影视', runtime: 'assistant',
};
const actions = { onUseSkill: vi.fn(), onDetail: vi.fn(), onEdit: vi.fn(), onDelete: vi.fn(), onFeed: vi.fn() };

describe('creation skill discovery', () => {
  it('keeps starting an empty skill separate from using its bundled example', () => {
    const onUseSkill = vi.fn();
    const example = { ...skill, example: { prompt: '雨后车站，10秒16:9', referenceImages: ['/station.jpg'] } };
    const tree = SkillCard({ ...actions, skill: example, onUseSkill });
    const click = (node: ReactNode, label: string): boolean => {
      if (Array.isArray(node)) return node.some(child => click(child, label));
      if (!isValidElement<{ 'aria-label'?: string; onClick?: () => void; children?: ReactNode }>(node)) return false;
      if (node.props['aria-label'] === label) { node.props.onClick?.(); return true; }
      return click(node.props.children, label);
    };
    expect(click(tree, '使用示例 电影分镜')).toBe(true);
    expect(onUseSkill).toHaveBeenLastCalledWith(example, true);
    expect(click(tree, '使用技能 电影分镜')).toBe(true);
    expect(onUseSkill).toHaveBeenLastCalledWith(example);
  });
  it('exposes a favorite control independently from opening or using the skill', () => {
    const html = renderToStaticMarkup(createElement(SkillCard, { skill, ...actions, isFavorite: true, onToggleFavorite: vi.fn() }));
    expect(html).toContain('aria-label="取消收藏 电影分镜"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('已配置视频模型 · 已配置图像模型');
    expect(html).toContain('aria-label="使用技能 电影分镜"');
  });

  it('does not invent a default model when the skill declares none', () => {
    const html = renderToStaticMarkup(createElement(SkillCard, { skill: { ...skill, models: '' }, ...actions }));
    expect(html).not.toContain('SD 2.5');
    expect(html).not.toContain('取消收藏');
  });

  it('renders an imported video cover as video rather than a broken image', () => {
    const html = renderToStaticMarkup(createElement(SkillCard, { skill: { ...skill, coverUrl: '/example.mp4' }, ...actions }));
    expect(html).toContain('<video');
    expect(html).not.toContain('<img');
    expect(html).toContain('preload="none"');
  });
});
