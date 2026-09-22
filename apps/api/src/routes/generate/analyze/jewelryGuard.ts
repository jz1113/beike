import { isJewelryProductTitle, buildJewelryTemplateStyle } from '@beike/domain/jewelryArch';

export function resolveTemplateStyleWithJewelryGuard(
  templateStyle: unknown,
  productTitle?: string,
  productProps?: Record<string, any>,
): string {
  let resolvedTemplateStyle = typeof templateStyle === 'string' ? templateStyle : 'auto';
  const looksLikeJewelryRecipe = /珠宝|jewelry|首饰|8段式.*装配骨架/i.test(resolvedTemplateStyle);
  if (resolvedTemplateStyle !== 'auto' && looksLikeJewelryRecipe && !isJewelryProductTitle(productTitle, productProps)) {
    const note = '\n\n## 【未套用珠宝子品类守卫】当前商品不是珠宝首饰，仅使用该架构的机位骨架，不套用珠宝半身/微距守卫。';
    return resolvedTemplateStyle.includes('未套用珠宝子品类守卫') ? resolvedTemplateStyle : `${resolvedTemplateStyle}${note}`;
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
