import { ArrowUpRight, AudioLines } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { StudioAudioPlayer } from '@client/shared/ui/studio/StudioAudioPlayer';
import { referenceAudioDurationLimits } from '@shared/domain/media/videoAudioLimits';
import { GROK_VIDEO_VOICES, grokPresetVoicesAllowed } from '@shared/domain/media/grokVoices';
import { upstreamModalityModelId } from '@shared/domain/models/modalityStorage';
import type { RankedAsset, SalesBeatVoiceMode, SalesVoiceCandidate } from '@shared/domain/sales';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import { compareSalesAssetNames } from '../model/salesAssetNames';
import { SalesLibrarySelect } from './SalesLibrarySelect';
import { salesFocusClass } from './salesChrome';

interface Props {
  effectiveVoiceMode: SalesBeatVoiceMode;
  rankedVoices: readonly RankedAsset<SalesVoiceCandidate>[];
  selectedVoice: SalesVoiceCandidate | null;
  voiceId?: string;
  videoModel?: string;
  videoVoiceId?: string;
  disabled: boolean;
  onEditPresentation: () => void;
  onOpenMaterials: () => void;
  onPatchPlan: (patch: Partial<SalesProductionPlanState>) => void;
}

export function SalesVoiceSettings({
  effectiveVoiceMode, rankedVoices, selectedVoice, voiceId = '', videoModel = '', videoVoiceId = '', disabled,
  onEditPresentation, onOpenMaterials, onPatchPlan,
}: Props) {
  const modeLabel = effectiveVoiceMode === 'speech' ? '真人口播' : effectiveVoiceMode === 'voiceover' ? '画外旁白' : '无介绍声音';
  const voiceReason = rankedVoices.find(({ item }) => item.id === selectedVoice?.id)?.reasons.join(' · ') || '';
  const sampleUrl = selectedVoice?.sampleAudioUrl.trim() || '';
  const audioLimits = effectiveVoiceMode === 'speech' ? referenceAudioDurationLimits(upstreamModalityModelId('video', videoModel)) : null;
  const grokSpeech = effectiveVoiceMode === 'speech' && grokPresetVoicesAllowed(upstreamModalityModelId('video', videoModel));
  return <>
    <div className="sales-binding-voice-mode">
      <span>{modeLabel}</span>
      <button type="button" disabled={disabled} onClick={onEditPresentation} className={`sales-link-btn ${salesFocusClass}`}>
        调整介绍方式<ArrowUpRight size={12} aria-hidden />
      </button>
    </div>
    {grokSpeech ? <>
      <label className="sales-binding-select">
        Grok 官方口播音色
        <select aria-label="Grok 官方口播音色" value={videoVoiceId} disabled={disabled}
          onChange={(event) => onPatchPlan({ videoVoiceId: event.target.value })} className={salesFocusClass}>
          <option value="">请选择预置音色</option>
          {GROK_VIDEO_VOICES.map((voice) => <option key={voice.id} value={voice.id}>{voice.name} · {voice.description}</option>)}
        </select>
      </label>
      <p className="sales-binding-note">Grok 官方接口使用预置音色生成口播，支持中文。自有声音样本需要 xAI 合作伙伴权限；原声音库选择已保留，可切换模型继续使用，或改为画外旁白后期合成。</p>
      {!videoVoiceId && <p className="sales-binding-note is-warning" role="status">请选择本次口播音色后生成视频。</p>}
    </> : effectiveVoiceMode !== 'none' ? <>
      {!rankedVoices.length ? <div className="sales-binding-empty">
        <AudioLines size={20} aria-hidden />
        <div><strong>还没有可用人声</strong><p>在声音库添加人声后，即可在这里选择。</p></div>
        <button type="button" disabled={disabled} onClick={onOpenMaterials} className={`sales-link-btn ${salesFocusClass}`}>浏览声音素材<ArrowUpRight size={12} aria-hidden /></button>
      </div> : <>
        <div className="sales-binding-select">
          <SalesLibrarySelect label={effectiveVoiceMode === 'speech' ? '选择口播人声' : '选择旁白人声'} searchable
            value={selectedVoice?.id || ''} disabled={disabled}
            onChange={(voiceId) => onPatchPlan({ voiceId })}
            options={rankedVoices.map(({ item, reasons }, index) => ({
              value: item.id, label: item.name,
              description: [index === 0 ? '推荐' : '', item.tags.join(' · ') || reasons.join(' · ')].filter(Boolean).join(' · '),
            })).sort((a, b) => compareSalesAssetNames(a.label, b.label))} />
        </div>
        {voiceReason && <p className="sales-binding-note">{voiceReason}</p>}
        {sampleUrl && <div className="sales-binding-voice-preview">
          <span>音色试听</span>
          <StudioAudioPlayer src={proxyMediaUrl(sampleUrl, { asAudio: true })} preload="metadata" label={`${selectedVoice?.name || '当前音色'}试听`} compact className="min-w-0 flex-1" />
        </div>}
      </>}
      {!selectedVoice && <p className="sales-binding-note is-warning" role="status">{voiceId ? '原选人声已不在声音库，请重新选择；不会自动更换音色。' : '请选择人声，真人口播和画外旁白都需要绑定声音。'}</p>}
      <p className="sales-binding-note">{effectiveVoiceMode === 'speech'
        ? sampleUrl ? '所选人声样本将作为口播声音参考，画面人物按分镜台词开口。' : '此音色尚无声音样本，请在「生成成片」先生成音色参考。'
        : '所选人声用于合成后期旁白。'}背景音乐在「生成成片」中搭配。</p>
      {audioLimits && <p className="sales-binding-note">参考音频每段 {audioLimits.minSeconds}～{audioLimits.maxSeconds} 秒{audioLimits.totalMaxSeconds ? `，合计不超过 ${audioLimits.totalMaxSeconds} 秒` : ''}；本地样本超长自动截取提交，声音库原件保留；短于 {audioLimits.minSeconds} 秒请换样本。</p>}
    </> : <p className="sales-binding-note">
      当前不生成口播或旁白，可在「表现与动作」中开启介绍。
      背景音乐在「生成成片」中搭配。
    </p>}
  </>;
}
