import { ArrowUpRight, Download, ImagePlus, Loader2, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import type { useSalesAssetViews } from '../hooks/useSalesAssetViews';
import type { AssetViewDefinition } from '../model/salesAssetViews';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';
import { SalesPersonaSheet } from './SalesPersonaSheet';
import { SalesScriptCopyButton } from './SalesScriptCopyButton';

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
  const strip = subject === '人物';
  const reference = photos.creationMode ? photos.referenceUrl : photos.views.main;
  const progress = {
    '': '处理中…', uploading: '上传中…', prompt: '准备中…', analyzing: strip ? '正在反推绘图提示词…' : '准备提示词…', creating: '生成主图…', generating: strip ? '正在生成人物三视图…' : '生成视角…', cropping: '保存图片…',
  }[photos.stage];
  const prompt = photos.creation?.prompt || '';
  const promptPanel = (prompt || (strip && !readOnly && photos.missing.length > 0)) && <section className="sales-asset-prompt" aria-label="绘图提示词">
    <div><h3>{strip ? '反推绘图提示词' : '绘图提示词'}</h3>{prompt && <SalesScriptCopyButton text={prompt} label="复制提示词" />}</div>
    {prompt ? <textarea aria-label="绘图提示词" value={prompt} readOnly rows={5} />
      : <p className="sales-asset-generation-status">{photos.stage === 'analyzing' ? '正在识别参考图中的人物、服装和光线…' : '先从参考图反推绘图提示词，再用提示词和参考图自动生成三视图。'}</p>}
  </section>;
  const renderView = ({ id, label, hint }: AssetViewDefinition<V>) => <div key={id} className={`sales-persona-view ${photos.views[id] ? 'has-image' : ''}`}>
    <label className={`sales-persona-upload ${salesFocusClass}`}>
      {photos.views[id] ? <img src={proxyMediaUrl(photos.views[id])} alt={`${subject}${label}`} /> : <span className="sales-persona-placeholder">{id === 'main' && photos.creationMode ? <Sparkles size={22} /> : !awaitingMain && <Plus size={id === 'main' ? 22 : 18} />}<strong>{readOnly ? '未添加' : id === 'main' && photos.creationMode ? '等待生成' : id === 'main' ? '上传主图' : label}</strong></span>}
      {!readOnly && !awaitingMain && !(id === 'main' && photos.creationMode) && <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" aria-label={`上传${label}参考图`} title={hint} disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void photos.upload(id, file); }} />}
      {photos.active.includes(id) && <span className="sales-persona-loading" role="status"><Loader2 size={20} className="animate-spin" />{progress}</span>}
    </label>
    <span className="sales-persona-view-label">{label}</span>
    {photos.views[id] && <a className={`sales-persona-preview ${salesFocusClass}`} href={proxyMediaUrl(photos.views[id])} target="_blank" rel="noreferrer" aria-label={`查看${subject}${label}`}><ArrowUpRight size={14} /></a>}
    {!readOnly && photos.views[id] && !(id === 'main' && photos.creationMode) && <button type="button" className={`sales-persona-remove ${salesFocusClass}`} aria-label={`移除${label}参考图`} disabled={busy} onClick={() => photos.remove(id)}><X size={13} /></button>}
  </div>;
  return <>
    {(photos.creationMode || strip) && <div className={`sales-asset-reference ${reference ? 'has-image' : ''}`}>
      <label className={`sales-asset-reference-upload ${salesFocusClass}`}>
        {reference && !strip ? <img src={proxyMediaUrl(reference)} alt={`${subject}参考图`} /> : <ImagePlus size={22} aria-hidden />}
        <span><strong>参考图</strong><small>{readOnly ? reference ? '已添加' : '未添加' : reference ? '点击更换图片' : '上传图片'}</small></span>
        {!readOnly && <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" aria-label={`上传${subject}参考图`} disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void (photos.creationMode ? photos.uploadReference(file) : photos.upload('main', file)); }} />}
      </label>
      {!readOnly && photos.referenceUrl && <button type="button" className={salesGhostButtonClass} aria-label="移除参考图" disabled={busy} onClick={photos.removeReference}><X size={14} /></button>}
    </div>}
    {strip && promptPanel}
    {!readOnly && <div className="sales-persona-complete">
      <span role="status" className="sales-asset-generation-status">{photos.active.length > 0 ? progress : !photos.missing.length && photos.views.main ? '图片已就绪' : ''}</span>
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
        <button type="button" className={`${salesGhostButtonClass} sales-asset-generate-button`} disabled={busy || !(photos.creationMode ? photos.referenceUrl : photos.views.main) || !photos.model || (!photos.missing.length && Boolean(photos.views.main)) || photos.canGenerate === false} onClick={() => void photos.generate()}>
          {photos.active.length > 0 ? <Loader2 size={14} className="animate-spin" /> : photos.recovering ? <RefreshCw size={14} /> : <Sparkles size={14} />}
          {photos.active.length > 0 ? progress : !photos.missing.length && photos.views.main ? '生成完成' : photos.reusable || photos.recovering ? '继续生成' : strip ? (prompt ? '生成人物三视图' : '反推提示词并生成三视图') : photos.creationMode ? '生成资产' : '补全视角'}
        </button>
      </div>
    </div>}
    {strip ? <SalesPersonaSheet views={photos.views} busy={busy} /> : <div className="sales-asset-view-layout sales-scene-views" aria-label="场景参考图与补充视角">
      <div className="sales-asset-main-view">
        <h3>{photos.creationMode ? '生成主图' : '资产主图'}{photos.views.main && <a href={proxyMediaUrl(photos.views.main)} download={`${subject}主图.jpg`} className={salesFocusClass} aria-label={`下载${subject}主图`}><Download size={14} /></a>}</h3>
        {main && renderView(main)}
      </div>
      <div className="sales-asset-grid-views">
        <h3>场景视角 <span>{angles.filter(({ id }) => photos.views[id]).length} / {angles.length}</span></h3>
        <div className="sales-persona-views">{angles.map(renderView)}</div>
      </div>
    </div>}
    {!strip && promptPanel}
    {photos.notice && <p role="status" className="sales-material-notice">{photos.notice}</p>}
    {photos.error && <p role="alert" className="sales-material-error">{photos.error}{photos.unconfirmedBackground && '；请继续生成以确认任务状态。'}</p>}
    {!strip && photos.extraImages.length > 0 && <details className="sales-persona-history"><summary>其他已有参考图 · {photos.extraImages.length} 张</summary><div>{photos.extraImages.map((url) => <img key={url} src={proxyMediaUrl(url)} alt={`已有的${subject}参考图`} />)}</div></details>}
  </>;
}
