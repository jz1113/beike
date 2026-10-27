import { ArrowUpRight, Check, ImageIcon, MoreHorizontal, PackageOpen, Pencil, TriangleAlert, ZoomIn } from 'lucide-react';
import LazyProxyImage from '@client/shared/ui/LazyProxyImage';
import type { WorkshopBatchSummary } from '@shared/contracts/workshopBatches';
import type { WorkshopBatch } from '@shared/workshopSnapshot';
import { isUsableWorkshopResult } from '../../model/generation/workshopReadiness';
import { batchHistoryMetrics, batchHistoryProductSummary, batchHistoryProgress, batchHistoryTitle } from '../../model/workspace/batchHistory';

type HistoryProduct = WorkshopBatch['snapshot']['items'][number];

function hasCompletedCopy(item: HistoryProduct) {
  const copy = item.copywriting as { title?: unknown; content?: unknown } | undefined;
  return typeof copy?.title === 'string' && Boolean(copy.title.trim())
    && typeof copy.content === 'string' && Boolean(copy.content.trim());
}

export function formatBatchHistoryDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '时间未知' : date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

export function BatchHistoryRecord({ batch, disabled, selected, selectionMode = false, checked = false, onView, onRename }: {
  batch: WorkshopBatchSummary; disabled: boolean; selected: boolean; selectionMode?: boolean; checked?: boolean; onView: () => void; onRename?: () => void;
}) {
  const title = batchHistoryTitle(batch);
  const thumb = batch.previewImages?.[0];
  const metrics = batchHistoryMetrics(batch);
  const content = <>
    <span className="history-record-image">
      {thumb ? <LazyProxyImage src={thumb} width={160} alt="批次缩略图" className="object-cover" /> : <PackageOpen size={22} strokeWidth={1.4} />}
    </span>
    <span className="history-record-content">
      <span className="history-record-title" title={title}>{title}</span>
      <span className="history-record-summary">{batchHistoryProductSummary(batch)}</span>
      <span className="history-record-meta"><span>{batchHistoryProgress(batch)}</span><time dateTime={batch.updatedAt}>{formatBatchHistoryDate(batch.updatedAt)}</time>{metrics.failedCount > 0 && <span className="history-warning">{metrics.failedCount} 个失败</span>}</span>
    </span>
  </>;
  if (selectionMode) return <label className="history-record" data-checked={checked} aria-disabled={disabled}><input type="checkbox" disabled={disabled} checked={checked} onChange={onView} aria-label={`选择 ${title}`} />{content}</label>;
  return <div className="history-record-shell">
    <button type="button" data-batch-id={batch.id} disabled={disabled} onClick={onView} aria-label={`查看 ${title}`} aria-pressed={selected} className="history-record">{content}</button>
    {onRename && <details className="history-record-menu" onClick={event => event.stopPropagation()}>
      <summary aria-label={`批次操作 ${title}`} title="批次操作"><MoreHorizontal size={16} /></summary>
      <div className="history-record-menu-popover"><button type="button" disabled={disabled} onClick={event => { event.preventDefault(); onRename(); }}><Pencil size={14} />重命名</button></div>
    </details>}
  </div>;
}

export function BatchHistoryStats({ batch }: { batch: { snapshot: Pick<WorkshopBatch['snapshot'], 'items'> } }) {
  const items = batch.snapshot.items;
  const tasks = items.flatMap(item => item.tasks).filter(task => task.resultStatus !== 'superseded');
  const failed = tasks.filter(task => task.status === 'FAILURE').length;
  const stats: [number, string][] = [[items.length, '款商品'], [tasks.filter(isUsableWorkshopResult).length, '张成图']];
  if (failed) stats.push([failed, '镜失败']);
  return <dl className="history-stats">
    {stats.map(([count, label]) => <div key={label} className={label === '镜失败' && count > 0 ? 'history-warning' : ''}>
      <dt>{label}</dt><dd>{count}</dd>
    </div>)}
  </dl>;
}

export function BatchHistoryProduct({ item, index, onPreview }: { item: HistoryProduct; index: number; onPreview: (images: string[], index: number, title: string) => void }) {
  const tasks = item.tasks.filter(task => task.resultStatus !== 'superseded');
  const images = tasks.filter(isUsableWorkshopResult);
  const failed = tasks.filter(task => task.status === 'FAILURE').length;
  const hasCopy = hasCompletedCopy(item);
  const productImages = item.selectedProductImages.length ? item.selectedProductImages : item.coverImage ? [item.coverImage] : [];
  const thumb = productImages[0];
  const title = item.title?.trim() || `商品 ${item.itemId || index + 1}`;
  return <li className={`history-product ${images.length ? 'has-images' : ''}`}>
    <div className="history-product-heading">
      <button type="button" disabled={!thumb} onClick={() => onPreview(productImages, 0, `${title} · 商品参考图`)} aria-label={`预览 ${title} 商品图`} className="history-product-reference">
        {thumb ? <LazyProxyImage src={thumb} width={200} alt={title} className="object-contain" /> : <ImageIcon size={24} strokeWidth={1.4} />}
        <span className="history-reference-zoom" aria-hidden="true"><ZoomIn size={16} /></span>
      </button>
      <div className="history-product-description">
        <p className="history-product-index">商品 {String(index + 1).padStart(2, '0')} <span>SKU {item.itemId || '未提供'}</span></p>
        <h5 title={title}>{title}</h5>
        <div className="history-product-meta"><span>{tasks.length ? `成图 ${images.length}/${tasks.length}` : '尚未生成'}</span><span aria-hidden="true">/</span><span className={hasCopy ? 'history-success' : ''}>{hasCopy && <Check size={12} />}{hasCopy ? '文案已完成' : '文案待完善'}</span>{failed > 0 && images.length > 0 && <span className="history-warning">{failed} 个分镜失败</span>}</div>
      </div>
      {images.length > 0 && <button type="button" className="history-product-preview history-icon-button" onClick={() => onPreview(images.map(image => image.resultUrl!), 0, `${title} · 生成结果`)} aria-label={`预览 ${title} 全部成图`}><ArrowUpRight size={18} /></button>}
    </div>
    {images.length > 0 ? <div className="history-image-grid">
      {images.map((task, imageIndex) => <button key={task.id} type="button" onClick={() => onPreview(images.map(image => image.resultUrl!), imageIndex, `${title} · 生成结果`)} aria-label={`预览 ${title} 第 ${task.shot_no} 镜`} className="history-result">
        <span className="history-result-image"><LazyProxyImage src={task.resultUrl} width={480} alt={task.title || `第 ${task.shot_no} 镜`} className="object-contain" /><span className="history-result-zoom"><ZoomIn size={22} strokeWidth={1.5} /></span></span>
        <span className="history-result-caption"><span>{String(task.shot_no).padStart(2, '0')}</span><span>{task.title || `第 ${task.shot_no} 镜`}</span></span>
      </button>)}
    </div> : <div className={`history-product-empty ${failed ? 'is-failed' : ''}`}>
      {failed ? <TriangleAlert size={16} strokeWidth={1.6} /> : <ImageIcon size={16} strokeWidth={1.6} />}
      <span>{failed ? `${failed} 个分镜失败` : tasks.length ? '暂无可预览的成图' : '尚未开始生成'}</span>
    </div>}
  </li>;
}

export function BatchHistoryArchiveLabel({ batch }: { batch: WorkshopBatch }) {
  return <span className="history-status">{batchHistoryProgress(batch)}</span>;
}
