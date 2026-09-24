export type SlotSource = 'group_skeleton' | 'architecture' | 'fallback';

export interface SlotPersona {
  id?: string;
  code?: string;
  name?: string;
  description?: string;
  reversePrompt?: string | null;
}

export interface SlotScene {
  id?: string;
  code?: string;
  title?: string;
  description?: string;
  lighting?: string | null;
  reversePrompt?: string | null;
}

export interface SlotOutfit {
  id?: string;
  code?: string;
  title?: string;
  top?: string;
  bottom?: string;
  shoes?: string;
  colorPalette?: string | null;
  reversePrompt?: string | null;
}

export interface SlotAction {
  id?: string;
  code?: string;
  title?: string;
  action?: string;
  camera?: string | null;
  shotType?: string;
  has_human?: boolean;
  reversePrompt?: string | null;
}

export interface GroupShotSkeleton {
  shot_no?: number;
  title?: string;
  prompt?: string;
  scene?: string;
  action?: string;
  optics?: string;
  camera_focal_length?: string;
  angle?: string;
  lighting_type?: string;
  has_human?: boolean;
  shot_type?: string;
}

export interface SlotAssets {
  personas?: SlotPersona[];
  scenes?: SlotScene[];
  outfits?: SlotOutfit[];
  actions?: SlotAction[];
}

export interface ProductSentence {
  shotNo: number;
  sentence: string;
}

export interface FilledShotSlot {
  shotNo: number;
  title: string;
  scene: string;
  action: string;
  camera: string;
  optics: string;
  angle: string;
  lighting: string;
  shotType?: string;
  hasHuman: boolean;
  persona?: SlotPersona;
  outfit?: SlotOutfit;
  sceneAsset?: SlotScene;
  actionAsset?: SlotAction;
  productSentence: string;
  sourcePrompt: string;
  usedAssetLibrary: boolean;
  cameraFromAsset: boolean;
  cameraRewritten: boolean;
  source: SlotSource;
}

export interface AssembleSlotsInput {
  shotCount?: number;
  assets?: SlotAssets;
  lockedGroupShots?: GroupShotSkeleton[] | null;
  visionProductSentences?: ProductSentence[];
  personaMode?: 'asset_driven' | 'none';
}

export interface AssembleSlotsResult {
  shots: FilledShotSlot[];
  usedAssetLibrary: boolean;
  source: SlotSource;
  shotCount: number;
}

const PRESET_ID = /^preset-/i;
const PRODUCT_HINT = /@图片\s*1|佩戴 @图片|穿着 @图片|手持 @图片|受光|光泽/;

export function isPublishedLibraryAsset(id?: string | null): boolean {
  const value = String(id || '').trim();
  return Boolean(value) && !PRESET_ID.test(value);
}

export function parseGroupShotSkeleton(json: unknown): GroupShotSkeleton[] {
  const raw = typeof json === 'string' ? safeParse(json) : json;
  if (!Array.isArray(raw)) return [];
  const shots: GroupShotSkeleton[] = [];
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object') return;
    const shot = item as Record<string, unknown>;
    shots.push({
      shot_no: Number(shot.shot_no) || index + 1,
      title: text(shot.title),
      prompt: text(shot.prompt),
      scene: text(shot.scene),
      action: text(shot.action),
      optics: text(shot.optics),
      camera_focal_length: text(shot.camera_focal_length),
      angle: text(shot.angle) || sourcePromptSection(text(shot.prompt), '构图镜头'),
      lighting_type: text(shot.lighting_type) || sourcePromptSection(text(shot.prompt), '光影'),
      has_human: typeof shot.has_human === 'boolean' ? shot.has_human : undefined,
      shot_type: text(shot.shot_type) || undefined,
    });
  });
  return shots;
}

/** 四张原图是不可改写的主线；延展镜头只从同组机位/动作派生。 */
export function expandGroupShotSkeleton(shots: GroupShotSkeleton[], requestedCount: number): GroupShotSkeleton[] {
  const originals = shots.slice(0, 4);
  if (originals.length !== 4 || requestedCount <= 4) return originals;
  const variations = [
    { title: '主体细节补镜', action: '保持原动作和商品位置，补拍主体与商品的细节关系', angle: '在原机位收紧景别，突出商品与人物或承托面的接触细节' },
    { title: '交互过程补镜', action: '延续原动作的下一瞬间，不新增人物、商品或道具', angle: '原机位小幅侧移，保留同一空间关系' },
    { title: '质感特写补镜', action: '保持商品外观和摆放方向，记录材质、受光与局部结构', angle: '在原构图内向商品局部推进，不改变商品形态' },
    { title: '内容收束补镜', action: '延续原图组的最终动作或静物陈列，形成自然收束', angle: '沿用原组收尾机位，保留场景与主体的相对位置' },
  ];
  const extra = variations.map((variation, index) => {
    const source = originals[index];
    return {
      ...source,
      shot_no: index + 5,
      title: `${source.title || `镜头 ${index + 1}`} · ${variation.title}`,
      action: `${source.action || ''}；${variation.action}`,
      angle: `${source.angle || ''}；${variation.angle}`,
      prompt: source.prompt,
    };
  });
  return [...originals, ...extra].slice(0, Math.min(8, requestedCount));
}

export function clipProductSentence(textValue: string): string {
  const cleaned = String(textValue || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const clauses = cleaned.split(/[；;。]/).map((part) => part.trim()).filter(Boolean);
  const kept = clauses.filter((clause) => PRODUCT_HINT.test(clause));
  if (kept.length === 0) return '';
  return kept.join('；').slice(0, 120);
}

export function extractProductSentences(vision: {
  prompts?: Array<{ shot_no?: number; product_sentence?: string; prompt?: string }>;
} | null | undefined): ProductSentence[] {
  return (vision?.prompts || []).map((item, index) => ({
    shotNo: Number(item.shot_no) || index + 1,
    sentence: clipProductSentence(item.product_sentence || item.prompt || ''),
  }));
}

export function assembleStoryboardSlots(input: AssembleSlotsInput): AssembleSlotsResult {
  const assets = input.assets || {};
  const persona = first(assets.personas);
  const scene = first(assets.scenes);
  const outfit = first(assets.outfits);
  const actions = Array.isArray(assets.actions) ? assets.actions : [];
  const groupShots = (input.lockedGroupShots || []).filter(Boolean);
  const usedAssetLibrary = [persona, scene, outfit, ...actions].some((item) => isPublishedLibraryAsset(item?.id));
  const source: SlotSource = groupShots.length
    ? 'group_skeleton'
    : usedAssetLibrary
      ? 'architecture'
      : 'fallback';
  const shotCount = groupShots.length || Math.max(1, Math.min(12, Number(input.shotCount) || 4));
  const sentences = new Map((input.visionProductSentences || []).map((item) => [item.shotNo, item.sentence]));

  const shots = Array.from({ length: shotCount }, (_, index) => {
    const group = groupShots[index];
    const action = source === 'group_skeleton' ? actionFromGroup(group, actions[index]) : actions[index];
    const camera = text(group?.camera_focal_length) || text(action?.camera);
    const hasHuman = resolveHasHuman(input.personaMode, group, action, persona);
    return {
      shotNo: index + 1,
      title: text(group?.title) || text(action?.title) || `分镜 ${index + 1}`,
      scene: sceneText(scene, group),
      action: text(group?.action) || text(action?.action) || text(action?.reversePrompt),
      camera,
      optics: text(group?.optics),
      angle: text(group?.angle) || text(action?.title),
      lighting: text(group?.lighting_type) || text(scene?.lighting),
      shotType: text(group?.shot_type) || text(action?.shotType) || undefined,
      hasHuman,
      persona: hasHuman ? persona : undefined,
      outfit: hasHuman ? outfit : undefined,
      sceneAsset: scene,
      actionAsset: action,
      productSentence: sentences.get(index + 1) || '',
      sourcePrompt: text(group?.prompt),
      usedAssetLibrary,
      cameraFromAsset: Boolean(camera || action?.shotType),
      cameraRewritten: false,
      source,
    } satisfies FilledShotSlot;
  });

  return { shots, usedAssetLibrary, source, shotCount };
}

/** Extract physical shot structure from the reverse prompt; product identity stays bound to @图片1. */
export function sourcePromptSection(prompt: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = prompt.match(new RegExp(`【${escaped}】\\s*([\\s\\S]*?)(?=\\n?【[^】]+】|$)`));
  return match?.[1]?.trim() || '';
}

export function buildTransferableGroupDetails(prompt: string, replaceScene = false, isExpansion = false): string {
  const headings = [
    '动作或摆放',
    ...replaceScene ? [] : ['场景结构', '光影'],
    ...isExpansion ? [] : ['构图镜头'],
  ];
  const details = headings.map((heading) => {
    const value = sourcePromptSection(prompt, heading);
    return value ? `【${heading}】${value}` : '';
  }).filter(Boolean);
  return details.join('\n');
}

export function fillProductSentences(
  result: AssembleSlotsResult,
  sentences: ProductSentence[],
): AssembleSlotsResult {
  const map = new Map(sentences.map((item) => [item.shotNo, item.sentence]));
  return {
    ...result,
    shots: result.shots.map((shot) => ({
      ...shot,
      productSentence: map.get(shot.shotNo) || shot.productSentence,
    })),
  };
}

export function maybeApplyJewelryCameraFallback(input: {
  isJewelry: boolean;
  cameraFromAsset: boolean;
  camera: string;
  angle: string;
  action: string;
}): { camera: string; angle: string; action: string; rewritten: boolean } {
  if (!input.isJewelry || input.cameraFromAsset) {
    return { camera: input.camera, angle: input.angle, action: input.action, rewritten: false };
  }
  const angle = input.angle
    .replace(/(全景|远景|全身站立|全身照|全身|长廊)+/g, '胸部以上中近景')
    .replace(/门廊前远景全景/g, '门廊前半身近镜头');
  const action = input.action.replace(
    /(在[^\s，；;]*大步奔跑|大步快跑|跳跃奔跑|全速奔跑|跑动|路边蹲姿|坐在石阶|微模糊的复古跑动|门廊前远景全景展示)[^，；;]*/g,
    '桌前优雅倚靠，手部自然依托台面，半身近镜头展露佩戴首饰',
  );
  const wide = /广角|全景|24mm|35mm/.test(input.camera) && !input.camera.includes('微距');
  return {
    camera: wide ? 'iPhone 85mm 人像中近景镜头' : input.camera,
    angle,
    action,
    rewritten: wide || angle !== input.angle || action !== input.action,
  };
}

export function buildProductOnlyVisionPrompt(input: {
  productTitle?: string;
  productProps?: unknown;
  shotCount: number;
  templateStyle?: string;
  slots: FilledShotSlot[];
}): string {
  const title = input.productTitle || '指定商品';
  const props = input.productProps && typeof input.productProps === 'object'
    ? Object.entries(input.productProps as Record<string, unknown>)
        .map(([key, value]) => `  • ${key}: ${value}`)
        .join('\n')
    : '';
  const locked = input.slots[0];
  const actions = input.slots
    .map((shot) => `${shot.shotNo}. ${shot.title}｜动作：${shot.action || '（架构槽位）'}｜机位：${shot.camera || shot.angle || '保持资产机位'}`)
    .join('\n');
  return `# Role: 商品外观校对员
已选定场景、穿搭、人设与镜头槽位。你只看 @图片1，补「商品如何佩戴/摆放、受光落在哪」一句。
禁止改写场景、穿搭、人设、动作、机位、景别。
## 商品
- 标题：${title}${props ? `\n- 规格：\n${props}` : ''}
## 已锁定槽位（只读）
- 场景：${locked?.scene || '由拍摄架构决定'}
- 穿搭：${locked?.outfit?.reversePrompt || [locked?.outfit?.top, locked?.outfit?.bottom].filter(Boolean).join(' / ') || '由资产决定'}
- 人设：${locked?.persona?.name || '由资产或纯商品规则决定'}
${actions}
${input.templateStyle ? `## 拍摄架构（槽位约束，禁止当创作文案重写）\n${input.templateStyle}\n` : ''}
输出合法 JSON：
{"product_fingerprint":"品类词","product_role":"worn_apparel|worn_accessory|held_object|placed_object","prompts":[{"shot_no":1,"product_sentence":"佩戴/摆放 @图片1 与受光一句"}]}
prompts 长度必须为 ${input.shotCount}。`;
}

function first<T>(items?: T[]): T | undefined {
  return Array.isArray(items) && items.length > 0 ? items[0] : undefined;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function sceneText(scene?: SlotScene, group?: GroupShotSkeleton): string {
  if (text(group?.scene)) return text(group?.scene);
  if (scene?.reversePrompt || scene?.description) {
    return [scene.title, scene.reversePrompt || scene.description].filter(Boolean).join('，');
  }
  return text(group?.scene);
}

function actionFromGroup(group?: GroupShotSkeleton, fallback?: SlotAction): SlotAction | undefined {
  if (!group && !fallback) return undefined;
  return {
    id: fallback?.id,
    code: fallback?.code,
    title: text(group?.title) || fallback?.title,
    action: text(group?.action) || fallback?.action,
    camera: text(group?.camera_focal_length) || fallback?.camera,
    shotType: text(group?.shot_type) || fallback?.shotType,
    has_human: group?.has_human ?? fallback?.has_human,
    reversePrompt: fallback?.reversePrompt,
  };
}

function resolveHasHuman(
  personaMode: AssembleSlotsInput['personaMode'],
  group?: GroupShotSkeleton,
  action?: SlotAction,
  persona?: SlotPersona,
): boolean {
  if (typeof group?.has_human === 'boolean') return group.has_human;
  if (typeof action?.has_human === 'boolean') return action.has_human;
  if (personaMode === 'none') return false;
  return Boolean(persona);
}
