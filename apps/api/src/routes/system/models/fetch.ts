import { fetchDeepSeekCatalog } from './deepseekCatalog';
import { gatewayFetch } from '../../../gateways/http';
import { readJsonBody } from '../../../core/validate';
import { jsonResponse } from '../../../core/http';
import { getDefaultApiKey, getDefaultBaseUrl, LIANCHI_IMAGE_BASE_URL } from '../../../services/gatewayCredentials';
import { inferWorkflowCapabilitiesFromId } from '@beike/domain/workflowModels';
import {
  approvedModelDisplayName,
  filterApprovedModels,
  getApprovedModel,
} from '@beike/domain/modelCatalog';
import { FALLBACK_FLAGSHIP_MODELS } from './fallbackModels';
import { allowClientCustomBaseUrl, isPublicHttpGatewayIpUrl, isSafeCustomGatewayBaseUrl } from '@beike/domain/gatewayCreds';

function parseDiscoveredModels(rawList: unknown[]) {
  const parsed = rawList.map((item: any) => {
    const rawId = typeof item === 'string' ? item : (item.id || item.name || '');
    const approved = getApprovedModel(rawId);
    const id = approved?.id || rawId;
    const caps = inferWorkflowCapabilitiesFromId(id);
    let category: 'image' | 'video' | 'audio' | 'embedding' | 'text' = 'text';
    if (caps.isImage) category = 'image';
    else if (caps.isVideo) category = 'video';
    else if (caps.isAudio) category = 'audio';
    else if (caps.isEmbedding) category = 'embedding';
    const name = approved?.name || approvedModelDisplayName(id) || id;
    return {
      id, name, shortName: approved?.shortName || name.split(' ')[0], category,
      isMultimodal: caps.isMultimodal, isVision: caps.isVision, isThinking: caps.isThinking,
      isImage: caps.isImage, isVideo: caps.isVideo, isAudio: caps.isAudio, isEmbedding: caps.isEmbedding,
      owned_by: item.owned_by || approved?.vendor || 'system', isCustom: false,
    };
  }).filter((m: { id: string }) => m.id);
  return filterApprovedModels(parsed);
}

function parseLianchiModels(rawList: unknown[]) {
  const seen = new Set<string>();
  return rawList.flatMap((item: any) => {
    const id = typeof item === 'string' ? item.trim() : String(item?.id || '').trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const approved = getApprovedModel(id);
    const caps = inferWorkflowCapabilitiesFromId(id);
    const modelType = String(typeof item === 'object' && item ? item.model_type || '' : '').toLowerCase();
    const category = modelType === 'image' || caps.isImage ? 'image'
      : modelType === 'video' || caps.isVideo ? 'video'
        : caps.isAudio ? 'audio' : caps.isEmbedding ? 'embedding' : 'text';
    const supported = id === 'openai/gpt-image-2';
    return [{
      id,
      name: approved?.id === id ? approved.name : (typeof item?.name === 'string' ? item.name : id),
      shortName: approved?.id === id ? approved.shortName : id.split('/').at(-1),
      category,
      isMultimodal: caps.isMultimodal, isVision: caps.isVision, isThinking: caps.isThinking,
      isImage: category === 'image', isVideo: category === 'video',
      isAudio: category === 'audio', isEmbedding: category === 'embedding',
      owned_by: typeof item?.owned_by === 'string' ? item.owned_by : id.split('/')[0],
      isCustom: false, supported,
    }];
  });
}

function parseOpenAIModels(rawList: unknown[]) {
  const seen = new Set<string>();
  return rawList.flatMap((item: any) => {
    const id = typeof item === 'string' ? item.trim() : String(item?.id || item?.slug || '').trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const approved = getApprovedModel(id);
    const caps = inferWorkflowCapabilitiesFromId(id);
    const supported = Boolean(approved?.capability === 'multimodal' && /^gpt-(?:5\.6|6)(?:-|$)/i.test(id));
    return [{
      id,
      name: approved?.name || (typeof item?.display_name === 'string' ? item.display_name : id),
      shortName: approved?.shortName || id,
      category: caps.isImage ? 'image' : caps.isVideo ? 'video' : caps.isAudio ? 'audio' : caps.isEmbedding ? 'embedding' : 'text',
      isMultimodal: caps.isMultimodal, isVision: caps.isVision, isThinking: caps.isThinking,
      isImage: caps.isImage, isVideo: caps.isVideo, isAudio: caps.isAudio, isEmbedding: caps.isEmbedding,
      owned_by: typeof item?.owned_by === 'string' ? item.owned_by : 'openai', isCustom: false, supported,
    }];
  });
}

function extractModelList(data: any): unknown[] {
  if (Array.isArray(data)) return data;
  for (const candidate of [data?.data, data?.models, data?.result?.data, data?.result?.models]) {
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function emptyCatalog(status: number, error?: string) {
  return jsonResponse({ success: false, models: [], gatewayStatus: status, error }, status >= 400 ? status : 502);
}

export async function POST(req: Request) {
  try {
    const body = await readJsonBody(req, {});
    if (body.provider === 'deepseek') return fetchDeepSeekCatalog(body.apiKey);
    const { baseUrl, isPing, strict } = body;
    const isLianchi = body.provider === 'lianchi';
    const isOpenAI = body.provider === 'openai';
    const rawUrl = isLianchi ? LIANCHI_IMAGE_BASE_URL : (baseUrl || (isOpenAI ? 'https://api.openai.com' : req.headers.get('x-custom-base-url') || getDefaultBaseUrl()));
    const targetUrl = String(rawUrl).trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
    const insecureApproved = body.allowInsecureHttp === true && isPublicHttpGatewayIpUrl(targetUrl);
    if (isOpenAI && !allowClientCustomBaseUrl() && !isSafeCustomGatewayBaseUrl(targetUrl) && !insecureApproved) {
      return jsonResponse({ success: false, models: [], error: '此部署仅允许 HTTPS 地址；如需使用公网 IPv4 的 HTTP 网关，请先在设置中勾选明文传输选项。内网地址和 HTTP 域名不受支持。' }, 400);
    }
    const independentKey = Object.prototype.hasOwnProperty.call(body, 'apiKey');
    if (isOpenAI && !independentKey) {
      return jsonResponse({ success: false, models: [], error: '请填写独立的 OpenAI API Key' }, 400);
    }
    const rawKey = independentKey
      ? body.apiKey
      : isLianchi ? req.headers.get('x-lianchi-api-key') : (req.headers.get('x-custom-api-key') || getDefaultApiKey());
    const targetKey = String(rawKey || '').trim();

    if (independentKey && !targetKey) {
      return jsonResponse({ success: false, error: '请填写独立接口 API Key', models: [] }, 400);
    }
    if (isLianchi && !targetKey) {
      return jsonResponse({ success: false, error: '请先填写联池 API Key', models: [] }, 400);
    }
    if (!targetKey) {
      return jsonResponse({
        success: isPing ? false : true,
        count: FALLBACK_FLAGSHIP_MODELS.length,
        models: FALLBACK_FLAGSHIP_MODELS,
        isFallback: true,
        error: isPing ? '请先填写 API Key' : undefined,
        warning: '未检测到自定义 API Key，已自动载入官方精选推荐模型库',
      });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), isPing ? 15000 : 40000);
    let rawList: any[] = [];
    let gatewayStatus = 0;
    let gatewayErrorMsg = '';
    let suggestedBaseUrl = '';
    try {
      const paths = isOpenAI ? ['/v1/models', '/models'] : ['/v1/models'];
      for (const path of paths) {
        const res = await gatewayFetch(`${targetUrl}${path}`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${targetKey}`, Accept: 'application/json' },
          signal: controller.signal,
        });
        gatewayStatus = res.status;
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          rawList = extractModelList(data);
          gatewayErrorMsg = rawList.length === 0
            ? '模型目录返回空列表或不兼容格式；可导入 CC Switch/Codex 目录，或手动填写模型 ID'
            : '';
          if (rawList.length > 0 || path === paths.at(-1)) break;
        } else {
          gatewayErrorMsg = data?.error?.message || data?.message || `HTTP ${res.status}`;
          if (![404, 405].includes(res.status) || path === paths.at(-1)) break;
        }
      }
      clearTimeout(timeout);
      if (isOpenAI && [404, 405].includes(gatewayStatus)) {
        gatewayErrorMsg = '该网关未提供模型目录接口（/v1/models 或 /models）；可导入 CC Switch/Codex 目录，或手动添加模型 ID';
      }
    } catch (networkErr: any) {
      clearTimeout(timeout);
      gatewayErrorMsg = networkErr.name === 'AbortError' ? '请求网关超时' : (networkErr.message || '网络连接失败');
      // Diagnose HTTPS-on-HTTP ports without ever sending the API key over HTTP.
      const httpCandidate = isOpenAI && networkErr.name !== 'AbortError'
        ? targetUrl.replace(/^https:/i, 'http:') : '';
      if (httpCandidate !== targetUrl && isPublicHttpGatewayIpUrl(httpCandidate)) {
        try {
          const probe = await gatewayFetch(`${httpCandidate}/v1/models`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            redirect: 'manual',
            signal: AbortSignal.timeout(4_000),
          });
          if (probe.status >= 500 || (probe.status >= 300 && probe.status < 400)) throw new Error('HTTP endpoint unavailable');
          suggestedBaseUrl = httpCandidate;
          gatewayErrorMsg = '此地址的 HTTPS 连接失败，但同一端口的 HTTP 接口有响应。请改用 HTTP 地址并明确允许明文传输，然后重试；或为网关配置有效的 HTTPS。';
        } catch {
          // Keep the original network error when the HTTP endpoint is also unreachable.
        }
      }
      console.warn('远程网关拉取失败或超时，自动启用高可用精选模型兜底:', gatewayErrorMsg);
    }

    if (rawList.length > 0) {
      const parsedModels = isLianchi ? parseLianchiModels(rawList) : isOpenAI ? parseOpenAIModels(rawList) : parseDiscoveredModels(rawList);
      return jsonResponse({ success: true, gatewayStatus: 200, count: parsedModels.length, models: parsedModels, provider: isLianchi ? 'lianchi' : isOpenAI ? 'openai' : 'comfly' });
    }

    const httpFailed = [401, 403, 404, 500].includes(gatewayStatus);
    if (strict || isOpenAI || httpFailed || gatewayStatus === 200) {
      if (suggestedBaseUrl) {
        return jsonResponse({ success: false, models: [], gatewayStatus: 502, error: gatewayErrorMsg, suggestedBaseUrl }, 502);
      }
      return emptyCatalog(gatewayStatus || 502, gatewayErrorMsg || '未发现可用模型');
    }
    if (isPing) {
      const status = gatewayStatus === 401 || gatewayStatus === 403 ? 401 : (gatewayStatus || 504);
      return jsonResponse({
        success: false, gatewayStatus: status, error: gatewayErrorMsg || '无法访问 API 网关',
        isFallback: true, models: FALLBACK_FLAGSHIP_MODELS,
      }, status === 401 ? 401 : undefined);
    }
    return jsonResponse({
      success: true, gatewayStatus: gatewayStatus || 504,
      count: FALLBACK_FLAGSHIP_MODELS.length, models: FALLBACK_FLAGSHIP_MODELS, isFallback: true,
      warning: gatewayErrorMsg
        ? `远端网关暂时不可用 (${gatewayErrorMsg})，已自动载入官方精选推荐模型库`
        : '已自动为您载入官方精选旗舰模型库（生图/生视频/多模态），可直接勾选启用',
    });
  } catch {
    return jsonResponse({
      success: true, count: FALLBACK_FLAGSHIP_MODELS.length, models: FALLBACK_FLAGSHIP_MODELS, isFallback: true,
      warning: '已自动为您载入官方精选旗舰模型库',
    });
  }
}
