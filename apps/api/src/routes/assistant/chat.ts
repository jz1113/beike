import { jsonResponse } from '../../core/http';
import { parseJsonBody } from '../../core/validate';
import { turnStartBodySchema } from '@beike/contracts/assistant';
import { createAssistantSSEStream } from '../../services/assistantAgent';

/** Legacy alias — delegates to Codex-style agent turn engine */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
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
