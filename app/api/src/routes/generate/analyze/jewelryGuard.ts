import { isJewelryProductTitle, buildJewelryTemplateStyle } from '@beike/domain/jewelryArchHelpers';

export function resolveTemplateStyleWithJewelryGuard(
  templateStyle: unknown,
  productTitle?: string,
  productProps?: Record<string, any>,
): string {
  let resolvedTemplateStyle = typeof templateStyle === 'string' ? templateStyle : 'auto';
  if (
    resolvedTemplateStyle !== 'auto' &&
    !resolvedTemplateStyle.includes('本商品子品类专属强化守卫') &&
    (isJewelryProductTitle(productTitle, productProps) ||
      /珠宝|jewelry|首饰|8段式.*装配骨架/i.test(resolvedTemplateStyle))
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
