import { prisma } from '@beike/shared/prisma';
import { getInternalApiHeaders } from '@beike/shared/apiAuth';
import type { AssistantDocAttachment } from './defs';

export function detectPlatform(input: string): 'jd' | 'taobao' | '1688' | 'pinduoduo' | 'social' | 'auto' {
  const u = input.toLowerCase();
  if (/xiaohongshu|xhslink|douyin|iesdouyin|kuaishou|v\.kuaishou|weibo|bilibili/.test(u)) return 'social';
  if (/jd\.com|3\.cn|\b\d{8,16}\b/.test(u) && !/taobao|tmall|1688|yangkeduo/.test(u)) return 'jd';
  if (/taobao|tmall/.test(u)) return 'taobao';
  if (/1688/.test(u)) return '1688';
  if (/yangkeduo|pinduoduo|pdd/.test(u)) return 'pinduoduo';
  if (/^\d{8,16}$/.test(input.trim())) return 'jd';
  return 'auto';
}

export async function toolParseUrl(urlRaw: string, origin: string, signal?: AbortSignal): Promise<string> {
  const url = String(urlRaw || '').trim();
  if (!url) return JSON.stringify({ success: false, error: '缺少 url' });

  const platform = detectPlatform(url);
  try {
    if (platform === 'social' || /xiaohongshu|douyin|kuaishou|weibo|bilibili/i.test(url)) {
      const scraperId = process.env.EXTERNAL_SCRAPER_ID || '';
      const scraperSecret = process.env.EXTERNAL_SCRAPER_SECRET || '';
      const res = await fetch(`${origin}/api/catalog/styles/parse-link`, {
        method: 'POST',
        headers: getInternalApiHeaders(),
        body: JSON.stringify({
          url,
          text: url,
          scraperId: scraperId || undefined,
          customScraperId: scraperId || undefined,
          scraperSecret: scraperSecret || undefined,
          customApiKey: scraperSecret || undefined,
        }),
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(120000)]) : AbortSignal.timeout(120000),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!data.success) {
        const hint =
          (!scraperId || !scraperSecret) && !(process.env.QIYUN_APP_ID && process.env.QIYUN_APP_KEY)
            ? '（请在设置中配置奇云或 APIA 解析凭证并同步到服务端）'
            : '';
        return JSON.stringify({
          success: false,
          error: `${data.error || '社媒解析失败'}${hint}`,
          upstreamCode: data.upstreamCode,
        });
      }
      const d = (data.data || data) as Record<string, unknown>;
      return JSON.stringify({
        success: true,
        kind: 'social',
        sourceUrl: url,
        platform: /xiaohongshu|xhslink/i.test(url) ? 'xiaohongshu' : 'social',
        title: d.title,
        author: d.author,
        cover: d.cover,
        imageCount: Array.isArray(d.images) ? d.images.length : 0,
        images: Array.isArray(d.images) ? d.images : [],
        video: d.video || null,
        description: String(d.description || '').slice(0, 500),
      });
    }

    const res = await fetch(`${origin}/api/catalog/collect`, {
      method: 'POST',
      headers: getInternalApiHeaders(),
      body: JSON.stringify({
        url,
        platform: platform === 'auto' ? undefined : platform,
        forceRefresh: false,
      }),
      signal: AbortSignal.timeout(90000),
    });
    const data = await res.json();
    if (!data.success || !data.product) {
      return JSON.stringify({ success: false, error: data.error || '商品采集失败' });
    }
    const p = data.product;
    const main = p.mainImages || data.images?.main || [];
    const details = p.detailImages || data.images?.details || [];
    const skus = p.skuImages || data.images?.skus || [];
    return JSON.stringify({
      success: true,
      kind: 'ecommerce',
      title: p.title,
      platform: p.platform,
      skuId: p.skuId || p.itemId,
      price: p.price,
      category: p.category,
      cover: p.coverImage || p.picUrl || main[0],
      mainImageCount: main.length,
      detailImageCount: details.length,
      skuImageCount: skus.length,
      sampleImages: [...main, ...skus].slice(0, 6),
      props: p.props || {},
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '解析请求失败';
    return JSON.stringify({ success: false, error: msg });
  }
}

export function toolReadDocument(
  args: { document_name?: string; query?: string; offset?: number; length?: number },
  documents: AssistantDocAttachment[],
): string {
  if (!documents.length) {
    return JSON.stringify({ success: false, error: '本轮没有可读取的文档附件' });
  }

  const nameQ = (args.document_name || '').toLowerCase();
  const doc =
    (nameQ ? documents.find((d) => (d.name || '').toLowerCase().includes(nameQ)) : null) || documents[0];

  const full = doc.extractedText || '';
  if (!full) {
    return JSON.stringify({ success: false, error: '文档无文本内容', name: doc.name });
  }

  const maxLen = Math.min(8000, Math.max(500, Number(args.length) || 4000));
  const query = (args.query || '').trim();

  if (query) {
    const idx = full.toLowerCase().indexOf(query.toLowerCase());
    if (idx < 0) {
      return JSON.stringify({
        success: true,
        name: doc.name,
        found: false,
        message: `未找到关键词「${query}」`,
        totalChars: full.length,
      });
    }
    const start = Math.max(0, idx - 200);
    const end = Math.min(full.length, idx + query.length + maxLen);
    return JSON.stringify({
      success: true,
      name: doc.name,
      found: true,
      query,
      offset: start,
      totalChars: full.length,
      excerpt: full.slice(start, end),
    });
  }

  const offset = Math.max(0, Number(args.offset) || 0);
  const excerpt = full.slice(offset, offset + maxLen);
  return JSON.stringify({
    success: true,
    name: doc.name,
    found: true,
    offset,
    totalChars: full.length,
    truncated: offset + maxLen < full.length,
    excerpt,
  });
}

export async function toolListProducts(args: { limit?: number; keyword?: string }): Promise<string> {
  const limit = Math.min(30, Math.max(1, Number(args.limit) || 10));
  const keyword = (args.keyword || '').trim();

  try {
    const rows = await prisma.product.findMany({
      orderBy: { createdAt: 'desc' },
      take: keyword ? 80 : limit,
      select: {
        id: true,
        platform: true,
        itemId: true,
        title: true,
        picUrl: true,
        createdAt: true,
      },
    });

    const filtered = keyword
      ? rows.filter((r) => (r.title || '').toLowerCase().includes(keyword.toLowerCase())).slice(0, limit)
      : rows.slice(0, limit);

    return JSON.stringify({
      success: true,
      count: filtered.length,
      products: filtered.map((r) => ({
        id: r.id,
        platform: r.platform,
        itemId: r.itemId,
        title: r.title,
        picUrl: r.picUrl,
        createdAt: r.createdAt,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '读取商品库失败';
    return JSON.stringify({ success: false, error: msg });
  }
}

export async function toolQueryAssetLibrary(
  args: { asset_type?: string; keyword?: string; limit?: number },
  origin: string,
): Promise<string> {
  const assetType = args.asset_type || 'all';
  const keyword = (args.keyword || '').trim();
  const limit = Math.min(30, Math.max(1, Number(args.limit) || 10));

  try {
    const params = new URLSearchParams({
      type: assetType,
      pageSize: String(limit),
      slim: '1',
    });
    if (keyword) params.set('keyword', keyword);

    const res = await fetch(`${origin}/api/catalog/assets/library?${params}`, {
      headers: getInternalApiHeaders(),
      signal: AbortSignal.timeout(30000),
    });
    const data = await res.json();
    if (!data.success) {
      return JSON.stringify({ success: false, error: data.error || '资产库查询失败' });
    }
    let assets: Record<string, unknown>[] = [];
    if (assetType === 'all') {
      assets = [
        ...(data.fullPrompts || []).map((a: Record<string, unknown>) => ({ ...a, type: 'full_prompt' })),
        ...(data.scenes || []).map((a: Record<string, unknown>) => ({ ...a, type: 'scene' })),
        ...(data.outfits || []).map((a: Record<string, unknown>) => ({ ...a, type: 'outfit' })),
        ...(data.actions || []).map((a: Record<string, unknown>) => ({ ...a, type: 'action' })),
        ...(data.personas || []).map((a: Record<string, unknown>) => ({ ...a, type: 'persona' })),
      ];
    } else {
      assets = (data.assets || data.items || []) as Record<string, unknown>[];
    }
    if (keyword) {
      const q = keyword.toLowerCase();
      assets = assets.filter((a) => {
        const hay = [
          a.title,
          a.name,
          a.code,
          a.albumName,
          a.promptPreview,
          a.sceneSummary,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }
    assets = assets.slice(0, limit);
    return JSON.stringify({
      success: true,
      count: assets.length,
      assets: assets.map((a) => ({
        id: a.id,
        code: a.code,
        title: a.title || a.name,
        type: a.type || assetType,
        category: a.category,
        tags: a.tags,
        albumName: a.albumName,
        promptPreview: a.promptPreview,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '资产库查询失败';
    return JSON.stringify({ success: false, error: msg });
  }
}

export function parseReversePromptSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const re = /【([^】]+)】([^【]*)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const key = match[1]?.trim();
    const value = match[2]?.trim();
    if (key && value) sections[key] = value;
  }
  return sections;
}

export async function toolGetPromptAssetDetail(
  args: { asset_type?: string; asset_id?: string },
  origin: string,
): Promise<string> {
  const assetType = args.asset_type || 'full_prompt';
  const assetId = String(args.asset_id || '').trim();
  if (!assetId) return JSON.stringify({ success: false, error: '缺少 asset_id' });

  try {
    const res = await fetch(
      `${origin}/api/catalog/assets/library?type=${encodeURIComponent(assetType)}&id=${encodeURIComponent(assetId)}`,
      {
        headers: getInternalApiHeaders(),
        signal: AbortSignal.timeout(30000),
      },
    );
    const data = await res.json();
    if (!data.success || !data.item) {
      return JSON.stringify({ success: false, error: data.error || '资产不存在' });
    }
    const item = data.item as Record<string, unknown>;
    const reversePromptZh = String(item.reversePromptZh || item.reversePrompt || '').trim();
    return JSON.stringify({
      success: true,
      assetType,
      id: item.id,
      title: item.title || item.name,
      albumName: item.albumName,
      reversePromptZh: reversePromptZh || undefined,
      reversePrompt: item.reversePrompt,
      description: item.description,
      dimensions: item.dimensions,
      sceneSummary: item.sceneSummary,
      outfitSummary: item.outfitSummary,
      actionSummary: item.actionSummary,
      personaSummary: item.personaSummary,
      coverUrl: item.coverUrl,
      sections: reversePromptZh ? parseReversePromptSections(reversePromptZh) : undefined,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '读取资产详情失败';
    return JSON.stringify({ success: false, error: msg });
  }
}
