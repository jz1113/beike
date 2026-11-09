import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, Download, ImagePlus, Loader2, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import AIGeneratingCard from '@client/shared/ui/AIGeneratingCard';
import type { useSalesAssetViews } from '../hooks/useSalesAssetViews';
import { PERSONA_ANGLES, type AssetViewDefinition } from '../model/salesAssetDraft';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';

export function SalesScriptCopyButton({ text, label }: { text: string; label: string }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setStatus('copied'); }
    catch { setStatus('error'); }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), 2000);
  };
  return (
    <button type="button" onClick={() => { void copy(); }} className={salesGhostButtonClass} aria-live="polite">
      {status === 'copied' ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}
      {status === 'copied' ? '已复制' : status === 'error' ? '复制失败，请重试' : label}
    </button>
  );
}

async function joinLegacyAngles(urls: string[]): Promise<Blob> {
  const images = await Promise.all(urls.map(async (url) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = proxyMediaUrl(url);
    await image.decode();
    return image;
  }));
  const height = Math.min(2048, ...images.map((image) => image.naturalHeight));
  const widths = images.map((image) => Math.max(1, Math.round(image.naturalWidth * height / image.naturalHeight)));
  const canvas = document.createElement('canvas');
  canvas.width = widths.reduce((total, width) => total + width, 0);
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法合成人物视图');
  let x = 0;
  images.forEach((image, index) => {
    context.drawImage(image, x, 0, widths[index], height);
    x += widths[index];
  });
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('无法合成人物视图')), 'image/png'));
}

export function SalesPersonaSheet({ subject = '人物', views, busy, generating = false, progressText }: { subject?: '人物' | '场景'; views: Record<string, string>; busy: boolean; generating?: boolean; progressText?: string }) {
  const isScene = subject === '场景';
  const angles = isScene ? [] : PERSONA_ANGLES.map(({ id }) => views[id]);
  const legacy = !isScene && !views.sheet && angles.every(Boolean) ? JSON.stringify(angles) : '';
  const [preview, setPreview] = useState({ key: '', url: '' });
  useEffect(() => {
    if (!legacy) return;
    let closed = false;
    let url = '';
    void joinLegacyAngles(JSON.parse(legacy)).then((blob) => {
      if (closed) return;
      url = URL.createObjectURL(blob);
      setPreview({ key: legacy, url });
    }).catch(() => { if (!closed) setPreview({ key: legacy, url: '' }); });
    return () => { closed = true; if (url) URL.revokeObjectURL(url); };
  }, [legacy]);
  const merged = legacy && preview.key === legacy ? preview.url : '';
  const sheet = views.sheet ? proxyMediaUrl(views.sheet) : merged;
  const url = sheet || (!legacy && views.main ? proxyMediaUrl(views.main) : '');
  const title = isScene ? '场景九宫格（4:3）' : !sheet && url ? '人物参考图' : '人物三视图与脸部特写';
  return (
    <section className="sales-persona-sheet" aria-label={title}>
      <header>
        <h3>{title}</h3>
        {url && <a href={url} download={merged ? '人物三视图.png' : true} aria-label={`下载${title}`}><Download size={15} />下载</a>}
      </header>
      {generating ? (
        <div className="h-72 overflow-hidden rounded-xl"><AIGeneratingCard embedded statusText={progressText || `正在生成${subject}图片…`} /></div>
      ) : url ? (
        <a href={url} target="_blank" rel="noreferrer" aria-label={`查看${title}大图`}><img src={url} alt={title} /></a>
      ) : (
        <p role="status">{busy ? `正在处理${subject}图片…` : legacy ? preview.key === legacy ? '已有视角图片读取失败，请重新打开。' : '正在合成已有视角…' : isScene ? '生成后在这里查看完整九宫格场景图' : '生成后在这里查看完整三视图'}</p>
      )}
    </section>
  );
}

interface Props<V extends string> {
  subject: '人物' | '场景';
  definitions: readonly AssetViewDefinition<V>[];
  photos: ReturnType<typeof useSalesAssetViews<V>>;
  busy: boolean;
  readOnly?: boolean;
}

export function SalesAssetViewGallery<V extends string>({ subject, definitions, photos, busy, readOnly = false }: Props<V>) {
  const angles = definitions.filter(({ id }) => id !== 'main');
  const main = definitions.find(({ id }) => id === 'main');
  const awaitingMain = photos.creationMode && !photos.views.main;
  const hasSceneSheet = subject === '场景' && Boolean((photos.views as Record<string, string>).sheet);
  const strip = subject === '人物' || hasSceneSheet;
  const reference = photos.creationMode ? photos.referenceUrl : photos.views.main;
  const progress = {
    '': '处理中…',
    uploading: '上传中…',
    prompt: '准备中…',
    analyzing: strip ? '正在反推绘图提示词…' : '准备提示词…',
    creating: '生成主图…',
    generating: strip ? '正在生成人物三视图…' : '生成视角…',
    cropping: '保存图片…',
  }[photos.stage];
  const prompt = photos.creation?.prompt || '';
  const promptPanel = (prompt || (strip && !readOnly && photos.missing.length > 0)) && (
    <section className="sales-asset-prompt" aria-label="绘图提示词">
      <div>
        <h3>{strip ? '反推绘图提示词' : '绘图提示词'}</h3>
        {prompt && <SalesScriptCopyButton text={prompt} label="复制提示词" />}
      </div>
      {prompt ? (
        <textarea aria-label="绘图提示词" value={prompt} readOnly rows={5} />
      ) : (
        <p className="sales-asset-generation-status">
          {photos.stage === 'analyzing' ? '正在识别参考图中的人物、服装和光线…' : '先从参考图反推绘图提示词，再用提示词和参考图自动生成三视图。'}
        </p>
      )}
    </section>
  );
  const renderView = ({ id, label, hint }: AssetViewDefinition<V>) => (
    <div key={id} className={`sales-persona-view ${photos.views[id] ? 'has-image' : ''}`}>
      <label className={`sales-persona-upload ${salesFocusClass}`}>
        {photos.views[id] ? (
          <img src={proxyMediaUrl(photos.views[id])} alt={`${subject}${label}`} />
        ) : (
          <span className="sales-persona-placeholder">
            {id === 'main' && photos.creationMode ? <Sparkles size={22} /> : !awaitingMain && <Plus size={id === 'main' ? 22 : 18} />}
            <strong>{readOnly ? '未添加' : id === 'main' && photos.creationMode ? '等待生成' : id === 'main' ? '上传主图' : label}</strong>
          </span>
        )}
        {!readOnly && !awaitingMain && !(id === 'main' && photos.creationMode) && (
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            aria-label={`上传${label}参考图`}
            title={hint}
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void photos.upload(id, file);
            }}
          />
        )}
        {photos.active.includes(id) && (
          <div className="absolute inset-0">
            <AIGeneratingCard embedded statusText={progress} />
          </div>
        )}
      </label>
      <span className="sales-persona-view-label">{label}</span>
      {photos.views[id] && (
        <a
          className={`sales-persona-preview ${salesFocusClass}`}
          href={proxyMediaUrl(photos.views[id])}
          target="_blank"
          rel="noreferrer"
          aria-label={`查看${subject}${label}`}
        >
          <ArrowUpRight size={14} />
        </a>
      )}
      {!readOnly && photos.views[id] && !(id === 'main' && photos.creationMode) && (
        <button
          type="button"
          className={`sales-persona-remove ${salesFocusClass}`}
          aria-label={`移除${label}参考图`}
          disabled={busy}
          onClick={() => photos.remove(id)}
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
  return (
    <>
      {(photos.creationMode || strip) && (
        <div className={`sales-asset-reference ${reference ? 'has-image' : ''}`}>
          <label className={`sales-asset-reference-upload ${salesFocusClass}`}>
            {reference && !strip ? <img src={proxyMediaUrl(reference)} alt={`${subject}参考图`} /> : <ImagePlus size={22} aria-hidden />}
            <span>
              <strong>参考图</strong>
              <small>{readOnly ? (reference ? '已添加' : '未添加') : reference ? '点击更换图片' : '上传图片'}</small>
            </span>
            {!readOnly && (
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                aria-label={`上传${subject}参考图`}
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void (photos.creationMode ? photos.uploadReference(file) : photos.upload('main', file));
                }}
              />
            )}
          </label>
          {!readOnly && photos.referenceUrl && (
            <button
              type="button"
              className={salesGhostButtonClass}
              aria-label="移除参考图"
              disabled={busy}
              onClick={photos.removeReference}
            >
              <X size={14} />
            </button>
          )}
        </div>
      )}
      {strip && promptPanel}
      {!readOnly && (
        <div className="sales-persona-complete">
          <span role="status" className="sales-asset-generation-status">
            {photos.active.length > 0 ? progress : !photos.missing.length && photos.views.main ? '图片已就绪' : ''}
          </span>
          <div className="sales-persona-complete-actions">
            <ConfiguredModelPicker
              ariaLabel="资产生图模型"
              options={photos.models}
              value={photos.model}
              onChange={photos.setModel}
              disabled={busy || photos.recovering || photos.reusable || !photos.missing.length}
              modalityKind="image"
              variant="agent"
              emptyLabel="请先在设置中配置生图模型"
              className={`sales-persona-model ${salesFocusClass}`}
            />
            <button
              type="button"
              className={`${salesGhostButtonClass} sales-asset-generate-button`}
              disabled={
                busy ||
                !(photos.creationMode ? photos.referenceUrl : photos.views.main) ||
                !photos.model ||
                (!photos.missing.length && Boolean(photos.views.main)) ||
                photos.canGenerate === false
              }
              onClick={() => void photos.generate()}
            >
              {photos.active.length > 0 ? (
                <Loader2 size={14} className="animate-spin" />
              ) : photos.recovering ? (
                <RefreshCw size={14} />
              ) : (
                <Sparkles size={14} />
              )}
              {photos.active.length > 0
                ? progress
                : !photos.missing.length && photos.views.main
                  ? '生成完成'
                  : photos.reusable || photos.recovering
                    ? '继续生成'
                    : strip
                      ? prompt
                        ? '生成人物三视图'
                        : '反推提示词并生成三视图'
                      : photos.creationMode
                        ? '生成资产'
                        : '补全视角'}
            </button>
          </div>
        </div>
      )}
      {strip ? (
        <SalesPersonaSheet subject={subject} views={photos.views} busy={busy} generating={photos.active.length > 0} progressText={progress} />
      ) : (
        <div className="sales-asset-view-layout sales-scene-views" aria-label="场景参考图与补充视角">
          <div className="sales-asset-main-view">
            <h3>
              {photos.creationMode ? '生成主图' : '资产主图'}
              {photos.views.main && (
                <a
                  href={proxyMediaUrl(photos.views.main)}
                  download={`${subject}主图.jpg`}
                  className={salesFocusClass}
                  aria-label={`下载${subject}主图`}
                >
                  <Download size={14} />
                </a>
              )}
            </h3>
            {main && renderView(main)}
          </div>
          <div className="sales-asset-grid-views">
            <h3>
              场景视角 <span>{angles.filter(({ id }) => photos.views[id]).length} / {angles.length}</span>
            </h3>
            <div className="sales-persona-views">{angles.map(renderView)}</div>
          </div>
        </div>
      )}
      {!strip && promptPanel}
      {photos.notice && (
        <p role="status" className="sales-material-notice">
          {photos.notice}
        </p>
      )}
      {photos.error && (
        <p role="alert" className="sales-material-error">
          {photos.error}
          {photos.unconfirmedBackground && '；请继续生成以确认任务状态。'}
        </p>
      )}
      {!strip && photos.extraImages.length > 0 && (
        <details className="sales-persona-history">
          <summary>其他已有参考图 · {photos.extraImages.length} 张</summary>
          <div>
            {photos.extraImages.map((url) => (
              <img key={url} src={proxyMediaUrl(url)} alt={`已有的${subject}参考图`} />
            ))}
          </div>
        </details>
      )}
    </>
  );
}
