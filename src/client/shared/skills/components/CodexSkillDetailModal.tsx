import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Check, Copy, Download, FileText, FolderOpen, MessageCircle, PenTool, Pin, Trash2, X, Zap } from 'lucide-react';
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
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`${title} 技能`} className="flex h-[min(780px,90dvh)] w-full max-w-[940px] flex-col overflow-hidden rounded-[24px] border border-slate-200/80 bg-white text-slate-900 shadow-[0_28px_100px_-24px_rgba(15,23,42,0.35)] outline-none dark:border-white/10 dark:bg-[#1b1d20] dark:text-slate-100">
      <header className="shrink-0 px-5 pt-5 sm:px-8 sm:pt-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3.5">
            <AssistantSkillCardIcon skill={skill} size="lg" />
            <div className="min-w-0"><p className="mb-1 text-[10px] font-medium tracking-wider text-slate-400 dark:text-slate-500">{skill.category || 'AGENT SKILL'}</p><h2 className="text-lg font-semibold tracking-tight sm:text-[22px]">{title}</h2></div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" aria-pressed={isActive} onClick={() => onToggleActive(skill)} title="只控制本次对话的技能指定" className={`hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-xs transition sm:flex ${isActive ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300' : 'bg-slate-100 text-slate-500 dark:bg-white/[0.06] dark:text-slate-400'}`}>{isActive ? <Check size={13} /> : <Pin size={13} />}{isActive ? '本次已指定' : '本次指定'}</button>
            <button type="button" onClick={onClose} aria-label="关闭详情" className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"><X size={17} /></button>
          </div>
        </div>
        <p className="mt-4 max-w-[760px] text-[13px] leading-6 text-slate-500 dark:text-slate-400">{skill.description}</p>
        <div className="mb-5 mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-slate-400 dark:text-slate-500"><span>{skill.author || (skill.isBuiltin ? '官方' : '自定义')}</span>{skill.version && <span>v{skill.version}</span>}<span>{files.length} 个文件</span><span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />按需调用</span></div>
        <nav aria-label="技能详情" className="flex gap-5 border-b border-slate-200/80 dark:border-white/[0.08]" role="tablist">
          {tabs.map(({key,label,icon:Icon}) => <button type="button" key={key} id={`skill-detail-tab-${key}`} role="tab" aria-selected={tab === key} aria-controls="skill-detail-content" tabIndex={tab === key ? 0 : -1} onClick={() => setTab(key)} onKeyDown={event => { if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return; event.preventDefault(); const i=tabs.findIndex(item=>item.key===key); const next=event.key==='Home'?tabs[0]:event.key==='End'?tabs[2]:tabs[(i+(event.key==='ArrowRight'?1:2))%3]; setTab(next.key); document.getElementById(`skill-detail-tab-${next.key}`)?.focus(); }} className={`relative flex items-center gap-1.5 pb-3 text-xs ${tab === key ? 'font-semibold text-slate-900 after:absolute after:inset-x-0 after:bottom-[-1px] after:h-0.5 after:bg-slate-900 dark:text-white dark:after:bg-white' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}><Icon size={13} />{label}</button>)}
        </nav>
      </header>
      <div id="skill-detail-content" role="tabpanel" aria-labelledby={`skill-detail-tab-${tab}`} className="flex min-h-0 flex-1 flex-col">
        {tab === 'guide' && <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-8"><div className="mx-auto max-w-[760px]"><MarkdownBody content={skillFilePreview(files[0]).body} className="text-[13px] leading-7" /><button type="button" onClick={() => setTab('files')} className="mt-6 flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-xs text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"><FolderOpen size={14} />浏览参考资料与完整技能包<ArrowUpRight size={13} /></button></div></div>}
        {tab === 'files' && <SkillPackageReader files={files} onCopy={copyText} />}
        {tab === 'capabilities' && <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-5 text-[13px] sm:p-8">
          <section><h3 className="mb-2 font-semibold">如何使用</h3><p className="text-slate-500 dark:text-slate-400">Agent 匹配任务后按需读取指令；你也可以优先指定本次对话的技能。取消指定后，技能仍可自动匹配。</p></section>
          {skill.requires?.length ? <section><h3 className="mb-2 font-semibold">需要准备</h3><div className="flex flex-wrap gap-2">{skill.requires.map(input => <span key={input} className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">{{ image:'参考图片', document:'文档或表格', url:'商品或作品链接' }[input]}</span>)}</div></section> : null}
          <section><h3 className="mb-2 font-semibold">可用工具</h3>{skill.tools?.length ? <div className="flex flex-wrap gap-2">{skill.tools.map(tool => <span key={tool} title={tool} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">{toolDisplayName(tool)}</span>)}</div> : <p className="text-slate-500 dark:text-slate-400">沿用当前助手已提供的工具权限。</p>}<p className="mt-3 text-xs leading-6 text-slate-400">参考资料按需读取。上传的脚本作为文件保存，不会自动运行；实际生成状态以工具回执和结果为准。</p></section>
          <section><h3 className="mb-2 font-semibold">文件位置</h3><div className="flex items-center gap-2 rounded-xl bg-slate-50 p-3 dark:bg-black/15"><code className="min-w-0 flex-1 break-all text-xs text-slate-500 dark:text-slate-400">{skillSourceLocation(skill)}</code><button type="button" onClick={() => void copyText(skillSourceLocation(skill))} aria-label="复制文件位置" className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-200/50 dark:hover:bg-white/10"><Copy size={14} /></button></div><p className="mt-2 text-xs leading-6 text-slate-400">导出 ZIP 可保留主指令与全部附属文件，在技能工作室导入后继续编辑。</p></section>
          <section className="flex flex-wrap gap-3"><button type="button" onClick={() => void copyText(skill.id)} className="text-xs text-slate-500 hover:underline">复制技能 ID</button><button type="button" onClick={() => void copyText(files[0].content)} className="text-xs text-slate-500 hover:underline">复制 SKILL.md</button>{!skill.isBuiltin && onEdit && <button type="button" onClick={() => onEdit(skill)} className="flex items-center gap-1 text-xs text-slate-500 hover:underline"><PenTool size={12} />编辑技能</button>}{!skill.isBuiltin && onDelete && <button type="button" disabled={deleting} onClick={async () => { setDeleting(true); try { await onDelete(skill); onClose(); } catch(error) { showToast?.(error instanceof Error ? error.message : '卸载失败'); } finally { setDeleting(false); } }} className="flex items-center gap-1 text-xs text-rose-500 disabled:opacity-50"><Trash2 size={12} />{deleting?'正在卸载':'卸载技能'}</button>}</section>
        </div>}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200/70 px-5 py-4 dark:border-white/[0.07] sm:px-8">
        <button type="button" onClick={() => void exportPackage()} disabled={exporting} className="inline-flex items-center gap-1.5 rounded-full px-2 py-2 text-xs text-slate-500 transition hover:text-slate-900 disabled:opacity-50 dark:text-slate-400 dark:hover:text-white"><Download size={14} />{exporting ? '正在打包' : '导出技能包'}</button>
        <button type="button" onClick={() => onTryNow(skill)} className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-xs font-medium text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"><MessageCircle size={14} />指定并开始对话<ArrowUpRight size={13} /></button>
      </footer>
    </div>
  </div>;
}

export function CodexSkillDetailModal(props: CodexSkillDetailModalProps) {
  if (!props.skill) return null;
  const content = <SkillDetail key={props.skill.id} {...props} skill={props.skill} />;
  return props.usePortal === false ? content : createPortal(content, document.body);
}
