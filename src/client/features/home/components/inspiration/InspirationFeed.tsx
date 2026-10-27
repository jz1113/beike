import { visibleJustifiedRows } from '../../model/justifiedRows';
import { useMemo, useState, useRef, useEffect, useLayoutEffect, useCallback, lazy, Suspense } from 'react';
import type { InspirationItem, InspirationUseOptions } from '../../model/inspirationItem';
import { INSPIRATION_ITEMS } from '../../data/inspirationData';
import { INSPIRATION_EAGER_COUNT, inspirationAspectRatio } from '../../model/inspirationMedia';
import { LazyFeedVideo } from './LazyFeedVideo';
import { FeedImage } from './FeedImage';
import { INSPIRATION_MEDIA_FILTERS, isInspirationVideo, type InspirationMediaFilter } from './inspirationFilters';
import { HOME_PUBLISHED_EVENT, HOME_PUBLISHED_STORAGE_KEY, readPublishedHomeItems, type PublishedHomeItem } from '@client/shared/home-publish/homePublish';
import { CanvasShowcase } from './CanvasShowcase';
import { useViewVisibility } from '@client/shared/hooks/useViewVisibility';

// 限制首屏附近的图片并发下载与解码；用户开始浏览后再逐批补齐。
const INITIAL_VISIBLE = 10;
const LOAD_MORE_STEP = 10;
const InspirationModal = lazy(() => import('./InspirationModal'));

interface Props {
  onUsePrompt: (prompt: string, refMedia?: string, opts?: InspirationUseOptions) => void;
}

const FEED_GAP = 8;

export default function InspirationFeed({ onUsePrompt }: Props) {
  const isVisible = useViewVisibility();
  const [mediaFilter, setMediaFilter] = useState<InspirationMediaFilter>('image');
  const [published, setPublished] = useState<PublishedHomeItem[]>(() => readPublishedHomeItems());
  const [selectedModalItem, setSelectedModalItem] = useState<InspirationItem | null>(null);
  const [selectedCanvasItem, setSelectedCanvasItem] = useState<PublishedHomeItem | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [hasStartedBrowsing, setHasStartedBrowsing] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const previewTriggerRef = useRef<HTMLElement | null>(null);
  const [feedWidth, setFeedWidth] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setSelectedModalItem(null);
      setSelectedCanvasItem(null);
    }
  }, [isVisible]);

  const filteredItems = useMemo(() => {
    const mine = published.filter(item => isInspirationVideo(item) === (mediaFilter === 'video'));
    const seeded = INSPIRATION_ITEMS.filter(item => isInspirationVideo(item) === (mediaFilter === 'video'));
    return [...mine, ...seeded];
  }, [published, mediaFilter]);

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
  }, [mediaFilter, published]);

  // 用户开始滚动后逐批加载；首批不足一屏时只补到页面可以滚动。
  useEffect(() => {
    const hub = gridRef.current?.closest<HTMLElement>('[data-hub-scroll]');
    if (!hub) return;
    const onScroll = () => {
      if (hub.scrollTop > 0) setHasStartedBrowsing(true);
    };
    onScroll();
    hub.addEventListener('scroll', onScroll, { passive: true });
    return () => hub.removeEventListener('scroll', onScroll);
  }, [mediaFilter, published, isVisible]);

  // Layout uses declared ratios before media loads. Decode, retry, and video playback
  // must not resize cards or move them between rows.
  const ratios = useMemo(() => filteredItems.map(item => {
    const [w, h] = inspirationAspectRatio({ aspectRatio: 'aspectRatio' in item ? item.aspectRatio : undefined }).split('/').map(Number);
    return w / h;
  }), [filteredItems]);
  const rows = useMemo(
    () => visibleJustifiedRows(ratios, feedWidth, visibleCount, FEED_GAP),
    [ratios, feedWidth, visibleCount],
  );
  const renderedItemCount = (rows.at(-1)?.at(-1) ?? -1) + 1;
  const hasMore = renderedItemCount < filteredItems.length;


  useLayoutEffect(()=>{
    if (!isVisible) return;
    const grid=gridRef.current;if(!grid)return;
    const measure=()=>{
      const width=grid.clientWidth;
      if(Number.isFinite(width) && width>0)setFeedWidth(width);
    };
    measure();
    const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(measure):null;
    observer?.observe(grid);
    window.addEventListener('resize',measure);
    return ()=>{observer?.disconnect();window.removeEventListener('resize',measure);};
  },[filteredItems.length, isVisible]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount(Math.min(renderedItemCount + LOAD_MORE_STEP, filteredItems.length));
  }, [filteredItems.length, renderedItemCount]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore || !isVisible || feedWidth <= 0) return;
    const hub = gridRef.current?.closest<HTMLElement>('[data-hub-scroll]');
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

  const openItem = (item: InspirationItem | PublishedHomeItem, trigger: HTMLElement) => {
    previewTriggerRef.current = trigger;
    if ('publishedKind' in item && item.publishedKind === 'canvas') setSelectedCanvasItem(item);
    else setSelectedModalItem(item);
  };

  const closePreview = () => {
    setSelectedModalItem(null);
    setSelectedCanvasItem(null);
    const trigger = previewTriggerRef.current;
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected && !trigger.closest('[inert]')) trigger.focus();
    });
  };

  const scrollHubToTop = () => {
    const hub = gridRef.current?.closest<HTMLElement>('[data-hub-scroll]');
    if (hub) hub.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="w-full space-y-3.5 pt-2 select-none">
      <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">精选作品</h2>
      <div role="tablist" aria-label="素材类型" className="inline-flex rounded-full bg-[#F4F5F8] p-1 dark:bg-[#1B1B1E]">
        {INSPIRATION_MEDIA_FILTERS.map((item) => {
          const selected = mediaFilter === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setMediaFilter(item.id)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${selected ? 'bg-white text-slate-900 shadow-sm dark:bg-[#2C2C32] dark:text-white' : 'text-slate-500 hover:text-slate-800 dark:text-[#8E8E93] dark:hover:text-[#EDEDED]'}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {filteredItems.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">
          这里还没有{mediaFilter === 'video' ? '视频' : '图片'}
        </div>
      ) : (
        <>
          <div ref={gridRef} className="flex flex-col gap-2">
            {rows.map(row=><div key={filteredItems[row[0]].id} className="flex gap-2" style={{height:(feedWidth-FEED_GAP*(row.length-1))/row.reduce((sum,index)=>sum+ratios[index],0)}}>
            {row.map(index => {
              const item=filteredItems[index];
              const isVideo=isInspirationVideo(item);
              const eager = index < INSPIRATION_EAGER_COUNT;
              return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    aria-label={item.title}
                    onClick={event => openItem(item, event.currentTarget)}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openItem(item, event.currentTarget);
                      }
                    }}
                    style={{flex:`${ratios[index]} 1 0%`}}
                    className="min-w-0 h-full rounded-xl bg-slate-100 dark:bg-[#13161C] shadow-2xs hover:shadow-lg dark:shadow-[0_4px_24px_rgba(0,0,0,0.6)] transition-shadow duration-300 overflow-hidden group cursor-pointer relative border border-slate-200/80 dark:border-white/10 ring-1 ring-slate-900/5 dark:ring-white/5"
                  >
                    <div
                      className="relative w-full h-full overflow-hidden rounded-lg"
                    >

                      {isVideo ? (
                        <LazyFeedVideo
                          src={item.video || item.image}
                          poster={item.poster}
                          className="w-full h-full object-contain block rounded-lg bg-slate-100 dark:bg-slate-800"
                        />
                      ) : (
                        <FeedImage
                          key={item.image}
                          src={'thumbnail' in item && typeof item.thumbnail === 'string' && item.thumbnail ? item.thumbnail : item.image}
                          fallbackSrc={item.image}
                          alt={item.title}
                          eager={eager}
                          className="w-full h-full object-contain block transition-transform duration-500 ease-out group-hover:scale-[1.04] bg-slate-100 dark:bg-slate-800"
                        />
                      )}
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/55 to-transparent px-2.5 pb-2 pt-8 opacity-0 transition-opacity group-hover:opacity-100">
                        <p className="truncate text-xs font-medium text-white">{item.title}</p>
                      </div>
                      {isVideo && (
                        <span aria-label="视频" className="pointer-events-none absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/35 text-white/90 backdrop-blur-sm">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M19 10.268c1.333.77 1.333 2.694 0 3.464L8.5 19.794c-1.333.77-3-.192-3-1.732V5.938c0-1.54 1.667-2.502 3-1.732L19 10.268Z" fill="currentColor" />
                          </svg>
                        </span>
                      )}
                    </div>
                  </div>
              );
            })}
            </div>)}
          </div>
          {hasMore ? <div ref={loadMoreRef} className="h-8 w-full" aria-hidden /> : null}
        </>
      )}

      {isVisible && selectedCanvasItem && <CanvasShowcase key={selectedCanvasItem.id} item={selectedCanvasItem} onClose={closePreview} />}

      {isVisible && selectedModalItem && <Suspense fallback={null}><InspirationModal
        key={selectedModalItem.id}
        item={selectedModalItem}
        allItems={filteredItems.filter(item => !('publishedKind' in item) || item.publishedKind !== 'canvas')}
        isOpen={!!selectedModalItem}
        onClose={closePreview}
        onUsePromptOnly={(prompt) => {
          onUsePrompt(prompt);
          scrollHubToTop();
        }}
        onUseAsReference={(prompt, imgUrl, opts) => {
          onUsePrompt(prompt, imgUrl, opts);
          scrollHubToTop();
        }}
        onNavigate={(newItem) => setSelectedModalItem(newItem)}
      /></Suspense>}
    </div>
  );
}
