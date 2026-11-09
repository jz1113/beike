import { useEffect, useRef, useState } from 'react';
import { Check, Film, Loader2, Pause, Trash2, UploadCloud, X } from 'lucide-react';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import { useSalesSummaryModels } from '../hooks/useSalesAssetViews';
import { MAX_SCRIPT_IMPORT_FILES, type SalesScriptImportItem } from '../model/salesScriptImport';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';
import '../salesAssetDialog.css';
import '../salesBgmImport.css';
import '../salesVideoDropzone.css';

interface DropzoneProps {
  title: string;
  hint: string;
  disabled: boolean;
  loading?: boolean;
  compact?: boolean;
  onChoose: () => void;
  onFiles: (files: File[]) => void;
}

function SalesVideoDropzone({ title, hint, disabled, loading, compact, onChoose, onFiles }: DropzoneProps) {
  const [dragging, setDragging] = useState(false);
  return <button type="button" disabled={disabled} onClick={onChoose}
    className={`sales-video-dropzone ${compact ? 'is-compact' : ''} ${dragging && !disabled ? 'is-over' : ''} ${salesFocusClass}`}
    onDragOver={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={(event) => {
      event.preventDefault(); setDragging(false);
      if (!disabled && event.dataTransfer.files.length) onFiles(Array.from(event.dataTransfer.files));
    }}>
    <span className="sales-upload-cloud">{loading ? <Loader2 className="animate-spin" aria-hidden /> : <UploadCloud aria-hidden />}</span>
    <strong>{dragging && !disabled ? '松开以上传视频' : title}</strong>
    <span className="sales-upload-hint">{hint}</span>
  </button>;
}

interface Props {
  preferredModel: string;
  onModelChange: (model: string) => void;
  items: readonly SalesScriptImportItem[];
  pending: boolean;
  blockedReason?: string;
  error: string;
  errors: readonly string[];
  includeDepth: boolean;
  onIncludeDepthChange: (value: boolean) => void;
  onAddFiles: (files: File[]) => void;
  onRemove: (key: string) => void;
  onClearCompleted: () => void;
  onStart: () => void;
  onStop: () => void;
  onClose: () => void;
}

const STATUS = {
  queued: '待分析', uploading: '上传中…', analyzing: '分析中…', saving: '保存中…',
  depth: '深度视频处理中…', done: '已完成', error: '待重试',
} as const;
const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm';

export function SalesScriptBatchImportDialog({
  preferredModel, onModelChange, items, pending, blockedReason = '', error, errors, includeDepth,
  onIncludeDepthChange, onAddFiles, onRemove, onClearCompleted, onStart, onStop, onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const { options, model } = useSalesSummaryModels(preferredModel);
  const done = items.filter((item) => item.status === 'done').length;
  const saved = items.filter((item) => item.scriptId).length;
  const remaining = items.length - done;
  const continuing = items.some((item) => item.status !== 'queued');
  useEffect(() => { dialog.current?.showModal(); }, []);

  return <dialog ref={dialog} className="sales-material-dialog sales-asset-dialog sales-bgm-import" aria-labelledby="sales-script-batch-import-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}>
    <form onSubmit={(event) => { event.preventDefault(); if (!pending && !blockedReason && remaining && model) onStart(); }}>
      <header className="sales-asset-header">
        <h2 id="sales-script-batch-import-title">批量导入分析动作素材</h2>
        <button type="button" aria-label={pending ? '收起动作素材批量导入' : '关闭动作素材批量导入'} onClick={onClose} className={salesGhostButtonClass}><X size={18} /></button>
      </header>
      <div className="sales-asset-content">
        <input ref={input} className="hidden" type="file" multiple accept={VIDEO_ACCEPT} disabled={pending}
          aria-label="选择一批动作参考视频" onChange={(event) => { onAddFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
        <SalesVideoDropzone title={items.length ? '继续添加或重新选择视频' : '点击或拖拽批量上传视频'}
          hint={`MP4、MOV、WebM · 最多 ${MAX_SCRIPT_IMPORT_FILES} 个 · 单个限 64 MiB、10 分钟`}
          compact={items.length > 0} disabled={pending} onChoose={() => input.current?.click()} onFiles={onAddFiles} />
        <p className="sales-material-notice">默认拆解脚本并生成深度动作视频。处理结束即清理原片；动作库只保留脚本和深度结果。</p>
        {blockedReason && <p role="alert" className="sales-material-error">{blockedReason}</p>}
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--sales-line)] p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="sales-model-caption">视频分析模型：</span>
            <ConfiguredModelPicker ariaLabel="动作素材批量分析模型" value={model} options={options} onChange={onModelChange}
              disabled={pending} variant="agent" showReasoning />
          </div>
          <label className="sales-script-batch-depth-choice"><input type="checkbox" checked={includeDepth} disabled={pending}
            onChange={(event) => onIncludeDepthChange(event.target.checked)} />同时生成深度动作视频</label>
          <small className="text-[var(--sales-muted)]">深度视频限 35 MiB、30 秒以内；超出限制仍保存分析脚本，之后可单独处理或关联深度素材。取消勾选只跳过尚未提交的深度处理。</small>
        </div>
        {errors.map((message, index) => <p key={`${index}:${message}`} role="alert" className="sales-material-error">{message}</p>)}
        <div className="sales-bgm-import-list" aria-label="动作素材批量分析队列" aria-busy={pending}>
          {items.map((item) => {
            const working = ['uploading', 'analyzing', 'saving', 'depth'].includes(item.status);
            return <div key={item.key} className="sales-bgm-import-item">
              {item.status === 'done' ? <Check size={18} aria-hidden /> : working ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <Film size={18} aria-hidden />}
              <div className="sales-bgm-import-copy">
                <strong>{item.name}</strong>
                {item.scriptId && <span>脚本已入库，可在动作分类查看</span>}
                {item.status === 'depth' && item.depthProgress && <span>{item.depthProgress}</span>}
                {item.depthState === 'skipped' && <span>仅保存脚本，深度视频可稍后处理</span>}
                {item.error && <p role="alert" className="sales-material-error">{item.error}</p>}
              </div>
              <span role="status" className="shrink-0">{STATUS[item.status]}</span>
              {item.status !== 'done' && <button type="button" disabled={pending} aria-label={`移除待处理视频 ${item.name}`} className={salesGhostButtonClass}
                onClick={() => onRemove(item.key)}><Trash2 size={14} /></button>}
            </div>;
          })}
        </div>
        {error && <p role="alert" className="sales-material-error">{error}</p>}
        <p className="sales-card-hint">收起窗口后继续处理。离开动作素材页会暂停队列，回来或刷新后可手动继续；已保存的脚本和深度任务可以继续使用，需要原片时请重新选择本地文件。</p>
        {done > 0 && <button type="button" disabled={pending} className={`${salesGhostButtonClass} self-start`} onClick={onClearCompleted}>清除已完成记录</button>}
      </div>
      <footer className="sales-asset-footer">
        <span role="status">已入库 {saved} / {items.length} · 已完成 {done} · 待处理 {remaining}</span>
        <div>
          <button type="button" className={salesGhostButtonClass} onClick={onClose}>{pending ? '收起窗口' : '关闭'}</button>
          {pending ? <button type="button" className={salesGhostButtonClass} onClick={onStop}><Pause size={14} aria-hidden />暂停队列</button>
            : <button type="submit" disabled={!remaining || !model || Boolean(blockedReason)} className={`sales-collect-primary ${salesFocusClass}`}>
              {continuing ? '继续未完成项' : '开始批量分析'}{remaining > 0 && `（${remaining}）`}
            </button>}
        </div>
      </footer>
    </form>
  </dialog>;
}
