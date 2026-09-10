import { describe, it, expect } from 'vitest';
import { cleanPromptText, stripWorkshopPromptGuards, getPlainNegativePrompt, getDynamicNegativePrompt, buildSocialHumanGenGuard, ensureSocialPromptSlots, ensureReplicationPromptSlots, softenReplicationSafetyWording, normalizeOriginalProductRole, sanitizeLookPartsForProductRole, scrubOriginalPromptProductConflicts, getHarmonizedStoryboardForScene, getOriginalDiversityForShot, isOriginalTextTooSimilar, assembleOriginalShotPrompt, assembleGrid2x2Prompt, assembleReplicationGrid2x2Prompt, finalizeImagePrompt, enforceOriginalShotDiversity, ensureOriginalPromptSlots, enforceLookConsistency, extractOutfitFromPrompt, isGenericLook, resolveDiverseDefaultOutfit, detectJewelryAnatomy, harmonizeOriginalPrompt, extractPureActionFromPrompt, stripGarmentsFromAction } from './index';

describe('prompt-engine / guards', () => {
  it('cleanPromptText removes codeblocks, titles, and noise', () => {
    const raw = '```markdown\n#### 图1: 首页封面\n提示词：【商品实物】在阳光下\n```';
    const cleaned = cleanPromptText(raw);
    expect(cleaned).toContain('@图片1');
    expect(cleaned).not.toContain('```');
    expect(cleaned).not.toContain('#### 图1');
    expect(cleaned).not.toContain('提示词：');
  });

  it('stripWorkshopPromptGuards strips injected guards', () => {
    const guarded = '【身份硬锁定·最高优先级】成图人物必须是 @图片3 同一真人。 商品外观以 @图片1 为准。 优雅站姿。';
    const stripped = stripWorkshopPromptGuards(guarded);
    expect(stripped).not.toContain('【身份硬锁定');
    expect(stripped).not.toContain('商品外观以 @图片1 为准');
    expect(stripped).toContain('优雅站姿');
  });

  it('stripWorkshopPromptGuards keeps 【爆款复刻实拍】 body and strips only true guards', () => {
    const body =
      '【爆款复刻实拍】：阳光卧室梳妆台侧歪头浅笑半身像，主体为 @图片1 所示商品实物，柔和侧窗光。';
    const withGuards =
      `${body} 【复刻人物守卫】商品外观只认 @图片1；人物按提示词人设与表情关键词生成；禁止大块模糊脸/马赛克。` +
      `【解剖与物理硬约束】严格仅两臂共10指、下肢仅两条腿，禁止第三只手/多余腿/融合肢体/悬浮肢体；道具须有真实接触与重力落点。`;
    const stripped = stripWorkshopPromptGuards(withGuards);
    expect(stripped).toContain('【爆款复刻实拍】');
    expect(stripped).toContain('阳光卧室梳妆台侧歪头浅笑半身像');
    expect(stripped).toContain('@图片1');
    expect(stripped).not.toContain('【复刻人物守卫】');
    expect(stripped).not.toContain('【解剖与物理硬约束】');
  });

  it('getDynamicNegativePrompt returns distinct rules for human vs pure product', () => {
    const humanNeg = getDynamicNegativePrompt({ hasHuman: true });
    expect(humanNeg).toContain('doll face');
    expect(humanNeg).toContain('cursor');

    const productNeg = getDynamicNegativePrompt({ hasHuman: false, shotType: 'pure_product' });
    expect(productNeg).toContain('promotional poster');
    expect(productNeg).toContain('extra arms');

    const plainNeg = getDynamicNegativePrompt({ plainMode: true });
    expect(plainNeg).toBe(getPlainNegativePrompt());

    // 验证防走光与尺度合规负向词拦截
    expect(humanNeg).toContain('deep cleavage');
    expect(humanNeg).toContain('low-cut plunge neckline');
    expect(humanNeg).toContain('revealing clothing');

    // 验证画廊、走廊、白墙抽象画与远景全身负向词拦截
    expect(humanNeg).toContain('art gallery');
    expect(humanNeg).toContain('empty corridor');
    expect(humanNeg).toContain('full body shot');
    expect(humanNeg).toContain('艺术画廊');
    expect(humanNeg).toContain('远景全身');
  });

  it('buildSocialHumanGenGuard generates appropriate guards for face vs no face', () => {
    const faceGuard = buildSocialHumanGenGuard({ socialMode: true, hasHuman: true, hasFace: true });
    expect(faceGuard).toContain('【身份硬锁定·最高优先级】');
    expect(faceGuard).toContain('@图片3');

    const noFaceGuard = buildSocialHumanGenGuard({ socialMode: true, hasHuman: true, hasFace: false });
    expect(noFaceGuard).toContain('【爆款人物守卫】');

    const productGuard = buildSocialHumanGenGuard({ socialMode: true, hasHuman: false });
    expect(productGuard).toContain('【爆款静物守卫】');
  });

  it('ensureSocialPromptSlots correctly enforces slots and expression', () => {
    const base = '坐在咖啡馆内';
    const slotted = ensureSocialPromptSlots(base, {
      socialMode: true,
      hasHuman: true,
      hasFace: true,
      expression: '明朗甜美微笑',
    });
    expect(slotted).toContain('@图片1');
    expect(slotted).toContain('@图片2');
    expect(slotted).toContain('@图片3');
    expect(slotted).toContain('表情关键词：明朗甜美微笑');
  });

  it('ensureReplicationPromptSlots keeps @图片1 and strips @图片2', () => {
    const base =
      '【爆款构图复刻】：以 @图片2 为本镜构图基准，主体替换为 @图片1 所示商品';
    const slotted = ensureReplicationPromptSlots(base, {
      hasHuman: false,
    });
    expect(slotted).toContain('@图片1');
    expect(slotted).not.toMatch(/@图片\s*2/);
    expect(slotted).toContain('【复刻静物守卫】');
  });

  it('ensureReplicationPromptSlots is idempotent and keeps analyzed body', () => {
    const body =
      '【爆款复刻实拍】：卧室窗边正面浅笑半身像，佩戴 @图片1 所示商品，自然窗光与浅景深。';
    const once = ensureReplicationPromptSlots(body, { hasHuman: true, hasFace: false });
    const twice = ensureReplicationPromptSlots(once, { hasHuman: true, hasFace: false });
    // 模拟 image.ts：先 strip 再 slot（formatModelPayload 会再 slot 一次）
    const afterStrip = stripWorkshopPromptGuards(once);
    const pipeline = ensureReplicationPromptSlots(
      ensureReplicationPromptSlots(afterStrip, { hasHuman: true, hasFace: false }),
      { hasHuman: true, hasFace: false }
    );

    for (const result of [once, twice, pipeline]) {
      expect(result).toContain('【爆款复刻实拍】');
      expect(result).toContain('卧室窗边正面浅笑半身像');
      expect(result).toContain('【复刻人物守卫】');
      const anatomyCount = (result.match(/【解剖与物理硬约束】/g) || []).length;
      expect(anatomyCount).toBe(1);
      const guardCount = (result.match(/【复刻人物守卫】/g) || []).length;
      expect(guardCount).toBe(1);
    }
  });

  it('softenReplicationSafetyWording replaces chest/collarbone macro with modest neck framing', () => {
    const raw =
      '锁骨胸前超清微距特写：聚焦胸前锁骨正中，双手自然轻触锁骨附近或托腮，展露锁骨项链';
    const soft = softenReplicationSafetyWording(raw);
    expect(soft).toContain('颈间项链半身近景特写');
    expect(soft).not.toContain('锁骨胸前超清微距');
    expect(soft).not.toContain('轻触锁骨附近');
    expect(soft).toContain('展露颈间项链');
  });

  it('finalizeImagePrompt softens then injects safe product slots for accessory macro', () => {
    const raw = '侧颜微风半身抓拍，锁骨部位超清微距展示项链';
    const out = finalizeImagePrompt(raw, {
      workshopMode: 'storyboard_generate',
      hasHuman: true,
      productRole: 'worn_accessory',
      productFingerprint: '18k金珍珠项链',
    });
    expect(out).toContain('@图片1');
    expect(out).not.toMatch(/锁骨胸前超清微距/);
    expect(out).toMatch(/100mm|浅景深|近景/);
  });

  it('finalizeImagePrompt 严禁在普通文生图 (hub/plain) 下篡改提示词或注入商品实物', () => {
    const raw = '动漫原画群像，内容一切随机';
    const outHub = finalizeImagePrompt(raw, {
      workshopMode: 'hub',
    });
    expect(outHub).toBe('动漫原画群像，内容一切随机');
    expect(outHub).not.toContain('@图片1');
    expect(outHub).not.toContain('商品实物');

    const outPlain = finalizeImagePrompt(raw, {
      workshopMode: 'plain',
    });
    expect(outPlain).toBe('动漫原画群像，内容一切随机');

    const outDefault = finalizeImagePrompt(raw);
    expect(outDefault).toBe('动漫原画群像，内容一切随机');
  });
});

describe('prompt-engine / roles', () => {
  it('normalizeOriginalProductRole accurately infers product categories', () => {
    expect(normalizeOriginalProductRole('worn_apparel')).toBe('worn_apparel');
    expect(normalizeOriginalProductRole(undefined, '纯棉短袖T恤')).toBe('worn_apparel');
    expect(normalizeOriginalProductRole(undefined, '18k金珍珠项链')).toBe('worn_accessory');
    expect(normalizeOriginalProductRole(undefined, '桌面摆件台历')).toBe('placed_object');
    expect(normalizeOriginalProductRole(undefined, '保温水杯')).toBe('held_object');
  });

  it('sanitizeLookPartsForProductRole sanitizes apparel vs accessory', () => {
    const apparelLook = sanitizeLookPartsForProductRole(
      { top: '白色衬衫', bottom: '蓝色牛仔裤' },
      undefined,
      'worn_apparel'
    );
    expect(apparelLook.top).toContain('@图片1 所示服装');

    const accLook = sanitizeLookPartsForProductRole(
      { accessory: '普通配饰' },
      undefined,
      'worn_accessory',
      '老凤祥纯金古法手镯'
    );
    expect(accLook.accessory).toContain('@图片1 所示手镯');
  });

  it('scrubOriginalPromptProductConflicts scrubs held conflicts for jewelry', () => {
    const text = '模特手中拿着项链，坐姿捧物置于膝上';
    const scrubbed = scrubOriginalPromptProductConflicts(text, 'worn_accessory');
    expect(scrubbed).not.toContain('手中拿着项链');
    expect(scrubbed).toContain('自然互动展露佩戴的 @图片1');
  });
});

describe('prompt-engine / storyboard', () => {
  it('getHarmonizedStoryboardForScene dynamically preserves arbitrary novel scenes', () => {
    const novelScene = '东京代官山雨后街角，暖黄玻璃橱窗，石板路微光漫反射，湿润清冷氛围';
    const templates = getHarmonizedStoryboardForScene(novelScene);
    expect(templates.length).toBe(4);
    expect(templates[0].sceneSuffix).toContain('东京代官山雨后街角');
    expect(templates[0].camera).toContain('35mm');
    expect(templates[2].camera).toContain('85mm');
  });

  it('getHarmonizedStoryboardForScene handles vehicle ergonomics without shell tray still life', () => {
    const carTemplates = getHarmonizedStoryboardForScene('车内副驾');
    expect(carTemplates.length).toBe(4);
    expect(carTemplates[0].sceneSuffix).toContain('车内副驾');
    expect(carTemplates[3].title).toContain('特写');
    expect(JSON.stringify(carTemplates)).not.toContain('天然贝壳托盘');
  });

  it('getOriginalDiversityForShot returns diversity presets by shot number', () => {
    const shot1 = getOriginalDiversityForShot(1, 'worn_accessory', '车内');
    expect(shot1.title).toBeDefined();
    expect(shot1.camera_focal_length).toBeDefined();
    expect(shot1.scene).toContain('车内');
  });

  it('isOriginalTextTooSimilar detects high textual overlap', () => {
    const a = '优雅年轻女性在晨光微风中漫步街道';
    const b = '优雅年轻女性在晨光微风中漫步街头';
    expect(isOriginalTextTooSimilar(a, b)).toBe(true);

    const c = '静物微距特写，银色哑光金属质感反射光斑';
    expect(isOriginalTextTooSimilar(a, c)).toBe(false);
  });
});

describe('prompt-engine / assembler', () => {
  it('assembleOriginalShotPrompt builds 8-part prompt structure with iPhone candid lifestyle style', () => {
    const prompt = assembleOriginalShotPrompt(
      {
        identityBible: '长相自然清秀的20多岁年轻东亚女生',
        masterScene: '极简北欧风客厅',
        productRole: 'worn_accessory',
      },
      {
        shot_no: 1,
        expression: '自然微笑',
        action: '自然倚靠桌前轻抚耳畔碎发',
      }
    );
    expect(prompt).toContain('@图片1');
    expect(prompt).toContain('极简北欧风客厅');
    expect(prompt).toContain('轻抚耳畔碎发');
    expect(prompt).toContain('iPhone');
    expect(prompt).not.toContain('8K Hasselblad');
    expect(prompt).not.toContain('超高颜值');
  });

  it('enforceOriginalShotDiversity fills missing fields per shot', () => {
    const shots = enforceOriginalShotDiversity([
      { shot_no: 1 },
      { shot_no: 2 },
    ]);
    expect(shots[0].title).toBe('分镜 1');
    expect(shots[1].title).toBe('分镜 2');
    expect(shots[0].camera_focal_length).toBeDefined();
    expect(shots[1].camera_focal_length).toBeDefined();
  });

  it('enforceLookConsistency forces uniform outfit across shots in a set', () => {
    const rawPromptWithConflictingOutfit = '35mm 镜头；20多岁东亚女性模特；佩戴 @图片1 所示首饰；法式咖啡馆外摆；自然晨光；神态自然；身穿复古酒红色针织衫，搭配黑色百褶裙；真实手机画质';
    const canonicalLook = { top: '浅燕麦色垂感无袖针织背心', bottom: '浅色高腰休闲西裤' };
    const consistent = enforceLookConsistency(rawPromptWithConflictingOutfit, canonicalLook, 'worn_accessory');
    expect(consistent).toContain('浅燕麦色垂感无袖针织背心');
    expect(consistent).toContain('浅色高腰休闲西裤');
    expect(consistent).not.toContain('复古酒红色针织衫');
  });

  it('extractOutfitFromPrompt and isGenericLook accurately parse outfits', () => {
    expect(isGenericLook('与商品调性匹配的简洁上装')).toBe(true);
    expect(isGenericLook('浅燕麦色垂感无袖针织背心')).toBe(false);

    const shot1Prompt = '35mm 镜头；20多岁东亚女性模特；佩戴 @图片1 所示手链；法式街角；晨光；身穿纯黑修身羊绒马甲搭配高腰直筒深色牛仔裤；真实手机画质';
    const extracted = extractOutfitFromPrompt(shot1Prompt);
    expect(extracted?.top).toContain('纯黑修身羊绒马甲');
    expect(extracted?.bottom).toContain('高腰直筒深色牛仔裤');
  });

  it('enforceLookConsistency automatically enforces canonical look across conflicting shots', () => {
    const shot1Prompt = '35mm 镜头；20多岁东亚女性模特；佩戴 @图片1 所示手链；法式街角；晨光；身穿纯黑修身羊绒马甲搭配高腰直筒深色牛仔裤；真实手机画质';
    const shot3PromptWithConflict = '85mm 镜头；20多岁东亚女性模特；佩戴 @图片1 所示手链；法式街角；晨光；身穿酒红方领短上衣搭配百褶裙；真实手机画质';
    
    // Extract canonical outfit from shot 1
    const extracted = extractOutfitFromPrompt(shot1Prompt);
    const consistent = enforceLookConsistency(shot3PromptWithConflict, extracted, 'worn_accessory');
    expect(consistent).toContain('纯黑修身羊绒马甲');
    expect(consistent).toContain('高腰直筒深色牛仔裤');
    expect(consistent).not.toContain('酒红方领短上衣');
  });

  it('preventJewelryGlitches prevents necklace rear-view floating chain and cleans chest badges', () => {
    const badNecklacePrompt = '35mm 镜头；模特背对镜头越肩大露背回眸；胸前佩戴相机徽章与眼睛图标；佩戴 @图片1 所示项链；真实画质';
    const cleanPrompt = enforceLookConsistency(badNecklacePrompt, null, 'worn_accessory', '黄金项链');
    expect(cleanPrompt).not.toContain('越肩大露背');
    expect(cleanPrompt).not.toContain('相机徽章');
    expect(cleanPrompt).not.toContain('眼睛图标');
    expect(cleanPrompt).toContain('展露端庄领口');
  });

  it('ensureOriginalPromptSlots injects macro clarity focus for worn_accessory close-ups', () => {
    const macroPrompt = '100mm 极清微距特写；耳际特写；佩戴 @图片1 所示耳钉；柔和天光；真实画质';
    const slotted = ensureOriginalPromptSlots(macroPrompt, {
      hasHuman: true,
      productRole: 'worn_accessory',
    });
    expect(slotted).toContain('超清微距对焦');
  });

  it('resolveDiverseDefaultOutfit adapts correctly for men, babies, travel, and jewelry', () => {
    const menOutfit = resolveDiverseDefaultOutfit('男士机械腕表', '沉稳商务男模');
    expect(menOutfit.top).toBeDefined();
    expect(menOutfit.bottom).toBeDefined();

    const babyOutfit = resolveDiverseDefaultOutfit('宝宝纯金长命锁', '新生儿满月礼');
    expect(babyOutfit.top).toMatch(/纯棉|连体|婴儿/);
  });

  it('assembleGrid2x2Prompt builds 4-grid collage prompt with all 4 panels and unified look', () => {
    const collagePrompt = assembleGrid2x2Prompt(
      {
        identityBible: '长相自然清秀的20多岁年轻东亚女生',
        masterScene: '海边阳光石质拱门长廊',
        lookBible: '法式棉麻白衬衫搭配浅蓝色直筒牛仔裤',
        productRole: 'worn_accessory',
      },
      [
        { shot_no: 1, action: '手部自然轻搭在石栏杆上', expression: '自然微笑' },
        { shot_no: 2, action: '微风吹拂发丝，侧头看海', expression: '宁静从容' },
        { shot_no: 3, action: '手部平放于石台', angle: '局部超清特写' },
        { shot_no: 4, action: '单手轻握包带回眸' },
      ]
    );

    expect(collagePrompt).toContain('2x2 四宫格');
    expect(collagePrompt).toContain('【左上格·分镜1】');
    expect(collagePrompt).toContain('【右上格·分镜2】');
    expect(collagePrompt).toContain('【左下格·分镜3】');
    expect(collagePrompt).toContain('【右下格·分镜4】');
    expect(collagePrompt).toContain('@图片1');
    expect(collagePrompt).toContain('海边阳光石质拱门长廊');
    expect(collagePrompt).toContain('Contact Shadows');
    expect(collagePrompt).toContain('中近景');
    expect(collagePrompt).toContain('全员胸部以上中近景与极近距离局部微距特写构图（严禁远景全身）');
  });

  it('assembleGrid2x2Prompt sanitizes distant full body words to close-up framing', () => {
    const collagePrompt = assembleGrid2x2Prompt(
      {
        productFingerprint: '纯银手镯',
        productRole: 'worn_accessory',
        masterScene: '复古木调咖啡馆'
      },
      [
        { shot_no: 1, action: '站在走廊看镜头', angle: '远景全身' },
        { shot_no: 2, action: '走动全身', angle: '全景' },
      ],
      { macroSlotIndex: 0 }
    );
    expect(collagePrompt).toContain('复古木调咖啡馆');
    expect(collagePrompt).not.toContain('站在走廊');
    expect(collagePrompt).toContain('【左上格·分镜1】 手腕局部超清微距大特写');
    expect(collagePrompt).toContain('中近景');
  });

  it('detectJewelryAnatomy accurately classifies earrings, necklaces, bracelets, and rings', () => {
    expect(detectJewelryAnatomy('worn_accessory', '老凤祥满天星黄金耳环车花耳扣爆闪足金碎碎冰耳饰')).toBe('earring');
    expect(detectJewelryAnatomy('worn_accessory', '周大福镂空方糖足金项链锁骨链')).toBe('necklace');
    expect(detectJewelryAnatomy('worn_accessory', '老凤祥心经银手镯女款足银999纯银镯子')).toBe('bracelet');
    expect(detectJewelryAnatomy('worn_accessory', '莫桑石求婚情侣对戒钻戒')).toBe('ring');
    expect(detectJewelryAnatomy('worn_apparel', '法式复古小黑裙连衣裙')).toBe('apparel');
  });

  it('assembleGrid2x2Prompt dynamically adapts macro close-up for earrings vs bracelets', () => {
    // 1. 耳环商品：分镜1为耳际侧颜超清微距，绝不能是手部平放
    const earringCollage = assembleGrid2x2Prompt(
      {
        productFingerprint: '老凤祥满天星黄金耳环车花耳扣',
        productRole: 'worn_accessory',
        masterScene: '阳光飘窗温馨生活角'
      },
      []
    );
    expect(earringCollage).toContain('耳际侧颜超清微距特写');
    expect(earringCollage).toContain('双耳耳垂');
    expect(earringCollage).not.toContain('手部自然平放于木质台面');

    // 2. 项链商品：分镜1为锁骨项链超清近景大特写
    const necklaceCollage = assembleGrid2x2Prompt(
      {
        productFingerprint: '周大福方糖黄金项链锁骨链',
        productRole: 'worn_accessory',
        masterScene: '艺术画廊窗边'
      },
      []
    );
    expect(necklaceCollage).toContain('颈间项链超清近景大特写');
    expect(necklaceCollage).toContain('领口正中');

    // 3. 手镯商品：分镜1是手腕超清微距大特写
    const braceletCollage = assembleGrid2x2Prompt(
      {
        productFingerprint: '老凤祥纯金古法手镯',
        productRole: 'worn_accessory',
        masterScene: '海岛度假木屋'
      },
      []
    );
    expect(braceletCollage).toContain('手腕局部超清微距大特写');
    expect(braceletCollage).toContain('左手手腕');

    // 4. 戒指商品：分镜严格锁定左手无名指，杜绝左右手或跨手指乱跳
    const ringCollage = assembleGrid2x2Prompt(
      {
        productFingerprint: '老凤祥纯金莫桑石情侣对戒钻戒',
        productRole: 'worn_accessory',
        masterScene: '法式咖啡馆'
      },
      []
    );
    expect(ringCollage).toContain('左手无名指');
    expect(ringCollage).toContain('戒指超清微距大特写');

    // 5. 发簪/步摇商品：分镜1为发髻发簪超清微距大特写
    const hairpinCollage = assembleGrid2x2Prompt(
      {
        productFingerprint: 'AIF故宫簪子步摇流苏簪子',
        productRole: 'worn_accessory',
        masterScene: '苏式园林木窗棂旁'
      },
      []
    );
    expect(hairpinCollage).toContain('45度侧颜');
    expect(hairpinCollage).toContain('侧后方微回眸');
    expect(hairpinCollage).toContain('发髻发簪超清微距特写');
    expect(hairpinCollage).toContain('横插在发髻内部的');
    expect(hairpinCollage).not.toContain('正脸正面平视');
  });

  it('detects hairpin, bag, eyewear and constructs harmonized storyboard angles', () => {
    expect(detectJewelryAnatomy('AIF故宫簪子步摇流苏簪子')).toBe('hairpin');
    expect(detectJewelryAnatomy('复古牛皮单肩腋下包')).toBe('bag');
    expect(detectJewelryAnatomy('复古黑框近视眼镜防蓝光墨镜')).toBe('eyewear');

    const hairpinStoryboards = getHarmonizedStoryboardForScene('新中式茶空间', true, false, 'AIF故宫古风发簪');
    expect(hairpinStoryboards[0].angle).toContain('侧颜');
    expect(hairpinStoryboards[2].angle).toContain('发髻');
  });

  it('assembleReplicationGrid2x2Prompt keeps @图片1, strips @图片2, softens safety wording', () => {
    const collage = assembleReplicationGrid2x2Prompt(
      {
        identityBible: '长相自然清秀的20多岁年轻东亚女生',
        masterScene: '阳光卧室窗边',
        lookBible: '奶杏色开衫搭配浅蓝直筒牛仔裤',
        lookParts: {
          top: '奶杏色开衫',
          bottom: '浅蓝直筒牛仔裤',
          shoes: '白色运动鞋',
          accessory: '佩戴 @图片1 所示商品',
        },
        productRole: 'worn_accessory',
        productFingerprint: '周大福方糖黄金项链锁骨链',
      },
      [
        { shot_no: 1, expression: '甜美浅笑', action: '正面半身', has_human: true },
        { shot_no: 2, expression: '侧颜宁静', action: '微侧头', has_human: true },
        { shot_no: 3, angle: '锁骨胸前部位特写', action: '聚焦项链', has_human: true },
        { shot_no: 4, expression: '松弛甜笑', action: '生活随拍', has_human: true },
      ]
    );

    expect(collage).toContain('2x2 四宫格');
    expect(collage).toContain('@图片1');
    expect(collage).not.toMatch(/@图片\s*2/);
    expect(collage).toContain('【复刻人物守卫】');
    expect(collage).toContain('奶杏色开衫');
    expect(collage).toContain('服装穿搭');
    expect(collage).not.toContain('锁骨胸前超清微距特写');

    const twice = ensureReplicationPromptSlots(collage, { hasHuman: true, hasFace: false });
    expect((twice.match(/【复刻人物守卫】/g) || []).length).toBe(1);
  });

  it('harmonizeOriginalPrompt successfully resolves scene-action conflicts and hairpin perspective', () => {
    // 1. 电车场景下将安全带自动替换为随身包袋或身旁扶手
    const tramResult = harmonizeOriginalPrompt(
      '白天运行中的复古有轨电车车厢内部；单手手腕自然轻搭在安全带或包袋拉链上；同一位长相自然清秀的20多岁东亚女生；同一位长相自然清秀的20多岁东亚女生',
      {
        scene: '白天运行中的复古有轨电车车厢内部',
        action: '单手手腕自然轻搭在安全带或包袋拉链上',
        angle: '45° 侧颜生活抓拍',
        productFingerprint: '黄金项链',
      }
    );
    expect(tramResult.prompt).not.toContain('安全带');
    expect(tramResult.action).not.toContain('安全带');
    expect(tramResult.prompt).toContain('随身包袋');
    // 去重验证
    const matchCount = (tramResult.prompt.match(/同一位长相自然清秀的20多岁东亚女生/g) || []).length;
    expect(matchCount).toBe(1);

    // 2. 发簪商品：强制纠正正面平视机位为 45° 侧颜
    const hairpinResult = harmonizeOriginalPrompt(
      '苏式园林木窗边；真实 iPhone 手机后置，正面胸部以上半身肖像，插戴 @图片1 所示发簪',
      {
        scene: '苏式园林木窗边',
        action: '正面平视自拍',
        angle: '正面半身肖像',
        productFingerprint: '故宫和田玉发簪',
      }
    );
    expect(hairpinResult.angle).toContain('45° 侧颜');
    expect(hairpinResult.prompt).not.toContain('正面胸部以上半身肖像');
    expect(hairpinResult.prompt).toContain('45度侧颜');
  });

  it('assembleGrid2x2Prompt enforces macro close-up for bracelet and cleans disruptive running actions', () => {
    const gridPrompt = assembleGrid2x2Prompt(
      {
        identityBible: '自然清秀年轻东亚女生',
        lookBible: '身穿浅蓝色针织开衫，搭配白色垂感马面长裙',
        lookParts: { top: '浅蓝色针织开衫', bottom: '白色垂感马面长裙' },
        masterScene: '复古欧式街景',
        productRole: 'worn_accessory',
        productFingerprint: '百年老字号足银繁花手镯推拉镯子',
      },
      [
        { shot_no: 1, angle: '正面半身', action: '站在复古走廊前', has_human: true },
        { shot_no: 2, angle: '全景远景', action: '在街头全速奔跑', has_human: true },
        { shot_no: 3, angle: '全身远景', action: '在复古木门前大步奔跑，坐在石阶上捂嘴笑', has_human: true },
        { shot_no: 4, angle: '半身随拍', action: '生活氛围倚靠', has_human: true },
      ],
      { macroSlotIndex: 0 }
    );

    // 验证包含 2x2 四宫格与手镯解剖学约束
    expect(gridPrompt).toContain('2x2 四宫格');
    expect(gridPrompt).toContain('左手手腕');
    // 验证穿搭严密统一
    expect(gridPrompt).toContain('浅蓝色针织开衫');
    expect(gridPrompt).toContain('白色垂感马面长裙');
    // 验证第1格强制为手腕超清微距大特写，且不包含奔跑或远景
    expect(gridPrompt).toContain('【左上格·分镜1】 手腕局部超清微距大特写');
    expect(gridPrompt).toContain('60%~75%');
    // 验证无 8K 负向触发词
    expect(gridPrompt).not.toContain('8K Hasselblad');
    expect(gridPrompt).not.toContain('商业摄影画质');
  });

  it('assembleGrid2x2Prompt allows macroSlotIndex override while defaulting macro to shot 1', () => {
    const defaultMacro = assembleGrid2x2Prompt(
      { productFingerprint: '纯金耳环', productRole: 'worn_accessory', masterScene: '阳光客厅' },
      []
    );
    expect(defaultMacro).toContain('【左上格·分镜1】 耳际侧颜超清微距特写');

    const slot2 = assembleGrid2x2Prompt(
      { productFingerprint: '纯金耳环', productRole: 'worn_accessory', masterScene: '阳光客厅' },
      [],
      { macroSlotIndex: 2 }
    );
    expect(slot2).toContain('【左下格·分镜3】 耳际侧颜超清微距特写');
    expect(slot2).not.toContain('【左上格·分镜1】 耳际侧颜超清微距特写');
  });

  it('optimizes panoramic and running actions into half-body close-up shots for jewelry in harmonizeOriginalPrompt and assembleOriginalShotPrompt', () => {
    // 1. 测试 harmonizeOriginalPrompt 收敛全景与奔跑
    const harmonized = harmonizeOriginalPrompt(
      '美式乡村复古白色木屋门廊；全景站立，在门廊前大步奔跑，佩戴 @图片1 所示足银手镯',
      {
        scene: '美式乡村复古白色木屋门廊',
        action: '在欧式街道上大步奔跑',
        angle: '门廊前远景全景',
        productFingerprint: '足银手镯',
      }
    );
    expect(harmonized.angle).toBe('手腕平放台面半身近镜头');
    expect(harmonized.action).toContain('手部自然平放木质台面');
    expect(harmonized.prompt).not.toContain('全景站立');
    expect(harmonized.prompt).not.toContain('大步奔跑');
    expect(harmonized.prompt).toContain('半身中近景构图');

    // 2. 测试 assembleOriginalShotPrompt 收敛全景与奔跑
    const assembled = assembleOriginalShotPrompt(
      {
        identityBible: '自然年轻东亚女生',
        masterScene: '复古木屋门廊',
        productRole: 'worn_accessory',
        productFingerprint: '纯银手镯手链',
      },
      {
        shot_no: 1,
        angle: '门廊前远景全景',
        action: '在门廊前微模糊的复古跑动',
        camera_focal_length: 'iPhone 24mm 超广角全景镜头',
        scene: '复古木屋门廊',
      }
    );
    expect(assembled).not.toContain('远景全景');
    expect(assembled).not.toContain('微模糊的复古跑动');
    expect(assembled).toContain('手腕特写与中近景镜头');
    expect(assembled).toContain('40%~60%');
  });

  it('extractPureActionFromPrompt extracts only pure action from 9-segment reverse prompt', () => {
    const raw9Seg = `【主体】东亚模特中近景半身像，身体位于右侧，姿态灵动活泼，占画面约55%。
【穿搭或物体细节】米白轻薄，领口与腋下边缘平整，与花朵串珠颈圈，肩背红带彩色绣纹布包。
【动作或摆放】单臂高高举起屈腕于额头上方作遮阳姿态，手指微微舒展，头部微扬正对镜头，体态舒展。背景上方为深褐色倾斜木屋檐板，后方衬以米灰纯净外墙。
【光影】顶部漫射日光洒在面庞与肩臂。
【构图镜头】竖幅仰角中近景，约85mm人像定焦机位。
【材质与真实感】肌肤原生纹理毛孔清晰。
【画质与限制】柔和真实对比，无过度HDR。`;

    const pure = extractPureActionFromPrompt(raw9Seg);
    expect(pure).toContain('单臂高高举起屈腕于额头上方作遮阳姿态');
    expect(pure).not.toContain('【主体】');
    expect(pure).not.toContain('【穿搭或物体细节】');
    expect(pure).not.toContain('【光影】');
    expect(pure).not.toContain('背景上方为深褐色倾斜木屋檐板');

    const stripped = stripGarmentsFromAction(raw9Seg);
    expect(stripped).toContain('单臂高高举起屈腕于额头上方作遮阳姿态');
    expect(stripped).not.toContain('花朵串珠颈圈');
    expect(stripped).not.toContain('布包');
  });

  it('assembleGrid2x2Prompt standardizes prompts and avoids 9-segment tag leaks or broken parentheses', () => {
    const collage = assembleGrid2x2Prompt(
      {
        identityBible: '20多岁东亚年轻女生，深棕色微卷蓬松长发',
        masterScene: '开阔粗颗粒沥青路面，午后温暖侧射阳光',
        lookBible: '米白色宽松无袖棉麻背心，搭配黑底白波点阔腿裤',
        productRole: 'worn_accessory',
        productFingerprint: '纯银拉丝浮雕手镯',
      },
      [
        {
          shot_no: 1,
          angle: '手腕局部超清微距大特写',
          action: '单侧手部自然平放于台面，100mm f/2.8 大光圈超清聚焦手腕',
        },
        {
          shot_no: 2,
          angle: '举臂遮阳半身仰拍机位',
          expression: '眼含笑意，娇憨舒展',
          action: `【主体】东亚模特中近景半身像。
【穿搭或物体细节】米白轻薄，与花朵串珠颈圈。
【动作或摆放】单臂高高举起屈腕于额头上方作遮阳姿态，手指微微舒展，头部微扬正对镜头，体态舒展。背景上方为深褐色木屋檐板。
【光影】顶部漫射日光。`,
          optics: '约85mm仰角半身人像机位，举臂遮阳半身仰拍机位，f/1.8 自然光学浅景深，胸部以上中近景生活抓拍构图（Tight Bust-Up Frame），佩戴首饰的手部/部位自然置于前景显著受光处清晰展现（占据画面 35%~50% 面积）',
        },
        {
          shot_no: 3,
          angle: '侧向大步迈步中近景机位',
          action: '双腿前后大跨步行进，动态抓拍感强',
        },
        {
          shot_no: 4,
          angle: '屈膝托腮坐姿中景',
          action: '双腿屈膝自然并拢，左肘悬空手扶下巴',
        },
      ]
    );

    // 验证新结构化分层标记
    expect(collage).toContain('【4格互斥机位与分镜动作】：');
    expect(collage).toContain('【左上格·分镜1】');
    expect(collage).toContain('【右上格·分镜2】');
    // 验证彻底剔除了九段式污染标签与背景旧木屋
    expect(collage).not.toContain('【主体】');
    expect(collage).not.toContain('【穿搭或物体细节】');
    expect(collage).not.toContain('【动作或摆放】');
    expect(collage).not.toContain('背景上方为深褐色木屋檐板');
    expect(collage).not.toContain('花朵串珠颈圈');
    // 验证无语法畸变（如断头括号 （，）
    expect(collage).not.toContain('（，');
    expect(collage).not.toContain('Tight Bust-Up Frame');
  });
});






