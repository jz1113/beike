import { useId, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Copy, Download, Ellipsis, FileText, FolderOpen, MessageCircle, PenTool, Trash2, X, Zap } from 'lucide-react';
import { AssistantSkillCardIcon } from '@client/shared/icons';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import MarkdownBody from '@client/shared/ui/markdown/MarkdownBody';
import { toolDisplayName } from '@shared/domain/assistant/tools/resultPresentation';
import type { AssistantSkill } from '@shared/domain/assistant/skills/types';
import { exportSkillPackage, skillPackageFiles, skillFilePreview, skillSourceLocation } from '../model/skillPackageView';
import { SkillPackageReader } from './SkillPackageReader';

export interface CodexSkillDetailModalProps {
  skill: AssistantSkill | null;
  isActive: boolean;
  onClose: () => void;
  onToggleActive: (skill: AssistantSkill) => void;
  onTryNow: (skill: AssistantSkill) => void;
  onEdit?: (skill: AssistantSkill) => void;
  onDelete?: (skill: AssistantSkill) => Promise<void> | void;
  showToast?: (message: string) => void;
  usePortal?: boolean;
}

export function assistantSkillTitle(skill: AssistantSkill): string {
  return skill.displayName || skill.name;
}

function SkillDetail({ skill, isActive, onClose, onToggleActive, onTryNow, onEdit, onDelete, showToast, usePortal = true }: CodexSkillDetailModalProps & { skill: AssistantSkill }) {
  const dialogRef = useModalDialog(true, onClose);
  const uid = useId();
  const [tab, setTab] = useState<'guide' | 'files' | 'capabilities'>('guide');
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const files = useMemo(() => skillPackageFiles(skill), [skill]);
  const title = assistantSkillTitle(skill);
  const copyText = async (text: string): Promise<boolean> => {
    try { await navigator.clipboard.writeText(text); showToast?.('已复制'); return true; }
    catch { showToast?.('复制失败，请检查剪贴板权限'); return false; }
  };
  const exportPackage = async () => {
    setExporting(true);
    try { await exportSkillPackage(skill); showToast?.('技能包已打包，请查看浏览器下载'); }
    catch (error) { showToast?.(error instanceof Error ? error.message : '导出失败'); }
    finally { setExporting(false); }
  };
  const tabs = [{ key: 'guide', label: '使用指南', icon: FileText }, { key: 'files', label: `技能文件 ${files.length}`, icon: FolderOpen }, { key: 'capabilities', label: '执行能力', icon: Zap }] as const;
  return <div className={`${usePortal ? 'fixed inset-0 z-[130]' : 'absolute inset-0 z-20'} flex items-center justify-center bg-slate-950/25 p-3 backdrop-blur-[3px] dark:bg-black/60 sm:p-6`} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${title} 技能`} aria-describedby={`${uid}-description`} className={`flex h-[min(740px,calc(100dvh-2rem))] w-full ${tab === 'files' ? 'max-w-[900px]' : 'max-w-[640px]'} flex-col overflow-hidden rounded-[24px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_28px_100px_-24px_rgba(15,23,42,0.35)] outline-none dark:border-white/10 dark:bg-[#1b1d20] dark:text-slate-100`}>
      <header className="shrink-0 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="flex items-start justify-between gap-4">
          <AssistantSkillCardIcon skill={skill} size="md" />
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" role="switch" aria-checked={isActive} aria-label={`本次指定 ${title}`} aria-describedby={`${uid}-selection-help`} onClick={() => onToggleActive(skill)} title="只控制本次对话的技能指定；取消后仍可自动匹配" className="flex h-8 items-center gap-2 rounded-lg px-1 text-[11px] text-slate-500 focus-visible:outline-2 focus-visible:outline-blue-500 dark:text-slate-400">
              <span>本次指定</span><span aria-hidden="true" className={`flex h-5 w-8 items-center rounded-full p-0.5 transition-colors ${isActive ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600'}`}><span className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform motion-reduce:transition-none ${isActive ? 'translate-x-3' : 'translate-x-0'}`} /></span>
            </button>
            <details className="relative" onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) event.currentTarget.open = false; }}>
              <summary aria-label="更多技能操作" title="更多操作" className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/10 [&::-webkit-details-marker]:hidden"><Ellipsis size={17} /></summary>
              <div className="absolute right-0 top-10 z-10 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg dark:border-white/10 dark:bg-[#27292d]" onClick={event => { const menu = event.currentTarget.closest('details'); if (menu) { menu.open = false; menu.querySelector('summary')?.focus(); } }}>
                <button type="button" onClick={() => void copyText(files[0].content)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-white/5"><Copy size={13} />复制 SKILL.md</button>
                <button type="button" onClick={() => void copyText(skill.id)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-white/5"><Copy size={13} />复制技能 ID</button>
                {!skill.isBuiltin && onEdit && <button type="button" onClick={() => onEdit(skill)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-slate-100 dark:hover:bg-white/5"><PenTool size={13} />编辑技能</button>}
              </div>
            </details>
            <button type="button" onClick={onClose} aria-label="关闭详情" className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"><X size={17} /></button>
          </div>
        </div>
        <h2 className="mt-4 text-xl font-semibold tracking-tight">{title}<span className="ml-2 text-base font-normal text-slate-400">技能</span></h2>
        <p id={`${uid}-description`} className="mt-1.5 text-sm leading-6 text-slate-500 dark:text-slate-400">{skill.description}</p>
        <p id={`${uid}-selection-help`} className="sr-only">只控制本次对话的技能指定。取消指定后，Agent 仍可按需自动匹配此技能。</p>
        <nav aria-label="技能详情" className="mt-5 flex gap-5" role="tablist">
          {tabs.map(({key,label,icon:Icon}) => <button type="button" key={key} id={`${uid}-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls={`${uid}-content`} tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={event => { if (event.nativeEvent.isComposing || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; event.preventDefault(); const i=tabs.findIndex(item=>item.key===key); const next=event.key==='Home'?tabs[0]:event.key==='End'?tabs[2]:tabs[(i+(event.key==='ArrowRight'?1:2))%3]; setTab(next.key); document.getElementById(`${uid}-tab-${next.key}`)?.focus(); }} className={`relative flex items-center gap-1.5 pb-3 text-xs focus-visible:outline-2 focus-visible:outline-blue-500 ${tab === key ? 'font-semibold text-slate-900 after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-slate-900 dark:text-white dark:after:bg-white' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}><Icon size={13} />{label}</button>)}
        </nav>
      </header>
      <div id={`${uid}-content`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`} tabIndex={0} className="mx-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-50/50 outline-offset-2 focus-visible:outline-2 focus-visible:outline-blue-500 sm:mx-6 dark:border-white/[0.07] dark:bg-white/[0.025]">
        {tab === 'guide' && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5"><MarkdownBody content={skillFilePreview(files[0]).body} className="text-[13px] leading-7" /><button type="button" onClick={() => setTab('files')} className="mt-6 flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs text-slate-500 hover:bg-white dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"><FolderOpen size={14} />浏览参考资料与完整技能包<ArrowUpRight size={13} /></button></div>}
        {tab === 'files' && <SkillPackageReader files={files} onCopy={copyText} />}
        {tab === 'capabilities' && <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5 text-[13px] sm:p-8">
          <section><h3 className="mb-2 font-semibold">技能信息</h3><p className="text-slate-500 dark:text-slate-400">{[skill.author || (skill.isBuiltin ? '官方' : '自定义'), skill.version ? `v${skill.version}` : '', skill.category, `${files.length} 个文件`].filter(Boolean).join(' · ')}</p></section>
          <section><h3 className="mb-2 font-semibold">如何使用</h3><p className="text-slate-500 dark:text-slate-400">Agent 匹配任务后按需读取指令；你也可以优先指定本次对话的技能。取消指定后，技能仍可自动匹配。</p></section>
          {skill.requires?.length ? <section><h3 className="mb-2 font-semibold">需要准备</h3><div className="flex flex-wrap gap-2">{skill.requires.map(input => <span key={input} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">{{ image:'参考图片', document:'文档或表格', url:'商品或作品链接' }[input]}</span>)}</div></section> : null}
          <section><h3 className="mb-2 font-semibold">可用工具</h3>{skill.tools?.length ? <div className="flex flex-wrap gap-2">{skill.tools.map(tool => <span key={tool} title={tool} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">{toolDisplayName(tool)}</span>)}</div> : <p className="text-slate-500 dark:text-slate-400">沿用当前助手已提供的工具权限。</p>}<p className="mt-3 text-xs leading-6 text-slate-400">参考资料按需读取。上传的脚本作为文件保存，不会自动运行；实际生成状态以工具回执和结果为准。</p></section>
          <section><h3 className="mb-2 font-semibold">文件位置</h3><div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 dark:bg-black/15"><code className="min-w-0 flex-1 break-all text-xs text-slate-500 dark:text-slate-400">{skillSourceLocation(skill)}</code><button type="button" onClick={() => void copyText(skillSourceLocation(skill))} aria-label="复制文件位置" className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-200/50 dark:hover:bg-white/10"><Copy size={14} /></button></div><p className="mt-2 text-xs leading-6 text-slate-400">导出 ZIP 可保留主指令与全部附属文件，在技能工作室导入后继续编辑。</p></section>
          <section className="flex flex-wrap gap-3"><button type="button" onClick={() => void copyText(skill.id)} className="text-xs text-slate-500 hover:underline">复制技能 ID</button><button type="button" onClick={() => void copyText(files[0].content)} className="text-xs text-slate-500 hover:underline">复制 SKILL.md</button>{!skill.isBuiltin && onEdit && <button type="button" onClick={() => onEdit(skill)} className="flex items-center gap-1 text-xs text-slate-500 hover:underline"><PenTool size={12} />编辑技能</button>}{!skill.isBuiltin && onDelete && <button type="button" disabled={deleting} onClick={async () => { setDeleting(true); try { await onDelete(skill); onClose(); } catch(error) { showToast?.(error instanceof Error ? error.message : '卸载失败'); } finally { setDeleting(false); } }} className="flex items-center gap-1 text-xs text-rose-500 disabled:opacity-50"><Trash2 size={12} />{deleting?'正在卸载':'卸载技能'}</button>}</section>
        </div>}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <button type="button" onClick={() => void exportPackage()} disabled={exporting} className="inline-flex items-center gap-1.5 rounded-full px-2 py-2 text-xs text-slate-500 transition hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-white"><Download size={14} />{exporting ? '正在打包' : '导出技能包'}</button>
        <button type="button" onClick={() => onTryNow(skill)} title="指定此技能并开始对话" className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-xs font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"><MessageCircle size={14} />立即使用<ArrowUpRight size={13} /></button>
      </footer>
    </div>
  </div>;
}

export function CodexSkillDetailModal(props: CodexSkillDetailModalProps) {
  if (!props.skill) return null;
  const content = <SkillDetail key={props.skill.id} {...props} skill={props.skill} />;
  return props.usePortal === false ? content : createPortal(content, document.body);
}
