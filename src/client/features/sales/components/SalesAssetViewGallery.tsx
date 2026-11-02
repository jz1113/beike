import { Loader2, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import type { useSalesAssetViews } from '../hooks/useSalesAssetViews';
import type { AssetViewDefinition } from '../model/salesAssetViews';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';

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
  const progress = {
    '': '处理中…', uploading: '上传图片中…', prompt: '加载提示词…', generating: '生成九宫格…', cropping: '裁切保存中…',
  }[photos.stage];
  const progressDetail = photos.stage === 'cropping' ? '九宫格已生成，正在读取原图并裁切保存 9 张视角图…' : progress;
  const renderView = ({ id, label, hint }: AssetViewDefinition<V>) => <div key={id} className={`sales-persona-view ${photos.views[id] ? 'has-image' : ''}`}>
    <label className={`sales-persona-upload ${salesFocusClass}`}>
      {photos.views[id] ? <img src={proxyMediaUrl(photos.views[id])} alt={`${subject}${label}参考图`} /> : <span className="sales-persona-placeholder"><Plus size={id === 'main' ? 22 : 18} /><strong>{readOnly ? '未添加' : id === 'main' ? '上传主图' : label}</strong>{id === 'main' && <small>{hint}</small>}</span>}
      {!readOnly && <input type="file" accept="image/jpeg,image/png,image/webp,image/avif" aria-label={`上传${label}参考图`} title={hint} disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void photos.upload(id, file); }} />}
      {photos.active.includes(id) && <span className="sales-persona-loading" role="status"><Loader2 size={20} className="animate-spin" />{progress}</span>}
    </label>
    <span className="sales-persona-view-label">{label}{id === 'main' && ' · 必填'}</span>
    {!readOnly && photos.views[id] && <button type="button" className={`sales-persona-remove ${salesFocusClass}`} aria-label={`移除${label}参考图`} disabled={busy} onClick={() => photos.remove(id)}><X size={13} /></button>}
  </div>;
  return <>
    <div className={`sales-asset-view-layout ${subject === '场景' ? 'sales-scene-views' : ''}`} aria-label={`${subject}参考图与补充视角`}>
      <div className="sales-asset-main-view">
        <h3>参考主图</h3>
        {main && renderView(main)}
        <p>保留原图，用于统一{subject === '人物' ? '人物与服饰' : '空间与陈设'}。</p>
      </div>
      <div className="sales-asset-grid-views">
        <h3>九宫格视角 <span>{angles.filter(({ id }) => photos.views[id]).length} / {angles.length}</span></h3>
        <div className="sales-persona-views">{angles.map(renderView)}</div>
      </div>
    </div>
    {!readOnly && <div className="sales-persona-complete">
      <p role="status">{photos.active.length > 0 ? photos.background ? '正在保存资产并提交后台任务…' : progressDetail : !photos.missing.length ? '九个视角已齐全。' : photos.reusable ? '已有九宫格裁片，可直接恢复缺失视角。' : photos.recovering ? '继续处理原九宫格任务，沿用原模型与参考图。' : '生成 1 张九宫格，自动裁切为 9 张视角图。'}<br />{photos.background ? '填写名称并选择模型，后台生成完成后自动保存到资产库。' : '仅补齐空位，保留已有图片，统一保存为 JPG。'}</p>
      <div className="sales-persona-complete-actions">
        <ConfiguredModelPicker
          ariaLabel="补视角生图模型"
          options={photos.models}
          value={photos.model}
          onChange={photos.setModel}
          disabled={busy || photos.recovering || photos.reusable || !photos.missing.length}
          modalityKind="image"
          variant="agent"
          emptyLabel="请先在设置中配置生图模型"
          className={`sales-persona-model ${salesFocusClass}`}
        />
        <button type="button" className={salesGhostButtonClass} disabled={busy || !photos.views.main || !photos.model || !photos.missing.length || photos.canGenerate === false} onClick={() => void photos.generate()}>
          {photos.active.length > 0 ? <Loader2 size={14} className="animate-spin" /> : photos.recovering ? <RefreshCw size={14} /> : <Sparkles size={14} />}
          {photos.active.length > 0 ? photos.background ? '提交后台中…' : progress : !photos.missing.length ? '视角已齐全' : photos.reusable ? '恢复已有视角' : photos.recovering ? '继续补全' : photos.background ? '后台生成并自动入库' : '生成九宫格 · 1 张'}
        </button>
      </div>
    </div>}
    {photos.notice && <p role="status" className="sales-material-notice">{photos.notice}</p>}
    {photos.error && <p role="alert" className="sales-material-error">{photos.error}{photos.unconfirmedBackground && '；请点击继续补全核对原任务，避免重复入库。'}</p>}
    {photos.extraImages.length > 0 && <details className="sales-persona-history"><summary>其他已有参考图 · {photos.extraImages.length} 张</summary><div>{photos.extraImages.map((url) => <img key={url} src={proxyMediaUrl(url)} alt={`已有的${subject}参考图`} />)}</div></details>}
  </>;
}
