import { appearanceGender, appearanceText } from './appearanceCompatibility';

export const APPEARANCE_AUDIENCES = [
  { id: 'adult_male', label: '成年男' }, { id: 'adult_female', label: '成年女' },
  { id: 'senior_male', label: '老年男' }, { id: 'senior_female', label: '老年女' },
  { id: 'child_male', label: '男童' }, { id: 'child_female', label: '女童' },
  { id: 'adult_unisex', label: '成年通用' }, { id: 'senior_unisex', label: '老年通用' },
  { id: 'child_unisex', label: '儿童通用' }, { id: 'unknown', label: '待分类' },
] as const;
export type AppearanceAudience = typeof APPEARANCE_AUDIENCES[number]['id'];
type Asset = Record<string, unknown>;
export function audienceOptions(outfit: boolean) {
  return APPEARANCE_AUDIENCES.filter(option => outfit || !option.id.endsWith('_unisex'));
}
export function audienceDimensions(value: unknown): Asset {
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...value as Asset };
  try { const parsed = JSON.parse(String(value || '{}')); return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; }
  catch { return {}; }
}
export function setAudienceDimensions(value: unknown, audience: AppearanceAudience): string {
  return JSON.stringify({ ...audienceDimensions(value), audience, audienceSource: 'manual' });
}
function ageGroup(text: string): string | null {
  const ages = [...text.matchAll(/(\d{1,3})\s*(?:岁|years?\s*old|year-old)/gi)].map(match => Number(match[1]));
  const groups = new Set(ages.map(age => age < 18 ? 'child' : age >= 60 ? 'senior' : 'adult'));
  if (/儿童|童装|男童|女童|男孩|女孩|小孩|幼儿|少年|少女|\b(?:child|children|kid|kids|boy|girl|toddler)\b/i.test(text)) groups.add('child');
  if (/老年|老人|老男|老女|爷爷|奶奶|银发族|\b(?:senior|elderly)\b/i.test(text)) groups.add('senior');
  if (/成年|成人|青年|中年|\badult\b/i.test(text)) groups.add('adult');
  if (!groups.size && /男士|女士|男装|女装|\b(?:menswear|womenswear)\b/i.test(text)) groups.add('adult');
  return groups.size === 1 ? [...groups][0] : null;
}
/** Explicit metadata is editable; ambiguous historical descriptions remain unclassified. */
export function appearanceAudience(asset: Asset, outfit = false): AppearanceAudience {
  const explicit = audienceDimensions(asset.dimensions).audience;
  if (typeof explicit === 'string') return audienceOptions(outfit).some(option => option.id === explicit) ? explicit as AppearanceAudience : 'unknown';
  if (typeof asset.appearanceAudience === 'string' && audienceOptions(outfit).some(option => option.id === asset.appearanceAudience)) return asset.appearanceAudience as AppearanceAudience;
  const text = appearanceText(asset);
  const gender = appearanceGender(text, outfit);
  const age = ageGroup(text);
  const candidate = `${age}_${gender}`;
  return audienceOptions(outfit).some(option => option.id === candidate) ? candidate as AppearanceAudience : 'unknown';
}
export function audienceLabel(asset: Asset, outfit = false) {
  return APPEARANCE_AUDIENCES.find(option => option.id === appearanceAudience(asset, outfit))!.label;
}
export function audiencesCompatible(persona: Asset, outfit: Asset): boolean {
  const person = appearanceAudience(persona);
  const clothes = appearanceAudience(outfit, true);
  if (person === 'unknown' || clothes === 'unknown') return false;
  const [age, gender] = person.split('_');
  const [clothesAge, clothesGender] = clothes.split('_');
  if (age !== clothesAge || (gender === 'male' && clothesGender !== 'male' && clothesGender !== 'unisex')) return false;
  // Incorrect manual labels must not override an explicitly conflicting garment description.
  const personAge = ageGroup(appearanceText({ ...persona, dimensions: undefined }));
  const clothingAge = ageGroup(appearanceText({ ...outfit, dimensions: undefined }));
  if ((personAge && personAge !== age) || (clothingAge && clothingAge !== age)) return false;
  const observed = appearanceGender(appearanceText(outfit), true);
  if (gender === 'male' && observed === 'female') return false;
  const personObserved = appearanceGender(appearanceText(persona));
  return personObserved === 'unknown' || personObserved === gender;
}

export function mergeAudienceDimensions(existing: unknown, incoming: unknown): string {
  const old = audienceDimensions(existing);
  const next = { ...old, ...audienceDimensions(incoming) };
  if (old.audienceSource === 'manual') { next.audience = old.audience; next.audienceSource = 'manual'; }
  return JSON.stringify(next);
}
