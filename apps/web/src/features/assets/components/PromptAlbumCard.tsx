import { useState } from 'react';
import { Layers, Check, MoreHorizontal, Tag } from 'lucide-react';
import { proxyMediaUrl } from '@/shared/api/apiClient';
export default function PromptAlbumCard({ album, categoryName, matchedCount, searching, selected, batch, onOpen, onSelect, onClassify }: {
  album: { name: string; items: any[] }; categoryName: string; matchedCount: number; searching: boolean; selected: boolean; batch: boolean;
  onOpen: () => void; onSelect: () => void; onClassify: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [failedCover, setFailedCover] = useState<string | null>(null);
  const cover = album.items.find(item => item.coverUrl)?.coverUrl;
  const tags = String(album.items[0]?.tags || '').split(/[,，]/).filter(Boolean).slice(0,3);
  return <article className={`relative rounded-2xl border bg-white shadow-sm ${selected ? 'border-indigo-500 ring-2 ring-indigo-100' : 'border-slate-200'}`}>
    <button onClick={batch ? onSelect : onOpen} className="relative block w-full text-left group" aria-label={`打开图集 ${album.name}`}>
      <div className="h-56 bg-slate-100 overflow-hidden rounded-t-2xl">{cover && failedCover !== cover ? <img src={cover.startsWith('/') ? proxyMediaUrl(cover) : cover} referrerPolicy="no-referrer" onError={() => setFailedCover(cover)} alt={album.name} loading="lazy" className="w-full h-full object-cover object-center transition-transform group-hover:scale-[1.02]"/> : <Layers className="m-auto h-full text-slate-300"/>}</div>
      <span className="absolute right-3 top-3 bg-black/55 text-white rounded-lg px-2 py-1 text-xs">{album.items.length} 条提示词</span>
      {batch && <span className={`absolute top-3 left-3 w-6 h-6 rounded border bg-white flex items-center justify-center ${selected ? 'text-indigo-600' : 'text-transparent'}`}><Check size={16}/></span>}
      <div className="p-4"><div className="text-xs text-indigo-600 mb-2">{categoryName}</div><h3 className="font-semibold text-sm line-clamp-2 min-h-10">{album.name}</h3><div className="flex gap-1 mt-2 overflow-hidden h-5">{tags.map((tag,i) => <span key={i} className="text-[10px] text-slate-500 bg-slate-50 px-2 rounded whitespace-nowrap">{tag.trim()}</span>)}</div></div>
    </button>
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs"><div className="relative"><button title="图集更多操作" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)} className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-50"><MoreHorizontal size={16}/></button>{menuOpen && <div className="absolute bottom-full mb-1 left-0 z-20 w-32 bg-white shadow-lg border border-slate-200 rounded-lg p-1" onMouseLeave={() => setMenuOpen(false)}><button onClick={() => { setMenuOpen(false); onClassify(); }} className="flex gap-2 items-center w-full px-2 py-2 text-slate-600 hover:bg-slate-50"><Tag size={13}/>调整品类</button></div>}</div><button onClick={onOpen} className="text-indigo-600">{searching ? `命中 ${matchedCount} 条 · 查看` : '查看图集 →'}</button></div>
  </article>;
}
