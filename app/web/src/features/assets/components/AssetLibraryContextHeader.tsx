import { ArrowLeft, LayoutGrid, List } from 'lucide-react';
interface Props {
  categoryName: string;
  fullPrompt: boolean;
  albumCount: number;
  promptCount: number;
  album?: { name: string; count: number; matchedCount: number };
  filtered: boolean;
  albumShowAll: boolean;
  viewMode: 'albums' | 'items';
  onBack: () => void;
  onToggleAlbumAll: () => void;
  onClassifyAlbum: () => void;
  onViewMode: (mode: 'albums' | 'items') => void;
}
export default function AssetLibraryContextHeader(p: Props) {
  return <div className="px-6 pt-5 pb-3 bg-white flex flex-wrap items-center justify-between gap-3 shrink-0">
    <div className="min-w-0">
      {p.album && <button type="button" onClick={p.onBack} className="flex gap-1 items-center text-xs text-slate-500 hover:text-indigo-600 mb-2"><ArrowLeft size={13}/>{p.categoryName} / 返回图集</button>}
      <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1"><h1 className="text-xl font-semibold tracking-tight text-slate-900 truncate max-w-xl">{p.album?.name || p.categoryName}</h1>
        <span className="text-xs text-slate-400">{p.album ? `${p.album.count} 条提示词` : p.fullPrompt ? `${p.albumCount} 套图集 · ${p.promptCount} 条提示词` : `${p.promptCount} 条素材`}</span>
      </div>
    </div>
    {p.fullPrompt && <div className="flex items-center gap-3 text-xs">
      {p.album ? <>
        {p.filtered && <button onClick={p.onToggleAlbumAll} className="text-indigo-600">{p.albumShowAll ? '仅看命中条目' : `查看整套（命中 ${p.album.matchedCount} 条）`}</button>}
        <button onClick={p.onClassifyAlbum} className="text-slate-500 hover:text-indigo-600">调整图集品类</button>
      </> : <div className="flex bg-slate-100 p-0.5 rounded-lg" aria-label="浏览方式">{(['albums','items'] as const).map(mode => <button key={mode} aria-pressed={p.viewMode === mode} onClick={() => p.onViewMode(mode)} className={`flex gap-1.5 items-center px-3 py-1.5 rounded-md ${p.viewMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{mode === 'albums' ? <LayoutGrid size={13}/> : <List size={13}/>}{mode === 'albums' ? '图集' : '单条'}</button>)}</div>}
    </div>}
  </div>;
}
