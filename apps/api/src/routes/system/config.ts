import { gatewayFetch } from '../../gateways/http';
import { readJsonBody } from '../../core/validate';
import { isKnownImageOnlyModel, isKnownVideoOnlyModel } from '@beike/domain/workflowModels';
import { checkMediaModelConnection } from '../../services/modelConnection';
import { jsonResponse } from '../../core/http';
import { VISION_MODELS } from '@beike/domain/vision';
import { IMAGE_GEN_MODELS } from '@beike/domain/drawing';
import { DEFAULT_IMAGE_MODEL_ID, DEFAULT_MULTIMODAL_MODEL_ID } from '@beike/domain/modelCatalog';
import { formatUserError } from '@beike/domain/upstreamErrors';
import { normalizeGatewayBaseUrl } from '../../services/gatewayCredentials';
import { testApiaConnection } from '@beike/server-kit/apiaScraper';
import { testQiyunConnection } from '@beike/server-kit/qiyunScraper';
import { parseWanbangResponse, withWanbangCredentials } from '../../gateways/wanbang';

// 获取系统当前模型与接口配置（密钥只返回是否已配置，不泄露明文/前后缀）
export async function GET() {
  const baseUrl = process.env.AI_DRAWING_BASE_URL || 'https://ai.comfly.org';
  const apiKey = process.env.AI_DRAWING_API_KEY || '';
  const normalizedBaseUrl = normalizeGatewayBaseUrl(baseUrl) || baseUrl;
  const wanbangKey = process.env.WANBANG_API_KEY || '';
  const wanbangSecret = process.env.WANBANG_API_SECRET || '';
  const externalScraperId = process.env.EXTERNAL_SCRAPER_ID || '';
  const externalScraperSecret = process.env.EXTERNAL_SCRAPER_SECRET || '';
  const qiyunAppId = process.env.QIYUN_APP_ID || '';
  const qiyunAppKey = process.env.QIYUN_APP_KEY || '';

  // ⚠️ 安全：响应中**禁止**返回 wanbangSecret 字段名，即便是"已配置"也会泄露
  // 字段存在性。仅返回布尔状态。
  return jsonResponse({
    success: true,
    config: {
      baseUrl,
      normalizedBaseUrl,
      hasApiKey: Boolean(apiKey),
      maskedKey: apiKey ? '已配置' : '未配置',
      hasWanbangKey: Boolean(wanbangKey),
      wanbangSecretConfigured: Boolean(wanbangSecret),
      wanbangHost: 'https://api-gw.onebound.cn',
      hasExternalScraper: Boolean(externalScraperId && externalScraperSecret),
      externalScraperSecretConfigured: Boolean(externalScraperSecret),
      externalScraperHost: 'https://apia.vip/api/dsp/',
      hasQiyun: Boolean(qiyunAppId && qiyunAppKey),
      qiyunAppKeyConfigured: Boolean(qiyunAppKey),
      qiyunHost: 'https://qyapi.ipaybuy.cn/api/video',
      defaultVisionModel: DEFAULT_MULTIMODAL_MODEL_ID,
      defaultImageModel: DEFAULT_IMAGE_MODEL_ID,
      visionModels: VISION_MODELS,
      imageModels: IMAGE_GEN_MODELS,
      fallbackChain: []
    }
  });
}

// 测试特定模型 / 万邦采集 / 社媒解析接口连通性与响应速度
export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const body = await readJsonBody(req);
    const { 
      type = 'ai',
      baseUrl = process.env.AI_DRAWING_BASE_URL || 'https://ai.comfly.org', 
      apiKey = process.env.AI_DRAWING_API_KEY, 
      model = DEFAULT_MULTIMODAL_MODEL_ID,
      wanbangKey = process.env.WANBANG_API_KEY,
      wanbangSecret = process.env.WANBANG_API_SECRET,
      externalScraperId = process.env.EXTERNAL_SCRAPER_ID,
      externalScraperSecret = process.env.EXTERNAL_SCRAPER_SECRET,
      qiyunAppId = process.env.QIYUN_APP_ID,
      qiyunAppKey = process.env.QIYUN_APP_KEY,
    } = body;
    const normalizedBaseUrl = normalizeGatewayBaseUrl(baseUrl);

    // 1.1 测试奇云短视频/图集去水印接口
    if (type === 'qiyun') {
      const appId = (qiyunAppId || '').trim();
      const appKey = (qiyunAppKey || '').trim();

      if (!appId || !appKey) {
        return jsonResponse({ error: '请先在输入框中填入奇云 AppId 与 AppKey 后再测试' }, 400);
      }

      const testUrl =
        typeof body.testUrl === 'string' && body.testUrl.trim()
          ? body.testUrl.trim()
          : 'https://v.douyin.com/iLrqc12/';

      const result = await testQiyunConnection({ appId, appKey }, testUrl);
      const latencyMs = Date.now() - startTime;

      if (!result.success) {
        return jsonResponse(
          {
            success: false,
            error: result.message,
            latencyMs,
            upstreamCode: result.upstreamCode,
          },
          400,
        );
      }

      return jsonResponse({
        success: true,
        type: 'qiyun',
        latencyMs,
        message: result.message,
        upstreamCode: result.upstreamCode,
      });
    }

    // 1.2 测试社媒/短视频无水印解析接口 (apia.vip)
    if (type === 'external_scraper') {
      const clientId = (externalScraperId || '').trim();
      const clientSecretKey = (externalScraperSecret || '').trim();

      if (!clientId || !clientSecretKey) {
        return jsonResponse({ error: '请先在输入框中填入社媒解析 ID 与 API Secret 后再测试' }, 400);
      }

      const testNoteUrl =
        typeof body.testUrl === 'string' && body.testUrl.trim()
          ? body.testUrl.trim()
          : 'https://www.xiaohongshu.com/explore/661234567890abcdef123456';

      const result = await testApiaConnection(
        { clientId, secretKey: clientSecretKey },
        testNoteUrl,
      );
      const latencyMs = Date.now() - startTime;

      if (!result.authOk) {
        return jsonResponse(
          {
            success: false,
            error: result.message,
            latencyMs,
            upstreamCode: result.upstreamCode,
            authOk: false,
            parseOk: false,
          },
          400,
        );
      }

      return jsonResponse({
        success: true,
        type: 'external_scraper',
        latencyMs,
        authOk: result.authOk,
        parseOk: result.parseOk,
        upstreamCode: result.upstreamCode,
        message: result.message,
      });
    }

    // 2. 测试万邦电商采集接口
    if (type === 'wanbang') {
      const key = (
        req.headers.get('x-wanbang-key') ||
        body.wanbangKey ||
        ''
      ).trim();
      const secret = (
        req.headers.get('x-wanbang-secret') ||
        body.wanbangSecret ||
        ''
      ).trim();
      if (!key || !secret) {
        return jsonResponse({ error: '请先在输入框中填入万邦 API Key 与 API Secret 后再测试' }, 400);
      }

      // 测试候选端点 (优先测试快速的淘宝接口，失败则测试京东接口)。
      // 万邦网关按其公开协议从 query 参数读取 key/secret；请求只在服务端发起且不会写入日志。
      const testEndpoints = [
        `https://api-gw.onebound.cn/taobao/item_get/?num_iid=520813250866&cache=yes&is_promotion=1`,
        `https://api-gw.onebound.cn/jd/item_get_pro/?num_iid=10057467958584&cache=yes&watermark=1`,
      ];

      let lastError = '';
      let testData: any = null;

      for (const endpoint of testEndpoints) {
        try {
          const res = await gatewayFetch(withWanbangCredentials(endpoint, key, secret), {
            signal: AbortSignal.timeout(12000),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            },
          });
          if (!res.ok) {
            lastError = `万邦网关请求失败（HTTP ${res.status}）`;
            continue;
          }

          const data = await parseWanbangResponse(res);
          // 明确的鉴权错误不再尝试下一个商品端点，避免掩盖凭证问题。
          if (data.error_code === '4005' || data.error_code === '1001' || data.error_code === '4001') {
            lastError = `万邦接口鉴权失败 [${data.error_code}]: ${data.reason || data.error || '请检查 Key 与 Secret'}`;
            break;
          }
          if (data.error_code && data.error_code !== '0000') {
            lastError = `万邦接口返回异常 [${data.error_code}]: ${data.reason || data.error || '未知错误'}`;
            continue;
          }

          testData = data;
          break;
        } catch (e: unknown) {
          lastError = e instanceof Error ? e.message : '万邦网关请求失败';
        }
      }

      const latencyMs = Date.now() - startTime;

      if (!testData) {
        return jsonResponse({
          success: false,
          error: lastError || (testData?.reason || testData?.error || '万邦网关响应异常，请检查 Key 与 Secret'),
          latencyMs
        }, 400);
      }

      // 解析万邦账号配额信息
      let quotaStr = '';
      if (typeof testData.api_info === 'string') {
        const todayMatch = testData.api_info.match(/today:(\d+)/);
        const maxMatch = testData.api_info.match(/max:(\d+)/);
        const expiresMatch = testData.api_info.match(/expires:([\d-]+)/);
        const todayCount = todayMatch ? todayMatch[1] : '';
        const maxQuota = maxMatch ? maxMatch[1] : '';
        const expiresDate = expiresMatch ? expiresMatch[1] : '';

        if (maxQuota) {
          quotaStr = ` (今日调用: ${todayCount || '0'} / 每日上限: ${maxQuota}${expiresDate ? ` / 到期日: ${expiresDate}` : ''})`;
        }
      }

      return jsonResponse({
        success: true,
        type: 'wanbang',
        latencyMs,
        quotaInfo: quotaStr,
        message: `万邦电商采集接口连通正常！响应延迟 ${latencyMs}ms${quotaStr}`
      });
    }

    // 2. 测试 AI 模型接口
    if (!apiKey) {
      return jsonResponse({ error: '缺少 AI API Key' }, 400);
    }

    const isMediaModel = isKnownImageOnlyModel(model) || isKnownVideoOnlyModel(model);
    let testRes: Response;
    if (isMediaModel) {
      const result = await checkMediaModelConnection(normalizedBaseUrl, apiKey, model);
      return jsonResponse({ ...result, latencyMs: Date.now() - startTime }, result.success ? 200 : 400);
    } else {
      // 测试视觉/文本大模型端点
      testRes = await gatewayFetch(`${normalizedBaseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        signal: AbortSignal.timeout(12_000),
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'user', content: 'Ping. Reply "PONG" only.' }
          ],
          max_tokens: 10
        })
      });
    }

    const latencyMs = Date.now() - startTime;

    if (!testRes.ok) {
      const errText = await testRes.text();
      return jsonResponse({
        success: false,
        status: testRes.status,
        error: formatUserError(`接口响应异常: ${errText.slice(0, 300)}`),
        latencyMs
      }, 400);
    }

    return jsonResponse({
      success: true,
      model,
      latencyMs,
      message: `AI 接口连通正常！响应延迟 ${latencyMs}ms`
    });

  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    return jsonResponse({
      success: false,
      error: formatUserError(error, '网络连接超时或地址不可达'),
      latencyMs
    }, 500);
  }
}
