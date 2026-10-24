import { createPortal } from 'react-dom';
import { Download, FolderOpen, Upload, X } from 'lucide-react';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';

export function SkillFilesLocationDialog({ onClose, onImportFolder }: { onClose: () => void; onImportFolder: () => void }) {
  const dialogRef = useModalDialog(true, onClose);
  return createPortal(<div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm dark:bg-black/60" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="技能文件管理" tabIndex={-1} className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-white/10 dark:bg-[#1b1d20]">
      <div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white"><FolderOpen size={18} />技能文件</h2><button type="button" onClick={onClose} aria-label="关闭文件管理" className="rounded-full p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"><X size={16} /></button></div>
      <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">一个技能使用一个文件夹。主指令、参考规范和交付模板放在一起，可整体导入和导出。</p>
      <pre className="mt-4 rounded-xl bg-slate-50 p-4 font-mono text-xs leading-6 text-slate-500 dark:bg-black/20 dark:text-slate-400">{'my-skill/\n  SKILL.md          主指令\n  agents/           展示信息（可选）\n  references/       按需读取的规范\n  assets/           交付模板与素材\n  scripts/          辅助代码（如有）'}</pre>
      <p className="mt-4 text-xs leading-6 text-slate-500 dark:text-slate-400">自定义技能保存在当前工作区；可从详情页导出 ZIP 自行备份。当前导入文本文件，图片等二进制素材会提示跳过。脚本可随包保存与查看，不会自动运行。</p>
      <details className="mt-3 text-xs text-slate-400"><summary className="cursor-pointer">内置技能的源码位置</summary><code className="mt-2 block break-all rounded-lg bg-slate-50 p-3 dark:bg-white/5">src/shared/domain/assistant/skills/packages/</code></details>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-1.5 text-[11px] text-slate-400"><Download size={12} />打开技能详情可导出完整包</span><button type="button" onClick={() => { onClose(); onImportFolder(); }} className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-xs font-medium text-white dark:bg-white dark:text-slate-900"><Upload size={14} />导入技能文件夹</button></div>
    </div>
  </div>, document.body);
}
