import type { PerImageResult } from './prompts';

/** Never turn an absent/uncertain visual observation into a reusable identity. */
const unknownDetail = /无法确认|无法辨认|无法判断|信息不足|不可见|未入(?:画|镜)|未见|看不清|不适用|无人物|无服装|未知/;
const garment = /衬衫|T恤|恤衫|上衣|卫衣|毛衣|针织衫|外套|开衫|夹克|西装|大衣|风衣|背心|吊带|连衣裙|半身裙|长裙|短裙|长裤|短裤|牛仔裤|套装|旗袍|礼服/;
const fragmentOnly = /局部|仅见|只见|只露|仅露|袖口|衣角|领口|衣袖/;

export function isObservedDetail(value: unknown): boolean {
  const text = typeof value === 'string' ? value.trim() : '';
  return Boolean(text && !unknownDetail.test(text) && !/^(?:无|没有|不明|不详|none|null|unknown)$/i.test(text));
}

export function hasReusableOutfitText(outfit: { title?: unknown; top?: unknown; bottom?: unknown }): boolean {
  return [outfit.top, outfit.bottom].some((value) =>
    isObservedDetail(value) && garment.test(String(value)) && !fragmentOnly.test(String(value).trim()),
  );
}

export function canExtractOutfit(image: PerImageResult): boolean {
  if (image.has_human !== true || !image.outfit) return false;
  if (image.outfit_visibility && !['upper_body', 'full_body'].includes(image.outfit_visibility)) return false;
  return hasReusableOutfitText(image.outfit);
}

export function canExtractPersona(image: PerImageResult): boolean {
  if (image.has_human !== true || !image.persona) return false;
  if (image.persona_visibility && image.persona_visibility !== 'identifiable') return false;
  // Hands, skin tone, vibe or hair alone cannot establish a person's identity.
  return isObservedDetail(image.persona.face) && isObservedDetail(image.persona.hair);
}

/** Historical rows are not re-analysed from pixels here. Only explicit bad text is rejected. */
export function visualAssetIssue(asset: Record<string, unknown>, type: string): string | null {
  if (type !== 'persona' && type !== 'outfit') return null;
  const title = String(asset.title || asset.name || '').trim();
  if (type === 'outfit') {
    if (fragmentOnly.test(title) && !/套装|连衣裙/.test(title)) {
      return '仅有衣物局部，不能作为可复用穿搭；请重新拆解或修正分类';
    }
    if ((asset.top || asset.bottom) && !hasReusableOutfitText(asset)) {
      return '未识别到清晰的服装款式，请核对原图后修正';
    }
  }
  if (type === 'persona' && /无人物|无人像|仅.*(?:手部|手指|手臂)|不露脸/.test(title)) {
    return '没有可辨识的人物面部，不能作为人物资产';
  }
  return null;
}
