import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, Video, Text, Upload, Search, Sliders, FolderArchive, Tv, Music } from 'lucide-react';

export type CanvasQuickNodeType = 'prompt' | 'file' | 'image-generation' | 'video-generation' | 'compare' | 'save' | 'preview' | 'audio';
const entries = [
  { type: 'prompt' as const, label: '文本 / 提示词', keywords: '文字 text 提示词 剧本', Icon: Text },
  { type: 'image-generation' as const, label: '图片生成', keywords: '绘图 image 文生图 图生图', Icon: ImagePlus },
  { type: 'video-generation' as const, label: '视频生成', keywords: 'video 视频 文生视频 图生视频 续写', Icon: Video },
  { type: 'compare' as const, label: '前后对比', keywords: '对比 compare 卷帘 差异', Icon: Sliders },
  { type: 'audio' as const, label: 'AI 配音 / 语音', keywords: '音频 audio tts 声音 配音 旁白', Icon: Music },
  { type: 'preview' as const, label: '导演监视器', keywords: '监视 预览 monitor preview 大屏', Icon: Tv },
  { type: 'save' as const, label: '批量导出保存', keywords: '导出 保存 save export 打包 下载', Icon: FolderArchive },
  { type: 'file' as const, label: '导入素材', keywords: '上传 文件 图片 视频 音频 upload file', Icon: Upload },
];
export function CanvasNodeMenu({ x, y, onSelect, onClose }: { x: number; y: number; onSelect: (type: CanvasQuickNodeType) => void; onClose: () => void }) {
  const menu = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const items = entries.filter(item => `${item.label} ${item.keywords}`.toLowerCase().includes(query.trim().toLowerCase()));
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    menu.current?.querySelector('input')?.focus();
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) onClose(); };
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('pointerdown', outside); previous?.focus(); };
  }, [onClose]);
  return createPortal(<div ref={menu} role="dialog" aria-label="添加节点" onMouseDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); onClose(); }
    const buttons = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || []);
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement && items[0]) { event.preventDefault(); onSelect(items[0].type); }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && buttons.length) {
      event.preventDefault();
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      buttons[index < 0 ? (event.key === 'ArrowDown' ? 0 : buttons.length - 1) : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
    }
    if (event.key === 'Tab') {
      const focusable = Array.from(menu.current?.querySelectorAll<HTMLElement>('input, button') || []);
      if (event.shiftKey && document.activeElement === focusable[0]) {event.preventDefault();focusable.at(-1)?.focus();}
      else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {event.preventDefault();focusable[0]?.focus();}
    }
  }} className="fixed z-[100] w-[220px] max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-[#1B1B1E] p-1.5 text-slate-700 dark:text-[#C7C7CC] shadow-[0_12px_36px_rgba(15,23,42,0.13)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.6)]" style={{ left: Math.max(12, Math.min(x, window.innerWidth - 232)), top: Math.max(12, Math.min(y, window.innerHeight - 204)), maxHeight: 'calc(100dvh - 24px)', overflowY: 'auto' }}>
    <label className="flex h-9 items-center gap-2 px-2 text-slate-400 dark:text-slate-500"><input aria-label="搜索节点" placeholder="添加节点" value={query} onChange={event => setQuery(event.target.value)} className="min-w-0 flex-1 bg-transparent text-xs text-slate-600 dark:text-slate-200 outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500" /><Search size={15} strokeWidth={1.5} className="shrink-0" /></label>
    <div role="menu" aria-label="节点类型">{items.map(({ type, label, Icon }) => <button key={type} type="button" role="menuitem" onClick={() => onSelect(type)} className="flex h-9 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-sm transition-colors hover:bg-slate-100 dark:hover:bg-white/[0.06] hover:text-slate-900 dark:hover:text-white focus-visible:bg-slate-100 dark:focus-visible:bg-white/[0.06] focus-visible:text-slate-900 dark:focus-visible:text-white focus-visible:outline-none"><Icon size={17} strokeWidth={1.6} className="shrink-0 text-slate-600 dark:text-slate-400" />{label}</button>)}</div>
    {!items.length && <p role="status" className="px-2.5 py-4 text-xs text-slate-400 dark:text-slate-500">没有匹配的节点</p>}
  </div>, document.body);
}
