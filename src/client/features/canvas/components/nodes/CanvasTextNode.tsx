import { StickyNote, Type, Frame } from 'lucide-react';
import type { CanvasNode } from '../../model/types';

export function CanvasTextNode({ node, onChange }: { node: CanvasNode; onChange: (patch: Partial<CanvasNode>) => void }) {
  const note = node.type === 'note';
  const frame = node.type === 'frame';
  const Icon = frame ? Frame : note ? StickyNote : Type;
  return <div style={{ height: node.height }} className={`flex h-full flex-col rounded-2xl border p-4 ${frame ? 'border-slate-300 dark:border-white/10 bg-slate-100/40 dark:bg-white/5' : note ? 'border-amber-200/70 dark:border-amber-800/50 bg-[#fff9e8] dark:bg-amber-950/30 shadow-sm' : 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1B1B1E] shadow-[0_6px_24px_rgba(71,85,105,0.06)] dark:shadow-none'}`}>
    <div className="mb-3 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400"><Icon size={15} /><input aria-label={`${frame ? '分镜' : note ? '便签' : '提示词'}名称`} readOnly={node.layerLocked} value={node.title || ''} onChange={e => onChange({title:e.target.value})} className="min-w-0 flex-1 bg-transparent text-slate-800 dark:text-slate-200 outline-none" /><span className="ml-auto text-[10px] font-normal text-slate-400 dark:text-slate-500">{frame ? '拖动标题移动区域' : note ? '记录想法' : '可连接到生成节点'}</span></div>
    {frame ? <p className="text-xs text-slate-400 dark:text-slate-500">{node.content || '将相关节点放在这里，整理一个镜头或一个创作分支。'}</p> : <textarea aria-label={note ? '便签内容' : '提示词内容'} readOnly={node.layerLocked} value={node.content || ''} onChange={event => onChange({ content: event.target.value })} onWheel={event => event.stopPropagation()} placeholder={note ? '记下灵感、反馈或待办…' : '描述主体、场景、风格或镜头…\n连接到图片 / 视频节点，复用这段提示词。'} className={`min-h-0 flex-1 resize-none bg-transparent text-sm leading-7 outline-none ${note ? 'text-slate-800 dark:text-amber-100 placeholder:text-amber-700/50 dark:placeholder:text-amber-500/50' : 'text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500'}`} />}
  </div>;
}
