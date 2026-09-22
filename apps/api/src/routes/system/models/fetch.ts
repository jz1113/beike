import { gatewayFetch } from '../../../gateways/http';
import { readJsonBody } from '../../../core/validate';
import { jsonResponse } from '../../../core/http';
import { getDefaultApiKey, getDefaultBaseUrl } from '../../../services/gatewayCredentials';
import { inferWorkflowCapabilitiesFromId } from '@beike/domain/workflowModels';
import {
  approvedModelDisplayName,
  filterApprovedModels,
  getApprovedModel,
} from '@beike/domain/modelCatalog';
import { FALLBACK_FLAGSHIP_MODELS } from './fallbackModels';

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

function emptyCatalog(status: number, error?: string) {
  return jsonResponse({ success: false, models: [], gatewayStatus: status, error }, status >= 400 ? status : 502);
}

export async function POST(req: Request) {
  try {
    const body = await readJsonBody(req, {});
    const { baseUrl, isPing, strict } = body;
    const rawUrl = (baseUrl || req.headers.get('x-custom-base-url') || getDefaultBaseUrl());
    const targetUrl = String(rawUrl).trim().replace(/\/+$/, '').replace(/\/v1$/i, '');
    const independentKey = Object.prototype.hasOwnProperty.call(body, 'apiKey');
    const targetKey = (
      independentKey
        ? body.apiKey
        : (req.headers.get('x-custom-api-key') || getDefaultApiKey())
    ).toString().trim();

    if (independentKey && !targetKey) {
      return jsonResponse({ success: false, error: '请填写独立接口 API Key', models: [] }, 400);
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

    const endpoint = `${targetUrl}/v1/models`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), isPing ? 15000 : 40000);
    let rawList: any[] = [];
    let gatewayStatus = 0;
    let gatewayErrorMsg = '';
    try {
      const res = await gatewayFetch(endpoint, {
        method: 'GET',
        headers: { Authorization: `Bearer ${targetKey}`, 'Content-Type': 'application/json' },
        signal: controller.signal,
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
      clearTimeout(timeout);
      gatewayErrorMsg = networkErr.name === 'AbortError' ? '请求网关超时' : (networkErr.message || '网络连接失败');
      console.warn('远程网关拉取失败或超时，自动启用高可用精选模型兜底:', gatewayErrorMsg);
    }

    if (rawList.length > 0) {
      const parsedModels = parseDiscoveredModels(rawList);
      return jsonResponse({ success: true, gatewayStatus: 200, count: parsedModels.length, models: parsedModels });
    }

    const httpFailed = [401, 403, 404, 500].includes(gatewayStatus);
    if (strict || httpFailed || gatewayStatus === 200) {
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
