import { useRef } from 'react';
import { Search, X } from 'lucide-react';
import { INSPIRATION_MEDIA_FILTERS, type InspirationMediaFilter } from './inspirationFilters';

export function InspirationToolbar({ query, onQueryChange, mediaFilter, onMediaChange }: {
  query: string; onQueryChange: (value: string) => void;
  mediaFilter: InspirationMediaFilter; onMediaChange: (value: InspirationMediaFilter) => void;
}) {
  const search = useRef<HTMLInputElement>(null);
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
      <input ref={search} type="search" aria-label="搜索作品" value={query} onChange={event => onQueryChange(event.target.value)}
        onKeyDown={event => { if (event.key === 'Escape' && !event.nativeEvent.isComposing) { event.preventDefault(); onQueryChange(''); } }}
        placeholder="搜索作品、提示词或作者" className="h-9 w-full rounded-lg border border-slate-200 bg-transparent pl-9 pr-9 text-xs text-slate-800 outline-offset-2 placeholder:text-slate-400 dark:border-white/10 dark:text-stone-200 [&::-webkit-search-cancel-button]:appearance-none" />
      {query && <button type="button" aria-label="清除作品搜索" onClick={() => { onQueryChange(''); search.current?.focus(); }} className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-black/5 dark:hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>}
    </form>
  </div>;
}
