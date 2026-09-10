import { describe, it, expect } from 'vitest';
import {
  inferProductCategoryAndAnatomy,
  buildCategoryCloseUpOptics,
  extractActionCategories,
  extractActionFocusAnchors,
  resolveActionCardDisplayBadges,
  JEWELRY_SUBCATEGORIES,
  matchJewelrySubCategory,
  importSubCategoriesFromText,
  matchItemSubCategory,
  consolidateSubCategoriesLocally,
} from '../productCategoryHelpers';

describe('productCategoryHelpers', () => {
  describe('inferProductCategoryAndAnatomy', () => {
    it('correctly identifies jewelry categories', () => {
      expect(inferProductCategoryAndAnatomy('周大福 传承系列 足金黄金手镯').primaryCategory).toBe('jewelry');
      expect(inferProductCategoryAndAnatomy('周大福 传承系列 足金黄金手镯').targetAnatomy).toBe('bracelet');

      expect(inferProductCategoryAndAnatomy('18K金莫比乌斯环锁骨项链').primaryCategory).toBe('jewelry');
      expect(inferProductCategoryAndAnatomy('18K金莫比乌斯环锁骨项链').targetAnatomy).toBe('necklace');

      expect(inferProductCategoryAndAnatomy('新中式和田玉流苏发簪步摇').primaryCategory).toBe('jewelry');
      expect(inferProductCategoryAndAnatomy('新中式和田玉流苏发簪步摇').targetAnatomy).toBe('hairpin');

      expect(inferProductCategoryAndAnatomy('天然淡水珍珠纯银耳钉耳饰').primaryCategory).toBe('jewelry');
      expect(inferProductCategoryAndAnatomy('天然淡水珍珠纯银耳钉耳饰').targetAnatomy).toBe('earring');

      expect(inferProductCategoryAndAnatomy('六爪镶嵌莫桑钻戒指环').primaryCategory).toBe('jewelry');
      expect(inferProductCategoryAndAnatomy('六爪镶嵌莫桑钻戒指环').targetAnatomy).toBe('ring');
    });

    it('correctly identifies apparel categories', () => {
      const coat = inferProductCategoryAndAnatomy('法式复古双排扣毛呢大衣中长款宽松西装外套');
      expect(coat.primaryCategory).toBe('apparel');
      expect(coat.targetAnatomy).toBe('full_body');

      const dress = inferProductCategoryAndAnatomy('夏日法式碎花真丝吊带连衣裙');
      expect(dress.primaryCategory).toBe('apparel');
      expect(dress.targetAnatomy).toBe('full_body');

      const knit = inferProductCategoryAndAnatomy('羊绒高领宽松软糯针织衫');
      expect(knit.primaryCategory).toBe('apparel');
    });

    it('correctly identifies bag categories', () => {
      const bag = inferProductCategoryAndAnatomy('头层牛皮大容量托特包通勤单肩手提包');
      expect(bag.primaryCategory).toBe('bag');
      expect(bag.targetAnatomy).toBe('hand');
    });

    it('correctly identifies shoes categories', () => {
      const shoes = inferProductCategoryAndAnatomy('真皮粗高跟切尔西短靴英伦马丁靴');
      expect(shoes.primaryCategory).toBe('shoes');
      expect(shoes.targetAnatomy).toBe('feet');
    });

    it('correctly identifies beauty categories', () => {
      const lipstick = inferProductCategoryAndAnatomy('哑光丝绒雾面唇釉显白红管口红');
      expect(lipstick.primaryCategory).toBe('beauty');
      expect(lipstick.targetAnatomy).toBe('lips');

      const perfume = inferProductCategoryAndAnatomy('无人区玫瑰浓香水持久留香');
      expect(perfume.primaryCategory).toBe('beauty');
    });

    it('correctly identifies eyewear categories', () => {
      const eyewear = inferProductCategoryAndAnatomy('复古黑框防蓝光近视眼镜墨镜太阳镜');
      expect(eyewear.primaryCategory).toBe('eyewear');
      expect(eyewear.targetAnatomy).toBe('face');
    });
  });

  describe('buildCategoryCloseUpOptics', () => {
    it('generates jewelry macro optics', () => {
      const optics = buildCategoryCloseUpOptics('jewelry', 'bracelet', 'iPhone 100mm 超清微距镜头', '台面手腕微距');
      expect(optics).toContain('100mm超清微距大光圈浅景深对焦手腕');
      expect(optics).toContain('55%~75%');
    });

    it('generates apparel detail close-up optics', () => {
      const optics = buildCategoryCloseUpOptics('apparel', 'full_body', 'iPhone 85mm 镜头', '面料近景');
      expect(optics).toContain('面料与版型局部近景特写构图');
      expect(optics).toContain('f/2.0 大光圈浅景深对焦');
    });

    it('generates bag detail close-up optics', () => {
      const optics = buildCategoryCloseUpOptics('bag', 'hand', 'iPhone 85mm 镜头', '包袋近景');
      expect(optics).toContain('包袋局部近景特写构图');
      expect(optics).toContain('真皮天然荔枝纹理');
    });

    it('generates shoes detail close-up optics', () => {
      const optics = buildCategoryCloseUpOptics('shoes', 'feet', 'iPhone 85mm 镜头', '鞋履特写');
      expect(optics).toContain('足部与鞋型局部近景特写构图');
    });
  });

  describe('extractActionCategories', () => {
    it('extracts multi-category badges for multi-purpose actions', () => {
      const multiAction = {
        title: '真丝细丝巾搭配项链层次生活随拍',
        action: '生活空间漫步：颈间松松搭一条素雅真丝细丝巾，金属项链在丝巾间若隐若现，单手轻抚包带，半身中景展现层次丰富的高级私服搭配',
        suitableAnatomy: JSON.stringify(['necklace', 'apparel', 'bag']),
        tags: '丝巾搭配, 层次穿搭, 项链',
      };
      const badges = extractActionCategories(multiAction);
      const ids = badges.map((b) => b.id);
      expect(ids).toContain('jewelry');
      expect(ids).toContain('apparel');
      expect(ids).toContain('bag');
    });

    it('extracts pure jewelry badges', () => {
      const jewelryAction = {
        title: '双耳耳垂贴耳小巧耳饰超清微距',
        action: '100mm f/2.8 大光圈浅景深超清对焦耳垂佩戴的小巧耳饰',
        suitableAnatomy: JSON.stringify(['earring', 'jewelry']),
        tags: '耳饰微距',
      };
      const badges = extractActionCategories(jewelryAction);
      expect(badges.map((b) => b.id)).toContain('jewelry');
    });

    it('correctly identifies digital categories', () => {
      const phone = inferProductCategoryAndAnatomy('Apple iPhone 16 Pro 钛金属手机壳');
      expect(phone.primaryCategory).toBe('digital');
      expect(phone.targetAnatomy).toBe('hand');
    });
  });

  describe('extractActionFocusAnchors & resolveActionCardDisplayBadges', () => {
    it('correctly extracts collarbone focus anchor for necklace actions', () => {
      const necklaceAction = {
        title: '星芒正视纯享锁骨项链特写机位',
        action: '单人颈顶与平直锁骨正中特写，项链吊坠位于正中心',
        suitableAnatomy: JSON.stringify(['necklace']),
        shotType: 'close_up',
      };
      const anchors = extractActionFocusAnchors(necklaceAction);
      expect(anchors.some((a) => a.id === 'collarbone')).toBe(true);

      const badges = resolveActionCardDisplayBadges(necklaceAction);
      expect(badges[0].label).toBe('首饰');
      expect(badges[1].label).toBe('项链特写');
      expect(badges[1].isAnchor).toBe(true);
    });

    it('correctly extracts fingers focus anchor for ring actions', () => {
      const ringAction = {
        title: '竖立微捏扶杯特写机位',
        action: '手掌微侧竖立，五指自然微屈并拢贴于玻璃杯后侧，突出无名指戒指',
        suitableAnatomy: JSON.stringify(['ring']),
        shotType: 'macro_detail',
      };
      const anchors = extractActionFocusAnchors(ringAction);
      expect(anchors.some((a) => a.id === 'fingers')).toBe(true);

      const badges = resolveActionCardDisplayBadges(ringAction);
      expect(badges[0].label).toBe('首饰');
      expect(badges[1].label).toBe('戒指特写');
      expect(badges[1].isAnchor).toBe(true);
    });

    it('correctly extracts wrist focus anchor for bracelet actions', () => {
      const braceletAction = {
        title: '斜向舒展置手手镯微距机位',
        action: '右手小臂斜向自然平展，手背朝上五指放松微曲，露出手腕翡翠玉镯',
        suitableAnatomy: JSON.stringify(['bracelet']),
        shotType: 'macro_detail',
      };
      const anchors = extractActionFocusAnchors(braceletAction);
      expect(anchors.some((a) => a.id === 'wrist')).toBe(true);

      const badges = resolveActionCardDisplayBadges(braceletAction);
      expect(badges.map((b) => b.label)).toEqual(['首饰', '手镯特写']);
    });

    it('correctly tags all 4 user circled cards as [首饰] [手镯特写]', () => {
      // 1. #A-ivfz 侧腕展示手部特写机位
      const cardIvfz = {
        title: '侧腕展示手部特写机位',
        action: '手前臂自然伸展，手背微偏向镜头展示腕部饰品佩戴状态',
        shotType: 'close_up',
        suitableAnatomy: JSON.stringify(['jewelry', 'wrist', 'bracelet']),
      };
      expect(resolveActionCardDisplayBadges(cardIvfz).map((b) => b.label)).toEqual(['首饰', '手镯特写']);

      // 2. #A-2e0u 手背托举展示特写机位
      const card2e0u = {
        title: '手背托举展示特写机位',
        action: '手指勾挂饰品，向镜头平展展示串珠全貌',
        shotType: 'close_up',
        suitableAnatomy: JSON.stringify(['jewelry', 'wrist', 'bracelet']),
      };
      expect(resolveActionCardDisplayBadges(card2e0u).map((b) => b.label)).toEqual(['首饰', '手镯特写']);

      // 3. #A-8nlp 单手屈指托展特写机位
      const card8nlp = {
        title: '单手屈指托展特写机位',
        action: '手掌平展自然撑托起手链，五指微弯呈托举态',
        shotType: 'macro_detail',
        suitableAnatomy: JSON.stringify(['jewelry', 'wrist', 'bracelet']),
      };
      expect(resolveActionCardDisplayBadges(card8nlp).map((b) => b.label)).toEqual(['首饰', '手镯特写']);

      // 4. #A-q6bd 托举展示微距机位
      const cardQ6bd = {
        title: '托举展示微距机位',
        action: '单手掌心向内微微弯曲，指间轻提挂绳，将环状珠串平展朝向镜头展示',
        shotType: 'macro_detail',
        suitableAnatomy: JSON.stringify(['jewelry', 'wrist', 'bracelet']),
      };
      expect(resolveActionCardDisplayBadges(cardQ6bd).map((b) => b.label)).toEqual(['首饰', '手镯特写']);
    });

    it('correctly extracts smartphone focus anchors', () => {
      const cameraAction = {
        title: '后摄镜头模组金属高光超清微距',
        action: 'iPhone 100mm微距对焦后置镜头模组Deco阶梯切角',
        suitableAnatomy: JSON.stringify(['digital_3c', 'smartphone', 'camera_deco']),
        shotType: 'macro_detail',
      };
      const anchors = extractActionFocusAnchors(cameraAction);
      expect(anchors.some((a) => a.id === 'camera_deco')).toBe(true);

      const badges = resolveActionCardDisplayBadges(cameraAction);
      expect(badges[0].label).toBe('手机数码');
      expect(badges[1].label).toBe('镜头模组');
    });

    it('correctly extracts universal anatomical anchors and composite badges for general close-up actions', () => {
      // 1. 手部微距特写 (#A-yig5)
      const handMacro = {
        title: '斜向舒展覆手微距机位',
        action: '右手手臂斜向自然平展，手背朝上五指放松微曲',
        shotType: 'macro_detail',
        suitableAnatomy: JSON.stringify(['universal']),
      };
      const handAnchors = extractActionFocusAnchors(handMacro);
      expect(handAnchors.some((a) => a.id === 'hands')).toBe(true);
      const handBadges = resolveActionCardDisplayBadges(handMacro);
      expect(handBadges[0].label).toBe('通用');
      expect(handBadges[1].label).toBe('手部特写');

      // 2. 面部神态特写 (#A-11sb)
      const faceCloseUp = {
        title: '捏花贴脸欢笑近景机位',
        action: '右手捏单朵雏菊举于眼前，身体微倾，正对镜头张嘴大笑，左肩微耸',
        shotType: 'close_up',
        suitableAnatomy: JSON.stringify(['universal']),
      };
      const faceAnchors = extractActionFocusAnchors(faceCloseUp);
      expect(faceAnchors.some((a) => a.id === 'face')).toBe(true);
      const faceBadges = resolveActionCardDisplayBadges(faceCloseUp);
      expect(faceBadges[0].label).toBe('通用');
      expect(faceBadges[1].label).toBe('面部特写');

      // 3. 颈肩胸像特写 (#A-gdxt)
      const bustCloseUp = {
        title: '端坐正面居中特写机位',
        action: '双肩水平舒展，身体正对镜头静止',
        shotType: 'close_up',
        suitableAnatomy: JSON.stringify(['universal']),
      };
      const bustAnchors = extractActionFocusAnchors(bustCloseUp);
      expect(bustAnchors.some((a) => a.id === 'neck')).toBe(true);
      const bustBadges = resolveActionCardDisplayBadges(bustCloseUp);
      expect(bustBadges[0].label).toBe('通用');
      expect(bustBadges[1].label).toBe('颈肩特写');
    });

    it('falls back to category badges when no specific close-up anchor is matched', () => {
      const lifestyleAction = {
        title: '咖啡馆随性坐姿甜笑',
        action: '双手托腮自然微笑互动，眼神灵动放电',
        suitableAnatomy: JSON.stringify(['all']),
        shotType: 'half_body',
      };
      const badges = resolveActionCardDisplayBadges(lifestyleAction);
      expect(badges[0].label).toBe('通用');
      expect(badges[1].label).toBe('半身姿态');
    });

    it('respects manual tag override even when title or action contains misleading keywords', () => {
      // #A-h909 场景：标题有“近景”，动作有“遮住下半脸部”
      const cardH909 = {
        title: '双手高举托盘近景机位',
        action: '双手高举蛋糕托盘遮住下半脸部，仅露出双眼注视镜头',
        shotType: 'half_body',
        suitableAnatomy: JSON.stringify(['universal']),
      };
      // 1. 显式 shotType 为 half_body 时，不再被近景/脸部劫持为面部特写
      const badges1 = resolveActionCardDisplayBadges(cardH909);
      expect(badges1.map((b) => b.label)).toEqual(['通用', '半身姿态']);

      // 2. 用户手动在 tags 中指定“半身姿态”
      const manualHalf = { ...cardH909, tags: '半身姿态, 生日' };
      const badges2 = resolveActionCardDisplayBadges(manualHalf);
      expect(badges2.map((b) => b.label)).toEqual(['通用', '半身姿态']);

      // 3. 用户手动在 tags 中指定“面部特写”
      const manualFace = { ...cardH909, tags: '面部特写, 生日' };
      const badges3 = resolveActionCardDisplayBadges(manualFace);
      expect(badges3.map((b) => b.label)).toEqual(['通用', '面部特写']);
    });
  });

  describe('JEWELRY_SUBCATEGORIES & matchJewelrySubCategory', () => {
    it('defines the 6 core ecommerce jewelry subcategories', () => {
      const ids = JEWELRY_SUBCATEGORIES.map((s) => s.id);
      expect(ids).toEqual(['necklace', 'bracelet', 'ring', 'earring', 'hairpin', 'brooch']);
    });

    it('correctly matches jewelry subcategories from anchors and text keywords', () => {
      const necklaceItem = {
        title: '法式复古珍珠项链微抚锁骨机位',
        action: '单手食指轻抚锁骨与吊坠，视线低垂',
        suitableAnatomy: JSON.stringify(['necklace']),
        shotType: 'close_up',
      };
      expect(matchJewelrySubCategory(necklaceItem)?.id).toBe('necklace');

      const braceletItem = {
        title: '天然翡翠玉镯整理衣袖露腕机位',
        action: '双手整理羊绒衣袖，自然展露手腕佩戴的浅绿翡翠圆镯',
        suitableAnatomy: JSON.stringify(['wrist']),
        shotType: 'macro_detail',
      };
      expect(matchJewelrySubCategory(braceletItem)?.id).toBe('bracelet');

      const ringItem = {
        title: '指间莫桑钻戒托腮展戒',
        action: '指尖轻抚下颌展露无名指大克拉钻石戒面',
        tags: '展戒, 戒指特写',
      };
      expect(matchJewelrySubCategory(ringItem)?.id).toBe('ring');

      const broochItem = {
        title: '经典双排扣西装翻领珍珠胸针特写',
        action: '端庄侧立，单手整理西装翻领上的复古巴洛克珍珠胸针',
        tags: '胸针特写, 西服饰品',
      };
      expect(matchJewelrySubCategory(broochItem)?.id).toBe('brooch');
    });

    it('supports importing custom subcategories from text', () => {
      const textToImport = `
        脚链/脚镯: 踝饰, 脚踝, 凉鞋搭配, 细链
        发带/发箍 (发饰, 蝴蝶结, 头饰)
      `;
      const result = importSubCategoriesFromText('jewelry', textToImport, 'append');
      const anklet = result.find((r) => r.label === '脚链/脚镯');
      expect(anklet).toBeDefined();
      expect(anklet?.anatomy).toBe('ankle');
      expect(anklet?.keywords).toContain('脚踝');
      expect(anklet?.isCustom).toBe(true);

      const hairband = result.find((r) => r.label === '发带/发箍');
      expect(hairband).toBeDefined();
      expect(hairband?.anatomy).toBe('hair');
      expect(hairband?.keywords).toContain('蝴蝶结');

      // Test matching item with newly imported subcategory
      const ankletItem = {
        title: '法式优雅细珍珠脚链侧面特写机位',
        action: '自然交叠双脚展示纤细踝部佩戴的碎珍珠脚链',
      };
      const matched = matchItemSubCategory(ankletItem, 'jewelry', result);
      expect(matched?.label).toBe('脚链/脚镯');
    });

    it('consolidates fragmented subcategory lists into semantic body part clusters', () => {
      // 模拟用户从电商平台批量复制的 20+ 个碎片类目（涵盖手镯、手链、翡翠项链、黄金吊坠、戒指、耳环、发簪、首饰盒等）
      const rawText = `
        黄金手链
        银手镯
        手链
        翡翠手镯
        和田玉手串
        珍珠手链
        K金手镯
        铂金手链
        翡翠吊坠
        黄金套链
        黄金项链
        珍珠项链
        K金项链
        铂金项链
        戒指
        银戒指
        黄金戒指
        培育钻石
        耳饰
        黄金耳饰
        珍珠耳饰
        发圈
        发夹
        发簪
        胸针
        脚链
        投资金
        首饰盒
      `;
      const imported = importSubCategoriesFromText('jewelry', rawText, 'replace');
      expect(imported.length).toBeGreaterThan(20);

      // 执行本地语义聚类与查重
      const consolidation = consolidateSubCategoriesLocally('jewelry', imported);

      // 原有 28 个零散类目应该被规整为 8~9 个标准类目
      expect(consolidation.originalCount).toBe(28);
      expect(consolidation.consolidatedCount).toBeLessThanOrEqual(9);

      // 验证手腕饰品类目
      const wristGroup = consolidation.groups.find((g) => g.clusterId === 'wrist_ornament');
      expect(wristGroup).toBeDefined();
      expect(wristGroup?.category.label).toBe('手镯/手链/手串');
      expect(wristGroup?.category.anatomy).toBe('wrist');
      // 确认吸收了手镯、手链、手串等多种碎片类目
      expect(wristGroup?.absorbedLabels).toContain('黄金手链');
      expect(wristGroup?.absorbedLabels).toContain('银手镯');
      expect(wristGroup?.absorbedLabels).toContain('翡翠手镯');
      expect(wristGroup?.absorbedLabels).toContain('和田玉手串');
      // 材质已沉淀进 keywords
      expect(wristGroup?.category.keywords).toContain('黄金手链');
      expect(wristGroup?.category.keywords).toContain('翡翠手镯');

      // 验证项链吊坠类目
      const neckGroup = consolidation.groups.find((g) => g.clusterId === 'neck_ornament');
      expect(neckGroup).toBeDefined();
      expect(neckGroup?.category.label).toBe('项链/吊坠/锁骨链');
      expect(neckGroup?.absorbedLabels).toContain('翡翠吊坠');
      expect(neckGroup?.absorbedLabels).toContain('黄金项链');

      // 验证静物杂项类目（投资金、首饰盒）
      const curioGroup = consolidation.groups.find((g) => g.clusterId === 'curio_and_static');
      expect(curioGroup).toBeDefined();
      expect(curioGroup?.absorbedLabels).toContain('投资金');
      expect(curioGroup?.absorbedLabels).toContain('首饰盒');
    });
  });
});



