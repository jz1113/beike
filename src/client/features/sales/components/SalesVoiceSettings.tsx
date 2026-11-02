import { ArrowUpRight, AudioLines } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { RankedAsset, SalesBeatVoiceMode, SalesVoiceCandidate } from '@shared/domain/sales';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import { compareSalesAssetNames } from '../model/salesAssetNames';
import { SalesLibrarySelect } from './SalesLibrarySelect';
import { salesFocusClass } from './salesChrome';

interface Props {
  effectiveVoiceMode: SalesBeatVoiceMode;
  rankedVoices: readonly RankedAsset<SalesVoiceCandidate>[];
  selectedVoice: SalesVoiceCandidate | null;
  disabled: boolean;
  onEditPresentation: () => void;
  onOpenMaterials: () => void;
  onPatchPlan: (patch: Partial<SalesProductionPlanState>) => void;
}

export function SalesVoiceSettings({
  effectiveVoiceMode, rankedVoices, selectedVoice, disabled,
  onEditPresentation, onOpenMaterials, onPatchPlan,
}: Props) {
  const modeLabel = effectiveVoiceMode === 'speech' ? '真人口播' : effectiveVoiceMode === 'voiceover' ? '画外旁白' : '无介绍声音';
  const voiceReason = rankedVoices.find(({ item }) => item.id === selectedVoice?.id)?.reasons.join(' · ') || '';
  const sampleUrl = selectedVoice?.sampleAudioUrl.trim() || '';
  return <>
    <div className="sales-binding-voice-mode">
      <span>{modeLabel}</span>
      <button type="button" disabled={disabled} onClick={onEditPresentation} className={`sales-link-btn ${salesFocusClass}`}>
        调整介绍方式<ArrowUpRight size={12} aria-hidden />
      </button>
    </div>
    {effectiveVoiceMode === 'voiceover' ? <>
      {!rankedVoices.length ? <div className="sales-binding-empty">
        <AudioLines size={20} aria-hidden />
        <div><strong>还没有旁白音色</strong><p>在素材库添加音色后，即可在这里选择。</p></div>
        <button type="button" disabled={disabled} onClick={onOpenMaterials} className={`sales-link-btn ${salesFocusClass}`}>去添加音色<ArrowUpRight size={12} aria-hidden /></button>
      </div> : <>
        <div className="sales-binding-select">
          <SalesLibrarySelect label="选择旁白音色" searchable
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
          <audio key={sampleUrl} controls preload="none" src={proxyMediaUrl(sampleUrl)} aria-label={`${selectedVoice?.name || '当前音色'}试听`} />
        </div>}
      </>}
      <p className="sales-binding-note">背景音乐在「生成成片」中搭配。</p>
    </> : <p className="sales-binding-note">
      {effectiveVoiceMode === 'speech'
        ? '真人口播的声音随视频一同生成，无需单独选择旁白音色。'
        : '当前不生成口播或旁白，可在「表现与动作」中开启介绍。'}
      背景音乐在「生成成片」中搭配。
    </p>}
  </>;
}
