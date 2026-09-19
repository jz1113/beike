import { isJewelryProductTitle, buildJewelryTemplateStyle } from '@beike/domain/jewelryArch';

export function resolveTemplateStyleWithJewelryGuard(
  templateStyle: unknown,
  productTitle?: string,
  productProps?: Record<string, any>,
): string {
  let resolvedTemplateStyle = typeof templateStyle === 'string' ? templateStyle : 'auto';
  const looksLikeJewelryRecipe = /珠宝|jewelry|首饰|8段式.*装配骨架/i.test(resolvedTemplateStyle);
  if (resolvedTemplateStyle !== 'auto' && looksLikeJewelryRecipe && !isJewelryProductTitle(productTitle, productProps)) {
    return 'auto';
  }
  if (
    resolvedTemplateStyle !== 'auto' &&
    !resolvedTemplateStyle.includes('本商品子品类专属强化守卫') &&
    isJewelryProductTitle(productTitle, productProps)
  ) {
    const [archName, ...snippetLines] = resolvedTemplateStyle.split('\n');
    const baseSnippet = snippetLines.join('\n').trim();
    resolvedTemplateStyle = buildJewelryTemplateStyle(
      archName || '珠宝首饰',
      baseSnippet,
      productTitle,
      productProps
    );
  }
  return resolvedTemplateStyle;
}
