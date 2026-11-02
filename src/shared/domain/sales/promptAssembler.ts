import type { BeatProductImageBinding, SalesPersonaCandidate, SalesSceneCandidate } from './assetRecommendation';
import type { SalesImageRef } from './imageCatalog';
import type { SalesBeatVoiceMode, SalesScriptDomain } from './scriptTemplate';
import {
  SALES_IMAGE_VIEW_LABELS,
  type SalesImitationMode,
  type SalesPresentationMode,
  type SalesProductImageView,
} from './types';

export interface SalesAdaptedBeat {
  index: number;
  subject: string;
  action: string;
  expression?: string;
  transition?: string;
  spokenLine: string;
  subtitle: string;
}

export interface SalesReferenceSlot {
  slotIndex: number;
  mixedToken: string;
  apiToken: string;
  kind: 'persona_identity' | 'persona_body' | 'persona_face' | 'product' | 'scene' | 'action';
  roles?: Array<SalesReferenceSlot['kind']>;
  mediaType?: 'image' | 'video';
  label: string;
  url: string;
  view?: SalesProductImageView;
}

export interface AssembleSalesPromptInput {
  script: SalesScriptDomain;
  aspectRatio?: string;
  productName: string;
  productSummary?: string;
  buyingPoints?: string[];
  selectedImages: readonly SalesImageRef[];
  beatBindings: readonly BeatProductImageBinding[];
  adaptedBeats?: readonly SalesAdaptedBeat[];
  actionReferences?: Record<number, { url: string; mediaType: 'image' | 'video'; label: string }>;
  scriptVideoReference?: { url: string; kind: 'depth' | 'source' };
  persona: SalesPersonaCandidate | null;
  customPersonaBodyUrl?: string;
  customPersonaFaceUrl?: string;
  scene: SalesSceneCandidate | null;
  customSceneImageUrl?: string;
  voiceModeOverride?: SalesBeatVoiceMode;
  presentationMode?: SalesPresentationMode;
  imitationMode?: SalesImitationMode;
}

export interface AssembledSalesPrompt {
  references: SalesReferenceSlot[];
  jimengPrompt: string;
  enginePrompt: string;
  narrationText: string;
  subtitles: Array<{ index: number; start: number; end: number; text: string }>;
  spokenCharCount: number;
  estimatedSpeakSec: number;
  effectiveVoiceMode: SalesBeatVoiceMode;
  presentationMode: SalesPresentationMode;
  imitationMode: SalesImitationMode;
  sanitizedNoiseTerms: string[];
  warnings: string[];
}

const CN_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十', '十一', '十二'];
const cnOrdinal = (idx: number) => CN_NUMS[idx] || String(idx + 1);

const VIDEO_NOISE_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: '价格促销字样', pattern: /(?:到手价|促销价|立减|满减|券后|￥\s*\d+|¥\s*\d+)/g },
  { label: '尺码表参数', pattern: /(?:尺码表|衣长\s*\d+|胸围\s*\d+|肩宽\s*\d+|袖长\s*\d+)/g },
  { label: '货号编码', pattern: /(?:货号[:：]?\s*[A-Za-z0-9-]+|SKU[:：]?\s*[A-Za-z0-9-]+)/gi },
  { label: '花字/贴纸指令', pattern: /(?:画面出现大字|弹出字幕贴纸|屏幕打字|顶部横幅文字)/g },
];

function fmtMmSs(sec: number): string {
  const ticks = Math.round(Math.max(0, sec) * 10);
  const whole = Math.floor(ticks / 10);
  const mins = String(Math.floor(whole / 60)).padStart(2, '0');
  const secs = String(whole % 60).padStart(2, '0');
  return `${mins}:${secs}${ticks % 10 ? `.${ticks % 10}` : ''}`;
}

export function sanitizeVideoMotionText(
  text: string,
  script: SalesScriptDomain,
  productName: string,
  removedTerms?: Set<string>,
  preserveProductPlaceholders = false,
): string {
  let out = text;
  const fallback = productName.trim() || '当前商品';
  for (const item of script.sourceExclusions) {
    for (const part of item.term.split(/[、，,/；;\s]+/)) {
      const term = part.trim();
      if (term.length >= 2 && out.includes(term) && !fallback.includes(term)) {
        removedTerms?.add(term);
        out = out.split(term).join(item.type === 'product' ? fallback : '');
      }
    }
  }
  for (const rule of VIDEO_NOISE_PATTERNS) {
    if (rule.pattern.test(out)) {
      removedTerms?.add(rule.label);
      out = out.replace(rule.pattern, '');
    }
    rule.pattern.lastIndex = 0;
  }
  return out
    .replace(/\{\{商品[^}]*\}\}/g, (placeholder) => preserveProductPlaceholders ? placeholder : fallback)
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function assembleSalesVideoPrompt(input: AssembleSalesPromptInput): AssembledSalesPrompt {
  const { script, selectedImages, beatBindings, adaptedBeats = [] } = input;
  const warnings: string[] = [];
  const sanitizedSet = new Set<string>();
  const presentationMode: SalesPresentationMode = input.presentationMode || 'subtitled_intro';
  const imitationMode: SalesImitationMode = input.imitationMode || 'script_only';
  const effectiveVoiceMode: SalesBeatVoiceMode = presentationMode === 'clean_visual'
    ? 'none'
    : input.voiceModeOverride
      || (script.voiceMode === 'voiceover' ? 'voiceover' : script.voiceMode === 'none' ? 'none' : 'speech');

  const references: SalesReferenceSlot[] = [];
  const urlToSlot = new Map<string, SalesReferenceSlot>();
  const addSlot = (
    url: string,
    kind: SalesReferenceSlot['kind'],
    label: string,
    view?: SalesProductImageView,
    mediaType: 'image' | 'video' = 'image',
  ): SalesReferenceSlot | null => {
    const clean = url.trim();
    if (!clean) return null;
    const existing = urlToSlot.get(clean);
    if (existing) {
      if (existing.kind !== kind && !existing.roles?.includes(kind)) existing.roles = [...(existing.roles || [existing.kind]), kind];
      return existing;
    }
    const slotIndex = references.length + 1;
    const slot: SalesReferenceSlot = {
      slotIndex,
      mixedToken: `{{Mixed ${slotIndex}}}`,
      apiToken: `${mediaType === 'video' ? '视频' : '图片'}${references.filter((r) => (r.mediaType || 'image') === mediaType).length + 1}`,
      mediaType,
      kind,
      label,
      url: clean,
      ...(view ? { view } : {}),
    };
    references.push(slot);
    urlToSlot.set(clean, slot);
    return slot;
  };

  let personaHeader = '';
  const presence = script.assetSlots.persona.presence;
  const customBody = input.customPersonaBodyUrl?.trim() || '';
  const customFace = input.customPersonaFaceUrl?.trim() || '';
  const customPersona = Boolean(customBody || customFace);
  const persona = customPersona ? null : input.persona;
  const handsOnly = presence === 'hands_only';
  const identityUrl = persona?.identityUrl?.trim() || '';
  const bodyUrl = customPersona ? customBody : (persona?.fullBodyUrl || '').trim();
  const faceUrl = customPersona ? customFace : (persona?.faceUrl || persona?.avatarUrl || '').trim();
  if (presence !== 'none' && (script.assetSlots.persona.required || identityUrl || bodyUrl || faceUrl)) {
    const name = customPersona ? '自定义人物' : persona?.name || '出镜人物';
    const identitySlot = addSlot(identityUrl, 'persona_identity', `${handsOnly ? '手部原图' : '人物原图'}（${name}）`);
    const bodySlot = addSlot(bodyUrl, 'persona_body', `${handsOnly ? '手部形象' : '人物主体形象'}（${name}）`);
    const faceSlot = !handsOnly && faceUrl && faceUrl !== bodyUrl
      ? addSlot(faceUrl, 'persona_face', `人物人脸参考（${name}）`) : null;
    if (handsOnly) {
      const handAnchor = identitySlot || bodySlot;
      personaHeader = `仅手部出镜${handAnchor ? `，手部形态与肤色参考 ${handAnchor.mixedToken} 中可见的手部` : ''}，不新增人脸或全身模特`;
      if (!handAnchor) warnings.push('手部展示脚本尚未绑定手部或包含手部的主体参考图；人脸图不能替代手部锚点。');
    } else if (identitySlot) {
      personaHeader = `唯一出镜人物（${name}）：原始人物主图 ${identitySlot.mixedToken} 为唯一身份依据，保持其脸型、五官比例与相对位置、年龄感、发际线和可见辨识特征，肤色、眉眼与唇色及妆容浓淡同样以该原图为准`;
      if (bodySlot && bodySlot !== identitySlot) personaHeader += `；${bodySlot.mixedToken} 仅补充身形、体态和视角`;
      if (faceSlot && faceSlot !== identitySlot) personaHeader += `；${faceSlot.mixedToken} 仅补充面部角度与细节，不覆盖原图的妆容、肤色与皮肤纹理`;
      personaHeader += '；补图与原始主图冲突时以原始主图为准，不用派生补图重定义身份或混合五官，各段保持同一人物。原片的柔化和曝光仅作为摄影处理，不改变身份';
    } else if (bodySlot || faceSlot) {
      const faceAnchor = faceSlot || bodySlot!;
      personaHeader = `唯一出镜人物（${name}）：人脸身份以 ${faceAnchor.mixedToken} 为唯一依据，保持其脸型、五官比例与相对位置、年龄感、发际线和可见辨识特征，肤色、眉眼与唇色及妆容浓淡以该人脸锚点为准`;
      personaHeader += bodySlot && faceSlot
        ? `；身形与体态参考 ${bodySlot.mixedToken}，该图中的脸不覆盖人脸锚点，不混合成另一张脸`
        : bodySlot ? `；身形与体态同样参考 ${bodySlot.mixedToken}` : '；仅有人脸参考，身形没有独立锚点，不借用商品图模特的身形';
      personaHeader += '；各段保持同一身份，不自动改变脸型、年龄感或美化五官，原片的柔化和曝光仅作为摄影处理';
    } else {
      warnings.push('当前脚本需要人物出镜，但尚未绑定带参考图的人物资产，无法锁定所选人物身份。');
      personaHeader = '出镜人物身份未绑定，不从商品图、场景图或动作素材中借用人物身份';
    }
  }

  const productSlots: SalesReferenceSlot[] = [];
  // Selection defines the submitted references; beat bindings only choose each segment's focus.
  for (const image of selectedImages) {
    const viewLabel = image.view ? SALES_IMAGE_VIEW_LABELS[image.view] : '主图';
    const slot = addSlot(image.url, 'product', `商品${viewLabel}（#${image.index + 1}）`, image.view);
    if (slot && !productSlots.includes(slot)) productSlots.push(slot);
  }
  for (const binding of beatBindings) {
    if (binding.requiredView !== 'any' && !binding.exactViewMatch) {
      const missingName = SALES_IMAGE_VIEW_LABELS[binding.requiredView];
      const msg = `第 ${binding.beatIndex + 1} 段需要商品「${missingName}」参考图，当前未标注对应视角图，已暂用主参考图兜底。`;
      if (!warnings.includes(msg)) warnings.push(msg);
    }
  }
  if (!productSlots.length) {
    warnings.push('尚未选择任何商品参考图，请先返回「商品与卖点」勾选至少 1 张商品图。');
  }

  const scene = input.customSceneImageUrl?.trim() ? null : input.scene;
  const sceneUrl = (input.customSceneImageUrl || scene?.coverUrl || '').trim();
  const sceneSlot = addSlot(sceneUrl, 'scene', `场景参考（${input.customSceneImageUrl ? '自定义实景' : scene?.title || '拍摄环境'}）`);
  if ((scene || input.customSceneImageUrl?.trim()) && !sceneSlot) warnings.push('所选场景尚未绑定可用场景参考图，请先补充场景主图，避免生成时自行编造环境。');

  const productLabel = input.productName.trim() || '当前商品';
  const productRefSummary = productSlots.length
    ? productSlots.map((s) => `商品${s.view ? SALES_IMAGE_VIEW_LABELS[s.view] : '外观'} ${s.mixedToken}`).join('、')
    : productLabel;

  const sceneDescParts = [
    input.customSceneImageUrl ? '上传实景图中的环境' : scene?.title,
    scene?.description,
    script.assetSlots.scene.categoryTags.join('、'),
  ].filter(Boolean);
  const sceneDesc = sceneDescParts[0] || '与参考脚本空间类型相符的拍摄环境';
  const clean = (text: string) => sanitizeVideoMotionText(text, script, productLabel, sanitizedSet);
  const lighting = clean(script.visualSpec.lighting) || clean(scene?.lighting || '') || '保持当前环境中一致的光源方向与曝光';
  const styleSummary = clean(script.visualSpec.styleSummary) || '沿用参考脚本已记录的摄影质感';
  const cutSummary = script.visualSpec.oneTake
    ? '一镜到底（全程不切镜，机位和镜头运动按各动作段记录执行，人物动作不等于镜头运动）'
    : '按真实镜头边界剪辑，同一镜头内的动作段连续衔接、不额外切镜';
  const moodText = clean(script.visualSpec.moodTags.join('、')) || '沿用参考脚本的情绪和节奏';

  const adaptedByIndex = new Map(adaptedBeats.map((b) => [b.index, b]));
  const summaryTransitions: string[] = [];
  const beatBlocks: string[] = [];
  const spokenLines: string[] = [];
  const subtitles: Array<{ index: number; start: number; end: number; text: string }> = [];
  let hasActionReference = false;

  let flatIdx = 0;
  script.shots.forEach((shot, shotIndex) => {
    shot.beats.forEach((beat, beatIndex) => {
      const adapted = adaptedByIndex.get(flatIdx);
      const adaptedAction = adapted?.action?.trim();
      const binding = beatBindings[flatIdx];
      const boundSlot = (binding?.image && urlToSlot.get(binding.image.url)) || productSlots[0] || null;
      const rawAction = adaptedAction || beat.actionTemplate || beat.action;
      const cleanAction = sanitizeVideoMotionText(rawAction, script, productLabel, sanitizedSet);
      summaryTransitions.push(cleanAction.replace(/[。；]+$/, ''));

      const segTitle = clean(shot.summary || beat.shows || '核心卖点展示');
      const segPrefix = script.visualSpec.oneTake ? `动作段${cnOrdinal(flatIdx)}` : `镜头${cnOrdinal(shotIndex)}·动作段${cnOrdinal(beatIndex)}`;
      const block = [
        `${segPrefix}（${fmtMmSs(beat.start)} - ${fmtMmSs(beat.end)}）｜ ${segTitle}`,
        `• 画面风格：${styleSummary}，${lighting}。`,
      ];
      if (sceneSlot) block.push(`• 拍摄空间：沿用 ${sceneSlot.mixedToken} 的同一真实空间、门窗位置与陈设关系；人物动作和接触阴影落在该空间中。`);
      const subject = clean(adapted?.subject?.trim() || (!adaptedAction ? beat.subject : ''));
      if (subject) {
        block.push(`• 主体状态：${subject}${boundSlot ? `（商品参考 ${boundSlot.mixedToken}）` : ''}。`);
      }
      block.push(`• 动作描述：${cleanAction}${boundSlot ? `，清晰还原 ${boundSlot.mixedToken} 的款式、色彩与材质细节` : ''}。`);
      const scriptVideo = imitationMode === 'depth_imitation' ? input.scriptVideoReference : undefined;
      const beatActionCandidate = input.actionReferences?.[flatIdx];
      const actionRef = scriptVideo
        ? { url: scriptVideo.url, mediaType: 'video' as const, label: scriptVideo.kind === 'depth' ? '脚本关联深度视频' : '脚本原参考视频' }
        : beatActionCandidate && (imitationMode === 'depth_imitation' || beatActionCandidate.mediaType === 'image')
          ? beatActionCandidate
          : undefined;
      const actionSlot = actionRef ? addSlot(actionRef.url, 'action', actionRef.label, undefined, actionRef.mediaType) : null;
      if (actionSlot) {
        hasActionReference = true;
        const interval = scriptVideo ? ` 在 ${fmtMmSs(beat.start)} - ${fmtMmSs(beat.end)} 对应片段` : '';
        const motionScope = actionSlot.mediaType === 'video'
          ? '姿态、动作幅度、起止位置、速度变化、停顿与空间关系'
          : '姿态、构图与空间关系；动作过程和时间节奏以脚本描述为准，不从静态图推断';
        block.push(`• 动作参考：参照 ${actionSlot.mixedToken}${interval} 的${motionScope}；人物外貌、商品和场景实体以已绑定的对应资产为准，最终输出正常彩色视频。`);
        if (scriptVideo?.kind === 'source') {
          block.push('• 原视频同时提供摄影画风参考：继承其曝光、白平衡、光影反差、景深、细节呈现方式和运动成像质感；不沿用原片人物、商品、字幕、品牌或声音。');
        } else if (scriptVideo?.kind === 'depth') {
          block.push('• 深度动作素材仅约束几何、姿态和运动，不提供色彩、光线或肤质参考，也不能代替细微眼神与唇形时序；表情按本段独立描述执行，不把深度灰度与伪彩渲染到成片；摄影画风按脚本视觉描述执行。');
        } else {
          block.push('• 逐段动作素材仅约束上述姿态或运动，不继承其中人物、商品、场景与画风；摄影画风按脚本视觉描述执行。');
        }
      }
      const camera = clean(beat.camera || script.visualSpec.cameraFeel);
      block.push(`• 镜头变化：${clean(beat.shotSize)}${camera ? `，${camera}` : ''}。`);
      // Source scenery and old adapted performance cannot safely be replayed
      // after entity replacement; adapted performance is carried independently.
      if (!adaptedAction && !scene && !input.customSceneImageUrl?.trim()) {
        if (beat.scene) block.push(`• 段落空间与光线关系：${clean(beat.scene)}。`);
      }
      const sourcePerformanceAllowed = !adaptedAction && !scene && !input.customSceneImageUrl?.trim();
      const expression = adapted?.expression ?? (!adaptedAction ? beat.expression : '');
      const transition = adapted?.transition ?? (sourcePerformanceAllowed ? beat.transition : '');
      if (expression) block.push(`• 眼神表情：${clean(expression)}。`);
      if (transition) block.push(`• 段落衔接：${clean(transition)}。`);
      if (adaptedAction && ((beat.expression && adapted?.expression === undefined) || (beat.transition && adapted?.transition === undefined))) {
        warnings.push(`动作段 ${flatIdx + 1} 的旧改编未独立记录表情或衔接，请重新自动适配商品或补充相应字段；旧动作已保留。`);
      }
      if (presentationMode === 'subtitled_intro') {
        const line = (adapted?.spokenLine ?? '').trim();
        if (effectiveVoiceMode !== 'none' && line) {
          spokenLines.push(line);
          if (effectiveVoiceMode === 'speech') {
            block.push(`• 人物口播：「${line}」（自然口语神态与口型同步）。`);
          } else {
            block.push(`• 画外旁白对应节点：「${line}」（画面人物专注展示，不张嘴说话）。`);
          }
        }
        const sub = (adapted?.subtitle ?? '').trim();
        if (sub) {
          subtitles.push({ index: flatIdx, start: beat.start, end: beat.end, text: sub });
        }
      }
      beatBlocks.push(block.join('\n'));
      flatIdx += 1;
    });
  });

  if (imitationMode === 'depth_imitation' && !hasActionReference) {
    warnings.push(input.scriptVideoReference
      ? '脚本关联深度视频尚未就绪，请回素材库继续处理，或切换为「仅按脚本」。'
      : '已开启「深度视频模仿」模式，但当前尚未为分镜段绑定深度动作视频或深度图，请在深度动作区选择或上传转换。');
  }

  const narrationText = spokenLines.join(' ');
  const spokenCharCount = spokenLines.join('').replace(/[\s，。！？、；：“”‘’,.!?;:"'()（）-]/g, '').length;
  const targetCps = script.assetSlots.audio.targetCps > 0 ? script.assetSlots.audio.targetCps : 3.8;
  const estimatedSpeakSec = spokenCharCount > 0 ? Math.round((spokenCharCount / targetCps) * 10) / 10 : 0;
  if (effectiveVoiceMode !== 'none' && spokenCharCount > 0 && spokenCharCount / Math.max(1, script.durationSec) > 4.6) {
    warnings.push(`当前台词共 ${spokenCharCount} 字，超过 ${script.durationSec} 秒自然语速上限（建议精简到 ${Math.floor(script.durationSec * 4.0)} 字以内，避免 AI 语音加速发假）。`);
  }

  const subjectLead = personaHeader
    ? `${personaHeader}；展示商品「${productLabel}」（${productRefSummary}，严格保持款式、颜色、材质与结构一致）。`
    : `展示商品主体「${productLabel}」（${productRefSummary}，严格保持款式、颜色、材质与结构一致）。`;
  const sceneLead = sceneSlot
    ? `场景参考 ${sceneSlot.mixedToken}，位于${sceneDesc}；该图为唯一拍摄空间依据，保持可见的门窗、墙地面材质、陈设位置、空间尺度与透视关系；脚本及其他素材中残留的原地点、背景和陈设不覆盖该图。摄影画风与打光优先按参考脚本执行，并适配该空间已有的光源方位，不为复制原片光线重建原片场景。`
    : `场景位于${sceneDesc}。`;

  const audioFooter = presentationMode === 'clean_visual'
    ? '声音与成片要求：纯视觉展示模式，画面人物不张嘴说话，但保留参考已有的轻微张唇、换气与自然表情，不强制全程闭嘴、不新增连续说话式口型；生成纯净无字画面供后期混入无版权商用 BGM；严禁画面出现任何字幕、尺码表、价格贴纸、水印或无关品牌标识。'
    : effectiveVoiceMode === 'speech'
      ? `声音与成片要求：人物自然口语口播${narrationText ? `（台词：「${narrationText}」）` : ''}，不自带杂乱背景音乐（后期混入无版权商用 BGM）；无画面字幕、无水印、无无关品牌标识。`
      : effectiveVoiceMode === 'voiceover'
        ? '声音与成片要求：画面人物不张嘴说话（无口播口型），保留参考已有的轻微张唇与自然表情，不强制全程闭嘴；生成纯净环境画面，供后期合成音色库画外旁白与无版权商用 BGM；无画面字幕、无水印、无无关品牌标识。'
        : '声音与成片要求：无人物口播，保留参考已有的轻微张唇与自然表情，不强制全程闭嘴、不新增连续说话式口型；生成纯净画面供后期混入无版权商用 BGM；无画面字幕、无水印、无无关品牌标识。';

  const jimengPrompt = [
    `画面描述：${subjectLead}${sceneLead}`,
    presence === 'none' ? '人物范围：纯商品展示，不新增模特、人脸或手部。' : '',
    '素材角色：商品参考只提供商品款式、颜色、材质与使用或穿着结构，不提供其中模特的人脸、发型、年龄或身形；场景图只提供空间；原视频与动作素材只提供已声明的摄影或动作信息，不提供人物身份、妆容或肤色。若同一图片也被明确指定为人物锚点，仅按对应身份指令使用。',
    presence !== 'none' ? '人物成像优先级：原片或脚本中提及的美肤、美颜滤镜仅作为原片观察，不作为二次磨皮、加妆、放大眼睛或瘦脸的生成要求；当前人物原图的肤质与妆容优先。' : '',
    `动作与镜头：${input.aspectRatio === 'adaptive' ? '跟随参考图比例' : `${input.aspectRatio || script.visualSpec.aspectRatio} 画幅`}，${styleSummary}，${lighting}。${cutSummary}：${summaryTransitions.slice(0, 5).join('；')}${script.visualSpec.cameraFeel ? `。运镜质感：${clean(script.visualSpec.cameraFeel)}` : ''}。`,
    '画风与动作保持：保留参考摄影中有依据的明暗层次、景深和运动速度；肤质与可见辨识特征以人物锚点为准，商品结构与材质以商品图为准，不自动套用资产图的修图、磨皮或棚拍打光。面部、手部与场景接受同一方向和色温的光照，保留皮肤纹理、眼睑与唇部的自然结构和接触阴影；不加厚眼线、睫毛、腮红或唇部高光，不把一张参考表情冻结全片或逐段重置妆容。表情按时间段起落，不以持续甜笑或夸大挤眼代替；普通眨眼闭合后及时复睁，垂眼不等于闭眼停留，除本段明确记录闭眼动作外不因微笑而持续闭眼。发生手物接触时，保留接触、带动、停顿、松开后的惯性顺序；不额外扩大幅度、慢放或增加运镜。',
    `氛围与情绪：${moodText}。`,
    '',
    ...beatBlocks,
    `结束衔接：按最后动作段记录的末表情与收势结束；若生成时长超过脚本 ${fmtMmSs(script.durationSec)}，仅延续末姿势、呼吸和材质自然回落，不重复起手或自行追加微笑、挤眼、挥手、前倾靠近及镜头推拉。`,
    '',
    audioFooter,
  ].join('\n');

  let enginePrompt = jimengPrompt;
  for (const slot of references) {
    enginePrompt = enginePrompt.split(slot.mixedToken).join(slot.apiToken);
  }

  return {
    references,
    jimengPrompt,
    enginePrompt,
    narrationText,
    subtitles,
    spokenCharCount,
    estimatedSpeakSec,
    effectiveVoiceMode,
    presentationMode,
    imitationMode,
    sanitizedNoiseTerms: [...sanitizedSet],
    warnings,
  };
}
