import { useRef } from 'react';
import { ArrowUpRight, Check, Compass, ImagePlus, Sparkles, Upload } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type { ScriptTaxonomyItem } from '@shared/contracts/salesScriptTaxonomy';
import {
  SALES_PRODUCT_CATEGORY_LABELS,
  salesAudienceLabel,
  type AppearanceAudience,
  type RankedAsset,
  type SalesBeatVoiceMode,
  type SalesPersonaCandidate,
  type SalesPresentationMode,
  type SalesSceneCandidate,
  type SalesVoiceCandidate,
  type VideoSalesCategory,
} from '@shared/domain/sales';
import type { StoredSalesScript } from '../api/salesScripts';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import { formatScriptSeconds, scriptBeatCount } from '../model/salesScriptEditor';
import { scriptTaxonomyEntry } from '../model/salesScriptLibrary';
import { compareSalesAssetNames } from '../model/salesAssetNames';
import { SalesDropup } from './SalesBottomActionBar';
import { SalesScriptVideoChoice } from './SalesScriptVideoChoice';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';

interface Props {
  scripts: StoredSalesScript[];
  activeScript: StoredSalesScript | null;
  taxonomy: ScriptTaxonomyItem[];
  selectedScriptId: string;
  loadingScripts: boolean;
  category: VideoSalesCategory;
  audience: AppearanceAudience;
  plan: SalesProductionPlanState;
  effectiveVoiceMode: SalesBeatVoiceMode;
  rankedPersonas: readonly RankedAsset<SalesPersonaCandidate>[];
  rankedScenes: readonly RankedAsset<SalesSceneCandidate>[];
  rankedVoices: readonly RankedAsset<SalesVoiceCandidate>[];
  selectedPersona: SalesPersonaCandidate | null;
  selectedScene: SalesSceneCandidate | null;
  selectedVoice: SalesVoiceCandidate | null;
  disabled: boolean;
  onSelectScript: (id: string) => void;
  onSelectPersona: (id: string) => void;
  onPatchPlan: (patch: Partial<SalesProductionPlanState>) => void;
  onPresentationModeChange: (mode: SalesPresentationMode) => void;
  onVoiceModeChange: (mode: '' | SalesBeatVoiceMode) => void;
  onScriptVideoReferenceChange: (mode: 'none' | 'depth') => void;
  onSmartMatch: () => void;
  onUploadSlot: (target: 'personaBody' | 'personaFace' | 'scene', file: File) => void;
  onOpenStage: (stage: 'scripts' | 'materials', section?: 'persona' | 'scene' | 'sound') => void;
  onOpenFaceAtlas?: () => void;
}

function PersonaRow({ entry, active, muted = false, onSelect }: {
  entry: RankedAsset<SalesPersonaCandidate>;
  active: boolean;
  muted?: boolean;
  onSelect: () => void;
}) {
  const { item, audienceLabel } = entry;
  const avatar = item.avatarUrl || item.faceUrl || item.fullBodyUrl;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`sales-dropup-option ${muted ? 'is-muted' : ''} ${active ? 'is-selected' : ''} ${salesFocusClass}`}
    >
      {avatar
        ? <img src={proxyMediaUrl(avatar, { thumb: true, width: 64 })} alt="" className="sales-dropup-option-thumb is-round" />
        : <span className="sales-dropup-option-thumb is-round" />}
      <div className="min-w-0 flex-1">
        <div className="sales-dropup-option-title">
          <span>{item.name}</span>
          {audienceLabel && <em className="sales-dropup-tag">{audienceLabel}</em>}
        </div>
        <small>{item.tags || item.description || (muted ? '跨人群选用' : '9 视角人像参考')}</small>
      </div>
      {active && <Check size={13} aria-hidden />}
    </button>
  );
}

export function SalesStoryboardBottomBar({
  scripts, activeScript, taxonomy, selectedScriptId, loadingScripts, category, audience,
  plan, effectiveVoiceMode, rankedPersonas, rankedScenes, rankedVoices,
  selectedPersona, selectedScene, selectedVoice, disabled,
  onSelectScript, onSelectPersona, onPatchPlan, onPresentationModeChange,
  onVoiceModeChange, onScriptVideoReferenceChange, onSmartMatch, onUploadSlot, onOpenStage, onOpenFaceAtlas,
}: Props) {
  const bodyInputRef = useRef<HTMLInputElement>(null);
  const faceInputRef = useRef<HTMLInputElement>(null);
  const sceneInputRef = useRef<HTMLInputElement>(null);

  const verifiedScripts = scripts.filter((item) => item.status === 'verified').sort((a, b) => compareSalesAssetNames(a.title, b.title));
  const personaRequired = activeScript ? activeScript.script.assetSlots.persona.required : true;
  const customPersona = Boolean(plan.customPersonaBodyUrl || plan.customPersonaFaceUrl);
  const personaThumb = plan.customPersonaFaceUrl || plan.customPersonaBodyUrl || selectedPersona?.avatarUrl || selectedPersona?.faceUrl || '';
  const personaValue = !personaRequired ? '无需人物' : customPersona ? '自定义参考图' : selectedPersona?.name || '待选人物';

  const matchedPersonas = rankedPersonas.filter((entry) => entry.audienceMatched !== false).sort((a, b) => compareSalesAssetNames(a.item.name, b.item.name));
  const mismatchedPersonas = rankedPersonas.filter((entry) => entry.audienceMatched === false).sort((a, b) => compareSalesAssetNames(a.item.name, b.item.name));
  const sceneChoices = [...rankedScenes].sort((a, b) => compareSalesAssetNames(a.item.title, b.item.title));
  const voiceChoices = [...rankedVoices].sort((a, b) => compareSalesAssetNames(a.item.name, b.item.name));
  const sceneThumb = plan.customSceneImageUrl || selectedScene?.coverUrl || '';
  const sceneValue = plan.customSceneImageUrl ? '自定义实景' : selectedScene?.title || '默认场景';
  const voiceValue = plan.presentationMode === 'clean_visual' || effectiveVoiceMode === 'none'
    ? '纯画面无口播'
    : effectiveVoiceMode === 'voiceover' ? `旁白 · ${selectedVoice?.name || '默认音色'}` : '真人口播';
  const actionRefValue = plan.imitationMode === 'depth_imitation' && plan.scriptVideoReference === 'depth'
    ? '脚本＋深度视频' : '仅按脚本';
  const scriptTitle = loadingScripts
    ? '读取中…'
    : activeScript
      ? `${activeScript.title} (${formatScriptSeconds(activeScript.script.durationSec)}·${scriptBeatCount(activeScript.script)}段)`
      : '请选择脚本';

  const handleFile = (target: 'personaBody' | 'personaFace' | 'scene', input: HTMLInputElement) => {
    const file = input.files?.[0];
    input.value = '';
    if (file) onUploadSlot(target, file);
  };

  return (
    <div className="sales-sb-bottom-triggers" role="group" aria-label="制作设置">
      <input ref={bodyInputRef} type="file" accept="image/*" className="hidden" disabled={disabled} onChange={(e) => handleFile('personaBody', e.target)} />
      <input ref={faceInputRef} type="file" accept="image/*" className="hidden" disabled={disabled} onChange={(e) => handleFile('personaFace', e.target)} />
      <input ref={sceneInputRef} type="file" accept="image/*" className="hidden" disabled={disabled} onChange={(e) => handleFile('scene', e.target)} />

      {/* 1. 脚本选择 */}
      <SalesDropup label="脚本" value={scriptTitle} disabled={disabled} widthClass="w-[340px]">
        {(close) => (
          <>
            <div className="sales-dropup-head">
              <strong>参考脚本模板</strong>
              <button type="button" onClick={() => { close(); onOpenStage('scripts'); }} className={`sales-link-btn ${salesFocusClass}`}>
                去脚本库<ArrowUpRight size={11} aria-hidden />
              </button>
            </div>
            <div className="sales-dropup-list">
              {verifiedScripts.length === 0 ? (
                <p className="sales-dropup-empty">暂无已确认的参考脚本，请先前往脚本库导入并确认。</p>
              ) : verifiedScripts.map((item) => {
                const catName = scriptTaxonomyEntry(item.script, 'category', taxonomy)?.name || '通用';
                const active = item.id === selectedScriptId;
                return (
                  <button key={item.id} type="button" onClick={() => { onSelectScript(item.id); close(); }}
                    className={`sales-dropup-option ${active ? 'is-selected' : ''} ${salesFocusClass}`}>
                    <div className="min-w-0 flex-1">
                      <div className="sales-dropup-option-title"><span>[{catName}] {item.title}</span></div>
                      <small>{formatScriptSeconds(item.script.durationSec)} · {scriptBeatCount(item.script)} 段 · {item.script.visualSpec.aspectRatio}</small>
                    </div>
                    {active && <Check size={13} aria-hidden />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </SalesDropup>

      {/* 2. 出镜人物（按商品品类 + 适用年龄人群过滤置顶） */}
      {activeScript && (
        <SalesDropup
          label="人物"
          value={personaValue}
          disabled={disabled}
          widthClass="w-[340px]"
          thumbUrl={personaThumb ? proxyMediaUrl(personaThumb, { thumb: true, width: 48 }) : undefined}
        >
          {(close) => (
            <>
              <div className="sales-dropup-head">
                <span>按商品推荐：<strong>{SALES_PRODUCT_CATEGORY_LABELS[category]} · {salesAudienceLabel(audience)}</strong></span>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => { onSmartMatch(); close(); }} className={`sales-link-btn ${salesFocusClass}`}>
                    <Sparkles size={11} aria-hidden />智能匹配
                  </button>
                  <button type="button" onClick={() => { close(); onOpenStage('materials', 'persona'); }} className={`sales-link-btn ${salesFocusClass}`}>
                    人物库<ArrowUpRight size={11} aria-hidden />
                  </button>
                </div>
              </div>
              {!personaRequired ? (
                <p className="sales-dropup-empty">当前脚本仅展示商品或局部画面，无需出镜人物。</p>
              ) : (
                <>
                  <div className="sales-dropup-list">
                    {matchedPersonas.length === 0 ? (
                      <div className="sales-dropup-empty">
                        <p>暂无匹配「{salesAudienceLabel(audience)}」的人物资产。</p>
                        {onOpenFaceAtlas && (
                          <button type="button" onClick={() => { close(); onOpenFaceAtlas(); }} className={`mt-2 ${salesGhostButtonClass}`}>
                            <Compass size={12} aria-hidden />从开源人像图鉴导入
                          </button>
                        )}
                      </div>
                    ) : matchedPersonas.map((entry) => (
                      <PersonaRow key={entry.item.id} entry={entry} active={!customPersona && selectedPersona?.id === entry.item.id}
                        onSelect={() => { onSelectPersona(entry.item.id); close(); }} />
                    ))}
                    {mismatchedPersonas.length > 0 && (
                      <details className="sales-dropup-fold">
                        <summary className={salesFocusClass}>显示其他人群 ({mismatchedPersonas.length})</summary>
                        <div className="sales-dropup-fold-list">
                          {mismatchedPersonas.map((entry) => (
                            <PersonaRow key={entry.item.id} entry={entry} muted active={!customPersona && selectedPersona?.id === entry.item.id}
                              onSelect={() => { onSelectPersona(entry.item.id); close(); }} />
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                  <div className="sales-dropup-foot">
                    <button type="button" onClick={() => { close(); bodyInputRef.current?.click(); }} className={salesGhostButtonClass}>
                      <ImagePlus size={12} aria-hidden />上传全身图
                    </button>
                    <button type="button" onClick={() => { close(); faceInputRef.current?.click(); }} className={salesGhostButtonClass}>
                      <ImagePlus size={12} aria-hidden />上传人脸图
                    </button>
                    {onOpenFaceAtlas && (
                      <button type="button" onClick={() => { close(); onOpenFaceAtlas(); }} className={salesGhostButtonClass}>
                        <Compass size={12} aria-hidden />开源图鉴
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </SalesDropup>
      )}

      {/* 3. 拍摄场景 */}
      {activeScript && (
        <SalesDropup
          label="场景"
          value={sceneValue}
          disabled={disabled}
          widthClass="w-[310px]"
          thumbUrl={sceneThumb ? proxyMediaUrl(sceneThumb, { thumb: true, width: 48 }) : undefined}
        >
          {(close) => (
            <>
              <div className="sales-dropup-head">
                <strong>拍摄场景</strong>
                <button type="button" onClick={() => { close(); onOpenStage('materials', 'scene'); }} className={`sales-link-btn ${salesFocusClass}`}>
                  场景库<ArrowUpRight size={11} aria-hidden />
                </button>
              </div>
              <div className="sales-dropup-list">
                {rankedScenes.length === 0 ? (
                  <p className="sales-dropup-empty">暂无场景素材，可上传实景图或前往场景库添加。</p>
                ) : sceneChoices.map(({ item }) => {
                  const active = !plan.customSceneImageUrl && selectedScene?.id === item.id;
                  return (
                    <button key={item.id} type="button"
                      onClick={() => { onPatchPlan({ sceneId: item.id, customSceneImageUrl: '', customPrompt: '' }); close(); }}
                      className={`sales-dropup-option ${active ? 'is-selected' : ''} ${salesFocusClass}`}>
                      {item.coverUrl
                        ? <img src={proxyMediaUrl(item.coverUrl, { thumb: true, width: 72 })} alt="" className="sales-dropup-option-thumb" />
                        : <span className="sales-dropup-option-thumb" />}
                      <div className="min-w-0 flex-1">
                        <div className="sales-dropup-option-title"><span>{item.title}</span></div>
                        <small>{item.lighting || item.description || '空间环境参考'}</small>
                      </div>
                      {active && <Check size={13} aria-hidden />}
                    </button>
                  );
                })}
              </div>
              <div className="sales-dropup-foot">
                <button type="button" onClick={() => { close(); sceneInputRef.current?.click(); }} className={salesGhostButtonClass}>
                  <Upload size={12} aria-hidden />{plan.customSceneImageUrl ? '更换实景图' : '上传本次实景图'}
                </button>
                {plan.customSceneImageUrl && (
                  <button type="button" onClick={() => { onPatchPlan({ customSceneImageUrl: '', customPrompt: '' }); close(); }} className={salesGhostButtonClass}>
                    清除上传图
                  </button>
                )}
              </div>
            </>
          )}
        </SalesDropup>
      )}

      {/* 4. 表现与声音 */}
      {activeScript && (
        <SalesDropup label="声音" value={voiceValue} disabled={disabled} widthClass="w-[310px]">
          {(close) => (
            <>
              <div className="sales-dropup-head">
                <strong>表现形式与声音</strong>
                <button type="button" onClick={() => { close(); onOpenStage('materials', 'sound'); }} className={`sales-link-btn ${salesFocusClass}`}>
                  声音库<ArrowUpRight size={11} aria-hidden />
                </button>
              </div>
              <div className="sales-dropup-segmented" role="group" aria-label="声音模式">
                <button type="button" aria-pressed={plan.presentationMode === 'subtitled_intro' && effectiveVoiceMode === 'speech'}
                  onClick={() => { onPresentationModeChange('subtitled_intro'); onVoiceModeChange('speech'); }} className={salesFocusClass}>
                  真人口播
                </button>
                <button type="button" aria-pressed={plan.presentationMode === 'subtitled_intro' && effectiveVoiceMode === 'voiceover'}
                  onClick={() => { onPresentationModeChange('subtitled_intro'); onVoiceModeChange('voiceover'); }} className={salesFocusClass}>
                  画外旁白
                </button>
                <button type="button" aria-pressed={plan.presentationMode === 'clean_visual'}
                  onClick={() => onPresentationModeChange('clean_visual')} className={salesFocusClass}>
                  纯画面展示
                </button>
              </div>
              {plan.presentationMode === 'subtitled_intro' && effectiveVoiceMode === 'voiceover' && (
                <div className="sales-dropup-list mt-1">
                  {rankedVoices.length === 0 ? (
                    <p className="sales-dropup-empty">暂无可用旁白音色，可在声音库添加。</p>
                  ) : voiceChoices.map(({ item }) => {
                    const active = selectedVoice?.id === item.id;
                    return (
                      <button key={item.id} type="button" onClick={() => { onPatchPlan({ voiceId: item.id }); close(); }}
                        className={`sales-dropup-option ${active ? 'is-selected' : ''} ${salesFocusClass}`}>
                        <div className="min-w-0 flex-1">
                          <div className="sales-dropup-option-title"><span>{item.name}</span></div>
                          <small>{[item.voiceGroup || item.gender, ...(item.tags || [])].filter(Boolean).join(' · ') || '商用旁白音色'}</small>
                        </div>
                        {active && <Check size={13} aria-hidden />}
                      </button>
                    );
                  })}
                </div>
              )}
              {plan.presentationMode === 'subtitled_intro' && effectiveVoiceMode === 'speech' && (
                <p className="sales-dropup-note">人物在视频画面中直接开口讲解台词；字幕可单独导出 SRT。</p>
              )}
              {plan.presentationMode === 'clean_visual' && (
                <p className="sales-dropup-note">不生成口播与字幕，适合穿搭走秀、手势舞与纯视觉展示。</p>
              )}
            </>
          )}
        </SalesDropup>
      )}

      {/* 5. 动作参考 */}
      {activeScript && (
        <SalesDropup label="动作参考" value={actionRefValue} disabled={disabled} widthClass="w-[330px]">
          {() => (
            <>
              <div className="sales-dropup-head"><strong>动作与运镜参考</strong></div>
              <SalesScriptVideoChoice
                plan={plan}
                hasScript={Boolean(activeScript)}
                depthUrl={activeScript.depthVideoUrl}
                disabled={disabled}
                onSelect={onScriptVideoReferenceChange}
              />
            </>
          )}
        </SalesDropup>
      )}
    </div>
  );
}
