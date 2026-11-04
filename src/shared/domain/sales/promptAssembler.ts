import type { BeatProductImageBinding, SalesPersonaCandidate, SalesSceneCandidate, SalesVoiceCandidate } from './assetRecommendation';
import type { SalesImageRef } from './imageCatalog';
import type { SalesBeatVoiceMode, SalesScriptBeat, SalesScriptDomain } from './scriptTemplate';
import { isSeedance2Model, omitSourceSpeechCues, resolveSalesProductSlots, salesPromptDataError } from './promptInputs';
import { currentSalesPhotography, salesRenderingStyle, salesBeatSceneError, unresolvedSalesEntityError } from './promptPhotography';
import { grokPresetVoicesAllowed, selectedGrokVideoVoice } from '../media/grokVoices';
import { salesActionEvidenceError, type SalesActionEvidenceBeat } from './promptEvidence';
import { selectSalesTemplateVoice } from './finalVideoTemplate';
import { salesReferenceScopeFacts } from './promptReferenceRoles';
import { salesPersonaVisualFacts, salesPersonaVisualProfileError, type SalesPersonaVisualProfile } from './personaVisualProfile';
import {
  SALES_IMAGE_VIEW_LABELS,
  type SalesImitationMode,
  type SalesPresentationMode,
  type SalesProductImageView,
  type SalesReferenceSlot,
} from './types';

export type { SalesReferenceSlot } from './types';

export interface SalesAdaptedBeat {
  index: number;
  subject: string;
  action: string;
  expression?: string;
  transition?: string;
  manualPerformanceFields?: Array<'action' | 'expression' | 'transition' | 'subject'>;
  spokenLine: string;
  subtitle: string;
}

export interface AssembleSalesPromptInput {
  model?: string;
  finalVideoTemplate?: string;
  refMode?: string;
  durationSec?: number;
  resolution?: string;
  script: SalesScriptDomain;
  aspectRatio?: string;
  productName: string;
  /** Original collected/OCR facts; generated summaries and buying points are not evidence. */
  productFacts?: string;
  productSummary?: string;
  buyingPoints?: string[];
  selectedImages: readonly SalesImageRef[];
  beatBindings: readonly BeatProductImageBinding[];
  adaptedBeats?: readonly SalesAdaptedBeat[];
  actionReferences?: Record<number, { url: string; mediaType: 'image' | 'video'; label: string }>;
  scriptVideoReference?: { url: string; kind: 'depth' | 'source' };
  persona: SalesPersonaCandidate | null;
  personaVisualProfile?: SalesPersonaVisualProfile | null;
  customPersonaBodyUrl?: string;
  customPersonaFaceUrl?: string;
  scene: SalesSceneCandidate | null;
  customSceneImageUrl?: string;
  voiceModeOverride?: SalesBeatVoiceMode;
  voice?: SalesVoiceCandidate | null;
  voiceAudioUrl?: string;
  videoVoiceId?: string;
  presentationMode?: SalesPresentationMode;
  imitationMode?: SalesImitationMode;
  truncatedEnding?: boolean;
}

export interface AssembledSalesPrompt {
  references: SalesReferenceSlot[];
  jimengPrompt: string;
  enginePrompt: string;
  storyboardPreview?: string;
  templateError: string;
  narrationText: string;
  subtitles: Array<{ index: number; start: number; end: number; text: string }>;
  spokenCharCount: number;
  estimatedSpeakSec: number;
  effectiveVoiceMode: SalesBeatVoiceMode;
  presentationMode: SalesPresentationMode;
  imitationMode: SalesImitationMode;
  sanitizedNoiseTerms: string[];
  warnings: string[];
  audios?: string[];
  voiceError?: string;
  voiceIds?: string[];
}

const CN_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const cnOrdinal = (idx: number) => CN_NUMS[idx] || String(idx + 1);

function fmtMmSs(sec: number): string {
  const ticks = Math.round(Math.max(0, sec) * 10);
  const whole = Math.floor(ticks / 10);
  const mins = String(Math.floor(whole / 60)).padStart(2, '0');
  const secs = String(whole % 60).padStart(2, '0');
  return `${mins}:${secs}${ticks % 10 ? `.${ticks % 10}` : ''}`;
}

function showsProduct(beat: SalesScriptBeat, subject: string, action: string, productName: string, manuallyEdited: boolean): boolean {
  const text = subject + ' ' + action;
  if (/商品(?:不入镜|不出镜)|(?:不展示|无)商品/.test(text)) return false;
  const namesProduct = /\{\{\s*商品|展示商品|商品特写/.test(text) || (!!productName.trim() && text.includes(productName));
  if (beat.productVisible !== undefined) return beat.productVisible || (manuallyEdited && namesProduct);
  if (namesProduct) return true;
  // Older scripts lack productVisible. Keep their focus unless the shot is explicitly environmental.
  return beat.requiredView !== 'any' || !/空镜/.test([subject, action, beat.camera, beat.shotSize].join(' '));
}

export function assembleSalesVideoPrompt(input: AssembleSalesPromptInput): AssembledSalesPrompt {
  const { script, selectedImages, beatBindings, adaptedBeats = [] } = input;
  const warnings: string[] = [];
  const presentationMode = input.presentationMode || 'subtitled_intro';
  const imitationMode = input.imitationMode || 'script_only';
  const effectiveVoiceMode: SalesBeatVoiceMode = presentationMode === 'clean_visual' ? 'none'
    : input.voiceModeOverride || (script.voiceMode === 'voiceover' ? 'voiceover' : script.voiceMode === 'none' ? 'none' : 'speech');
  const sourceVisualText = (text: string) => omitSourceSpeechCues(text, effectiveVoiceMode === 'speech');
  const orderedTiming = isSeedance2Model(input.model);
  const references: SalesReferenceSlot[] = [];
  const urlToSlot = new Map<string, SalesReferenceSlot>();
  const addSlot = (url: string, kind: SalesReferenceSlot['kind'], label: string, view?: SalesProductImageView, mediaType: 'image' | 'video' = 'image') => {
    const clean = url.trim();
    if (!clean) return null;
    const existing = urlToSlot.get(clean);
    if (existing) {
      if (view && !existing.view) existing.view = view;
      if (existing.kind !== kind && !existing.roles?.includes(kind)) existing.roles = [...(existing.roles || [existing.kind]), kind];
      return existing;
    }
    const slotIndex = references.length + 1;
    const slot: SalesReferenceSlot = {
      slotIndex, mixedToken: `{{Mixed ${slotIndex}}}`,
      apiToken: `${mediaType === 'video' ? '视频' : '图片'}${references.filter((item) => (item.mediaType || 'image') === mediaType).length + 1}`,
      mediaType, kind, label, url: clean, ...(view ? { view } : {}),
    };
    references.push(slot);
    urlToSlot.set(clean, slot);
    return slot;
  };

  const presence = script.assetSlots.persona.presence;
  const handsOnly = presence === 'hands_only';
  const customBody = input.customPersonaBodyUrl?.trim() || '';
  const customFace = input.customPersonaFaceUrl?.trim() || '';
  const customPersona = Boolean(customBody || customFace);
  const persona = customPersona ? null : input.persona;
  const identityUrl = persona?.identityUrl?.trim() || '';
  const bodyUrl = customPersona ? customBody : (persona?.fullBodyUrl || '').trim();
  const faceUrl = customPersona ? customFace : (persona?.faceUrl || persona?.avatarUrl || '').trim();
  const personaName = customPersona ? '自定义人物' : persona?.name || '当前人物';
  let identitySlot: SalesReferenceSlot | null = null;
  let bodySlot: SalesReferenceSlot | null = null;
  let faceSlot: SalesReferenceSlot | null = null;
  if (presence !== 'none' && (script.assetSlots.persona.required || identityUrl || bodyUrl || faceUrl)) {
    identitySlot = addSlot(identityUrl, 'persona_identity', `${handsOnly ? '手部原图' : '人物原图'}（${personaName}）`);
    bodySlot = addSlot(bodyUrl, 'persona_body', `${handsOnly ? '手部形象' : '人物主体形象'}（${personaName}）`);
    faceSlot = !handsOnly && faceUrl && faceUrl !== bodyUrl ? addSlot(faceUrl, 'persona_face', `人物人脸参考（${personaName}）`) : null;
    if (handsOnly && !identitySlot && !bodySlot) warnings.push('手部展示脚本尚未绑定手部或包含手部的主体参考图；人脸图不能替代手部锚点。');
    if (!handsOnly && !identitySlot && !bodySlot && !faceSlot) warnings.push('当前脚本需要人物出镜，但尚未绑定带参考图的人物资产，无法锁定所选人物身份。');
  }

  const productSlots: SalesReferenceSlot[] = [];
  for (const image of selectedImages) {
    const viewLabel = image.view ? SALES_IMAGE_VIEW_LABELS[image.view] : '主图';
    const slot = addSlot(image.url, 'product', `商品${viewLabel}（#${image.index + 1}）`, image.view);
    if (slot && !productSlots.includes(slot)) productSlots.push(slot);
  }
  for (const binding of beatBindings) {
    if (binding.requiredView !== 'any' && !binding.exactViewMatch) {
      const msg = `第 ${binding.beatIndex + 1} 段需要商品「${SALES_IMAGE_VIEW_LABELS[binding.requiredView]}」参考图，当前未标注对应视角图，已暂用主参考图兜底。`;
      if (!warnings.includes(msg)) warnings.push(msg);
    }
  }
  if (!productSlots.length) warnings.push('尚未选择任何商品参考图，请先返回「商品与卖点」勾选至少 1 张商品图。');
  const scene = input.customSceneImageUrl?.trim() ? null : input.scene;
  const sceneUrl = (input.customSceneImageUrl || scene?.coverUrl || '').trim();
  const sceneName = input.customSceneImageUrl?.trim() ? '自定义实景' : scene?.title || '当前场景';
  const sceneSlot = addSlot(sceneUrl, 'scene', `场景参考（${sceneName}）`);
  const sceneText = [scene?.title, scene?.description].filter((value) => value?.trim()).join('；');
  const hasCurrentScene = Boolean(sceneSlot || sceneText);
  if ((scene || input.customSceneImageUrl?.trim()) && !sceneSlot) warnings.push('所选场景尚未绑定可用场景参考图，请先补充场景主图，避免生成时自行编造环境。');
  const photoText = (text: string) => currentSalesPhotography(sourceVisualText(text), hasCurrentScene, script.sourceExclusions);

  const adaptedByIndex = new Map(adaptedBeats.map((beat) => [beat.index, beat]));
  const timelineFacts: string[] = [];
  const previewRows: string[] = [];
  const evidenceBeats: SalesActionEvidenceBeat[] = [];
  const spokenLines: string[] = [];
  const subtitles: AssembledSalesPrompt['subtitles'] = [];
  // Historical per-beat bindings remain in the draft, but only the current
  // script's linked depth video is an executable motion reference.
  const depthVideo = imitationMode === 'depth_imitation' && input.scriptVideoReference?.kind === 'depth'
    ? input.scriptVideoReference : undefined;
  const actionSlot = depthVideo ? addSlot(depthVideo.url, 'action', '脚本关联深度视频（仅动作）', undefined, 'video') : null;
  const beatCount = script.shots.reduce((count, shot) => count + shot.beats.length, 0);
  const segments = script.shots.flatMap(shot => shot.beats);
  const recordedCameras = new Set(segments.map(beat => beat.camera.trim()).filter(Boolean));
  const localCameras = recordedCameras.size > 1 || (script.shots.length > 1 && recordedCameras.size > 0);
  const localLighting = !hasCurrentScene && new Set(segments.map(beat => beat.scene.trim()).filter(Boolean)).size > 1;
  let visualError = '';
  let flatIdx = 0;
  const factLine = (label: string, value: string | undefined) => value?.trim() ? `${label}：${value.trim()}` : '';
  let previousCamera = '', previousSize = '', previousSubject = '', previousProduct = '';
  if (script.visualSpec.oneTake) timelineFacts.push('镜头一（一镜到底）');
  script.shots.forEach((shot, shotIndex) => {
    if (!script.visualSpec.oneTake) {
      timelineFacts.push(`镜头${cnOrdinal(shotIndex)}`);
      previousCamera = ''; previousSize = ''; previousSubject = ''; previousProduct = '';
    }
    shot.beats.forEach((beat, beatIndex) => {
    const adapted = adaptedByIndex.get(flatIdx);
    const adaptedAction = adapted?.action?.trim();
    const binding = beatBindings[flatIdx];
    const expression = adapted?.expression ?? (!adaptedAction ? beat.expression : '');
    const transition = input.truncatedEnding && flatIdx === beatCount - 1 ? '' : adapted?.transition ?? (!adaptedAction ? beat.transition : '');
    const line = presentationMode === 'subtitled_intro' && effectiveVoiceMode !== 'none' ? adapted?.spokenLine?.trim() || '' : '';
    if (adaptedAction && ((beat.expression && adapted?.expression === undefined) || (beat.transition && adapted?.transition === undefined && !(input.truncatedEnding && flatIdx === beatCount - 1)))) warnings.push(`动作段 ${flatIdx + 1} 的旧改编未独立记录表情或衔接，请重新自动适配商品或补充相应字段；旧动作已保留。`);
    const camera = photoText(beat.camera);
    const size = beat.shotSize.trim();
    const subject = sourceVisualText(adapted?.manualPerformanceFields?.includes('subject')
      ? adapted.subject || '' : adapted?.subject?.trim() || (!adaptedAction ? beat.subject : ''));
    const action = sourceVisualText(adaptedAction || beat.actionTemplate || beat.action);
    const boundSlot = showsProduct(beat, subject, action, input.productName, Boolean(adapted?.manualPerformanceFields?.some(key => key === 'action' || key === 'subject')))
      ? (binding?.image && urlToSlot.get(binding.image.url)) || productSlots[0] || null : null;
    const localScene = hasCurrentScene ? '' : sourceVisualText(beat.scene);
    const visual = [localScene, subject, action, sourceVisualText(expression), sourceVisualText(transition), camera, size].join('；');
    const conflict = unresolvedSalesEntityError(visual, script.sourceExclusions, [input.productName, personaName], hasCurrentScene ? sceneText : localScene)
      || salesBeatSceneError(visual, sceneText);
    if (conflict && !visualError) visualError = `镜头${script.visualSpec.oneTake ? 1 : shotIndex + 1} · 动作段${(script.visualSpec.oneTake ? flatIdx : beatIndex) + 1}：${conflict}`;
    evidenceBeats.push({ index: flatIdx, subject: resolveSalesProductSlots(subject), action: resolveSalesProductSlots(action),
      expression: resolveSalesProductSlots(sourceVisualText(expression)), transition: resolveSalesProductSlots(sourceVisualText(transition)),
      detailReference: binding?.assignedView === 'detail' && binding.image?.view === 'detail' && binding.image.url === boundSlot?.url
        && selectedImages.some((image) => image.url === boundSlot.url && image.view === 'detail') });
    const interval = `${fmtMmSs(beat.start)} - ${fmtMmSs(beat.end)}`;
    const shotNumber = script.visualSpec.oneTake ? 1 : shotIndex + 1;
    previewRows.push([`镜${String(shotNumber).padStart(2, '0')}`, interval, [size, camera].filter(Boolean).join(' · '),
      hasCurrentScene ? sceneName : localScene, subject, action, sourceVisualText(expression), sourceVisualText(transition)].filter(Boolean).join('｜'));
    const timing = actionSlot ? `（${orderedTiming ? '源片定位记录' : '源片对应时间'} ${interval}）` : orderedTiming ? '' : `（${interval}）`;
    timelineFacts.push([
      `动作段${cnOrdinal(script.visualSpec.oneTake ? flatIdx : beatIndex)}${timing}`,
      factLine('本镜场景', localScene),
      factLine('主体状态', subject !== previousSubject ? subject : ''),
      factLine('动作描述', action),
      factLine('重点商品参考', boundSlot?.mixedToken !== previousProduct ? boundSlot?.mixedToken : ''),
      factLine('景别', size !== previousSize ? size : ''), factLine('镜头记录', camera !== previousCamera ? camera : ''),
      factLine('眼神表情', sourceVisualText(expression)),
      factLine('段落衔接', sourceVisualText(transition)),
      factLine(effectiveVoiceMode === 'voiceover' ? '后期旁白节点' : '口播台词', line ? `“${line}”` : ''),
    ].filter(Boolean).join('\n'));
    if (presentationMode === 'subtitled_intro') {
      if (effectiveVoiceMode !== 'none' && line) spokenLines.push(line);
      const text = adapted?.subtitle?.trim() || '';
      if (text) subtitles.push({ index: flatIdx, start: beat.start, end: beat.end, text });
    }
    flatIdx += 1;
    previousSubject = subject;
    previousProduct = boundSlot?.mixedToken || '';
    previousCamera = camera || previousCamera;
    previousSize = size || previousSize;
    });
  });
  if (imitationMode === 'depth_imitation' && !actionSlot) warnings.push('脚本关联深度视频尚未就绪，请回素材库继续处理，或切换为「仅按脚本」。');

  const narrationText = spokenLines.join(' ');
  const voice = effectiveVoiceMode === 'none' ? null : input.voice;
  const grokSpeech = effectiveVoiceMode === 'speech' && grokPresetVoicesAllowed(input.model || '');
  const grokVoice = grokSpeech ? selectedGrokVideoVoice(input.videoVoiceId) : undefined;
  const voiceIds = grokVoice ? [grokVoice.id] : [];
  const voiceAudioUrl = effectiveVoiceMode === 'speech' && voice && !grokSpeech
    ? voice.sampleAudioUrl.trim() || input.voiceAudioUrl?.trim() || '' : '';
  const audios = voiceAudioUrl ? [voiceAudioUrl] : [];
  const voiceError = effectiveVoiceMode === 'none' ? ''
    : grokSpeech && !grokVoice ? '请选择 Grok 官方预置音色；声音库中的音频样本需要 xAI 合作伙伴权限，原人声选择已保留。'
    : !voice && !grokSpeech ? '请先选择本次使用的人声；原选择失效时请重新选择。'
      : !narrationText.trim() ? '请先生成或填写本次分镜台词，再生成带人声的视频。'
        : effectiveVoiceMode === 'voiceover' && voice && !voice.ttsVoice.trim() && !voice.voiceId.trim() ? '当前人声只有音频样本，请为旁白配置可用的合成音色编号，或选择其他人声。'
        : effectiveVoiceMode === 'speech' && !grokSpeech && !voiceAudioUrl ? '请先生成口播音色参考音频，或选择带试听样本的人声。' : '';
  const spokenCharCount = spokenLines.join('').replace(/[\s，。！？、；：“”‘’,.!?;:"'()（）-]/g, '').length;
  const targetCps = script.assetSlots.audio.targetCps > 0 ? script.assetSlots.audio.targetCps : 3.8;
  const estimatedSpeakSec = spokenCharCount > 0 ? Math.round((spokenCharCount / targetCps) * 10) / 10 : 0;
  if (effectiveVoiceMode !== 'none' && spokenCharCount / Math.max(1, script.durationSec) > 4.6) warnings.push(`当前台词共 ${spokenCharCount} 字，超过 ${script.durationSec} 秒自然语速上限（建议精简到 ${Math.floor(script.durationSec * 4.0)} 字以内，避免 AI 语音加速发假）。`);
  const presenceLabel = presence === 'none' ? '仅商品' : handsOnly ? '仅手部' : '完整人物';
  const personaFacts = [
      `出镜范围：${presenceLabel}`,
      ...(identitySlot || bodySlot || faceSlot ? [`出镜人物（${personaName}）`] : []),
      factLine('人物设定', presence === 'full_presenter' || presence === 'silent_model' ? persona?.description : ''),
      factLine('人物风格标签', presence === 'full_presenter' || presence === 'silent_model' ? persona?.tags : ''),
      factLine('原分镜人物风格（仅表演参考）', presence === 'full_presenter' || presence === 'silent_model' ? script.assetSlots.persona.styleTags.join('、') : ''),
      salesPersonaVisualFacts(input.personaVisualProfile, (identitySlot || bodySlot || faceSlot)?.url || '', presence),
      factLine('人物原始主图', identitySlot ? `${identitySlot.mixedToken}（定身份${bodySlot === identitySlot ? '及体态' : ''}）` : ''),
      factLine('人物主体参考', bodySlot !== identitySlot ? bodySlot?.mixedToken : ''),
      factLine('人物人脸参考', faceSlot !== identitySlot ? faceSlot?.mixedToken : ''),
    ].filter(Boolean).join('\n');
  const { productFacts, sceneFacts, depthFacts } = salesReferenceScopeFacts(references, sceneSlot, sceneText, input.productName);
  const facts = {
    personaFacts, productFacts, sceneFacts, depthFacts,
    referenceFacts: ['【人物说明】', personaFacts, '【商品说明】', productFacts, sceneFacts && '【场景说明】', sceneFacts,
      depthFacts && '【深度视频说明】', depthFacts].filter(Boolean).join('\n'),
    photographyFacts: [
      `输出画幅：${input.aspectRatio || script.visualSpec.aspectRatio}`,
      factLine('生成参考方式', input.refMode ? ({ omni: '素材参考，图片不插作静帧', first_frame: '使用指定首帧', first_last_frame: '使用指定首尾帧', text: '文字', edit: '编辑', extend: '延长' }[input.refMode] || input.refMode) : ''),
      `生成时长：${input.durationSec ?? script.durationSec} 秒`,
      factLine('生成分辨率', input.resolution),
      `镜头数量：${script.visualSpec.oneTake ? 1 : script.shots.length}`,
      factLine('摄影质感', photoText(salesRenderingStyle(script.visualSpec.styleSummary, hasCurrentScene || localLighting, localCameras, sceneText))),
      factLine('拍摄光线', hasCurrentScene ? scene?.lighting : localLighting ? '' : photoText(script.visualSpec.lighting)),
      factLine('机位与运镜', localCameras ? '' : photoText(script.visualSpec.cameraFeel)),
      factLine('画面氛围', photoText(script.visualSpec.moodTags.join('、'))),
      `画面动作节奏${effectiveVoiceMode === 'speech' ? '（不作为口播语速）' : ''}：${{ fast: '较快', medium: '适中', slow: '舒缓' }[script.visualSpec.pacing]}`,
      ...(orderedTiming ? [`本片时序依据：按动作段顺序自然衔接。${effectiveVoiceMode === 'speech' ? '不限定逐句口播时间。' : ''}`] : []),
      ...(input.truncatedEnding ? ['本次结尾：已截短，在最后保留动作结束；不执行后续段落衔接。'] : []),
    ].filter(Boolean).join('\n'),
    timelineFacts: timelineFacts.join('\n\n'),
    audioFacts: [
      ...(effectiveVoiceMode === 'speech' ? [
        `视频人声：本次口播；发声位置=${presence === 'none' || handsOnly ? '画外，同一说话人' : '画内，当前出镜人物'}`,
        '只说分镜台词，按语义连续换气，空段不补话。',
        ...(presence !== 'none' && !handsOnly ? ['画面发音口型依据：本段口播台词的实际发音'] : []),
      ] : [`视频人声：不生成。${presence !== 'none' && !handsOnly ? '保留自然唇部表情，无连续说话口型。' : ''}`]),
      ...(voice && effectiveVoiceMode === 'speech' ? [
        ...(!grokSpeech ? [`当前人声名称：${voice.name}`] : []),
        ...(audios.length ? ['当前人声参考：@音频1；参考范围=人声音色、说话韵律与自然停顿；样本原句不作为本片台词'] : []),
      ] : []),
      ...(grokVoice ? [`当前人声名称：Grok ${grokVoice.name}`, '当前人声参考：<AUDIO_0>；使用所选官方预置音色，口播内容按本次分镜台词'] : []),
      ...(effectiveVoiceMode === 'voiceover' ? ['台词用途：后期旁白节点；所选人声单独合成，本次视频不附带人声音频'] : []),
    ].join('\n'),
  };
  for (const key of Object.keys(facts) as Array<keyof typeof facts>) facts[key] = resolveSalesProductSlots(facts[key]);
  const dataError = salesPromptDataError(Object.values(facts).join('\n'), references.map((slot) => slot.mixedToken))
    || salesPersonaVisualProfileError(input.personaVisualProfile, (identitySlot || bodySlot || faceSlot)?.url || '', presence)
    || visualError
    || salesActionEvidenceError({ productName: input.productName, productFacts: input.productFacts, beats: evidenceBeats,
      sceneSpatialType: hasCurrentScene ? scene?.spatialType : undefined });
  const authored = input.finalVideoTemplate || '';
  const soundLineWithFact = /^【仅(有口播|无口播|后期旁白)】[^\r\n]*\{\{/m.test(authored);
  const template = selectSalesTemplateVoice(authored, effectiveVoiceMode);
  const keys = Object.keys(facts) as Array<keyof typeof facts>;
  const unknown = [...template.matchAll(/\{\{([^{}]+)\}\}/g)].map((match) => match[1].trim()).filter((name) => !keys.includes(name as keyof typeof facts) || (name === 'depthFacts' && imitationMode !== 'depth_imitation'));
  const required = ['photographyFacts', 'timelineFacts', 'audioFacts'];
  if (!/\{\{\s*referenceFacts\s*\}\}/.test(template)) {
    required.push('personaFacts', 'productFacts', 'sceneFacts');
    if (imitationMode === 'depth_imitation') required.push('depthFacts');
  }
  const missing = required.filter((key) => !new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`).test(template));
  const remainder = template.replace(/\{\{[^{}]+\}\}/g, '');
  const invalidDelimiters = /\{\{\{|\}\}\}/.test(template) || /\{\{|\}\}/.test(remainder);
  const templateTitle = imitationMode === 'depth_imitation' ? '最终视频生成 · 深度视频版' : '最终视频生成 · 纯分镜版';
  const templateError = !template.trim() ? `请先在提示词管理中配置并保存「${templateTitle}」规则。`
    : soundLineWithFact ? '声音模式行只填写开场文字，请将事实占位符移至公共行。'
    : invalidDelimiters ? '最终视频生成规则的占位符格式无效，请使用双花括号事实占位符。'
    : unknown.length ? `最终视频生成规则包含未知占位符：${[...new Set(unknown)].join('、')}`
      : missing.length ? `最终视频生成规则缺少事实占位符：${missing.join('、')}` : dataError;
  const jimengPrompt = templateError ? '' : template.replace(/\{\{\s*(referenceFacts|personaFacts|productFacts|sceneFacts|depthFacts|photographyFacts|timelineFacts|audioFacts)\s*\}\}/g, (_, key: keyof typeof facts) => facts[key]);
  let enginePrompt = jimengPrompt;
  for (const slot of references) enginePrompt = enginePrompt.split(slot.mixedToken).join(`@${slot.apiToken}`);
  return {
    storyboardPreview: dataError ? undefined : resolveSalesProductSlots(previewRows.join('\n')),
    references, jimengPrompt, enginePrompt, templateError, narrationText, subtitles, spokenCharCount,
    estimatedSpeakSec, effectiveVoiceMode, presentationMode, imitationMode, sanitizedNoiseTerms: [], warnings, audios, voiceError,
    ...(voiceIds.length ? { voiceIds } : {}),
  };
}
