import type { ReactNode } from 'react';
import { ArrowRight, ChevronDown, Compass, RefreshCw, Square, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import { ConfiguredModelPicker } from '@client/shared/models/ConfiguredModelPicker';
import {
  SALES_IMAGE_VIEW_LABELS, type BeatProductImageBinding, type SalesActionCandidate, type SalesAdaptedBeat,
  type SalesBeatVoiceMode, type SalesImageRef, type SalesPresentationMode, type SalesScriptDomain,
} from '@shared/domain/sales';
import { useSalesSummaryModels } from '../hooks/useSalesSummaryModels';
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
  selectedImages: readonly SalesImageRef[];
  beatBindings: readonly BeatProductImageBinding[];
  adaptedBeats: readonly SalesAdaptedBeat[];
  effectiveVoiceMode: SalesBeatVoiceMode;
  presentationMode?: SalesPresentationMode;
  hasSceneReplacement?: boolean;
  spokenCharCount: number;
  estimatedSpeakSec: number;
  adapting: boolean;
  disabled: boolean;
  actions?: readonly SalesActionCandidate[];
  beatActionIds?: Record<number, string>;
  onBindBeatAction?: (beatIndex: number, action: SalesActionCandidate | null) => void;
  onOpenActionAtlas?: () => void;
  onRunAdapt: (model: string) => void;
  onCancel: () => void;
  onChangeBeatImage: (beatIndex: number, imageUrl: string) => void;
  onChangeAdaptedBeat: (beatIndex: number, patch: Partial<SalesAdaptedBeat>) => void;
  bottomLeft?: ReactNode;
  onNextStep?: () => void;
}

export function SalesPlanAdaptPanel({
  script, preferredModel, onModelChange, selectedImages, beatBindings, adaptedBeats,
  effectiveVoiceMode, presentationMode = 'subtitled_intro', hasSceneReplacement = false, spokenCharCount, estimatedSpeakSec,
  adapting, disabled, actions = [], beatActionIds, onBindBeatAction, onOpenActionAtlas,
  onRunAdapt, onCancel, onChangeBeatImage, onChangeAdaptedBeat, bottomLeft, onNextStep,
}: Props) {
  const { options, model } = useSalesSummaryModels(preferredModel);
  const adaptedMap = new Map(adaptedBeats.map((beat) => [beat.index, beat]));
  const beats = script.shots.flatMap((shot) => shot.beats);
  const timelineEnd = Math.max(0, ...beats.map((beat) => beat.end));
  const showCopyCols = presentationMode === 'subtitled_intro';
  const hasSpeech = showCopyCols && effectiveVoiceMode !== 'none';
  const locked = disabled || adapting;
  const colCount = 6 + (hasSpeech ? 1 : 0) + (showCopyCols ? 1 : 0);

  return (
    <section className="sales-plan-table-shell" aria-label="分镜制作选项">
      {!model && <p className="sales-plan-banner">请在底部配置改写模型，或直接编辑分镜内容。</p>}
      {script.durationSec - timelineEnd > 0.1 && (
        <p className="sales-plan-banner">分镜内容至 {formatScriptSeconds(timelineEnd)}，与脚本总长相差 {formatScriptSeconds(script.durationSec - timelineEnd)}；成片按 {formatScriptSeconds(script.durationSec)} 生成。</p>
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
              const expressionFallback = !adaptedAction ? beat.expression : '';
              const transitionFallback = !adaptedAction && !hasSceneReplacement ? beat.transition : '';
              const viewLabel = binding && binding.requiredView !== 'any' ? SALES_IMAGE_VIEW_LABELS[binding.requiredView] : '';
              const missingRequiredView = Boolean(viewLabel && !binding?.exactViewMatch);
              const boundActionId = beatActionIds?.[index] || '';
              const boundAction = boundActionId ? actions.find((item) => item.id === boundActionId) || null : null;
              const boundActionMedia = boundAction ? actionMedia(boundAction) : null;
              const angleEntries = boundAction ? extractActionAngleEntries(boundAction) : [];
              const { spokenChars, speechRate, tooFast } = salesBeatSpeechStats(adapted?.spokenLine ?? '', beat.end - beat.start);
              const hasExtra = Boolean((adapted?.subject?.trim() || subjectFallback).trim()
                || (adapted?.expression ?? expressionFallback).trim() || (adapted?.transition ?? transitionFallback).trim());

              return (
                <tr key={index} id={`sales-plan-beat-${index}`} aria-label={title}>
                  <td className="col-num">{String(index + 1).padStart(2, '0')}</td>
                  <td className="col-img">
                    <SalesStoryboardPopover label={`${title}：点击切换商品参考图`} disabled={locked}
                      triggerClassName={`sales-sb-img-trigger ${salesFocusClass}`}
                      trigger={binding?.image ? (
                          <img src={proxyMediaUrl(binding.image.url, { thumb: true, width: 120 })} alt={`${title} 商品图 #${binding.image.index + 1}`} />
                        ) : <span className="sales-sb-img-empty">选图</span>}>
                      <div className="sales-sb-popover-card">
                        {selectedImages.length > 0 && (
                          <div className="sales-sb-thumb-grid">
                            {selectedImages.map((img) => (
                              <button key={img.url} type="button" disabled={locked} aria-pressed={binding?.image?.url === img.url}
                                onClick={() => onChangeBeatImage(index, img.url)} title={`#${img.index + 1} ${img.view ? SALES_IMAGE_VIEW_LABELS[img.view] : '主参考'}`}
                                className={`sales-sb-thumb-pick ${salesFocusClass}`}>
                                <img src={proxyMediaUrl(img.url, { thumb: true, width: 96 })} alt="" />
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
                  </td>

                  {hasSpeech && (
                    <td className="col-speech">
                      <SalesStoryboardTextEditor disabled={locked} value={adapted?.spokenLine}
                        placeholder={beat.voice.linePattern || '填写本段台词'}
                        onChange={(spokenLine) => onChangeAdaptedBeat(index, { spokenLine })}
                        label={`${title} 台词`} />
                      <span className={`sales-sb-rate-hint ${tooFast ? 'is-fast' : ''}`}>
                        {spokenChars > 0 ? `${spokenChars} 字 · ${speechRate} 字/秒${tooFast ? ' · 偏快' : ''}` : '0 字'}
                      </span>
                    </td>
                  )}

                  {showCopyCols && (
                    <td className="col-sub">
                      <SalesStoryboardTextEditor disabled={locked} value={adapted?.subtitle}
                        placeholder="填写画面短句字幕"
                        onChange={(subtitle) => onChangeAdaptedBeat(index, { subtitle })}
                        label={`${title} 字幕`} />
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
                      {onBindBeatAction && (
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
                              {onOpenActionAtlas && (
                                <button type="button" disabled={locked} onClick={onOpenActionAtlas} className={`sales-link-btn ${salesFocusClass}`}>
                                  <Compass size={11} aria-hidden />开源图鉴
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
                            <option value="">{actions.length === 0 ? '从开源图鉴导入姿态后可选' : '默认（沿用脚本运镜）'}</option>
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
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={colCount}>
                <div className="sales-sb-tfoot-bar">
                  <span>
                    <strong>{beats.length}</strong> 段 · 总长 <strong>{formatScriptSeconds(script.durationSec)}</strong>
                    {hasSpeech && <> · {effectiveVoiceMode === 'voiceover' ? '旁白' : '口播'} <strong>{spokenCharCount}</strong> 字，约 <strong>{estimatedSpeakSec}</strong> 秒</>}
                  </span>
                  <span className="sales-sb-tfoot-tip">点击文字编辑 · Tab 切换 · 行尾展开主体、表情与衔接</span>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <footer className="sales-actionbar sales-sb-actionbar" aria-label="分镜脚本底部操作栏">
        <div className="sales-actionbar-left">{bottomLeft}</div>
        <div className="sales-actionbar-right sales-sb-bottom-actions">
          <div className="sales-sb-adapt-model" role="group" aria-label="改写模型选择">
            <span className="sales-sb-model-label">改写模型</span>
            <ConfiguredModelPicker ariaLabel="分镜改写模型" value={model} options={options} onChange={onModelChange}
              disabled={locked} isUp className="sales-sb-model-picker" />
          </div>
          {adapting ? (
            <button type="button" onClick={onCancel} className={salesGhostButtonClass}><Square size={12} aria-hidden />停止改写</button>
          ) : (
            <button type="button" disabled={disabled || !model} onClick={() => onRunAdapt(model)} className={salesGhostButtonClass}>
              <RefreshCw size={13} aria-hidden />{adaptedBeats.length > 0 ? '按商品重新改写' : '按商品自动改写'}
            </button>
          )}
          {onNextStep && (
            <button type="button" disabled={locked} onClick={onNextStep} className={salesPrimaryButtonClass}>
              下一步：生成成片<ArrowRight size={14} aria-hidden />
            </button>
          )}
        </div>
      </footer>
    </section>
  );
}
