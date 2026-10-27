import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { KeywordReviewRuleEditor } from './KeywordReviewRuleEditor';
import { apiFetch } from '@client/shared/api/apiClient';

const hooks = vi.hoisted(() => ({ index: 0, states: [] as unknown[] }));
vi.mock('react', async (original) => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {}, useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    const index = hooks.index++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (next: unknown) => { hooks.states[index] = typeof next === 'function' ? next(hooks.states[index]) : next; }];
  },
}));
vi.mock('@client/shared/api/apiClient', () => ({ apiFetch: vi.fn(async () => new Response('{}', { status: 500 })) }));

function findPublishButton(node: ReactNode): ReactElement<{ onClick: () => void }> | undefined {
  if (Array.isArray(node)) return node.map(findPublishButton).find(Boolean);
  if (!node || typeof node !== 'object' || !('props' in node)) return;
  const element = node as ReactElement<{ children?: ReactNode; onClick: () => void }>;
  if (element.type === 'button' && element.props.children === '发布新版本') return element;
  return findPublishButton(element.props.children);
}

beforeEach(() => {
  vi.clearAllMocks();
  hooks.index = 0;
  hooks.states = [{ version: 1, entries: [], note: '旧规则', createdAt: null }, [], [], '更新说明', '', false, false, '', 0, false, false];
});

describe('keyword rule publishing guards', () => {
  it('does not publish stale editor state after reloading rules failed', () => {
    hooks.states[7] = '读取失败';
    const button = findPublishButton(KeywordReviewRuleEditor({ open: true, mode: 'image' }));
    expect(button).toBeDefined();
    button!.props.onClick();
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('rejects a one-character revision note before making a request', () => {
    hooks.states[3] = '改';
    const button = findPublishButton(KeywordReviewRuleEditor({ open: true, mode: 'image' }));
    button!.props.onClick();
    expect(apiFetch).not.toHaveBeenCalled();
  });
});
