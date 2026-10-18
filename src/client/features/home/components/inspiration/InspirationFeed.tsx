import {justifiedRows} from '../../model/justifiedRows';
import { useMemo, useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { handleImgError } from '@client/shared/media/imageError';
import type { InspirationItem, InspirationUseOptions } from './InspirationModal';
import { INSPIRATION_ITEMS } from '../../data/inspirationData';
import { INSPIRATION_EAGER_COUNT, inspirationAspectRatio } from '../../model/inspirationMedia';
import { LazyFeedVideo } from './LazyFeedVideo';
import { INSPIRATION_MEDIA_FILTERS, isInspirationVideo, type InspirationMediaFilter } from './inspirationFilters';
import { HOME_PUBLISHED_EVENT, readPublishedHomeItems, type PublishedHomeItem } from '@client/shared/home-publish/homePublish';
import { CanvasShowcase } from './CanvasShowcase';
import { getStoryboardPresetById, persistStoryboardPreset } from '@shared/domain/prompts/prompt-engine/storyboardPreset';
import { useAppStore } from '@client/store';

// 限制首屏附近的图片并发下载与解码；用户开始浏览后再逐批补齐。
const INITIAL_VISIBLE = 10;
const LOAD_MORE_STEP = 10;
const InspirationModal = lazy(() => import('./InspirationModal'));

interface Props {
  onUsePrompt: (prompt: string, refMedia?: string, opts?: InspirationUseOptions) => void;
}

const FEED_GAP = 8;

export default function InspirationFeed({ onUsePrompt }: Props) {
  const [mediaFilter, setMediaFilter] = useState<InspirationMediaFilter>('image');
  const [published, setPublished] = useState<PublishedHomeItem[]>(() => readPublishedHomeItems());
  const [selectedModalItem, setSelectedModalItem] = useState<InspirationItem | null>(null);
  const [selectedCanvasItem, setSelectedCanvasItem] = useState<PublishedHomeItem | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [hasStartedBrowsing, setHasStartedBrowsing] = useState(false);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const ratioUpdateFrameRef = useRef<number | null>(null);
  const pendingRatiosRef = useRef<Record<string, number>>({});
  const [feedWidth,setFeedWidth]=useState(1200);
  const [mediaRatios,setMediaRatios]=useState<Record<string,number>>({});
  const rememberRatio=useCallback((id:string|number,ratio:number)=>{
    if(!Number.isFinite(ratio) || ratio<=0)return;
    pendingRatiosRef.current[String(id)] = ratio;
    if (ratioUpdateFrameRef.current !== null) return;
    ratioUpdateFrameRef.current = window.requestAnimationFrame(() => {
      ratioUpdateFrameRef.current = null;
      const pending = pendingRatiosRef.current;
      pendingRatiosRef.current = {};
      setMediaRatios(previous => {
        let changed = false;
        const next = { ...previous };
        for (const [key, value] of Object.entries(pending)) {
          if (Math.abs((previous[key] || 0) - value) >= 0.001) {
            next[key] = value;
            changed = true;
          }
        }
        return changed ? next : previous;
      });
    });
  },[]);

  const filteredItems = useMemo(() => {
    const mine = published.filter(item => isInspirationVideo(item) === (mediaFilter === 'video'));
    const seeded = INSPIRATION_ITEMS.filter(item => isInspirationVideo(item) === (mediaFilter === 'video'));
    return [...mine, ...seeded];
  }, [published, mediaFilter]);

  useEffect(() => {
    const refresh = () => setPublished(readPublishedHomeItems());
    window.addEventListener(HOME_PUBLISHED_EVENT, refresh);
    return () => window.removeEventListener(HOME_PUBLISHED_EVENT, refresh);
  }, []);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
    setHasStartedBrowsing(false);
  }, [mediaFilter, published]);

  // 原生 lazy-loading 会预取视口下方一大段图片。若哨兵初始就在视口内，
  // 自动分页会立刻把整条瀑布流渲染出来，抵消首屏限流效果。
  useEffect(() => {
    const hub = document.querySelector('[data-hub-scroll]') as HTMLElement | null;
    if (!hub) return;
    const onScroll = () => {
      if (hub.scrollTop > 80) setHasStartedBrowsing(true);
    };
    hub.addEventListener('scroll', onScroll, { passive: true });
    return () => hub.removeEventListener('scroll', onScroll);
  }, []);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount],
  );
  const hasMore = visibleCount < filteredItems.length;
  const ratios=visibleItems.map(item=>{
    const [w,h]=inspirationAspectRatio({ aspectRatio: 'aspectRatio' in item ? item.aspectRatio : undefined }).split('/').map(Number);
    return mediaRatios[item.id] || w/h;
  });
  const rows=justifiedRows(ratios,feedWidth,FEED_GAP);


  useEffect(()=>{
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
  },[filteredItems.length]);

  const handleLoadMore = useCallback(() => {
    setVisibleCount((n) => Math.min(n + LOAD_MORE_STEP, filteredItems.length));
  }, [filteredItems.length]);

  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasMore || !hasStartedBrowsing) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) handleLoadMore();
      },
      { rootMargin: '400px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, hasStartedBrowsing, handleLoadMore, visibleItems.length]);

  const openItem = (item: InspirationItem | PublishedHomeItem) => {
    if ('publishedKind' in item && item.publishedKind === 'canvas') setSelectedCanvasItem(item);
    else setSelectedModalItem(item);
  };

  const scrollHubToTop = () => {
    const hub = document.querySelector('[data-hub-scroll]') as HTMLElement | null;
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
            {rows.map(row=><div key={visibleItems[row[0]].id} className="flex gap-2 [content-visibility:auto] [contain-intrinsic-size:180px]" style={{height:(feedWidth-FEED_GAP*(row.length-1))/row.reduce((sum,index)=>sum+ratios[index],0)}}>
            {row.map(index => {
              const item=visibleItems[index];
              const isVideo=isInspirationVideo(item);
              const eager = index < INSPIRATION_EAGER_COUNT;
              return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    aria-label={item.title}
                    onClick={() => openItem(item)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openItem(item);
                      }
                    }}
                    style={{flex:`${ratios[index]} 1 0%`}}
                    className="min-w-0 h-full rounded-xl bg-slate-100 dark:bg-[#13161C] shadow-2xs hover:shadow-lg dark:shadow-[0_4px_24px_rgba(0,0,0,0.6)] transition-all duration-300 overflow-hidden group cursor-pointer relative border border-slate-200/80 dark:border-white/10 ring-1 ring-slate-900/5 dark:ring-white/5"
                  >
                    <div
                      className="relative w-full h-full overflow-hidden rounded-lg"
                    >

                      {isVideo ? (
                        <LazyFeedVideo
                          src={item.video || item.image}
                          poster={item.poster}
                          onAspectRatio={ratio=>rememberRatio(item.id,ratio)}
                          className="w-full h-full object-contain block rounded-lg bg-slate-100 dark:bg-slate-800"
                        />
                      ) : (
                        <img
                          src={item.image}
                          alt={item.title}
                          onLoad={event=>rememberRatio(item.id,event.currentTarget.naturalWidth/event.currentTarget.naturalHeight)}
                          loading={eager ? 'eager' : 'lazy'}
                          fetchPriority={eager ? 'high' : undefined}
                          decoding="async"
                          referrerPolicy="no-referrer"
                          onError={(e) => handleImgError(e, item.image)}
                          className="w-full h-full object-cover block transition-transform duration-500 ease-out group-hover:scale-[1.04] bg-slate-100 dark:bg-slate-800"
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

      {selectedCanvasItem && <CanvasShowcase item={selectedCanvasItem} onClose={() => setSelectedCanvasItem(null)} />}

      {selectedModalItem && <Suspense fallback={null}><InspirationModal
        item={selectedModalItem}
        allItems={filteredItems.filter(item => !('publishedKind' in item) || item.publishedKind !== 'canvas')}
        isOpen={!!selectedModalItem}
        onClose={() => setSelectedModalItem(null)}
        onUsePromptOnly={(prompt) => {
          onUsePrompt(prompt);
          scrollHubToTop();
        }}
        onUseAsReference={(prompt, imgUrl, opts) => {
          onUsePrompt(prompt, imgUrl, opts);
          scrollHubToTop();
        }}
        onNavigate={(newItem) => setSelectedModalItem(newItem)}
        onApplyPreset={(presetId) => {
          const preset = getStoryboardPresetById(presetId);
          if (preset) {
            persistStoryboardPreset(preset);
            // 同步首页出图数量，与旧 setQuickStoryboardPreset 行为一致
            useAppStore.getState().setQuickCount(preset.shotCount);
          }
        }}
        availablePresets={INSPIRATION_ITEMS
          .filter(i => i.storyboardPresetId)
          .map(i => {
            const p = getStoryboardPresetById(i.storyboardPresetId!);
            return p ? { ...p, storyboardPresetId: i.storyboardPresetId } : null;
          })
          .filter(Boolean) as any}
      /></Suspense>}
    </div>
  );
}
