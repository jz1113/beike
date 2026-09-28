import { type OriginalProductRole, normalizeOriginalProductRole, detectJewelryAnatomy, scrubOriginalPromptProductConflicts } from './roles';
import { appendFidelityGuidance } from './fidelity';

/**
 * 确保原创提示词具备标准的槽位声明与防冲突过滤
 */
export function ensureOriginalPromptSlots(
  prompt: string,
  options?: {
    hasHuman?: boolean;
    hasFace?: boolean;
    hasSceneAnchor?: boolean;
    masterScene?: string;
    identityBible?: string;
    lookBible?: string;
    productRole?: OriginalProductRole;
    productFingerprint?: string;
    hasSupplementaryProductViews?: boolean;
  }
): string {
  if (!prompt) return prompt;

  let text = prompt
    .replace(/【(?:画面|图中|展示|参考|背景|镜头|场景|人物|模特|发型)[^】]*】/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const hasHuman = options?.hasHuman !== false;
  const hasFace = Boolean(options?.hasFace);
  const role = normalizeOriginalProductRole(options?.productRole, options?.productFingerprint);

  const anatomy = detectJewelryAnatomy(options?.productRole, options?.productFingerprint);
  const isMacroShot = /微距|局部特写|细节特写|近景特写|首饰微距特写|特写近景|放大细节/i.test(text);
  const hasProductContext = Boolean(options?.productRole || options?.productFingerprint);
  if (!/@图片\s*1/.test(text) && hasProductContext) {
    if (role === 'worn_apparel') {
      text = `穿着 @图片1 所示服装，外观100%以 @图片1 为准；${text}`;
    } else if (role === 'worn_accessory') {
      const macroFocus = isMacroShot ? '，100mm f/2.8 极近微距浅景深精准对焦锁定 @图片1 细节，商品占据画面 60%~75% 核心视觉焦点，呈现金属反光与微观做工' : '，佩戴部位显著前置于离镜头最近的第一超清焦平面，呈现材质工艺细节，绝无脱焦虚化';
      const purityRule = anatomy === 'bracelet'
        ? '，脖颈光洁无项链'
        : anatomy === 'necklace'
        ? '，手腕光洁无手镯'
        : anatomy === 'earring'
        ? '，脖颈与手腕光洁'
        : '，严禁多余首饰';
      text = `佩戴 @图片1 所示首饰，外观与材质细节100%以 @图片1 为准${macroFocus}${purityRule}；${text}`;
    } else {
      text = `画面主体为 @图片1 所示商品实物，外观100%以 @图片1 为准；${text}`;
    }
  } else if (role === 'worn_accessory' && hasProductContext) {
    if (isMacroShot && !text.includes('超清微距对焦') && !/2x2|四宫格/.test(text)) {
      text = text.replace(/(@图片\s*1[^；;]*)/, '$1，超清微距对焦锁定首饰细节与锐利边缘');
    }
  }

  // 确保 @图片2 正脸槽位对齐（仅在有正脸定桩时）
  if (hasHuman && hasFace && !/@图片\s*2/.test(text)) {
    if (isMacroShot) {
      text = `${text}；人物五官特征以 @图片2 为准（若背景露脸）`;
    } else {
      text = `人物五官 ID 以 @图片2 为准；${text}`;
    }
  }

  // 确保场景定桩槽位
  if (options?.hasSceneAnchor) {
    const sceneSlot = hasFace ? '@图片3' : '@图片2';
    if (!new RegExp(sceneSlot.replace('@', '@\\s*')).test(text)) {
      text = `${text}；场景空间以 ${sceneSlot} 定桩`;
    }
  }

  // 冲突清洗与多余分号规范化（动作段含商品名时不得整段替换）
  const actionHolders: string[] = [];
  text = text.replace(/动作姿态：[^；;]*/g, (m) => {
    actionHolders.push(m);
    return `__KEEP_ACTION_${actionHolders.length - 1}__`;
  });
  text = scrubOriginalPromptProductConflicts(text, role);
  text = text.replace(/__KEEP_ACTION_(\d+)__/g, (_, i) => actionHolders[Number(i)]);

  text = text
    .replace(/；+/g, '；')
    .replace(/^；+|；+$/g, '')
    .trim();
  return appendFidelityGuidance(text, {
    productRole: role,
    productFingerprint: options?.productFingerprint,
    hasHuman,
    hasSupplementaryProductViews: options?.hasSupplementaryProductViews,
  });
}
