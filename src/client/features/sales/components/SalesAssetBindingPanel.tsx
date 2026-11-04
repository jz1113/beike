import { useRef } from 'react';
import { ArrowUpRight, ImagePlus, Image as ImageIcon, ScanFace, Sparkles, Upload, UserRound, Volume2, X } from 'lucide-react';
import { proxyMediaUrl } from '@client/shared/api/apiClient';
import type {
  RankedAsset, SalesBeatVoiceMode, SalesPersonaCandidate, SalesSceneCandidate, SalesScriptDomain, SalesVoiceCandidate,
} from '@shared/domain/sales';
import type { SalesProductionPlanState } from '../model/salesProductionDraft';
import { salesPersonaReferenceUrls } from '../model/salesPersonaBinding';
import { compareSalesAssetNames } from '../model/salesAssetNames';
import { SalesLibrarySelect } from './SalesLibrarySelect';
import { SalesVoiceSettings } from './SalesVoiceSettings';
import { salesFocusClass, salesGhostButtonClass } from './salesChrome';
import '../salesAssetSettings.css';

interface Props {
  script: SalesScriptDomain;
  plan: SalesProductionPlanState;
  rankedPersonas: readonly RankedAsset<SalesPersonaCandidate>[];
  rankedScenes: readonly RankedAsset<SalesSceneCandidate>[];
  rankedVoices: readonly RankedAsset<SalesVoiceCandidate>[];
  selectedPersona: SalesPersonaCandidate | null;
  selectedScene: SalesSceneCandidate | null;
  selectedVoice: SalesVoiceCandidate | null;
  effectiveVoiceMode: SalesBeatVoiceMode;
  disabled: boolean;
  onOpenMaterials: (section: 'persona' | 'scene' | 'sound') => void;
  onSmartMatch: () => void;
  onSelectPersona: (id: string) => void;
  onPatchPlan: (patch: Partial<SalesProductionPlanState>) => void;
  onEditPresentation: () => void;
  onUploadSlot: (target: 'personaBody' | 'personaFace' | 'scene', file: File) => void;
}

export function SalesAssetBindingPanel({
  script, plan, rankedPersonas, rankedScenes, rankedVoices,
  selectedPersona, selectedScene, selectedVoice, effectiveVoiceMode, disabled,
  onOpenMaterials, onSmartMatch, onSelectPersona, onPatchPlan, onEditPresentation, onUploadSlot,
}: Props) {
  const bodyInputRef = useRef<HTMLInputElement>(null);
  const faceInputRef = useRef<HTMLInputElement>(null);
  const sceneInputRef = useRef<HTMLInputElement>(null);
  const { bodyUrl, faceUrl } = salesPersonaReferenceUrls(plan, selectedPersona);
  const customPersona = Boolean(plan.customPersonaBodyUrl || plan.customPersonaFaceUrl);
  const sceneUrl = plan.customSceneImageUrl || selectedScene?.coverUrl || '';
  const personaOptions = rankedPersonas.map(({ item }, index) => ({
    value: item.id, label: item.name, description: [index === 0 ? '推荐' : '', item.tags || item.description].filter(Boolean).join(' · '),
  })).sort((a, b) => compareSalesAssetNames(a.label, b.label));
  const sceneOptions = rankedScenes.map(({ item }, index) => ({
    value: item.id, label: item.title, description: [index === 0 ? '推荐' : '', item.lighting || item.description].filter(Boolean).join(' · '),
  })).sort((a, b) => compareSalesAssetNames(a.label, b.label));

  return (
    <section className="sales-binding-panel" aria-label="人物、场景与声音设置">
      <div className="sales-binding-toolbar">
        <p>从素材库选择，或上传本次参考图。</p>
        <div>
          <button type="button" disabled={disabled} onClick={() => onOpenMaterials('persona')} className={salesGhostButtonClass}>素材库<ArrowUpRight size={12} aria-hidden /></button>
          <button type="button" disabled={disabled} onClick={onSmartMatch} className={salesGhostButtonClass}><Sparkles size={13} aria-hidden />智能匹配</button>
        </div>
      </div>
      <div className="sales-binding-sections">
        <section className="sales-binding-section" aria-label="出镜人物">
          <h3><UserRound size={16} aria-hidden />出镜人物</h3>
          <div className="sales-binding-controls">
            {script.assetSlots.persona.required ? <>
              <div className="sales-binding-select">
                <SalesLibrarySelect label={!rankedPersonas.length && !customPersona ? '暂无人物素材' : '选择出镜人物'} searchable
                  value={selectedPersona?.id || ''} disabled={disabled || !rankedPersonas.length}
                  onChange={(id) => { if (id) onSelectPersona(id); }}
                  options={customPersona ? [{ value: '', label: '使用上传的人物参考图' }, ...personaOptions] : personaOptions} />
              </div>
              {plan.personaId && !selectedPersona && !customPersona && <p className="sales-binding-note is-warning">原选人物已不在素材库，请重新选择或上传参考图。</p>}
              <div className="sales-binding-persona-images">
                {([
                  { target: 'personaBody', title: '全身参考', url: bodyUrl, input: bodyInputRef, Icon: UserRound, alt: '人物全身主体' },
                  { target: 'personaFace', title: '人脸参考', url: faceUrl, input: faceInputRef, Icon: ScanFace, alt: '人物人脸参考' },
                ] as const).map(({ target, title, url, input, Icon, alt }) => <div key={target}>
                  <input ref={input} type="file" accept="image/*" disabled={disabled} className="hidden" aria-label={`上传${title}图`}
                    onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onUploadSlot(target, file); }} />
                  <button type="button" disabled={disabled} onClick={() => input.current?.click()}
                    className={`sales-binding-image ${salesFocusClass}`} aria-label={`${url ? '更换' : '上传'}${title}图`}>
                    {url ? <img src={proxyMediaUrl(url)} alt={alt} /> : <span className="sales-binding-image-empty"><Icon size={23} aria-hidden /></span>}
                    <span className="sales-binding-image-copy"><strong>{title}</strong><small>{url ? '点击更换图片' : '点击上传图片'}</small></span>
                    <ImagePlus size={15} aria-hidden />
                  </button>
                </div>)}
              </div>
              {!rankedPersonas.length && <p className="sales-binding-note">可直接上传参考图，或<button type="button" disabled={disabled} onClick={() => onOpenMaterials('persona')} className={`sales-link-btn ${salesFocusClass}`}>浏览人物素材<ArrowUpRight size={11} aria-hidden /></button>。</p>}
            </> : <div className="sales-binding-empty">
              <UserRound size={22} aria-hidden /><div><strong>当前脚本无需出镜人物</strong><p>按脚本展示商品或局部画面。</p></div>
            </div>}
          </div>
        </section>

        <section className="sales-binding-section" aria-label="拍摄场景">
          <h3><ImageIcon size={16} aria-hidden />拍摄场景</h3>
          <div className="sales-binding-controls">
            <div className="sales-binding-scene">
              <div className="sales-binding-scene-image">
                {sceneUrl ? <img src={proxyMediaUrl(sceneUrl)} alt={plan.customSceneImageUrl ? '自定义实景参考' : selectedScene?.title || '场景参考'} /> : <ImageIcon size={27} aria-hidden />}
                {plan.customSceneImageUrl && <button type="button" disabled={disabled} aria-label="清除自定义场景图" title="清除上传图，恢复素材库场景"
                  onClick={() => onPatchPlan({ customSceneImageUrl: '', customPrompt: '' })} className={salesFocusClass}><X size={13} aria-hidden /></button>}
              </div>
              <div className="sales-binding-controls">
                <div className="sales-binding-select">
                  <SalesLibrarySelect label="选择拍摄场景" searchable
                    value={plan.customSceneImageUrl ? 'uploaded' : plan.sceneId} disabled={disabled}
                    onChange={(id) => { onPatchPlan({ sceneId: id, customSceneImageUrl: '', customPrompt: '' }); }}
                    options={[{ value: '', label: '沿用分镜场景' }, ...(plan.customSceneImageUrl ? [{ value: 'uploaded', label: '使用上传的实景图' }] : []), ...sceneOptions]} />
                </div>
                <p className="sales-binding-note sales-binding-scene-description">{plan.customSceneImageUrl ? '以本次上传的图片作为场景参考。' : selectedScene ? selectedScene.description || selectedScene.lighting || '按所选场景的空间布局生成。' : plan.sceneId ? '所选场景已失效，请重新选择。' : '按各镜记录的地点和现场光拍摄。'}</p>
                <div className="sales-binding-scene-actions">
                  <input ref={sceneInputRef} type="file" accept="image/*" disabled={disabled} className="hidden" aria-label="上传实景图"
                    onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onUploadSlot('scene', file); }} />
                  <button type="button" disabled={disabled} onClick={() => sceneInputRef.current?.click()} className={`sales-link-btn ${salesFocusClass}`}><Upload size={12} aria-hidden />{plan.customSceneImageUrl ? '更换实景图' : '上传实景图'}</button>
                  {!rankedScenes.length && <button type="button" disabled={disabled} onClick={() => onOpenMaterials('scene')} className={`sales-link-btn ${salesFocusClass}`}>浏览场景素材<ArrowUpRight size={11} aria-hidden /></button>}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="sales-binding-section" aria-label="声音">
          <h3><Volume2 size={16} aria-hidden />声音</h3>
          <div className="sales-binding-controls">
            <SalesVoiceSettings effectiveVoiceMode={effectiveVoiceMode} rankedVoices={rankedVoices} selectedVoice={selectedVoice} voiceId={plan.voiceId} videoModel={plan.videoModel} videoVoiceId={plan.videoVoiceId}
              disabled={disabled} onEditPresentation={onEditPresentation} onOpenMaterials={() => onOpenMaterials('sound')} onPatchPlan={onPatchPlan} />
          </div>
        </section>
      </div>
    </section>
  );
}
