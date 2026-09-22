import { jsonResponse } from '../../core/http';
import { readJsonBody } from '../../core/validate';
import { db } from '../../repositories/access';
import { formatUserError } from '@beike/domain/upstreamErrors';

// 获取所有提示词生成历史记录
export async function GET() {
  try {
    const records = await db.promptRecord.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    const formatted = records.map(r => {
      let prompts = [];
      try {
        prompts = JSON.parse(r.promptsJson || '[]');
      } catch {}
      return {
        ...r,
        prompts,
        shotCount: prompts.length
      };
    });

    return jsonResponse({ success: true, records: formatted });
  } catch (error: any) {
    return jsonResponse({ error: formatUserError(error) }, 500);
  }
}

// 手动保存/更新提示词记录
export async function POST(req: Request) {
  try {
    const body = await readJsonBody(req);
    const { productId, productTitle, productFingerprint, modelUsed, styleName, prompts } = body;

    const record = await db.promptRecord.create({
      data: {
        productId: productId || null,
        productTitle: productTitle || '未命名商品',
        productFingerprint: productFingerprint || '',
        modelUsed: modelUsed || 'gemini-3.1-pro-preview',
        styleName: styleName || '📱 真实手机买家秀',
        promptsJson: typeof prompts === 'string' ? prompts : JSON.stringify(prompts || [])
      }
    });

    return jsonResponse({ success: true, record });
  } catch (error: any) {
    return jsonResponse({ error: formatUserError(error) }, 500);
  }
}

// 删除某条提示词记录
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return jsonResponse({ error: '缺少 id 参数' }, 400);
    }

    await db.promptRecord.delete({
      where: { id }
    });

    return jsonResponse({ success: true });
  } catch (error: any) {
    return jsonResponse({ error: formatUserError(error) }, 500);
  }
}
