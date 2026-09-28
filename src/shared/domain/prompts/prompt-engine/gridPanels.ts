import { isPhoneProduct } from '../../products/phoneProductPolicy';
import {
  type OriginalGroupBible,
  type OriginalProductRole,
  type OriginalShotFields,
  type JewelryAnatomyType,
  detectJewelryAnatomy,
  getJewelryAnatomyStatement,
  joinLookSummary,
  normalizeOriginalProductRole,
  stripGarmentsFromAction,
} from './roles';
import { sanitizeScenePrompt } from '../../assets/assetDeconstruct/sanitize';
import { isJewelryAnatomy } from './jewelryFraming';

export interface Grid2x2Options {
  hasFace?: boolean;
  hasSceneAnchor?: boolean;
  productIndex?: number;
  macroSlotIndex?: number;
}

const PANEL_LABELS = ['【左上格·分镜1】', '【右上格·分镜2】', '【左下格·分镜3】', '【右下格·分镜4】'];
const DISRUPTIVE_RE = /(远景|全景|走廊|奔跑|跑步|石阶|双手抬起|摸头|抚发)/;

function isOpenCompositionGrid(role: OriginalProductRole, anatomy: JewelryAnatomyType, fingerprint?: string): boolean {
  return role === 'held_object' || anatomy === 'held' || isPhoneProduct(fingerprint);
}

function stripStutterFraming(angle: string): string {
  return angle
    .replace(/中中近景/g, '中近景')
    .replace(/(半身中近景){2,}/g, '半身中近景')
    .replace(/(中近景半身){2,}/g, '中近景半身')
    .replace(/(?:中近景|半身|特写)*(?:半身中近景|中近景半身像|中近景半身|中近景)+(?:生活抓拍|人像|构图)?/g, '胸部以上中近景')
    .replace(/(?:胸部以上中近景\s*)+/g, '胸部以上中近景');
}

function jewelryDefaultDescs(anatomy: JewelryAnatomyType): string[] {
  let descMacro = '极近距离超清微距特写：100mm f/2.8 大光圈浅景深超清对焦 @图片1 所示商品实物，商品占据画面 60%~75% 核心视觉中心，呈现金属光泽、立体雕花细节与微观质感，背景自然虚化。';
  let descPortrait = '胸部以上正面自然肖像：平视视角，眼神灵动带笑看镜头，双手轻搭身前桌沿，自然展露佩戴的 @图片1 所示商品，胸部以上中近景构图。';
  let descSideAngle = '胸部以上45度侧颜抓拍：微侧身看窗外天光，发丝轻拂，斜射阳光勾勒侧颜下颌线条，佩戴部位清晰置于前景受光处，半身中近景。';
  let descLifestyle = '生活空间氛围随拍：桌前倚靠或手扶包带，神态甜美松弛，佩戴部位与灵动容颜自然同框，胸部以上中近景，展现私服穿搭与生活温度。';

  switch (anatomy) {
    case 'hairpin':
      descMacro = '发髻发簪超清微距特写：100mm f/2.8 大光圈浅景深超清聚焦盘发发髻，清晰呈现发丝纹理与横插在发髻内部的 @图片1 发簪，雕花与垂坠流苏细节纤毫毕现，背景自然柔和虚化。';
      descPortrait = '45度侧颜温婉盘发抓拍：侧身平视视角，长发梳成温婉低盘发髻，斜射阳光清晰展现插戴在发髻中的 @图片1 发簪与发丝层次，手腕光洁无手镯，中近景构图。';
      descSideAngle = '侧后方微回眸盘发抓拍：侧后方45度回眸，聚焦后脑勺与侧颈优美盘发，清晰展现横插于发髻内部的 @图片1 发簪与垂坠流苏微光，中近景人像。';
      descLifestyle = '生活空间盘发温婉随拍：端坐桌前，单手轻抚鬓角碎发，温婉饱满的盘发发髻插戴着 @图片1 发簪，神态恬淡温润，胸部以上半身近景。';
      break;
    case 'earring':
      descMacro = '耳际侧颜超清微距特写：微侧头看光，单手轻挽耳后发丝，100mm f/2.8 大光圈浅景深超清对焦双耳耳垂佩戴的 @图片1 耳饰实物，商品占据画面核心（45%~60% 面积），呈现金属微光与宝石切面，背景柔和虚化。';
      descPortrait = '胸部以上正面自然肖像：平视视角，眼神清澈灵动带笑看镜头，双手轻搭桌沿，清晰展露双耳佩戴的 @图片1 耳饰与优雅气质，胸部以上中近景饱满构图。';
      descSideAngle = '45度侧颜微风中近景抓拍：侧头看阳光天光，微风吹拂发丝，斜射阳光勾勒侧颜下颌线条与耳垂佩戴的 @图片1 耳饰光影，胸部以上中近景。';
      descLifestyle = '生活氛围感中近景随拍：生活空间舒适倚靠，神态甜美松弛，展露耳饰与蓬松发丝层次，胸部以上中近景肖像。';
      break;
    case 'necklace':
      descMacro = '颈间项链超清近景大特写：平视聚焦端庄领口正中，100mm f/2.8 大光圈浅景深超清对焦自然垂坠的 @图片1 项链吊坠实物，项链占据画面核心中心（50%~70% 面积），精细呈现金属反光与微观切面，背景柔美虚化。';
      descPortrait = '胸部以上买家秀展示肖像：平视视角，神态明媚自然，单手捏起颈间佩戴的 @图片1 项链吊坠向镜头展示，端庄领口清晰展露项链做工，胸部以上中近景饱满构图。';
      descSideAngle = '45度侧颜微风中近景抓拍：微侧头看窗外天光，斜射阳光洒在颈间，勾勒侧颜与颈间 @图片1 项链自然微光，胸部以上中近景人像。';
      descLifestyle = '生活氛围感中近景随拍：生活空间舒适倚靠，手部轻扶随身包带，神态甜美松弛，展露颈间项链与私服穿搭，胸部以上中近景。';
      break;
    case 'bracelet':
      descMacro = '手腕局部超清微距大特写：单侧手部自然平放于台面（手部有真实物理支撑），100mm f/2.8 大光圈超清聚焦左手手腕佩戴的 @图片1 手镯实物，手镯占据画面 60%~75% 视觉中心，呈现金属拉丝抛光与立体浮雕做工，背景柔和虚化。';
      descPortrait = '胸部以上45度侧颜手腕前置抓拍：侧身倚靠，左手轻抬至身前显著受光处，手腕佩戴的 @图片1 手镯置于离镜头最近的超清焦平面，与灵动侧颜同框，胸部以上中近景。';
      descSideAngle = '正面托腮买家秀肖像展示：平视机位，单手托腮笑意盈盈直视镜头，托腮的手腕将佩戴的 @图片1 手镯推至脸侧视觉焦点，清晰呈现手镯雕花做工，胸部以上肖像。';
      descLifestyle = '生活空间双手捧杯互动随拍：双手环捧温热水杯置于身前受光处，佩戴手镯的手腕处于第一清晰焦平面，手镯光泽立体锐利，真实生活抓拍感，半身近景。';
      break;
    case 'ring':
      descMacro = '手指戒指超清微距大特写：手部自然平放于木质台面或轻搭书脊边缘（手部有真实物理支撑），100mm f/2.8 大光圈超清聚焦左手无名指佩戴的 @图片1 戒指实物，戒指占据画面 60%~75% 视觉中心，呈现戒圈做工、金属光泽与主石微观折射反光，背景柔和虚化。';
      descPortrait = '胸部以上正面自然肖像：平视视角，左手轻搭身前桌沿展露无名指佩戴的 @图片1 戒指，眼神明媚微笑，胸部以上饱满中近景构图。';
      descSideAngle = '45度侧颜微风中近景抓拍：自然侧身看窗外天光，左手轻搭桌面展露无名指戒指，神态恬淡放松，胸部以上中近景人像。';
      descLifestyle = '生活氛围感中近景随拍：生活空间舒适倚靠，左手轻扶包带，左手无名指戒指与甜美面容自然同框，胸部以上中近景。';
      break;
    case 'bag':
      descMacro = '包袋材质与五金超清微距特写：100mm f/2.8 大光圈浅景深超清对焦 @图片1 包袋细腻皮质纹理与五金搭扣光泽，占据画面 65%~80% 核心面积，细节锐利分明。';
      descPortrait = '正面胸部以上穿搭中近景抓拍：单肩背着或手提 @图片1 包袋，神态从容自然，眼神看镜头浅笑，展现包袋版型与私服搭配，中近景构图。';
      descSideAngle = '45度侧身漫步中近景抓拍：侧身走动，手轻扶 @图片1 包袋肩带，展现包袋皮质光泽与整体生活氛围，半身中近景人像。';
      descLifestyle = '生活氛围随拍：手提包袋置于身侧桌边或椅背，人与包袋自然互动，展现生活温度，中近景构图。';
      break;
    case 'apparel':
      descMacro = '服饰面料与剪裁局部超清微距特写：100mm f/2.8 大光圈浅景深超清聚焦 @图片1 衣服高级面料肌理与精致走线质感，商品实物占据 65%~80% 核心面积，细节锐利清晰。';
      descPortrait = '正面胸部以上穿搭中近景抓拍：神态从容自然，眼神看镜头浅笑，清晰展现穿着的 @图片1 服装领口版型与高级气质，胸部以上中近景。';
      descSideAngle = '45度侧颜微风半身抓拍：侧头回眸，微风吹拂发丝与衣摆，展现 @图片1 衣服立体垂坠感与优雅剪裁，半身中近景人像。';
      descLifestyle = '生活氛围感中近景随拍：生活空间舒适倚靠或街头漫步，双手插兜或手扶包带，展现 @图片1 服装版型与高级氛围，中近景构图。';
      break;
  }
  return [descMacro, descPortrait, descSideAngle, descLifestyle];
}

function sanitizeJewelryActionAngle(
  anatomy: JewelryAnatomyType,
  isMacroSlot: boolean,
  userAction: string,
  userAngle: string,
): { userAction: string; userAngle: string } {
  let action = userAction;
  let angle = userAngle;
  if (anatomy === 'hairpin') {
    action = action.replace(/(手腕|手指|挽袖子|拉手袋拉链|整理手袋|整理包袋)[^，；;]*/g, '侧头温婉盘发优雅展露发间发簪');
    action = action.replace(/(披肩发|披发|散发|直发)/g, '温婉低盘发髻');
    angle = angle.replace(/(正面肖像|正面平视|手腕|手指|锁骨)[^，；;]*/g, isMacroSlot ? '发髻发簪部位超清微距特写' : '45度侧颜发髻半身抓拍');
  } else if (anatomy === 'earring') {
    action = action.replace(/(手腕|手指|挽袖子|拉手袋拉链|整理手袋|整理包袋)[^，；;]*/g, '微侧头发丝随性挽于耳后展露耳饰');
    angle = angle.replace(/(手腕|手指|锁骨)[^，；;]*/g, isMacroSlot ? '耳际侧颜局部超清微距特写' : '胸部以上中近景');
  } else if (anatomy === 'necklace') {
    action = action.replace(/(手腕|手指|挽袖子|拉手袋拉链)[^，；;]*/g, '端庄领口自然展露颈间项链');
    angle = angle.replace(/(手腕|手指|耳际)[^，；;]*/g, isMacroSlot ? '颈间项链锁骨超清近景大特写' : '胸部以上中近景');
  } else if (anatomy === 'bracelet') {
    const braceletDisruptive =
      /(站在走廊|走廊站立|全景奔跑|街头奔跑|大步奔跑|坐在石阶|捂嘴笑|整理手袋|整理包袋|跑步|奔跑|双手抬起|抬手整理发丝|整理头发|摸头|抚发)/;
    if (braceletDisruptive.test(action)) {
      action = isMacroSlot ? '手部自然平放木质台面超清微距特写' : '左手轻搭身前显著受光展露手镯';
    }
    angle = angle.replace(/(全景|远景|全身|长廊|耳际|锁骨)[^，；;]*/g, isMacroSlot ? '手腕局部超清微距大特写' : '胸部以上中近景');
  } else if (anatomy === 'ring') {
    action = action.replace(/(站在走廊|走廊站立|全景奔跑|街头奔跑|大步奔跑|坐在石阶|捂嘴笑|双手抬起|抬手整理发丝|整理头发)[^，；;]*/g, isMacroSlot ? '手指自然轻搭木质台面戒指超清微距特写' : '左手轻搭身前桌沿展露戒指');
    angle = angle.replace(/(全景|远景|全身|长廊|耳际|锁骨)[^，；;]*/g, isMacroSlot ? '手指局部超清微距大特写' : '胸部以上中近景');
  }
  return { userAction: action, userAngle: angle };
}

function buildPanelLines(
  paddedShots: OriginalShotFields[],
  anatomy: JewelryAnatomyType,
  macroSlot: number,
  defaultPanelDescs: string[],
  openComposition: boolean,
): string[] {
  const cleanedActions: string[] = [];
  const panelLines: string[] = [];
  const jewelry = isJewelryAnatomy(anatomy);

  paddedShots.slice(0, 4).forEach((s, idx) => {
    const label = PANEL_LABELS[idx];
    const isMacroSlot = idx === macroSlot;
    const rawAction = (s.action || '').trim();
    const rawAngle = (s.angle || '').trim();
    let userAction = rawAction.replace(/站在走廊|走廊站立/g, '桌前倚靠');
    if (!openComposition) {
      userAction = userAction.replace(/(远景|全景|全身站立|全身)+/g, '胸部以上中近景');
    }
    userAction = userAction.replace(/(?:向前伸手|朝镜头伸手|向镜头伸手|伸手抓镜头|伸手靠近镜头|手伸向前|伸手抓拍|手伸向屏幕|比大爱心|比大耶)+/g, '双手自然轻搭在身前桌沿');
    userAction = stripGarmentsFromAction(userAction, idx);
    const userExpr = (s.expression || '').trim();
    let userAngle = openComposition ? rawAngle : rawAngle.replace(/(远景|全景|全身站立|全身)+/g, '胸部以上中近景');
    const userProp = (s.prop || '').trim();
    const userCamera = (s.camera_focal_length || '').trim();

    let userOptics = (s.optics || '').trim()
      .replace(/Shot on iPhone[^\n，；;]*/gi, '')
      .replace(/Tight Bust-Up Frame/gi, '')
      .replace(/Unedited RAW photo[^\n，；;]*/gi, '')
      .replace(/胸部以上中近景生活抓拍构图[（(]?[^)）]*[)）]?/g, '')
      .replace(/生动展露博主自然生活神态[^\n，；;]*/g, '')
      .replace(/严禁退后到全身远景[^\n，；;]*/g, '')
      .replace(/微弱自然传感器胶片微颗粒感[^\n，；;]*/g, '')
      .replace(/佩戴首饰的手部\/部位自然置于前景显著受光处清晰展现[（(]?[^)）]*[)）]?/g, '首饰自然置于受光处清晰展现')
      .replace(/（[，,\s]*/g, '（')
      .replace(/[，,\s]*）/g, '）')
      .replace(/（\s*）/g, '')
      .replace(/[，,]{2,}/g, '，')
      .replace(/^[，,。.；;\s]+/, '')
      .replace(/[，,。.；;\s]+$/, '')
      .trim();

    userAngle = stripStutterFraming(userAngle);

    if (userAngle && userOptics && (userAngle.includes('85mm') || userAngle.includes('35mm') || userAngle.includes('50mm') || userAngle.includes('100mm'))) {
      userOptics = userOptics.replace(/(?:约)?(?:85mm|35mm|50mm|100mm|f\/1\.8|浅景深)[^，。；;]*/g, '').trim();
      userOptics = userOptics.replace(/^[，,。.；;\s]+/, '').replace(/[，,。.；;\s]+$/, '');
    }

    if (jewelry) {
      const cleaned = sanitizeJewelryActionAngle(anatomy, isMacroSlot, userAction, userAngle);
      userAction = cleaned.userAction;
      userAngle = cleaned.userAngle;
    }

    const actionKey = userAction.slice(0, 10);
    const isDuplicateAction = cleanedActions.includes(actionKey);
    if (!isDuplicateAction && userAction) cleanedActions.push(actionKey);

    const forceJewelryMacro = jewelry && isMacroSlot && (!rawAction || DISRUPTIVE_RE.test(`${rawAction}${rawAngle}`));
    if (forceJewelryMacro) {
      panelLines.push(`${label} ${defaultPanelDescs[idx]}`);
      return;
    }
    if (isDuplicateAction || (!userAction && !userAngle)) {
      panelLines.push(`${label} ${defaultPanelDescs[idx]}`);
      return;
    }
    if (userAction || userExpr || userAngle) {
      let resolvedAngle = userAngle;
      if (jewelry && !isMacroSlot && (resolvedAngle.includes('微距') || resolvedAngle.includes('特写'))) {
        resolvedAngle = '胸部以上中近景';
      }
      const parts = [
        resolvedAngle || (jewelry ? (isMacroSlot ? '局部超清微距特写' : '胸部以上45度侧颜中近景') : ''),
        userExpr ? `神态表情：${userExpr}` : '',
        userAction ? `肢体动作：${userAction}` : '',
        userProp ? `道具互动：${userProp}` : '',
        userCamera && !`${resolvedAngle}${userOptics}`.includes(userCamera) ? userCamera : '',
        userOptics ? `光学：${userOptics}` : '',
      ].filter(Boolean);
      const lineContent = parts.join('，')
        .replace(/，，/g, '，')
        .replace(/（，/g, '（')
        .replace(/（\s*）/g, '')
        .replace(/[，,；;]+$/, '');
      panelLines.push(`${label} ${lineContent}。`);
      return;
    }
    panelLines.push(`${label} ${defaultPanelDescs[idx]}`);
  });
  return panelLines;
}

export function buildGridCollagePrompt(
  bible: OriginalGroupBible,
  shots: OriginalShotFields[],
  options?: Grid2x2Options,
): string {
  const hasHuman = bible.identityBible !== '纯商品静物，无人物';
  const role = normalizeOriginalProductRole(bible.productRole, bible.productFingerprint);
  const look = joinLookSummary(bible.lookParts, bible.lookBible, role);
  const rawMasterScene = (bible.masterScene || '').trim() || '充满生活烟火气的真实美学空间，斜射自然日光';
  const cleanMasterScene = sanitizeScenePrompt(rawMasterScene);
  const styleSeg = (bible.styleBible || '').trim() || '手机后置主摄生活抓拍，自然环境光与真实接触阴影，保留皮肤、头发、衣料和商品材质纹理，曝光与白平衡稳定；不过度磨皮、锐化、HDR 或商业棚拍';
  const anatomy = detectJewelryAnatomy(bible.productRole, bible.productFingerprint);
  const anatomyStmt = getJewelryAnatomyStatement(anatomy);
  const openComposition = isOpenCompositionGrid(role, anatomy, bible.productFingerprint);

  const paddedShots = [...shots];
  while (paddedShots.length < 4) {
    paddedShots.push({ shot_no: paddedShots.length + 1, title: `分镜 ${paddedShots.length + 1}`, has_human: hasHuman });
  }

  let macroSlot = 0;
  if (typeof options?.macroSlotIndex === 'number' && options.macroSlotIndex >= 0 && options.macroSlotIndex < 4) {
    macroSlot = options.macroSlotIndex;
  }

  const [descMacro, descPortrait, descSideAngle, descLifestyle] = jewelryDefaultDescs(anatomy);
  const nonMacroPool = [descPortrait, descSideAngle, descLifestyle];
  const defaultPanelDescs: string[] = [];
  let nonMacroIdx = 0;
  for (let i = 0; i < 4; i++) {
    defaultPanelDescs.push(i === macroSlot ? descMacro : nonMacroPool[nonMacroIdx++ % nonMacroPool.length]);
  }

  const panelLines = buildPanelLines(paddedShots, anatomy, macroSlot, defaultPanelDescs, openComposition);

  let subjectHeader: string;
  if (hasHuman && openComposition) {
    const identity = (bible.identityBible || '').trim() || '长相清秀温婉的年轻东亚时尚博主，真实五官比例与自然骨相，原生透气健康冷白肤质，细腻毛孔呼吸感，神态自然松弛';
    const outfit = look.summary || '高级显白质感私服穿搭';
    subjectHeader = `一张 2x2 四宫格无缝拼接买家秀抓拍大图（Full bleed, borderless 2x2 photo collage），展示同一位长相清秀温婉的年轻东亚时尚博主（${identity}）在同一个真实环境【${cleanMasterScene}】中的4个不同抓拍机位。四图紧密无缝相接，绝无白边与分割线。全图4个格子中，人物五官特征、发型、妆容以及服装穿搭（${outfit}）绝对100%完全相同。自然手持或使用 @图片1 所示商品（外观与材质细节100%以 @图片1 为准）。`;
  } else if (hasHuman) {
    let identity = (bible.identityBible || '').trim() || '长相清秀温婉的年轻东亚时尚博主，真实五官比例与自然骨相，原生透气健康冷白肤质，细腻毛孔呼吸感，神态自然松弛';
    if (anatomy === 'hairpin') {
      identity = `${identity}，长发挽成温婉古典低盘发髻（@图片1 发簪长杆穿插固定于发髻内部）`;
    }
    const outfit = look.summary || '高级显白质感私服穿搭';
    subjectHeader = `一张 2x2 四宫格无缝拼接买家秀抓拍大图（Full bleed, borderless 2x2 photo collage），展示同一位长相清秀温婉的年轻东亚时尚博主（${identity}）在同一个真实环境【${cleanMasterScene}】中的4个不同抓拍机位。四图紧密无缝相接，绝无白边与分割线，全员胸部以上中近景与极近距离局部微距特写构图（严禁远景全身）。全图4个格子中，人物五官特征、发型、妆容以及服装穿搭（${outfit}）绝对100%完全相同。${anatomyStmt} @图片1 所示商品（外观与材质细节100%以 @图片1 为准，画面中仅佩戴1件实物）。`;
  } else {
    subjectHeader = `一张 2x2 四宫格无缝拼接商品静物大图（Full bleed, borderless 2x2 photo collage），展示 @图片1 所示商品在同一个【${cleanMasterScene}】中的4个不同陈设与超清特写机位。四图紧密无缝相接，绝无白边与分割线，清晰呈现商品材质与工艺。全图商品外观100%以 @图片1 为准。`;
  }

  const framingConstraint = openComposition
    ? `四格肢体动作与机位绝对互斥，保留各分镜原有动作与机位，不强制微距或半身模板。手部动作均有真实物理依托，手指比例精准自然无畸变。`
    : `四格肢体动作与机位绝对互斥（${PANEL_LABELS[macroSlot]}必为超清微距特写，其余三格为截然不同的胸部以上半身中近景与生活随拍人像）；全员胸部以上中近景与微距构图，严禁远景全身；手部动作均有真实物理依托，手指比例精准自然无畸变。`;

  return [
    subjectHeader,
    `【4格互斥机位与分镜动作】：\n` + panelLines.join('\n'),
    `画面摄影与排版约束：${styleSeg}，纯净真实自然日光与物理接触阴影（Contact Shadows），四格画面光影色温与空间肌理高度统一。四图紧密无缝相接，满铺无白边无分割线（Zero margins, no divider lines）；${framingConstraint}`,
  ].join('\n\n');
}
