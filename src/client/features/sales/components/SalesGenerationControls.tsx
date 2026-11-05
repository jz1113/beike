import { ListChecks, Square, Wand2 } from 'lucide-react';
import { salesGhostButtonClass, salesPrimaryButtonClass } from './salesChrome';

interface Props {
  working: boolean;
  busy: string;
  canGenerate: boolean;
  generated: boolean;
  hasVideo: boolean;
  statusHint: string;
  onCancel: () => void;
  onGenerate: () => void;
  onReview: () => void;
}
export function SalesGenerationControls({ working, busy, canGenerate, generated, hasVideo, statusHint, onCancel, onGenerate, onReview }: Props) {
  return <div>
    {working && busy !== 'loading' ? <button type="button" onClick={event => { if (event.detail <= 1) onCancel(); }} className={salesGhostButtonClass}>
      <Square size={12} aria-hidden />停止等待
    </button> : <button type="button" disabled={!canGenerate} title={statusHint || undefined}
      onClick={event => { if (canGenerate && event.detail <= 1) onGenerate(); }} className={salesPrimaryButtonClass}>
      <Wand2 size={14} aria-hidden />{generated ? '重新生成视频' : '生成视频'}
    </button>}
    <button type="button" disabled={working || !hasVideo} title={hasVideo ? undefined : '生成或导入视频后可核查'}
      onClick={onReview} className={salesGhostButtonClass}>
      <ListChecks size={14} aria-hidden />音频视频核查
    </button>
  </div>;
}
