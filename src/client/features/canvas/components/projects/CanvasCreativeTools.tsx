import storyboardArt from '@client/assets/creative-tools/storyboard.jpg';
import canvasArt from '@client/assets/creative-tools/canvas.jpg';
import imageEditArt from '@client/assets/creative-tools/image-edit.jpg';
import promptReverseArt from '@client/assets/creative-tools/prompt-reverse.jpg';
import productAnglesArt from '@client/assets/creative-tools/product-angles.jpg';
import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { CanvasToolSpotlight } from './CanvasToolSpotlight';
import { useCanvasHydrated } from '../../hooks/useCanvasHydrated';
import { useCanvasStore } from '../../store/useCanvasStore';
import { CanvasStorySetup } from './CanvasStorySetup';

const tools = [
  { id: 'storyboard', title: '短片分镜', hint: '脚本、关键帧与单镜视频', image: storyboardArt, status: '工作流' },
  { id: 'w3-copy', title: 'W3复刻模板', hint: '换四项素材 · H3 · 768P · 15秒静音', image: canvasArt, status: '工作流' },
  { id: 'image-edit', title: '图片编辑', hint: '参考原图，按指令修改', image: imageEditArt, status: '图片工具' },
  { id: 'canvas', title: '无限画布', hint: '串联灵感，自由创作', image: canvasArt, status: '已接入' },
  { id: 'product-angles', title: '商品多角度', hint: '正面、侧面与背面推测', image: productAnglesArt, status: '图片工具' },
  { id: 'prompt-reverse', title: '提示词反推', hint: '拆解构图、光线与风格', image: promptReverseArt, status: '图片工具' },
] as const;
export default function CanvasCreativeTools({ onEnterCanvas, onOpenImageTool }: { onEnterCanvas: () => void; onOpenImageTool: (tool: 'image-edit' | 'prompt-reverse' | 'product-angles') => void }) {
  const hydrated = useCanvasHydrated();
  const carousel = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  useEffect(() => {
    const element = carousel.current;
    if (!element) return;
    const update = () => setEdges({ start: element.scrollLeft <= 1, end: element.scrollLeft + element.clientWidth >= element.scrollWidth - 1 });
    const observer = new ResizeObserver(update);
    observer.observe(element); element.addEventListener('scroll', update, { passive: true }); update();
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); };
  }, []);
  const scroll = (direction: number) => {
    const element = carousel.current;
    if (!element) return;
    const gap = parseFloat(getComputedStyle(element).columnGap) || 8;
    const width = element.querySelector('button')?.getBoundingClientRect().width ?? element.clientWidth;
    const columns = Math.max(1, Math.floor((element.clientWidth + gap) / (width + gap)));
    element.scrollBy({ left: direction * columns * (width + gap), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  };
  const [storySetup, setStorySetup] = useState(false);
  const start = (id: string) => {
    if (id === 'image-edit' || id === 'prompt-reverse' || id === 'product-angles') { onOpenImageTool(id); return; }
    if (id === 'storyboard') { setStorySetup(true); return; }
    if (id === 'w3-copy') { useCanvasStore.getState().createProject(undefined,'w3-copy'); onEnterCanvas(); return; }
    useCanvasStore.getState().createProject();
    onEnterCanvas();
  };
  return <section aria-label="画布创作工具" className="mx-auto w-full max-w-[1720px]">
    <h2 className="sr-only">创作工具</h2>
    <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start">
      <CanvasToolSpotlight items={[tools[0], tools[2], tools[5]]} ready={hydrated} onSelect={start} />
      <div className="relative min-w-0 flex-1">
        <div ref={carousel} aria-label="创作工具列表" className="grid grid-flow-col grid-rows-2 gap-2 snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden" style={{ gridAutoColumns: 'minmax(min(320px, 100%), calc((100% - 24px) / 4))' }}>
      {tools.map(tool => {
        return <button key={tool.id} data-creative-tool={tool.id} type="button" disabled={(tool.id === 'canvas' || tool.id === 'storyboard' || tool.id === 'w3-copy') && !hydrated}
          onClick={() => start(tool.id)}
          className={`group flex min-w-0 snap-start items-center gap-3 h-[98px] rounded-2xl border border-black/5 bg-white/70 p-1 text-left transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400 disabled:opacity-50 dark:border-white/[0.04] dark:bg-[#1b1b1b] dark:hover:bg-[#252525] ${tool.id === 'storyboard' ? '!border-sky-500/15 dark:!bg-[#112a39]' : tool.id === 'canvas' ? '!border-teal-500/15 dark:!bg-[#103033]' : ''}`}>
          <span aria-hidden="true" className="relative h-[88px] w-[132px] shrink-0 overflow-hidden rounded-xl bg-slate-200 dark:bg-white/5">
            <img src={tool.image} alt="" width={640} height={427} loading="lazy" decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 motion-safe:group-hover:scale-105 motion-reduce:transition-none" />
          </span>
          <span className="min-w-0 py-2 pr-1">
            <span className="flex min-w-0 items-center gap-1 text-[13px] font-medium text-slate-900 dark:text-stone-100"><span className="min-w-0 truncate">{tool.title}</span>
              <span className="shrink-0 rounded bg-sky-500/10 px-1 py-0.5 text-[10px] font-normal text-sky-700 dark:text-sky-300">{tool.status}</span>
            </span>
            <span className="mt-1.5 block line-clamp-2 text-xs leading-5 text-slate-500 dark:text-stone-400">{tool.hint}</span>
          </span>
        </button>;
      })}
        </div>
        {!edges.start && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-[#f7f8fa] to-transparent dark:from-[#111111]" />}
        {!edges.end && <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#f7f8fa] to-transparent dark:from-[#111111]" />}
        <div className="pointer-events-none absolute inset-y-0 left-0 right-0 flex items-center justify-between">
          <button type="button" aria-label="查看前面的创作工具" disabled={edges.start} onClick={() => scroll(-1)} className="pointer-events-auto -ml-3 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-sm disabled:invisible dark:border-white/10 dark:bg-[#292929] dark:text-white"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" aria-label="查看后面的创作工具" disabled={edges.end} onClick={() => scroll(1)} className="pointer-events-auto -mr-3 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-sm disabled:invisible dark:border-white/10 dark:bg-[#292929] dark:text-white"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
    {storySetup && <CanvasStorySetup onClose={() => setStorySetup(false)} onEnterCanvas={onEnterCanvas} />}
  </section>;
}
