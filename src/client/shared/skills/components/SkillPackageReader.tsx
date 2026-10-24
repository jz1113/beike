import { useState } from 'react';
import { Check, Code2, Copy, FileCode2, FileText, Folder, PanelLeft } from 'lucide-react';
import MarkdownBody from '@client/shared/ui/markdown/MarkdownBody';
import type { AssistantSkillFile } from '@shared/domain/assistant/skills/types';
import { skillFilePreview } from '../model/skillPackageView';

export function SkillPackageReader({ files, onCopy }: { files: AssistantSkillFile[]; onCopy: (text: string) => Promise<boolean> }) {
  const [selected, setSelected] = useState('SKILL.md');
  const [source, setSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const [navigation, setNavigation] = useState(true);
  const file = files.find(item => item.path === selected) || files[0];
  const preview = skillFilePreview(file);
  const groups = new Map<string, AssistantSkillFile[]>();
  for (const item of files) {
    const folder = item.path.includes('/') ? item.path.slice(0, item.path.lastIndexOf('/')) : '';
    groups.set(folder, [...(groups.get(folder) || []), item]);
  }
  return <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
    {navigation && <aside aria-label="技能文件目录" className="hidden w-52 shrink-0 overflow-y-auto border-r border-slate-200/70 bg-slate-50/70 px-3 py-4 sm:block dark:border-white/[0.07] dark:bg-black/10">
      <p className="mb-4 px-2 text-[10px] font-semibold tracking-widest text-slate-400">文件目录 · {files.length}</p>
      {Array.from(groups, ([folder, items]) => <div key={folder} className="mb-3">
        {folder && <p className="mb-1 flex items-center gap-1.5 px-2 py-1 text-[11px] text-slate-400"><Folder size={12} /><span className="truncate" title={folder}>{folder}</span></p>}
        {items.map(item => <button type="button" key={item.path} onClick={() => { setSelected(item.path); setCopied(false); }} aria-pressed={file.path === item.path} title={item.path}
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[12px] ${file.path === item.path ? 'bg-white font-medium text-slate-900 shadow-xs dark:bg-white/10 dark:text-white' : 'text-slate-500 hover:bg-slate-200/40 dark:text-slate-400 dark:hover:bg-white/5'}`}>
          {/\.md$/i.test(item.path) ? <FileText size={13} className="shrink-0" /> : <FileCode2 size={13} className="shrink-0" />}<span className="truncate">{item.path.split('/').pop()}</span>
        </button>)}
      </div>)}
    </aside>}
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="文件内容">
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-2 border-b border-slate-200/70 px-4 dark:border-white/[0.07]">
        <div className="flex min-w-0 items-center gap-2">
          <button type="button" onClick={() => setNavigation(value => !value)} aria-label={navigation ? '收起文件目录' : '展开文件目录'} className="hidden rounded-md p-1 text-slate-400 hover:bg-slate-100 sm:block dark:hover:bg-white/5"><PanelLeft size={14} /></button>
          <span className="hidden truncate font-mono text-[11px] text-slate-500 sm:block dark:text-slate-400" title={file.path}>{file.path}</span>
          <select aria-label="选择技能文件" value={file.path} onChange={event => { setSelected(event.target.value); setCopied(false); }} className="min-w-0 bg-transparent py-2 text-xs text-slate-500 sm:hidden dark:bg-[#1b1d20] dark:text-slate-300">{files.map(item => <option key={item.path} value={item.path}>{item.path}</option>)}</select>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {preview.markdown && <button type="button" aria-pressed={source} onClick={() => setSource(value => !value)} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5"><Code2 size={13} />{source ? '阅读' : '源码'}</button>}
          <button type="button" aria-label="复制当前文件" onClick={async () => { setCopied(await onCopy(file.content)); }} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/5">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? '已复制' : '复制'}</button>
        </div>
      </div>
      <div key={`${file.path}:${source}`} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:px-7 sm:py-6">
        {preview.markdown && !source ? <MarkdownBody content={preview.body} className="text-[13px] leading-7" /> : <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-6 text-slate-600 dark:text-slate-300">{file.content}</pre>}
      </div>
    </section>
  </div>;
}
