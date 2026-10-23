import { alignProductVariantImages, readProductVariantMetadata, type ProductVariantMetadata } from '@shared/domain/collection/productVariants';
import { normalizeCollectedProductImages } from '@shared/domain/collection/productImages';
import {
  buildSalesImageCatalog,
  inferSalesCategory,
  omitSalesPriceProps,
  sellingPointsFromProps,
  type SalesImageRef,
} from '@shared/domain/sales';
import type { VideoSalesCategory } from '@shared/domain/sales';

export type EcommercePlatform = 'jd' | 'taobao' | '1688' | 'pinduoduo';

export interface CollectedSalesProduct {
  productUrl: string;
  productName: string;
  brand: string;
  priceLabel: string;
  category: VideoSalesCategory;
  sellingPoints: string;
  props: Record<string, string>;
  imageCatalog: SalesImageRef[];
  productImages: string[];
  collectionSource?: string;
  fromCache?: boolean;
  detailsMissing?: boolean;
  variantMetadata?: ProductVariantMetadata;
}

const SOCIAL_HOSTS = ['xiaohongshu.com', 'xhslink.com', 'douyin.com', 'iesdouyin.com', 'kuaishou.com', 'weibo.com', 't.cn', 'bilibili.com', 'b23.tv'];

export function parseProductLink(raw: string): { ok: true; url: string; platform: EcommercePlatform } | { ok: false; error: string } {
  const text = raw.trim();
  if (!text) return { ok: false, error: '请粘贴商品链接' };
  const urls = [...new Set((text.match(/https?:\/\/[^\s,;"'<>()[\]，；。！？、（）【】「」《》]+/gi) || []).map((item) => item.replace(/[.!]+$/, '').replace(/&amp;/gi, '&')))];
  if (urls.length > 1) return { ok: false, error: '一次只处理一条商品链接' };
  if (urls.length === 1) return platformFromUrl(urls[0]);
  if (/^\d{7,20}$/.test(text)) return { ok: true, url: text, platform: 'jd' };
  return { ok: false, error: '请粘贴有效的商品链接' };
}

function platformFromUrl(url: string): { ok: true; url: string; platform: EcommercePlatform } | { ok: false; error: string } {
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return { ok: false, error: '请粘贴有效的商品链接' };
  }
  const matches = (...domains: string[]) => domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
  if (matches(...SOCIAL_HOSTS)) {
    return { ok: false, error: '万邦只采集电商商品链接。请粘贴京东、淘宝、天猫、1688 或拼多多链接。' };
  }
  if (matches('jd.com', '3.cn', '360buy.com')) return { ok: true, url, platform: 'jd' };
  if (matches('taobao.com', 'tmall.com', 'tb.cn')) return { ok: true, url, platform: 'taobao' };
  if (matches('1688.com')) return { ok: true, url, platform: '1688' };
  if (matches('pinduoduo.com', 'yangkeduo.com')) return { ok: true, url, platform: 'pinduoduo' };
  return { ok: false, error: '暂不支持该链接平台，请使用京东、淘宝、天猫、1688 或拼多多商品链接' };
}

export function mapCollectedSalesProduct(data: {
  product?: Record<string, unknown>;
  images?: Record<string, unknown>;
  variantMetadata?: unknown;
}, sourceUrl: string): CollectedSalesProduct {
  const product = data.product || {};
  const images = data.images || {};
  const { mainImgs, skuImgs, descImgs } = normalizeCollectedProductImages(data);
  const catalog = buildSalesImageCatalog({ mainImages: mainImgs, skuImages: skuImgs, descImages: descImgs });
  const props = omitSalesPriceProps(stringRecord(product.props));
  const brand = text(product.brand) || text(images.brand);
  const title = text(product.title) || '未命名商品';
  const categoryText = `${text(product.category) || text(images.category)} ${title}`;
  let detail: Record<string, unknown> = {};
  if (typeof product.detailUrls === 'string') {
    try { detail = JSON.parse(product.detailUrls) as Record<string, unknown>; } catch { /* Old invalid caches have no variant evidence. */ }
  }
  const variants = readProductVariantMetadata(product.variantMetadata)
    || readProductVariantMetadata(data.variantMetadata)
    || readProductVariantMetadata(detail?.variantMetadata);
  return {
    productUrl: sourceUrl,
    productName: title,
    brand,
    priceLabel: '',
    category: inferSalesCategory(categoryText),
    sellingPoints: sellingPointsFromProps(props),
    props,
    imageCatalog: catalog,
    productImages: catalog.map((image) => image.url),
    variantMetadata: variants ? alignProductVariantImages(variants, catalog.map((image) => image.url)) : undefined,
  };
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const props: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string' && item.trim()) props[key] = item.trim();
  }
  return props;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
