import { useEffect, useRef, useState, type DragEvent } from 'react';
import { Film, Loader2, Sparkles, Square, UploadCloud, X } from 'lucide-react';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import { useSalesSummaryModels } from '../hooks/useSalesSummaryModels';
import type { SalesScriptVideoSource } from '../hooks/useSalesScripts';
import { formatScriptSeconds } from '../model/salesScriptEditor';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';
import { SalesReferenceAudioSave } from './SalesReferenceAudioSave';

interface Props {
  preferredModel: string;
  onModelChange: (model: string) => void;
  video: SalesScriptVideoSource | null;
  busy: '' | 'upload' | 'analyze' | 'normalize' | 'save' | 'prompt';
  error?: string;
  pendingBundle?: boolean;
  onUpload: (file: File) => void | Promise<boolean>;
  onClearVideo: () => void;
  onAnalyze: (model: string, force?: boolean) => void;
  onCancel: () => void;
  onClose?: () => void;
}

const VIDEO_ACCEPT = 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm';

export function SalesScriptImportPanel({
  preferredModel, onModelChange, video, busy, error, pendingBundle,
  onUpload, onClearVideo, onAnalyze, onCancel, onClose,
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
            <p>一次导入，同时拆解分镜脚本并生成深度动作视频，自动关联保存到素材库。脚本完成后即可先核对，深度视频继续处理。</p>
          </div>
          {onClose && (
            <button type="button" disabled={working} aria-label="关闭新增脚本窗口" onClick={onClose} className={`sales-modal-close ${salesFocusClass}`}>
              <X size={16} aria-hidden />
            </button>
          )}
        </header>

        {pendingBundle && !working && <p className="sales-card-hint">已有视频正在处理，请关闭此窗口，在素材库进度卡中继续未完成项。</p>}
        {error && <p role="alert" className="sales-import-modal-error">{error}</p>}

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

          <div
            className={`sales-import-dropzone ${dragOver ? 'is-over' : ''} ${video ? 'has-video' : ''}`}
            onDragOver={(e) => { e.preventDefault(); if (!working) setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            {video ? (
              <div className="sales-script-video-badge">
                <span className="sales-video-badge-icon"><Film size={16} aria-hidden /></span>
                <div className="sales-video-badge-meta">
                  <strong title={video.name}>{video.name}</strong>
                  <span>实测 {formatScriptSeconds(video.durationSec)} · {video.aspectRatio} 画幅 · {video.hasAudio ? '含可听音轨' : '无音轨'}</span>
                </div>
                <button type="button" disabled={working} onClick={() => fileRef.current?.click()} className={salesGhostButtonClass}>更换视频</button>
                <button type="button" disabled={working} aria-label="移除参考视频" onClick={onClearVideo} className={`sales-script-icon-btn ${salesFocusClass}`}><X size={13} aria-hidden /></button>
              </div>
            ) : (
              <button type="button" disabled={working} onClick={() => fileRef.current?.click()} className={`sales-dropzone-trigger ${salesFocusClass}`}>
                <span className="sales-dropzone-icon">
                  {busy === 'upload' ? <Loader2 size={28} className="animate-spin" aria-hidden /> : <UploadCloud size={28} aria-hidden />}
                </span>
                <strong>{busy === 'upload' ? '正在探测视频时长、画幅与音轨…' : '点击选择或拖入参考视频'}</strong>
                <span>支持 MP4 / MOV / WebM。脚本分析 ≤64MB / 10分钟，深度视频 ≤35MB / 30秒；超出深度限制时，脚本仍独立处理。</span>
              </button>
            )}

        <footer className="sales-import-modal-footer">
          <div className="sales-script-model-bar">
            <span className="sales-model-caption">视频多模态模型：</span>
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
              <button type="button" disabled={!video || !model || pendingBundle} onClick={() => onAnalyze(model)} className={`sales-collect-primary ${salesFocusClass}`}>
                <Sparkles size={14} aria-hidden />同时生成脚本与深度视频
              </button>
            )}
          </div>
        </footer>
          </div>
          {video?.hasAudio && <SalesReferenceAudioSave key={video.videoUrl} videoUrl={video.videoUrl} title={video.name} durationSec={video.durationSec} disabled={working} />}
        </div>
      </section>
    </dialog>
  );
}
