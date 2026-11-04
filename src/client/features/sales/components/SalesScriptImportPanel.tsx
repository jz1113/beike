import { useEffect, useRef, useState, type DragEvent } from 'react';
import { CircleAlert, Film, Sparkles, Square, X } from 'lucide-react';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import { useSalesSummaryModels } from '../hooks/useSalesSummaryModels';
import type { SalesScriptVideoSource } from '../hooks/useSalesScripts';
import { formatScriptSeconds } from '../model/salesScriptEditor';
import { salesFocusClass, salesGhostButtonClass, salesPrimaryButtonClass } from './salesChrome';
import { SalesVideoDropzone } from './SalesVideoDropzone';
import { SalesReferenceAudioSave } from './SalesReferenceAudioSave';

interface Props {
  preferredModel: string;
  onModelChange: (model: string) => void;
  video: SalesScriptVideoSource | null;
  busy: '' | 'upload' | 'analyze' | 'save' | 'prompt';
  error?: string;
  pendingBundle?: boolean;
  onPausePending: () => void;
  onUpload: (file: File) => void | Promise<boolean>;
  onClearVideo: () => void;
  onAnalyze: (model: string, force?: boolean) => void;
  onCancel: () => void;
  onClose?: () => void;
}

const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm';

export function SalesScriptImportPanel({
  preferredModel, onModelChange, video, busy, error, pendingBundle,
  onUpload, onClearVideo, onAnalyze, onCancel, onClose, onPausePending,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { options, model } = useSalesSummaryModels(preferredModel);
  const working = busy === 'upload' || busy === 'analyze';

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (working) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void onUpload(file);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label="新增参考视频拆解"
      className="sales-import-modal-backdrop"
      onCancel={(e) => { e.preventDefault(); if (!working) onClose?.(); }}
      onClick={(e) => { if (e.target === e.currentTarget && !working) onClose?.(); }}
    >
      <section className="sales-import-modal">
        <header className="sales-import-modal-header">
          <div>
            <h2>上传参考视频</h2>
            <p>拆解分镜并生成深度动作视频，完成后存入素材库。</p>
          </div>
          {onClose && (
            <button type="button" disabled={working} aria-label="关闭新增脚本窗口" onClick={onClose} className={`sales-modal-close ${salesFocusClass}`}>
              <X size={16} aria-hidden />
            </button>
          )}
        </header>

        <div className="sales-import-modal-body">
          <input
            ref={fileRef}
            type="file"
            accept={VIDEO_ACCEPT}
            className="hidden"
            aria-label="选择参考视频文件"
            disabled={working}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void onUpload(file);
            }}
          />

          {video ? <div
            className={`sales-import-dropzone ${dragOver ? 'is-over' : ''} has-video`}
            onDragOver={(e) => { e.preventDefault(); if (!working) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
              <div className="sales-script-video-badge">
                <span className="sales-video-badge-icon"><Film size={16} aria-hidden /></span>
                <div className="sales-video-badge-meta">
                  <strong title={video.name}>{video.name}</strong>
                  <span>{formatScriptSeconds(video.durationSec)} · {video.aspectRatio} · {video.hasAudio ? '含音轨' : '无音轨'}</span>
                </div>
                <button type="button" disabled={working} onClick={() => fileRef.current?.click()} className={salesGhostButtonClass}>更换视频</button>
                <button type="button" disabled={working} aria-label="移除参考视频" onClick={onClearVideo} className={`sales-script-icon-btn ${salesFocusClass}`}><X size={13} aria-hidden /></button>
              </div>
          </div> : <>
            <SalesVideoDropzone title={busy === 'upload' ? '正在读取视频信息…' : '点击或拖拽上传参考视频'}
              hint="支持 MP4、MOV、WebM · 最大 64 MiB · 最长 10 分钟"
              loading={busy === 'upload'} disabled={working} onChoose={() => fileRef.current?.click()}
              onFiles={([file]) => { if (file) void onUpload(file); }} />
            <small className="sales-card-hint">深度视频限 35 MiB、30 秒以内，超出时仅拆解分镜。</small>
          </>}
          {(error || (pendingBundle && !working)) && <div className={`sales-import-status ${error ? 'has-error' : ''}`}>
            <CircleAlert size={16} aria-hidden />
            <div>
              {error && <p role="alert">{error}</p>}
              {pendingBundle && !working && <p>暂存上次进度后即可提交当前视频，稍后可在素材库恢复。</p>}
            </div>
            {pendingBundle && !working && <button type="button" className={salesGhostButtonClass} onClick={onPausePending}>暂存上次进度</button>}
          </div>}
          {video?.hasAudio && <p className="sales-card-hint">部分模型只分析画面，不读取音轨。口播可在拆解后逐段核对和补录。</p>}
          {video?.hasAudio && <SalesReferenceAudioSave key={video.videoUrl} videoUrl={video.videoUrl} title={video.name} durationSec={video.durationSec} disabled={working} />}
        </div>
        <footer className="sales-import-modal-footer">
          <div className="sales-script-model-bar">
            <span className="sales-model-caption">分析模型</span>
            <ConfiguredModelPicker
              ariaLabel="参考脚本拆解模型"
              value={model}
              options={options}
              onChange={onModelChange}
              disabled={working}
              isUp
              variant="agent"
              showReasoning
            />
          </div>

          <div className="sales-import-modal-cta">
            {working ? (
              <button type="button" onClick={onCancel} className={salesGhostButtonClass}>
                <Square size={12} aria-hidden />停止处理
              </button>
            ) : (
              <button type="button" disabled={!video || !model || pendingBundle} onClick={() => onAnalyze(model)} className={salesPrimaryButtonClass}>
                <Sparkles size={14} aria-hidden />开始拆解
              </button>
            )}
          </div>
        </footer>
      </section>
    </dialog>
  );
}
