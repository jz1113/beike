import { Suspense, type ReactNode } from 'react';
import { lazyWithRetry } from '../lazyWithRetry';

const CanvasRecentProjects = lazyWithRetry(() => import('@client/features/canvas/components/projects/CanvasRecentProjects'));
export type AssetWorkspaceTab = 'history' | 'canvas';
const tabs = [{ id: 'history', label: '生成结果' }, { id: 'canvas', label: '画布项目' }] as const;

export default function AssetWorkspace({ tab, onTabChange, onEnterCanvas, children }: {
  tab: AssetWorkspaceTab;
  onTabChange: (tab: AssetWorkspaceTab) => void;
  onEnterCanvas: (id: string) => void;
  children?: ReactNode;
}) {
  return <section aria-label="资产" className="flex min-h-0 flex-1 flex-col bg-white text-slate-900 dark:bg-[#111111] dark:text-stone-100">
    <nav aria-label="资产分类" className="flex shrink-0 flex-wrap items-center gap-3 px-4 pb-5 pt-5 sm:px-9">
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
