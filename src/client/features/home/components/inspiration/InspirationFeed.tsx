import { useMemo, useState, useRef, useEffect, useLayoutEffect, useCallback, lazy, Suspense } from 'react';
import {
  INSPIRATION_EAGER_COUNT,
  inspirationAspectRatio,
  matchesInspirationSearch,
  visibleJustifiedRows,
  type InspirationItem,
  type InspirationUseOptions,
} from '../../model/inspirationItem';
import { INSPIRATION_ITEMS } from '../../data/inspirationData';
import { LazyFeedVideo, FeedImage } from './LazyFeedVideo';
import { isVideoMediaUrl } from '@client/shared/media/mediaHelper';
import { HOME_PUBLISHED_EVENT, HOME_PUBLISHED_STORAGE_KEY, readPublishedHomeItems, type PublishedHomeItem } from '@client/shared/home-publish/homePublish';
import { CanvasShowcase } from './CanvasShowcase';
import { useViewVisibility } from '@client/shared/hooks/useSafeTimeout';
import { Search, X } from 'lucide-react';

type InspirationMediaFilter = 'all' | 'image' | 'video';

const INSPIRATION_MEDIA_FILTERS: { id: InspirationMediaFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
];

function isInspirationVideo(item: { mediaType?: 'all' | 'image' | 'video'; video?: string; image: string }) {
  return item.mediaType === 'video' || !!item.video || isVideoMediaUrl(item.image);
}

function InspirationToolbar({ query, onQueryChange, mediaFilter, onMediaChange, searchRef }: {
  query: string; onQueryChange: (value: string) => void;
  mediaFilter: InspirationMediaFilter; onMediaChange: (value: InspirationMediaFilter) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  return <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3">
    <div role="tablist" aria-label="素材类型" className="inline-flex shrink-0 rounded-full bg-slate-100 p-0.5 dark:bg-white/5"
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); const index = INSPIRATION_MEDIA_FILTERS.findIndex(item => item.id === mediaFilter);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowLeft' ? -1 : 1) + 3) % 3;
        onMediaChange(INSPIRATION_MEDIA_FILTERS[next].id); event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
      }}>
      {INSPIRATION_MEDIA_FILTERS.map(item => <button key={item.id} type="button" role="tab" aria-selected={mediaFilter === item.id} tabIndex={mediaFilter === item.id ? 0 : -1}
        onClick={() => onMediaChange(item.id)} className={`rounded-full px-3 py-1.5 text-xs transition-colors ${mediaFilter === item.id ? 'bg-white text-slate-950 shadow-xs dark:bg-white/10 dark:text-white' : 'text-slate-500 dark:text-stone-400'}`}>{item.label}</button>)}
    </div>
    <form role="search" aria-label="搜索首页作品" onSubmit={event => event.preventDefault()} className="relative ml-auto w-full sm:w-[312px]">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
      <input ref={searchRef} type="search" aria-label="搜索作品" value={query} onChange={event => onQueryChange(event.target.value)}
        onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); onQueryChange(''); } }}
        placeholder="搜索作品、提示词或作者" className="h-9 w-full rounded-lg border border-slate-200 bg-transparent pl-9 pr-9 text-xs text-slate-800 outline-offset-2 placeholder:text-slate-400 dark:border-white/10 dark:text-stone-200 dark:placeholder:text-slate-400 [&::-webkit-search-cancel-button]:appearance-none" />
      {query && <button type="button" aria-label="清除作品搜索" onClick={() => { onQueryChange(''); searchRef.current?.focus(); }} className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-black/5 dark:hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>}
    </form>
  </div>;
}

// 限制首屏附近的图片并发下载与解码；用户开始浏览后再逐批补齐。
const INITIAL_VISIBLE = 10;
const LOAD_MORE_STEP = 10;
const InspirationModal = lazy(() => import('./InspirationModal'));

interface Props {
  onUsePrompt: (prompt: string, opts: InspirationUseOptions) => string | undefined;
}

const FEED_GAP = 8;

export default function InspirationFeed({ onUsePrompt }: Props) {
  const isVisible = useViewVisibility();
  const [query, setQuery] = useState('');
  const [mediaFilter, setMediaFilter] = useState<InspirationMediaFilter>('all');
  const [published, setPublished] = useState<PublishedHomeItem[]>(() => readPublishedHomeItems());
  const [selectedId, setSelectedId] = useState<InspirationItem['id'] | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [hasStartedBrowsing, setHasStartedBrowsing] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const nextFocusIndex = useRef<number | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const [feedWidth, setFeedWidth] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setSelectedId(null);
      previewTriggerRef.current = null;
    }
  }, [isVisible]);

  const filteredItems = useMemo(() => {
    const mine = published.filter(item => mediaFilter === 'all' || isInspirationVideo(item) === (mediaFilter === 'video'));
    const seeded = INSPIRATION_ITEMS.filter(item => mediaFilter === 'all' || isInspirationVideo(item) === (mediaFilter === 'video'));
    return [...mine, ...seeded].filter(item => matchesInspirationSearch(item, query));
  }, [published, mediaFilter, query]);

  const selectedItem = selectedId === null ? undefined : filteredItems.find(item => item.id === selectedId);
  const selectedCanvasItem = selectedItem && 'publishedKind' in selectedItem && selectedItem.publishedKind === 'canvas' ? selectedItem : undefined;
  const selectedModalItem = selectedCanvasItem ? undefined : selectedItem;

  const openPreview = (id: InspirationItem['id'], trigger: HTMLElement) => {
    previewTriggerRef.current = trigger;
    setSelectedId(id);
  };

  const closePreview = useCallback(() => {
    setSelectedId(null);
    const trigger = previewTriggerRef.current;
    previewTriggerRef.current = null;
    requestAnimationFrame(() => {
      const target = trigger?.isConnected ? trigger : searchRef.current;
      if (!target?.closest('[inert]')) target?.focus();
    });
  }, []);

  useEffect(() => {
    if (isVisible && selectedId !== null && !selectedItem) closePreview();
  }, [closePreview, isVisible, selectedId, selectedItem]);

  useEffect(() => {
    const refresh = () => setPublished(readPublishedHomeItems());
    const refreshStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === HOME_PUBLISHED_STORAGE_KEY) refresh();
    };
    window.addEventListener(HOME_PUBLISHED_EVENT, refresh);
    window.addEventListener('storage', refreshStorage);
    return () => {
      window.removeEventListener(HOME_PUBLISHED_EVENT, refresh);
      window.removeEventListener('storage', refreshStorage);
    };
  }, []);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
    setHasStartedBrowsing(false);
  }, [mediaFilter, query]);

  // 用户开始滚动后逐批加载；首批不足一屏时只补到页面可以滚动。
  useEffect(() => {
    const hub = feedRef.current?.closest<HTMLElement>('[data-hub-scroll]');
    if (!isVisible || !hub) return;
    const onScroll = () => {
      if (hub.scrollTop > 0) setHasStartedBrowsing(true);
    };
    onScroll();
    hub.addEventListener('scroll', onScroll, { passive: true });
    return () => hub.removeEventListener('scroll', onScroll);
  }, [mediaFilter, query, isVisible]);

  // Layout uses declared ratios before media loads. Decode, retry, and video playback
  // must not resize cards or move them between rows.
  const ratios = useMemo(() => filteredItems.map(item => {
    const [w, h] = inspirationAspectRatio(item).split('/').map(Number);
    return w / h;
  }), [filteredItems]);
  const rows = useMemo(
    () => visibleJustifiedRows(ratios, feedWidth, visibleCount, FEED_GAP),
    [ratios, feedWidth, visibleCount],
  );
  const renderedItemCount = (rows.at(-1)?.at(-1) ?? -1) + 1;
  const hasMore = renderedItemCount < filteredItems.length;

  useLayoutEffect(() => {
    if (nextFocusIndex.current === null) return;
    gridRef.current?.querySelectorAll<HTMLButtonElement>('[data-work-preview]')[nextFocusIndex.current]?.focus();
    nextFocusIndex.current = null;
  }, [renderedItemCount]);

  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!isVisible || !grid) return;
    const measure = () => {
      const width = grid.clientWidth;
      if (width > 0) setFeedWidth(width);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(grid);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [filteredItems.length, isVisible]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount(Math.min(renderedItemCount + LOAD_MORE_STEP, filteredItems.length));
  }, [filteredItems.length, renderedItemCount]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore || !isVisible || feedWidth <= 0 || typeof IntersectionObserver === 'undefined') return;
    const hub = feedRef.current?.closest<HTMLElement>('[data-hub-scroll]');
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && (hasStartedBrowsing || (hub && hub.scrollHeight <= hub.clientHeight + 1))) {
          handleLoadMore();
        }
      },
      { root: hub, rootMargin: '400px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, hasStartedBrowsing, handleLoadMore, isVisible, feedWidth]);

  return (
    <div ref={feedRef} className="w-full space-y-3.5 pt-2 select-none">
      <h2 className="sr-only">精选作品</h2>
      <InspirationToolbar query={query} onQueryChange={setQuery} mediaFilter={mediaFilter} onMediaChange={setMediaFilter} searchRef={searchRef} />

      {filteredItems.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">
          <p role="status">{query.trim() ? '没有找到匹配的作品' : `这里还没有${mediaFilter === 'all' ? '作品' : mediaFilter === 'video' ? '视频' : '图片'}`}</p>
          {(query) && <button type="button" onClick={() => { setQuery(''); setMediaFilter('all'); searchRef.current?.focus(); }} className="mt-3 rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100 dark:text-stone-300 dark:hover:bg-white/5">重置筛选</button>}
        </div>
      ) : (
        <>
          <div ref={gridRef} className="flex flex-col gap-2">
            {rows.map(row => {
              const height = (feedWidth - FEED_GAP * (row.length - 1)) / row.reduce((sum, index) => sum + ratios[index], 0);
              return (
                <div key={filteredItems[row[0]].id} className="flex gap-2" style={{ height }}>
                  {row.map(index => (
                    <InspirationCard
                      key={filteredItems[index].id}
                      item={filteredItems[index]}
                      ratio={ratios[index]}
                      eager={index < INSPIRATION_EAGER_COUNT}
                      onOpen={openPreview}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          {hasMore && (
            <div ref={loadMoreRef} className="flex justify-center pt-2">
              <button type="button" onClick={() => {
                nextFocusIndex.current = renderedItemCount;
                handleLoadMore();
              }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
                加载更多作品
              </button>
            </div>
          )}
        </>
      )}

      {isVisible && selectedCanvasItem && <CanvasShowcase key={selectedCanvasItem.id} item={selectedCanvasItem} onClose={closePreview} />}

      {isVisible && selectedModalItem && <Suspense fallback={null}><InspirationModal
        key={selectedModalItem.id}
        item={selectedModalItem}
        allItems={filteredItems.filter(item => !('publishedKind' in item) || item.publishedKind !== 'canvas')}
        isOpen={!!selectedModalItem}
        onClose={closePreview}
        onUsePrompt={(prompt, opts) => {
          const error = onUsePrompt(prompt, opts);
          if (!error) {
            previewTriggerRef.current = null;
            setSelectedId(null);
          }
          return error;
        }}
        onNavigate={(newItem) => setSelectedId(newItem.id)}
      /></Suspense>}
    </div>
  );
}

function InspirationCard({ item, ratio, eager, onOpen }: {
  item: InspirationItem | PublishedHomeItem;
  ratio: number;
  eager: boolean;
  onOpen: (id: InspirationItem['id'], trigger: HTMLElement) => void;
}) {
  const isVideo = isInspirationVideo(item);
  const previewButton = (
    <button
      type="button"
      data-work-preview
      aria-label={item.title}
      onClick={event => {
        onOpen(item.id, event.currentTarget);
      }}
      className="absolute inset-0 z-10 w-full cursor-pointer text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-indigo-500"
    >
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-8 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <span className="block truncate text-xs font-medium text-white">{item.title}</span>
      </span>
      {'publishedKind' in item && item.publishedKind === 'canvas' && (
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/55 px-2 py-1 text-xs text-white backdrop-blur-sm">画布作品</span>
      )}
      {isVideo && (
        <span aria-hidden="true" className="pointer-events-none absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white/90 backdrop-blur-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M19 10.268c1.333.77 1.333 2.702 0 3.464L8.5 19.794c-1.333.77-3-.192-3-1.732V5.938c0-1.54 1.667-2.502 3-1.732L19 10.268Z" fill="currentColor" />
          </svg>
        </span>
      )}
    </button>
  );
  return (
    <div
      key={item.id}
      style={{ flex: `${ratio} 1 0%` }}
      className="group relative h-full min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-slate-100 shadow-2xs ring-1 ring-slate-900/5 transition-shadow duration-300 hover:shadow-lg dark:border-white/10 dark:bg-[#13161C] dark:shadow-[0_4px_24px_rgba(0,0,0,0.6)] dark:ring-white/5"
    >
      {isVideo ? (
        <LazyFeedVideo src={item.video || item.image} poster={item.poster}
          className="block h-full w-full rounded-lg bg-slate-100 object-contain dark:bg-slate-800">
          {previewButton}
        </LazyFeedVideo>
      ) : (
        <>
          <FeedImage
            key={item.image}
            src={'thumbnail' in item && item.thumbnail ? item.thumbnail : item.image}
            fallbackSrc={item.image}
            eager={eager}
            className="block h-full w-full bg-slate-100 object-contain transition-transform duration-500 ease-out group-hover:scale-[1.04] dark:bg-slate-800"
          />
          {previewButton}
        </>
      )}
    </div>
  );
}
