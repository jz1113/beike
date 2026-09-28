/** Conservative text classification: ambiguous or unlabelled assets never auto-match. */
export type AppearanceGender = 'male' | 'female' | 'unisex' | 'unknown';
export function appearanceGender(value: string, outfit = false): AppearanceGender {
  const text = value.toLowerCase().replace(/(?:禁止|不要|不得|不能|不穿|非)(?:[^，。；;\n]{0,24})/g, '');
  const male = /男性|男士|男生|男人|男孩|男童|老男|爷爷|男模|男装|男款|\b(?:male|man|men|boy|menswear)\b/.test(text);
  const female = /女性|女士|女生|女人|女孩|女童|老女|奶奶|女模|女装|女款|\b(?:female|woman|women|girl|womenswear)\b/.test(text);
  const dress = outfit && /连衣裙|半身裙|百褶裙|短裙|长裙|旗袍|吊带裙|\b(?:dress|skirt|gown)\b/.test(text);
  if (outfit && /男女通用|男女皆可|中性款|无性别|\bunisex\b/.test(text) && !dress && !male && !female) return 'unisex';
  if (outfit && (female || dress)) return 'female';
  if (male && (female || dress)) return 'unknown';
  if (male) return 'male';
  if (female || dress) return 'female';
  return 'unknown';
}
export function appearanceCompatible(persona: string, outfit: string): boolean {
  const person = appearanceGender(persona);
  const clothing = appearanceGender(outfit, true);
  return person !== 'unknown' && (clothing === 'unisex' || person === clothing || (person === 'female' && clothing === 'male'));
}
export function appearanceText(asset: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'reversePrompt', 'top', 'bottom', 'tags', 'dimensions']
    .map(key => typeof asset[key] === 'string' ? asset[key] : '').filter(Boolean).join('；');
}
