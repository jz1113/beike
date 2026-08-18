import { NextResponse } from 'next/server';
import { VISION_MODELS } from '@/lib/vision';
import { IMAGE_GEN_MODELS } from '@/lib/drawing';

// 获取系统当前模型与接口配置
export async function GET() {
  const baseUrl = process.env.AI_DRAWING_BASE_URL || 'https://ai.comfly.org';
  const apiKey = process.env.AI_DRAWING_API_KEY || '';
  const maskedKey = apiKey ? `${apiKey.slice(0, 7)}...${apiKey.slice(-6)}` : '未配置';

  const wanbangKey = process.env.WANBANG_API_KEY || '';
  const wanbangSecret = process.env.WANBANG_API_SECRET || '';
  const maskedWanbangKey = wanbangKey ? `${wanbangKey.slice(0, 4)}...${wanbangKey.slice(-4)}` : '未配置';

  const externalScraperId = process.env.EXTERNAL_SCRAPER_ID || '202037331';
  const externalScraperSecret = process.env.EXTERNAL_SCRAPER_SECRET || '32843381450B00510784B97CBD53A7CDCD70844F87652F97FE';
  const maskedScraperSecret = externalScraperSecret ? `${externalScraperSecret.slice(0, 6)}...${externalScraperSecret.slice(-6)}` : '未配置';

  return NextResponse.json({
    success: true,
    config: {
      baseUrl,
      apiKey: apiKey,
      maskedKey,
      wanbangKey,
      wanbangSecret,
      maskedWanbangKey,
      wanbangHost: 'https://api-gw.onebound.cn',
      externalScraperId,
      externalScraperSecret,
      maskedScraperSecret,
      externalScraperHost: 'https://apia.vip/api/dsp/',
      defaultVisionModel: 'gemini-3.1-pro-preview-thinking-high',
      defaultImageModel: 'gpt-image-2',
      visionModels: VISION_MODELS,
      imageModels: IMAGE_GEN_MODELS,
      fallbackChain: [
        'gemini-3.1-pro-preview-thinking-high',
        'grok-4.6',
        'gpt-5.5-pro'
      ]
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
      const clientId = externalScraperId || process.env.EXTERNAL_SCRAPER_ID || '202037331';
      const clientSecretKey = externalScraperSecret || process.env.EXTERNAL_SCRAPER_SECRET || '32843381450B00510784B97CBD53A7CDCD70844F87652F97FE';
      
      if (!clientId || !clientSecretKey) {
        return NextResponse.json({ error: '缺少社媒解析接口 ID 或 密钥' }, { status: 400 });
      }

      const testUrl = `https://apia.vip/api/dsp/${clientSecretKey}/${clientId}/?url=https%3A%2F%2Fwww.douyin.com`;
      const res = await fetch(testUrl, { signal: AbortSignal.timeout(10000) });
      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        return NextResponse.json({
          success: false,
          error: `社媒解析网关响应 HTTP ${res.status}`,
          latencyMs
        }, { status: 400 });
      }

      const data = await res.json();
      if (data?.code === 155 || data?.code === '155') {
        return NextResponse.json({
          success: false,
          error: `接口密钥或ID错误 [155]: 请检查密钥配置`,
          latencyMs
        }, { status: 400 });
      }

      return NextResponse.json({
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
        return NextResponse.json({ error: '缺少万邦 API Key 或 Secret' }, { status: 400 });
      }

      const testUrl = `https://api-gw.onebound.cn/jd/item_get_pro/?key=${key}&secret=${secret}&num_iid=100012043978&cache=yes`;
      const res = await fetch(testUrl, { signal: AbortSignal.timeout(15000) });
      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        return NextResponse.json({
          success: false,
          error: `万邦网关响应 HTTP ${res.status}`,
          latencyMs
        }, { status: 400 });
      }

      const data = await res.json();
      if (data?.error_code && data.error_code !== "0000") {
        return NextResponse.json({
          success: false,
          error: `万邦接口错误 [${data.error_code}]: ${data.reason || data.error}`,
          latencyMs
        }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        type: 'wanbang',
        latencyMs,
        message: `万邦电商采集服务连通正常！响应延迟 ${latencyMs}ms`
      });
    }

    // 2. 测试 AI 模型接口
    if (!apiKey) {
      return NextResponse.json({ error: '缺少 AI API Key' }, { status: 400 });
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
      return NextResponse.json({
        success: false,
        status: testRes.status,
        error: `接口响应异常: ${errText.slice(0, 150)}`,
        latencyMs
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      model,
      latencyMs,
      message: `AI 接口连通正常！响应延迟 ${latencyMs}ms`
    });

  } catch (error: any) {
    const latencyMs = Date.now() - startTime;
    return NextResponse.json({
      success: false,
      error: error.message || '网络连接超时或地址不可达',
      latencyMs
    }, { status: 500 });
  }
}
