import { isPlaceholderIdentity } from '@shared/domain/workshop/workshopPipeline';
export {
  OFFICIAL_REVERSE_SYSTEM_PROMPT,
  MIN_IMAGES_PER_SET,
  MAX_IMAGES_PER_SET,
} from '@shared/domain/assets/assetDeconstruct/prompts';
import type { ImageSetQueueItem } from './assetQueueTypes';
export type { ImageSetQueueItem } from './assetQueueTypes';

/** 英文底层标签 → 标准中文映射表 */
export const TAG_I18N_MAP: Record<string, string> = {
  // 珠宝配饰
  necklace: '项链',
  necklaces: '项链',
  earring: '耳环',
  earrings: '耳环',
  bracelet: '手镯',
  bracelets: '手镯',
  bangle: '手镯',
  ring: '戒指',
  rings: '戒指',
  hairpin: '发簪',
  hairclip: '发夹',
  pendant: '吊坠',
  brooch: '胸针',
  jewelry: '珠宝首饰',
  jewellery: '珠宝首饰',
  accessory: '配饰',
  accessories: '配饰',

  // 服饰鞋包
  apparel: '服饰穿搭',
  clothing: '服饰穿搭',
  clothes: '服饰穿搭',
  dress: '连衣裙',
  skirt: '半身裙',
  jacket: '外套夹克',
  coat: '大衣外套',
  shirt: '衬衫',
  blouse: '衬衫',
  pants: '裤装',
  trousers: '长裤',
  sweater: '毛衣针织',
  knitwear: '柔美针织',
  bag: '箱包手袋',
  bags: '箱包手袋',
  handbag: '手提包',
  backpack: '双肩包',
  crossbody: '斜挎包',
  shoes: '鞋靴类目',
  boots: '靴子',
  sneakers: '运动鞋',
  heels: '高跟鞋',
  sandals: '凉鞋',

  // 美妆配饰
  beauty: '美妆香水',
  makeup: '精致妆容',
  lipstick: '唇妆口红',
  skincare: '护肤美体',
  perfume: '香氛香水',
  eyewear: '眼镜墨镜',
  glasses: '眼镜配饰',
  sunglasses: '太阳镜',
  hat: '帽子配饰',
  cap: '棒球帽',
  scarf: '丝巾围巾',

  // 场景空间与采光
  outdoor_nature: '户外自然',
  indoor_room: '室内空间',
  tea_space: '茶空间',
  courtyard: '庭院园林',
  street: '都市街景',
  car_interior: '车内空间',
  desk_office: '办公空间',
  garden: '自然花园',
  balcony: '阳台露台',
  studio: '摄影棚',
  cafe: '咖啡空间',
  beach: '海滨沙滩',
  modern: '现代极简',
  retro: '复古风',
  industrial: '工业风',
  natural_light: '自然采光',
  warm_light: '暖阳温光',

  // 风格与景别
  vintage: '复古风',
  french: '法式风格',
  chinese: '新中式',
  casual: '休闲日常',
  lifestyle: '生活感',
  portrait: '人像写真',
  macro: '特写微距',
  fullbody: '全身构图',
  halfbody: '半身机位',
  close_up: '近景特写',
};

/** 严禁在前端呈现的系统冗余词黑名单 */
export const SYSTEM_TAG_BLACKLIST = new Set([
  'all', 'default', 'custom', 'builtin', 'unknown', 'undefined', 'null', 'nan',
  'test', 'temp', 'cluster', 'cluster:1', 'cluster:2', 'cluster:3', 'cluster:4',
  'v1', 'v2', 'v3', 'image', 'prompt', 'none', 'asset', 'item', 'batch', 'tag', 'tags',
  'general', 'normal', 'other',
]);

/** 描述句判断正则：包含这些词说明是长描述句子，不是分类标签 */
const SENTENCE_PATTERN = /[，。、！？；;：:（）()[\]{}"'\\/]|营造|形成|带有|扎实|透入|投射|过暴|漫射|环境光|颗粒状|几何阴影|散射光|搭配|身穿|穿着|身着/;

/** 将标签标准化汉化，并彻底剔除 JSON 符号与系统无效词 */
export function normalizeTagToChinese(rawTag: string): string | null {
  if (!rawTag) return null;
  // 剥离首尾与内部的所有 JSON 残余字符
  let cleaned = rawTag.trim().replace(/^[\s"'[\]{}()]+|[\s"'[\]{}()]+$/g, '');
  cleaned = cleaned.replace(/["'[\]{}]+/g, '').trim();
  
  // 标签必须是精炼的 2~6 字符短语（杜绝长句子伪充当标签）
  if (cleaned.length < 2 || cleaned.length > 6) return null;
  if (SENTENCE_PATTERN.test(cleaned)) return null;

  const lower = cleaned.toLowerCase();
  if (SYSTEM_TAG_BLACKLIST.has(lower) || lower === 'all') return null;
  if (lower.startsWith('cluster') || lower.startsWith('set_') || lower.startsWith('img_')) return null;

  // 1. 查表汉化
  if (TAG_I18N_MAP[lower]) {
    return TAG_I18N_MAP[lower];
  }

  // 2. 纯英文未匹配词汇，直接过滤以保证界面 100% 纯中文
  if (/^[a-zA-Z_-]+$/.test(cleaned)) {
    return null;
  }

  // 3. 如果仍含有残留的符号，过滤掉
  if (/["'[\]{}\\]/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

/** 判断是否为适合在卡片顶部展示的高价值纯净短标签（严格限制 2~6 汉字，非句子非色系拼接） */
export function isValidDisplayTag(tag: string): boolean {
  if (!tag) return false;
  const cleaned = tag.trim();
  if (cleaned.length < 2 || cleaned.length > 6) return false;
  if (SENTENCE_PATTERN.test(cleaned)) return false;
  if (cleaned.includes('、') || cleaned.includes(',') || cleaned.includes('，')) return false;
  if (SYSTEM_TAG_BLACKLIST.has(cleaned.toLowerCase())) return false;
  return true;
}

/** 景别/机位英文枚举 → 中文短标签 */
export const SHOT_TYPE_LABELS: Record<string, string> = {
  close_up: '特写',
  close_up_three_quarter: '特写四分之三',
  medium_full_body: '半身全身',
  profile_half_body: '侧身半身',
  profile_45: '45°侧颜',
  low_angle_three_quarter_body: '低机位四分之三',
  high_angle_seated_full_body: '俯拍坐姿全身',
  high_angle_three_quarter_body: '俯拍四分之三',
  macro_detail: '微距细节',
  lifestyle_interaction: '生活互动',
  half_body: '半身',
};

/** 八维分析字段 → 中文标签 */
export const DIMENSION_LABELS: Record<string, string> = {
  subject: '主体内容',
  art_style: '艺术风格',
  color_scheme: '色彩方案',
  lighting: '光影设定',
  composition: '构图逻辑',
  material_texture: '材质质感',
  camera_language: '镜头语言',
  atmosphere: '氛围情绪',
  resolution_quality: '画质标准',
  lighting_type: '光型',
  depth_of_field: '景深',
  focal_length: '焦段',
  color_tone: '色调',
  season: '季节',
  time_of_day: '时段',
  sky_state: '天空状态',
  vegetation_water: '植被水体',
  perspective: '透视关系',
};

export function humanizeDimensionKey(key?: string | null): string {
  if (!key) return '';
  return DIMENSION_LABELS[key] || key.replace(/_/g, ' ');
}

/** 解析资产 dimensions 字段（JSON 字符串或对象） */
export function parseAssetDimensions(
  raw: unknown
): Array<{ key: string; label: string; value: string }> {
  let obj: Record<string, unknown> | null = null;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return [];
    }
  } else if (typeof raw === 'object' && raw !== null) {
    obj = raw as Record<string, unknown>;
  }
  if (!obj) return [];

  const orderedKeys = [
    'subject',
    'art_style',
    'color_scheme',
    'lighting',
    'composition',
    'material_texture',
    'camera_language',
    'atmosphere',
    'resolution_quality',
    'lighting_type',
    'focal_length',
    'depth_of_field',
    'color_tone',
    'season',
    'time_of_day',
    'sky_state',
    'vegetation_water',
    'perspective',
  ];

  const seen = new Set<string>();
  const entries: Array<{ key: string; label: string; value: string }> = [];

  for (const key of orderedKeys) {
    const value = obj[key];
    if (typeof value === 'string' && value.trim()) {
      entries.push({ key, label: humanizeDimensionKey(key), value: value.trim() });
      seen.add(key);
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    if (seen.has(key)) continue;
    if (typeof value === 'string' && value.trim()) {
      entries.push({ key, label: humanizeDimensionKey(key), value: value.trim() });
    }
  }

  return entries;
}

export function humanizeShotType(shotType?: string | null): string | null {
  if (!shotType) return null;
  return SHOT_TYPE_LABELS[shotType] || shotType.replace(/_/g, ' ');
}

export function humanizeImageType(imageType?: string | null): string | null {
  if (!imageType) return null;
  if (imageType === 'photography') return '摄影';
  if (imageType === 'landscape') return '风景';
  if (imageType === 'typography') return '文字设计';
  if (imageType === 'ui') return '界面设计';
  return '通用';
}

export function formatDeconstructSummary(item: ImageSetQueueItem): string {
  const stats = item.deconstructStats;
  const imageCount = item.images.length;
  const pass1Ok = stats?.pass1Succeeded ?? stats?.perImageCount ?? imageCount;
  const sceneCount =
    stats?.scenesAfterDedup ??
    stats?.scenesCount ??
    (Array.isArray(item.result?.scenes) ? item.result.scenes.length : 1);

  const fallbackHint =
    stats?.pipelineMode === 'fallback' ? '（降级补调）' : '';

  const visionHint =
    typeof stats?.visionCallCount === 'number'
      ? ` · 多模调用 ${stats.visionCallCount} 次${
          stats.visionModelsUsed?.length ? `（${stats.visionModelsUsed.join(' → ')}）` : ''
        }`
      : '';

  const failedHint =
    stats?.pass1Failed && stats.pass1Failed > 0
      ? `（图 ${(stats.pass1FailedIndices ?? []).join(',')} 失败）`
      : '';

  const skipped = stats?.skippedIncompleteImages || 0;
  const skippedHint = skipped ? `；${skipped} 张不足四图/下载不完整，未反推入库` : '';
  const groupHint = typeof stats?.fullPromptsCount === 'number' ? ` · 完整四图母本 ${stats.fullPromptsCount} 组` : '';
  const partialIcon = (stats?.pass1Failed && stats.pass1Failed > 0) || skipped ? '⚠️' : '✅';

  return ` · ${partialIcon} 成功解构入库 (单次反推 ${pass1Ok}/${imageCount}${failedHint}${skippedHint}${fallbackHint}${visionHint}${groupHint} · ${sceneCount} 个场景资产)`;
}

/** 人物博主 5 层原子结构 */
export interface PersonaLayers {
  hairStyle: string;     // 发型造型与长短
  hairColor: string;     // 原生发色
  faceFeatures: string;  // 脸型五官与骨相
  skinTexture: string;   // 肤质肌理与毛孔
  expression: string;    // 神态表情与情绪
}

/** 智能解析人物描述为 5 层标准化结构 */
export function parsePersonaLayers(text?: string | null): PersonaLayers {
  const raw = text || '';

  // 1. 发型造型
  let hairStyle = '高颅顶蓬松法式微卷中长发';
  if (raw.includes('低盘发') || raw.includes('发髻') || raw.includes('盘发')) {
    hairStyle = '饱满温婉古典低盘发髻/发包';
  } else if (raw.includes('短发') || raw.includes('齐肩')) {
    hairStyle = '清爽利落微层次齐肩短发';
  } else if (raw.includes('黑长直') || raw.includes('披肩长发')) {
    hairStyle = '轻盈柔顺质感黑长直发';
  } else if (raw.includes('卷发') || raw.includes('波浪')) {
    hairStyle = '高颅顶蓬松法式微卷波浪中长发';
  }

  // 2. 原生发色
  let hairColor = '原生黑茶色';
  if (raw.includes('金橘') || raw.includes('金橙') || raw.includes('橙发')) {
    hairColor = '温暖金橙色/金橘色';
  } else if (raw.includes('金发') || raw.includes('浅金')) {
    hairColor = '法式浅金棕色';
  } else if (raw.includes('金棕') || raw.includes('暖棕') || raw.includes('棕发')) {
    hairColor = '暖调金棕色';
  } else if (raw.includes('黑茶') || raw.includes('纯黑') || raw.includes('黑发')) {
    hairColor = '原生健康黑茶色';
  }

  // 3. 脸型五官
  let faceFeatures = '自然微折叠度鹅蛋脸型，清澈有神自然眼眸，原生野生眉毛流感清晰，自然清透唇色';
  if (raw.includes('五官立体') || raw.includes('骨相') || raw.includes('轻熟')) {
    faceFeatures = '立体微折叠度骨相脸型，清秀深邃眼眸，原生骨相立体清晰，从容自然';
  } else if (raw.includes('甜美') || raw.includes('少女') || raw.includes('灵动')) {
    faceFeatures = '柔和自然鹅蛋脸型，明澈灵动眼眸，原生野生眉毛流感清晰，自然淡粉唇色';
  }

  // 4. 肤质肌理
  const skinTexture = '真实健康原生皮肤微肌理，细腻微毛孔呼吸感与自然生活血色，绝无塑料磨皮与发光假人感';

  // 5. 神态表情
  let expression = '神态松弛自信，极富生活温度与亲和力自然微笑';
  if (raw.includes('大笑') || raw.includes('灿烂') || raw.includes('欢快')) {
    expression = '眉眼弯弯露齿甜笑，极富生活温度与亲和感染力';
  } else if (raw.includes('清冷') || raw.includes('优雅') || raw.includes('端庄')) {
    expression = '神态恬淡从容，眼神清澈自信，散发高级松弛感';
  }

  return {
    hairStyle,
    hairColor,
    faceFeatures,
    skinTexture,
    expression,
  };
}

/** 组装纯净 5 层人物提示词 */
export function formatPersonaPrompt(layers: PersonaLayers): string {
  return `五官脸型：${layers.faceFeatures}；发型发色：${layers.hairColor}的${layers.hairStyle}；肤质肌理：${layers.skinTexture}；神态表情：${layers.expression}`;
}

export type AssetSubTab = 'full_prompt' | 'persona' | 'outfit' | 'scene' | 'action';

/** Hide legacy placeholder records that were produced for a product-only image. */
export function isNonHumanPlaceholderAsset(item: object, tab: AssetSubTab): boolean {
  return isPlaceholderIdentity(item, tab);
}

/** API 写入/删除时使用的资产类型 */
export function resolveAssetApiType(activeSubTab: AssetSubTab): string {
  return activeSubTab;
}

import { sanitizeScenePrompt, sanitizeActionPrompt } from '@shared/domain/assets/assetDeconstruct/validate';

function extractSubjectPreview(text: string): string {
  const marker = '【主体】';
  const idx = text.indexOf(marker);
  if (idx < 0) return text;
  const after = text.slice(idx + marker.length).trim();
  const nextSection = after.search(/【[^】]+】/);
  const subject = (nextSection > 0 ? after.slice(0, nextSection) : after).trim();
  return subject || text;
}

/** 卡片一行摘要：不展示冗长杂乱文本，展示纯净原子维度摘要 */
export function getAssetCardSummary(item: Record<string, unknown>, activeSubTab: AssetSubTab): string {
  if (activeSubTab === 'full_prompt') {
    const album = (item.albumName as string | undefined)?.trim();
    const zh = (item.reversePromptZh as string | undefined)?.trim()
      || (item.reversePrompt as string | undefined)?.trim()
      || (item.promptPreview as string | undefined)?.trim()
      || '';
    const summaryParts = [
      item.sceneSummary,
      item.outfitSummary,
      item.actionSummary,
      item.personaSummary,
    ]
      .map((v) => (typeof v === 'string' ? v.trim() : ''))
      .filter(Boolean);
    const body = zh
      ? extractSubjectPreview(zh).slice(0, 56)
      : summaryParts.join(' · ').slice(0, 56);
    const title = (item.title as string | undefined)?.trim();
    const preview = body || title || '完整提示词资产';
    return (album ? `[${album}] ${preview}` : preview).slice(0, 60);
  }
  if (activeSubTab === 'scene') {
    const lighting = (item.lighting as string | undefined)?.trim();
    const rawDesc = (item.description as string | undefined)?.trim() || (item.reversePrompt as string | undefined)?.trim() || '';
    const cleanDesc = sanitizeScenePrompt(rawDesc);
    const hint = lighting ? `采光: ${lighting}` : cleanDesc;
    return (hint || '35mm 真实生活置景空间').slice(0, 56);
  }
  if (activeSubTab === 'action') {
    const rawAction = (item.action as string | undefined)?.trim() || (item.reversePrompt as string | undefined)?.trim() || '';
    const camera = (item.camera as string | undefined)?.trim() || 'iPhone 50mm 生活镜头';
    const cleanAct = sanitizeActionPrompt(rawAction);
    return `机位: ${camera} · 姿态: ${cleanAct || '身体自然放松'}`.slice(0, 56);
  }
  if (activeSubTab === 'outfit') {
    const top = (item.top as string | undefined)?.trim();
    const bottom = (item.bottom as string | undefined)?.trim();
    const shoes = (item.shoes as string | undefined)?.trim();
    const parts = [top ? `上装: ${top}` : '', bottom ? `下装: ${bottom}` : '', shoes ? `鞋履: ${shoes}` : ''].filter(Boolean);
    if (parts.length) return parts.join(' · ').slice(0, 56);
    return ((item.reversePrompt as string) || '高级质感私服穿搭').slice(0, 56);
  }
  if (activeSubTab === 'persona') {
    const raw = (item.description as string) || (item.reversePrompt as string) || '';
    const layers = parsePersonaLayers(raw);
    const parts = [
      layers.hairStyle && layers.hairStyle !== '自然发型' ? layers.hairStyle : '',
      layers.hairColor && layers.hairColor !== '原生发色' ? layers.hairColor : '',
      layers.faceFeatures && layers.faceFeatures !== '精致五官' ? layers.faceFeatures : '',
      layers.expression && layers.expression !== '自然神态' ? layers.expression : '',
    ].filter(Boolean);
    return (parts.length > 0 ? parts.join(' · ') : raw).slice(0, 56);
  }
  return '';
}
