import { z } from 'zod';

export { turnStartBodySchema, turnApproveBodySchema, turnInterruptBodySchema } from '@shared/contracts/assistant';
export { analyzeBodySchema, collectBodySchema } from '@shared/contracts/catalog';

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
    if (/\b[a-z]:[\\/]/i.test(msg) || msg.includes('\\\\')) {
      return fallback;
    }
    if (/(\/Users?\/|\/home\/|\/private\/|\\Users\\|\\home\\)/i.test(msg)) {
      return fallback;
    }
    // 堆栈帧（at <symbol> (file:line:col)）一律视为泄露
    if (/\bat\s+[A-Za-z_$][\w$]*\s*\(/i.test(msg) || /\sat\s+\S+:\d+:\d+/i.test(msg)) {
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
