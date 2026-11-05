import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';

interface SpotlightItem { id: string; title: string; hint: string; image: string }

export function CanvasToolSpotlight({ items, ready, onSelect }: { items: readonly SpotlightItem[]; ready: boolean; onSelect: (id: string) => void }) {
  const [index, setIndex] = useState(0);
  const item = items[index];
  return <div role="group" aria-label="创作推荐" className="relative h-[204px] w-full shrink-0 overflow-hidden rounded-2xl bg-slate-950 lg:w-[22%] lg:min-w-[240px] lg:max-w-[380px]">
    <button type="button" disabled={item.id === 'storyboard' && !ready} onClick={() => onSelect(item.id)} aria-label={`推荐：${item.title}`}
      className="group relative h-full w-full text-left text-white focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-sky-300 disabled:opacity-50">
      <img key={item.id} src={item.image} alt="" width={640} height={427} className="h-full w-full object-cover transition-transform duration-500 motion-safe:group-hover:scale-105 motion-reduce:transition-none" />
      <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
      <span className="absolute left-4 top-4 rounded-md border border-white/20 bg-black/20 px-2 py-1 text-[11px] backdrop-blur-sm">创作推荐</span>
      <span className="absolute bottom-5 left-4 right-16">
        <span className="block text-xl font-semibold">{item.title}</span>
        <span className="mt-1 block text-xs text-white/65">{item.hint}</span>
      </span>
      <ArrowUpRight aria-hidden="true" className="absolute right-4 top-4 h-4 w-4 text-white/70" />
    </button>
    <div className="absolute bottom-5 right-4 flex gap-1.5" aria-label="切换创作推荐">
      {items.map((entry, i) => <button key={entry.id} type="button" aria-label={`查看推荐：${entry.title}`} aria-pressed={i === index} onClick={() => setIndex(i)}
        className="flex h-6 w-5 items-center justify-center rounded focus-visible:outline-2 focus-visible:outline-sky-300"><span className={`h-1.5 rounded-full transition-colors ${i === index ? 'w-3 bg-white' : 'w-1.5 bg-white/40'}`} /></button>)}
    </div>
  </div>;
}
