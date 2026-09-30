import { inferProductCategoryAndAnatomy } from '../../products/productCategory/infer';
import { isPhoneProduct } from '../../products/phoneProductPolicy';
import { builtinSubcategoryFolderId, isPromptGroupSubcategory, isPromptGroupSubcategoryFolderId, PROMPT_GROUP_SUBCATEGORIES, PROMPT_GROUP_SUBCATEGORY_LABELS, type PromptGroupSubcategory } from '../../assets/promptGroupSubcategory';
import { detectJewelryAnatomy } from '../../prompts/prompt-engine/roles';
import { parseGroupShotSkeleton, sourcePromptSection } from './storyboardSlots';
import type { AssetProductCategory } from '../../assets/assetOrganization';
import { matchPromptFolderRules } from '../../assets/promptFolderRuleMatch';

type ProductCategory = ReturnType<typeof inferProductCategoryAndAnatomy>['primaryCategory'];
export { PROMPT_GROUP_SUBCATEGORY_LABELS };
export type PromptGroupProductSubcategory = PromptGroupSubcategory;
type DigitalKind = PromptGroupProductSubcategory;

interface GroupCategoryEvidence {
  title?: string | null;
  albumName?: string | null;
  contentSummary?: string | null;
  category?: string | null;
  productCategoryIds?: string | null;
  productCategoryNames?: string[] | null;
  productSubcategory?: string | null;
  productSubcategoryName?: string | null;
  productCategoryRules?: AssetProductCategory[];
  shotPromptsJson?: string | null;
  isUniversal?: boolean;
}

function explicitSubcategory(value: unknown): DigitalKind | null {
  if (isPromptGroupSubcategory(value)) return value;
  return PROMPT_GROUP_SUBCATEGORIES.find(kind => value === builtinSubcategoryFolderId(kind)) || null;
}

function categoryIds(value: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch { return []; }
}

function normalizedCategory(value: string): ProductCategory | null {
  const id = value.toLowerCase().trim();
  if (id === 'digital_3c' || id === 'digital' || id === 'phone' || /手机|数码/.test(id)) return 'digital';
  if (/珠宝|首饰/.test(id)) return 'jewelry';
  if (/服饰|服装|穿搭/.test(id)) return 'apparel';
  if (/箱包|手袋/.test(id)) return 'bag';
  if (/鞋靴|鞋类/.test(id)) return 'shoes';
  if (/美妆|香氛|护肤/.test(id)) return 'beauty';
  if (/眼镜|镜框/.test(id)) return 'eyewear';
  if (/帽子|头饰/.test(id)) return 'hat_accessory';
  if (id === 'universal' || id === 'all') return 'all';
  return ['jewelry', 'apparel', 'bag', 'shoes', 'beauty', 'eyewear', 'hat_accessory'].includes(id)
    ? id as ProductCategory : null;
}

function reviewedGroupCategories(group: GroupCategoryEvidence): ProductCategory[] {
  return [...categoryIds(group.productCategoryIds), ...(group.productCategoryNames || [])]
    .map(normalizedCategory).filter((category): category is ProductCategory => !!category);
}

/** Architecture previews only include reviewed mothers from the matching major category. */
export function promptGroupMatchesMajorCategory(
  group: GroupCategoryEvidence,
  target: Exclude<ProductCategory, 'all'>,
): boolean {
  const assigned = reviewedGroupCategories(group).filter(category => category !== 'all');
  if (assigned.length) return assigned.includes(target);
  if (explicitSubcategory(group.productSubcategory)) return target === 'digital';
  if (!group.isUniversal) return false;
  const inferred = inferredCategory(group, groupDigitalKind(group));
  return inferred === 'all' || inferred === target;
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

function subjectEvidence(group: GroupCategoryEvidence): {
  titleKind: DigitalKind | null;
  shotKind: DigitalKind | null;
  conflict: boolean;
} {
  const titleKind = digitalKind(String(group.title || ''));
  const shotKind = kindFromShots(group);
  return { titleKind, shotKind, conflict: Boolean(titleKind && shotKind && titleKind !== shotKind) };
}

function caseFocusedPhoneVisual(evidence: ReturnType<typeof subjectEvidence>): boolean {
  return evidence.shotKind === 'case' && evidence.titleKind !== 'phone';
}

function folderDigitalKind(group: GroupCategoryEvidence): DigitalKind | null {
  const selected = explicitSubcategory(group.productSubcategory);
  if (selected) return selected;
  if (!isPromptGroupSubcategoryFolderId(group.productSubcategory)) return null;
  if (!String(group.productSubcategory).startsWith('prompt_subcategory:digital_3c:')
    && !reviewedGroupCategories(group).includes('digital')) return null;
  const name = String(group.productSubcategoryName || '').trim();
  if (/手机壳|保护壳|保护套|手机套|贴膜|钢化膜|屏幕膜|镜头膜|phone\s*case/i.test(name)) return 'case';
  if (/耳机|耳麦|耳塞|airpods|earbuds|headphones/i.test(name)) return 'earphone';
  if (/平板|ipad|tablet/i.test(name)) return 'tablet';
  if (/^(?:手机|手机本体|手机裸机|手机整机|智能手机|折叠屏手机|直板手机|phone|smartphone)$/i.test(name)) return 'phone';
  return null;
}

/** A folder assignment cannot override a clearly different sold subject in the mother itself. */
export function promptGroupDeclaredSubcategoryConflict(group: GroupCategoryEvidence): string | null {
  const evidence = subjectEvidence(group);
  const declared = folderDigitalKind(group);
  // A handset mother can visibly include a protective case. The reviewed
  // phone folder is authoritative for that shared visual subject; a case
  // mention alone must not quarantine the whole four-shot mother.
  if (declared === 'phone' && [evidence.titleKind, evidence.shotKind]
    .every(kind => kind === null || kind === 'phone' || kind === 'case')) return null;
  if (evidence.conflict) return '母组标题与分镜描述的商品细分不一致，请在资产库复核';
  if (!declared) return null;
  const observed = evidence.titleKind || evidence.shotKind;
  if (!observed || observed === declared) return null;
  const folderLabel = group.productSubcategoryName?.trim() || PROMPT_GROUP_SUBCATEGORY_LABELS[declared];
  return `母组归入「${folderLabel}」，但内容显示为「${PROMPT_GROUP_SUBCATEGORY_LABELS[observed]}」，请在资产库复核`;
}

/** Classify a newly analyzed group only when its own title or repeated shots identify the sold subject. */
export function inferPromptGroupSubcategory(group: GroupCategoryEvidence): PromptGroupProductSubcategory | null {
  const { titleKind, shotKind, conflict } = subjectEvidence(group);
  if (conflict) return null;
  return titleKind || shotKind;
}

function groupDigitalKind(group: GroupCategoryEvidence, evidence = subjectEvidence(group)): DigitalKind | null {
  const selected = folderDigitalKind(group);
  if (selected) return selected;
  if (evidence.conflict) return null;
  // The asset title and album describe the sold subject. A phone mentioned as
  // an earphone or case prop must not turn that asset into a phone mother.
  if (evidence.titleKind) return evidence.titleKind;
  if (evidence.shotKind) return evidence.shotKind;
  for (const text of [group.albumName, group.contentSummary]) {
    const kind = digitalKind(String(text || ''));
    if (kind) return kind;
  }
  return null;
}

function productDigitalKind(title: string, props: Record<string, unknown> | null | undefined): DigitalKind | null {
  if (isPhoneProduct(title)) return 'phone';
  return digitalKind(title)
    || digitalKind(String(props?.['商品类目'] || props?.['品类'] || props?.['category'] || ''));
}

const MAJOR_CATEGORY_LABELS: Partial<Record<ProductCategory, string>> = {
  jewelry: '珠宝首饰', digital: '手机数码', apparel: '服饰穿搭', bag: '箱包手袋',
  shoes: '鞋靴配饰', beauty: '美妆香氛', eyewear: '眼镜配饰', hat_accessory: '帽子配饰',
};

function folderRuleFit(group: GroupCategoryEvidence, title: string, props?: Record<string, unknown> | null): { score: number; conflict: string | null } | null {
  const categories = group.productCategoryRules;
  if (!categories?.length || group.isUniversal) return null;
  const matched = matchPromptFolderRules(categories, title, props);
  if (!matched) return null;
  const assigned = categoryIds(group.productCategoryIds).map(id => categories.find(row => row.id === id))
    .filter((row): row is AssetProductCategory => !!row && !row.isArchived);
  if (!assigned.length) return null;
  if (!assigned.some(row => (row.parentId || row.id) === matched.major.id)) {
    return { score: 0, conflict: `商品规则匹配「${matched.major.name}」，母组归属其他商品大类` };
  }
  const childId = isPromptGroupSubcategory(group.productSubcategory) ? builtinSubcategoryFolderId(group.productSubcategory) : group.productSubcategory;
  if (matched.folder.parentId && childId && childId !== matched.folder.id) {
    return { score: 0, conflict: `商品规则匹配「${matched.folder.name}」，母组细分为「${group.productSubcategoryName || childId}」` };
  }
  // A major-only rule is not evidence that an arbitrary child folder fits.
  if (!matched.folder.parentId && childId) return null;
  return { score: matched.folder.parentId ? 120 : 100, conflict: null };
}

/** A manually locked mother must respect its reviewed major category. Unknown custom IDs stay available. */
export function promptGroupExplicitMajorCategoryConflict(
  group: GroupCategoryEvidence,
  productTitle: string,
  productProps: Record<string, unknown> | null | undefined,
): string | null {
  if (group.isUniversal) return null;
  const configured = folderRuleFit(group, productTitle, productProps);
  if (configured) return configured.conflict;
  const target = inferProductCategoryAndAnatomy(productTitle, productProps).primaryCategory;
  if (target === 'all') return null;
  const assigned = reviewedGroupCategories(group).filter(category => category !== 'all');
  if (!assigned.length || assigned.includes(target)) return null;
  return `商品为${MAJOR_CATEGORY_LABELS[target] || target}，已固定母组归入${assigned.map(category => MAJOR_CATEGORY_LABELS[category] || category).join('、')}`;
}

/** A reviewed child folder must match the sold product, not merely its major category. */
export function promptGroupExplicitSubcategoryConflict(
  group: GroupCategoryEvidence,
  productTitle: string,
  productProps: Record<string, unknown> | null | undefined,
): string | null {
  const declarationConflict = promptGroupDeclaredSubcategoryConflict(group);
  if (declarationConflict) return declarationConflict;
  const configured = folderRuleFit(group, productTitle, productProps);
  if (configured) return configured.conflict;
  const selected = explicitSubcategory(group.productSubcategory);
  const target = productDigitalKind(productTitle, productProps);
  if (selected) {
    if (target === selected) return null;
    if (selected === 'phone' && target === 'case' && caseFocusedPhoneVisual(subjectEvidence(group))) return null;
    return target
      ? `商品为${PROMPT_GROUP_SUBCATEGORY_LABELS[target]}，母组细分为${PROMPT_GROUP_SUBCATEGORY_LABELS[selected]}`
      : `无法确认商品属于${PROMPT_GROUP_SUBCATEGORY_LABELS[selected]}，请核对商品信息与母组细分`;
  }
  if (!isPromptGroupSubcategoryFolderId(group.productSubcategory)) return null;
  const label = group.productSubcategoryName?.trim();
  if (!label) return '母组细分文件夹缺少有效名称，请刷新资产或核对分类';
  const folderKind = folderDigitalKind(group);
  if (folderKind) {
    if (folderKind === 'phone' && target === 'case' && caseFocusedPhoneVisual(subjectEvidence(group))) return null;
    return target === folderKind ? null : target
      ? `商品为${PROMPT_GROUP_SUBCATEGORY_LABELS[target]}，母组细分为${label}`
      : `无法确认商品属于「${label}」，请核对商品信息与母组细分`;
  }
  if (target && reviewedGroupCategories(group).includes('digital')) {
    return `商品主体为${PROMPT_GROUP_SUBCATEGORY_LABELS[target]}，母组细分为「${label}」，请核对后再使用`;
  }
  const product = inferProductCategoryAndAnatomy(productTitle, productProps);
  if (product.primaryCategory === 'jewelry') {
    const childAnatomy = detectJewelryAnatomy(label);
    if (childAnatomy !== 'general_acc') {
      return childAnatomy === product.targetAnatomy ? null : `商品与母组细分「${label}」不匹配`;
    }
  }
  const categoryFields = ['商品类目', '品类', 'category', '分类'];
  const productText = [productTitle, ...categoryFields.map(key => String(productProps?.[key] || ''))]
    .join(' ').toLocaleLowerCase();
  return productText.includes(label.toLocaleLowerCase()) ? null : `商品与母组细分「${label}」不匹配`;
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
  const configured = folderRuleFit(group, productTitle, productProps);
  if (configured) return promptGroupDeclaredSubcategoryConflict(group) ? 0 : configured.score;
  const productCategory = inferProductCategoryAndAnatomy(productTitle, productProps).primaryCategory;
  const categories = reviewedGroupCategories(group);
  const reviewedCategories = categories.filter((category): category is ProductCategory => !!category && category !== 'all');
  if (!group.isUniversal && productCategory !== 'all' && reviewedCategories.length > 0
    && !reviewedCategories.includes(productCategory)) return 0;
  if (promptGroupExplicitSubcategoryConflict(group, productTitle, productProps)) return 0;
  if (productCategory === 'all' && reviewedCategories.includes('digital')
    && isPromptGroupSubcategoryFolderId(group.productSubcategory)) return 100;
  const selected = explicitSubcategory(group.productSubcategory);
  const evidence = subjectEvidence(group);
  const declaredKind = folderDigitalKind(group);
  if (!declaredKind && evidence.conflict) return 0;
  const kind = groupDigitalKind(group, evidence);
  const inferred = inferredCategory(group, kind);
  const targetKind = productDigitalKind(productTitle, productProps);
  if (productCategory === 'digital') {
    const titledCategory = inferProductCategoryAndAnatomy(group.title).primaryCategory;
    if (titledCategory !== 'all' && titledCategory !== 'digital') return 0;
    if (declaredKind === 'phone' && targetKind === 'case' && caseFocusedPhoneVisual(evidence)) return 110;
    if (targetKind && kind && targetKind !== kind) return 0;
    if (selected && targetKind === selected) return 120;
    if (isPromptGroupSubcategoryFolderId(group.productSubcategory) && !folderDigitalKind(group)
      && reviewedCategories.includes('digital')) return 110;
    if (targetKind && kind === targetKind) return categories.includes('digital') ? 100 : 80;
    // A generic 3C label alone is not proof that an unknown asset is a phone.
    if (targetKind) return group.isUniversal || categories.includes('all') ? 40 : 0;
    return group.isUniversal || categories.includes('all') ? 40 : 0;
  }
  if (selected) return 0;
  if (productCategory !== 'all' && inferred !== 'all' && inferred !== productCategory) return 0;
  if (productCategory !== 'all' && categories.includes(productCategory)) return 100;
  if (productCategory !== 'all' && inferred === productCategory) return 80;
  if (group.isUniversal || categories.includes('all')) return 40;
  return productCategory !== 'all' && inferred === 'all' && categories.length === 0 ? 20 : 0;
}
