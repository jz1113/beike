import { Captions, Eye, Info, Layers, Mic, UserRound } from 'lucide-react';
import {
  SALES_PRESENTATION_MODE_LABELS,
  type SalesBeatVoiceMode,
  type SalesPresentationMode,
  type SalesScriptDomain,
} from '@shared/domain/sales';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import { SalesScriptVideoChoice } from './SalesScriptVideoChoice';
import { SalesSettingsChoice } from './SalesSettingsChoice';
import { salesFocusClass } from './salesChrome';
import '../salesSettings.css';

interface Props {
  script: SalesScriptDomain | null;
  plan: SalesProductionPlanState;
  effectiveVoiceMode: SalesBeatVoiceMode;
  disabled: boolean;
  onPresentationModeChange: (mode: SalesPresentationMode) => void;
  depthVideoUrl?: string;
  onScriptVideoReferenceChange: (mode: 'none' | 'depth') => void;
  onVoiceModeChange: (mode: '' | SalesBeatVoiceMode) => void;
}

export function SalesPresentationModePanel({
  script, plan, effectiveVoiceMode, disabled, onPresentationModeChange,
  depthVideoUrl, onScriptVideoReferenceChange, onVoiceModeChange,
}: Props) {
  return (
    <section className="sales-prod-card sales-presentation-panel" aria-label="表现与动作设置">
      <div className="sales-presentation-options">
        <div className="sales-presentation-group">
          <div className="sales-asset-box-head"><strong><Eye size={15} aria-hidden />表现形式</strong></div>
          <div className="sales-presentation-control">
            <div className="sales-settings-choices" role="group" aria-label="表现形式">
              {(['subtitled_intro', 'clean_visual'] as const).map((mode) => (
                <SalesSettingsChoice
                  key={mode}
                  icon={mode === 'subtitled_intro' ? <Captions size={17} aria-hidden /> : <Eye size={17} aria-hidden />}
                  title={SALES_PRESENTATION_MODE_LABELS[mode].title}
                  description={SALES_PRESENTATION_MODE_LABELS[mode].subtitle}
                  selected={plan.presentationMode === mode}
                  disabled={disabled}
                  onSelect={() => onPresentationModeChange(mode)}
                />
              ))}
            </div>
            {plan.presentationMode === 'subtitled_intro' && (
              <div className="sales-presentation-details">
                <div className="sales-presentation-voice-heading">介绍方式</div>
                <div className="sales-presentation-voice" role="group" aria-label="介绍方式">
                  {([
                    ['speech', '真人口播', '人物出镜讲解', UserRound],
                    ['voiceover', '画外旁白', '旁白配合画面', Mic],
                  ] as const).map(([value, label, description, Icon]) => (
                    <button key={value} type="button" disabled={disabled}
                      aria-pressed={effectiveVoiceMode === value}
                      onClick={() => onVoiceModeChange(value)} className={salesFocusClass}>
                      <Icon size={16} aria-hidden /><span><strong>{label}</strong><small>{description}</small></span>
                    </button>
                  ))}
                </div>
                {effectiveVoiceMode === 'none' && <p className="sales-settings-note" role="status">当前脚本未设置介绍声音，请选择一种介绍方式。</p>}
                <p className="sales-settings-note"><Info size={14} aria-hidden /><span>字幕以 SRT 草稿单独导出，需在剪辑软件中添加到视频。</span></p>
              </div>
            )}
          </div>
        </div>
        <div className="sales-presentation-group">
          <div className="sales-asset-box-head"><strong><Layers size={15} aria-hidden />动作参考</strong></div>
          <div className="sales-presentation-control">
            <SalesScriptVideoChoice plan={plan} hasScript={Boolean(script)} depthUrl={depthVideoUrl}
              disabled={disabled} onSelect={onScriptVideoReferenceChange} />
          </div>
        </div>
      </div>
    </section>
  );
}
