import { Suspense, type ReactNode } from 'react';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { registerRefMediaKind, registerRefMediaName } from '@client/shared/media/refMediaRegistry';
import { useI18n } from '@client/shared/i18n';
import { useAppStore } from '@client/store';
import { lazyWithRetry } from '../routes';
import type { LibraryMedia } from './mediaIndex';

const CanvasRecentProjects = lazyWithRetry(() => import('@client/features/canvas/components/projects/CanvasRecentProjects'));
const MediaLibrary = lazyWithRetry(() => import('./MediaLibrary'));
export type AssetWorkspaceTab = 'history' | 'canvas';
const tabs = [{ id: 'history', label: '生成结果' }, { id: 'canvas', label: '画布项目' }] as const;

/** Keep the draft and add the original asset, including the selected angle of a scene. */
function addLibraryReference(item: LibraryMedia) {
  if (item.kind === 'audio') return;
  const state = useAppStore.getState();
  const video = state.quickGenMode === 'video';
  registerRefMediaKind(item.url, item.kind);
  registerRefMediaName(item.url, item.name);
  if (video && item.kind === 'image' && state.quickVideoRefMode === 'first_last_frame') {
    const { quickVideoFirstFrame: first, quickVideoLastFrame: last } = state;
    if (first === item.url || last === item.url) return;
    if (!first) return state.setQuickVideoFirstFrame(item.url);
    if (!last) return state.setQuickVideoLastFrame(item.url);
    throw new Error('首帧和尾帧都已有素材，请先在首页移除一帧。');
  }
  if (video && item.kind === 'image' && state.quickVideoRefMode === 'multi_frame') {
    state.setQuickVideoMultiFrames([...new Set([...state.quickVideoMultiFrames, item.url])]);
    return;
  }
  const frames = !video ? [] : state.quickVideoRefMode === 'first_last_frame'
    ? [state.quickVideoFirstFrame, state.quickVideoLastFrame].filter((url): url is string => Boolean(url))
    : state.quickVideoRefMode === 'multi_frame' ? state.quickVideoMultiFrames : [];
  const refs = [...new Set([...state.quickRefImages, ...frames, item.url])];
  const useVideo = video || refs.some(isVideoMediaUrl);
  useAppStore.setState({
    quickGenMode: useVideo ? 'video' : 'image',
    quickRefImage: refs[0], quickRefImages: refs,
    ...(useVideo && (item.kind === 'video' || !video || state.quickVideoRefMode === 'text') && { quickVideoRefMode: 'omni' }),
  });
}

export function ProjectMediaLibrary({ onOpenHome }: {
  onOpenHome: () => void;
  onOpenProject: (id: string, item: LibraryMedia) => void;
}) {
  const { t } = useI18n();
  return <MediaLibrary
    title={t('assets.materialLibrary')}
    onUseReference={media => { addLibraryReference(media); onOpenHome(); }}
    productionTools />;
}

export default function AssetWorkspace({ tab, onTabChange, onEnterCanvas, children }: {
  tab: AssetWorkspaceTab;
  onTabChange: (tab: AssetWorkspaceTab) => void;
  onEnterCanvas: (id: string) => void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const title = t('sidebar.assetWorkspace');
  return <section aria-label={title} className="flex min-h-0 flex-1 flex-col bg-white text-slate-900 dark:bg-[#111111] dark:text-stone-100">
    <nav aria-label={title} className="flex shrink-0 flex-wrap items-center gap-3 px-4 pb-5 pt-5 sm:px-9">
      {tabs.map(item => <a key={item.id} href={item.id === 'history' ? '?view=assets' : `?view=assets&tab=${item.id}`}
        aria-current={tab === item.id ? 'page' : undefined}
        onClick={event => { if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); onTabChange(item.id); }}
        className={`rounded-full px-4 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-sky-400 ${tab === item.id ? 'bg-slate-100 text-slate-950 dark:bg-white/10 dark:text-white' : 'text-slate-500 hover:text-slate-950 dark:text-stone-400 dark:hover:text-white'}`}>{item.label}</a>)}
    </nav>
    {tab === 'canvas' ? <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-12 sm:px-9">
      <Suspense fallback={<p role="status" className="py-8 text-sm text-stone-500">正在读取画布…</p>}><CanvasRecentProjects assetView maxDisplay={0} onEnterCanvas={onEnterCanvas} /></Suspense>
    </div> : children}
  </section>;
}
