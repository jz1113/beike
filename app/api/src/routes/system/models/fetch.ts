import { jsonResponse } from '../../../core/http';
import { inferWorkflowCapabilitiesFromId } from '@beike/shared/workflowModels';
// 官方旗舰推荐内置兜底模型库 (保证弱网/网关超时下系统永不卡死)
const FALLBACK_FLAGSHIP_MODELS = [
  // 1. 多模态与视觉分析大模型
  {
    id: 'gemini-3.1-pro-preview-thinking-high',
    name: 'Gemini 3.1 Pro (深度思考)',
    shortName: 'Gemini 3.1 Pro',
    category: 'text',
    isVision: true,
    isMultimodal: true,
    isThinking: true,
    isImage: false,
    isVideo: false,
    provider: 'Google',
    owned_by: 'google'
  },
  {
    id: 'gemini-3.1-flash-image-preview-4k',
    name: 'Gemini 3.1 Flash Image (4K)',
    shortName: 'Gemini 3.1 Flash',
    category: 'image',
    isVision: false,
    isMultimodal: false,
    isThinking: false,
    isImage: true,
    isVideo: false,
    provider: 'Google',
    owned_by: 'google'
  },
  {
    id: 'claude-3-7-sonnet',
    name: 'Claude 3.7 Sonnet (Thinking)',
    shortName: 'Claude 3.7',
    category: 'text',
    isVision: true,
    isMultimodal: true,
    isThinking: true,
    isImage: false,
    isVideo: false,
    provider: 'Anthropic',
    owned_by: 'anthropic'
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet (旗舰视觉)',
    shortName: 'Claude 3.5',
    category: 'text',
    isVision: true,
    isMultimodal: true,
    isThinking: false,
    isImage: false,
    isVideo: false,
    provider: 'Anthropic',
    owned_by: 'anthropic'
  },
  {
    id: 'gpt-5.5-pro',
    name: 'GPT 5.5 Pro (超全能旗舰)',
    shortName: 'GPT 5.5 Pro',
    category: 'text',
    isVision: true,
    isMultimodal: true,
    isThinking: true,
    isImage: false,
    isVideo: false,
    provider: 'OpenAI',
    owned_by: 'openai'
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o (全模态旗舰)',
    shortName: 'GPT-4o',
    category: 'text',
    isVision: true,
    isMultimodal: true,
    isThinking: false,
    isImage: false,
    isVideo: false,
    provider: 'OpenAI',
    owned_by: 'openai'
  },
  {
    id: 'grok-4.6',
    name: 'Grok 4.6 (反AI纪实视觉)',
    shortName: 'Grok 4.6',
    category: 'text',
    isVision: true,
    isMultimodal: true,
    isThinking: false,
    isImage: false,
    isVideo: false,
    provider: 'xAI',
    owned_by: 'xai'
  },
  {
    id: 'deepseek-r1',
    name: 'DeepSeek R1 (深度思考)',
    shortName: 'DeepSeek R1',
    category: 'text',
    isVision: true,
    isMultimodal: true,
    isThinking: true,
    isImage: false,
    isVideo: false,
    provider: 'DeepSeek',
    owned_by: 'deepseek'
  },
  {
    id: 'qwen2.5-vl-72b-instruct',
    name: '通义千问 Qwen2.5 VL 72B',
    shortName: 'Qwen2.5 VL',
    category: 'text',
    isVision: true,
    isMultimodal: true,
    isThinking: false,
    isImage: false,
    isVideo: false,
    provider: 'Alibaba',
    owned_by: 'alibaba'
  },

  // 2. 商业图片生成大模型
  {
    id: 'doubao-seedream-5-0-260128',
    name: 'Seedream 5.0 官 (4K商业级生图)',
    shortName: 'Seedream 5.0',
    category: 'image',
    isVision: false,
    isMultimodal: false,
    isImage: true,
    isVideo: false,
    provider: '字节跳动',
    owned_by: 'bytedance'
  },
  {
    id: 'seedream-3.0',
    name: 'Seedream 3.0 (高保真真实质感)',
    shortName: 'Seedream 3.0',
    category: 'image',
    isVision: false,
    isMultimodal: false,
    isImage: true,
    isVideo: false,
    provider: '字节跳动',
    owned_by: 'bytedance'
  },
  {
    id: 'flux-pro',
    name: 'Flux Pro (商业级电影光影)',
    shortName: 'Flux Pro',
    category: 'image',
    isVision: false,
    isMultimodal: false,
    isImage: true,
    isVideo: false,
    provider: 'Black Forest',
    owned_by: 'bfl'
  },
  {
    id: 'flux-realism',
    name: 'Flux Realism (单反实拍纪实质感)',
    shortName: 'Flux Realism',
    category: 'image',
    isVision: false,
    isMultimodal: false,
    isImage: true,
    isVideo: false,
    provider: 'Black Forest',
    owned_by: 'bfl'
  },
  {
    id: 'midjourney-v6',
    name: 'Midjourney v6.1 (顶级构图与质感)',
    shortName: 'Midjourney',
    category: 'image',
    isVision: false,
    isMultimodal: false,
    isImage: true,
    isVideo: false,
    provider: 'Midjourney',
    owned_by: 'midjourney'
  },
  {
    id: 'gpt-image-2',
    name: 'GPT Image 2',
    shortName: 'GPT Image 2',
    category: 'image',
    isVision: false,
    isMultimodal: false,
    isImage: true,
    isVideo: false,
    provider: 'OpenAI',
    owned_by: 'openai'
  },
  {
    id: 'grok-imagine-image-2.0',
    name: 'Grok 4.1 Image (自然真实光影)',
    shortName: 'Grok Image',
    category: 'image',
    isVision: false,
    isMultimodal: false,
    isImage: true,
    isVideo: false,
    provider: 'xAI',
    owned_by: 'xai'
  },
  {
    id: 'dall-e-3',
    name: 'DALL·E 3 (语义精准还原)',
    shortName: 'DALL-E 3',
    category: 'image',
    isVision: false,
    isMultimodal: false,
    isImage: true,
    isVideo: false,
    provider: 'OpenAI',
    owned_by: 'openai'
  },

  // 3. 视频生成与动画大模型
  {
    id: 'seedance-2.0',
    name: 'Seedance 2.0 (字节商业级生视频)',
    shortName: 'Seedance 2.0',
    category: 'video',
    isVision: false,
    isMultimodal: false,
    isImage: false,
    isVideo: true,
    provider: '字节跳动',
    owned_by: 'bytedance'
  },
  {
    id: 'kling-v1.5',
    name: '快手可灵 Kling 1.5 Pro',
    shortName: 'Kling 1.5',
    category: 'video',
    isVision: false,
    isMultimodal: false,
    isImage: false,
    isVideo: true,
    provider: 'Kuaishou',
    owned_by: 'kuaishou'
  },
  {
    id: 'veo-2.0',
    name: 'Google VEO 2.0 (4K 电影级运镜)',
    shortName: 'VEO 2.0',
    category: 'video',
    isVision: false,
    isMultimodal: false,
    isImage: false,
    isVideo: true,
    provider: 'Google',
    owned_by: 'google'
  },
  {
    id: 'sora-turbo',
    name: 'OpenAI Sora Turbo (物理真实世界模拟)',
    shortName: 'Sora Turbo',
    category: 'video',
    isVision: false,
    isMultimodal: false,
    isImage: false,
    isVideo: true,
    provider: 'OpenAI',
    owned_by: 'openai'
  },
  {
    id: 'luma-dream-machine',
    name: 'Luma Dream Machine 1.5',
    shortName: 'Luma',
    category: 'video',
    isVision: false,
    isMultimodal: false,
    isImage: false,
    isVideo: true,
    provider: 'Luma AI',
    owned_by: 'luma'
  },
  {
    id: 'runway-gen3-alpha',
    name: 'Runway Gen-3 Alpha (专业运镜)',
    shortName: 'Runway Gen-3',
    category: 'video',
    isVision: false,
    isMultimodal: false,
    isImage: false,
    isVideo: true,
    provider: 'Runway',
    owned_by: 'runway'
  },
  {
    id: 'hailuo-minimax',
    name: 'MiniMax 海螺视频 2.0',
    shortName: '海螺视频',
    category: 'video',
    isVision: false,
    isMultimodal: false,
    isImage: false,
    isVideo: true,
    provider: 'MiniMax',
    owned_by: 'minimax'
  }
];

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { baseUrl, apiKey, isPing } = body;

    const rawUrl = (
      baseUrl ||
      req.headers.get('x-custom-base-url') ||
      process.env.AI_DRAWING_BASE_URL ||
      process.env.AI_BASE_URL ||
      'https://ai.comfly.org'
    );
    const targetUrl = String(rawUrl).trim().replace(/\/+$/, '').replace(/\/v1$/i, '');

    const targetKey = (
      apiKey ||
      req.headers.get('x-custom-api-key') ||
      process.env.AI_DRAWING_API_KEY ||
      process.env.AI_API_KEY ||
      ''
    ).trim();

    if (!targetKey) {
      // 未填入 Key 时秒级返回内置全套旗舰模型库，让用户依然可以直接选用
      return jsonResponse({
        success: isPing ? false : true,
        count: FALLBACK_FLAGSHIP_MODELS.length,
        models: FALLBACK_FLAGSHIP_MODELS,
        isFallback: true,
        error: isPing ? '请先填写 API Key' : undefined,
        warning: '未检测到自定义 API Key，已自动载入官方精选推荐模型库'
      });
    }

    const endpoint = `${targetUrl}/v1/models`;
    
    // 超时时间：测速 Ping 15 秒快速反馈，常规拉取 40 秒
    const controller = new AbortController();
    const timeoutMs = isPing ? 15000 : 40000;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let rawList: any[] = [];
    let gatewayStatus = 0;
    let gatewayErrorMsg = '';

    try {
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${targetKey}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeout);
      gatewayStatus = res.status;

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        rawList = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : (Array.isArray(data) ? data : []));
      } else {
        const errJson = await res.json().catch(() => ({}));
        gatewayErrorMsg = errJson?.error?.message || errJson?.message || `HTTP ${res.status}`;
        console.warn(`网关返回状态码 ${res.status} (${gatewayErrorMsg})，准备启动高可用精选模型兜底`);
      }
    } catch (networkErr: any) {
      gatewayErrorMsg = networkErr.name === 'AbortError' ? '请求网关超时' : (networkErr.message || '网络连接失败');
      console.warn('远程网关拉取失败或超时，自动启用高可用精选模型兜底:', gatewayErrorMsg);
    }

    // 若远程网关拉取成功且有模型数据
    if (rawList.length > 0) {
      const parsedModels = rawList.map((item: any) => {
        const id = typeof item === 'string' ? item : (item.id || item.name || '');
        const lower = id.toLowerCase();
        const caps = inferWorkflowCapabilitiesFromId(id);

        let category: 'image' | 'video' | 'audio' | 'embedding' | 'text' = 'text';
        if (caps.isImage) category = 'image';
        else if (caps.isVideo) category = 'video';
        else if (caps.isAudio) category = 'audio';
        else if (caps.isEmbedding) category = 'embedding';

        let name = id;
        if (lower === 'gemini-3.1-pro-preview-thinking-high') name = 'Gemini 3.1 Pro (深度思考)';
        else if (lower === 'gemini-3.1-flash-image-preview-4k') name = 'Gemini 3.1 Flash Image';
        else if (lower === 'grok-4.6') name = 'Grok 4.6 (反AI纪实)';
        else if (lower === 'grok-imagine-image-2.0') name = 'Grok 4.1 Image';
        else if (lower === 'gpt-5.5-pro') name = 'GPT 5.5 Pro';
        else if (lower === 'gpt-image-2') name = 'GPT Image 2';
        else if (lower === 'gpt-image-2-4k') name = 'GPT Image 2 4K (专线)';
        else if (lower === 'gpt-image-2-2k') name = 'GPT Image 2 2K';
        else if (lower === 'doubao-seedream-5-0-260128') name = 'Seedream 5.0 官';
        else if (lower === 'seedream-3.0') name = 'Seedream 3.0 (字节跳动)';
        else if (lower === 'flux-pro') name = 'Flux Pro (商业级光影)';
        else if (lower === 'flux-realism') name = 'Flux Realism (真实质感)';
        else if (lower === 'midjourney-v6') name = 'Midjourney v6.1';
        else if (lower === 'claude-3-7-sonnet') name = 'Claude 3.7 Sonnet';

        return {
          id,
          name,
          shortName: name.split(' ')[0],
          category,
          isMultimodal: caps.isMultimodal,
          isVision: caps.isVision,
          isThinking: caps.isThinking,
          isImage: caps.isImage,
          isVideo: caps.isVideo,
          isAudio: caps.isAudio,
          isEmbedding: caps.isEmbedding,
          owned_by: item.owned_by || 'system',
          isCustom: false
        };
      }).filter((m: any) => m.id);

      return jsonResponse({
        success: true,
        gatewayStatus: 200,
        count: parsedModels.length,
        models: parsedModels
      });
    }

    if (isPing) {
      if (gatewayStatus === 401 || gatewayStatus === 403) {
        return jsonResponse(
          {
            success: false,
            gatewayStatus,
            error: `API Key 认证失败 (${gatewayStatus}): ${gatewayErrorMsg || '密钥无效或未授权'}`,
            isFallback: true,
            models: FALLBACK_FLAGSHIP_MODELS,
          },
          401,
        );
      }
      return jsonResponse({
        success: false,
        gatewayStatus: gatewayStatus || 504,
        error: `无法访问 API 网关 (${gatewayStatus || 504}): ${gatewayErrorMsg || '连接超时或服务不可用'}`,
        isFallback: true,
        models: FALLBACK_FLAGSHIP_MODELS,
      });
    }

    // 🌟 兜底：若网络拉取超时或接口失败，秒级返回官方全套旗舰模型库，绝不阻塞用户工作流
    return jsonResponse({
      success: true,
      gatewayStatus: gatewayStatus || 504,
      count: FALLBACK_FLAGSHIP_MODELS.length,
      models: FALLBACK_FLAGSHIP_MODELS,
      isFallback: true,
      warning: gatewayErrorMsg
        ? `远端网关暂时不可用 (${gatewayErrorMsg})，已自动载入官方精选推荐模型库`
        : '已自动为您载入官方精选旗舰模型库（生图/生视频/多模态），可直接勾选启用',
    });
  } catch (err: any) {
    // 即使出现未知异常，依然返回精选模型库保障可用性
    return jsonResponse({
      success: true,
      count: FALLBACK_FLAGSHIP_MODELS.length,
      models: FALLBACK_FLAGSHIP_MODELS,
      isFallback: true,
      warning: '已自动为您载入官方精选旗舰模型库',
    });
  }
}
