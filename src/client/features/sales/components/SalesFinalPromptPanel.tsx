import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Captions, ChevronDown, Download, ListChecks, Loader2, Mic, Square, Upload, Wand2 } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { useSeedancePrecheck } from '@client/shared/api/generation/seedancePrecheck';
import MarkdownBody from '@client/shared/ui/markdown/MarkdownBody';
import { StudioAudioPlayer } from '@client/shared/ui/studio/StudioAudioPlayer';
import { isSeedance } from '@shared/domain/media/videoCapabilities';
import { grokPresetVoicesAllowed, selectedGrokVideoVoice } from '@shared/domain/media/grokVoices';
import { upstreamModalityModelId, type ModalityPickerSelection } from '@shared/domain/models/modalityStorage';
import type { AssembledSalesPrompt, BeatProductImageBinding, RankedAsset, SalesScriptDomain, SalesVoiceCandidate } from '@shared/domain/sales';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import { useSalesDepthReferences } from '../hooks/useSalesDepthReferences';
import { isProductFaceSource, productFaceReferences } from '../model/salesProductFaces';
import { salesSubtitlesSrt } from '../model/salesSubtitles';
import { salesFocusClass, salesGhostButtonClass, salesPrimaryButtonClass } from './salesChrome';
import { SalesScriptCopyButton } from './SalesScriptCopyButton';
import { SalesReferenceReview } from './SalesReferenceReview';
import { salesReferenceReviewKey } from '../model/salesReferenceReview';
import { SalesDeliveryReview } from './SalesDeliveryReview';
import { SalesDeliveryPreview } from './SalesDeliveryPreview';
import { resolveSalesVideoSettings } from '../model/salesVideoSettings';
import { SalesVideoDurationNotice } from './SalesVideoDurationNotice';
import { SalesVideoSettings } from './SalesVideoSettings';
import { SalesVoiceSettings } from './SalesVoiceSettings';
import '../salesDelivery.css';

interface Props {
  active?: boolean;
  notice?: ReactNode;
  script: SalesScriptDomain;
  beatBindings: readonly BeatProductImageBinding[];
  musicPicker?: ReactNode;
  backgroundMusicUrl?: string;
  onEditMaterials: () => void;
  onEditFaces?: (urls: string[]) => void;
  onEditStoryboard: () => void;
  onReadaptStoryboard?: () => void;
  assembled: AssembledSalesPrompt;
  plan: SalesProductionPlanState;
  videoModels: readonly ModalityPickerSelection[];
  voiceModels: readonly ModalityPickerSelection[];
  rankedVoices: readonly RankedAsset<SalesVoiceCandidate>[];
  selectedVoice: SalesVoiceCandidate | null;
  onOpenVoiceMaterials: () => void;
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
  active = true, notice, generationSourceError = '', assembled: sourceAssembled, plan, script, beatBindings, musicPicker, backgroundMusicUrl = '',
  onEditMaterials, onEditFaces, onEditStoryboard, onReadaptStoryboard, videoModels, voiceModels, rankedVoices, selectedVoice, onOpenVoiceMaterials, busy, progressText,
  onPatchPlan, onSynthesizeVoice, onGenerateVideo, onUploadRawVideo, onMixFinal, onCancel,
}: Props) {
  const depthReferences = useSalesDepthReferences({ active, assembled: sourceAssembled, plan, script });
  const faceSources = sourceAssembled.references.filter(isProductFaceSource);
  const assembled = useMemo(() => ({
    ...depthReferences.assembled,
    references: productFaceReferences(depthReferences.assembled.references, plan.productFaceEdits),
  }), [depthReferences.assembled, plan.productFaceEdits]);
  const pendingFaceSources = faceSources.filter((slot) => !Object.hasOwn(plan.productFaceEdits, slot.url));
  const needsFaceReview = pendingFaceSources.length > 0;
  const preparingReferences = depthReferences.preparing;
  const referencePreparationError = depthReferences.error;
  const [confirmedKey, setConfirmedKey] = useState('');
  const referenceKey = salesReferenceReviewKey(assembled, beatBindings, plan.scriptId);
  const referencesConfirmed = confirmedKey === referenceKey && !needsFaceReview;
  const rawVideoInputRef = useRef<HTMLInputElement>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!active) setReviewOpen(false);
    if (!active || reviewOpen) panelRef.current?.querySelectorAll<HTMLMediaElement>('video, audio').forEach((media) => media.pause());
  }, [active, reviewOpen]);

  const working = Boolean(busy);
  const videoTaskId = plan.pendingVideoTask?.channelTaskId || plan.pendingVideoTask?.taskId || (busy !== 'video' && plan.generatedVideoTaskId);
  const { validationError, durationError, aspectRatio, durationSec } = resolveSalesVideoSettings(plan, script, assembled.references, assembled.audios || []);
  const isCleanVisual = assembled.presentationMode === 'clean_visual';
  const subtitleSrt = useMemo(() => salesSubtitlesSrt(assembled.subtitles), [assembled.subtitles]);
  const activeVideoModel = plan.videoModel || 'wan3.0-video';
  const grokSpeech = assembled.effectiveVoiceMode === 'speech' && grokPresetVoicesAllowed(upstreamModalityModelId('video', activeVideoModel));
  const grokVoice = grokSpeech ? selectedGrokVideoVoice(plan.videoVoiceId) : undefined;
  const seedanceActive = isSeedance(upstreamModalityModelId('video', activeVideoModel));
  const selectedVoiceModel = voiceModels.find((model) => model.id === plan.voiceModel)
    || voiceModels.find((model) => model.modelId === plan.voiceModel);
  const precheckInputs = useMemo(
    () => assembled.references.filter((_, index) => {
      const source = sourceAssembled.references[index];
      return !isProductFaceSource(source) || Object.hasOwn(plan.productFaceEdits, source.url);
    }).map((slot) => ({ url: slot.url, mediaType: slot.mediaType || 'image' })),
    [assembled.references, plan.productFaceEdits, sourceAssembled.references],
  );
  const precheckMap = useSeedancePrecheck(precheckInputs, active && !preparingReferences && !referencePreparationError && seedanceActive && precheckInputs.length > 0, activeVideoModel);
  const rejectedSlots = useMemo(
    () => (seedanceActive ? assembled.references.filter((slot) => precheckMap.get(slot.url)?.status === 'rejected') : []),
    [assembled.references, precheckMap, seedanceActive],
  );

  const canGenerate = !working && !preparingReferences && !referencePreparationError && !validationError && !generationSourceError && !assembled.templateError && !assembled.voiceError && referencesConfirmed
    && assembled.references.length > 0 && rejectedSlots.length === 0;
  const missingVoiceover = assembled.effectiveVoiceMode === 'voiceover' && !plan.voiceoverAudioUrl;
  const hasMixAudio = Boolean(backgroundMusicUrl) || Boolean(plan.customBgmUrl)
    || (assembled.effectiveVoiceMode === 'voiceover' && Boolean(plan.voiceoverAudioUrl));
  const statusHint = preparingReferences ? '正在准备本次深度动作片段，完成后请核对素材'
    : referencePreparationError || (rejectedSlots.length > 0
    ? `有 ${rejectedSlots.length} 份素材未通过校验，请更换后再生成`
    : assembled.templateError || assembled.voiceError || validationError || generationSourceError || (needsFaceReview ? '等待商品图自动打码完成' : !referencesConfirmed ? '请先勾选确认使用素材' : ''));

  return (
    <section ref={panelRef} className="sales-delivery-shell" aria-label="素材核对、视频生成与成片合成">
      <div className="sales-delivery-main">
        <div className="sales-delivery-stage-col">
          <SalesDeliveryPreview
            importControl={<>
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
            </>}
            active={active && !reviewOpen}
            productImageUrl={assembled.references.find((slot) => slot.kind === 'product' && slot.mediaType !== 'video')?.url}
            rawVideoUrl={plan.generatedVideoUrl}
            finalVideoUrl={plan.mixedVideoUrl}
            generating={busy === 'video'}
            mixing={busy === 'mix'}
            progressText={progressText}
            durationSec={durationSec}
            aspectRatio={aspectRatio}
          />
        </div>

        <div className="sales-delivery-prompt">
          <details open className="sales-final-prompt-preview">
            <summary>提示词</summary>
            <div className="sales-prompt-reading">
              {assembled.templateError ? <p role="status">{assembled.templateError}</p> : <MarkdownBody content={assembled.enginePrompt} />}
            </div>
          </details>
          {!assembled.templateError && assembled.enginePrompt && <SalesScriptCopyButton text={assembled.enginePrompt} label="复制全文" />}
        </div>

        <div className="sales-delivery-dock">
          {(preparingReferences || referencePreparationError) ? (
            <section className="sales-delivery-step" aria-label="使用素材">
              <div className="sales-delivery-step-head"><strong>使用素材</strong>
                <span className="sales-delivery-stage-state">{preparingReferences ? '准备中' : '待处理'}</span>
              </div>
              <p role="status" className={referencePreparationError ? 'sales-material-issue' : 'sales-card-hint'}>
                {preparingReferences ? '正在按本次分镜准备深度动作片段，完成后即可核对素材。' : referencePreparationError}
              </p>
              {referencePreparationError && <div className="sales-delivery-actions">
                <button type="button" disabled={working} onClick={onEditMaterials} className={salesGhostButtonClass}>调整引用素材</button>
                {depthReferences.canRetry && <button type="button" disabled={working} onClick={depthReferences.retry} className={salesGhostButtonClass}>重试动作片段准备</button>}
              </div>}
            </section>
          ) : <SalesReferenceReview
            assembled={assembled}
            confirmed={referencesConfirmed}
            disabled={working}
            facesPending={needsFaceReview}
            seedanceActive={seedanceActive}
            precheckMap={precheckMap}
            active={active}
            onConfirm={(confirmed) => setConfirmedKey(confirmed ? referenceKey : '')}
            onEditFaces={onEditFaces && faceSources.length ? () => onEditFaces(faceSources.map((slot) => slot.url)) : undefined}
            onEditMaterials={onEditMaterials}
            onEditStoryboard={onEditStoryboard}
          />}
          <div className="sales-delivery-tools" aria-label="成片设置">
            <div className="sales-delivery-task-id"><strong>本次异步任务 ID</strong>
              <code>{videoTaskId || (busy === 'video' ? '等待任务回执…' : '暂无任务编号')}</code>
            </div>
            <section className="sales-delivery-step" aria-label="生成模型与参数">
              <SalesVideoSettings plan={plan} script={script} videoModels={videoModels}
                references={assembled.references} audios={assembled.audios || []}
                disabled={working || preparingReferences} onPatchPlan={onPatchPlan} />
              {notice}
              {durationError && validationError === durationError && (
                <SalesVideoDurationNotice
                  error={durationError}
                  plan={plan}
                  script={script}
                  references={assembled.references}
                  audios={assembled.audios || []}
                  videoModels={videoModels}
                  disabled={working}
                  onPatchPlan={onPatchPlan}
                  onEditStoryboard={onEditStoryboard}
                />
              )}
            </section>
            <section className="sales-delivery-step sales-delivery-audio-card" aria-label="配乐与声音">
              <div className="sales-delivery-step-head"><strong>最终 BGM</strong><span className="sales-delivery-stage-state">可选</span></div>
              {musicPicker}

              {assembled.effectiveVoiceMode !== 'none' && (
                <details
                  className="sales-delivery-voice"
                  onToggle={(event) => {
                    if (!event.currentTarget.open) event.currentTarget.querySelector('audio')?.pause();
                  }}
                >
                  <summary className={salesFocusClass}>
                    <Mic size={14} aria-hidden />
                    {assembled.effectiveVoiceMode === 'voiceover' ? '画外旁白' : '真人口播'} · {grokSpeech ? grokVoice?.name || '请选择预置音色' : selectedVoice?.name || '请选择人声'}
                    <span>{grokSpeech ? grokVoice ? 'Grok 官方预置音色' : '需选择预置音色' : !selectedVoice ? '需选择人声' : assembled.effectiveVoiceMode === 'speech' && selectedVoice.sampleAudioUrl.trim() ? '已绑定声音样本' : plan.voiceoverAudioUrl ? '已生成音频' : assembled.effectiveVoiceMode === 'speech' ? '需生成音色参考' : '需生成配音'}</span>
                    <ChevronDown size={13} aria-hidden />
                  </summary>
                  <div className="sales-delivery-voice-body">
                    <SalesVoiceSettings effectiveVoiceMode={assembled.effectiveVoiceMode} rankedVoices={rankedVoices} selectedVoice={selectedVoice} voiceId={plan.voiceId} videoModel={plan.videoModel} videoVoiceId={plan.videoVoiceId}
                      disabled={working} onEditPresentation={onEditStoryboard} onOpenMaterials={onOpenVoiceMaterials} onPatchPlan={onPatchPlan} />
                    {!grokSpeech && (assembled.effectiveVoiceMode === 'voiceover' || !selectedVoice?.sampleAudioUrl.trim()) && <>
                    <label>
                      配音模型
                      <select
                        aria-label="语音合成模型"
                        disabled={working}
                        value={selectedVoiceModel?.id || plan.voiceModel}
                        onChange={(e) => onPatchPlan({ voiceModel: e.target.value })}
                        className={salesFocusClass}
                      >
                        {!selectedVoiceModel && <option value={plan.voiceModel}>{plan.voiceModel}（已保存的选择）</option>}
                        {voiceModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </label>
                    {assembled.narrationText && <p className="sales-card-hint">{assembled.narrationText}</p>}
                    {assembled.effectiveVoiceMode === 'speech' && <p className="sales-card-hint">使用固定试听句生成音色参考，修改台词后可继续复用。完整口播仍按分镜台词生成。</p>}
                    {selectedVoice && !selectedVoice.ttsVoice.trim() && !selectedVoice.voiceId.trim() && <p className="sales-card-hint">所选人声没有合成音色标识，请先在声音库配置。</p>}
                    <div className="sales-delivery-actions">
                      <button
                        type="button"
                        disabled={working || !selectedVoice || !(selectedVoice.ttsVoice.trim() || selectedVoice.voiceId.trim()) || (assembled.effectiveVoiceMode === 'voiceover' && !assembled.narrationText.trim())}
                        onClick={onSynthesizeVoice}
                        className={salesGhostButtonClass}
                      >
                        {busy === 'tts' ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Mic size={13} aria-hidden />}
                        {assembled.effectiveVoiceMode === 'speech' ? plan.voiceoverAudioUrl ? '重新生成音色参考' : '生成音色参考' : plan.voiceoverAudioUrl ? '重新生成配音' : '生成配音'}
                      </button>
                      {plan.voiceoverAudioUrl && (
                        <StudioAudioPlayer
                          src={proxyMediaUrl(plan.voiceoverAudioUrl, { asAudio: true })}
                          label={assembled.effectiveVoiceMode === 'speech' ? '合成参考音频试听' : '配音试听'}
                          compact
                          className="min-w-[180px] flex-1"
                        />
                      )}
                    </div>
                    </>}
                  </div>
                </details>
              )}

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

            </section>
          </div>
          <footer className="sales-delivery-controls" aria-label="成片操作">
            {statusHint && <p role="status" className="sales-card-hint">{busy === 'adapt' ? progressText : statusHint}</p>}
            {generationSourceError && <>
              {onReadaptStoryboard && <button type="button" disabled={working} onClick={onReadaptStoryboard} className={`sales-link-btn ${salesFocusClass}`}>按当前设置重新改写分镜</button>}
              <button type="button" disabled={working} onClick={onEditStoryboard} className={`sales-link-btn ${salesFocusClass}`}>返回分镜调整</button>
            </>}
            <div>
              {working && busy !== 'loading' ? (
                <button type="button" onClick={onCancel} className={salesGhostButtonClass}>
                  <Square size={12} aria-hidden />停止等待
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!canGenerate}
                  title={statusHint || undefined}
                  onClick={() => { if (canGenerate) onGenerateVideo(); }}
                  className={salesPrimaryButtonClass}
                >
                  <Wand2 size={14} aria-hidden />{plan.generatedVideoUrl ? '重新生成视频' : '生成视频'}
                </button>
              )}
              <button type="button" disabled={working || !(plan.generatedVideoUrl || plan.mixedVideoUrl)}
                title={plan.generatedVideoUrl || plan.mixedVideoUrl ? undefined : '生成或导入视频后可核查'}
                onClick={() => setReviewOpen(true)} className={salesGhostButtonClass}>
                <ListChecks size={14} aria-hidden />音频视频核查
              </button>
            </div>
          </footer>
        </div>
      </div>
      {active && reviewOpen && (plan.generatedVideoUrl || plan.mixedVideoUrl) && (
        <SalesDeliveryReview key={plan.mixedVideoUrl || plan.generatedVideoUrl}
          videoUrl={plan.mixedVideoUrl || plan.generatedVideoUrl} final={Boolean(plan.mixedVideoUrl)}
          canMix={!working && Boolean(plan.generatedVideoUrl) && !missingVoiceover && hasMixAudio}
          onMix={onMixFinal} onClose={() => setReviewOpen(false)} />
      )}
    </section>
  );
}
