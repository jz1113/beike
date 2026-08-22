import { prisma } from '@/lib/prisma';
import { getInternalApiHeaders } from '@/lib/apiAuth';

export const ASSISTANT_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'parse_product_or_social_url',
      description:
        '解析电商商品链接/SKU 或小红书/抖音/快手等社媒作品链接，返回标题、封面、图片列表与视频地址（如有）。当用户消息中出现商品或社媒 URL、或明确要求采集/解析链接时调用。',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: '完整的 http(s) 商品或社媒作品链接，或纯数字京东 SKU',
          },
        },
        required: ['url'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_attached_document',
      description:
        '读取本轮用户已上传文档的文本片段。可按关键词搜索，或按字符偏移截取。当需要引用文档细节、核对规格或长文未完整展示时调用。',
      parameters: {
        type: 'object',
        properties: {
          document_name: {
            type: 'string',
            description: '文档文件名（可部分匹配）。不传则使用第一份文档。',
          },
          query: {
            type: 'string',
            description: '可选关键词，返回匹配附近的上下文片段。',
          },
          offset: {
            type: 'number',
            description: '可选字符起始偏移，默认 0。',
          },
          length: {
            type: 'number',
            description: '截取长度，默认 4000，最大 8000。',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_user_products',
      description:
        '列出用户本地商品库中最近采集/保存的商品摘要（标题、平台、封面）。当用户询问「我有哪些商品」「商品库」「历史采集」时调用。',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'number',
            description: '返回条数，默认 10，最大 30。',
          },
          keyword: {
            type: 'string',
            description: '可选标题关键词过滤。',
          },
        },
        required: [],
      },
    },
  },
];

export type AssistantDocAttachment = {
  name?: string;
  extractedText?: string;
};

export type ToolExecContext = {
  origin: string;
  documents: AssistantDocAttachment[];
};

export function toolDisplayName(name: string): string {
  switch (name) {
    case 'parse_product_or_social_url':
      return '解析商品/社媒链接';
    case 'read_attached_document':
      return '阅读附件文档';
    case 'list_user_products':
      return '查询商品库';
    default:
      return name;
  }
}

function detectPlatform(input: string): 'jd' | 'taobao' | '1688' | 'pinduoduo' | 'social' | 'auto' {
  const u = input.toLowerCase();
  if (/xiaohongshu|xhslink|douyin|iesdouyin|kuaishou|v\.kuaishou|weibo|bilibili/.test(u)) return 'social';
  if (/jd\.com|3\.cn|\b\d{8,16}\b/.test(u) && !/taobao|tmall|1688|yangkeduo/.test(u)) return 'jd';
  if (/taobao|tmall/.test(u)) return 'taobao';
  if (/1688/.test(u)) return '1688';
  if (/yangkeduo|pinduoduo|pdd/.test(u)) return 'pinduoduo';
  if (/^\d{8,16}$/.test(input.trim())) return 'jd';
  return 'auto';
}

async function toolParseUrl(urlRaw: string, origin: string): Promise<string> {
  const url = String(urlRaw || '').trim();
  if (!url) return JSON.stringify({ success: false, error: '缺少 url' });

  const platform = detectPlatform(url);
  try {
    if (platform === 'social' || /xiaohongshu|douyin|kuaishou|weibo|bilibili/i.test(url)) {
      const res = await fetch(`${origin}/api/catalog/styles/parse-link`, {
        method: 'POST',
        headers: getInternalApiHeaders(),
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(60000),
      });
      const data = await res.json();
      if (!data.success) {
        return JSON.stringify({ success: false, error: data.error || '社媒解析失败' });
      }
      const d = data.data || data;
      return JSON.stringify({
        success: true,
        kind: 'social',
        title: d.title,
        author: d.author,
        cover: d.cover,
        imageCount: Array.isArray(d.images) ? d.images.length : 0,
        images: (d.images || []).slice(0, 8),
        video: d.video || null,
        description: (d.description || '').slice(0, 500),
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
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e?.message || '解析请求失败' });
  }
}

function toolReadDocument(
  args: { document_name?: string; query?: string; offset?: number; length?: number },
  documents: AssistantDocAttachment[]
): string {
  if (!documents.length) {
    return JSON.stringify({ success: false, error: '本轮没有可读取的文档附件' });
  }

  const nameQ = (args.document_name || '').toLowerCase();
  const doc =
    (nameQ
      ? documents.find((d) => (d.name || '').toLowerCase().includes(nameQ))
      : null) || documents[0];

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

async function toolListProducts(args: { limit?: number; keyword?: string }): Promise<string> {
  // 单机工作台：商品库无用户隔离，列出本机全部记录
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
  } catch (e: any) {
    return JSON.stringify({ success: false, error: e?.message || '读取商品库失败' });
  }
}

export async function executeAssistantTool(
  name: string,
  argsJson: string,
  ctx: ToolExecContext
): Promise<string> {
  let args: any = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    args = {};
  }

  switch (name) {
    case 'parse_product_or_social_url':
      return toolParseUrl(args.url || args.link || '', ctx.origin);
    case 'read_attached_document':
      return toolReadDocument(args, ctx.documents);
    case 'list_user_products':
      return toolListProducts(args);
    default:
      return JSON.stringify({ success: false, error: `未知工具: ${name}` });
  }
}
