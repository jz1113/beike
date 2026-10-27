import { isJewelryProductTitle } from './jewelryArch';
import { isPhoneProduct } from './phoneProductPolicy';

export type ProductRecipeKind = 'phone' | 'jewelry' | 'other';

export interface ProductForRecipe {
  title?: string | null;
  category?: string | null;
  props?: Record<string, string> | null;
}

export interface RecipeForProduct {
  id: string;
  name?: string;
  category?: string;
  promptSnippet?: string;
}

type RecipeKind = ProductRecipeKind | 'conflict';

export function productRecipeKind(product: ProductForRecipe): ProductRecipeKind {
  const title = product.title || '';
  if (isPhoneProduct(title) || /手机壳|保护壳|保护套|手机膜|钢化膜|镜头膜|手机支架|手机挂绳|手机挂饰|耳机|耳麦|蓝牙音箱|智能手表|手环|平板|充电器|充电头|充电宝|移动电源|数据线|充电线|无线充|路由器|随身\s*wi-?fi|网络设备|phone\s*case|earbuds?|headphones?|smartwatch|tablet|ipad|power\s*bank|charger|router/i.test(title)) return 'phone';
  if (isJewelryProductTitle(title)) return 'jewelry';
  if (/手机|数码|3c|智能设备|digital/i.test(product.category || '')) return 'phone';
  if (/珠宝|首饰|jewelry/i.test(product.category || '')) return 'jewelry';
  if (isJewelryProductTitle('', product.props)) return 'jewelry';
  return 'other';
}

/** The prompt body outranks a renamed card: a phone title with jewelry rules is unsafe. */
export function recipeKind(recipe: RecipeForProduct): RecipeKind {
  const label = `${recipe.id} ${recipe.name || ''} ${recipe.category || ''}`;
  const body = recipe.promptSnippet || '';
  const labelPhone = /手机通讯|智能手机|smartphone|digital_3c/i.test(label);
  const labelJewelry = /珠宝|首饰|jewelry/i.test(label);
  const bodyPhone = /手机通讯全品类|手机通讯类商品|机身轮廓|镜头模组.*接口/i.test(body);
  const bodyJewelry = /珠宝首饰全品类|首饰.*佩戴|耳饰在耳垂|项链在锁骨|手镯在手腕|宝石.*切面/i.test(body);

  if ((labelPhone && labelJewelry) || (bodyPhone && bodyJewelry) || (bodyPhone && labelJewelry) || (bodyJewelry && labelPhone)) return 'conflict';
  if (bodyPhone || labelPhone) return 'phone';
  if (bodyJewelry || labelJewelry) return 'jewelry';
  return 'other';
}

function kindLabel(kind: ProductRecipeKind): string {
  return kind === 'phone' ? '手机通讯' : kind === 'jewelry' ? '珠宝首饰' : '当前商品';
}

/** Select only from the caller's visible recipes; hidden official rows cannot reappear here. */
export function resolveRecipeForProduct<T extends RecipeForProduct>(
  recipes: T[],
  selectedArchId: string,
  product: ProductForRecipe,
): { recipe: T; error: null } | { recipe: null; error: string } {
  const productKind = productRecipeKind(product);
  const chosen = recipes.find(recipe => recipe.id === selectedArchId);

  if (selectedArchId !== 'auto') {
    if (!chosen) return { recipe: null, error: '所选创作技能已失效，请重新选择或改用自动匹配' };
    const chosenKind = recipeKind(chosen);
    if (chosenKind === 'conflict') {
      return { recipe: null, error: `创作技能「${chosen.name || chosen.id}」的名称与正文品类不一致，请先修正技能内容` };
    }
    if (productKind !== 'other' && chosenKind !== 'other' && chosenKind !== productKind) {
      return { recipe: null, error: `创作技能「${chosen.name || chosen.id}」不适用于${kindLabel(productKind)}商品，请选择相应技能或改用自动匹配` };
    }
    return { recipe: chosen, error: null };
  }

  const automatic = recipes.find(recipe => recipe.id === '__category_skill__');
  if (automatic) return { recipe: automatic, error: null };
  const matched = recipes.find(recipe => recipeKind(recipe) === productKind);
  if (matched) return { recipe: matched, error: null };
  if (productKind === 'other') {
    return { recipe: null, error: '当前商品没有可用的通用品类创作技能，请手动选择适合的技能' };
  }
  return { recipe: null, error: `没有可用的${kindLabel(productKind)}创作技能，请先在创作技能库中添加或恢复` };
}
