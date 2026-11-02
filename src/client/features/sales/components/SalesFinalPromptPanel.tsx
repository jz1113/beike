import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Captions, ChevronDown, Download, Film, Loader2, Mic, Music, Square, Upload, Wand2 } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useSeedancePrecheck } from '@client/shared/api/generation/seedancePrecheck';
import { StudioAudioPlayer } from '@client/shared/ui/studio/StudioAudioPlayer';
import { isSeedance } from '@shared/domain/media/videoCapabilities';
import { upstreamModalityModelId, type ModalityPickerSelection } from '@shared/domain/models/modalityStorage';
import type { AssembledSalesPrompt, BeatProductImageBinding, SalesScriptDomain } from '@shared/domain/sales';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import { salesSubtitlesSrt } from '../model/salesSubtitles';
import { salesFocusClass, salesGhostButtonClass, salesPrimaryButtonClass } from './salesChrome';
import { SalesReferenceReview } from './SalesReferenceReview';
import { salesReferenceReviewKey } from '../model/salesReferenceReview';
import { SalesVideoSettings } from './SalesVideoSettings';
import { SalesDeliveryPreview } from './SalesDeliveryPreview';
import { resolveSalesVideoSettings } from '../model/salesVideoSettings';
import '../salesDelivery.css';

interface Props {
  active?: boolean;
  script: SalesScriptDomain;
  beatBindings: readonly BeatProductImageBinding[];
  musicPicker?: ReactNode;
  hasBackgroundMusic?: boolean;
  onEditMaterials: () => void;
  onEditStoryboard: () => void;
  assembled: AssembledSalesPrompt;
  plan: SalesProductionPlanState;
  videoModels: readonly ModalityPickerSelection[];
  voiceModels: readonly ModalityPickerSelection[];
  busy: '' | 'loading' | 'adapt' | 'tts' | 'video' | 'mix' | 'upload';
  progressText: string;
  generationSourceError?: string;
  onPatchPlan: (patch: Partial<SalesProductionPlanState>) => void;
  onSynthesizeVoice: () => void;
  onGenerateVideo: () => void;
  onUploadRawVideo: (file: File) => void;
  onMixFinal: () => void;
  onCancel: () => void;
}

export function SalesFinalPromptPanel({
  active = true, generationSourceError = '', assembled, plan, script, beatBindings, musicPicker, hasBackgroundMusic = false,
  onEditMaterials, onEditStoryboard, videoModels, voiceModels, busy, progressText,
  onPatchPlan, onSynthesizeVoice, onGenerateVideo, onUploadRawVideo, onMixFinal, onCancel,
}: Props) {
  const [confirmedKey, setConfirmedKey] = useState('');
  const referenceKey = salesReferenceReviewKey(assembled, beatBindings, plan.scriptId);
  const referencesConfirmed = confirmedKey === referenceKey;
  const rawVideoInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!active) panelRef.current?.querySelectorAll<HTMLMediaElement>('video, audio').forEach((media) => media.pause());
  }, [active]);

  const working = Boolean(busy);
  const { validationError, aspectRatio, durationSec } = resolveSalesVideoSettings(plan, script, assembled.references);
  const isCleanVisual = assembled.presentationMode === 'clean_visual';
  const subtitleSrt = useMemo(() => salesSubtitlesSrt(assembled.subtitles), [assembled.subtitles]);
  const activeVideoModel = plan.videoModel || 'doubao-seedance-2.5';
  const seedanceActive = isSeedance(upstreamModalityModelId('video', activeVideoModel));
  const selectedVoice = voiceModels.find((model) => model.id === plan.voiceModel)
    || voiceModels.find((model) => model.modelId === plan.voiceModel);
  const precheckInputs = useMemo(
    () => assembled.references.map((slot) => ({ url: slot.url, mediaType: slot.mediaType || 'image' })),
    [assembled.references],
  );
  const precheckMap = useSeedancePrecheck(precheckInputs, active && seedanceActive && precheckInputs.length > 0, activeVideoModel);
  const rejectedSlots = useMemo(
    () => (seedanceActive ? assembled.references.filter((slot) => precheckMap.get(slot.url)?.status === 'rejected') : []),
    [assembled.references, precheckMap, seedanceActive],
  );

  const canGenerate = !working && !validationError && !generationSourceError && referencesConfirmed
    && assembled.references.length > 0 && rejectedSlots.length === 0;
  const missingVoiceover = assembled.effectiveVoiceMode === 'voiceover' && !plan.voiceoverAudioUrl;
  const hasMixAudio = hasBackgroundMusic || Boolean(plan.customBgmUrl)
    || (assembled.effectiveVoiceMode === 'voiceover' && Boolean(plan.voiceoverAudioUrl));
  const statusHint = rejectedSlots.length > 0
    ? `有 ${rejectedSlots.length} 份素材未通过校验，请更换后再生成`
    : validationError || generationSourceError || (!referencesConfirmed ? '请先在右侧勾选确认素材' : '');

  return (
    <section ref={panelRef} className="sales-delivery-shell" aria-label="素材核对、视频生成与成片合成">
      <div className="sales-delivery-main">
        <div className="sales-delivery-stage-col">
          <SalesDeliveryPreview
            active={active}
            rawVideoUrl={plan.generatedVideoUrl}
            finalVideoUrl={plan.mixedVideoUrl}
            generating={busy === 'video'}
            mixing={busy === 'mix'}
            progressText={progressText}
            durationSec={durationSec}
            aspectRatio={aspectRatio}
          />
        </div>

        <div className="sales-delivery-inspector-col">
          <SalesReferenceReview
            assembled={assembled}
            beatBindings={beatBindings}
            confirmed={referencesConfirmed}
            disabled={working}
            seedanceActive={seedanceActive}
            precheckMap={precheckMap}
            active={active}
            onConfirm={(confirmed) => setConfirmedKey(confirmed ? referenceKey : '')}
            onEditMaterials={onEditMaterials}
            onEditStoryboard={onEditStoryboard}
          />

          <section className="sales-delivery-step sales-delivery-audio-card" aria-label="声音与字幕">
            <div className="sales-delivery-step-head">
              <strong>声音、配乐与字幕</strong>
              <span className="sales-delivery-stage-state">
                {isCleanVisual ? '纯画面展示' : '卖点介绍'} · {script.durationSec}s
              </span>
            </div>

            {assembled.effectiveVoiceMode !== 'none' && (
              <details
                className="sales-delivery-voice"
                open={assembled.effectiveVoiceMode === 'voiceover'}
                onToggle={(event) => {
                  if (!event.currentTarget.open) event.currentTarget.querySelector('audio')?.pause();
                }}
              >
                <summary className={salesFocusClass}>
                  <Mic size={14} aria-hidden />
                  {assembled.effectiveVoiceMode === 'voiceover' ? '画外旁白' : '口播台词试听'}
                  <span>{plan.voiceoverAudioUrl ? '已生成配音' : assembled.effectiveVoiceMode === 'voiceover' ? '需生成配音' : '可选'}</span>
                  <ChevronDown size={13} aria-hidden />
                </summary>
                <div className="sales-delivery-voice-body">
                  <label>
                    配音模型
                    <select
                      aria-label="语音合成模型"
                      disabled={working}
                      value={selectedVoice?.id || plan.voiceModel}
                      onChange={(e) => onPatchPlan({ voiceModel: e.target.value })}
                      className={salesFocusClass}
                    >
                      {!selectedVoice && <option value={plan.voiceModel}>{plan.voiceModel}（已保存的选择）</option>}
                      {voiceModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </label>
                  {assembled.narrationText && <p className="sales-card-hint">{assembled.narrationText}</p>}
                  <div className="sales-delivery-actions">
                    <button
                      type="button"
                      disabled={working || !assembled.narrationText.trim()}
                      onClick={onSynthesizeVoice}
                      className={salesGhostButtonClass}
                    >
                      {busy === 'tts' ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Mic size={13} aria-hidden />}
                      {plan.voiceoverAudioUrl ? '重新生成配音' : '生成配音'}
                    </button>
                    {plan.voiceoverAudioUrl && (
                      <StudioAudioPlayer
                        src={proxyMediaUrl(plan.voiceoverAudioUrl)}
                        label="配音试听"
                        compact
                        className="min-w-[180px] flex-1"
                      />
                    )}
                  </div>
                </div>
              </details>
            )}

            <div className="sales-delivery-music">
              <span><Music size={13} aria-hidden />背景音乐 <small>可选</small></span>
              {musicPicker}
            </div>

            {!isCleanVisual && assembled.subtitles.length > 0 && (
              <details className="sales-delivery-subtitles">
                <summary className={salesFocusClass}>
                  <Captions size={14} aria-hidden />字幕草稿
                  <span>{assembled.subtitles.length} 条</span>
                  <ChevronDown size={13} aria-hidden />
                </summary>
                <div className="sales-delivery-subtitles-body">
                  {assembled.subtitles.map((sub) => <p key={sub.index}><span>{sub.index + 1}</span>{sub.text}</p>)}
                  <p className="sales-card-hint">字幕单独导出为 SRT，尚未加入 MP4，可导入剪辑软件使用。</p>
                  {subtitleSrt && (
                    <a
                      href={`data:application/x-subrip;charset=utf-8,${encodeURIComponent('\uFEFF' + subtitleSrt)}`}
                      download="ecommerce-subtitles.srt"
                      className={salesGhostButtonClass}
                    >
                      <Download size={13} aria-hidden />下载字幕 SRT
                    </a>
                  )}
                </div>
              </details>
            )}

            {generationSourceError && (
              <p role="status" className="sales-delivery-notice">
                {generationSourceError}{' '}
                <button type="button" disabled={working} onClick={onEditStoryboard} className={`sales-link-btn ${salesFocusClass}`}>
                  返回分镜调整
                </button>
              </p>
            )}
            {plan.generatedVideoUrl && missingVoiceover && (
              <p className="sales-delivery-notice">请先生成当前台词的旁白配音，再合成成片。</p>
            )}
            {plan.generatedVideoUrl && !missingVoiceover && !hasMixAudio && (
              <p className="sales-card-hint">无需配乐可直接下载原视频；添加背景音乐后即可合成成片。</p>
            )}
          </section>
        </div>
      </div>

      <footer className="sales-actionbar" aria-label="生成成片底部操作栏">
        <div className="sales-actionbar-left" role="group" aria-label="生成视频">
          <SalesVideoSettings
            key={active ? 'active' : 'inactive'}
            plan={plan}
            script={script}
            videoModels={videoModels}
            references={assembled.references}
            disabled={working}
            isUp
            onPatchPlan={onPatchPlan}
          />
          <input
            ref={rawVideoInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) onUploadRawVideo(f);
            }}
          />
          <button type="button" disabled={working} onClick={() => rawVideoInputRef.current?.click()} className={salesGhostButtonClass}>
            <Upload size={13} aria-hidden />导入已有视频
          </button>
          {statusHint && <span role="status" className="sales-delivery-bottom-hint">{statusHint}</span>}
        </div>

        <div className="sales-actionbar-right" role="group" aria-label="配乐与导出">
          {busy === 'video' ? (
            <button type="button" onClick={onCancel} className={salesGhostButtonClass}>
              <Square size={12} aria-hidden />停止等待
            </button>
          ) : (
            <button
              type="button"
              disabled={!canGenerate}
              onClick={() => { if (canGenerate) onGenerateVideo(); }}
              className={plan.generatedVideoUrl ? salesGhostButtonClass : salesPrimaryButtonClass}
            >
              <Wand2 size={14} aria-hidden />{plan.generatedVideoUrl ? '重新生成视频' : '生成视频'}
            </button>
          )}
          <button
            type="button"
            disabled={working || !plan.generatedVideoUrl || missingVoiceover || !hasMixAudio}
            onClick={onMixFinal}
            className={salesPrimaryButtonClass}
          >
            {busy === 'mix' ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Film size={14} aria-hidden />}
            {busy === 'mix' ? '正在合成…' : plan.mixedVideoUrl ? '重新合成成片' : '合成成片'}
          </button>
          {plan.mixedVideoUrl && (
            <a
              href={proxyMediaUrl(plan.mixedVideoUrl, { asVideo: true })}
              download="ecommerce-final.mp4"
              className={salesGhostButtonClass}
            >
              <Download size={13} aria-hidden />下载成片
            </a>
          )}
        </div>
      </footer>
    </section>
  );
}
