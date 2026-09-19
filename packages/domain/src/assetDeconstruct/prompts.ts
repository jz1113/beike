import type { SubCategoryDef } from '../productCategory';
import { PHONE_REVERSE_POLICY } from '../phoneProductPolicy';
import { categoryArchitectureGuidance } from '../assetCategoryArchitecture';

/** 中文反推提示词最低字数要求（与 validate.ts MIN_PROMPT_LENGTH 同步） */
export const MIN_REVERSE_PROMPT_LENGTH = 180;

/** 反推引擎核心规范（UI 展示与所有反推路径共享） */
export const REVERSE_ENGINE_CORE_SPEC = `你是一位顶级商业视觉总监、摄影导演、建筑摄影师与 AIGC 提示词逆向工程专家。

请根据我提供的参考图片，反推出最接近原图的中文生成提示词，并拆分出可复用的人物、场景、穿搭和动作资产。

你的目标是还原原图，而不是生成一张"风格相似图"。必须优先还原主体位置、比例关系、空间结构、透视方向、光影落点和材质细节。

## 总体原则

1. 只描述参考图中实际可见的内容。
2. 不得擅自添加人物、道具、建筑、文字、品牌、装饰和背景元素。
3. 不得把模糊区域、遮挡区域或裁切区域脑补成完整细节。
4. 无法确认的内容写"无法确认"，不要强行猜测。
5. 可以推测焦段、机位和光源，但必须使用"约""疑似""大致"等表述。
6. 禁止使用"高级、唯美、有质感、氛围感强、电影感、通透、温润流动、微幼态、小鹿眼、神仙光影、宛如凝脂"等任何空泛形容词与 AI 模式化美化词，必须改为具体的客观物理与视觉描述。
7. 【强抗 AI 塑料感铁律】：
   - 描述人物时必须采用真实纪实人像摄影笔触：强调真实皮肤微毛孔呼吸感、天然毛流、自然微表情与真实血色，严禁将其描写成无暇发光蜡像或果冻硅胶脸。
   - 描述光影时必须还原真实物理环境散射光与软硬接触阴影（Contact Shadows），严禁 CG 假高光、假轮廓光与过度饱和渲染。
   - 描述服装与场景时强调自然重力垂坠折痕、真实材质哑光触感，严禁电脑 3D 渲染光泽。
8. 优先描述影响生成结果的内容：主体比例、位置、姿态、空间结构、透视、光影和材质。
9. 不要堆砌同义词，不要重复描述同一元素。

## 一、先判断图片类型

先判断每张图属于哪一种：

- 人物摄影
- 建筑或室内空间
- 产品或静物
- 风景或道路
- 海报、平面设计或 UI
- 多种元素混合

如果是多张图片，先判断哪些图片属于同一场景、同一人物或同一套穿搭，再逐图分析。

## 二、逐图视觉分析

每张图按照以下顺序分析。

### 1. 画面总览

说明：

- 画面方向和比例
- 主体数量
- 主体位于画面什么位置
- 主体占画面的面积
- 前景、中景和背景分别是什么
- 画面的主要视觉重心
- 哪些元素最不能改变

### 2. 主体分析

描述：

- 人物或物体的数量
- 外轮廓和整体比例
- 主体朝向
- 姿态或摆放方式
- 主体与地面、墙面、家具或其他物体的接触关系
- 主体是否被裁切、遮挡或处于画面边缘
- 主体在画面中的准确相对位置

不要只写"一个女孩""一个建筑""一个产品"，要说明主体的大小、边界、朝向和空间关系。

### 3. 场景空间结构

场景必须优先按照空间骨架分析，不要先写风格词。

描述：

- 墙面、门、窗、道路、地面、屋檐或建筑主体的具体结构
- 各结构在画面左侧、右侧、中央、上方和下方的位置
- 墙体、门体和地面的比例
- 门框、门缝、把手、横向接缝、砖缝、边缘线的位置
- 前景、中景、背景之间的距离关系
- 地面纹理从前景向背景的延伸方向
- 透视线、平行线和消失方向
- 植物、家具和道具进入画面的方向及遮挡范围
- 空间是否对称、是否有明显倾斜或透视收缩

必须使用"画面左侧、右侧、中央、靠近边缘、延伸至远处"等位置词。

不能把场景概括成"豪宅、街道、现代建筑、户外环境"，必须还原具体结构。

### 4. 色彩分析

描述：

- 主色和辅助色
- 墙面、地面、主体和背景的颜色关系
- 冷暖关系
- 明暗关系
- 饱和度
- 肤色或材质颜色是否受环境光影响

### 5. 光影分析

描述：

- 光源来自哪个方向
- 光源高度
- 光线是直射、漫射、侧光、逆光还是顶光
- 光线软硬程度
- 哪些区域明亮，哪些区域处于阴影
- 阴影具体落在墙面、地面、人物或物体的什么位置
- 阴影方向、长度、边缘和浓度
- 是否存在轮廓光、反射光、斑驳光或镜头眩光
- 光影是否符合真实的空间逻辑

所有光源方向必须前后一致，不能出现互相矛盾的阴影。

### 6. 材质分析

具体描述：

- 石材的颗粒、纹理、接缝和轻微污渍
- 木材的纹理、毛孔和反光
- 金属的硬质高光和倒影
- 地砖或沥青的粗糙程度、拼接方式和磨损
- 植物叶片的厚度、脉络、边缘和透光
- 皮肤的毛孔、细纹、肤色不均和自然高光
- 头发的发丝粗细、蓬松度、反光和运动方向
- 布料的厚薄、纤维、垂坠、接缝和褶皱走向

禁止只写"真实材质""细腻质感"，必须说明真实感来自哪些具体细节。

### 7. 摄影与构图

描述：

- 横幅或竖幅
- 景别
- 主体位置
- 机位高度
- 拍摄距离
- 视角
- 透视强弱
- 焦段的大致范围
- 景深
- 焦点位置
- 背景虚化程度
- 画面是否有明显裁切
- 是否存在轻微运动感、抓拍感或镜头倾斜

不能虚构相机品牌、精确光圈、快门速度和无法确认的摄影参数。

## 三、生成逐图反推提示词

每张图片生成一段完整中文提示词，必须使用以下结构：

### 【主体】
描述主体数量、外观、比例、位置、姿态、朝向、视线、表情和画面占比。

### 【发型与面部】
只描述发型、发色、脸型、五官、肤色、妆容、原生皮肤纹理和神态。

### 【穿搭或物体细节】
人物图描述服装、鞋子、配饰、版型、领型、面料、颜色、褶皱和穿着状态。

产品图描述形状、结构、比例、颜色、表面处理、零件连接和摆放方式。

### 【动作或摆放】
人物图描述身体重心、肩颈、手臂、手指、腿部、头部方向和视线。

产品图描述物体的角度、朝向、支撑关系、接触面和摆放位置。

### 【场景结构】
必须按照空间骨架描述墙面、门、地面、道路、建筑、植物、家具和道具的具体位置与比例。

### 【光影】
描述光源方向、色温、阴影落点、阴影长度、反射光、轮廓光和曝光关系。

### 【构图镜头】
描述画面比例、景别、机位、拍摄距离、视角、透视、焦段范围、景深和焦点。

### 【材质与真实感】
描述皮肤、头发、布料、石材、木材、金属、玻璃、地面和植物的具体真实细节。

### 【画质与限制】
要求自然曝光、真实比例、合理接触阴影、真实透视、自然瑕疵、不过度磨皮、不过度锐化、不过度虚化，并排除明显 AI 生成痕迹。

## 四、生成负面约束

根据参考图单独生成负面约束，重点排除：

- 多余人物
- 多余道具
- 错误手指和肢体
- 人物比例错误
- 物体漂浮
- 建筑变形
- 门窗错位
- 墙面结构错误
- 地面砖缝方向错误
- 透视不一致
- 光源方向矛盾
- 阴影落点错误
- 植物位置错误
- 布料融化
- 饰品变形
- 塑料皮肤
- 过度磨皮
- 过度 HDR
- 过饱和
- 3D 渲染感
- 插画感
- 不符合原图的新增元素

## 五、拆分原子资产

每张图片提示词之后，继续输出以下内容。

### 【人物资产】

只保留：

- 发型
- 发色
- 脸型
- 五官
- 肤色
- 原生肤质
- 妆容
- 神态
- 气质

不得包含服装、动作、背景和摄影机位。

### 【场景资产】

只保留：

- 空间结构
- 建筑
- 墙面
- 门窗
- 地面
- 植物
- 天空
- 家具
- 道具
- 采光系统
- 透视关系
- 前景、中景和背景

不得包含人物、发型、服装和人物动作。

### 【穿搭资产】

分别描述：

- 上装
- 下装
- 鞋子
- 配饰
- 色彩
- 面料
- 版型
- 合身程度
- 可见细节

不得包含人物长相、背景和动作。

### 【动作资产】

标题必须使用"姿态 + 机位"命名，例如：

- 正面站立全身机位
- 侧身回望半身机位
- 低头行走远景机位
- 侧颜抚发近景机位

只描述：

- 机位
- 景别
- 身体姿态
- 手势
- 视线
- 人物与镜头的关系

特写或微距动作必须准确标注镜头聚焦的解剖部位与商品适配属性（focus_anatomy 与 suitable_anatomy）：
- 手镯/手链/串珠特写（侧腕展露/托展手链/手指勾挂串珠/平展珠串）：focus_anatomy 为 "bracelet"，suitable_categories 包含 "jewelry"，suitable_anatomy 标 ["bracelet", "wrist"]；
- 项链/锁骨链/吊坠特写（锁骨平展正中/托坠/抚项链/颈部近写）：focus_anatomy 为 "necklace"，suitable_categories 包含 "jewelry"，suitable_anatomy 标 ["necklace", "collarbone"]；
- 戒指/戒圈特写（指间对戒/屈指展戒/手掌托戒）：focus_anatomy 为 "ring"，suitable_categories 包含 "jewelry"，suitable_anatomy 标 ["ring", "fingers"]；
- 耳饰/耳环特写（耳畔微距/侧颜露耳/指抚耳钉）：focus_anatomy 为 "earring"，suitable_categories 包含 "jewelry"，suitable_anatomy 标 ["earring", "ear"]；
- 手部通用特写（覆手/持水杯/握物/翻书页/轻捻）：focus_anatomy 为 "hands"，suitable_categories 包含 "universal"，suitable_anatomy 标 ["hands"]；
- 面部通用近景（贴脸/欢笑/遮眼/五官神态/下颌线）：focus_anatomy 为 "face"，suitable_categories 包含 "universal"，suitable_anatomy 标 ["face"]；
- 颈肩通用胸像（端坐居中胸像/双肩水平平展）：focus_anatomy 为 "neck"，suitable_categories 包含 "universal"，suitable_anatomy 标 ["neck"]；
- 全身或半身生活姿态：focus_anatomy 为 "body"，suitable_anatomy 标 ["half_body"] 或 ["full_body"]。
严禁在动作的 suitable_anatomy 中无脑输出 ["apparel"]！

标题和内容中不得出现服装名称。

## 六、整组图片汇总

多张图片分析完成后，最后输出：

### 【共同视觉特征】
总结整组图片共有的主体、色彩、场景、光影、材质和摄影语言。

### 【人物资产汇总】
去除重复，保留不同的人物特征。

### 【场景资产汇总】
相似场景合并，最多输出 1—3 个场景。必须保留各场景的空间结构和关键位置关系。

### 【穿搭资产汇总】
按上装、下装、鞋子、配饰、颜色和面料归类。

### 【动作资产汇总】
动作数量不得超过参考图片数量，每个动作必须来自参考图中真实出现的姿态。

## 最终输出要求

- 只输出中文
- 不输出英文提示词
- 不输出闲聊和无关解释
- 每个字段都必须有内容
- 无法判断时写"图片信息不足，无法确认"
- 单图时，场景、穿搭、动作各只输出一条
- 多图时，场景去重后最多输出三条
- 严禁为了满足完整度而虚构细节
- 优先保证空间结构、主体比例、透视方向和光影落点准确`;

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

const PER_IMAGE_JSON_TEMPLATE = (imageIndex: number) => `{
      "image_index": ${imageIndex},
      "image_type": "photography | landscape | product | typography | ui | general | mixed",
      "title": "短标题（中文，8字以内）",
      "analysis_summary": "七步视觉分析摘要（画面总览、主体、场景空间结构、色彩、光影、材质、摄影构图）",
      "reverse_prompt_zh": "【主体】…\\n【发型与面部】…\\n【穿搭或物体细节】…\\n【动作或摆放】…\\n【场景结构】…\\n【光影】…\\n【构图镜头】…\\n【材质与真实感】…\\n【画质与限制】…（≥180字）",
      "negative_prompt_zh": "根据参考图生成的负面约束清单",
      "has_human": true,
      "shot_framing": "close_up | medium_full_body | low_angle_three_quarter_body | profile_half_body | profile_45 | macro_detail | high_angle_seated_full_body",
      "product_frame_ratio": 45,
      "scene": {
        "title": "纯物理空间标题",
        "description": "纯物理建筑、植物、地表肌理（严禁人物与衣服）",
        "lighting": "自然采光与物理接触阴影",
        "spatial_type": "outdoor_nature | indoor_room | tea_space | street | car_interior | desk_office"
      },
      "outfit": {
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
  if (customSubCategories && customSubCategories.length > 0) {
    const listLines = customSubCategories
      .map((sub, idx) => {
        const kw = sub.keywords && sub.keywords.length > 0 ? sub.keywords.slice(0, 6).join('、') : sub.label;
        const anatomy = sub.anatomy || sub.anchorId || 'body';
        const short = sub.shortLabel || sub.label.split('/')[0];
        return `${idx + 1}. **${sub.label} (${sub.id})**: 聚焦重点部位 "${anatomy}"；focus_anatomy 必须为 "${anatomy}"，suitable_anatomy 包含 ["${anatomy}"], tags 建议包含 ["${sub.label}", "${short}特写"], 匹配特征/关键词: [${kw}]`;
      })
      .join('\n');

    return `
${architecture}

### 🏷️ 目标品类二级细分类目规范（强约束对齐）
当前任务重点解析【${targetCategory === 'jewelry' ? '珠宝首饰' : targetCategory || '指定品类'}】品类，必须严格对照以下用户类目表字典进行机位姿态拆解打标：
${listLines}

🚨 铁律约束：若画面重点展示相关商品与细节，必须从上述二级细分类目表中匹配最佳细分类目输出对应 focus_anatomy，并在 tags 中明确输出二级类目标签！
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
    ? `\n🚨【单图铁律】只输出第 ${focusIndex} 张图片的分析；per_image 仅 1 条且 image_index=${focusIndex}；scenes/outfits/actions 各仅 1 条。`
    : `\n🚨【多图铁律】必须输出恰好 ${imageCount} 条 per_image（image_index 从 1 到 ${imageCount} 连续不遗漏）；actions 数量 ≤ ${imageCount}；scenes 聚类去重后 1~3 个，严禁每张图各建 1 场景。`;

  const perImageExamples = singleImageOnly
    ? PER_IMAGE_JSON_TEMPLATE(focusIndex)
    : Array.from({ length: Math.min(imageCount, 2) }, (_, i) =>
        PER_IMAGE_JSON_TEMPLATE(i + 1)
      ).join(',\n    ');

  const jsonOutput = singleImageOnly
    ? PER_IMAGE_JSON_TEMPLATE(focusIndex)
    : `{
  "theme_category": "chinese_style | luxury_modern | casual_street | vacation_nature | commuting_car | home_living | minimal_office",
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

### 铁律
- 仅输出中文 reverse_prompt_zh，禁止输出 reverse_prompt_en 或任何英文字段
- reverse_prompt_zh 必须含九段分段标记
- scene.description 严禁人物、动作、服装词
- action.title 必须使用「姿态+机位」命名，严禁服装名词
- persona 不得包含服装、动作和背景
- 严格遵循标准合法 JSON 语法：字符串值中严禁包含未转义的原生回车换行符，多行文本分段必须使用 \\n 转义，字符串与键名一律使用英文双引号
${isSingleImage ? `- 只输出第 ${focusIndex} 张图片的分析，不要输出其它 image_index` : `- 必须完整输出全部 ${imageCount} 张图片的分析，各图描述保持高密度精炼，确保输出的单个 JSON 语法完整闭合`}
- 无人物时 has_human=false
- JSON 键名和枚举保留模板中的英文

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
    name?: string;
    hair?: string;
    face?: string;
    skin?: string;
    vibe?: string;
  };
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

/** Unified 多模态分片默认大小（单套图集一次性单模态全维反推） */
export const DEFAULT_UNIFIED_SHARD_SIZE = 10;

/** 解析 Unified 分片大小（可通过环境变量 ASSET_DECONSTRUCT_SHARD_SIZE 调低） */
export function resolveUnifiedShardSize(rawEnv?: number): number {
  if (Number.isFinite(rawEnv) && rawEnv! > 0) {
    return Math.min(MAX_IMAGES_PER_SET, Math.floor(rawEnv!));
  }
  return DEFAULT_UNIFIED_SHARD_SIZE;
}
