import { Loader2, ScanText, Square } from 'lucide-react';
import { salesWorkflow } from '../model/salesWorkflow';
import type { SalesOCRProps } from './salesOCRTypes';
import { salesGhostButtonClass, salesPrimaryButtonClass } from './salesChrome';

type Props = Pick<SalesOCRProps, 'state' | 'disabled' | 'onRecognize' | 'onCancel' | 'progress' | 'onRetryFailed'> & { primary?: boolean };

/** Recognition shares the product action bar; edited text is ready without a collection step. */
export function SalesOCRActions({ state, disabled, onRecognize, onCancel, progress, onRetryFailed, primary = true }: Props) {
  const flow = salesWorkflow(state);
  const buttonClass = primary ? salesPrimaryButtonClass : salesGhostButtonClass;
  if (progress) return <>
    <button type="button" disabled className={buttonClass}><Loader2 size={13} className="animate-spin" aria-hidden />识别中</button>
    <button type="button" onClick={onCancel} className={salesGhostButtonClass}><Square size={12} aria-hidden />停止识别</button>
  </>;
  if (!flow.pending.length) return null;
  const allFailed = flow.pending.every((image) => flow.failed.includes(image));
  return (
    <button type="button" disabled={disabled} onClick={() => allFailed ? onRetryFailed() : onRecognize()} className={buttonClass}>
      <ScanText size={13} aria-hidden />{allFailed ? '重试识别' : flow.completed.length ? '继续识别' : '识别文字'}
    </button>
  );
}
