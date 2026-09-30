/**
 * 珠宝配饰/项链防穿帮与物理防悬空校验：
 * 1. 项链/锁骨链/吊坠：强制正前方/45°侧前方并露出锁骨，严禁后背/越肩露背角度导致项链悬空画在后背；
 * 2. 彻底清除服饰上的胸针、相机/眼睛徽章、浮空贴纸等截屏/多模态残留穿帮工件。
 */
export function preventJewelryGlitches(prompt: string, productFingerprint?: string): string {
  if (!prompt) return prompt;
  let text = prompt;

  const fp = (productFingerprint || '').toLowerCase();
  const isHairpin = /发簪|步摇|簪|发饰|头饰|头花|hairpin/i.test(fp) || (!fp && /发簪|步摇|簪子|hairpin/i.test(prompt));
  const isNecklace = (/项链|锁骨链|吊坠|项圈|颈链|necklace|choker|pendant/i.test(fp) || (!fp && /项链|锁骨链|吊坠|necklace/i.test(prompt))) && !isHairpin;
  const isEarring = (/耳钉|耳环|耳饰|耳坠|earring/i.test(fp) || (!fp && /耳钉|耳环|耳饰|earring/i.test(prompt))) && !isHairpin && !isNecklace;
  const isBracelet = (/手镯|手链|手串|手绳|手表|腕表|bracelet|bangle/i.test(fp) || (!fp && /手镯|手链|手串|bracelet/i.test(prompt))) && !isHairpin && !isNecklace && !isEarring;
  const isRing = (/戒指|指环|对戒|钻戒|ring/i.test(fp) || (!fp && /戒指|指环|对戒|ring/i.test(prompt))) && !isHairpin && !isNecklace && !isEarring && !isBracelet;

  if (isHairpin) {
    // 🚨 发簪类：彻底清除脑补的脖子项链、耳环与手镯，清除披发直发，严格保证古典盘发与发间单一主体
    text = text
      .replace(/手腕戴着[^\s，；]*手镯[，；]?/g, '手腕光洁无手镯，')
      .replace(/佩戴[^\s，；]*项链[，；]?/g, '')
      .replace(/佩戴[^\s，；]*吊坠[，；]?/g, '')
      .replace(/(?:锁骨项链|黄金项链|珍珠项链|颈间项链|细链条)/g, '')
      .replace(/(?:披散的长发|散落的直发|披肩长发|披肩发|披发|散发|直发)/g, '整洁挽起的饱满盘发发髻');
    if (!text.includes('古典饱满低盘发髻')) {
      text = `${text}；模特长发整齐盘起梳成温婉古典饱满低盘发髻/发包（严禁散乱披发，严禁直发垂发），@图片1 所示发簪长杆横向紧密插在盘好的发髻发包内部，簪首雕花镶嵌与垂坠流苏从发髻侧上方优雅探出并自然垂落，发簪在发丝间有真实的物理穿插固定受力与接触阴影，绝非悬浮或贴在直发表面；脖子与颈间彻底光洁（绝无任何项链/锁骨链/吊坠），双耳光洁（无耳饰），手腕光洁（无任何手镯/手链），全身严格仅此 1 件发间商品实物`;
    }
  } else if (isNecklace) {
    // 🚨 项链类：严禁项链出现在后背/越肩大露背视角，防止项链悬空画在背上
    text = text
      .replace(/(?:越肩(?:大)?露背|露背(?:后颈)?|后背视角|背部特写|后背特写|大露背|后颈抓拍|背影抓拍|背影|美背)/g, '正面微侧45°自然展露端庄领口与颈间项链')
      .replace(/从模特背后拍摄/g, '平视微仰角捕捉模特端庄优雅领口')
      .replace(/背对镜头/g, '微侧身面朝自然光')
      .replace(/手腕戴着[^\s，；]*手镯[，；]?/g, '手腕光洁，')
      .replace(/手腕佩戴[^\s，；]*手镯[，；]?/g, '');

    // 强化项链自然垂坠与重力贴合规范（全面脱敏敏感词，用端庄领口正中替代胸前锁骨）
    if (!text.includes('符合人体工学重力') && !text.includes('项链自然贴合') && !text.includes('纯静物') && !text.includes('无人物')) {
      text = text.replace(
        /(@图片\s*1[^；;]*)/,
        '$1，项链吊坠自然垂坠贴合端庄领口正中（符合人体工学重力，绝无悬空或反向错位）'
      );
    }
    if (!text.includes('手腕光洁无手镯') && !text.includes('手腕光洁')) {
      text = `${text}；颈间佩戴 @图片1 所示项链，手腕光洁无手镯/手链，发间无发饰，耳垂无大耳环，全身严格仅此 1 条颈间项链吊坠实物`;
    }
  } else if (isEarring) {
    text = text
      .replace(/手腕戴着[^\s，；]*手镯[，；]?/g, '手腕光洁，')
      .replace(/佩戴[^\s，；]*项链[，；]?/g, '');
    if (!text.includes('小巧贴耳') && !text.includes('贴耳')) {
      text = text.replace(/耳垂/g, '耳垂（小巧精致贴耳佩戴比例）');
    }
    if (!text.includes('脖子光洁无项链')) {
      text = `${text}；双耳耳垂佩戴 @图片1 所示耳饰（小巧精致贴耳比例），脖子光洁无项链，手腕光洁无手镯，发间无发饰，全身严格仅此 1 对耳饰实物`;
    }
  } else if (isBracelet) {
    text = text.replace(/佩戴[^\s，；]*项链[，；]?/g, '');
    text = text.replace(/(?:戴在右手|右手戴|右手手腕)/g, '左手手腕');
    if (!text.includes('左手手腕')) {
      text = `${text}；整套分镜严格统一佩戴在左手手腕（手链吊坠与串珠呈现1~1.5cm真实小巧物理尺寸，严禁夸张巨大化变形，严禁戴在右手），右手手腕光洁，脖子光洁无项链，耳垂无大耳环，全身严格仅此 1 条手链/手镯实物`;
    }
  } else if (isRing) {
    text = text.replace(/佩戴[^\s，；]*项链[，；]?/g, '');
    text = text.replace(/(?:大拇指|拇指|食指|小拇指|尾戒|右手戒指|戴在右手)/g, '左手无名指');
    text = text.replace(/手腕戴着[^\s，；]*手镯[，；]?/g, '手腕光洁无手镯，');
    if (!text.includes('左手无名指')) {
      text = `${text}；整套分镜严格统一佩戴在左手无名指（真实1.6~1.8cm纤细戒圈尺寸，精巧贴合指节，严禁跨手指或左右手切换，严禁巨大化指虎），双手同框时右手手部光洁，手腕光洁无手镯，脖子光洁无项链，全身严格仅此 1 枚戒指实物`;
    }
  }

  // 🚨 彻底消灭胸口相机/眼睛图标、胸针徽章、标签贴纸残留
  text = text
    .replace(/(?:胸前|胸口|肩带|领口)(?:佩戴|带有|印有|装饰有)(?:相机|镜头|眼睛|徽章|胸针|图标|标签|贴纸|水印|Logo|logo)[^；;，,]*/g, '')
    .replace(/(?:带有|印有|装饰有)(?:相机徽章|眼睛图标|徽章|胸针|图案贴纸|水印|Logo|logo)[^；;，,]*/g, '')
    .replace(/胸前佩戴相机徽章与眼睛图标/g, '')
    .replace(/胸前装饰/g, '')
    .replace(/衣服上的图案/g, '纯色极简面料');

  return text.replace(/[；;]{2,}/g, '；').replace(/\s{2,}/g, ' ').trim();
}

