import { jsonResponse } from '../../core/http';
import { readJsonBody } from '../../core/validate';
import { parseJsonBody } from '../../core/validate';
import { turnStartBodySchema } from '@beike/contracts/assistant';
import { createAssistantSSEStream } from '../../services/assistantAgent';

/** Legacy alias — 与 /turn/start 同引擎。Web 主路径已改用 /turn/start，此入口保留给旧客户端。 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await readJsonBody(req);
  } catch (parseErr: unknown) {
    const msg = parseErr instanceof Error ? parseErr.message : '内容格式异常';
    return jsonResponse(
      {
        success: false,
        error: `请求载荷解析失败: ${msg}。建议减少上传的附件图片数量后重试。`,
      },
      400,
    );
  }

  const parsed = parseJsonBody(body, turnStartBodySchema);
  if (!parsed.success) {
    return jsonResponse({ success: false, error: parsed.error }, 400);
  }

  return createAssistantSSEStream(req, parsed.data);
}
