/** 跨批次反雷同签名：场景 + 动作/表情库摘要 */
export interface PreviousGroupSignature {
  scene: string;
  actionDigest: string;
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
}

export interface ShotPrompt {
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

export interface StylePresetItem {
  id: string;
  name: string;
  category?: string;
  tag: string;
  desc: string;
  promptSnippet: string;
  isCustom?: boolean;
}

export const STYLE_PRESETS: StylePresetItem[] = [];

export function getMergedStylePresets(): StylePresetItem[] {
  return STYLE_PRESETS;
}

export function deletePresetItem(presetId: string): StylePresetItem[] {
  return STYLE_PRESETS;
}

export function resetPresetsToDefault(): StylePresetItem[] {
  return STYLE_PRESETS;
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
  if (typeof window === 'undefined') return DEFAULT_CATEGORIES;
  const saved = localStorage.getItem('custom_categories');
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
  if (typeof window === 'undefined') return list;
  try {
    localStorage.setItem('custom_categories', JSON.stringify(list));
  } catch {}
  return list;
}

export function deleteCategoryItem(catId: string): CategoryItem[] {
  if (typeof window === 'undefined') return [];
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

export const VISION_MODELS: VisionModel[] = [
  { 
    id: 'gemini-3.1-pro-preview-thinking-high', 
    name: 'Gemini 3.1 Pro (深度思考)',
    shortName: 'Gemini 3.1 Pro',
    provider: 'Google',
    badge: '首选推荐',
    description: 'Google 旗舰视觉模型，中文生活化场景推断最强'
  },
  { 
    id: 'gpt-5.6-luna', 
    name: 'gpt-5.6-luna (多模态)',
    shortName: 'gpt-5.6-luna',
    provider: 'OpenAI',
    badge: '多模态',
    description: 'OpenAI 新一代多模态视觉推理与生活化空间构图'
  },
  { 
    id: 'gemini-3.7-flash', 
    name: 'gemini-3.7-flash',
    shortName: 'gemini-3.7-flash',
    provider: 'Google',
    badge: '多模态极速',
    description: 'Google 新一代多模态推理与生活化场景解构'
  },
  { 
    id: 'gpt-5.5-pro', 
    name: 'GPT 5.5 Pro',
    shortName: 'GPT 5.5 Pro',
    provider: 'OpenAI',
    badge: '多模态旗舰',
    description: 'OpenAI 顶级综合理解能力与物理一致性把控'
  },
  { 
    id: 'grok-4.6', 
    name: 'Grok 4.6 (反AI纪实)',
    shortName: 'Grok 4.6',
    provider: 'xAI',
    badge: '反AI纪实',
    description: 'xAI 自然语言表达与生活感反 AI 拍摄提示词生成'
  },
  { 
    id: 'claude-3-7-sonnet-thinking', 
    name: 'Claude 3.7 Sonnet (思考)',
    shortName: 'Claude 3.7 Sonnet',
    provider: 'Anthropic',
    badge: '深度推理',
    description: 'Anthropic 旗舰思考模型，超高审美细节与质感策划'
  },
  { 
    id: 'gemini-2.5-flash', 
    name: 'Gemini 2.5 Flash',
    shortName: 'Gemini 2.5 Flash',
    provider: 'Google',
    badge: '极速秒级',
    description: '秒级极速响应，适合轻量级快速分镜构思'
  }
];

export function pickVisionAnalyzeFallbacks(selectedId: string, availableIds: string[]): string[] {
  const selected = (selectedId || '').trim();
  const ids = availableIds.map((id) => String(id || '').trim()).filter(Boolean);
  const preferred = ['gemini-3.7-flash', 'gemini-2.5-flash'];
  const isThinking = (id: string) => {
    const s = id.toLowerCase();
    return s.includes('thinking') || s.includes('luna') || s.includes('terra') || s.includes('pro-preview');
  };
  const picked: string[] = [];
  for (const id of preferred) {
    if (id !== selected && ids.includes(id) && !picked.includes(id)) picked.push(id);
  }
  for (const id of ids) {
    if (picked.length >= 2) break;
    if (id === selected || picked.includes(id) || isThinking(id)) continue;
    picked.push(id);
  }
  return picked.slice(0, 2);
}

export function normalizeVisionModelId(modelId?: string): string {
  if (!modelId) return 'gpt-5.6-luna';
  const clean = modelId.trim().toLowerCase();
  if (clean === 'gpt-4-vision-preview' || clean === 'gpt-4-turbo-vision') {
    return 'gpt-4o';
  }
  if (clean === 'gemini-1.5-flash' || clean === 'gemini-2.0-flash') {
    return 'gemini-2.5-flash';
  }
  if (clean === 'gemini-1.5-pro' || clean === 'gemini-2.5-pro') {
    return 'gemini-3.1-pro-preview-thinking-high';
  }
  if (clean === 'claude-3-5-sonnet' || clean === 'claude-3-5-sonnet-20241022') {
    return 'claude-3-7-sonnet-thinking';
  }
  return modelId;
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
  } = params;

  const isNoModel =
    architectureMode === 'pure_product' ||
    !modelPersona ||
    modelPersona === 'none' ||
    modelPersona.includes('无人物') ||
    modelPersona.includes('无需模特') ||
    modelPersona.includes('纯商品') ||
    modelPersona.includes('纯静物');

  const propsSection = productProps && Object.keys(productProps).length > 0
    ? `\n- 核心规格参数 (Props):\n${Object.entries(productProps).map(([k, v]) => `  • ${k}: ${v}`).join('\n')}`
    : '';

  const sigList = (previousGroupSignatures || [])
    .filter((s) => s && (s.scene || s.actionDigest))
    .slice(0, 3);
  const legacyScenes = (previousMasterScenes || []).filter(Boolean).slice(0, 2);
  const antiDupLines: string[] = [];
  if (sigList.length > 0) {
    sigList.forEach((s, i) => {
      antiDupLines.push(
        `${i + 1}. 场景：${s.scene || '（空）'}｜动作表情库：${s.actionDigest || '（空）'}`
      );
    });
  } else if (legacyScenes.length > 0) {
    legacyScenes.forEach((s, i) => antiDupLines.push(`${i + 1}. ${s}`));
  }

  const antiDupSection = antiDupLines.length > 0
    ? `\n## 🚨 跨批次反雷同（必须换场景类型与动作库）
本会话近期已用过的组签名（禁止再复用同类空间/同一套动作表情库）：
${antiDupLines.join('\n')}
- 必须换一个**明显不同的场景类型**（如：上次咖啡厅 → 本次阳台/书房/街角窗边/酒店大厅/度假外景等）。
- 必须换一套**表情与动作库**，禁止总是「甜笑托腮 + 同机位」。
- style_bible 的风格形容词也须与上批拉开（如纪实街拍 ↔ 度假柔光 ↔ 咖啡馆窗边）。
`
    : '';

  // 预分配差异轴，写入 system prompt，降低模型雷同
  const diversityHints = Array.from({ length: shotCount }, (_, i) => {
    const n = i + 1;
    const pool = [
      { e: '浅笑望向镜头外', a: '双手自然垂落，微微前倾', c: '35mm 全景定场', g: '平视' },
      { e: '微蹙眉专注看手中物', a: '一手轻托商品靠近胸口', c: '50mm 斜侧中景', g: '45° 斜侧' },
      { e: '半侧脸轻抿唇', a: '侧身靠墙一手插袋', c: '85mm 中近景', g: '微俯' },
      { e: '开怀短笑', a: '坐姿捧物置于膝上', c: '28mm 广角纵深', g: '低机位仰拍' },
      { e: '平静直视前方', a: '行走中回眸', c: '70mm 半身', g: '平视半身' },
      { e: '抬头望向远处光源', a: '俯身整理道具', c: '40mm 生活侧视', g: '过肩侧视' },
    ][i % 6];
    return `- 镜 ${n}：表情「${pool.e}」｜动作「${pool.a}」｜机位「${pool.c} / ${pool.g}」`;
  }).join('\n');

  const identityLock = isNoModel
    ? `## 【Identity Lock · 身份锁】
- 本次为**纯商品/静物**组图：全套 \`has_human: false\`，禁止出现模特、人脸、发型、身体。
- identity_bible 写：纯商品静物，无人物。`
    : `## 【Identity Lock · 身份锁】
- 全套 ${shotCount} 镜必须是**同一位年轻东亚模特身份**（默认年轻东亚男性气质，除非架构/人设另行指定），禁止中途换人、换发型主色、换年龄感。
${hasAnchorFace
  ? `- 已挂载【专属正脸 ID 图】（多模态中位于商品图之后）：仅作五官骨相与身份特征参考；**严禁**照搬正脸图背景、死板表情或拍摄角度。
- 生图垫图约定：@图片1=商品，@图片2=正脸 ID 特写板；场景定桩（若有）为 @图片3。提示词中人物五官用「@图片2」指代。`
  : `- 无人脸垫图时，面容按下列人设定型（写入 identity_bible，并在每镜复用关键特征词）：
【${modelPersona || '一位清透自然的年轻东亚模特'}】`}
- 解剖学硬约束：两臂十指、双腿，禁止多余肢体。`;

  const lookLock = isNoModel
    ? `## 【Look Lock · 穿搭/陈设锁】
- 纯静物：无需服饰锁；look_bible 写商品陈设主色与材质气质摘要即可；look_parts 可省略。
- product_role 固定为 \`placed_object\`。`
    : `## 【Look Lock · 服饰配饰锁 · 商品角色优先】
- **先判定 product_role**（必填其一）：
  - \`worn_apparel\`：商品是衣服/外套/裙裤等**穿在身上**的服装 → 模特必须穿着 @图片1；**禁止**在 look_parts.top/bottom 写任何颜色或版型文字；top 只能写「穿着 @图片1 所示服装」。
  - \`worn_accessory\`：项链/包/鞋/手表等**佩戴类** → accessory（或 shoes）只写「佩戴/使用 @图片1」，禁止描写商品几何。
  - \`held_object\`：手机/杯/数码等**手持** → 服饰可协调自拟，但**禁止**把商品写成「脖子佩戴」；商品外观只认 @图片1。
  - \`placed_object\`：纯陈设静物（若误判人物模式勿用）。
- 全套复用同一 look_bible / look_parts；禁止中途换穿搭主色或核心单品（**商品本身除外：商品只认垫图**）。
- **严禁文字描写商品颜色/几何/支架/镜头排列**；外观唯一真相是 @图片1。
- 服务端按 8 段硬模板拼装最终 prompt，字段准确优先：
  \`[主体];[上装];[下装];[鞋履];[配饰];[道具];[场景];[风格]\` + 表情·动作·光学。`;

  return `# Role: 擅长拍摄「种草级」人像大片的摄影师，专注年轻人配饰美学与画面细节；描述须让画面充满时尚博主精致感，目标是「极度真实、毫无 AI 感」的照片级提示词。

你的任务：根据【目标商品实物图 @图片1】${hasAnchorFace && !isNoModel ? '与【专属正脸 ID 图】' : ''}及【品类/自定义提示词架构】，为商品策划一套 ${shotCount} 镜**同一身份 · 同一穿搭 · 同一主空间**、但**表情/动作/机位强制差异化**的结构化字段（最终中文 Prompt 由系统按 8 段骨架拼装）。

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
## 【Scene Lock · 场景锁】
1. **先写唯一 master_scene**：同一主空间 + 统一光色；背景干净有质感（度假/咖啡厅/酒店大厅等），严禁非现实风格与杂物（梯子、垃圾桶等）。
2. 每镜 \`scene\` 必须复用 master_scene 的关键词；分镜只换**机位/景别/构图焦点**，禁止换房。
3. 严禁黑暗逼仄、杂乱电竞废墟、土味霓虹。

---
## 【Style Lock · 风格锁】
- 写唯一 style_bible：风格形容词 + 光线类型 + 8K 高清极度真实写实。
- 全套共用 style_bible；组内差异只体现在表情/动作/机位，不换整体风格流派。

---
## 【Diversity Axis · 组内差异轴】（最高优先级之一）
全套 ${shotCount} 镜的 \`expression\` / \`action\` / \`camera_focal_length\`+\`angle\` **必须两两明显不同**。
建议按下列预分配执行（可微调措辞，但不可两镜撞车）：
${diversityHints}
- 每镜 JSON 必须写出独立的 expression、action、prop、optics 字段。
- prompt 字段可写简短草稿；服务端会用结构化字段重拼，字段准确优先于 prompt 文采。
- **prompt 字段（及字段内描述）必须使用简体中文**，禁止整段英文 prompt；画面内需显示的外文可放在中文引号内。

---
## 【激活的品类/自定义提示词架构】
==================== START ====================
${templateStyle}
==================== END ======================
- 若架构覆盖场景/光影/风格段：以架构为准写入 master_scene / style_bible，但仍强制 Identity + Look + Diversity。
- 若架构未指定服饰：按 product_role 补全 look_parts（**worn_apparel 不得自造服装颜色**）。
- 带屏设备：屏幕内容须高审美艺术壁纸或真实知名游戏实机画面；严禁暗黑机甲/虚假仪表盘/电商详情页 UI。

---
## 【去广告 & 商品外观禁令】
- 禁止外包装盒、价签、促销贴纸、参数水印、鼠标光标与截屏边框。
- **严禁文字描写商品几何/支架/镜头排列**；主体一律 @图片1。
${antiDupSection}
${extraRequirements ? `\n【用户定制补充要求】：\n${extraRequirements}\n` : ''}
## 输出格式（合法 JSON，无 Markdown 前言）
\`\`\`json
{
  "product_fingerprint": "商品品类简要提炼（含是否服饰/配饰/手持）",
  "product_role": "${isNoModel ? 'placed_object' : 'worn_apparel | worn_accessory | held_object | placed_object'}",
  "master_scene": "全套统一主空间与光色关键词（须足够具体）",
  "style_bible": "风格形容词 + 光线类型 + 真实写实质感",
  "look_bible": "${isNoModel ? '陈设主色与材质气质摘要' : '穿搭摘要（服饰商品勿写颜色，只写 @图片1）'}",
  "look_parts": {
    "top": "${isNoModel ? '' : 'worn_apparel 时写：穿着 @图片1 所示服装；其他角色可写协调上装'}",
    "bottom": "${isNoModel ? '' : '协调下装（勿抢商品）'}",
    "shoes": "${isNoModel ? '' : '简约鞋履或 worn_accessory 时 @图片1'}",
    "accessory": "${isNoModel ? '' : 'worn_accessory 时佩戴 @图片1；worn_apparel 勿写脖子佩戴商品'}"
  },
  "identity_bible": "${isNoModel ? '纯商品静物，无人物' : (hasAnchorFace ? '已绑定专属正脸 @图片2（仅五官 ID）+ 关键体态特征短句' : '人设五官发型妆容关键特征短句')}",
  "has_human": ${isNoModel ? 'false' : 'true'},
  "prompts": [
    {
      "shot_no": 1,
      "title": "分镜短标题（含机位意图）",
      "scene": "复用 master_scene 关键词 + 本镜机位景别",
      "expression": "${isNoModel ? '无（静物）' : '本镜独有表情关键词'}",
      "action": "${isNoModel ? '商品摆放/使用状态' : '本镜独有动作或道具互动'}",
      "prop": "本镜道具短句",
      "optics": "本镜光学短句",
      "camera_focal_length": "如 35mm 人文 / 85mm 特写",
      "angle": "如 平视 / 45° 斜侧 / 微俯",
      "lighting_type": "与 master_scene / style_bible 统一的光色描述",
      "has_human": ${isNoModel ? 'false' : 'true'},
      "shot_type": "${isNoModel ? 'pure_product' : 'model_shot'}",
      "prompt": "可选短草稿（系统会按字段重拼）"
    }
  ]
}
\`\`\`
- prompts 数组长度必须恰好为 ${shotCount}，shot_no 从 1 到 ${shotCount}。
- product_role 必须与商品实物一致（衬衫/外套等=worn_apparel）。
`;
}

// ---------------------------------------------------------------------------
// 模特人脸人设预设库 (用于换人换品工坊)
// ---------------------------------------------------------------------------
export interface ModelPersonaItem {
  id: string;
  name: string;
  tag: string;
  desc: string;
  facePromptSnippet: string;
}

export const MODEL_PERSONAS: ModelPersonaItem[] = [
  {
    id: 'pure_product_no_human',
    name: '🚫 纯商品实物 (无需模特/无人脸)',
    tag: '纯静物特写 · 数码3C/美妆/鞋服 · 构图复刻',
    desc: '原图或目标为纯静物、数码产品、桌面摆拍、开箱特写等，无需人物模特，100% 聚焦商品质感与光影机位。',
    facePromptSnippet: '无人物/无模特/纯静物商品实拍'
  },
  {
    id: 'asian_sweet',
    name: '🌸 亚洲清纯甜美女生',
    tag: '自然裸妆 · 微表情灵动 · 亲和力',
    desc: '20-25岁年轻东亚女生，清透伪素颜裸妆、灵动的眼神微表情、乌黑柔顺中长发，极具真实种草感。',
    facePromptSnippet: '一位22岁左右清纯可爱的东亚年轻女生，皮肤清透自然带有微微水光感，精致干净的伪素颜裸妆，灵动亲切的眼神，黑色柔顺齐肩微卷发，表情自然甜美，极具生活呼吸感真实买家秀抓拍。'
  },
  {
    id: 'high_cold_chic',
    name: '🖤 极简高级冷淡风御姐',
    tag: '立体骨相 · 利落松弛 · 质感高级',
    desc: '25-28岁现代独立女性，立体清晰的面部折叠度、利落微卷黑发、高级冷淡又松弛的神态。',
    facePromptSnippet: '一位26岁左右气质高级清冷的亚洲年轻女性，面部骨相立体清晰，五官精致利落，微卷黑色锁骨发，神情自信松弛，自然哑光高级妆容，极具现代大女主独立气质与高级时尚感。'
  },
  {
    id: 'japanese_salt',
    name: '🌿 日系盐系文艺治愈风',
    tag: '氧气透亮 · 干净治愈 · 温暖日杂',
    desc: '20-24岁日杂风女生，干净透亮的眼神，空气感短发或低马尾，清新温润，如同日剧女主角。',
    facePromptSnippet: '一位清新治愈的日系年轻女生，白皙透亮的氧气感肌肤，清澈温柔的眼神，略带空气感的蓬松短发，穿着舒适简约棉麻衬衫，温暖治愈的浅笑，具有日杂胶片写真的真实感与生活温度。'
  },
  {
    id: 'street_trend',
    name: '🕶️ 甜酷街头潮人博主',
    tag: '潮酷态度 · 时髦个性 · 表现力拉满',
    desc: '22-26岁潮流博主，利落发型、微挑眼线与个性穿搭，眼神带有一丝拽酷与自信。',
    facePromptSnippet: '一位个性帅气的东亚年轻潮流女生，时髦微湿发造型，五官利落精致，眼神坚定自信，带有轻微街头酷感与现代时尚表现力，真实手机后置抓拍无过度磨皮。'
  },
  {
    id: 'geek_young_guy',
    name: '👨‍💻 阳光极客数码帅哥',
    tag: '清爽短发 · 轮廓分明 · 数码生活家',
    desc: '23-27岁阳光干净男生，清爽黑短发、分明的下颌线与修长干净的双手。',
    facePromptSnippet: '一位24岁阳光清爽的亚洲年轻男生，干净利落的黑色短发，清晰分明的面部轮廓，修长干净的手指正在自然互动，神情专注且富有亲和力，真实数码极客生活实拍。'
  },
  {
    id: 'gentle_mom',
    name: '👶 温柔年轻宝妈',
    tag: '温婉大方 · 居家亲和 · 幸福感',
    desc: '27-32岁温柔大方年轻妈妈，温和亲切的笑容、干净温婉的气质。',
    facePromptSnippet: '一位28岁左右温婉大方的年轻妈妈，面容温润亲切，眼神充满温柔爱意，低扎发髻，淡雅舒适的居家妆容，笑容自然温和，极具家庭温馨感与真实可信度。'
  }
];

export function buildSocialFaceSwapSystemPrompt(params: {
  productTitle: string;
  productProps?: Record<string, string>;
  referenceImageCount: number;
  modelPersona: string;
  hasAnchorFace?: boolean;
  productFingerprint?: string;
  extraRequirements?: string;
}): string {
  const { productTitle, productProps, referenceImageCount, modelPersona, hasAnchorFace = false, productFingerprint, extraRequirements } = params;
  const isNoModel = !modelPersona || modelPersona === 'none' || modelPersona.includes('无人物') || modelPersona.includes('无需模特') || modelPersona.includes('纯商品') || modelPersona.includes('纯静物');

  const propsSection = productProps && Object.keys(productProps).length > 0
    ? `\n- 目标商品规格参数 (Props):\n${Object.entries(productProps).map(([k, v]) => `  • ${k}: ${v}`).join('\n')}\n`
    : '';

  return `你是一位顶级社交媒体电商【爆款图文创意复刻与商品置换】视觉总监与摄影提示词专家。
本次制作任务是：【爆款图文创意复刻工坊（目标商品实物主体置换 + 爆款黄金构图与光影美学汲取 + ${isNoModel ? '纯商品置景与质感升级' : (hasAnchorFace ? '专属真人模特面容克隆' : '模特人脸一致性克隆')}）】。

用户从外部社交平台（小红书/抖音）采集并勾选了 ${referenceImageCount} 张高颜值真实爆款参考图片，并传入了目标商品实物素材图。
- 目标商品标题: ${productTitle}${propsSection}

你必须逐张深度解构这 ${referenceImageCount} 张爆款参考图的精髓机位、光影体系、空间层次与道具美学，为目标商品打造**既精准传承爆款视觉冲击力、又极具真实高级生活质感的全新实拍摄影组图**！

---
## 🚨 生图垫图槽位铁律（提示词必须与此一致）
生图时每镜垫图顺序固定为：
- **@图片1** = 目标商品实物图（外观唯一真相）
- **@图片2** = 本镜对应的爆款社媒参考图（构图/场景/肢体动作；仅头朝向与嘴开合程度可参考）
${hasAnchorFace ? `- **@图片3** = 专属真人模特正脸图（仅五官 ID 定型；严禁照搬其背景、机位、死板表情）
` : ''}
人物分镜强制句式骨架：构图/动作/头位 ← @图片2；表情 ← 文字关键词；五官 ID ← ${hasAnchorFace ? '@图片3' : '文字人设'}；商品外观 ← @图片1。

---
## 🚨 最高红线铁律一：【严禁生成商业广告海报、促销文案与参数排版！】
🚨 **绝对铁律：严禁将买家秀参考图画成电商海报、促销页横幅或参数卡片！**
- **严禁文字污染**：画面中严禁生成任何宣传口号、促销标题（如“超流畅”、“2K 240Hz”、“0.03ms”等型号参数）、参数指标框、商品性能徽标或平面 UI 贴纸！
- **严禁照抄商品素材图自带的海报背景**：传入的【目标商品实物图】仅供提取真实商品工业外观，**绝对严禁将商品素材图自带的纯白底、电商广告文案或海报背景当成场景！**
- **真实生活摄影质感**：所有分镜必须 100% 还原为真实相机/手机在自然生活光影下拍摄的【真实买家秀实拍照片】，呈现细腻自然的漫反射光影与生活桌面质感，严禁任何平面广告海报感！

---
## 🚨 最高红线铁律二：【彻底排斥鼠标光标、系统UI与截屏工件 (Anti-Screenshot Artifacts)】
🚨 **绝对铁律：严禁在画面中出现任何鼠标箭头、光标指针或截屏残留物！**
- **严禁鼠标指针**：参考图若来自社交媒体截屏，可能带有电脑鼠标指针（白色箭头/手形光标/I型光标），**必须彻底清除与排斥，绝不允许将其当成画面元素画入生成图**！
- **严禁系统与浏览器UI**：严禁出现浏览器边框、地址栏、系统任务栏、桌面图标、播放器进度条或手机状态栏图标！画面必须是纯粹、干净、无UI干扰的高清摄影原图！

---
## 🚨 最高红线铁律三：【严禁在提示词中用文字生硬描写商品外观细节！】
🚨 **绝对铁律：严禁在提示词中描写商品的外观、支架形态、底座几何、边框粗细、配色或型号参数！**
- **为什么绝对禁止描述商品外观？**：因为文字描述会严重污染生图模型的图像输入权重，导致 AI 自作主张画出与实物垫图不符的底座与机身！
- **正确做法**：所有分镜提示词中，主体一律使用【@图片1（目标商品实物图）】指代（如：\`一部真实手机后置主摄拍摄的高清买家秀照片，主体为 @图片1，安装完毕并自然放置在桌面增高架上...\`）；
- **商品外观 100% 由输入的实物垫图决定，提示词仅负责复刻并优化场景、机位、手部姿态、自然光影和屏幕内容！**

---
## 🚨 最高红线铁律四：【防穿帮 — 忽略参考图旧商品与正脸图场景】
1. **忽略 @图片2 中的旧商品/品牌/机身几何**：主体外观只认 @图片1；参考图里的旧手机、旧壳、竞品必须被置换掉，禁止抄旧 SKU 外观。
2. **忽略 @图片2 中旧模特身份五官**：发型/穿搭可服务场景，但五官骨相必须来自 ${hasAnchorFace ? '@图片3' : '指定人设文字'}。
3. ${hasAnchorFace ? '**严禁复用 @图片3 的背景、机位、表情与拍摄角度**：@图片3 只提供五官 ID，禁止抄正脸板眨眼/嘟嘴/证件照表情。' : '无正脸垫图时，面容按人设文字定型；动作/头位跟 @图片2，表情用自然语言关键词。'}
4. **product_fingerprint 只能来自目标商品图**，禁止从社媒参考图提取旧商品指纹。

---
## 🌟 核心摄影法则：【黄金构图精准复刻 + 真实光影重构升级 (Creative Re-Lighting)】
🚨 **分镜 1~N 必须与用户传入的 爆款参考图 1~N 严格逐张 1:1 对应复刻构图精髓，并进行真实光影重构与质感升级：**
1. **机位与景别 1:1 精准继承**：
   - 严格继承对应参考图的黄金构图点、透视角度（俯拍/平视/45°微俯/局部微距）、相机景深（大光圈背景虚化/超广角纵深）；构图与透视以 @图片2 像素为准；
2. **物理重光照与环境融合 (Realistic Re-Lighting)**：
   - 将 @图片1 真实自然地融入对应参考图的环境光影中，根据现场主光源方向生成精准的明暗过渡、侧逆光轮廓微反光与贴合桌面的真实重力接触阴影 (Contact Shadow)，告别生硬抠图贴片假感；
3. **生活化置景（克制）**：
   - 保持原参考图的整体空间调性与主要道具布局；**禁止大幅发明新道具或 10%~20%「美学升级」改景**，以免穿帮；仅允许微调光影与质感清晰度。

---

${isNoModel ? `
## 🚨 【特别指令：本次任务已被指定为纯商品/静物复刻模式（无人物/无模特）】
- 100% 所有分镜均严格禁止出现任何人物、模特、人脸、发型、妆容、手部或身体！
- 全部分镜严格按照【类型 A：纯商品静物特写】进行构图、光影、视角与细节复刻，将场景中的原主体替换为【@图片1】；
- **【屏幕亮屏内容规范】**：若参考图为亮屏状态，必须指定高审美艺术壁纸或市面上真实存在的知名热门 3A 游戏实机大作（如《黑神话: 悟空》、《赛博朋克 2077》、《CS2》、《无畏契约》、《极限竞速: 地平线 5》、《原神》、《艾尔登法环》），严禁生成虚假四不像游戏；
- 必须严格标记："has_human": false, "shot_type": "pure_product"。
` : `
## 🌟 核心判断法则：画面主体类型精准鉴别 (图集“有人物”与“无人物纯静物”混合共存法则)

在真实的电商买家秀图文中，用户勾选的图集通常是 **【真人模特自拍/买家秀】与【纯手机背板/屏幕特写/配件壳/桌面静物】混合在一起的**！
🚨 **你必须对传入的每一张参考图进行严格独立判定，严禁相互干扰，严禁对无人物图脑补人物！**

### 1. 【类型 A：纯商品静物 / 手机背板微距 / 屏幕特写 / 手机壳 / 桌面摆拍 / 拆箱（无人物出镜）】
- 🚨 **最高红线禁令：如果某张参考图原本就没有人物/模特：**
  - **100% 严格禁止添加任何模特、女生、人脸、发型、妆容、身体、自拍或“整理头发”等动作！**
  - **即使用户上传了专属人脸或设定了模特，也绝对禁止在该分镜中添加模特！该分镜必须 100% 保持无人物纯静物！**
  - 必须保持 100% 纯商品摄影画风，将主体替换为【@图片1】；
  - **【屏幕亮屏内容规范】**：亮屏必须指定高审美艺术壁纸或知名热门大作（如《黑神话: 悟空》、《赛博朋克 2077》、《CS2》、《无畏契约》、《极限竞速: 地平线 5》等）；
  - 详尽复刻并升级原图的拍摄角度、桌面材质与自然漫射光影，杜绝任何鼠标光标或UI水印；
  - 提示词开头范式：【一部高像素智能手机后置摄像头拍摄的超高清商品微距静物实拍照片，画面纯净无人物、无鼠标指针与UI水印，正中央展示【@图片1】...】；
  - 必须严格标记：\`"has_human": false\`, \`"shot_type": "pure_product"\`。

### 2. 【类型 B：纯手持特写 / 局部手模展示（仅出现单手/双手持机，无人物面部与身体）】
- 仅描摹自然干净修长的手指握持机身边缘或局部操作特写，**严禁添加模特面部五官、发型或全身衣着**；
- 提示词开头范式：【一部高像素智能手机拍摄的买家秀局部手持特写照片，纯手部近景无面部无人物，一只干净自然的手稳稳握持【@图片1】...】；
- 必须标记：\`"has_human": false\`, \`"shot_type": "hand_held_only"\`。

### 3. 【类型 C：模特真人出镜 / 自拍 / 穿搭街拍（原参考图本身确实有人物出镜）】
- 🚨 **仅当该张参考图原本就真实包含真人模特/人物时，才执行模特换脸/人脸克隆**：
- 🚨 **【人脸五官定型 (ID) / 姿势 (Pose) / 表情 (Expression) 三路解耦铁律】**：
  1. 👑 **参考人脸图（Anchor Face / ${hasAnchorFace ? '@图片3' : '人设文字'}）的唯一职责**：**【人脸五官骨相与身份特征（ID）】**！**严禁照搬人脸定型图上的死板表情、固定角度或背景场景**！
  2. 📸 **参考分镜图（@图片2）的职责**：**肢体动作、手持姿态、头部朝向、嘴开合程度、场景机位**；**禁止从 @图片2 抄任何眉眼鼻唇五官身份，也禁止整脸抄其微表情（笑意/嘟嘴/眨眼/挑眉）**！
     - 将 ${hasAnchorFace ? '@图片3' : '人设'} 的五官骨相无痕嵌入 @图片2 的身体姿势中；仅嘴开合/头朝向可跟 @图片2，五官轮廓与眉眼神态绝不能跟 @图片2 原模特！
  3. ✍️ **表情职责归文字关键词**：每镜必须输出独立的 \`expression\` 字段与 prompt 内「表情关键词：…」；按场景写自然生动神态（如浅笑望向镜头、微蹙眉专注、平静直视），**禁止写「同参考图表情」「表情跟 @图片2/@图片3」**；组内人物镜表情尽量两两不同。
${hasAnchorFace ? `
- 👑 **【专属真人模特正脸克隆（仅应用于原图有人物的分镜）】**：
  - 槽位声明：【机位/场景/肢体姿势/头位以 @图片2 为准（忽略其五官身份与整脸表情）；人物五官骨相只认 @图片3；表情只认文字关键词；商品外观只认 @图片1】；
  - 可写头朝向与嘴开合关键词（如「微侧头、嘴自然闭合」），**严禁写「五官/脸型/表情跟参考图」**；
  - 禁止在 prompt 中描述模糊脸、马赛克遮挡、打码脸；
  - **【解剖学与肢体防幻觉铁律】**：画面中人物**严格仅有两只手臂，双手严格共计 10 根手指，下肢仅两条腿**；
  - 必须标记：\`"has_human": true\`, \`"shot_type": "model_shot"\`。
` : `
- 将人物面容五官定型为：【${modelPersona}】；
- 动作与姿势严格继承 @图片2；表情用自然语言关键词；禁止发明参考图没有的道具；
- **【解剖学与肢体防幻觉铁律】**：严格两臂十指、双腿；
  - 必须标记：\`"has_human": true\`, \`"shot_type": "model_shot"\`。
`}
`}

---

## 1:1 精准构图与文字职责
- 构图、透视、景别、场景空间以 @图片2 为准；文字负责写清**表情关键词**与左右手分工，禁止用模糊代称敷衍（如“同款姿势”）。
- 有人物时写清本镜独有表情关键词（平静直视/托腮浅笑/专注看向手中物等，**由文字生成，禁止抄 @图片2/@图片3 像素表情**）与手部握持；禁止大段臆造与 @图片2 冲突的新场景或道具。

${extraRequirements ? `【用户定制补充要求】：\n${extraRequirements}\n` : ''}

## 输出格式要求
- **prompt 字段必须使用简体中文**书写画面描述，禁止整段英文 prompt；画面内需显示的外文品牌/文案可放在中文引号内。
- 🚨 **分镜数量绝对严格对齐（不多也不少）**：\`prompts\` 数组长度必须恰好等于 ${referenceImageCount}，\`shot_no\` 从 1 到 ${referenceImageCount}，与参考图 1..${referenceImageCount} 一一对应。下面 JSON 只展示 **1 条对象的字段结构**，实际回复必须输出全部 ${referenceImageCount} 条，严禁只抄示例条数。
必须严格输出合法的 JSON 代码块，严禁包含 Markdown 前言或多余废话：
\`\`\`json
{
  "product_fingerprint": "对目标商品品类的简要提炼",
  "model_anchor_features": "${hasAnchorFace ? '已绑定专属真人模特正脸图 @图片3（仅作五官骨相定型；动作/头位依各分镜 @图片2；表情由各镜文字关键词）' : '对新模特人脸、发型、妆容、五官特征的标准化设定（若全套图无人物则写无人物纯静物）'}",
  "prompts": [
    {
      "shot_no": 1,
      "title": "分镜 1：对应参考图1的构图要点（结构示例；须继续写到分镜 ${referenceImageCount}）",
      "scene": "对应参考图1的场景与光影",
      "expression": "有人物则写独立表情关键词，静物写无（静物）",
      "has_human": false,
      "shot_type": "pure_product",
      "prompt": "【爆款构图复刻与商品置换实拍】：以 @图片2 为本镜构图与机位基准，忽略 @图片2 中旧商品外观。主体精准替换为 @图片1 所示商品实物，保留本镜参考图的景深、置景与光影，对 @图片1 做物理重光照与接触阴影，无鼠标光标、截屏边框或广告文字。"
    }
  ]
}
\`\`\`
`;
}
