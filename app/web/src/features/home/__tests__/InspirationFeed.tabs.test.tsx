// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import InspirationFeed from '../components/inspiration/InspirationFeed';
import { INSPIRATION_ITEMS } from '../data/inspirationData';

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

describe('InspirationFeed toolbar & search tests', () => {
  const onUsePrompt = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('does not expose the visually removed inspiration cards', () => {
    const removedIds = [
      'item-1', 'item-2', 'item-3', 'item-4', 'item-7', 'item-12',
      'item-16', 'item-17', 'item-19', 'item-20', 'item-23', 'item-24',
    ];

    expect(INSPIRATION_ITEMS.map(item => String(item.id))).not.toEqual(
      expect.arrayContaining(removedIds),
    );
  });

  it('includes imported videos with generated prompts and posters', () => {
    const imported = INSPIRATION_ITEMS.filter(item =>
      String(item.id).startsWith('imported-video-'),
    );

    expect(imported).toHaveLength(5);
    imported.forEach(item => {
      expect(item.mediaType).toBe('video');
      expect(item.video).toMatch(/^\/inspirations\/imported-20260910\/.+\.mp4$/);
      expect(item.poster).toMatch(/^\/inspirations\/imported-20260910\/.+-poster\.png$/);
      expect(item.prompt.length).toBeGreaterThan(80);
    });
  });

  it('includes all restored collaboration images with generated prompts', () => {
    const imported = INSPIRATION_ITEMS.filter(item =>
      String(item.id).startsWith('imported-image-jay-collab-'),
    );

    expect(imported).toHaveLength(10);
    imported.forEach(item => {
      expect(item.image).toMatch(/^\/inspirations\/imported-20260910\/jay-collab-\d{2}\.(?:jpg|jpeg)$/);
      expect(item.prompt.length).toBeGreaterThan(100);
    });
  });

  it('verifies category tabs, discovery pill and shuffle buttons are removed per user request', () => {
    render(<InspirationFeed onUsePrompt={onUsePrompt} />);

    // 1. 验证分类 tabs 已被彻底移除
    expect(screen.queryByText('🎬 动态视频')).not.toBeInTheDocument();
    expect(screen.queryByText('🔥 热门推荐')).not.toBeInTheDocument();
    expect(screen.queryByText('人像写真')).not.toBeInTheDocument();
    expect(screen.queryByText('先锋插画')).not.toBeInTheDocument();
    expect(screen.queryByText('国风美学')).not.toBeInTheDocument();
    expect(screen.queryByText('3D 潮玩')).not.toBeInTheDocument();
    expect(screen.queryByText('电商爆款')).not.toBeInTheDocument();

    // 2. 验证“发现”胶囊已移除
    expect(screen.queryByText('发现')).not.toBeInTheDocument();

    // 3. 验证“换一批”按钮已移除
    expect(screen.queryByLabelText('换一批灵感')).not.toBeInTheDocument();

    // 4. 验证卡片右上角的“动态视频”浮层标签已彻底移除
    expect(screen.queryByText('动态视频')).not.toBeInTheDocument();
  });

  it('shows clean full-width search bar, shows clear button when text entered, and clears search', () => {
    render(<InspirationFeed onUsePrompt={onUsePrompt} />);

    const input = screen.getByPlaceholderText('搜索爆款灵感 / 提示词') as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(screen.queryByLabelText('清空搜索')).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: '猫' } });
    expect(input.value).toBe('猫');

    const clearBtn = screen.getByLabelText('清空搜索');
    expect(clearBtn).toBeInTheDocument();

    fireEvent.click(clearBtn);
    expect(input.value).toBe('');
    expect(screen.queryByLabelText('清空搜索')).not.toBeInTheDocument();
  });
});
