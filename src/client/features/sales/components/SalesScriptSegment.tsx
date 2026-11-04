import { AlertTriangle } from 'lucide-react';
import { SALES_IMAGE_VIEW_LABELS, isSalesProductImageView, type SalesScriptBeat } from '@shared/domain/sales';
import type { ScriptStoryboardSegment } from '../model/salesScriptStoryboard';
import { salesFocusClass } from './salesChrome';
import { SalesScriptCopyButton } from './SalesScriptCopyButton';
import '../salesScriptSegment.css';

interface Props {
  segment: ScriptStoryboardSegment;
  leakedTerms: string[];
  onFixLeak: (term: string) => void;
  onChangeBeat: (patch: Partial<SalesScriptBeat>) => void;
  disabled?: boolean;
}

export function SalesScriptSegment({ segment, leakedTerms, onFixLeak, onChangeBeat, disabled = false }: Props) {
  const { beat } = segment;
  const durationSec = Math.round(Math.max(0, beat.end - beat.start) * 10) / 10;
  const requiredViewLabel = isSalesProductImageView(beat.requiredView) ? SALES_IMAGE_VIEW_LABELS[beat.requiredView] : '';

  return (
    <section aria-label={`动作段 ${segment.address.beat + 1}`}>
      <header className="sales-storyboard-segment-heading">
        <div className="sales-storyboard-segment-title">
          <strong>动作段 {segment.address.beat + 1}</strong>
          <span className="sales-storyboard-segment-time">{segment.range}</span>
        </div>
        <div className="sales-storyboard-segment-tags">
          <span>{durationSec}s</span>
          {beat.shotSize && <span>{beat.shotSize}</span>}
          {requiredViewLabel && <span>需：{requiredViewLabel}</span>}
          {beat.estimated && <span className="sales-beat-est-tag">时间待核对</span>}
        </div>
      </header>
      <div className="sales-storyboard-source-voice" aria-label={`分镜 ${segment.index} 原片声音记录`}>
        <strong>原片声音与字幕</strong>
        <p>仅记录原片中可辨认的内容；未识别到时可对照原视频补录。这里的内容作为改写参考，不会直接作为成片台词。</p>
        <label>原片台词
          <textarea aria-label={`分镜 ${segment.index} 原片台词`} value={beat.voice.text} maxLength={1000} rows={2} disabled={disabled}
            placeholder="未记录原片台词，可对照视频补录" onChange={(event) => onChangeBeat({ voice: { ...beat.voice, text: event.target.value } })} />
        </label>
        <label>原片字幕
          <textarea aria-label={`分镜 ${segment.index} 原片字幕`} value={beat.subtitle} maxLength={400} rows={2} disabled={disabled}
            placeholder="未记录原片字幕，可对照视频补录" onChange={(event) => onChangeBeat({ subtitle: event.target.value })} />
        </label>
        <label>话术结构
          <textarea aria-label={`分镜 ${segment.index} 话术结构`} value={beat.voice.linePattern} maxLength={600} rows={2} disabled={disabled}
            placeholder="可填写本段话术的表达方式" onChange={(event) => onChangeBeat({ voice: { ...beat.voice, linePattern: event.target.value } })} />
        </label>
        <label className="sales-storyboard-source-uncertain">
          <input type="checkbox" checked={beat.voice.uncertain} disabled={disabled}
            onChange={(event) => onChangeBeat({ voice: { ...beat.voice, uncertain: event.target.checked } })} />台词待核对
        </label>
      </div>
      {leakedTerms.length > 0 && (
        <div className="sales-beat-leak" role="alert">
          <AlertTriangle size={12} aria-hidden />
          <span>检测到原片专属词残留：{leakedTerms.join('、')}</span>
          {leakedTerms.map((term) => <button key={term} type="button" onClick={() => onFixLeak(term)} className={salesFocusClass}>替换「{term}」为 {'{{商品}}'}</button>)}
        </div>
      )}
      <div className="sales-storyboard-prompt-panel">
        <div className="sales-storyboard-prompt-heading">
          <strong>分镜资料<span>原始记录</span></strong>
          <SalesScriptCopyButton text={segment.prompt} label="复制分镜资料" />
        </div>
        <blockquote className="sales-storyboard-prompt">{segment.prompt}</blockquote>
      </div>
    </section>
  );
}
