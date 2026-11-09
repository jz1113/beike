import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Film, Image, Search } from 'lucide-react';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { useAppStore } from '@client/store';
import { fetchAssetTasks } from '@client/shared/api/generation/generationApi';
import { fetchSalesStudioAssets, getGlobalAssetLibrary } from '@client/shared/api/assetLibraryCache';
import { loadCustomAssets } from '@client/shared/media/customAssetStorage';
import { getNextAssetPage, resolveAssetMediaType } from '@client/shared/utils/assetTaskData';

type Source = 'history' | 'library';
type Media = { url: string; title: string; video: boolean };

function MediaPreview({ item }: { item: Media }) {
  const [failed, setFailed] = useState(false);
  const Icon = item.video ? Film : Image;
  const className = 'absolute inset-0 h-full w-full object-cover';
  return (
    <span className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-lg bg-slate-200 text-slate-500 dark:bg-white/10 dark:text-slate-300">
      <Icon className="h-5 w-5" aria-hidden="true" />
      {!failed && (item.video
        ? <video src={item.url} muted playsInline preload="metadata" className={className} onError={() => setFailed(true)} />
        : <img src={item.url} alt="" loading="lazy" className={className} onError={() => setFailed(true)} />)}
    </span>
  );
}

export function PromptBarAssetPickerModal({ onClose }: { onClose: () => void }) {
  const dialogRef = useModalDialog(true, onClose);
  const [source, setSource] = useState<Source>('history');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [library] = useState(loadCustomAssets);
  const history = useInfiniteQuery({
    queryKey: ['assets', 'reference-picker-history'],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) => fetchAssetTasks(pageParam, 40, signal),
    getNextPageParam: (page, _pages, index) => getNextAssetPage(page, index),
    enabled: source === 'history',
  });

  const catalog = useQuery({
    queryKey: ['assets', 'reference-picker-catalog'],
    queryFn: ({ signal }) => fetchSalesStudioAssets(signal),
    enabled: source === 'library',
  });
  const shared = useQuery({
    queryKey: ['assets', 'reference-picker-shared'],
    queryFn: () => getGlobalAssetLibrary(),
    enabled: source === 'library',
  });

  const items = new Map<string, Media>();
  const add = (url: string, title: string, kind: string) => {
    if (!url || items.has(url) || !['image', 'video', 'depth-image', 'depth-video'].includes(kind)) return;
    items.set(url, { url, title, video: kind.endsWith('video') });
  };
  if (source === 'history') {
    for (const { tasks } of history.data?.pages ?? []) {
      for (const task of tasks) {
        if (task.status !== 'SUCCESS' || ('isUploaded' in task && task.isUploaded === true)) continue;
        for (const url of [task.resultUrl, ...(task.images ?? [])]) {
          if (url) add(url, task.title || task.prompt || '生成作品', resolveAssetMediaType(task.mediaType, task.model, url));
        }
      }
    }
  } else {
    for (const scene of catalog.data?.scenes ?? []) {
      const url = scene.coverUrl || scene.sourceImages[0];
      if (url) add(url, scene.title, 'image');
    }
    for (const persona of catalog.data?.personas ?? []) {
      const url = persona.avatarUrl || persona.identityUrl || persona.fullBodyUrl || persona.faceUrl || persona.sourceImages[0];
      if (url) add(url, persona.name, 'image');
    }
    for (const asset of [...(shared.data?.scenes ?? []), ...(shared.data?.personas ?? [])]) {
      if (asset.coverUrl) add(asset.coverUrl, asset.title || asset.name || '素材', 'image');
    }
    for (const asset of library) {
      const url = asset.mediaUrl || asset.coverUrl;
      if (url && !asset.scriptId && !asset.placementKey) add(url, asset.name, resolveAssetMediaType(asset.mediaKind, '', url));
    }
  }
  const visible = [...items.values()].filter(item => item.title.toLowerCase().includes(query.trim().toLowerCase()));
  const selection = [...selected].filter(url => items.has(url));
  const loading = source === 'history' ? history.isPending : catalog.isPending || shared.isPending;
  const failed = source === 'history' ? history.isError : catalog.isError || shared.isError;
  const retry = () => {
    if (source === 'history') void history.refetch();
    else {
      if (catalog.isError) void catalog.refetch();
      if (shared.isError) void shared.refetch();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs" onClick={onClose}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="历史或素材" onClick={event => event.stopPropagation()}
        className="flex max-h-[88vh] w-full max-w-4xl flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl dark:border-white/10 dark:bg-[#18191c]">
        <div className="flex flex-wrap shrink-0 items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-white/10">
          <div className="flex gap-2">
            {(['history', 'library'] as const).map(tab => (
              <button key={tab} type="button" aria-pressed={source === tab} onClick={() => {
                setSource(tab);
                setQuery('');
                setSelected(new Set());
              }} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 aria-pressed:bg-slate-100 aria-pressed:text-slate-950 dark:text-slate-300 dark:aria-pressed:bg-white/10 dark:aria-pressed:text-white">
                {tab === 'history' ? '历史' : '素材'}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-sm dark:bg-white/10">
            <Search className="h-4 w-4" aria-hidden="true" />
            <input aria-label="搜索素材" placeholder={source === 'history' ? '搜索已加载的作品' : '搜索素材'} value={query}
              onChange={event => setQuery(event.target.value)} className="w-40 bg-transparent" />
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {loading && <p role="status" className="py-10 text-center text-sm">{source === 'history' ? '正在加载生成历史…' : '正在加载素材…'}</p>}
          {failed && <p role="alert" className="py-4 text-center text-sm">{source === 'history' ? '生成历史加载失败' : '部分素材加载失败'} <button type="button" className="underline" onClick={retry}>重试</button></p>}
          {!loading && !failed && visible.length === 0 && (
            <p className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
              {query.trim() ? '已加载的内容中没有匹配项' : source === 'history'
                ? '暂无可引用的生成作品' : '素材库暂无可引用的图片或视频。'}
            </p>
          )}
          <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map(item => (
              <button type="button" key={item.url} title={item.title} aria-pressed={selected.has(item.url)}
                className="min-w-0 rounded-lg text-left aria-pressed:ring-2 aria-pressed:ring-indigo-500"
                onClick={() => setSelected(previous => {
                  const next = new Set(previous);
                  if (next.has(item.url)) next.delete(item.url);
                  else next.add(item.url);
                  return next;
                })}>
                <MediaPreview item={item} />
                <span className="block line-clamp-2 min-h-10 px-1 pt-2 text-xs leading-4">{item.title}</span>
              </button>
            ))}
          </div>
          {source === 'history' && history.hasNextPage && !failed && (
            <button type="button" disabled={history.isFetching} onClick={() => void history.fetchNextPage()}
              className="mx-auto mt-4 block rounded-lg px-4 py-2 text-sm hover:bg-slate-100 dark:hover:bg-white/10">
              {history.isFetchingNextPage ? '正在加载…' : '加载更多'}
            </button>
          )}
        </div>
        <div className="flex justify-end shrink-0 gap-3 border-t border-slate-200 pt-3 dark:border-white/10">
          <button type="button" onClick={onClose} className="rounded-full px-5 py-2 text-sm">取消</button>
          <button type="button" disabled={!selection.length} onClick={() => {
            selection.forEach(url => useAppStore.getState().addQuickRefImage(url));
            onClose();
          }} className="rounded-full bg-slate-900 px-5 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-slate-900">
            {selection.length ? `添加（${selection.length}）` : '添加'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
