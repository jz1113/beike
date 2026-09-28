import { isDeepSeekRoute, deepSeekModel } from '../models/deepseek';
import {
  buildMultimodalUpstreamFallbackChain,
  listApprovedModels,
  vendorLabel,
  DEFAULT_MULTIMODAL_MODEL_ID,
  getApprovedModel,
  MULTIMODAL_UPSTREAM_FALLBACK_ORDER,
} from '@shared/domain/models/modelCatalog';
import { domainStorage } from '../core/runtime';
import {
  appendPhoneGenerationPolicy,
  buildAssetLibraryPromptSection,
  buildVisionDiversityAxis,
  shouldLockJewelryHalfBody,
} from './visionPromptAssets';

/** 跨批次反雷同签名：场景 + 动作/表情库摘要 */
export interface PreviousGroupSignature {
  scene: string;
  actionDigest: string;
  lookBible?: string;
}

export interface AssetLibrarySlotData {
  scenes?: Array<{ id: string; code?: string; title: string; description: string; lighting?: string | null; reversePrompt?: string | null }>;
  outfits?: Array<{ id: string; code?: string; title: string; top: string; bottom: string; colorPalette?: string | null; reversePrompt?: string | null }>;
  actions?: Array<{ id: string; code?: string; title: string; action: string; shotType?: string; camera?: string | null; suitableAnatomy?: string; reversePrompt?: string | null; has_human?: boolean }>;
  personas?: Array<{ id: string; code?: string; name: string; description: string; reversePrompt?: string | null }>;
}

export interface LockedAssetSlots {
  personaId?: string;
  personaName?: string;
  sceneId?: string;
  sceneTitle?: string;
  outfitId?: string;
  outfitTitle?: string;
  actionId?: string;
  actionTitle?: string;
}

export interface VisionAnalyzeParams {
  productTitle: string;
  productProps?: Record<string, string>;
  imageUrls?: string[];
  templateStyle?: string;
  shotCount?: number;
  extraRequirements?: string;
  model?: string;
  /** 模特人设文字（原创种草人像） */
  modelPersona?: string;
  /** 是否已上传专属正脸 ID 图 */
  hasAnchorFace?: boolean;
  /** 架构模式：默认种草人像 8 段骨架；纯商品静物可走 no_model */
  architectureMode?: 'seed_portrait' | 'pure_product' | 'auto';
  /** 本会话近期 master_scene 摘要，用于跨批次反雷同（兼容旧字段） */
  previousMasterScenes?: string[];
  /** 本会话近期组签名（场景 + 动作库），优先于 previousMasterScenes */
  previousGroupSignatures?: PreviousGroupSignature[];
  /** 🌟 提示词资产库联动数据（自动从数据库检索的精选原子资产） */
  assetLibraryData?: AssetLibrarySlotData;
  /** 🌟 用户定向锁定的特定资产 */
  lockedAssets?: LockedAssetSlots;
}

export interface ShotPrompt {
  assembly_source?: 'group_skeleton' | 'architecture' | 'fallback';
  shot_no: number;
  title?: string;
  prompt: string;
  scene?: string;
  expression?: string; // 本镜表情关键词（组内强制差异）
  action?: string; // 本镜动作/道具互动（组内强制差异）
  prop?: string; // 本镜道具
  optics?: string; // 光学短句
  camera_focal_length?: string; // 🌟 摄影焦段 (如: 85mm f/1.8 浅景深, 35mm 人文机位, 100mm 微距特写)
  angle?: string; // 🌟 机位视角 (如: 45° 沉浸俯角, 平视平角, 超低仰角, 越肩抓拍)
  lighting_type?: string; // 🌟 采光属性 (如: 5500K 百叶窗晨光, 柔和漫反射, 侧逆光轮廓)
  has_human?: boolean; // 🌟 是否有人物/模特出镜 (true: 有模特/人像; false: 纯商品静物/屏幕UI/背壳特写)
  shot_type?: 'model_shot' | 'hand_held_only' | 'pure_product'; // 🌟 分镜类型
  productImageUrl?: string; // 🌟 该分镜绑定的具体商品素材图（正面/背面/侧面实物图）
  selected?: boolean;
  applied_scene?: string;
  applied_outfit?: string;
  applied_action?: string;
  applied_persona?: string;
}

export function buildActionDigestFromShots(
  shots: Array<{ expression?: string; action?: string }>
): string {
  return shots
    .map((s) => [s.expression, s.action].filter(Boolean).join('/'))
    .filter(Boolean)
    .slice(0, 6)
    .join(' | ');
}

export interface CategoryItem {
  id: string;
  name: string;
  isCustom?: boolean;
}

export const DEFAULT_CATEGORIES: CategoryItem[] = [
  { id: 'digital_3c', name: '💻 电脑 / 办公' },
  { id: 'general', name: '🌐 通用生活买家秀' }
];

export function getMergedCategories(): CategoryItem[] {
  const storage = domainStorage();
  if (!storage) return DEFAULT_CATEGORIES;
  const saved = storage.getItem('custom_categories');
  if (!saved) return DEFAULT_CATEGORIES;
  try {
    const custom: CategoryItem[] = JSON.parse(saved);
    if (Array.isArray(custom)) {
      return custom;
    }
  } catch {}
  return DEFAULT_CATEGORIES;
}

export function saveCategoriesList(list: CategoryItem[]): CategoryItem[] {
  const storage = domainStorage();
  if (!storage) return list;
  try {
    storage.setItem('custom_categories', JSON.stringify(list));
  } catch {}
  return list;
}

export function deleteCategoryItem(catId: string): CategoryItem[] {
  const current = getMergedCategories();
  const updated = current.filter(c => c.id !== catId);
  return saveCategoriesList(updated);
}

export function resetCategoriesToDefault(): CategoryItem[] {
  return saveCategoriesList(DEFAULT_CATEGORIES);
}

export interface VisionModel {
  id: string;
  name: string;
  shortName: string;
  provider: string;
  badge?: string;
  description?: string;
}

export const VISION_MODELS: VisionModel[] = listApprovedModels('multimodal').map((m) => ({
  id: m.id,
  name: m.name,
  shortName: m.shortName,
  provider: vendorLabel(m.vendor),
  badge: m.badge,
  description: m.description,
}));

/** 模型是否支持 image_url 多模态输入（反推管线专用，排除纯文本 deepseek 等） */
export function isVisionCapableModel(modelId?: string): boolean {
  if (isDeepSeekRoute(modelId || '')) return !!deepSeekModel(modelId!)?.vision;
  const raw = (modelId || '').trim();
  if (!raw) return false;
  const approved = getApprovedModel(raw);
  if (approved) return approved.capability === 'multimodal';
  const lower = raw.toLowerCase();

  if (
    lower.includes('embedding') ||
    lower.includes('embed') ||
    lower.includes('whisper') ||
    lower.includes('tts') ||
    lower.includes('suno') ||
    lower.includes('rerank')
  ) {
    return false;
  }

  if (lower.includes('deepseek') && !lower.includes('vl')) {
    return false;
  }

  if (
    lower.includes('vision') ||
    lower.includes('gemini') ||
    lower.includes('claude') ||
    lower.includes('grok') ||
    lower.includes('4o') ||
    /gpt-[45]/.test(lower) ||
    lower.includes('qwen-vl') ||
    lower.includes('luna')
  ) {
    return true;
  }

  return false;
}

/** 过滤模型链，仅保留支持 image_url 的视觉模型 */
export function filterVisionCapableModels(models: string[]): string[] {
  return models.filter((m) => isVisionCapableModel(m));
}

/** 根据当前模型构建统一的多模态上游降级链。 */
export function buildVisionModelsToTry(
  requestedModel: string | undefined,
  fallbackModels: string[] | undefined = undefined,
  maxTotal = Math.max(MULTIMODAL_UPSTREAM_FALLBACK_ORDER.length, fallbackModels?.length ?? 0) + 1,
): string[] {
  const raw = (requestedModel || '').trim();
  const primary = raw ? normalizeVisionModelId(raw) : DEFAULT_MULTIMODAL_MODEL_ID;
  const chain = buildMultimodalUpstreamFallbackChain(primary, fallbackModels);
  return chain.slice(0, Math.max(1, maxTotal));
}

/** Pass1 逐图反推与其他视觉入口使用完全相同的上游降级顺序。 */
export function buildPass1VisionModelsToTry(
  requestedModel: string | undefined,
  fallbackModels: string[] | undefined = undefined,
  maxTotal = Math.max(MULTIMODAL_UPSTREAM_FALLBACK_ORDER.length, fallbackModels?.length ?? 0) + 1,
): string[] {
  return buildVisionModelsToTry(requestedModel, fallbackModels, maxTotal);
}

export function pickVisionAnalyzeFallbacks(selectedId: string): string[] {
  return buildMultimodalUpstreamFallbackChain(normalizeVisionModelId(selectedId)).slice(1);
}

export function normalizeVisionModelId(modelId?: string): string {
  if (!modelId) return DEFAULT_MULTIMODAL_MODEL_ID;
  const clean = modelId.trim().toLowerCase();
  const aliases: Record<string, string> = {
    'gpt-4-vision-preview': 'gpt-5.6-luna',
    'gpt-4-turbo-vision': 'gpt-5.6-luna',
    'gpt-4o': 'gpt-5.6-luna',
    'gpt-5.5-pro': 'gpt-5.6-luna',
    'gemini-1.5-flash': 'gemini-3.7-flash',
    'gemini-2.0-flash': 'gemini-3.7-flash',
    'gemini-2.5-flash': 'gemini-3.7-flash',
    'gemini-1.5-pro': 'gemini-3.1-pro-preview',
    'gemini-2.5-pro': 'gemini-3.1-pro-preview',
    'gemini-3.1-pro-preview-thinking-high': 'gemini-3.1-pro-preview',
    'claude-3-5-sonnet': 'claude-sonnet-5',
    'claude-3-5-sonnet-20241022': 'claude-sonnet-5',
    'claude-3-7-sonnet': 'claude-sonnet-5',
    'claude-3-7-sonnet-thinking': 'claude-opus-5',
    'claude-3-7-sonnet-20250219': 'claude-sonnet-5',
  };
  return aliases[clean] || modelId;
}

export function buildVisionSystemPrompt(params: VisionAnalyzeParams): string {
  const {
    productTitle,
    productProps,
    templateStyle = '依据商品实物与品类调性，智能构思高审美、生活化、多层次的真实买家秀空间置景与光影',
    shotCount = 4,
    extraRequirements = '',
    modelPersona = '',
    hasAnchorFace = false,
    architectureMode = 'auto',
    previousMasterScenes = [],
    previousGroupSignatures = [],
    assetLibraryData,
    lockedAssets,
  } = params;
  const lockJewelryHalfBody = shouldLockJewelryHalfBody(productTitle, assetLibraryData);

  // 显式架构优先于旧版人设字段；资产库模式会传入 asset_driven，不能被误判为无人。
  const isNoModel =
    architectureMode === 'pure_product' ||
    (architectureMode !== 'seed_portrait' &&
      (!modelPersona ||
        modelPersona === 'none' ||
        modelPersona.includes('无人物') ||
        modelPersona.includes('无需模特') ||
        modelPersona.includes('纯商品') ||
        modelPersona.includes('纯静物')));

  const propsSection = productProps && Object.keys(productProps).length > 0
    ? `\n- 核心规格参数 (Props):\n${Object.entries(productProps).map(([k, v]) => `  • ${k}: ${v}`).join('\n')}`
    : '';

  const sigList = (previousGroupSignatures || [])
    .filter((s) => s && (s.scene || s.actionDigest || s.lookBible))
    .slice(0, 4);
  const legacyScenes = (previousMasterScenes || []).filter(Boolean).slice(0, 2);
  const antiDupLines: string[] = [];
  if (sigList.length > 0) {
    sigList.forEach((s, i) => {
      antiDupLines.push(
        `${i + 1}. 【已用空间】：${s.scene || '（空）'} ｜ 【已用动作表情】：${s.actionDigest || '（空）'} ${s.lookBible ? `｜ 【已用服饰】：${s.lookBible}` : ''}`
      );
    });
  } else if (legacyScenes.length > 0) {
    legacyScenes.forEach((s, i) => antiDupLines.push(`${i + 1}. 场景：${s}`));
  }

  const antiDupSection = antiDupLines.length > 0
    ? `\n## 🚨 跨批次场景与动作强力排重（动态负向排除已用空间，严禁雷同）
本会话近期已用过的组签名（🚨 本次生成必须与下列空间与动作彻底拉开，绝对禁止复用同类场景/同款动作）：
${antiDupLines.join('\n')}
- 🚨 **场景空间必须彻底大换血**：绝对禁止再次使用上述任何同类空间或类似环境，必须根据目标商品自主开拓一个截然不同的全新真实生活/出行环境！
- 🚨 **服饰搭配必须彻底大换血**：由大模型根据新环境全权自拟全新搭配，绝不重复！
- 🚨 **动作与姿态必须彻底大换血**：禁止重复上述任何动作！
`
    : '';

  const diversityGuidelines = `
- 🚨 【全套 ${shotCount} 镜自由随机生活叙事 + 必须包含 1~2 张多角度商品特写】：
  大模型必须打破任何固定流水线顺序（严禁机械固化“远景➔中景➔微距➔贝壳盘静物”），分镜景别、构图与生活姿态完全随机自由组合：
  • 🌟 【硬性要求：必须包含 1~2 张多角度商品特写（彻底拒绝单一模板）】：
    全套 ${shotCount} 镜中必须有 1~2 个分镜清晰聚焦展示 @图片1 所示商品实物细节，且特写机位与构图角度必须丰富多变，如：
    - 【生活动作抓拍特写】：手部自然平放于台面、扶手或手袋边，手腕/手指佩戴物自然入镜；
    - 【侧颜光影特写】：微风吹拂发丝、侧头看风景时展露耳饰与优美自然的侧颜线条；
    - 【俯视/微距特写】：超清对焦商品微观细节与真实金属/宝石光泽，背景大光圈自然虚化；
    - 【肢体自然近景】：手部轻搭在石栏杆、木桌沿、口袋边时的近距离抓拍；
  • 🌟 【其余分镜完全随机自由抓拍（对齐真实小红书高赞实拍）】：
    大模型自由策划真实生动的高级生活碎片（如：海边度假自然倚靠栏杆微笑、法式长廊拱门下轻抚发丝、室内实体穿衣镜前拿手机对镜自拍、车内副驾侧头看窗外天光、阳光飘窗边小憩等，绝不强制固定第 4 镜为静物）。

- 🚨 【肢体动作与手部物理支撑铁律（彻底杜绝鸡爪手与反关节）】：
  ① 🌟 **手部必须有真实物理依托物**：双手可以自然轻搭在石栏杆/木桌沿/车门扶手、单手自然插在牛仔裤兜、轻握单肩包肩带、手持手机对镜自拍、或自然垂落身侧；
  ② ❌ **绝对禁止双手在空中悬空扭捏、悬空摸锁骨/摸项链/摸手腕**（此类动作会导致 AI 产生反关节畸变与多指/断指）；
  ③ ❌ **绝对禁止「图书馆、书店、木质书架阅读角、低头看书/翻书」**：严禁出现任何书店或低头看书动作！
  ④ ❌ **绝对禁止全套分镜「全是站立靠墙 / 全是坐姿」**：必须景别动作丰富多样！
  ⑤ ❌ **首饰佩戴类严禁手拿穿帮**：佩戴在身上的首饰，严禁模特手上又额外拿一只/捧一只！
`;

  const identityLock = isNoModel
    ? `## 【Identity Lock · 身份锁】
- 本次为**纯商品/静物**组图：全套 \`has_human: false\`，禁止出现模特、人脸、发型、身体。
- identity_bible 写：纯商品静物，无人物。`
    : `## 【Identity Lock · 真实生活小红书博主人设 (自然清秀 · 原生质感 · 真实生活呼吸感)】
- 🚨 【根据商品受众智能匹配模特（全员 100% 锁定东亚亚洲人，绝无欧美假人感与影楼假面感）】：
  1. **男士商品**（男表/男士项链/男戒/男装等）：匹配「长相自然阳光帅气的 20-30 多岁年轻东亚男生（骨相干净利落，眼神清澈有神，干净利落短发，真实健康自然肤色与微小皮肤纹理，生活抓拍感）」；
  2. **宝宝/儿童商品**（童镯/长命锁/婴儿手绳/母婴等）：匹配「可爱健康的东亚小宝宝/婴幼儿（肉嘟嘟脸蛋与清澈灵动大眼睛，日常抓拍感），或时尚年轻妈妈与宝宝温馨生活日常」；
  3. **长辈商品**（老年金饰/寿桃翡翠等）：匹配「慈祥端庄、气质温润优雅的东亚长辈」；
  4. **女士/通用商品（默认）**：匹配「长相自然清秀的20多岁年轻东亚女生（清纯邻家气质与自然生动的五官比例，原生健康肤色与自然透光血色感，真实人类微观皮肤肌理与细微自然毛孔呼吸感，极简自然日常淡妆，原生野生眉与根根分明自然睫毛，自然润泽的真实唇纹唇色，发际线有细碎绒毛与随风微乱碎发，神态松弛自然有呼吸感，绝无网红整容脸与磨皮假人塑料感）」；
- 🚨 【真实生活感与原生质感法则】：
  - 呈现真实生活随拍质感：蓬松自然发量感（发型随博主气质与场景氛围灵动自适应，如微卷蓬松长发、微乱随性半扎发、慵懒低丸子头配自然碎发、空气刘海等，绝不机械固定）、真实皮肤纹理呼吸感、细微自然毛孔、微透光血色、不经意的真实抓拍微表情（Unposed Candid Moment，眼神灵动交流、歪头浅笑、专注展示商品细节、微风拂发等自然生活瞬间），杜绝影楼僵硬摆拍假笑与过度对称塑料脸；
${hasAnchorFace
  ? `- 已挂载【专属正脸 ID 图】（多模态中位于商品图之后）：仅作五官特征参考；**严禁**照搬正脸图死板表情或背景。
- 生图垫图约定：@图片1=商品，@图片2=正脸 ID 特写板；场景定桩（若有）为 @图片3。提示词中人物五官用「@图片2」指代。`
  : `- 无人脸垫图时，面容按上述自然清秀真实受众自适应定型（写入 identity_bible，并在每镜复用关键特征词）。`}
- 全套 ${shotCount} 镜必须保持同一位模特身份，禁止中途换人。解剖学硬约束：两臂十指、双腿，禁止多余肢体。`;

  const lookLock = isNoModel
    ? `## 【Look Lock · 穿搭/陈设锁】
- 纯静物：无需服饰锁；look_bible 写商品陈设主色与材质气质摘要即可；look_parts 可省略。
- product_role 固定为 \`placed_object\`。`
    : `## 【Look Lock · 多元小红书博主 OOTD 穿搭自由构想（🚨 零写死 · 显白对比色彩学 · 坚决封杀全员黑色针织衫）】
- 🚨 【100% 穿搭自主创意授权（百人百搭 · 绝不限制单一模版）】：
  - 视觉大模型必须像不同的小红书真实穿搭博主一样，拥有完全开放自由的服装搭配创意权！
  - 🚨 **严禁每款商品都写“黑色长袖针织衫”或“黑色方领打底衫”！必须根据【商品调性与材质】、【博主气质】以及【生活场景氛围】，运用显白对比美学自由构想色彩与款式极其丰富多元的高级显白私服 OOTD**：
    - 【开放式显白对比色彩指导（款式与色彩必须充分发散）】：
      • **浅色/亮色首饰**（白金/银饰/钻石/浅色珍珠等）：引导自拟深色系或冷色调质感私服（如深炭灰、克莱因蓝、深灰西装、墨绿针织、复古丹宁等），强力反衬首饰的光泽感与皮肤的通透冷白；
      • **深色/浓郁首饰**（浓绿翡翠/墨翠/深色宝石等）：引导自拟浅色系/柔和暖调私服（如软糯奶杏色、米白色、燕麦灰、温柔鹅黄色开衫等），让首饰成为整套画面的唯一视觉焦点；
      • **暖金色/古法金饰**：引导自拟纯净冷色或中性色（纯白衬衫、冷灰小西装、藏青、复古酒红等），中和金色的厚重，呈现典雅轻奢感；
    - 款式完全开放自由脑暴（丰富多元，杜绝同质化）：
      - 软糯奶杏色/温柔鹅黄色小圆领马海毛针织开衫；
      - 清爽法式水蓝/浅粉细条纹男友风宽松挺括白衬衫；
      - 优雅复古浅燕麦色/炭灰色休闲廓形小西装内搭纯白打底；
      - 法式复古碎花微透长裙、优雅平口吊带长裙外搭轻薄雪纺披肩；
      - 复古水洗浅蓝丹宁牛仔衬衫或牛仔外套；
      - 薄荷绿/香芋紫/柔粉色法式真丝系带衬衫；
      - 极简质感赫本风小黑裙（仅用于极高对比的特定款式，严禁每款都穿小黑裙）；
  - 服饰表面一律为高级纯色或经典暗纹面料，严禁出现任何胸针徽章、相机图标或印花贴纸。
- 🚨 【组内同一套衣服铁律】：全套 \${shotCount} 个分镜内，模特必须穿着完全相同的同一套具体服装（款式、材质、颜色 100% 相同一字不差）！严禁分镜之间中途换衣服！
  - \`look_parts.top\`：必须根据商品与场景自拟具体的显白质感上装（或全身服装），并在 prompts 数组中所有人物分镜中 100% 严格复用！
  - \`look_parts.bottom\`：必须填写具体且统一的单件下装，并在所有分镜中 100% 严格复用！
  - \`look_parts.shoes\`：统一鞋履；
  - \`look_parts.accessory\`：佩戴商品（根据品类准确佩戴）。
- **先判定 product_role**（必填其一）：
  - \`worn_apparel\`：商品是衣服/外套/裙裤等**穿在身上**的服装 → 模特必须穿着 @图片1；**禁止**在 look_parts.top/bottom 写任何颜色或版型文字；top 只能写「穿着 @图片1 所示服装，外观 100% 以 @图片1 为准」。
  - \`worn_accessory\`：手镯/手链/手表/项链/吊坠/锁骨链/戒指/耳环/耳钉/胸针/发簪/步摇/发饰等**全品类配饰** →
    🚨 【首饰/配饰佩戴部位精准映射与物理真实性 7 大铁律】：
    ① 【精准自适应佩戴部位 & 单品类排他性（🚨 严禁把耳环/项链当手镯画在手腕上，🚨 严禁画面中乱加未指定的额外饰品）】：
       - **发簪/簪子/步摇/发饰/头饰**：必须插戴在秀美发髻侧方或发间（look_parts.accessory 写「插戴 @图片1 所示发簪/步摇，发丝盘起整洁雅致，手腕光洁无手镯」）；**所有分镜机位必须为 45° 侧颜、侧后方 45° 微回眸、发髻超清微距或手挽发丝互动，绝对严禁使用正脸正面平视机位导致发簪被后脑勺完全遮挡**！
       - **耳环/耳钉/耳饰**：必须且仅佩戴在模特双耳耳垂上（look_parts.accessory 写「双耳耳垂佩戴 @图片1 所示小巧耳饰，手腕光洁无手镯手链，脖子无项链」），**手腕必须保持光洁，严禁画在手腕或手指上，严禁在手腕多画手镯/手链**；
       - **项链/吊坠/锁骨链**：必须佩戴在模特颈部锁骨正中（look_parts.accessory 写「颈间锁骨正中佩戴 @图片1 所示项链，手腕光洁无手镯」）；**所有人物分镜机位必须为正面平视或45°侧前方并露出锁骨，严禁后背视角、后颈露背或越肩大露背，严禁戴在手腕上**！
       - **手镯/手链/手串/手表**：必须佩戴在模特单侧手腕上（look_parts.accessory 写「单侧手腕佩戴 @图片1 所示手镯/手链，脖子光洁无项链」），双手自然放置、握持或搭在身前/栏杆；
       - **戒指/指环**：必须佩戴在模特手指上（look_parts.accessory 写「纤细手指佩戴 @图片1 所示戒指，手腕无手镯」）；
       - **包袋**：自然手提或单肩背着（look_parts.accessory 写「单肩佩戴或手提 @图片1 所示包袋」）；
    ② 【🚨 服饰端庄得体安全合规红线（严禁低胸/深V/露乳沟/尺度过大违规）】：
       - 女装款式必须为日常端庄得体、优雅大方的显白着装；
       - ❌ **绝对禁止低胸、大开领深V、露胸部乳沟（cleavage）、超短透视或过于暴露擦边的服装**；
       - 佩戴项链时，项链佩戴在锁骨正中，通过自然舒适端庄的领口优雅展示，**绝不靠大面积露胸来展示项链**！
    ③ 【严格真实人体佩戴比例（小巧精致贴耳 · 拒绝巨大化变形）】：
       - 首饰尺寸与粗细严格符合真实人体工程学比例，手链/手镯圈口粗细、耳钉尺寸 100% 严格等比例还原 @图片1 实物原本大小；
       - **耳钉/耳饰尤其必须小巧精致贴耳（贴耳尺寸约为耳垂的三分之一至二分之一小巧比例），绝对严禁画成巨大的金属圆盘、大徽章或大硬币！**
       - 严禁夸大粗细、严禁把细链画成粗镯、严禁把小吊坠放大成巨大挂件，比例轻盈贴合皮肤。
    ④ 【严禁额外添加夸张发光修饰（拒绝太闪）】：
       - 严禁在提示词中使用“爆闪、璀璨、闪烁、星芒、晶莹剔透、极度反光”等夸张特效词；首饰表面仅呈现真实自然环境下的物理微光与柔和弱反射。
    ⑤ 【严禁重复与手拿穿帮】：全图绝对只能有 1 件 @图片1 饰品实物；**严禁模特手上又额外拿一只/捧一只已佩戴的饰品**！
    ⑥ 【项链自然重力贴合】：项链吊坠自然垂坠贴合胸前锁骨，绝无悬空或漂浮。
  - \`held_object\`：手机/杯/数码等**手持** → 服饰可协调自拟，但**禁止**把商品写成「脖子佩戴」；商品外观只认 @图片1。
  - \`placed_object\`：纯陈设静物（若误判人物模式勿用）。
- **严禁文字描写商品颜色/几何/支架/镜头排列**；外观唯一真相是 @图片1。`;

  return appendPhoneGenerationPolicy(`# Role: 擅长拍摄小红书百万赞爆款图文的小红书真实生活博主与摄影师，专注真实手机原相机生活抓拍感（Shot on iPhone, Candid Lifestyle）、自然生活采光与自然清秀半身人像质感；核心目标是输出「纯正东亚女性自然骨相与清秀五官比例、原生健康透气冷白肤质与细微毛孔呼吸感、真实皮肤次表面散射与微弱皮脂光泽（零过度磨皮、零美颜滤镜假面）、发际线细软胎毛与随性碎发、100% 全员半身像/中近景/微距构图（绝对无远景全身）、充满生活烟火气的真实物理空间与自然斑驳日光（Dappled sunlight）、扎实的物理接触阴影（Contact Shadows）、手部动作有自然物理依托且绝不向镜头伸手畸变、绝无 3D 建模渲染假人感与塑料假背景」的照片级提示词。

你的任务：根据【目标商品实物图 @图片1】${hasAnchorFace && !isNoModel ? '与【专属正脸 ID 图】' : ''}及【品类/自定义提示词架构】，自主为商品策划一套 ${shotCount} 镜**同一身份 · 完全同一套穿搭 · 同一真实生活主空间**、但**机位/动作/特写角度完全随机自由**的结构化字段（最终中文 Prompt 由系统按 8 段骨架拼装）。

---
## 【目标商品信息】
- 商品名称/标题：${productTitle}${propsSection}
- 商品实物素材图：多模态首图（生图时 @图片1 为外观唯一真相）
${hasAnchorFace && !isNoModel ? '- 专属正脸图：多模态次图（仅 ID，生图时 @图片2）\n' : ''}
---
${identityLock}

---
${lookLock}

---
## 【Scene Lock · 真实生活全开放场景探索 (🚨 零写死 · 坚决封杀全员花店/单一海边栈道/室内卧室/单一咖啡馆/冷淡展厅)】
1. **先写唯一 master_scene**：全套分镜锁定同一个真实生活、东方雅韵、都会出行、休闲社交或度假主空间 + 统一纯净明亮自然采光与色温。
2. 🚨 【场景禁令与全开放多元探索（百品百景，深度契合商品文化调性，严禁所有商品都去花店或木栈道）】：
   - ❌ **绝对封杀与严厉禁止以下单一/雷同场景**：
     - **严禁所有商品千篇一律全是「街角鲜花店外廊、鲜花长椅」！坚决打破花店垄断！**
     - **严禁所有商品千篇一律全是「沿海木栈道观景台、海边码头登船」！坚决打破海边栈道垄断！**
     - **严禁每款商品都默认使用「卧室床边、白色窗帘飘窗、室内木质梳妆台」！严禁全员居家化！**
     - **严禁「现代艺术画廊、展厅、美术馆、墙上抽象几何画作、空旷白墙、冰冷样板间、长走廊、空旷地板」**！此类场景极度冰冷空洞、缺乏生活温度！
     - **严禁「图书馆、书店、木质阅读角、低头看书/翻书」**！
     - **严禁连续多款商品全写“木质咖啡馆+手拿咖啡杯”！**
    - 🌟 **真实生活场景装配准则（百品百景，具体场景 100% 优先从下方【真实场景库】中选用装配）**：
      - 必须根据目标商品的文化属性、材质色泽与使用受众，在东方雅韵空间、现代都会落地窗、慢调街区林荫、浪漫度假露台、温馨起居等真实生活环境中自适应匹配，严禁机械固化；
    - **空间必须具备极强的生活烟火气、真实的空气感与自然物理光影肌理（如天然原木纹理、亚麻织物透光、粗陶器皿、自然绿植叶脉、斜射阳光在台面形成的自然斑驳光斑与渐变光影）**；跨批次生成时必须强制大换血，严禁多款商品重复使用相同场景！
3. 🚨 【采光与真实物理阴影核心原则】：
   - 采光必须采用【明亮通透的午后斜射自然日光（Direct sunlight）、暖调落日余晖、纯净晨光或柔和自然漫射天光（5500K 纯净自然色温）】；
   - 必须呈现**真实的物理接触阴影（Contact Shadows）、环境光遮蔽（AO）与清晰的自然光斑**，立体有呼吸感，彻底杜绝无阴影的绿幕抠图感与昏暗杂乱死黑！
4. 🚨 【物理光学与严禁穿帮铁律（彻底杜绝车窗倒影/透光玻璃自拍与后背项链）】：
   - **严禁写“车窗倒影自拍”、“透光玻璃倒影对镜自拍”、“水洼倒影拍照”等任何伪镜面描述**！此类描述会导致 AI 产生半透明人影、双重曝光与车内外混乱穿帮！
   - **所有“对镜自拍”机位必须且只能发生在拥有【真实室内实体物理镜子】的合理空间**（如居家全身穿衣镜、玄关镜、梳妆台化妆镜），呈现清晰、真实的物理反射！
   - **项链/锁骨链类首饰，严禁使用后背/越肩露背机位，必须使用正面平视或45°侧前方机位，清晰露出锁骨正中**！
   - **发簪/步摇类首饰，严禁使用正脸平视被头部遮挡机位，必须使用 45° 侧颜、侧后方 45° 微回眸或发髻微距特写机位**！
   - **若场景为车内（副驾/后排）**：动作必须是副驾单手轻抚包带侧头看窗外天光、手部轻搭安全带真特写，**严禁在车内对着透光车窗拍倒影自拍**！
5. 每镜 \`scene\` 必须复用 master_scene 的关键词；分镜只换**机位/景别/构图焦点**，禁止换房。

---
## 【Style Lock · 风格锁 & 真实 iPhone 原相机生活随拍】
- style_bible 必须包含真实生活随手抓拍质感关键词：
  \`Shot on iPhone 16 Pro 手机后置原相机随手抓拍（Unedited RAW photograph, Candid Lifestyle Photography, 35mm/50mm f/1.8 lens），小红书真实博主生活随拍质感，零美颜零滤镜生图直出（Zero beauty filters, zero airbrushing）。纯净明亮的午后自然日光与真实环境漫反射光线，扎实的环境光遮蔽（Ambient Occlusion）与清晰物理接触阴影（Realistic Contact Shadows），彻底消除浮空抠图感；人物皮肤具备真实人类微观毛孔呼吸感与自然细腻肌理，发际线有自然细软胎毛绒毛与随性碎发，微弱自然 CMOS 传感器光学颗粒感（Subtle natural sensor grain），背景具备真实大光圈浅景深光学虚化（Creamy background bokeh），首饰材质呈现真实的物理金属高光与宝石微光，绝无 3D 建模渲染假人感与塑料磨皮假面\`。
- 全套共用 style_bible；组内差异只体现在表情/动作/机位，不换整体风格流派。

---
## 【Diversity Axis · 组内差异轴与 🚨 组内动作严禁同质化 / 严禁连续托腮】（最高优先级）
${buildVisionDiversityAxis(shotCount, lockJewelryHalfBody)}
- 🚨 【动作多样性与排他性铁律（彻底封杀托腮垄断，实现百变姿态）】：
  - ❌ **全套 4 个分镜中，4 个姿态必须展现 4 种截然不同的人体状态与手势，严禁全套出现 2 次及以上托腮/托下巴动作！**
  - 🌟 **动作全开放脑暴原则**：
    - 大模型根据商品特性自由构思真实自然的抓拍瞬间（手捏吊坠展示细节、双手拉开细链、单手撩耳边碎发、单手轻扶包带/拉链、双手捧水杯、手插牛仔裤兜、搭在椅背/栏杆、在街道漫步回眸、在车内看窗外、自然站立、低头专注看饰品、纯半身自然呼吸感等）；
    - **唯一物理铁律**：手部动作必须符合人体工程学，有真实物理依托或自然发力（平放桌面、搭桌沿、捧杯、撩发、扶包），严禁张开五指伸向镜头前（严禁向镜头伸手导致的透视畸变与怪手），手部与手指比例精准自然（精确5指），严禁空中悬空扭捏，严禁机械呆板站桩。
${diversityGuidelines}
- 每镜 JSON 必须写出独立的 expression、action、prop、optics 字段。
- **prompt 字段（及字段内描述）必须使用简体中文**，禁止整段英文 prompt；画面内需显示的外文可放在中文引号内。

---
## 【激活的品类/自定义提示词架构】
==================== START ====================
${templateStyle}
==================== END ======================
- 架构工程定位：此架构主要提供【8 段提示词工程结构骨架、机位景别与真实原相机生活感规则】。
- 🚨 【风格解耦铁律】：除非用户在下方【用户定制补充要求】中明确指定了特定流派，大模型必须自由、有机地在多元真实生活与出行场景中自适应匹配，绝不机械固化某单一流派！


- 若架构未指定服饰：按 product_role 补全 look_parts（**worn_apparel 不得自造服装颜色**）。

---
## 【🚨 极高优先级红线：严禁在提示词中描写商品细节，必须直接使用 @图片1 指代】
- **严禁在提示词（prompt）、场景（scene）、穿搭（look）或任何字段中用文字描写商品的具体材质、颜色、纹理、花纹、款式或几何结构**！
- **关于商品实物外观，一律且唯一直接使用【@图片1】指代**：
  - 服装穿搭类：写「穿着 @图片1 所示服装，外观 100% 以 @图片1 为准」
  - 佩戴配饰类：写「佩戴 @图片1 所示商品，外观 100% 以 @图片1 为准（佩戴在手腕/对应部位，画面中仅此 1 件实物）」
  - 手持数码类：写「手持/使用 @图片1 所示商品，外观 100% 以 @图片1 为准」
  - 纯商品静物：写「画面主体为 @图片1 所示商品实物，外观 100% 以 @图片1 为准」
- **分镜策划的重点**：全部聚焦在**空间置景、光影色温、机位角度、摄影焦段、景深焦点、人物动作姿势、微表情与生活化道具互动**！
${buildAssetLibraryPromptSection(assetLibraryData, lockedAssets, lockJewelryHalfBody)}
${antiDupSection}
${extraRequirements ? `\n【用户定制补充要求】：\n${extraRequirements}\n` : ''}
## 输出格式（合法 JSON，无 Markdown 前言）
\`\`\`json
{
  "product_fingerprint": "商品简要品类词（如 手镯 / 连衣裙 / 男士腕表 / 宝宝金锁，严禁填写颜色材质细节）",
  "product_role": "${isNoModel ? 'placed_object' : 'worn_apparel | worn_accessory | held_object | placed_object'}",
  "target_demographic": "asian_female | asian_male | asian_baby | asian_elder",
  "applied_scene": "所选场景编号与标题（如 [#S-01] 传统和室木窗与低矮榻榻米餐桌）",
  "applied_outfit": "所选穿搭编号与标题（如 [#O-01] 改良新中式素雅盘扣真丝开衫）",
  "applied_persona": "所选人设编号与名称（如 [#P-01] 温柔复古感金棕卷发生活方式博主）",
  "master_scene": "全套统一主空间与光色关键词（须具体真实）",
  "style_bible": "风格形容词 + 光线类型 + 真实写实质感",
  "look_bible": "${isNoModel ? '商品陈设以 @图片1 为准' : '全套统一具体时髦穿搭摘要（依商品与场景自拟，并在人物分镜中严格复用）'}",
  "look_parts": {
    "top": "${isNoModel ? '' : 'worn_apparel 时写：穿着 @图片1 所示服装；其他角色必须写依商品与场景自拟的具体显白上装或全身服装'}",
    "bottom": "${isNoModel ? '' : '统一具体下装（若 top 为连衣裙可写相应裙装）'}",
    "shoes": "${isNoModel ? '' : '统一鞋履'}",
    "accessory": "${isNoModel ? '' : 'worn_accessory 时佩戴 @图片1；worn_apparel 勿写脖子佩戴商品'}"
  },
  "identity_bible": "${isNoModel ? '纯商品静物，无人物' : (hasAnchorFace ? '已绑定专属正脸 @图片2（仅五官 ID）+ 关键特征短句' : '长相自然清秀的东亚女生，自然生活感淡妆，真实皮肤纹理与细微毛孔，自然随性碎发，神态松弛自然')}",
  "has_human": ${isNoModel ? 'false' : 'true'},
  "prompts": [
    {
      "shot_no": 1,
      "title": "分镜短标题（含机位意图）",
      "scene": "复用 master_scene 关键词 + 本镜机位景别",
      "expression": "${isNoModel ? '无（静物）' : '本镜独有生动生活化微表情关键词'}",
      "action": "${isNoModel ? '商品摆放/使用状态' : '本镜独有生活化抓拍动作'}",
      "prop": "本镜道具短句",
      "optics": "本镜光学短句",
      "camera_focal_length": "如 iPhone 24mm 人文广角 / iPhone 50mm / 85mm 特写 / 微距特写",
      "angle": "如 平视抓拍 / 45° 侧颜 / 微俯视 / 局部特写",
      "lighting_type": "与 master_scene / style_bible 统一的光色描述",
      "has_human": ${isNoModel ? 'false' : 'true'},
      "shot_type": "${isNoModel ? 'pure_product' : 'model_shot'}",
      "prompt": "【AI视觉深度精修】结合 @图片1 实物特征（材质/光泽/做工/微观受光焦点）与本镜独有生活化抓拍动作、焦段机位构图进行深度润色优化的摄影提示词（80-160字，精准生动有质感，严禁假大空套话）"
    }
  ]
}
\`\`\`
- prompts 数组长度必须恰好为 ${shotCount}，shot_no 从 1 到 ${shotCount}。
- 🌟 prompt 字段是大模型多模态视觉理解的核心价值：必须结合 @图片1 实物实拍的金属/布料/宝石光泽与做工质感，打磨本镜的独有动作、机位与受光焦点，为系统拼装提供最高品质的视觉精修文案。
- product_role 必须与商品实物一致（衬衫/外套等=worn_apparel，手镯/项链/耳饰/戒指=worn_accessory）。
`, productTitle);
}

/** 爆款复刻 Pass2：用商品信息优化反推词，产出最终生图提示词（仅 @图片1） */
export function buildReplicationOptimizeSystemPrompt(params: {
  productTitle: string;
  productProps?: Record<string, string>;
  referenceImageCount: number;
  modelPersona: string;
  hasAnchorFace?: boolean;
  productFingerprint?: string;
  templateStyle?: string;
  extraRequirements?: string;
  reverseShots: Array<{
    shot_no: number;
    image_type?: string;
    has_human?: boolean;
    shot_type?: string;
    title?: string;
    scene?: string;
    reverse_prompt: string;
    negative_prompt?: string;
  }>;
}): string {
  const {
    productTitle,
    productProps,
    referenceImageCount,
    modelPersona,
    hasAnchorFace = false,
    productFingerprint,
    templateStyle,
    extraRequirements,
    reverseShots,
  } = params;

  const isNoModel =
    !modelPersona ||
    modelPersona === 'none' ||
    modelPersona.includes('无人物') ||
    modelPersona.includes('无需模特') ||
    modelPersona.includes('纯商品') ||
    modelPersona.includes('纯静物');

  const propsSection =
    productProps && Object.keys(productProps).length > 0
      ? `\n- 目标商品规格参数:\n${Object.entries(productProps)
          .map(([k, v]) => `  • ${k}: ${v}`)
          .join('\n')}\n`
      : '';

  const reverseBlock = reverseShots
    .map((s) => {
      const no = s.shot_no;
      return `### 分镜 ${no}
- image_type: ${s.image_type || 'photography'}
- has_human(反推判定): ${s.has_human === true}
- shot_type(反推判定): ${s.shot_type || 'pure_product'}
- title: ${s.title || `分镜 ${no}`}
- scene: ${s.scene || ''}
- negative_prompt: ${s.negative_prompt || '无'}
- reverse_prompt:
${s.reverse_prompt}`;
    })
    .join('\n\n');

  return appendPhoneGenerationPolicy(`你是电商「爆款复刻」提示词优化引擎。已完成对 ${referenceImageCount} 张外站参考图的全维反推；请结合目标商品，将每条 reverse_prompt 改写成**可直接生图的最终 prompt**。

## 目标商品
- 标题: ${productTitle}${propsSection}${
    productFingerprint ? `- 商品指纹摘要: ${productFingerprint}\n` : ''
  }${templateStyle && templateStyle !== 'auto' ? `- 风格架构参考（可吸收美学，勿整段照抄）:\n${templateStyle}\n` : ''}
- 模特人设: ${isNoModel ? '纯商品静物，无人物' : modelPersona}
- 专属正脸垫图: ${hasAnchorFace ? '已提供（生图时为 @图片3，仅五官 ID）' : '无'}

## 反推原文（按分镜，须 1:1 优化，不可丢镜）
${reverseBlock}

## 优化铁律
1. **保留反推九段结构**（【主体】【发型与面部】【穿搭或物体细节】【动作或摆放】【场景结构】【光影】【构图镜头】【材质与真实感】【画质与限制】），仅将商品相关段落中的具体外观替换为 **@图片1**。
2. **保留反推中的构图、机位、光影、景深、置景节奏与 image_type 对应的手法**；主体置换为当前目标商品。
3. **商品外观禁止文字硬描**（颜色几何、型号、支架形态等）；一律用 **@图片1** 指代商品实物外观。
4. **严禁出现 @图片2**，严禁写「以参考图为垫图 / 构图跟参考像素」——生图阶段只垫商品图，美学已写入文字。
5. ${
    isNoModel
      ? '全部分镜禁止人物/手部出镜；has_human=false, shot_type=pure_product。'
      : '人物是否出镜以各镜反推判定为准：反推无人物则禁止脑补模特；有人物则用人设定脸' +
        (hasAnchorFace ? '（五官 ID 用 @图片3）' : '') +
        '，表情用独立 expression 关键词，禁止抄参考图原模特身份。'
  }
6. 将各镜 negative_prompt 精简后追加到最终 prompt 末尾作为排除约束。
7. 清除鼠标光标、截屏边框、促销海报大字、参数贴纸等污染。
8. prompt 必须用简体中文；画面内必要外文可放中文引号内。
9. prompts 数组长度必须恰好等于 ${referenceImageCount}，shot_no 从 1 到 ${referenceImageCount}。

${extraRequirements ? `【用户定制补充要求】：\n${extraRequirements}\n` : ''}

## 输出 JSON
\`\`\`json
{
  "product_fingerprint": "对目标商品品类的简要提炼（只来自商品信息/商品图，勿抄旧竞品）",
  "model_anchor_features": "${
    isNoModel
      ? '无人物纯静物'
      : hasAnchorFace
        ? '已绑定专属真人模特正脸图 @图片3（仅五官）；表情由各镜文字关键词'
        : '按人设文字定型的新模特五官与发型摘要'
  }",
  "prompts": [
    {
      "shot_no": 1,
      "title": "短标题",
      "scene": "场景与光影",
      "expression": "有人物则写表情关键词，静物写无（静物）",
      "has_human": false,
      "shot_type": "pure_product",
      "image_type": "photography",
      "prompt": "【爆款复刻实拍】：……主体为 @图片1 所示商品实物……（保留九段结构，末尾附精简负面约束，无 @图片2）"
    }
  ]
}
\`\`\`
`, productTitle);
}
