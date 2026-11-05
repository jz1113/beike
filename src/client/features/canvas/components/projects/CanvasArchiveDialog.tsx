import { useRef, useState } from 'react';
import { useModalDialog } from '@client/shared/hooks/useModalDialog';
import { saveToDownloadDir } from '@client/shared/media/saveDownload';
import { readCanvasArchive } from '../../model/canvasArchive';
import type { CanvasArchive } from '../../model/canvasArchive';
import type { CanvasProject } from '../../model/types';
import { exportCanvasProject, restoreCanvasArchive } from '../../store/canvasArchiveStorage';

export function CanvasArchiveDialog({ mode, snapshot, onClose, onRestored }: {
  mode: 'export' | 'import'; snapshot?: () => CanvasProject;
  onClose: () => void; onRestored: (project: CanvasProject) => void;
}) {
  const [file,setFile] = useState<File>();
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  const lock = useRef(false);
  const prepared = useRef<CanvasArchive | undefined>(undefined);
  const errorBox = useRef<HTMLParagraphElement>(null);
  const dialog = useModalDialog(true,()=>{if(!lock.current)onClose();});
  async function run() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setMessage('正在准备项目…');
    try {
      if (mode === 'export') {
        if (!snapshot) throw new Error('项目尚未准备好，请重新打开后重试');
        const project = snapshot();
        const blob = await exportCanvasProject(project,setMessage);
        await saveToDownloadDir(`${project.title}.zip`,blob);
        setMessage('已发起完整项目备份下载');
      } else {
        if (!file) throw new Error('请先选择项目 ZIP 或 JSON 文件');
        const archive = prepared.current ?? await readCanvasArchive(file,setMessage);
        prepared.current = archive;
        const project = await restoreCanvasArchive(archive,setMessage);
        onClose(); onRestored(project);
      }
    } catch (cause) {
      setMessage('');
      setError(cause instanceof SyntaxError ? '备份内容无法解析，请重新选择完整项目 ZIP 或 JSON'
        : cause instanceof Error ? cause.message : '项目操作失败，请重试');
      requestAnimationFrame(()=>errorBox.current?.focus());
    } finally { lock.current = false; setBusy(false); }
  }
  const exporting = mode === 'export';
  return <div className="fixed inset-0 z-[100] grid place-items-center bg-black/60 p-3">
    <div ref={dialog} role="dialog" aria-modal="true" aria-label={exporting?'导出画布项目':'导入与恢复画布项目'} tabIndex={-1}
      className="grid max-h-[85dvh] w-full max-w-md gap-4 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-900 shadow-xl dark:border-white/20 dark:bg-[#202023] dark:text-stone-200">
      <h2 className="text-base font-semibold">{exporting?'导出画布项目':'导入与恢复画布项目'}</h2>
      <p className="leading-relaxed text-slate-600 dark:text-stone-400">{exporting
        ? '支持旧画布和 Studio 画布，包含节点、连线、视口及图片、视频、音频和全部已保存生成版本。素材不完整时不会导出备份。'
        : '选择完整项目 ZIP 恢复旧画布或 Studio 画布；也支持旧项目和工作流 JSON，JSON 中的素材地址必须可读取。恢复后另建项目，保留原画布，不续接旧生成任务。'}</p>
      {!exporting && <label className="grid min-w-0 gap-2 font-medium">项目备份文件
        <input type="file" accept=".zip,.json,application/zip,application/json" aria-label="项目备份文件" disabled={busy}
          className="min-h-11 w-full min-w-0 rounded-lg border border-slate-300 p-2 text-xs dark:border-white/20"
          onChange={event=>{
            const selected = event.currentTarget.files?.[0];
            if (selected) { setFile(selected); prepared.current=undefined; setError(''); setMessage(''); }
            event.currentTarget.value='';
          }}/>
        {file && <span className="break-all text-xs font-normal">已选择：{file.name}</span>}
      </label>}
      {message && <p role="status" className="break-words">{message}</p>}
      {error && <p ref={errorBox} role="alert" tabIndex={-1} className="break-words text-red-600 dark:text-red-300">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" disabled={busy} className="min-h-11 rounded-lg border border-slate-300 px-4 dark:border-white/20" onClick={onClose}>关闭</button>
        <button type="button" disabled={busy || (!exporting && !file)} className="min-h-11 rounded-lg bg-indigo-600 px-4 text-white disabled:opacity-50" onClick={()=>void run()}>
          {busy?'正在处理…':error?(exporting?'重试导出':'重试恢复'):exporting?'导出项目':'恢复为新项目'}
        </button>
      </div>
    </div>
  </div>;
}
