import type { ProductVariantMetadata } from '@shared/domain/collection/productVariants';
import { cleanSalesProductProps, eligibleSalesImages, type SalesColorSelection, type SalesImageRef } from '@shared/domain/sales';
import { parseProductLink } from './productLink';

interface ProfileInput {
  productName: string;
  productUrl?: string;
  props?: Record<string, string>;
  variantMetadata?: ProductVariantMetadata;
  colorSelection?: SalesColorSelection;
  images?: SalesImageRef[];
  isCollected?: boolean;
}

function collectedSkuId(input: ProfileInput): string {
  if (input.variantMetadata?.requestedSkuId) return input.variantMetadata.requestedSkuId;
  const parsed = parseProductLink(input.productUrl || '');
  if (!parsed.ok) return '';
  if (/^\d{7,20}$/.test(parsed.url)) return parsed.url;
  const url = new URL(parsed.url);
  const explicit = url.searchParams.get('skuId') || url.searchParams.get('sku_id') || '';
  if (/^\d{7,20}$/.test(explicit)) return explicit;
  return parsed.platform === 'jd' ? url.pathname.match(/\/(\d{7,20})(?:\.html)?\/?$/)?.[1] || '' : '';
}

function titleSpecifications(title: string): { color: string; size: string } {
  // Only use an explicit trailing color + clothing size, never words from the product description.
  const match = title.trim().match(/\s+((?:浅|深|宝|天|湖|藏|墨|军|酒|米|乳|银|炭|烟|咖啡)?(?:黑色|白色|灰色|蓝色|绿色|黄色|红色|粉色|紫色|橙色|棕色|米色|咖色|驼色|藏青)(?:加绒|常规|薄款|厚款)?)\s+((?:[2-9]XL|X{0,5}[SL]|M|均码))$/i);
  return { color: match?.[1] || '', size: match?.[2] || '' };
}

function splitVariantLabel(label: string | undefined, color: string | undefined): { color: string; spec: string } {
  const source = label?.trim() || '';
  if (!source) return { color: color?.trim() || '', spec: '' };
  const colorPrefix = /^(原色钛金属|黑色钛金属|银白灰|深空灰|钛空灰|暗夜黑|曜石黑|幻夜黑|亮黑|磨砂黑|星空黑|羽砂黑|雪域白|凝光白|珍珠白|象牙白|钛金|流光金|香槟金|玫瑰金|土豪金|远峰蓝|海蓝|天蓝|冰蓝|藏青|深蓝|暗夜绿|苍岭绿|墨绿|橄榄绿|薄荷绿|浅绿|暗夜紫|丁香紫|薰衣草紫|樱花粉|活力橙|日落橙|中国红|酒红|银色|灰色|黑色|白色|金色|蓝色|绿色|黄色|橙色|棕色|米色|驼色|咖色|粉色|紫色)(?=加绒|常规|薄款|厚款|套装|标准版|高配|顶配|\s|[/]|$)/;
  const match = source.match(colorPrefix);
  if (match) return { color: match[1], spec: source.slice(match[1].length).trim().replace(/^[/,:：-]+/, '').trim() };
  return { color: color?.trim() || source, spec: color && source !== color ? source : '' };
}

/** Display-only profile; reference-image selection must not erase the collected product identity. */
export function salesProductProfile(input: ProfileInput): { sku: string; specification: string; hasData: boolean } {
  const requested = collectedSkuId(input);
  const metadata = input.variantMetadata;
  const variants = (metadata?.variants || []).filter((variant) => variant.label && variant.label !== '未知');
  const selection = input.colorSelection || { colorLabel: '', confirmedImageUrls: [], excludedImageUrls: [] };
  const selected = eligibleSalesImages(input.images || [], selection, metadata);
  const cleared = !selection.variantId && !selection.colorLabel.trim() && !selected.length && selection.excludedImageUrls.length > 0;
  const explicit = variants.find((variant) => variant.id === selection.variantId);
  // Main/detail images may have no SKU mapping. Only associated images constrain the displayed variant.
  const associations = selected.map((image) => variants.filter((variant) => variant.imageUrls.includes(image.url))).filter((matches) => matches.length);
  const candidates = variants.filter((variant) => associations.every((matches) => matches.includes(variant)));
  const collected = variants.find((variant) => variant.skuIds.includes(requested))
    || (!requested ? variants.find((variant) => variant.id === metadata?.selectedVariantId) : undefined);
  const current = explicit
    || (associations.length ? candidates.length === 1 ? candidates[0] : candidates.find((variant) => variant === collected) : !cleared ? collected : undefined);
  const useCollected = current ? Boolean(requested && current.skuIds.includes(requested))
    : !explicit && !associations.length && Boolean(requested);
  const sku = current ? current.skuIds.includes(requested) ? requested : current.skuIds.length === 1 ? current.skuIds[0] : ''
    : useCollected ? requested : '';
  const title = input.isCollected && useCollected ? titleSpecifications(input.productName) : { color: '', size: '' };
  const properties = cleanSalesProductProps(input.props || {}, '__hidden_brand__');
  const specKeys = /^(?:当前|商品|产品|SKU\s*)?(?:尺码|规格|版本|配置|套餐|容量|尺寸|型号|网络|内存|存储)$/i;
  const specs = useCollected ? properties.filter(([key]) => specKeys.test(key)) : [];
  const details = splitVariantLabel(current?.label, current?.color);
  const color = details.color || selection.colorLabel.trim()
    || (useCollected ? properties.find(([key]) => /^(?:颜色|颜色分类|色号)$/.test(key))?.[1] : '') || title.color;
  const variantParts = [color, details.spec].filter(Boolean);
  const variantTokens = variantParts.flatMap((part) => part.split(/[\s/]+/));
  const titleColorMatches = !color || splitVariantLabel(title.color, undefined).color === color;
  const size = titleColorMatches && title.size && !specs.some(([key]) => /尺码|规格|尺寸/.test(key)) && !variantTokens.includes(title.size) ? title.size : '';
  const specification = [...new Set([...variantParts, size, ...specs.filter(([, value]) => !variantTokens.includes(value)).map(([key, value]) => `${key}：${value}`)].filter(Boolean))].join(' / ');
  return { sku, specification: specification || (cleared && !useCollected ? '未选择' : ''), hasData: Boolean(input.isCollected || requested || variants.length || properties.length) };
}
