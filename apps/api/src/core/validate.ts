import { z } from 'zod';

export { turnStartBodySchema, turnApproveBodySchema, turnInterruptBodySchema } from '@beike/contracts/assistant';
export { analyzeBodySchema, collectBodySchema } from '@beike/contracts/catalog';

/**
 * 安全提取错误消息。
 * 所有 catch 块应当使用此函数，而非直接访问 `error.message`。
 * 保证返回值为非空字符串，且不泄露堆栈、SQL 语句或文件路径等内部信息。
 */
export function safeErrorMessage(error: unknown, fallback = '服务器内部错误'): string {
  if (error instanceof Error) {
    const msg = error.message;
    // 已知无害的错误前缀列表（业务逻辑错误可透传）
    // ⚠️ ENOENT 故意不放入：ENOENT 消息常包含绝对路径（如 /Users/...），属于泄露信息。
    const knownPrefixes = [
      'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND',
      '服务重启', '任务已过期', '缺少', '不存在', '未配置',
      '网络连接超时', '请求数据格式异常',
    ];
    if (knownPrefixes.some((p) => msg.startsWith(p))) return msg;

    // 过滤泄露内部信息的关键词（大小写不敏感）
    const leakedKeywords = [
      'sql', 'sqlite', 'prisma',
      'parse error', 'syntax error', 'unexpected token',
      'at line ', 'at column ',
    ];
    const lowerMsg = msg.toLowerCase();
    if (leakedKeywords.some((kw) => lowerMsg.includes(kw))) {
      return fallback;
    }
    // 文件路径模式检测（Windows 盘符、/Users/、/home/、UNC、堆栈 — 大小写不敏感）
    if (/\b[a-z]:[\\\/]/i.test(msg) || msg.includes('\\\\')) {
      return fallback;
    }
    if (/(\/Users?\/|\/home\/|\/private\/|\\Users\\|\\home\\)/i.test(msg)) {
      return fallback;
    }
    // 堆栈帧（at <symbol> (file:line:col)）一律视为泄露
    if (/\bat\s+[A-Za-z_$][\w$]*\s*\(/i.test(msg) || /\sat\s+\S+\:\d+\:\d+/i.test(msg)) {
      return fallback;
    }
    return msg.slice(0, 200);
  }
  if (typeof error === 'string') return error.slice(0, 200);
  return fallback;
}

/**
 * JSON 解析错误归一化函数。
 * 将 req.json() 失败或其他 JSON 相关错误映射为统一格式，
 * 避免将 JSON 解析器的具体错误信息（如字段位置）泄露给客户端。
 */
export function normalizeJsonError(error: unknown): string {
  const msg = safeErrorMessage(error, '');
  if (!msg) return '请求数据格式异常';
  const firstLine = msg.split('\n')[0].trim();
  // 若错误信息形如 "[zod error at path.field]" 则归一化
  if (/^\[.*\]/.test(firstLine)) return '请求数据格式异常';
  return firstLine.slice(0, 100) || '请求数据格式异常';
}

export async function readJsonBody(req: Request, fallback?: any): Promise<any> {
  try {
    return await req.json();
  } catch (error) {
    if (fallback !== undefined) return fallback;
    throw new Error(normalizeJsonError(error));
  }
}

export function parseJsonBody<TSchema extends z.ZodTypeAny>(
  body: unknown,
  schema: TSchema,
): { success: true; data: z.output<TSchema> } | { success: false; error: string } {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    if (!parsed.error.issues.length) {
      return { success: false, error: '请求体无效' };
    }
    const issue = parsed.error.issues[0];
    const path = issue?.path?.length ? `${issue.path.join('.')}: ` : '';
    return { success: false, error: `${path}${issue?.message || '请求体无效'}` };
  }
  return { success: true, data: parsed.data };
}

interface ExportImageItem {
  filename?: string;
  url: string;
  shotNo?: number;
  title?: string;
  prompt?: string;
}

export interface ExportZipBody {
  batchTitle?: string;
  /** 图片/视频下载并发数，默认 16（最高），上限 16 */
  downloadConcurrency?: number;
  products?: Array<{
    skuId?: string;
    /** 导出时使用的顺序命名（1、2、3…）。 */
    currentName?: string;
    productTitle?: string;
    title?: string;
    description?: string;
    sourceUrl?: string;
    coverImage?: string;
    copywritingTitle?: string;
    copywritingContent?: string;
    copywritingTags?: string[];
    video?: string | null;
    videoUrl?: string | null;
    videos?: string[];
    images: (string | ExportImageItem)[];
  }>;
  skuId?: string;
  folderName?: string;
  productTitle?: string;
  copywritingTitle?: string;
  copywritingContent?: string;
  copywritingTags?: string[];
  description?: string;
  video?: string | null;
  videoUrl?: string | null;
  images?: (string | ExportImageItem)[];
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function safeString(v: unknown, max = 500, fallback = ''): string {
  if (typeof v === 'string') return v.slice(0, max);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).slice(0, max);
  return fallback;
}

function safeOptionalString(v: unknown, max = 500): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v === 'string') return v.slice(0, max);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v).slice(0, max);
  return undefined;
}

function parseImages(v: unknown, maxItems = 500): (string | ExportImageItem)[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) return [];
  const list = v.slice(0, maxItems);
  const result: (string | ExportImageItem)[] = [];
  for (const item of list) {
    if (!item) continue;
    if (typeof item === 'string') {
      if (item.trim()) result.push(item.trim());
    } else if (isObject(item) && typeof item.url === 'string' && item.url.trim()) {
      result.push({
        filename: safeOptionalString(item.filename, 256),
        url: item.url.trim(),
        shotNo: typeof item.shotNo === 'number' ? item.shotNo : undefined,
        title: safeOptionalString(item.title, 500),
        prompt: safeOptionalString(item.prompt, 10000),
      });
    }
  }
  return result;
}

export function parseExportZipBody(body: unknown):
  { success: true; data: ExportZipBody } | { success: false; error: string } {
  try {
    if (!isObject(body)) {
      return { success: false, error: '请求体无效' };
    }
    const products = body.products === undefined
      ? undefined
      : (() => {
          if (!Array.isArray(body.products)) return undefined;
          return body.products.slice(0, 2000).map((p, idx) => {
            if (!isObject(p)) {
              return {
                skuId: `PROD_${idx + 1}`,
                title: `商品_${idx + 1}`,
                images: [],
              };
            }
            return {
              skuId: safeOptionalString(p.skuId, 128) || `PROD_${idx + 1}`,
              currentName: safeOptionalString(p.currentName, 128),
              productTitle: safeOptionalString(p.productTitle, 500),
              title: safeOptionalString(p.title, 500) || `商品_${idx + 1}`,
              description: safeOptionalString(p.description, 50000),
              sourceUrl: safeOptionalString(p.sourceUrl, 4096),
              coverImage: safeOptionalString(p.coverImage, 4096),
              copywritingTitle: safeOptionalString(p.copywritingTitle, 500),
              copywritingContent: safeOptionalString(p.copywritingContent, 50000),
              copywritingTags: Array.isArray(p.copywritingTags)
                ? p.copywritingTags.map((t: unknown) => safeString(t, 100)).filter(Boolean)
                : undefined,
              video: p.video === null ? null : safeOptionalString(p.video, 4096),
              videoUrl: p.videoUrl === null ? null : safeOptionalString(p.videoUrl, 4096),
              videos: Array.isArray(p.videos)
                ? p.videos.map((url: unknown) => safeString(url, 4096)).filter(Boolean).slice(0, 50)
                : undefined,
              images: parseImages(p.images, 200) || [],
            };
          });
        })();

    const downloadConcurrency =
      body.downloadConcurrency === undefined || body.downloadConcurrency === null
        ? undefined
        : (() => {
            if (typeof body.downloadConcurrency !== 'number' || !Number.isFinite(body.downloadConcurrency)) {
              return 16;
            }
            const n = Math.floor(body.downloadConcurrency);
            return Math.max(1, Math.min(16, n));
          })();

    const data: ExportZipBody = {
      batchTitle: safeOptionalString(body.batchTitle, 200) || '全渠道采集批量导出',
      downloadConcurrency,
      skuId: safeOptionalString(body.skuId, 128),
      folderName: safeOptionalString(body.folderName, 300),
      productTitle: safeOptionalString(body.productTitle, 500),
      copywritingTitle: safeOptionalString(body.copywritingTitle, 500),
      copywritingContent: safeOptionalString(body.copywritingContent, 50000),
      copywritingTags: Array.isArray(body.copywritingTags)
        ? body.copywritingTags.map((t: unknown) => safeString(t, 100)).filter(Boolean)
        : undefined,
      description: safeOptionalString(body.description, 50000),
      video: body.video === null ? null : safeOptionalString(body.video, 4096),
      videoUrl: body.videoUrl === null ? null : safeOptionalString(body.videoUrl, 4096),
      images: parseImages(body.images, 500),
      products,
    };
    return { success: true, data };
  } catch (err) {
    return {
      success: false,
      error: safeErrorMessage(err, '请求体无效'),
    };
  }
}
