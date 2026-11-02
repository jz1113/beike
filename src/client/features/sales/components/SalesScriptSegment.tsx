import { AlertTriangle } from 'lucide-react';
import { SALES_IMAGE_VIEW_LABELS, isSalesProductImageView } from '@shared/domain/sales';
import type { ScriptStoryboardSegment } from '../model/salesScriptStoryboard';
import { salesFocusClass } from './salesChrome';
import { SalesScriptCopyButton } from './SalesScriptCopyButton';
import '../salesScriptSegment.css';

interface Props {
  segment: ScriptStoryboardSegment;
  leakedTerms: string[];
  onFixLeak: (term: string) => void;
}

export function SalesScriptSegment({ segment, leakedTerms, onFixLeak }: Props) {
  const { beat } = segment;
  const durationSec = Math.round(Math.max(0, beat.end - beat.start) * 10) / 10;
  const requiredViewLabel = isSalesProductImageView(beat.requiredView) ? SALES_IMAGE_VIEW_LABELS[beat.requiredView] : '';

  return (
    <section id={`sales-script-segment-${segment.index}`} tabIndex={-1} className="sales-storyboard-segment" aria-labelledby={`sales-script-segment-title-${segment.index}`}>
      <header className="sales-storyboard-segment-heading">
        <span className="sales-storyboard-segment-number" aria-label={`分镜 ${segment.index}`}>{String(segment.index).padStart(2, '0')}</span>
        <div className="sales-storyboard-segment-title">
          <h3 id={`sales-script-segment-title-${segment.index}`}>{segment.title}</h3>
          <span className="sales-storyboard-segment-time">{segment.range}</span>
        </div>
        <div className="sales-storyboard-segment-tags">
          <span>{durationSec}s</span>
          {beat.shotSize && <span>{beat.shotSize}</span>}
          {requiredViewLabel && <span>需：{requiredViewLabel}</span>}
          {beat.estimated && <span className="sales-beat-est-tag">时间待核对</span>}
        </div>
      </header>
      <dl className="sales-storyboard-analysis">
        {segment.fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.text}</dd></div>)}
      </dl>
      {leakedTerms.length > 0 && (
        <div className="sales-beat-leak" role="alert">
          <AlertTriangle size={12} aria-hidden />
          <span>检测到原片专属词残留：{leakedTerms.join('、')}</span>
          {leakedTerms.map((term) => <button key={term} type="button" onClick={() => onFixLeak(term)} className={salesFocusClass}>替换「{term}」为 {'{{商品}}'}</button>)}
        </div>
      )}
      <div className="sales-storyboard-prompt-panel">
        <div className="sales-storyboard-prompt-heading">
          <strong>即梦生成提示词<span>中文</span></strong>
          <SalesScriptCopyButton text={segment.prompt} label="复制本段提示词" />
        </div>
        <blockquote className="sales-storyboard-prompt">{segment.prompt}</blockquote>
      </div>
    </section>
  );
}
