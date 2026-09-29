import { inferProductCategoryAndAnatomy } from '../../products/productCategory/infer';
import { isPhoneProduct } from '../../products/phoneProductPolicy';
import { parseGroupShotSkeleton, sourcePromptSection } from './storyboardSlots';

type ProductCategory = ReturnType<typeof inferProductCategoryAndAnatomy>['primaryCategory'];
type DigitalKind = 'phone' | 'case' | 'earphone' | 'tablet';

interface GroupCategoryEvidence {
  title?: string | null;
  albumName?: string | null;
  contentSummary?: string | null;
  category?: string | null;
  productCategoryIds?: string | null;
  shotPromptsJson?: string | null;
  isUniversal?: boolean;
}

function categoryIds(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

function normalizedCategory(value: string): ProductCategory | null {
  const id = value.toLowerCase().trim();
  if (id === 'digital_3c' || id === 'digital' || id === 'phone' || id === '手机数码') return 'digital';
  if (id === 'universal' || id === 'all') return 'all';
  return ['jewelry', 'apparel', 'bag', 'shoes', 'beauty', 'eyewear', 'hat_accessory'].includes(id)
    ? id as ProductCategory : null;
}

function digitalEvidence(text: string): string {
  return text.replace(/(?:无|没有|不含|不要|不带|禁止|去掉|去除|未搭配)\s*(?:手机壳|保护壳|保护套|手机套|镜头膜|钢化膜|屏幕膜|贴膜|耳机|耳塞|耳麦|平板)/g, '')
    .replace(/(?:使用|用|以|通过)?手机(?:拍摄|摄影|原相机|直出|记录)/g, '')
    .replace(/shot\s+on\s+iphone(?:\s+\d+\s*(?:pro|max|plus)?)?/gi, '');
}

function digitalKind(text: string): DigitalKind | null {
  const subject = digitalEvidence(text);
  if (/手机壳|保护壳|保护套|手机套|镜头膜|钢化膜|屏幕膜|phone\s*case/i.test(subject)) return 'case';
  if (/耳机|耳麦|耳塞|蓝牙耳塞|airpods|earbuds|headphones/i.test(subject)) return 'earphone';
  if (/平板|ipad|tablet/i.test(subject)) return 'tablet';
  if (isPhoneProduct(subject) || /手机本体|手机裸机|直板手机|折叠屏手机|手机正反面|实机(?:展示|开箱|外观)/.test(subject)) return 'phone';
  return null;
}

function shotSubjectText(prompt: string): string {
  const observed = ['主体', '穿搭或物体细节', '物体细节', '动作或摆放']
    .map((heading) => sourcePromptSection(prompt, heading)).filter(Boolean);
  return observed.length ? observed.join('；') : prompt.split(/【画质与限制】|【负面约束】/)[0].slice(0, 220);
}

function kindFromShots(group: GroupCategoryEvidence): DigitalKind | null {
  const shots = parseGroupShotSkeleton(group.shotPromptsJson);
  if (shots.length === 0) return null;
  const observed = shots.map((shot) => digitalEvidence(`${shot.title || ''} ${shotSubjectText(shot.prompt || '')}`));
  const count = (pattern: RegExp) => observed.filter((text) => pattern.test(text)).length;
  if (count(/手机壳|保护壳|保护套|手机套|贴膜|镜头膜|钢化膜|屏幕膜/) >= 2) return 'case';
  if (count(/耳机|耳麦|耳塞|充电盒/) >= 2) return 'earphone';
  if (count(/平板|ipad|tablet/i) >= 2) return 'tablet';
  if (count(/手机(?=.{0,8}(?:正面|背面|屏幕|机身|摄像头|镜头模组|中框|边框|外观))|手机本体|手机裸机|机身(?:正面|背面)|后置摄像头|前摄开孔|屏幕边框/) >= 2) return 'phone';
  const subjectVotes = shots.filter((shot) => {
    const subject = sourcePromptSection(shot.prompt || '', '主体');
    return subject && digitalKind(subject) === 'phone';
  }).length;
  if (subjectVotes >= 2) return 'phone';
  return null;
}

function groupDigitalKind(group: GroupCategoryEvidence): DigitalKind | null {
  // The asset title and album describe the sold subject. A phone mentioned as
  // an earphone or case prop must not turn that asset into a phone mother.
  for (const text of [group.title]) {
    const kind = digitalKind(String(text || ''));
    if (kind) return kind;
  }
  const shots = kindFromShots(group);
  if (shots) return shots;
  for (const text of [group.albumName, group.contentSummary]) {
    const kind = digitalKind(String(text || ''));
    if (kind) return kind;
  }
  return null;
}

function inferredCategory(group: GroupCategoryEvidence, kind: DigitalKind | null): ProductCategory {
  for (const text of [group.title, group.albumName, group.contentSummary]) {
    const inferred = inferProductCategoryAndAnatomy(text).primaryCategory;
    if (inferred !== 'all') return inferred;
  }
  if (kind) return 'digital';
  return normalizedCategory(group.category || '') || 'all';
}

/** Explicit category IDs and old unlabeled assets use the same category family. */
export function promptGroupCategoryFit(
  group: GroupCategoryEvidence,
  productTitle: string,
  productProps: Record<string, unknown> | null | undefined,
): number {
  const productCategory = inferProductCategoryAndAnatomy(productTitle, productProps).primaryCategory;
  const categories = categoryIds(group.productCategoryIds).map(normalizedCategory);
  const kind = groupDigitalKind(group);
  const inferred = inferredCategory(group, kind);
  const targetKind = isPhoneProduct(productTitle) ? 'phone' : digitalKind(productTitle)
    || digitalKind(String(productProps?.['商品类目'] || productProps?.['品类'] || productProps?.['category'] || ''));
  if (productCategory === 'digital') {
    const titledCategory = inferProductCategoryAndAnatomy(group.title).primaryCategory;
    if (titledCategory !== 'all' && titledCategory !== 'digital') return 0;
    if (targetKind && kind && targetKind !== kind) return 0;
    if (targetKind && kind === targetKind) return categories.includes('digital') ? 100 : 80;
    // A generic 3C label alone is not proof that an unknown asset is a phone.
    if (targetKind) return group.isUniversal || categories.includes('all') ? 40 : 0;
    return group.isUniversal || categories.includes('all') ? 40 : 0;
  }
  if (productCategory !== 'all' && categories.includes(productCategory)) return 100;
  if (productCategory !== 'all' && inferred === productCategory) return 80;
  if (group.isUniversal || categories.includes('all')) return 40;
  return productCategory !== 'all' && inferred === 'all' && categories.length === 0 ? 20 : 0;
}
