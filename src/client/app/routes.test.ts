import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { isAppView, normalizeAppView } from '@client/store/appView';
import type { ChatSession, GenerationTask } from '@client/store/appStoreTypes';
import { buildViewSearchParams, parseAssetLibraryTab, parseViewFromSearchParams } from './routes';
import { SidebarHistory } from './SidebarHistory';

const state = vi.hoisted(() => ({ sessions: [] as ChatSession[], currentSessionId: 'chat' }));
vi.mock('@client/store', () => ({ useAppStore: (select: (value: typeof state) => unknown) => select(state) }));
vi.mock('@client/shared/api/apiClient', () => ({ proxyMediaUrl: (url: string) => url }));
const render = () => renderToStaticMarkup(createElement(SidebarHistory, {
  currentView: 'generate', onOpenSession: vi.fn(), onCreateConversation: vi.fn(),
}));
const agent = { id: 'agent-task-current', mediaType: 'agent', prompt: 'hello', status: 'SUCCESS', createdAt: 3 } as GenerationTask;

describe('retired studio views', () => {
  it.each(['ppt_generator', 'avatar', 'digital_human', 'workshop', 'buyer_show', 'headline_poster', 'keyword_review', 'video_sales', 'daihuo'])('returns %s links and saved views to home', (view) => {
    expect(normalizeAppView(view)).toBe('home');
    expect(parseViewFromSearchParams(`?view=${view}`)).toBe('home');
    expect(isAppView(view)).toBe(false);
  });
});

describe('history and library navigation', () => {
  it.each(['assets', 'asset_library'] as const)('round trips the %s view independently', (view) => {
    expect(parseViewFromSearchParams(buildViewSearchParams(view))).toBe(view);
    expect(isAppView(view)).toBe(true);
  });
});

describe('asset library tab links', () => {
  it('restores the canvas tab from a shareable asset page URL', () => {
    const search = buildViewSearchParams('assets', { tab: 'canvas' });
    expect(parseViewFromSearchParams(search)).toBe('assets');
    expect(parseAssetLibraryTab(search)).toBe('canvas');
  });
  it('redirects the earlier library canvas link to the asset workspace', () => {
    expect(parseViewFromSearchParams('?view=asset_library&tab=canvas')).toBe('assets');
  });
  it.each(['', '?view=asset_library', '?view=asset_library&tab=unknown'])('keeps legacy and unknown links in the media library: %s', search => {
    expect(parseAssetLibraryTab(search)).toBe('media');
  });
});

describe('sidebar conversation history', () => {
  it('lists Agent conversations and excludes canvas projects, ordinary generations and empty drafts', () => {
    state.sessions = [
      { id: 'canvas-session:project-a', canvasProjectId: 'project-a', title: '画布专属对话', createdAt: 4, tasks: [agent] },
      { id: 'chat', title: '当前 Agent 对话', createdAt: 3, tasks: [agent] },
      { id: 'image', title: '普通生成记录', createdAt: 2, tasks: [{ ...agent, id: 'image-task', mediaType: 'image' }] },
      { id: 'empty', title: '空白草稿', createdAt: 1, tasks: [] },
    ];
    const html = render();
    expect(html).toContain('创作对话');
    expect(html).toContain('当前 Agent 对话');
    expect(html).not.toContain('>Agent<');
    expect(html).not.toContain('画布专属对话');
    expect(html).not.toContain('普通生成记录');
    expect(html).not.toContain('空白草稿');
    expect(html).not.toContain('尚无创作对话');
  });

  it('shows the empty state when existing records contain no Agent conversation', () => {
    state.sessions = [{ id: 'empty', title: '空白草稿', createdAt: 1, tasks: [] }];
    expect(render()).toContain('尚无创作对话');
  });
});
