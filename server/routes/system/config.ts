import { jsonResponse } from '../../adapters/http';
import { VISION_MODELS } from '@/lib/vision';
import { IMAGE_GEN_MODELS } from '@/lib/drawing';

// 获取系统当前模型与接口配置（密钥只返回是否已配置，不泄露明文/前后缀）
export async function GET() {
  const baseUrl = process.env.AI_DRAWING_BASE_URL || 'https://ai.comfly.org';
  const apiKey = process.env.AI_DRAWING_API_KEY || '';
  const wanbangKey = process.env.WANBANG_API_KEY || '';
  const wanbangSecret = process.env.WANBANG_API_SECRET || '';
  const externalScraperId = process.env.EXTERNAL_SCRAPER_ID || '';
  const externalScraperSecret = process.env.EXTERNAL_SCRAPER_SECRET || '';

  return jsonResponse({
    success: true,
    config: {
      baseUrl,
      hasApiKey: Boolean(apiKey),
      maskedKey: apiKey ? '已配置' : '未配置',
      hasWanbangKey: Boolean(wanbangKey),
      wanbangKey: wanbangKey ? '已配置' : '未配置',
      wanbangSecret: wanbangSecret ? '已配置' : '',
      maskedWanbangKey: wanbangKey ? '已配置' : '未配置',
      wanbangHost: 'https://api-gw.onebound.cn',
      hasExternalScraper: Boolean(externalScraperId && externalScraperSecret),
      externalScraperId: '',
      externalScraperSecret: externalScraperSecret ? '已配置' : '未配置',
      maskedScraperSecret: externalScraperSecret ? '已配置' : '未配置',
      externalScraperHost: 'https://apia.vip/api/dsp/',
      defaultVisionModel: 'gemini-3.1-pro-preview-thinking-high',
      defaultImageModel: 'gpt-image-2',
      visionModels: VISION_MODELS,
      imageModels: IMAGE_GEN_MODELS,
      fallbackChain: [] // 分析回退由客户端传入用户可见模型列表，不再使用服务端硬编码链
    }
  });
}

// 测试特定模型 / 万邦采集 / 社媒解析接口连通性与响应速度
export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const body = await req.json();
    const { 
      type = 'ai',
      baseUrl = process.env.AI_DRAWING_BASE_URL || 'https://ai.comfly.org', 
      apiKey = process.env.AI_DRAWING_API_KEY, 
      model = 'gemini-3.1-pro-preview-thinking-high',
      wanbangKey = process.env.WANBANG_API_KEY,
      wanbangSecret = process.env.WANBANG_API_SECRET,
      externalScraperId = process.env.EXTERNAL_SCRAPER_ID,
      externalScraperSecret = process.env.EXTERNAL_SCRAPER_SECRET
    } = body;

    // 1. 测试社媒/短视频无水印解析接口 (apia.vip)
    if (type === 'external_scraper') {
      const clientId = externalScraperId || process.env.EXTERNAL_SCRAPER_ID || '';
      const clientSecretKey = externalScraperSecret || process.env.EXTERNAL_SCRAPER_SECRET || '';
      
      if (!clientId || !clientSecretKey) {
        return jsonResponse({ error: '缺少社媒解析接口 ID 或 密钥' }, 400);
      }

      const testUrl = `https://apia.vip/api/dsp/${clientSecretKey}/${clientId}/?url=https%3A%2F%2Fwww.douyin.com`;
      const res = await fetch(testUrl, { signal: AbortSignal.timeout(10000) });
      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        return jsonResponse({
          success: false,
          error: `社媒解析网关响应 HTTP ${res.status}`,
          latencyMs
        }, 400);
      }

      const data = await res.json();
      if (data?.code === 155 || data?.code === '155') {
        return jsonResponse({
          success: false,
          error: `接口密钥或ID错误 [155]: 请检查密钥配置`,
          latencyMs
        }, 400);
      }

      return jsonResponse({
        success: true,
        type: 'external_scraper',
        latencyMs,
        message: `社媒图集解析接口 (apia.vip) 连通正常！响应延迟 ${latencyMs}ms`
      });
    }

    // 2. 测试万邦电商采集接口
    if (type === 'wanbang') {
      const key = wanbangKey || process.env.WANBANG_API_KEY;
      const secret = wanbangSecret || process.env.WANBANG_API_SECRET;
      if (!key || !secret) {
        return jsonResponse({ error: '缺少万邦 API Key 或 Secret' }, 400);
      }

      // 测试候选端点 (优先测试快速的淘宝接口，失败则测试京东接口)
      const testEndpoints = [
        `https://api-gw.onebound.cn/taobao/item_get/?key=${key}&secret=${secret}&num_iid=520813250866&cache=yes&is_promotion=1`,
        `https://api-gw.onebound.cn/jd/item_get_pro/?key=${key}&secret=${secret}&num_iid=10057467958584&cache=yes&watermark=1`
      ];

      let lastError = '';
      let testData: any = null;

      for (const endpoint of testEndpoints) {
        try {
          const res = await fetch(endpoint, { 
            signal: AbortSignal.timeout(12000),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
            }
          });
          if (res.ok) {
            const data = await res.json();
            testData = data;
            // 如果账号鉴权通过 (无论是 0000 成功，还是含有有效 api_info 配额信息)
            if (data.api_info || data.error_code === '0000') {
              break;
            }
            if (data.error_code === '4005' || data.error_code === '1001' || data.error_code === '4001') {
              lastError = `万邦接口鉴权失败 [${data.error_code}]: ${data.reason || data.error}`;
              break;
            }
          }
        } catch (e: any) {
          lastError = e.message;
        }
      }

      const latencyMs = Date.now() - startTime;

      if (!testData || (testData.error_code && ['4005', '1001', '4001', '4003'].includes(testData.error_code))) {
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
        const expiresMatch = testData.api_info.match(/expires:([\d\-]+)/);
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

    const isImageModel = model.includes('image') || model.includes('seedream') || model.includes('imagine') || model.includes('flux') || model.includes('midjourney');

    let testRes: Response;
    if (isImageModel) {
      // 测试生图模型端点
      testRes = await fetch(`${baseUrl}/v1/images/generations?async=true`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model,
          prompt: 'A test ping for ping check',
          size: '1024x1024'
        })
      });
    } else {
      // 测试视觉/文本大模型端点
      testRes = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
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
      const { humanizeUpstreamError } = await import('@/lib/upstreamErrors');
      return jsonResponse({
        success: false,
        status: testRes.status,
        error: humanizeUpstreamError(`接口响应异常: ${errText.slice(0, 300)}`),
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
      error: error.message || '网络连接超时或地址不可达',
      latencyMs
    }, 500);
  }
}
