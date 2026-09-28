/**
 * 提示词安全守卫、负向词生成与文本清洗模块
 */
import { preventJewelryGlitches, stripGarmentsFromAction, type OriginalProductRole } from './roles';
import { ensureOriginalPromptSlots } from './slots';
import { enforceProductGeometry } from './productGeometry';

/**
 * 清洗提示词文本，去除 Markdown 标题、分镜前缀、会话对话废话及外层包裹引号等残留字符
 */
export function cleanPromptText(rawPrompt: string): string {
  if (!rawPrompt) return '';
  let text = rawPrompt.trim();

  // 1. 去除开头的代码块符号及残留的语言标签 (如 ```text, ```prompt, ```)
  text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');
  text = text.replace(/^(?:text|prompt|markdown)\s*\n+/i, '');

  // 2. 去除开头的引用符号
  text = text.replace(/^>\s*/gm, '');

  // 3. 去除首尾包裹的中英文双引号或单引号
  text = text.replace(/^["'“‘]+/, '').replace(/["'”’]+$/, '').trim();

  // 4. 去除类似 "#### 图1: 首页封面" 或 "【图1】" 或 "分镜1:" 这种标题行
  text = text.replace(/^(?:#{1,4}\s*)?(?:📸\s*)?(?:第\s*\d+\s*张|分镜\s*\d+|图\s*\d+|方案\s*\d+|画面\s*\d+)[^\n]*[\n\r]+/i, '');
  text = text.replace(/^(?:【|\[)?(?:第\s*\d+\s*张|分镜\s*\d+|图\s*\d+|方案\s*\d+|画面\s*\d+)[^】\]\n\r]*[】\]]?[:：\s]*/i, '');

  // 5. 去除可能残留的 "提示词：" 前缀
  text = text.replace(/^(?:提示词(?:（[^）]+）)?|Prompt|核心提示词)[:：\s]*/i, '');

  // 6. 清洗并标准化多模态实物与构图参考图占位符
  text = text.replace(/【(?:参考图\s*1\s*所示商品|图中商品|目标商品|商品实物|图\s*1\s*实物)】/g, '@图片1');
  text = text.replace(/【(?:参考图\s*2|图\s*2\s*构图|构图参考图)】/g, '@图片2');
  text = text.replace(/【(?:专属(?:真人)?模特(?:正脸)?图|Anchor\s*Face|正脸定型图|人脸定型图)】/gi, '@图片3');
  text = text.replace(/基于专属(?:真人)?模特(?:正脸)?图/g, '基于 @图片3');
  text = text.replace(/专属(?:真人)?模特(?:正脸)?图/g, '@图片3');
  text = text.replace(/【?图\s*1】?(?:中的)?(?:主商品|商品|实物)?/g, '@图片1');
  text = text.replace(/【?图\s*2】?(?:中的)?(?:构图|置景|场景)?/g, '@图片2');
  text = text.replace(/【?图\s*3】?(?:中的)?(?:正脸|人脸|模特)?/g, '@图片3');
  text = text.replace(/\b(?:from\s+Image\s*1|in\s+Image\s*1|of\s+Image\s*1)\b/gi, '@图片1');
  text = text.replace(/\b(?:from\s+Image\s*2|in\s+Image\s*2|of\s+Image\s*2)\b/gi, '@图片2');
  text = text.replace(/\b(?:from\s+Image\s*3|in\s+Image\s*3|of\s+Image\s*3)\b/gi, '@图片3');

  // 7. 去除排版文字/贴纸标语描述 (如 "Text Overlay: ...", "Sticker overlay: ...", "Graphic overlay: ...")
  text = text.replace(/(?:Text Overlay|Sticker overlay|Graphic overlay|排版文字|文案标注|文字排版建议|字幕贴纸)[：:]\s*[\s\S]*?(?=\n\n|\n[A-Z][a-zA-Z\s]+:|$)/gi, '');

  // 8. 去除 AI 助手会话式引导废话 (如: "复制给 GPT-4...", "把图1抠图放进去...", "祝你数据长虹")
  text = text.replace(/(?:复制给\s*(?:GPT-4|ChatGPT|大模型|AI)[^，。\n]*[，。\n]*)/gi, '');
  text = text.replace(/(?:拿到有质感的背景后[^，。\n]*[，。\n]*)/gi, '');
  text = text.replace(/(?:把你的图\s*\d*\s*抠图放进去[^，。\n]*[，。\n]*)/gi, '');
  text = text.replace(/(?:加上这些文案[^，。\n]*[，。\n]*)/gi, '');
  text = text.replace(/(?:一篇爆款小红书图文就诞生了[^，。\n]*[，。\n]*)/gi, '');
  text = text.replace(/(?:祝你数据长虹[^！!\n]*[！!\n]*)/gi, '');
  text = text.replace(/(?:Leave some empty space at the top for adding text later\.?)/gi, '');

  // 9. 去除多余的参数尾巴（如果已经被模型解析了宽高比）
  text = text.replace(/--ar\s+[0-9:]+/gi, '').replace(/--v\s+[0-9.]+/gi, '').replace(/--q\s+[0-9.]+/gi, '');

  // 11. 标准化各大平台/社区多图引用占位符 (将 {{Mixed 1}}, @insp_1 等规范化映射为行业通用多模态指令 @图片1, @图片2)
  text = text.replace(/\{\{\s*(?:Mixed|Image|Video|Subject|Pic|图|视频|主体)?\s*(\d+)\s*\}\}/gi, '@图片$1');
  text = text.replace(/@insp_(\d+)/gi, '@图片$1');
  text = text.replace(/\{\{\s*[^}]+\s*\}\}/g, '');

  // 12. 清理 Markdown 结构化分段标头 (如 **画面描述**:, **动作与镜头**:, **氛围与情绪**:, **运镜**:, **场景背景**:)
  text = text.replace(/\*\*(?:画面描述|画面|主体描述|主体|人物描述|人物|动作与镜头|动作|运镜|镜头|场景背景|场景|环境|氛围与情绪|氛围|情绪|光影|构图|色彩|服饰|服装|材质|细节)\*\*[:：\s]*/g, ' ');
  text = text.replace(/(?:画面描述|主体描述|动作与镜头|场景背景|氛围与情绪|镜头动作|切镜头剪辑)[:：]\s*/g, ' ');

  // 13. 去除残留的 Markdown 粗体与斜体标记 (如 **词语** -> 词语, *词语* -> 词语)
  text = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  text = text.replace(/\*([^*]+)\*/g, '$1');

  // 14. 清理冗余的连续标点与空白字符 (如 "，，", "。。", "；；", 多余首尾符号)
  text = text.replace(/[，,]{2,}/g, '，');
  text = text.replace(/[。.]{2,}/g, '。');
  text = text.replace(/[；;]{2,}/g, '；');
  text = text.replace(/^[，,。.；;\s]+/, '');
  text = text.replace(/[，,；;\s]+$/, '');
  text = text.replace(/\s+/g, ' ');

  // 10. 再次清理首尾标点与多余空格
  text = text.replace(/^["'“‘]+/, '').replace(/["'”’]+$/, '').trim();

  return text.trim() || rawPrompt.trim();
}

/**
 * 剥离工坊注入的守卫文案与尾部追加句（Hub/快速生图 plain 模式使用）。
 * 仅剥离真正的守卫标签，保留业务正文前缀。
 */
export function stripWorkshopPromptGuards(prompt: string): string {
  if (!prompt) return prompt;
  const text = prompt
    // 仅匹配历史守卫标签，避免误删业务正文。
    .replace(/【(?:爆款人物守卫|爆款静物守卫|复刻人物守卫|复刻静物守卫|原创[^】]*守卫)】[^【]*?。/g, ' ')
    .replace(/【身份硬锁定[^\]]*】[^【]*?。/g, ' ')
    .replace(/【表情解耦】[^【]*?。/g, ' ')
    .replace(/【解剖与物理硬约束】[^【]*?。/g, ' ')
    .replace(/商品外观以 @图片\s*1 为准[，,]?禁止用文字描写商品几何细节。?/g, ' ')
    .replace(/商品外观以 @图片\s*1 为准。?/g, ' ')
    .replace(/人物五官 ID 以 @图片\s*2 为准。?/g, ' ')
    .replace(/人物五官 ID 仅以 @图片\s*3 定型。?/g, ' ')
    .replace(/构图机位与肢体姿势以 @图片\s*2 为准[^。]*。?/g, ' ')
    .replace(/场景空间以 @图片\s*[23] 定桩[^。]*。?/g, ' ')
    .replace(/表情关键词：[^。]+。?/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

/** Hub 快速生图：精简负向词，避免电商工坊长列表污染创意请求 */
export function getPlainNegativePrompt(): string {
  return 'blurry, low resolution, watermark, text overlay, ugly, distorted, deformed, bad anatomy, extra limbs';
}

/**
 * 动静分离的动态负向提示词引擎
 * 根据分镜是否有模特/手部出镜，精准分配排斥规则，彻底排斥鼠标指针与截屏UI工件
 */
export function getDynamicNegativePrompt(options?: {
  hasHuman?: boolean;
  shotType?: string;
  plainMode?: boolean;
}): string {
  if (options?.plainMode) {
    return getPlainNegativePrompt();
  }
  const hasHuman = options?.hasHuman !== false && options?.shotType !== 'pure_product';

  // 🌟 截屏工件、UI图标、胸口徽章与虚假塑料3D场景排斥词
  const screenshotArtifacts = 'cursor, mouse cursor, mouse pointer, arrow cursor, hand cursor, pointer icon, UI overlay, screenshot artifact, browser chrome, browser toolbar, address bar, taskbar, desktop icons, system tray, window controls, minimize button, close button, scrollbar, notification popup, badge on clothes, chest badge, chest pin, brooch, camera icon, eye icon, button badge, clothing tag, sticker on shirt, floating logo, icon on strap, white borders, white dividing lines, white margin, white frame, blank space, split lines, outer border, padding, 白边, 白框, 分割白线, 留白边框, 相框, 十字分割线, fake plastic scene, synthetic studio backdrop, 3D CGI background, green screen background, virtual studio, plastic furniture, flat studio lighting, floating cutout subject, sterile showroom, unreal engine background, 塑料假背景, 虚拟样板间, 绿幕抠图感, 假景贴图, 悬浮无阴影, 纯色假背景, art gallery, exhibition hall, modern museum, empty corridor, abstract art on wall, geometric paintings, blank white museum walls, cold sterile minimalist gallery, long empty hallway, full body shot, distant shot, far away standing, standing in hallway, small human in distance, 艺术画廊, 展厅, 美术馆, 走廊长廊, 墙上抽象几何画作, 空旷白墙, 冰冷样板间, 远景全身, 远景小人, 站立远景';

  const physicsArtifacts =
    ', extra legs, three legs, fused limbs, disconnected limbs, floating objects, defying gravity, object hovering, spoon in mouth, invented props not in reference, window reflection selfie, car window reflection, glass reflection, double exposure, ghosting reflection, translucent reflection, floating reflection, surreal reflection, optical illusion, mirror glitch, transparent glass selfie, overlapping reflections, floating necklace, necklace on back, backwards necklace, necklace floating on shoulder blade, detached jewelry chain, floating pendant, floating strap';

  if (options?.shotType === 'hand_held_only') {
    return `${screenshotArtifacts}, human face, full person, portrait, extra hands, extra fingers, fused fingers, detached hands, malformed product, watermark, blurry, low resolution${physicsArtifacts}`;
  }

  if (!hasHuman) {
    // 纯静物 / 商业实物特写专属负向词
    return `${screenshotArtifacts}, promotional poster, marketing banner, text overlay, typography, Chinese text watermark, spec icons, parameter table, commercial advertisement, billboard, graphic design poster, spec sheet, product brochure, extra arms, human limbs, extra hands, mutated fingers, human in background, floating object, anti-gravity, distorted geometry, malformed product, plastic fake reflection, cheap CGI, 3d render, blender render, unreal engine, clay material, fake specular highlights, multiple rings, extra bracelets, blurry, low resolution, watermark, ugly text artifact, oversaturated, unrealistic perspective, dark gloomy lighting, muddy black shadows, flat sterile lighting, plastic toy look, washed out colors, harsh flat light${physicsArtifacts}`;
  }

  // 真人模特 / 手持操作专属负向词（含防走光、防低胸深V、防尺度违规底线拦截）
  const modestyNegative = ', deep cleavage, exposed breasts, low-cut plunge neckline, cleavage, provocative, nsfw, revealing clothing, bare chest, busty, plunge top, deep plunge, see-through clothing';

  return `${screenshotArtifacts}, doll face, porcelain doll, anime face, plastic mannequin face, plastic skin, airbrushed skin, smoothed skin, over-smoothed face, fake porcelain skin, plastic silicone skin, wax doll look, AI face look, uncanny valley, exaggerated anime eyes, unnatural glossy skin, 塑料蜡像感, 假人感, 过度磨皮, 假睫毛网红脸, 硅胶脸, 3d render, cheap CGI, unreal engine, blender render, fake shiny face, mask face, double faces, glamour studio lighting, heavy digital makeup, airbrushed, oily skin, shiny plastic skin, greasy skin, videogame character, cgi character, mannequin, doll-like, fake reflections, sparkles, lens flare, glowing jewelry, oversized jewelry, giant earring, huge earring, oversized ear stud, giant medallion on ear, giant coin on ear, oversized bracelet, giant thick bangle, disproportionate jewelry size, 夸张巨大耳饰, 巨大耳环, 夸张大圆盘, 比例失调, necklace on neck when wearing bracelet, fine chain necklace on bare collarbone, pendant on chest, floating necklace, necklace when only showing bracelet, extra necklace on chest, 戴手镯时脖子出现项链, 锁骨链, 项链吊坠, 戴手镯时胸前出现项链, 戴耳饰时手腕出现手链, 戴发簪时脖子出现项链, extra bracelet on wrist when wearing earring, extra chain on wrist, extra necklace when wearing earring, extra jewelry not in reference, 手腕额外手镯, 脖子额外项链, 抢镜多余首饰, out of focus jewelry, blurred product on wrist, tiny blurry jewelry, product out of depth of field, blurred wrist, 首饰脱焦虚化, 手腕模糊看不清, 商品太小看不清细节, overexposed reflection, shiny glitter, bling bling, cgi glow, studio backdrop, fake artificial lighting, yellow tint, oversaturated skin, promotional poster, marketing banner, text overlay, typography, Chinese text watermark, extra arms, three arms, floating arms, third arm, extra hands, missing arms, duplicate limbs, bad hands, mutated fingers, bad anatomy, deformed limbs, floating hand holding phone, detached arms, deformed hands, distorted fingers, extra fingers, missing fingers, deformed wrist, fused wrists, multiple bracelets, extra bracelet, multiple rings, deformed jewellery, distorted necklace, floating jewellery, mutated body parts, low quality, blurry, watermark, ugly, text artifact, dark gloomy lighting, muddy black shadows${physicsArtifacts}${modestyNegative}`;
}

/**
 * 软化易触发 GPT Image 内容审核的项链/锁骨/胸前微距措辞（复刻与四宫格共用）。
 * 保留商品展示意图，改为端庄领口颈间半身近景。
 */
export function softenPromptSafetyWording(prompt: string): string {
  if (!prompt) return prompt;
  let text = prompt;

  text = text
    .replace(/蕾丝内搭系带白衬衫/g, '端庄素雅系带白衬衫')
    .replace(/黑灰蕾丝边短裙/g, '高腰垂感直筒长裤')
    .replace(/蕾丝内搭/g, '素雅衬衫')
    .replace(/蕾丝边短裙|蕾丝短裙/g, '垂感长裤')
    .replace(/微透光血色感|微透光/g, '细腻真实自然冷白肤质')
    .replace(/透光血色感/g, '细腻真实自然肤质')
    .replace(/胸前锁骨正中|胸前锁骨/g, '端庄领口正中')
    .replace(/锁骨胸前超清微距特写/g, '颈间项链半身近景特写')
    .replace(/锁骨项链部位超清微距特写/g, '颈间项链半身近景')
    .replace(/锁骨胸前超清特写/g, '颈间项链半身近景')
    .replace(/锁骨胸前部位特写/g, '颈间项链半身近景')
    .replace(/锁骨部位特写/g, '颈间半身特写')
    .replace(/胸前超清微距/g, '颈间半身近景')
    .replace(/胸前微距/g, '颈间近景')
    .replace(/超清对焦锁骨间/g, '清晰对焦颈间')
    .replace(/聚焦胸前锁骨正中/g, '聚焦端庄领口与颈间吊坠')
    .replace(/对焦锁骨正中项链/g, '对焦颈间项链吊坠')
    .replace(/手机镜头贴近对焦锁骨正中项链实物/g, '半身近景清晰对焦颈间项链吊坠')
    .replace(/双手自然轻触锁骨附近或托腮/g, '单手大拇指与食指捏起吊坠向镜头展示或双手自然轻搭身前')
    .replace(/轻触锁骨附近/g, '手部自然轻搭在随身包带或身前')
    .replace(/指尖轻抚锁骨项链/g, '单手捏起吊坠向镜头展示或自然展露颈间项链')
    .replace(/悬空摸锁骨\/摸项链\/摸手腕/g, '无支撑悬空手部动作')
    .replace(/摸锁骨|抚摸锁骨|轻抚锁骨/g, '单手自然搭在身前或轻抚发丝')
    .replace(/优美锁骨线条/g, '端庄领口与颈线')
    .replace(/自然展露锁骨与颈间项链/g, '端庄领口清晰展露颈间项链')
    .replace(/展露锁骨项链/g, '展露颈间项链')
    .replace(/自然展露锁骨/g, '端庄领口自然展露颈间')
    .replace(/微敞第一颗纽扣自然展露锁骨/g, '端庄领口自然展露颈间项链')
    .replace(/勾勒侧颜与锁骨项链微光/g, '勾勒侧颜与颈间项链微光')
    .replace(/斜射阳光洒在颈间，勾勒侧颜与锁骨/g, '斜射阳光洒在颈间，勾勒侧颜与项链')
    .replace(/锁骨正中/g, '端庄领口正中')
    .replace(/锁骨/g, '端庄领口')
    .replace(/胸前/g, '身前')
    .replace(/胸口/g, '身前')
    .replace(/胸部以上/g, '中近景半身')
    .replace(/大面积露胸|深V领|低胸|深沟|cleavage|抹胸|吊带衫|吊带裙/gi, '端庄圆领');

  return text.replace(/\s+/g, ' ').trim();
}

export interface HarmonizePromptOptions {
  scene?: string;
  action?: string;
  angle?: string;
  camera?: string;
  productRole?: string;
  productFingerprint?: string;
  hasHuman?: boolean;
  appliedScene?: string;
  appliedOutfit?: string;
  appliedPersona?: string;
  appliedAction?: string;
}

/**
 * 🌟 8 段式组合后提示词物理逻辑消歧与去重提纯引擎 (Prompt Harmonizer)
 * 解决资产组合后的物理逻辑冲突（如电车出现安全带、发簪正脸被头部遮挡等）并消除冗余重复文本，注入标准资产编号
 */
export function harmonizeOriginalPrompt(
  prompt: string,
  options?: HarmonizePromptOptions
): {
  prompt: string;
  action: string;
  angle: string;
  scene: string;
} {
  const scene = (options?.scene || '').trim();
  let action = (options?.action || '').trim();
  let angle = (options?.angle || '').trim();
  let text = (prompt || '').trim();
  action = stripGarmentsFromAction(action);

  // 1. 场景-道具物理接触消歧（解决非私家车场景出现汽车安全带等物理矛盾）
  const isPrivateCar = /(?:私家车|汽车|轿车|副驾|驾驶座|豪车)/i.test(scene) && !/(?:电车|有轨电车|地铁|火车|高铁|公交|客车|站台)/i.test(scene);
  if (!isPrivateCar) {
    action = action
      .replace(/轻搭在安全带或包袋拉链上/g, '轻搭在随身包袋或身旁扶手上')
      .replace(/搭在安全带(?:或随身包袋)?/g, '搭在随身包袋或身旁扶手')
      .replace(/安全带/g, '随身手袋');

    text = text
      .replace(/轻搭在安全带或包袋拉链上/g, '轻搭在随身包袋或身旁扶手上')
      .replace(/搭在安全带(?:或随身包袋)?/g, '搭在随身包袋或身旁扶手')
      .replace(/安全带/g, '随身手袋');
  }

  // 2. 首饰品类与拍摄机位物理接触消歧
  const fp = `${options?.productFingerprint || ''} ${text}`.toLowerCase();
  const isHairpin = /发簪|步摇|簪子|发钗|头饰|发饰/.test(fp);
  const isNecklace = /项链|锁骨链|吊坠|颈链/.test(fp) && !isHairpin;
  const isEarring = /耳钉|耳环|耳饰|耳坠/.test(fp) && !isHairpin && !isNecklace;
  const isBracelet = /手镯|手链|手串|玉镯|金镯|镯子|手排|手环/.test(fp) && !isHairpin && !isNecklace && !isEarring;
  const isRing = /戒指|指环|对戒|钻戒/.test(fp);
  const isJewelry = isHairpin || isNecklace || isEarring || isBracelet || isRing || /珠宝|首饰|饰品|配饰|珍珠|翡翠|和田玉/.test(fp);

  if (isJewelry) {
    // 🚨 珠宝首饰铁律：全景/远景极度缩小商品导致看不清，必须全面收敛为半身中近景与微距特写
    if (/(全景|远景|全身站立|全身照|全身|长廊|门廊前远景)/.test(angle)) {
      angle = isHairpin
        ? '45° 侧颜发髻半身抓拍'
        : isEarring
          ? '耳际侧颜半身近镜头'
          : isNecklace
            ? '正面端庄领口半身近镜头'
            : isBracelet
              ? '手腕平放台面半身近镜头'
              : isRing
                ? '手指轻搭台面半身近镜头'
                : '半身近镜头展示';
    }

    // 将奔跑、跳跃、蹲姿、远景站立等破坏首饰呈现的大动作收敛为半身自然互动
    action = action.replace(
      /(在[^\s，；;]*大步奔跑|大步快跑|跳跃奔跑|全速奔跑|跑动|路边蹲姿|坐在石阶|微模糊的复古跑动|门廊前远景全景展示)[^，；;]*/g,
      isBracelet
        ? '手部自然平放木质台面或轻搭扶手，单侧手腕佩戴饰品清晰入镜展示'
        : isRing
          ? '手指轻搭在咖啡杯或桌沿，手指纤细自然，清晰展露佩戴的戒指'
          : isHairpin
            ? '侧头发丝盘起整洁雅致，微回眸优雅展露发间发饰'
            : isEarring
              ? '微侧头，发丝轻挽耳后展露耳饰，神态甜美松弛'
              : isNecklace
                ? '端庄领口自然展露胸前锁骨项链，双手自然轻搭身前'
                : '桌前优雅倚靠，手部有真实依托，半身近镜头自然展露佩戴首饰'
    );

    // 提示词正文中的远景/全身/奔跑大动作清洗
    text = text
      .replace(/(?:全景|远景|全身站立|全身照|长廊远景|门廊前远景全景)[^，；;]*/g, '半身中近景构图，清晰呈现 @图片1 所示首饰实物细节')
      .replace(/(?:大步奔跑|跳跃奔跑|微模糊的复古跑动|路边蹲姿)[^，；;]*/g, '桌前优雅倚靠，佩戴 @图片1 所示首饰自然入镜');
  }

  if (isHairpin) {
    // 发簪类：强制纠正正面机位（防止后脑勺遮挡商品）
    if (/正面|平视自拍|正脸|胸部以上肖像/.test(angle)) {
      angle = '45° 侧颜微风半身抓拍';
    }
    action = action.replace(/正面平视/g, '侧后方45度微回眸').replace(/正面对焦/g, '45度侧颜对焦');
    text = text
      .replace(/正面胸部以上(?:自拍肖像|半身肖像|自拍)/g, '45度侧颜微风半身抓拍，清晰展露发髻侧方插戴的发饰')
      .replace(/正面半身肖像/g, '45度侧颜半身抓拍')
      .replace(/正面平视自拍/g, '45度侧颜抓拍');

    // 剔除可能混入的手镯项链
    text = text.replace(/手腕戴着[^\s，；]*手镯[，；]?/g, '手腕光洁，');
    text = text.replace(/佩戴[^\s，；]*项链[，；]?/g, '');
    text = text.replace(/佩戴[^\s，；]*吊坠[，；]?/g, '');
  } else if (isNecklace) {
    // 项链类：强制纠正后背机位与露胸
    text = text
      .replace(/后背视角|大露背|后颈近景/g, '正面端庄领口项链平视抓拍')
      .replace(/手腕戴着[^\s，；]*手镯[，；]?/g, '手腕光洁，');
  } else if (isEarring) {
    // 耳饰类：保证小巧贴耳比例
    text = text.replace(/手腕戴着[^\s，；]*手镯[，；]?/g, '手腕光洁，');
    text = text.replace(/佩戴[^\s，；]*项链[，；]?/g, '');
    if (!text.includes('小巧贴耳') && !text.includes('贴耳')) {
      text = text.replace(/耳垂/g, '耳垂（小巧精致贴耳佩戴比例）');
    }
  } else if (isBracelet) {
    text = text.replace(/佩戴[^\s，；]*项链[，；]?/g, '');
  }

  // 3. 首饰防穿帮与单品物理排他强校验
  text = preventJewelryGlitches(text, fp);

  // 4. 8段式提示词去重与提纯（消除多段间重复叠加的人物人设与画质词）
  const personaPhrases = [
    '同一位长相自然清秀的20多岁东亚女生',
    '长相自然清秀的20多岁年轻东亚女生',
    '长相自然清秀的20多岁东亚女生',
    '符合商品受众的长相极其出众的小红书顶流美学神颜女生',
    '长相极其出众的小红书顶流美学神颜女生',
  ];
  for (const phrase of personaPhrases) {
    const firstIdx = text.indexOf(phrase);
    if (firstIdx !== -1) {
      const secondIdx = text.indexOf(phrase, firstIdx + phrase.length);
      if (secondIdx !== -1) {
        text = text.slice(0, secondIdx) + text.slice(secondIdx + phrase.length);
      }
    }
  }

  // 5. 提取各资产的独立 ID 编号（如 #P-01, #S-01, #O-01, #A-01）
  const pCodeMatch = options?.appliedPersona?.match(/#[PSOA]-\d+/i)?.[0];
  const sCodeMatch = options?.appliedScene?.match(/#[PSOA]-\d+/i)?.[0];
  const oCodeMatch = options?.appliedOutfit?.match(/#[PSOA]-\d+/i)?.[0];
  const aCodeMatch = options?.appliedAction?.match(/#[PSOA]-\d+/i)?.[0];

  // 6. 若提示词包含【】段落标识，注入对应的资产编号
  if (text.includes('【')) {
    if (pCodeMatch && text.includes('【模特人设') && !text.includes(pCodeMatch)) {
      text = text.replace(/【模特人设[^】]*】/, `【模特人设 ${pCodeMatch}】`);
    }
    if (sCodeMatch && text.includes('【生活置景') && !text.includes(sCodeMatch)) {
      text = text.replace(/【生活置景[^】]*】/, `【生活置景 ${sCodeMatch}】`);
    }
    if (oCodeMatch && text.includes('【统一穿搭') && !text.includes(oCodeMatch)) {
      text = text.replace(/【统一穿搭[^】]*】/, `【统一穿搭 ${oCodeMatch}】`);
    }
    if (aCodeMatch && text.includes('【抓拍动作') && !text.includes(aCodeMatch)) {
      text = text.replace(/【抓拍动作[^】]*】/, `【抓拍动作 ${aCodeMatch}】`);
    }
  }

  // 7. 清洗连贯标点与全链路安全词软化
  text = softenPromptSafetyWording(text);
  text = text
    .replace(/[；;]{2,}/g, '；')
    .replace(/[，,]{2,}/g, '，')
    .replace(/；\s*；/g, '；')
    .replace(/^[；;，,\s]+/, '')
    .replace(/[；;，,\s]+$/, '')
    .trim();

  return {
    prompt: text,
    action: action || '自然随性生活抓拍姿态，展现佩戴细节',
    angle: angle || '45° 侧颜生活抓拍视角',
    scene: scene || '干净有质感的真实生活空间',
  };
}

/**
 * 最终出站生图提示词修饰与槽位兜底函数
 */
export function finalizeImagePrompt(
  prompt: string,
  options?: {
    workshopMode?: string;
    hasHuman?: boolean;
    hasFace?: boolean;
    hasSceneAnchor?: boolean;
    hasSupplementaryProductViews?: boolean;
    productRole?: OriginalProductRole;
    productFingerprint?: string;
  }
): string {
  const text = prompt;
  // 🌟 核心保护：Hub/普通创作区 (hub/plain) 纯文本自由创作，严禁注入电商工坊商品实物槽位或修改提示词
  if (
    options?.workshopMode === 'hub' ||
    options?.workshopMode === 'plain' ||
    options?.workshopMode !== 'storyboard_generate'
  ) {
    return text;
  }
  if (options?.workshopMode === 'storyboard_generate') {
    return enforceProductGeometry(ensureOriginalPromptSlots(text, {
      hasHuman: options?.hasHuman !== false,
      hasFace: options?.hasFace,
      hasSceneAnchor: options?.hasSceneAnchor,
      hasSupplementaryProductViews: options?.hasSupplementaryProductViews,
      productRole: options?.productRole,
      productFingerprint: options?.productFingerprint,
    }));
  }
  return text;
}
