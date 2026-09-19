import {justifiedRows} from '../../utils/justifiedRows';
import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { handleImgError } from '@/shared/media/imageError';
import { isVideoMediaUrl } from '@/shared/media/mediaHelper';
import { Search, X } from 'lucide-react';
import InspirationModal, { InspirationItem, InspirationUseOptions } from './InspirationModal';
import { INSPIRATION_ITEMS } from '../../data/inspirationData';
import { INSPIRATION_EAGER_COUNT, inspirationAspectRatio } from '../../utils/inspirationMedia';
import { LazyFeedVideo } from './LazyFeedVideo';
import { getStoryboardPresetById, persistStoryboardPreset } from '@beike/domain/prompt-engine/storyboardPreset';
import { useAppStore } from '@/store';

const INITIAL_VISIBLE = 24;
const LOAD_MORE_STEP = 16;

interface Props {
  onUsePrompt: (prompt: string, refMedia?: string, opts?: InspirationUseOptions) => void;
}

export default function InspirationFeed({ onUsePrompt }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModalItem, setSelectedModalItem] = useState<InspirationItem | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [feedWidth,setFeedWidth]=useState(1200);
  const [mediaRatios,setMediaRatios]=useState<Record<string,number>>({});
  const rememberRatio=(id:string|number,ratio:number)=>{
    if(Number.isFinite(ratio) && ratio>0)setMediaRatios(previous=>Math.abs((previous[id] || 0)-ratio)<0.001?previous:{...previous,[id]:ratio});
  };

  const mixedItems=useMemo(()=>{
    // Fixed shuffle seed keeps pagination, search and modal navigation consistent.
    const shuffled=[...INSPIRATION_ITEMS];
    let seed=20260910;
    for(let i=shuffled.length-1;i>0;i--){
      seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
      const j=Math.floor(((seed>>>0)/4294967296)*(i+1));
      [shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];
    }
    const videos=shuffled.filter(item=>item.mediaType==='video' || !!item.video || isVideoMediaUrl(item.image));
    const images=shuffled.filter(item=>!videos.includes(item));
    if(!videos.length || !images.length)return shuffled;
    const result:InspirationItem[]=[];
    let imageIndex=0;
    videos.forEach((video,index)=>{
      const end=Math.round((index+1)*images.length/videos.length);
      result.push(...images.slice(imageIndex,Math.min(imageIndex+2,end)),video,...images.slice(Math.min(imageIndex+2,end),end));
      imageIndex=end;
    });
    return result;
  },[]);
  const filteredItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return mixedItems;
    return mixedItems.filter((item) => {
      return (
        item.title.toLowerCase().includes(q) ||
        item.prompt.toLowerCase().includes(q) ||
        (item.tag && item.tag.toLowerCase().includes(q))
      );
    });
  }, [searchTerm,mixedItems]);

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE);
  }, [searchTerm]);

  const visibleItems = useMemo(
    () => filteredItems.slice(0, visibleCount),
    [filteredItems, visibleCount],
  );
  const hasMore = visibleCount < filteredItems.length;
  const ratios=visibleItems.map(item=>{
    const [w,h]=inspirationAspectRatio(item).split('/').map(Number);
    return mediaRatios[item.id] || w/h;
  });
  const rows=justifiedRows(ratios,feedWidth);


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
    if (!el || !hasMore) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) handleLoadMore();
      },
      { rootMargin: '400px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [hasMore, handleLoadMore, visibleItems.length]);

  const scrollHubToTop = () => {
    const hub = document.querySelector('[data-hub-scroll]') as HTMLElement | null;
    if (hub) hub.scrollTo({ top: 0, behavior: 'smooth' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="w-full space-y-3.5 pt-2 select-none">
      {/* 搜索工具栏 (紧凑药丸尺寸，对标用户画框) */}
      <div className="flex items-center select-none">
        <div className="relative w-52 sm:w-60 md:w-64">
          <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索爆款灵感 / 提示词"
            className="w-full pl-9 sm:pl-10 pr-8 sm:pr-9 py-1.5 sm:py-2 rounded-full bg-[#F4F5F8] border border-transparent text-xs sm:text-[13px] text-slate-800 placeholder-slate-400 outline-none focus:border-slate-300 focus:bg-white transition-all shadow-2xs"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
              title="清空搜索"
              aria-label="清空搜索"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <div className="py-16 text-center text-sm text-slate-400">
          无匹配结果，试试切换分类或更换关键词
        </div>
      ) : (
        <>
          <div ref={gridRef} className="flex flex-col gap-1">
            {rows.map(row=><div key={visibleItems[row[0]].id} className="flex gap-1" style={{height:(feedWidth-4*(row.length-1))/row.reduce((sum,index)=>sum+ratios[index],0)}}>
            {row.map(index => {
              const item=visibleItems[index];
              const isVideo=item.mediaType==='video' || !!item.video || isVideoMediaUrl(item.image);
              const eager = index < INSPIRATION_EAGER_COUNT;
              return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedModalItem(item)}
                    style={{flex:`${ratios[index]} 1 0%`}}
                    className="min-w-0 h-full rounded-lg bg-slate-100 shadow-2xs hover:shadow-md transition-all duration-300 overflow-hidden group cursor-pointer relative border border-slate-100/80"
                  >
                    <div
                      className="relative w-full h-full overflow-hidden rounded-lg"
                    >

                      {isVideo ? (
                        <LazyFeedVideo
                          src={item.video || item.image}
                          poster={item.poster}
                          onAspectRatio={ratio=>rememberRatio(item.id,ratio)}
                          className="w-full h-full object-contain block rounded-lg bg-slate-100"
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
                          className="w-full h-full object-cover block transition-transform duration-500 group-hover:scale-103 bg-slate-100"
                        />
                      )}
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

      <InspirationModal
        item={selectedModalItem}
        allItems={filteredItems}
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
      />
    </div>
  );
}
