import { REVERSE_ENGINE_CORE_SPEC } from './reverseEngineCoreSpec';
export { REVERSE_ENGINE_CORE_SPEC } from './reverseEngineCoreSpec';
import { domainEnv } from '../../core/runtime';
import type { SubCategoryDef } from '../../products/productCategory';
import { PHONE_REVERSE_POLICY } from '../../products/phoneProductPolicy';
import { categoryArchitectureGuidance } from '../assetCategoryArchitecture';

/** 中文反推提示词最低字数要求（与 validate.ts MIN_PROMPT_LENGTH 同步） */
export const MIN_REVERSE_PROMPT_LENGTH = 180;

export const OFFICIAL_REVERSE_SYSTEM_PROMPT = REVERSE_ENGINE_CORE_SPEC;

const REVERSE_PROMPT_SECTIONS = `【主体】【发型与面部】【穿搭或物体细节】【动作或摆放】【场景结构】【光影】【构图镜头】【材质与真实感】【画质与限制】`;

const PROMPT_GOOD_BAD_EXAMPLES = `
## reverse_prompt_zh 正反例

❌ 错误（短标签串，禁止）：
"年轻女性，浅金长发，粉色连衣裙，手提包，车道，双开门，阳光。"

✅ 正确（九段分段长文，≥180字，纪实摄影笔触，拒绝AI塑料套话）：
"【主体】年轻东亚女性侧身动态转身，位于画面中央偏右，占画面约六成，身体朝向左前方，视线回望镜头。
【发型与面部】浅白金色飘逸长发随风扬起半遮面部，呈现清晰原生发丝结构，露出自然骨相轮廓，皮肤保留真实毛孔呼吸感与自然生活血色，神态从容松弛。
【穿搭或物体细节】浅粉色方领蕾丝花边短袖连衣裙，真丝混纺面料带有真实自然的微褶皱与垂坠感，手提粉色压纹皮革包袋配粗银链肩带。
【动作或摆放】身体重心落于右脚，左肩微前倾，右手自然下垂持包，头部微侧回望。
【场景结构】现代深色双开大门前的铺砌车道，门体位于画面右侧约占三分之一，两侧绿灌木修剪整齐，建筑立面为深棕木纹饰面。
【光影】午后约45°斜射暖调自然侧顺光，高对比度真实物理环境光在地面形成扎实接触阴影，绝无假发光与高光溢出。
【构图镜头】竖幅中全景，约35-50mm人文生活平视机位，真实渐进景深保留背景建筑细节。
【材质与真实感】柔软半透明蕾丝、哑光皮革压纹、粗糙石砖路面、金属链条冷亮反光，皮肤保留真实细微毛孔与微弱汗毛，绝无过度平滑磨皮。
【画质与限制】真实单反直出自然曝光，真实物理比例与透视，微弱自然空气颗粒感，严禁塑料磨皮、严禁3D渲染感、严禁过度锐化。"`;

export const VISUAL_ASSET_EVIDENCE_RULES = `
【逐图资产准入，优先于固定 JSON 示例】
has_human 只说明存在人体，手部不代表有人脸。persona_visibility 为 none/partial/identifiable，outfit_visibility 为 none/fragment/upper_body/full_body。
人物和穿搭分别输出 dimensions.audience：adult_male/adult_female/senior_male/senior_female/child_male/child_female/unknown；穿搭可用 adult_unisex/senior_unisex/child_unisex。依据明确年龄与适用人群证据，不凭发型、颜色或风格猜测；无法确认填 unknown。
仅当本图面部和发型可辨识时提取 persona，否则 persona=null；只见手、背影、遮脸不得补造人物。
仅当服装款式清晰可辨（上半身或全身）时提取 outfit，否则 outfit=null；局部袖口/衣角不算穿搭。未入镜部位填空，不要猜测。
顶层 persona 允许 null、outfits 允许 []，不得为了填满字段制造资产。所有 source_image_index 必须指向真实证据图。`;

const PER_IMAGE_JSON_TEMPLATE = (imageIndex: number) => `${VISUAL_ASSET_EVIDENCE_RULES}
{
      "image_index": ${imageIndex},
      "image_type": "photography | landscape | product | typography | ui | general | mixed",
      "title": "短标题（中文，8字以内）",
      "analysis_summary": "七步视觉分析摘要（画面总览、主体、场景空间结构、色彩、光影、材质、摄影构图）",
      "reverse_prompt_zh": "【主体】…\\n【发型与面部】…\\n【穿搭或物体细节】…\\n【动作或摆放】…\\n【场景结构】…\\n【光影】…\\n【构图镜头】…\\n【材质与真实感】…\\n【画质与限制】…（≥180字）",
      "negative_prompt_zh": "根据参考图生成的负面约束清单",
      "has_human": true,
      "persona_visibility": "none | partial | identifiable",
      "outfit_visibility": "none | fragment | upper_body | full_body",
      "shot_framing": "close_up | medium_full_body | low_angle_three_quarter_body | profile_half_body | profile_45 | macro_detail | high_angle_seated_full_body",
      "product_frame_ratio": 45,
      "scene": {
        "title": "纯物理空间标题",
        "description": "纯物理建筑、植物、地表肌理（严禁人物与衣服）",
        "lighting": "自然采光与物理接触阴影",
        "spatial_type": "outdoor_nature | indoor_room | tea_space | street | car_interior | desk_office"
      },
      "outfit": {
        "dimensions": {"audience": "unknown"},
        "title": "穿搭名称",
        "top": "上装款式材质",
        "bottom": "下装或裙装",
        "shoes": "鞋履搭配",
        "accessories": "配饰细节",
        "color_palette": "配色方案"
      },
      "action": {
        "title": "纯姿态机位标题（严禁服装名，如：斜向舒展覆手微距机位）",
        "action": "纯肢体姿势、手势、五官神态、视线交互",
        "camera": "约50mm平视半身机位 或 约85mm微距特写",
        "shot_type": "close_up | macro_detail | profile_half_body | medium_full_body",
        "focus_anatomy": "bracelet | necklace | ring | earring | hands | face | neck | hair | body",
        "suitable_categories": ["jewelry", "universal"],
        "suitable_anatomy": ["bracelet", "wrist"]
      },
      "persona": {
        "dimensions": {"audience": "unknown"},
        "name": "博主人设名",
        "hair": "真实发型发色",
        "face": "五官脸型特征",
        "skin": "原生肤质",
        "vibe": "神态气质"
      }
    }`;

function buildCategoryDeconstructGuidance(
  targetCategory?: string,
  userHint = '',
  customSubCategories?: SubCategoryDef[]
): string {
  const architecture = categoryArchitectureGuidance(targetCategory);
  if (customSubCategories && customSubCategories.length === 0) return `${architecture}\n当前实际文件夹未配置细分规则，请依据可见商品记录部位与标签，不补造默认类目或商品。`;
  if (customSubCategories && customSubCategories.length > 0) {
    const listLines = customSubCategories
      .map((sub, idx) => {
        const kw = sub.keywords && sub.keywords.length > 0 ? sub.keywords.slice(0, 6).join('、') : sub.label;
        const anatomyOptions = sub.anatomyOptions?.length ? sub.anatomyOptions : [sub.anatomy || sub.anchorId].filter(Boolean);
        const anatomy = anatomyOptions.length ? `允许部位 ${JSON.stringify(anatomyOptions)}；focus_anatomy 从中选择画面可见的一个部位，suitable_anatomy 仅记录其中实际可见的部位` : '未配置部位锚点；依据可见实物记录 focus_anatomy 与 suitable_anatomy，不补造身体部位';
        const short = sub.shortLabel || sub.label.split('/')[0];
        return `${idx + 1}. **${sub.label} (${sub.id})**: ${anatomy}；tags 建议包含 ["${sub.label}", "${short}特写"], 匹配特征/关键词: [${kw}]`;
      })
      .join('\n');

    return `
${architecture}

### 🏷️ 目标品类二级细分类目规范（强约束对齐）
当前任务重点解析【${targetCategory === 'jewelry' ? '珠宝首饰' : targetCategory || '指定品类'}】品类，必须严格对照以下用户类目表字典进行机位姿态拆解打标：
${listLines}

🚨 铁律约束：若画面重点展示相关商品与细节，必须从上述二级细分类目表中匹配最佳细分类目，并在 tags 中明确输出二级类目标签；有部位配置时按可见实物选择允许项，无部位配置时不得补造部位！
`;
  }

  const isJewelry = targetCategory === 'jewelry' || (!targetCategory && /首饰|珠宝|项链|戒指|手镯|手串|耳环|耳饰|发簪|胸针|jewelry|necklace/i.test(userHint));
  const isDigital = targetCategory === 'digital_3c' || (!targetCategory && /手机|数码|平板|耳机|手机壳|全面屏|镜头模组|digital/i.test(userHint));

  if (isJewelry) {
    return `
${architecture}

### 💎 珠宝首饰商拍二级细分类目规范（重点强化）
当前任务重点解析【珠宝首饰】品类，必须严格对照以下 6 大二级细分类目标准字典进行机位姿态打标：
1. **项链 / 锁骨链 (necklace)**: 聚焦锁骨、领口、颈肩；单手触锁骨、双指捻链托坠、垂眸俯视吊坠；focus_anatomy 必须为 "necklace"，suitable_anatomy 包含 ["necklace", "collarbone"]，tags 包含 ["首饰", "项链特写"]
2. **手镯 / 手链 / 手串 (bracelet)**: 聚焦手腕、小臂；双手理袖露腕、手腕搭肩搭胸、双手托腮露腕、端拿茶盏水杯；focus_anatomy 必须为 "wrist"，suitable_anatomy 包含 ["bracelet", "wrist"]，tags 包含 ["首饰", "手镯特写"]
3. **戒指 / 指环 (ring)**: 聚焦指尖、双手；单手抚唇/抚颊展戒、双手交叠置膝、手指微屈展示戒面；focus_anatomy 必须为 "fingers"，suitable_anatomy 包含 ["ring", "fingers"]，tags 包含 ["首饰", "戒指特写", "展戒"]
4. **耳饰 / 耳环 / 耳钉 (earring)**: 聚焦耳垂、下颌线、侧颜45度；单手轻挽耳际发丝（撩发露耳）、侧头微笑垂眸；focus_anatomy 必须为 "ear"，suitable_anatomy 包含 ["earring", "ear"]，tags 包含 ["首饰", "耳饰特写"]
5. **发饰 / 发簪 / 发夹 (hairpin)**: 聚焦发髻、后脑勺、盘发；双手挽发插簪、背影回眸；focus_anatomy 必须为 "hair"，suitable_anatomy 包含 ["hairpin", "hair"]，tags 包含 ["首饰", "发簪特写"]
6. **胸针 / 别针 / 领针 (brooch)**: 聚焦前胸衣襟、西装/大衣翻领；单手轻按翻领、端庄整理衣襟；focus_anatomy 必须为 "brooch"，suitable_anatomy 包含 ["brooch"]，tags 包含 ["首饰", "胸针特写"]

🚨 铁律约束：严禁使用空泛模糊的通用手部词。若画面重点展示珠宝饰品，必须从上述 6 类中精准匹配输出对应解剖词，并在 suitable_categories 中明确写入 "jewelry"！
`;
  }

  if (isDigital) {
    return `
${architecture}

### 📱 手机数码商拍细分规范（重点强化）
当前任务重点解析【手机数码】品类，必须严格对照以下细分类目进行打标：
1. **镜头模组 (camera_deco)**: focus_anatomy = "camera_deco", tags 包含 ["手机数码", "镜头模组"]
2. **正面屏幕 (screen_bezel)**: focus_anatomy = "screen_bezel", tags 包含 ["手机数码", "正面屏幕"]
3. **金属中框 (side_profile)**: focus_anatomy = "side_profile", tags 包含 ["手机数码", "金属中框"]
4. **握持操作/对镜自拍 (hand_holding)**: focus_anatomy = "hand_holding", tags 包含 ["手机数码", "握持操作"]
`;
  }

  return architecture;
}

function buildMachineJsonLayer(params: {
  imageCount: number;
  userHint?: string;
  targetCategory?: string;
  customSubCategories?: SubCategoryDef[];
  singleImageOnly?: boolean;
  imageIndex?: number;
}): string {
  const { imageCount, userHint = '', targetCategory, customSubCategories, singleImageOnly = false, imageIndex } = params;
  const isSingleImage = singleImageOnly || imageCount === 1;
  const focusIndex = imageIndex || (singleImageOnly ? imageCount : 1);

  const singleImageGuard = isSingleImage
    ? `\n🚨【单图铁律】只输出第 ${focusIndex} 张图片的分析；per_image 仅 1 条且 image_index=${focusIndex}；scenes/actions 各最多 1 条；outfits 仅在服装可辨识时输出 1 条，否则 []；persona 仅在面部与发型可辨识时输出，否则 null。`
    : `\n🚨【多图铁律】必须输出恰好 ${imageCount} 条 per_image（image_index 从 1 到 ${imageCount} 连续不遗漏）；actions 数量 ≤ ${imageCount}；scenes 聚类去重后 1~3 个，严禁每张图各建 1 场景。必须额外输出 content_summary 与 content_groups：每个图组连续、恰好 4 图、且一个图组只能有一个场景。不足 4 张的图片不要建立图组。`;

  const perImageExamples = singleImageOnly
    ? PER_IMAGE_JSON_TEMPLATE(focusIndex)
    : Array.from({ length: Math.min(imageCount, 2) }, (_, i) =>
        PER_IMAGE_JSON_TEMPLATE(i + 1)
      ).join(',\n    ');

  const jsonOutput = singleImageOnly
    ? PER_IMAGE_JSON_TEMPLATE(focusIndex)
    : `{
  "theme_category": "chinese_style | luxury_modern | casual_street | vacation_nature | commuting_car | home_living | minimal_office",
  "product_major_category": "jewelry | digital_3c | apparel | bag | shoes | beauty | eyewear | unknown",
  "content_summary": "这一整条内容的商品叙事、拍摄调性与图文节奏总结；不逐一分析人物五官",
  "content_groups": [
    {
      "group_index": 1,
      "source_image_indices": [1, 2, 3, 4],
      "title": "图组短标题",
      "scene_summary": "本组唯一场景的空间骨架与采光，不含人物、穿搭",
      "architecture_summary": "固定镜头节奏、每张图的景别/构图/动作逻辑；人物、穿搭、场景仅能按整组替换",
      "has_human": true
    }
  ],
  "per_image": [
    ${perImageExamples}
  ],
  "persona": {
    "name": "中文人设名称",
    "hair": "发型与发色",
    "face": "脸型五官特征",
    "skin": "原生肤质",
    "vibe": "神态气质",
    "description": "外貌气质综合描述",
    "tags": ["标签1", "标签2"]
  },
  "scenes": [
    {
      "title": "场景标题",
      "description": "纯空间环境与材质肌理（严禁人物与服装）",
      "lighting": "采光系统与物理阴影",
      "spatial_type": "outdoor_nature | indoor_room | tea_space | street | car_interior | desk_office",
      "source_image_indices": [1, 2],
      "suitable_categories": ["apparel"],
      "tags": ["标签"]
    }
  ],
  "outfits": [
    {
      "title": "穿搭名称",
      "top": "上装款式材质",
      "bottom": "下装或裙装",
      "shoes": "鞋履",
      "accessories": "配饰",
      "color_palette": "配色方案",
      "suitable_categories": ["apparel"],
      "tags": ["标签"]
    }
  ],
  "actions": [
    {
      "shot_type": "close_up | medium_full_body | profile_half_body | macro_detail | lifestyle_interaction",
      "title": "纯姿态机位标题（严禁服装名）",
      "action": "人体姿态、手势、视线（无服装词）",
      "camera": "约50mm平视半身机位",
      "posture": "坐立倚靠姿态",
      "expression": "面部微表情",
      "source_image_index": 1,
      "focus_anatomy": "hands | face | neck | hair | body",
      "suitable_categories": ["universal", "jewelry", "digital_3c"],
      "suitable_anatomy": ["hands", "wrists"]
    }
  ]
}`;

  return `
---

## 🚨 系统机器层（必须遵守，覆盖上文「不输出 JSON」）

为便于系统入库，**最终必须且仅输出一个合法 JSON 对象**，严禁 Markdown 前言或解释文字。

${singleImageGuard}

### JSON 字段映射
- reverse_prompt_zh：第三节九段式反推全文（${REVERSE_PROMPT_SECTIONS}）
- negative_prompt_zh：第四节负面约束
- analysis_summary：第二节七步视觉分析摘要
- image_type 映射：人物摄影→photography，建筑或室内空间→general，产品或静物→product，风景或道路→landscape，海报/UI→typography 或 ui，多种元素混合→mixed
- scene / outfit / action / persona：第五节原子资产，正交物理隔离
- 顶层 persona / scenes / outfits / actions：第六节汇总结果
- product_major_category：按画面中被展示或售卖的主商品判断商品大类，不是拍摄风格 theme_category，也不是模特穿搭、背景道具或拍摄设备；只输出模板列出的一个类目 ID，不要复制带竖线的候选列表；不确定时写 unknown

### 铁律
- 仅输出中文 reverse_prompt_zh，禁止输出 reverse_prompt_en 或任何英文字段
- reverse_prompt_zh 必须含九段分段标记
- scene.description 严禁人物、动作、服装词
- action.title 必须使用「姿态+机位」命名，严禁服装名词
- persona 不得包含服装、动作和背景
- 严格遵循标准合法 JSON 语法：字符串值中严禁包含未转义的原生回车换行符，多行文本分段必须使用 \\n 转义，字符串与键名一律使用英文双引号
${isSingleImage ? `- 只输出第 ${focusIndex} 张图片的分析，不要输出其它 image_index` : `- 必须完整输出全部 ${imageCount} 张图片的分析，各图描述保持高密度精炼，确保输出的单个 JSON 语法完整闭合`}
- has_human 仅表示是否出现人体（手部也算），不等于可提取人物人设或穿搭。
- 每张图分别输出 persona_visibility（none/partial/identifiable）与 outfit_visibility（none/fragment/upper_body/full_body），禁止从同组其他图推测当前图内容。
- 仅手、背影、遮脸、局部皮肤：persona=null。必须面部与发型均清晰可辨才允许 identifiable，并提取 persona；禁止补造五官、发型或肤质。
- 仅袖口、衣角、领口、模糊衣料：outfit=null，outfit_visibility=fragment。上半身服装款式清楚可输出 upper_body，无须强求全身；未入镜的下装、鞋履填空字符串，禁止编写“无法确认”占位资产。
- 顶层 outfits 只汇总有可复用服装的图片，允许 []；persona 允许 null。所有原子资产必须给出准确 source_image_index，指向真实证据图，不得默认第一张或借用他图人物。
- 无人物时 has_human=false，persona=null，outfit=null；商品与衣物局部的观察保留在该图完整反推提示词中，不独立入人物/穿搭库。
- content_groups 必须由恰好 4 张图构成且不重复；图组按原图顺序连续划分。若 8 张为同一内容，可输出两个 4 图组；不要将不同场景混在同一组。无法组成完整四图的图片不得输出图组。
- 每个 content_group 固定一个场景、固定动作/摆放和构图节奏；人物、穿搭、场景只能作为整组可替换槽位，绝不能让每张图自由混搭。
- JSON 键名和枚举保留模板中的英文
${targetCategory ? `- 用户已指定商品大类 ${targetCategory}，product_major_category 必须与该选择一致` : '- 未指定商品大类时，每套图集独立判断；不要沿用上一套图集的类目，也不要默认珠宝首饰'}

${PHONE_REVERSE_POLICY}

${buildCategoryDeconstructGuidance(targetCategory, userHint, customSubCategories)}

${userHint ? `用户附加要求：${userHint}` : ''}

### 输出格式
${jsonOutput}`;
}

export interface PerImageResult {
  image_index: number;
  image_type: string;
  title?: string;
  reverse_prompt_zh: string;
  reverse_prompt_en?: string;
  reverse_prompt?: string;
  negative_prompt_zh?: string;
  analysis_summary?: string;
  dimensions: Record<string, string>;
  has_human?: boolean;
  persona_visibility?: 'none' | 'partial' | 'identifiable';
  outfit_visibility?: 'none' | 'fragment' | 'upper_body' | 'full_body';
  shot_framing?: string;
  product_frame_ratio?: number | null;
  tags?: string[] | string;
  scene?: {
    title: string;
    description: string;
    lighting: string;
    spatial_type?: string;
  };
  outfit?: {
    dimensions?: Record<string, string>;
    title: string;
    top: string;
    bottom: string;
    shoes?: string;
    accessories?: string;
    color_palette?: string;
  };
  action?: {
    title: string;
    action: string;
    camera?: string;
    shot_type?: string;
    suitable_anatomy?: string[];
  };
  persona?: {
    dimensions?: Record<string, string>;
    name?: string;
    hair?: string;
    face?: string;
    skin?: string;
    vibe?: string;
  };
}

/**
 * 外站内容反推后得到的连续图组。每组最多四图、只允许一个场景；
 * 人物、穿搭与场景只在图组层级替换，单图只保留镜头和动作差异。
 */
export interface ContentPromptGroup {
  group_index: number;
  source_image_indices: number[];
  title?: string;
  scene_summary?: string;
  architecture_summary?: string;
  has_human?: boolean;
}

export interface AssembleReversePromptOptions {
  outfit?: PerImageResult['outfit'];
  scene?: PerImageResult['scene'];
  analysis_summary?: string;
}

/** 从 dimensions / 原子字段组装完整 reverse_prompt 兜底 */
export function assembleReversePrompt(
  dimensions: Record<string, string | undefined | null>,
  imageType?: string,
  options?: AssembleReversePromptOptions
): string {
  const d = dimensions;
  const parts: string[] = [];

  if (d.subject) parts.push(`【主体】${d.subject}`);

  if (d.hair || d.face || d.skin) {
    const faceParts = [d.hair, d.face, d.skin, d.vibe].filter(Boolean).join('，');
    if (faceParts) parts.push(`【发型与面部】${faceParts}`);
  }

  const outfit = options?.outfit;
  if (outfit && (outfit.top || outfit.bottom || outfit.accessories)) {
    const outfitParts = [outfit.top, outfit.bottom, outfit.shoes, outfit.accessories, outfit.color_palette]
      .filter(Boolean)
      .join('，');
    if (outfitParts) parts.push(`【穿搭或物体细节】${outfitParts}`);
  }

  if (d.action_pose) parts.push(`【动作或摆放】${d.action_pose}`);

  const scene = options?.scene;
  if (scene?.description) {
    parts.push(`【场景结构】${scene.description}`);
  } else if (options?.analysis_summary) {
    parts.push(`【场景结构】${options.analysis_summary}`);
  }

  let lighting = d.lighting || '';
  if (d.lighting_type) lighting += lighting ? `（${d.lighting_type}）` : String(d.lighting_type);
  if (d.color_tone && lighting) lighting += `，${d.color_tone}色调`;
  else if (d.color_tone) lighting = `${d.color_tone}色调`;
  if (lighting) parts.push(`【光影】${lighting}`);

  const compCamera = [d.composition, d.camera_language, d.focal_length, d.depth_of_field]
    .filter(Boolean)
    .join(' · ');
  if (compCamera) parts.push(`【构图镜头】${compCamera}`);

  if (imageType === 'landscape') {
    const env = [d.season, d.time_of_day, d.sky_state, d.vegetation_water].filter(Boolean).join('，');
    if (env && !scene?.description) parts.push(`【场景结构】${env}`);
  }

  const matAtmo = [d.material_texture, d.atmosphere].filter(Boolean).join(' · ');
  if (matAtmo) parts.push(`【材质与真实感】${matAtmo}`);

  if (d.resolution_quality) {
    parts.push(`【画质与限制】${d.resolution_quality}`);
  } else {
    parts.push(
      '【画质与限制】自然曝光，真实比例与透视，合理接触阴影，不过度磨皮、锐化与虚化'
    );
  }

  return parts.join('\n');
}

/** 单次多模态全维反推（主路径）：同时输出 per_image + 聚合资产 */
export function buildUnifiedDeconstructPrompt(params: {
  imageCount: number;
  userHint?: string;
  targetCategory?: string;
  customSubCategories?: SubCategoryDef[];
}): string {
  const { imageCount, userHint = '', targetCategory, customSubCategories } = params;

  return `${REVERSE_ENGINE_CORE_SPEC}

本次对话附带了 ${imageCount} 张参考图片（按顺序编号为第 1 张至第 ${imageCount} 张），请**一次完成**逐图分析与原子资产聚合。

${PROMPT_GOOD_BAD_EXAMPLES}
${buildMachineJsonLayer({ imageCount, userHint, targetCategory, customSubCategories })}`;
}

/** 单张图片全维反推 prompt（补调重试用） */
export function buildPerImageReversePrompt(params: {
  imageIndex: number;
  totalImages: number;
  userHint?: string;
  targetCategory?: string;
  customSubCategories?: SubCategoryDef[];
}): string {
  const { imageIndex, totalImages, userHint = '', targetCategory, customSubCategories } = params;

  return `${REVERSE_ENGINE_CORE_SPEC}

请仔细观察这张参考图片（第 ${imageIndex} 张，共 ${totalImages} 张），执行全维反推与四维正交原子解构。只输出第 ${imageIndex} 张图片的分析。

${PROMPT_GOOD_BAD_EXAMPLES}
${buildMachineJsonLayer({ imageCount: 1, imageIndex, userHint, targetCategory, customSubCategories, singleImageOnly: true })}`;
}

/** 批量导入时，每套图集最少图片数 */
export const MIN_IMAGES_PER_SET = 3;

/** 批量导入时，每套图集最多反推图片数（超出截断） */
export const MAX_IMAGES_PER_SET = 10;

/** 每个视觉请求最多处理一个完整的四图内容组，避免长 JSON 超时或截断。 */
export const DEFAULT_UNIFIED_SHARD_SIZE = 4;

/** 解析 Unified 分片大小（可通过环境变量 ASSET_DECONSTRUCT_SHARD_SIZE 调低） */
export function resolveUnifiedShardSize(rawEnv?: number): number {
  const value = rawEnv ?? Number(domainEnv('ASSET_DECONSTRUCT_SHARD_SIZE'));
  if (Number.isFinite(value) && value > 0) {
    return Math.min(MAX_IMAGES_PER_SET, Math.floor(value));
  }
  return DEFAULT_UNIFIED_SHARD_SIZE;
}
