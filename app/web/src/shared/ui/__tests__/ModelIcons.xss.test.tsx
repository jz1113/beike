// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { ModelIcon } from '@/shared/ui/ModelIcons';
import { render } from '@testing-library/react';
import React from 'react';

describe('ModelIcons — XSS 防御 (PR1 High)', () => {
  it('应渲染 <img> 而非 dangerouslySetInnerHTML', () => {
    const { container } = render(<ModelIcon modelId="openai" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    // img src 应为 data URI 而非内联 HTML
    const src = img!.getAttribute('src');
    expect(src).toMatch(/^data:image\/svg\+xml;base64,/);
    // 不应存在 dangerouslySetInnerHTML 容器
    expect(container.querySelector('[dangerouslysetinnerhtml]')).toBeNull();
  });

  it('已知 modelId 走 Logo 路线（白名单）', () => {
    const { container } = render(<ModelIcon modelId="gemini" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    const src = img!.getAttribute('src');
    expect(src).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('不存在的 modelId 走 HuggingFace 兜底（白名单），不渲染 SVG 内联标签', () => {
    const { container } = render(<ModelIcon modelId="completely-unknown-model-xyz" />);
    // 兜底路径：HuggingFace logo 在白名单中，应渲染为 <img>
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    const src = img!.getAttribute('src');
    expect(src).toMatch(/^data:image\/svg\+xml;base64,/);
    // 确认无内联 script 标签
    expect(container.querySelector('script')).toBeNull();
  });

  it('data URI 中不应包含 <script 标签', () => {
    const { container } = render(<ModelIcon modelId="claude" />);
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    const src = img!.getAttribute('src') || '';
    const decoded = atob(src.replace('data:image/svg+xml;base64,', ''));
    expect(decoded).not.toMatch(/<script/i);
    expect(decoded).not.toMatch(/on[a-z]+=/i);
  });
});
