/** Resolve only explicit asset evidence; ambiguous legacy assets remain model-analyzed. */
export function resolveAssetShotSubject(asset: {
  has_human?: boolean; hasHuman?: boolean; shotType?: string; shot_type?: string;
  title?: string; action?: string; reversePrompt?: string | null;
}): { has_human: boolean; shot_type: string } | undefined {
  const type = asset.shotType || asset.shot_type;
  if (type === 'hand_held_only') return { has_human: false, shot_type: type };
  if (type === 'pure_product') return { has_human: false, shot_type: type };
  const explicit = asset.has_human ?? asset.hasHuman;
  if (typeof explicit === 'boolean') return { has_human: explicit, shot_type: explicit ? 'model_shot' : 'pure_product' };
  // Use the action field rather than a full prompt whose negative section may mention people.
  const text = [asset.title, asset.action].filter(Boolean).join('，');
  if (/仅手部|只露手|只有手|手部特写|双手.*(?:局部|细节)|(?:局部|细节).*双手/.test(text)) {
    return { has_human: false, shot_type: 'hand_held_only' };
  }
  if (/无人物|无人出镜|无模特|纯静物|纯商品|静物摆拍|静物陈列/.test(text)) {
    return { has_human: false, shot_type: 'pure_product' };
  }
  return undefined;
}
