import type { OriginalProductRole } from './productRoles';
import { isGenericLook, extractOutfitFromPrompt, resolveDiverseDefaultOutfit } from './outfitSelection';
import { stripGarmentsFromAction } from './actionText';
import { preventJewelryGlitches } from './jewelryGuard';

/**
 * 组内穿搭强一致性强制执行：
 * 保证同一套人物组图中的所有分镜，服饰（款型、材质、配色）完全严格锁定为首镜或规范 lookParts，
 * 绝不允许各分镜自由发挥导致中途换衣服（如分镜1穿条纹针织衫，分镜3突变米色衬衫）。
 */
export function enforceLookConsistency(
  prompt: string,
  canonicalLook?: { top?: string; bottom?: string; shoes?: string; summary?: string } | string | null,
  role: OriginalProductRole = 'worn_accessory',
  productFingerprint?: string
): string {
  if (!prompt) return prompt;
  if (role === 'placed_object') return prompt;

  const lookObj = typeof canonicalLook === 'string' ? { summary: canonicalLook, top: canonicalLook } : canonicalLook;
  let standardTop = (lookObj?.top || lookObj?.summary || '').trim();
  let standardBottom = (lookObj?.bottom || '').trim();

  // 若传入的 canonicalLook 缺失或为泛化占位符，先尝试从 prompt 原文中提取丰富自拟穿搭
  if (!standardTop || isGenericLook(standardTop)) {
    const existing = extractOutfitFromPrompt(prompt);
    if (existing?.top && !isGenericLook(existing.top)) {
      standardTop = existing.top;
      standardBottom = existing.bottom || '高腰直筒深色牛仔裤';
    } else {
      const dynamicOutfit = resolveDiverseDefaultOutfit(productFingerprint, prompt);
      standardTop = dynamicOutfit.top;
      standardBottom = dynamicOutfit.bottom;
    }
  }

  // 构造标准穿搭短句
  const standardLookPhrase = standardBottom
    ? `身穿${standardTop}，搭配${standardBottom}`
    : `身穿${standardTop}`;

  // 拆分分号段落，查找并替换掉描写服装/穿搭的段落
  const segments = prompt.split(/[；;]/).map(s => s.trim()).filter(Boolean);
  let lookReplaced = false;

  const garmentKeywordRe = /(?:身着|身穿|穿着|穿搭|上身搭配|上身穿|下身穿|搭配|上衣|下装|上装|针织衫|背心|衬衫|衬衣|西装|外套|卫衣|毛衣|马甲|海魂衫|开衫|短袖|T恤|牛仔裤|西裤|阔腿裤|百褶裙|半身裙|伞裙|连衣裙|吊带|抹胸|背带裤)/i;

  const updatedSegments = segments.map(seg => {
    // 若包含商品 @图片1 且为 worn_apparel，保留服装槽位声明
    if (/@图片\s*1/.test(seg) && role === 'worn_apparel') {
      return seg;
    }
    // 若包含配饰 @图片1，不作为普通服装段替换
    if (/@图片\s*1/.test(seg) && role === 'worn_accessory') {
      return seg;
    }
    // 若命中服装穿搭段，统一替换为标准穿搭；多余的零碎服装段直接清除，杜绝冲突残留
    if (garmentKeywordRe.test(seg)) {
      if (!lookReplaced) {
        lookReplaced = true;
        return standardLookPhrase;
      }
      // 多余服装段直接剥离
      return '';
    }
    // 即使该段是动作段（如“肢体动作：...”），也必须剥离其中夹带的私货衣服，防止动作段覆盖主穿搭
    if (seg.includes('动作') || seg.includes('姿态') || seg.includes('奔跑') || seg.includes('走廊') || seg.includes('漫步')) {
      return stripGarmentsFromAction(seg);
    }
    return seg;
  }).filter(Boolean);

  // 如果原本没有单独的服装段，且人物出镜，则安全补入
  if (!lookReplaced && standardTop) {
    // 插入在人物主体之后或开头
    const insertIdx = updatedSegments.findIndex(s => s.includes('东亚女性') || s.includes('女生') || s.includes('模特') || s.includes('人物') || s.includes('博主'));
    if (insertIdx >= 0) {
      updatedSegments.splice(insertIdx + 1, 0, standardLookPhrase);
    } else {
      updatedSegments.push(standardLookPhrase);
    }
  }

  return preventJewelryGlitches(updatedSegments.join('；'), productFingerprint);
}

/** 从一组 prompts 中提取首镜权威穿搭 */
export function extractCanonicalOutfitFromPrompts(
  prompts: Array<{ prompt?: string; has_human?: boolean }>,
  productFingerprint?: string
) {
  const firstHuman = prompts.find(p => p.has_human !== false && p.prompt);
  if (firstHuman?.prompt) {
    const extracted = extractOutfitFromPrompt(firstHuman.prompt);
    if (extracted?.top && !isGenericLook(extracted.top)) {
      return {
        top: extracted.top,
        bottom: extracted.bottom || '高腰直筒深色牛仔裤',
        shoes: '黑色复古乐福鞋',
        accessory: '佩戴 @图片1 所示商品'
      };
    }
  }
  return resolveDiverseDefaultOutfit(productFingerprint);
}
