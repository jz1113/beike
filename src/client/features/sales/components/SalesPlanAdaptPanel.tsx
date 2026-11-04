import type { ReactNode } from 'react';
import { ArrowRight, ChevronDown, Loader2, RefreshCw, Square, X } from 'lucide-react';
import type { ProductFaceEdits } from '../model/salesProductFaces';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import {
  SALES_IMAGE_VIEW_LABELS, type BeatProductImageBinding, type SalesActionCandidate, type SalesAdaptedBeat,
  type SalesBeatVoiceMode, type SalesImageRef, type SalesPresentationMode, type SalesScriptBeat, type SalesScriptDomain,
} from '@shared/domain/sales';
import { useSalesTextModels } from '../hooks/useSalesTextModels';
import { actionMedia } from '../model/salesActionMedia';
import { extractActionAngleEntries } from '../model/salesActionViews';
import { salesBeatSpeechStats } from '../model/salesBeatSpeech';
import { compareSalesAssetNames } from '../model/salesAssetNames';
import { formatScriptSeconds } from '../model/salesScriptEditor';
import { SalesStoryboardPopover } from './SalesStoryboardPopover';
import { SalesStoryboardTextEditor } from './SalesStoryboardTextEditor';
import { salesFocusClass, salesGhostButtonClass, salesInputClass, salesPrimaryButtonClass } from './salesChrome';
import '../salesPlanChoices.css';

interface Props {
  script: SalesScriptDomain;
  preferredModel: string;
  onModelChange: (model: string) => void;
  productFaceEdits?: ProductFaceEdits;
  selectedImages: readonly SalesImageRef[];
  beatBindings: readonly BeatProductImageBinding[];
  adaptedBeats: readonly SalesAdaptedBeat[];
  productSpokenCopy?: string;
  productSpokenCopyStale?: boolean;
  effectiveVoiceMode: SalesBeatVoiceMode;
  presentationMode?: SalesPresentationMode;
  hasSceneReplacement?: boolean;
  spokenCharCount: number;
  estimatedSpeakSec: number;
  deliveryStep?: 'storyboard' | 'script' | null;
  adapting: boolean;
  disabled: boolean;
  actions?: readonly SalesActionCandidate[];
  beatActionIds?: Record<number, string>;
  onBindBeatAction?: (beatIndex: number, action: SalesActionCandidate | null) => void;
  onRunAdapt: (model: string) => void;
  onCancel: () => void;
  onChangeBeatImage: (beatIndex: number, imageUrl: string) => void;
  onChangeAdaptedBeat: (beatIndex: number, patch: Partial<SalesAdaptedBeat>) => void;
  settings?: ReactNode;
  onNextStep?: () => void;
}

function SourceSpeechReference({ beat, showSubtitle = false }: { beat: SalesScriptBeat; showSubtitle?: boolean }) {
  return <div className="sales-sb-source-copy" aria-label="原片声音参考">
    <p><strong>原片台词参考：</strong>{beat.voice.text.trim() || '未记录，可在脚本库补录'}</p>
    {beat.voice.uncertain && <p>原片台词待核对</p>}
    {beat.voice.linePattern.trim() && <p><strong>话术结构：</strong>{beat.voice.linePattern}</p>}
    {showSubtitle && beat.subtitle.trim() && <p><strong>原片字幕参考：</strong>{beat.subtitle}</p>}
  </div>;
}

export function SalesPlanAdaptPanel({
  script, preferredModel, onModelChange, selectedImages, productFaceEdits, beatBindings, adaptedBeats, productSpokenCopy = '', productSpokenCopyStale = false,
  effectiveVoiceMode, presentationMode = 'subtitled_intro', hasSceneReplacement = false, spokenCharCount, estimatedSpeakSec,
  deliveryStep, adapting, disabled, actions = [], beatActionIds, onBindBeatAction,
  onRunAdapt, onCancel, onChangeBeatImage, onChangeAdaptedBeat, settings, onNextStep,
}: Props) {
  const { options, model } = useSalesTextModels(preferredModel);
  const adaptedMap = new Map(adaptedBeats.map((beat) => [beat.index, beat]));
  const beats = script.shots.flatMap((shot) => shot.beats);
  const timelineEnd = Math.max(0, ...beats.map((beat) => beat.end));
  const showCopyCols = presentationMode === 'subtitled_intro';
  const hasSpeech = showCopyCols && effectiveVoiceMode !== 'none';
  const currentSpokenCopy = hasSpeech ? beats.map((_, index) => adaptedMap.get(index)?.spokenLine.trim() || '').filter(Boolean).join(' ') : '';
  const referenceNote = productSpokenCopyStale ? '商品资料已更新，请先核对或重新提炼参考稿；下方台词也需按当前资料核对。'
    : hasSpeech ? '参考稿用于选取内容；成片以本次逐镜台词为准，不会直接使用整段参考稿。'
      : '当前为无口播模式；切换声音模式后可按分镜改写台词。';
  const locked = disabled || adapting || Boolean(deliveryStep);
  const nextProgress = deliveryStep === 'script' ? '2/2 准备成片脚本…'
    : deliveryStep === 'storyboard' ? (adapting ? '1/2 改写分镜中…' : '1/2 核对分镜…') : '';

  return (
    <div className="sales-sb-workbench">
    <section className="sales-plan-table-shell" aria-label="分镜制作选项">
      {!model && <p className="sales-plan-banner">请在制作设置中配置改写模型，或直接编辑分镜内容。</p>}
      {script.durationSec - timelineEnd > 0.1 && (
        <p className="sales-plan-banner">分镜内容至 {formatScriptSeconds(timelineEnd)}，与脚本总长相差 {formatScriptSeconds(script.durationSec - timelineEnd)}；成片按 {formatScriptSeconds(script.durationSec)} 生成。</p>
      )}
      {hasSpeech && <p className="sales-plan-banner">自动改写会按当前画面选取 1—3 个商品重点，写成连贯口语；同一镜头内自然承接，短段可留白，字幕只提炼关键词。手动修改动作后请重新核对对应台词。{effectiveVoiceMode === 'voiceover' && '画外旁白按整段合成，实际与画面的对齐及结尾是否完整请试听确认。'}</p>}
      {(currentSpokenCopy || productSpokenCopy.trim()) && (
        <div className="sales-sb-copy-reference" aria-label="本次台词与商品参考稿">
          {currentSpokenCopy && <>
            <strong>{effectiveVoiceMode === 'voiceover' ? '当前逐镜旁白' : '当前逐镜口播'}</strong>
            <p>{currentSpokenCopy}</p>
            <span>按下方分镜顺序拼接，编辑台词后同步更新；生成前仍需通过口播校验。</span>
          </>}
          {productSpokenCopy.trim() && (currentSpokenCopy ? <details>
            <summary>商品口播参考稿{productSpokenCopyStale ? '（资料已更新，待核对）' : ''}</summary>
            <p>{productSpokenCopy}</p><span>{referenceNote}</span>
          </details> : <>
            <strong>商品口播参考稿</strong><p>{productSpokenCopy}</p><span>{referenceNote}</span>
            {hasSpeech && <p>尚未填写本次逐镜台词。点击“下一步：准备成片脚本”时自动按画面和时长改写口语台词，也可直接编辑下方台词。</p>}
          </>)}
        </div>
      )}

      <div className="sales-sb-table-scroll">
        <table className="sales-sb-table" aria-label="分镜脚本表格">
          <thead>
            <tr>
              <th className="col-num">#</th>
              <th className="col-img">商品图</th>
              <th className="col-time">时间 · 镜头</th>
              <th className="col-action">画面动作</th>
              {hasSpeech && <th className="col-speech">{effectiveVoiceMode === 'speech' ? '口播台词' : '旁白台词'}</th>}
              {showCopyCols && <th className="col-sub">字幕</th>}
              <th className="col-pose">姿态</th>
              <th className="col-more">细节</th>
              {!showCopyCols && <th className="col-reference">原片参考</th>}
            </tr>
          </thead>
          <tbody>
            {beats.map((beat, index) => {
              const binding = beatBindings[index];
              const adapted = adaptedMap.get(index);
              const title = `片段 ${index + 1}`;
              const adaptedAction = adapted?.action?.trim();
              const action = (adaptedAction || beat.actionTemplate || beat.action).replace(/\{\{\s*([^{}]+?)\s*\}\}/g, '$1');
              const subject = beat.subject.replace(/\{\{\s*([^{}]+?)\s*\}\}/g, '$1');
              const subjectFallback = adaptedAction ? '' : subject;
              const subjectCleared = adapted?.manualPerformanceFields?.includes('subject') && !adapted.subject?.trim();
              const expressionFallback = !adaptedAction ? beat.expression : '';
              const transitionFallback = !adaptedAction && !hasSceneReplacement ? beat.transition : '';
              const viewLabel = binding && binding.requiredView !== 'any' ? SALES_IMAGE_VIEW_LABELS[binding.requiredView] : '';
              const missingRequiredView = Boolean(viewLabel && !binding?.exactViewMatch);
              const boundActionId = beatActionIds?.[index] || '';
              const boundAction = boundActionId ? actions.find((item) => item.id === boundActionId) || null : null;
              const boundActionMedia = boundAction ? actionMedia(boundAction) : null;
              const angleEntries = boundAction ? extractActionAngleEntries(boundAction) : [];
              const { spokenChars, speechRate, tooFast } = salesBeatSpeechStats(adapted?.spokenLine ?? '', beat.end - beat.start);
              const hasExtra = Boolean((subjectCleared ? '' : adapted?.subject?.trim() || subjectFallback).trim()
                || (adapted?.expression ?? expressionFallback).trim() || (adapted?.transition ?? transitionFallback).trim());

              return (
                <tr key={index} id={`sales-plan-beat-${index}`} aria-label={title}>
                  <td className="col-num">{String(index + 1).padStart(2, '0')}</td>
                  <td className="col-img">
                    <SalesStoryboardPopover label={`${title}：点击切换商品参考图`} disabled={locked}
                      triggerClassName={`sales-sb-img-trigger ${salesFocusClass}`}
                      trigger={binding?.image ? (
                          <img src={proxyMediaUrl(productFaceEdits?.[binding.image.url]?.url || binding.image.url, { thumb: true, width: 120 })} alt={`${title} 商品图 #${binding.image.index + 1}`} />
                        ) : <span className="sales-sb-img-empty">选图</span>}>
                      {() => (
                      <div className="sales-sb-popover-card">
                        {selectedImages.length > 0 && (
                          <div className="sales-sb-thumb-grid">
                            {selectedImages.map((img) => (
                              <button key={img.url} type="button" disabled={locked} aria-pressed={binding?.image?.url === img.url}
                                onClick={() => onChangeBeatImage(index, img.url)} title={`#${img.index + 1} ${img.view ? SALES_IMAGE_VIEW_LABELS[img.view] : '主参考'}`}
                                className={`sales-sb-thumb-pick ${salesFocusClass}`}>
                                <img src={proxyMediaUrl(productFaceEdits?.[img.url]?.url || img.url, { thumb: true, width: 96 })} alt="" />
                              </button>
                            ))}
                          </div>
                        )}
                        <select aria-label={`${title} 绑定商品图`} disabled={locked || selectedImages.length === 0}
                          value={binding?.image?.url || ''} onChange={(e) => onChangeBeatImage(index, e.target.value)}
                          className={`${salesInputClass} h-7 text-[11px]`}>
                          {!binding?.image && <option value="">{selectedImages.length === 0 ? '请先在左侧选择商品图' : '选择商品图'}</option>}
                          {selectedImages.map((img) => (
                            <option key={img.url} value={img.url}>#{img.index + 1} {img.view ? SALES_IMAGE_VIEW_LABELS[img.view] : '主参考'}</option>
                          ))}
                        </select>
                      </div>
                      )}
                    </SalesStoryboardPopover>
                  </td>

                  <td className="col-time">
                    <strong className="sales-sb-time-range">{formatScriptSeconds(beat.start)}–{formatScriptSeconds(beat.end)}</strong>
                    <span className="sales-sb-camera-meta">{[beat.shotSize, beat.camera].filter(Boolean).join(' · ') || beat.purpose || formatScriptSeconds(beat.end - beat.start)}</span>
                    {missingRequiredView && <span className="sales-sb-warn-tag">缺{viewLabel}图</span>}
                  </td>

                  <td className="col-action">
                    <SalesStoryboardTextEditor disabled={locked} value={adapted?.action} fallback={action}
                      placeholder="描述本段画面与人物动作，留空沿用脚本"
                      onChange={(action) => onChangeAdaptedBeat(index, { action })}
                      label={`${title} 画面动作`} />
                    {!hasSpeech && <SourceSpeechReference beat={beat} showSubtitle={!showCopyCols} />}
                  </td>

                  {hasSpeech && (
                    <td className="col-speech">
                      <SalesStoryboardTextEditor disabled={locked} value={adapted?.spokenLine}
                        placeholder={beat.voice.linePattern ? `填写自然口语 · 参考结构：${beat.voice.linePattern}` : '填写自然口语，短段可留白'}
                        onChange={(spokenLine) => onChangeAdaptedBeat(index, { spokenLine })}
                        label={`${title} 台词`} />
                      <span className={`sales-sb-rate-hint ${tooFast ? 'is-fast' : ''}`}>
                        {spokenChars > 0 ? `${spokenChars} 字 · ${speechRate} 字/秒${tooFast ? ' · 偏快' : ''}` : '0 字'}
                      </span>
                      <SourceSpeechReference beat={beat} />
                    </td>
                  )}

                  {showCopyCols && (
                    <td className="col-sub">
                      <SalesStoryboardTextEditor disabled={locked} value={adapted?.subtitle}
                        placeholder="提炼本段台词关键词"
                        onChange={(subtitle) => onChangeAdaptedBeat(index, { subtitle })}
                        label={`${title} 字幕`} />
                      {beat.subtitle.trim() && <p className="sales-sb-source-copy"><strong>原片字幕参考：</strong>{beat.subtitle}</p>}
                    </td>
                  )}

                  <td className="col-pose">
                    <SalesStoryboardPopover label={`${title}：点击设置姿态参考`} disabled={locked || !onBindBeatAction} align="right"
                      triggerClassName={`sales-sb-pose-trigger ${boundAction ? 'has-pose' : ''} ${salesFocusClass}`}
                      trigger={boundAction && boundActionMedia?.url ? (
                          boundActionMedia.video
                            ? <video muted playsInline preload="metadata" src={proxyMediaUrl(boundActionMedia.url, { asVideo: true })} />
                            : <img src={proxyMediaUrl(boundActionMedia.url, { thumb: true, width: 100 })} alt={boundAction.title} />
                        ) : <span>沿用<br />脚本</span>}>
                      {() => onBindBeatAction && (
                        <div className="sales-sb-popover-card is-pose">
                          <div className="sales-sb-popover-head">
                            <strong>姿态参考</strong>
                            <div className="flex items-center gap-1.5">
                              {boundAction && (
                                <button type="button" disabled={locked} aria-label={`移除 ${title} 姿态参考`}
                                  onClick={() => onBindBeatAction(index, null)} className={`sales-link-btn ${salesFocusClass}`}>
                                  <X size={11} aria-hidden />清除
                                </button>
                              )}
                            </div>
                          </div>
                          {angleEntries.length > 1 && (
                            <div className="sales-sb-angle-strip" aria-label={`${title} 多机位姿态预览`}>
                              {angleEntries.map((angle) => (
                                <figure key={angle.angle} className="sales-sb-angle-item">
                                  <img src={proxyMediaUrl(angle.url, { thumb: true, width: 88 })} alt={angle.label} />
                                  <figcaption>{angle.label}</figcaption>
                                </figure>
                              ))}
                            </div>
                          )}
                          <select aria-label={`${title} 动作姿态参考`} disabled={locked || actions.length === 0}
                            value={boundAction?.id || ''}
                            onChange={(e) => onBindBeatAction(index, actions.find((item) => item.id === e.target.value) || null)}
                            className={`${salesInputClass} h-7 text-[11px]`}>
                            <option value="">{actions.length === 0 ? '在素材库添加动作素材后可选' : '默认（沿用脚本运镜）'}</option>
                            {[...actions].sort((a, b) => compareSalesAssetNames(a.title, b.title)).map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                          </select>
                        </div>
                      )}
                    </SalesStoryboardPopover>
                  </td>

                  <td className="col-more">
                    <SalesStoryboardPopover label={`${title} 编辑主体、表情与衔接`} disabled={locked} align="right"
                      triggerClassName={`sales-sb-more-btn ${hasExtra ? 'has-extra' : ''} ${salesFocusClass}`}
                      trigger={<ChevronDown size={14} aria-hidden />}>
                      <div className="sales-sb-popover-card is-more">
                        <div className="sales-sb-popover-head"><strong>{title} · 画面细节</strong></div>
                        <p className="sales-sb-detail-note">可直接精修分镜；表情与衔接留空表示不额外指定。</p>
                        <label className="sales-beat-field-label">画面主体
                          <SalesStoryboardTextEditor disabled={locked} value={adapted?.subject} fallback={subjectFallback}
                            emptyUsesFallback={!subjectCleared}
                            placeholder="使用当前商品与人物" onChange={(subject) => onChangeAdaptedBeat(index, { subject })}
                            label={`${title} 画面主体`} className="sales-sb-detail-input" />
                        </label>
                        <label className="sales-beat-field-label">眼神表情
                          <SalesStoryboardTextEditor disabled={locked} value={adapted?.expression} fallback={expressionFallback} emptyUsesFallback={false}
                            placeholder="视线、微表情变化时点" onChange={(expression) => onChangeAdaptedBeat(index, { expression })}
                            label={`${title} 眼神表情`} className="sales-sb-detail-input" />
                        </label>
                        <label className="sales-beat-field-label">段落衔接
                          <SalesStoryboardTextEditor disabled={locked} value={adapted?.transition} fallback={transitionFallback} emptyUsesFallback={false}
                            placeholder="末姿势与下一镜衔接" onChange={(transition) => onChangeAdaptedBeat(index, { transition })}
                            label={`${title} 段落衔接`} className="sales-sb-detail-input" />
                        </label>
                      </div>
                    </SalesStoryboardPopover>
                  </td>
                  {!showCopyCols && <td className="col-reference"><SourceSpeechReference beat={beat} showSubtitle /></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="sales-sb-tfoot-bar">
          <span>
            <strong>{beats.length}</strong> 段 · 总长 <strong>{formatScriptSeconds(script.durationSec)}</strong>
            {hasSpeech && <> · {effectiveVoiceMode === 'voiceover' ? '旁白' : '口播'} <strong>{spokenCharCount}</strong> 字，约 <strong>{estimatedSpeakSec}</strong> 秒</>}
          </span>
          <span className="sales-sb-tfoot-tip">{hasSpeech ? '动作沿用深度视频与动作提示词 · 台词连贯表达，字幕提炼关键词' : '动作沿用深度视频与动作提示词 · 点击文字可手动编辑'}</span>
        </div>
      </div>

    </section>
    <aside className="sales-sb-settings" aria-label="分镜制作设置">
      <h2>制作设置</h2>
        {settings}
        <div className="sales-sb-bottom-actions">
          <h3 className="sales-sb-group-title">分镜改写</h3>
          <div className="sales-sb-adapt-model" role="group" aria-label="改写模型选择">
            <span className="sales-sb-field-label">改写模型</span>
            <ConfiguredModelPicker ariaLabel="分镜改写模型" value={model} options={options} onChange={onModelChange}
              disabled={locked} isUp className="sales-sb-model-picker" />
          </div>
          {adapting ? (
            <button type="button" onClick={onCancel} className={salesGhostButtonClass}><Square size={12} aria-hidden />停止改写</button>
          ) : (adaptedBeats.length > 0 || !onNextStep) && (
            <button type="button" disabled={locked || !model} onClick={() => onRunAdapt(model)} className={salesGhostButtonClass}
              title={hasSpeech ? '按当前画面选取 1—3 个商品重点，写连贯口语；短段可承接或留白，字幕提炼关键词。' : '结合当前商品改写画面分镜。'}>
              <RefreshCw size={13} aria-hidden />{adaptedBeats.length > 0 ? '按商品重新改写' : '按商品自动改写'}
            </button>
          )}
          {onNextStep && (
            <button type="button" disabled={locked} onClick={onNextStep} aria-busy={Boolean(nextProgress)} className={salesPrimaryButtonClass}
              title={model ? '自动按当前商品改写分镜，完成后进入成片；已改写且资料未变时保留当前稿。' : '进入成片，使用当前手动编辑的分镜。'}>
              {nextProgress ? <><Loader2 size={14} className="animate-spin" aria-hidden />{nextProgress}</>
                : <>下一步：准备成片脚本<ArrowRight size={14} aria-hidden /></>}
            </button>
          )}
        </div>
    </aside>
    </div>
  );
}
