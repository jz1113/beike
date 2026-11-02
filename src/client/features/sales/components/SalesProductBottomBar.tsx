import { ArrowRight, ImagePlus, Loader2, ScanText, Sparkles, Square } from 'lucide-react';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import { useSalesSummaryModels } from '../hooks/useSalesSummaryModels';
import { salesSummarySource } from '../model/salesSummary';
import { salesWorkflow } from '../model/salesWorkflow';
import { SalesBottomActionBar } from './SalesBottomActionBar';
import type { SalesOCRProps } from './salesOCRTypes';
import { salesFocusClass, salesGhostButtonClass, salesPrimaryButtonClass } from './salesChrome';

interface Props extends SalesOCRProps {
  onAddOCRImages?: (urls: string[]) => void;
  onRequestImages?: () => void;
}

export function SalesProductBottomBar({ state, disabled, onChange, onRecognize, onCancel, progress, onRetryFailed, summaryActions, onAddOCRImages, onRequestImages }: Props) {
  const { model, options } = useSalesSummaryModels(state.summaryModel);
  const source = salesSummarySource(state);
  const flow = salesWorkflow(state);
  const pending = Boolean(summaryActions?.pending);
  const hasResult = Boolean(state.productSummary);
  const locked = disabled || pending || Boolean(progress);
  const candidates = state.imageCatalog.filter((image) => !image.unavailable);
  const details = candidates.filter((image) => image.role === 'detail');
  const defaults = (details.length ? details : candidates).slice(0, 6);
  const addImages = () => onRequestImages ? onRequestImages() : onAddOCRImages?.(defaults.map((image) => image.url));
  const allFailed = flow.pending.length > 0 && flow.pending.every((image) => flow.failed.includes(image));
  const reason = source.error || (!model ? '请在底部选择卖点提炼模型。' : '');
  const next = () => summaryActions?.onScrollToProduction?.();
  const label = pending ? '提炼中' : hasResult ? '下一步：分镜脚本' : '提炼卖点';
  const Icon = pending ? Loader2 : hasResult ? ArrowRight : Sparkles;
  const action = hasResult ? next : () => summaryActions?.onRun(model);
  const actionUnavailable = hasResult ? !summaryActions?.onScrollToProduction : !summaryActions || Boolean(reason);
  const recognized = !flow.pending.length && flow.completed.length > 0;
  const ocrLabel = progress ? '停止识别' : flow.pending.length ? allFailed ? '重试识别' : 'OCR 识别' : recognized ? 'OCR 已识别' : '添加详情图';
  const OCRIcon = progress ? Square : flow.pending.length || recognized ? ScanText : ImagePlus;
  const ocrAction = progress ? onCancel : flow.pending.length ? () => allFailed ? onRetryFailed() : onRecognize() : addImages;
  const ocrUnavailable = !progress && (locked || recognized || (!flow.pending.length && !onRequestImages && (!onAddOCRImages || !defaults.length)));

  return (
    <SalesBottomActionBar
      ariaLabel="商品资料底部操作栏"
      className="sales-product-actionbar"
      right={(
        <div className="sales-product-action-controls">
          <div className="sales-product-tools">
            <div className="sales-product-model-control">
              <ConfiguredModelPicker ariaLabel="卖点提炼模型" value={model} options={options} onChange={(summaryModel) => onChange({ summaryModel })} disabled={locked} isUp className={`sales-product-model-picker ${salesFocusClass}`} />
            </div>
            <button type="button" disabled={ocrUnavailable} onClick={ocrAction} title={recognized ? '当前图片已识别，可在图片上重新识别或添加详情图。' : '本地 OCR 逐张识别图片文字，不使用提炼模型。'} className={salesGhostButtonClass}>
              <OCRIcon size={14} aria-hidden />{ocrLabel}
            </button>
          </div>
          <div className="sales-product-next-actions">
            {pending ? (
              <button type="button" onClick={summaryActions?.onCancel} className={`sales-text-button ${salesFocusClass}`}><Square size={12} aria-hidden />停止提炼</button>
            ) : hasResult ? (
              <button type="button" disabled={locked || !summaryActions || Boolean(reason)} title={reason || undefined} onClick={() => summaryActions?.onRun(model)} className={`sales-text-button ${salesFocusClass}`}>重新提炼</button>
            ) : null}
            <button type="button" disabled={locked || actionUnavailable} title={!hasResult ? reason || '使用当前识别文字与补充内容提炼，单次最多 16 张图片。' : undefined} onClick={action} className={salesPrimaryButtonClass}>
              <Icon size={14} className={pending ? 'animate-spin' : undefined} aria-hidden />{label}
            </button>
          </div>
        </div>
      )}
    />
  );
}
