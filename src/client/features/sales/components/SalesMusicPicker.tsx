import { useEffect, useRef } from 'react';
import { Music, Upload } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { StudioAudioPlayer } from '@client/shared/ui/studio/StudioAudioPlayer';
import type { RankedAsset, SalesBgmCandidate } from '@shared/domain/sales';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import { compareSalesAssetNames } from '../model/salesAssetNames';
import { salesFocusClass, salesInputClass } from './salesChrome';

interface Props {
  active?: boolean;
  plan: SalesProductionPlanState;
  rankedBgms: readonly RankedAsset<SalesBgmCandidate>[];
  selectedBgm: SalesBgmCandidate | null;
  disabled: boolean;
  onPatchPlan: (patch: Partial<SalesProductionPlanState>) => void;
  onUploadBgm: (file: File) => void;
}

export function SalesMusicPicker({ active = true, plan, rankedBgms, selectedBgm, disabled, onPatchPlan, onUploadBgm }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const audioUrl = plan.customBgmUrl || selectedBgm?.audioUrl || '';

  useEffect(() => {
    if (!active || disabled) {
      rootRef.current?.querySelectorAll('audio').forEach((media) => media.pause());
    }
  }, [active, disabled]);

  return (
    <div ref={rootRef} className="sales-bgm-picker" aria-label="成片配乐选择">
      <div className="sales-bgm-row">
        <select
          aria-label="选择成片配乐"
          disabled={disabled || Boolean(plan.customBgmUrl) || rankedBgms.length === 0}
          value={plan.customBgmUrl ? '__uploaded__' : selectedBgm?.id || ''}
          onChange={(event) => onPatchPlan({ bgmId: event.target.value, mixedVideoUrl: '' })}
          className={salesInputClass}
        >
          {plan.customBgmUrl && <option value="__uploaded__">已使用上传配乐</option>}
          {!plan.customBgmUrl && rankedBgms.length === 0 && <option value="">暂不添加背景音乐</option>}
          {[...rankedBgms].sort((a, b) => compareSalesAssetNames(a.item.title, b.item.title)).map(({ item }) => (
            <option key={item.id} value={item.id}>{item.id === rankedBgms[0]?.item.id ? '推荐 · ' : ''}{item.title}（{Math.round(item.durationSec * 10) / 10} 秒 · {item.bpm} BPM）</option>
          ))}
        </select>
      </div>
      {audioUrl && (
        <StudioAudioPlayer
          src={proxyMediaUrl(audioUrl)}
          label={plan.customBgmUrl ? '上传配乐试听' : selectedBgm?.title || '配乐试听'}
          durationHintSec={plan.customBgmUrl ? undefined : selectedBgm?.durationSec}
          compact
        />
      )}
      <div className="sales-bgm-meta">
        <span><Music size={11} aria-hidden />{plan.customBgmUrl ? '使用上传的音乐' : selectedBgm?.license || '可上传音乐，为视频添加氛围'}</span>
        <input ref={inputRef} type="file" accept="audio/*" className="hidden" onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onUploadBgm(file);
        }} />
        <div className="flex items-center gap-3">
          {plan.customBgmUrl && (
            <button type="button" disabled={disabled} onClick={() => onPatchPlan({ customBgmUrl: '', mixedVideoUrl: '' })} className={`sales-link-btn ${salesFocusClass}`}>
              {rankedBgms.length ? '使用素材库配乐' : '移除配乐'}
            </button>
          )}
          <button type="button" disabled={disabled} onClick={() => inputRef.current?.click()} className={`sales-link-btn ${salesFocusClass}`}>
            <Upload size={11} aria-hidden />{plan.customBgmUrl ? '更换配乐' : '上传配乐'}
          </button>
        </div>
      </div>
    </div>
  );
}
