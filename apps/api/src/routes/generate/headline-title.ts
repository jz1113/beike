import { gatewayFetch } from '../../gateways/http';
import { normalizeGatewayBaseUrl } from '@beike/domain/gatewayUrl';
import { jsonResponse } from '../../core/http';
import { parseJsonBody } from '../../core/validate';
import { HeadlineTitleRequestSchema } from '@beike/contracts/generate';
import { resolveGatewayCreds } from '@beike/domain/gatewayCreds';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { convertToStandardJpegDataUrl } from '@beike/server-kit/imageConverter';
import { getDefaultApiKey, getDefaultBaseUrl } from '../../services/gatewayCredentials';
import { HeadlineContractError, headlineErrorHttpStatus } from './headline-design-contract';

function normalizeTitle(value: unknown): string {
  return String(value || '')
    .replace(/[“”'‘’【】\[\]（）()]/g, '')
    .replace(/[，。！？、；：\s]/g, '')
    .trim();
}

export async function POST(req: Request) {
  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return jsonResponse({ success: false, error: '请求数据格式异常' }, 400);
    }
    const parsedBody = parseJsonBody(rawBody, HeadlineTitleRequestSchema);
    if (!parsedBody.success) return jsonResponse({ success: false, error: parsedBody.error }, 400);
    const body = parsedBody.data;
    const originalTitle = String(body.originalTitle || '').trim();
    const productName = String(body.productName || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 64);
    if (!originalTitle) return jsonResponse({ success: false, error: '缺少原标题，无法改写封面标题。' }, 400);

    const { baseUrl, apiKey } = resolveGatewayCreds(req, { customBaseUrl: body.customBaseUrl, customApiKey: body.customApiKey }, {
      baseUrl: getDefaultBaseUrl(),
      apiKey: getDefaultApiKey(),
    });
    if (!apiKey) return jsonResponse({ success: false, error: '未配置标题改写模型的 API Key，未提交后续封面设计或生图任务。' }, 400);

    const prompt = `你是中文短视频封面的标题编辑。请结合输入商品/实拍图和原标题，只完成一次标题改写，不设计画面，不写生图提示词。

原标题：${originalTitle}
用户确认的商品名称/型号（可选，仅作事实锚点）：${productName || '未提供'}

规则：
1. 只返回 7–12 个纯中文字符的主标题，适合拆为两行、缩略图第一眼可读。
2. 标题必须保留原标题中可验证的核心结论、使用场景或反差；不得虚构参数、价格、功能、品牌背书或效果。
3. 商品名称/型号会由下一阶段作为独立、较小的事实锚点展示；主标题必须写它以外的观点钩子，不能只重复名称。根据原标题的真实意图，优先写成“问题/反差”“决策判断”“强结论”“对比选择”或“具体用途”之一，例如结构是“缺点竟是… / 到底值不值 / 小机身大… / 对比怎么选 / …拍摄指南”；例子只说明结构，绝不照抄或捏造事实。
4. 不要使用“实测分享、使用体验、很不错、很到位、值得买、闭眼入、全能神器”等空泛套话；不要擅自把未确认的品牌或型号写入标题。
5. 图片中能确认的产品身份、使用关系和真实细节只能辅助理解，不能原样搬入商品外部已有的营销文案。

严格只返回 JSON：{"title":"7-12个纯中文字符"}`;

    const urls = (body.imageUrls || []).slice(0, 1);
    if (!urls.length) return jsonResponse({ success: false, error: '标题改写需要商品图片' }, 400);
    const images = await Promise.all(urls.map((url) => convertToStandardJpegDataUrl(url, { maxDimension: 1024, quality: 85 })));
    if (images.some((url) => !url)) return jsonResponse({ success: false, error: '商品图片读取失败，未调用标题模型' }, 400);
    const content = [{ type: 'text', text: prompt }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))];

    const model = String(body.model || 'gemini-3.7-flash').trim() || 'gemini-3.7-flash';
    const response = await gatewayFetch(`${normalizeGatewayBaseUrl(baseUrl)}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content }],
        temperature: 0.35,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) throw new Error(`标题改写模型 ${model} 返回 HTTP ${response.status}`);
    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) throw new Error(`标题改写模型 ${model} 没有返回内容`);
    let parsedTitle: unknown;
    try {
      parsedTitle = JSON.parse(raw).title;
    } catch {
      throw new SyntaxError('标题改写模型没有返回合法 JSON');
    }
    const title = normalizeTitle(parsedTitle);
    if (!/^[\u3400-\u9fff]{7,12}$/.test(title)) {
      throw new HeadlineContractError('标题改写模型未返回 7–12 字的有效主标题，未截断或提交后续任务');
    }
    return jsonResponse({ success: true, data: { title }, model });
  } catch (error) {
    return jsonResponse({ success: false, error: formatUserError(error, '标题改写失败') }, headlineErrorHttpStatus(error));
  }
}
