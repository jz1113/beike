import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ChatSession } from '@client/store/appStoreTypes';
import { SidebarHistory } from './SidebarHistory';

const state = vi.hoisted(() => ({ sessions: [] as ChatSession[], currentSessionId: 'chat' }));
vi.mock('@client/store', () => ({ useAppStore: (select: (value: typeof state) => unknown) => select(state) }));
vi.mock('@client/shared/api/apiClient', () => ({ proxyMediaUrl: (url: string) => url }));

describe('sidebar conversation history', () => {
  it('labels generate and canvas conversations in one list', () => {
    state.sessions = [
      { id: 'canvas-session:project-a', canvasProjectId: 'project-a', title: '画布专属对话', createdAt: 2, tasks: [] },
      { id: 'chat', title: '正常聊天记录', createdAt: 1, tasks: [] },
    ];
    const html = renderToStaticMarkup(createElement(SidebarHistory, {
      currentView: 'generate', onOpenSession: vi.fn(), onOpenAssistantSession: vi.fn(), onCreateConversation: vi.fn(),
    }));
    expect(html).toContain('正常聊天记录');
    expect(html).toContain('画布专属对话');
    expect(html).toContain('生成');
    expect(html).toContain('画布');
  });
});
