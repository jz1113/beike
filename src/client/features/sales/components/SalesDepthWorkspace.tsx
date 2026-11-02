import { type CSSProperties, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Layers, Loader2, Plus, Upload, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useDepthEnvCheck } from '@client/shared/api/generation/depthGeneration';
import { useSeedancePrecheck } from '@client/shared/api/generation/seedancePrecheck';
import { extractImageDimensionsFromFile } from '@client/shared/media/mediaHelper';
import { SeedanceComplianceBadge } from '@client/shared/ui/SeedanceComplianceBadge';
import type { ScriptTaxonomyItem } from '@shared/contracts/salesScriptTaxonomy';
import type { SalesActionCandidate } from '@shared/domain/sales';
import { useSalesDepthConversion } from '../hooks/useSalesDepthConversion';
import { actionMedia, depthFileError, seedanceVideoDurationError } from '../model/salesActionMedia';
import { isMachineGeneratedActionTitle } from '../model/salesMaterialCatalog';
import { salesFocusClass, salesGhostButtonClass, salesInputClass } from './salesChrome';

import './salesDepthWorkspace.css';

interface Props {
  enabled: boolean;
  source: SalesActionCandidate | null;
  defaultActionName?: string;
  defaultCategoryId?: string;
  actionCategories?: readonly ScriptTaxonomyItem[];
  onCreateActionCategory?: (name: string) => Promise<ScriptTaxonomyItem | null>;
  onSaved: () => void;
}

interface MediaDimensions { width?: number; height?: number; durationSec?: number }

function probeVideoDimensionsFast(file: File): Promise<MediaDimensions> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata'; video.muted = true; video.playsInline = true;
    const url = URL.createObjectURL(file);
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error('读取视频元数据超时')); }, 15_000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.onloadedmetadata = null; video.onerror = null;
      URL.revokeObjectURL(url);
      try { video.removeAttribute('src'); video.load(); } catch { /* ignore */ }
    };
    video.onloadedmetadata = () => {
      const durationSec = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : undefined;
      const dims = { width: video.videoWidth || undefined, height: video.videoHeight || undefined, durationSec };
      cleanup(); resolve(dims);
    };
    video.onerror = () => { cleanup(); reject(new Error('无法读取视频元数据')); };
    video.src = url;
  });
}

export function SalesDepthWorkspace({
  enabled, source, defaultActionName = '1', defaultCategoryId = '', actionCategories = [], onCreateActionCategory, onSaved,
}: Props) {
  const conversion = useSalesDepthConversion(onSaved);
  const env = useDepthEnvCheck(enabled);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localPreviewUrlRef = useRef('');
  const probeVersion = useRef(0);
  const [localPreviewUrl, setLocalPreviewUrl] = useState('');
  const [dragging, setDragging] = useState(false);
  const [fileError, setFileError] = useState('');
  const [meta, setMeta] = useState<MediaDimensions>({});
  const [resultMeta, setResultMeta] = useState<MediaDimensions>({});
  const [categoryId, setCategoryId] = useState(defaultCategoryId);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [assetName, setAssetName] = useState(defaultActionName);
  const { job, busy, start, resume } = conversion;
  const restoredOperation = useRef(job?.operationId || '');
  const attemptedSource = useRef('');

  const replaceLocalPreview = (nextFile?: File | null) => {
    if (localPreviewUrlRef.current) {
      URL.revokeObjectURL(localPreviewUrlRef.current);
      localPreviewUrlRef.current = '';
    }
    if (nextFile) {
      const created = URL.createObjectURL(nextFile);
      localPreviewUrlRef.current = created;
      setLocalPreviewUrl(created);
    } else setLocalPreviewUrl('');
  };

  useEffect(() => () => {
    probeVersion.current += 1;
    if (localPreviewUrlRef.current) URL.revokeObjectURL(localPreviewUrlRef.current);
  }, []);

  useEffect(() => { setCategoryId(source?.categoryId || defaultCategoryId); }, [defaultCategoryId, source?.categoryId]);

  useEffect(() => {
    if (job) {
      const savedName = job.name?.trim() || '';
      setAssetName(isMachineGeneratedActionTitle(savedName) ? defaultActionName : savedName);
    } else setAssetName(defaultActionName);
  }, [defaultActionName, job]);

  useEffect(() => {
    if (job?.width && job?.height && (!meta.width || !meta.height)) {
      setMeta({ width: job.width, height: job.height, durationSec: job.durationSec });
    }
  }, [job, meta.height, meta.width]);

  useEffect(() => {
    if (enabled && job && !job.resultUrl && !busy && restoredOperation.current === job.operationId) {
      restoredOperation.current = '';
      void resume();
    }
  }, [enabled, job, busy, resume]);

  useEffect(() => {
    if (!enabled || !source) return;
    const media = actionMedia(source);
    if (job) { attemptedSource.current = media.url; return; }
    if (busy) return;
    if (!media.url || attemptedSource.current === media.url) return;
    attemptedSource.current = media.url;
    setFileError(''); setResultMeta({});
    const sourceTitle = (source.title || '').trim();
    const nextName = sourceTitle && !isMachineGeneratedActionTitle(sourceTitle) ? sourceTitle : defaultActionName;
    setAssetName(nextName);
    void start({
      sourceUrl: media.url, video: media.video, name: nextName, description: '',
      style: 'mocap', quality: 'standard',
    });
  }, [defaultActionName, enabled, source, job, busy, start]);

  const submitNewCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed || categoryBusy || !onCreateActionCategory) return;
    setCategoryBusy(true);
    void onCreateActionCategory(trimmed).then((created) => {
      if (created) {
        setCategoryId(created.id);
        setNewCategoryName('');
        setAddingCategory(false);
      }
    }).finally(() => setCategoryBusy(false));
  };

  const handleFile = async (selected: File) => {
    if (busy || job) return;
    const isVideoFile = selected.type.startsWith('video/') || /\.(mp4|webm|mov|m4v)$/i.test(selected.name);
    const err = depthFileError(selected, isVideoFile);
    if (err) { setFileError(err); return; }
    const version = ++probeVersion.current;
    let probedMeta: MediaDimensions = {};
    if (isVideoFile) {
      try {
        probedMeta = await probeVideoDimensionsFast(selected);
        if (version !== probeVersion.current) return;
        setMeta(probedMeta);
        const durErr = seedanceVideoDurationError(probedMeta.durationSec);
        if (durErr) { setFileError(durErr); return; }
      } catch { if (version !== probeVersion.current) return; setMeta({}); }
    } else {
      try {
        const probed = await extractImageDimensionsFromFile(selected);
        if (version !== probeVersion.current) return;
        probedMeta = { width: probed.width || undefined, height: probed.height || undefined };
        setMeta(probedMeta);
      } catch { if (version !== probeVersion.current) return; setMeta({}); }
    }
    if (version !== probeVersion.current) return;
    setFileError(''); setResultMeta({}); replaceLocalPreview(selected);
    const nextName = defaultActionName || '1';
    setAssetName(nextName);
    await start({
      file: selected, video: isVideoFile, name: nextName, description: '', style: 'mocap', quality: 'standard',
      width: probedMeta.width, height: probedMeta.height, durationSec: probedMeta.durationSec,
    });
  };

  const isVideo = job?.video ?? (source ? actionMedia(source).video : true);
  const sourceUrl = localPreviewUrl || job?.sourceUrl || (source ? actionMedia(source).url : '');
  const sourceWidth = meta.width || job?.width;
  const sourceHeight = meta.height || job?.height;
  const sourceDurationSec = meta.durationSec || job?.durationSec;
  const sourceResolutionText = sourceWidth && sourceHeight ? `${sourceWidth} × ${sourceHeight}` : '';

  const precheckItems = enabled && job?.resultUrl
    ? [{ url: job.resultUrl, mediaType: isVideo ? ('depth-video' as const) : ('depth-image' as const) }]
    : [];
  const precheckMap = useSeedancePrecheck(precheckItems, Boolean(enabled && job?.resultUrl));
  const resultCheck = job?.resultUrl ? precheckMap.get(job.resultUrl) : undefined;
  const depthWidth = resultMeta.width || resultCheck?.width || sourceWidth;
  const depthHeight = resultMeta.height || resultCheck?.height || sourceHeight;
  const depthDurationSec = resultMeta.durationSec || resultCheck?.durationSec || sourceDurationSec;
  const depthResolutionText = depthWidth && depthHeight ? `${depthWidth} × ${depthHeight}` : sourceResolutionText;

  const mediaView = (url: string, label: string, target: 'source' | 'result') => {
    const setTarget = target === 'source' ? setMeta : setResultMeta;
    const update = (next: MediaDimensions) => setTarget((prev) => ({
      width: next.width || prev.width, height: next.height || prev.height, durationSec: next.durationSec || prev.durationSec,
    }));
    return isVideo ? (
      <video
        aria-label={label} controls playsInline preload="metadata" src={proxyMediaUrl(url, { asVideo: true })}
        onLoadedMetadata={(e) => {
          const el = e.currentTarget;
          const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : undefined;
          update({ width: el.videoWidth || undefined, height: el.videoHeight || undefined, durationSec: dur });
        }}
      />
    ) : (
      <img
        src={proxyMediaUrl(url)} alt={label}
        onLoad={(e) => update({ width: e.currentTarget.naturalWidth || undefined, height: e.currentTarget.naturalHeight || undefined })}
      />
    );
  };

  const previewRatio = sourceWidth && sourceHeight ? sourceWidth / sourceHeight : 4 / 3;
  const previewStyle = {
    '--depth-preview-width': `${Math.min(320, 380 * previewRatio)}px`,
    '--depth-preview-ratio': previewRatio,
  } as CSSProperties;

  return (
    <section style={previewStyle} className="sales-depth-workspace" aria-label="深度动作转换">
      <input
        ref={fileInputRef} type="file" aria-label="上传深度转换视频或图片" className="hidden" disabled={busy}
        accept=".mp4,.webm,.mov,.m4v,.jpg,.jpeg,.png,.webp,.gif,video/*,image/*"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void handleFile(f); }}
      />

      <div className="sales-depth-comparison">
        <figure>
          <figcaption className="sales-depth-caption">
            <span>原始{isVideo ? '视频' : '图片'}</span>
            {sourceResolutionText && <span className="text-[11px] font-mono text-slate-400" title="原素材尺寸">{sourceResolutionText}</span>}
          </figcaption>
          <div className="sales-depth-media">{sourceUrl ? mediaView(sourceUrl, '深度转换原素材', 'source') : (
            <button
              type="button" disabled={busy} onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const d = e.dataTransfer.files?.[0]; if (d) void handleFile(d); }}
              className={`sales-depth-placeholder w-full cursor-pointer transition ${dragging ? 'border-amber-400 bg-amber-500/10' : 'hover:border-amber-500/50'} ${salesFocusClass}`}
            >
              <Upload size={22} />
              <span className="font-medium text-slate-200">拖入素材或点击上传</span>
              <small className="text-[11px] text-slate-400">视频 2–30 秒 · ≤35MB；也支持图片</small>
            </button>
          )}</div>
        </figure>

        <ArrowRight size={20} aria-hidden />

        <figure>
          <figcaption className="sales-depth-caption">
            <span>深度{isVideo ? '视频' : '图片'}</span>
            {depthResolutionText && <span className="text-[11px] font-mono text-slate-400" title="输出尺寸">{depthResolutionText}</span>}
          </figcaption>
          <div className="sales-depth-media">{job?.resultUrl ? mediaView(job.resultUrl, '深度转换结果', 'result') : (
            <div className="sales-depth-placeholder">
              {busy ? <Loader2 className="animate-spin" /> : <Layers />}
              <span>{busy ? '正在提取动作深度…' : '上传后自动转换'}</span>
            </div>
          )}</div>
        </figure>
      </div>

      {job?.resultUrl && <div className="sales-depth-validation">
        <SeedanceComplianceBadge entry={resultCheck} mediaType={isVideo ? 'depth-video' : 'depth-image'}
          width={depthWidth} height={depthHeight} durationSec={depthDurationSec} showResolution={false} />
      </div>}
      {!job && !env.loading && !env.depthModelReady && (
        <p className="sales-card-hint">{env.envHint || '深度环境尚未就绪'}<br />安装命令：<code>{env.setupCommand}</code></p>
      )}
      {(fileError || conversion.error || resultCheck?.status === 'rejected') && (
        <p role="alert" className="sales-material-error">{fileError || conversion.error || resultCheck?.error}</p>
      )}
      {conversion.progress && (
        <p role="status" className="sales-material-notice">{busy && <Loader2 size={14} className="animate-spin" />}{conversion.progress}</p>
      )}

      {!job && !busy && source && (
        <button type="button" className={salesGhostButtonClass} onClick={() => {
          const media = actionMedia(source);
          if (media.url) void start({ sourceUrl: media.url, video: media.video, name: assetName, description: '', style: 'mocap', quality: 'standard' });
        }}>{conversion.error ? '重新转换此动作' : '转换此动作'}</button>
      )}

      {job && (
        <div className="mt-3 flex flex-col gap-3">
          {job.resultUrl && (
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-xs text-slate-400">
                <span>资产名称</span>
                <input
                  aria-label="深度动作名称" value={assetName} maxLength={80} disabled={busy}
                  onChange={(e) => setAssetName(e.target.value)} placeholder={defaultActionName} className={salesInputClass}
                />
              </label>
              <div className="flex flex-col gap-1 text-xs text-slate-400">
                <div className="flex items-center justify-between gap-2">
                  <span>存放商品类目</span>
                  {onCreateActionCategory && (
                    <button
                      type="button"
                      disabled={busy || categoryBusy}
                      onClick={() => { setAddingCategory((v) => !v); setNewCategoryName(''); }}
                      className={`sales-taxonomy-link-btn ${salesFocusClass}`}
                    >
                      <Plus size={11} aria-hidden />新建类目
                    </button>
                  )}
                </div>
                {addingCategory && onCreateActionCategory ? (
                  <div className="sales-taxonomy-inline-form">
                    <input
                      autoFocus
                      value={newCategoryName}
                      maxLength={40}
                      disabled={busy || categoryBusy}
                      onChange={(e) => setNewCategoryName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); submitNewCategory(); }
                        if (e.key === 'Escape') { setAddingCategory(false); setNewCategoryName(''); }
                      }}
                      placeholder="输入商品类目名称"
                      aria-label="新商品类目名称"
                      className={salesInputClass}
                    />
                    <button type="button" disabled={!newCategoryName.trim() || busy || categoryBusy} onClick={submitNewCategory} aria-label="确认新建商品类目" className={salesGhostButtonClass}>
                      <Check size={12} aria-hidden />
                    </button>
                    <button type="button" disabled={categoryBusy} onClick={() => { setAddingCategory(false); setNewCategoryName(''); }} aria-label="取消" className={salesGhostButtonClass}>
                      <X size={12} aria-hidden />
                    </button>
                  </div>
                ) : (
                  <select
                    aria-label="深度动作存放商品类目" value={categoryId} disabled={busy}
                    onChange={(e) => setCategoryId(e.target.value)} className={salesInputClass}
                  >
                    <option value="">未分类（通用动作）</option>
                    {actionCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                  </select>
                )}
              </div>
            </div>
          )}

          <div className="sales-depth-actions !mt-0">
            {job.resultUrl ? (
              <button
                type="button" disabled={busy || resultCheck?.status === 'rejected'}
                onClick={() => void conversion.save({ categoryId, name: assetName })}
                className={`sales-collect-primary ${salesFocusClass}`}
              >
                {busy ? '保存中…' : '保存到动作资产'}
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => void conversion.resume()} className={`sales-collect-primary ${salesFocusClass}`}>
                {busy ? '正在转换…' : '继续查询原转换任务'}
              </button>
            )}
            <button
              type="button"
              onClick={() => { probeVersion.current += 1; setFileError(''); setMeta({}); setResultMeta({}); replaceLocalPreview(null); conversion.reset(); }}
              className={salesGhostButtonClass}
            >
              {job.resultUrl ? '开始新的转换' : '结束等待，开始新的转换'}
            </button>
            <small>{job.resultUrl ? '确认预览后保存到动作库。' : '可关闭窗口，稍后返回继续查询。'}</small>
          </div>
        </div>
      )}
    </section>
  );
}
