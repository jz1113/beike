import { gatewayFetch } from '../../gateways/http';
import { jsonResponse } from '../../core/http';
import { resolveCredentials } from '../../services/models/gatewayCredentials';
import { guardSubmission } from '../../services/tasks/submissionGuard';
import { parseDecomposedLayers } from '@shared/domain/assets/layerDecomposition';
import { ensurePersistableResultUrl } from './image/poll';
import { persistMediaUrl, extractStorageConfigFromRequest } from '@server/infrastructure/storage/storage';
import { formatUserError } from '@shared/domain/models/upstreamErrors';

export async function POST(req: Request) {
  try {
    const body = await req.clone().json();
    if (typeof body.image !== 'string' || !/^data:image\/(png|jpeg);base64,/.test(body.image) || body.image.length > 42_000_000) return jsonResponse({success:false,error:'请传入不超过 30MB 的 PNG/JPEG 图片'},400);
    if (!['auto','1K','1.5K','2K'].includes(body.size || 'auto')) return jsonResponse({success:false,error:'拆分分辨率不支持'},400);
    if (body.model !== 'seedream-v5-pro/layer-decomposition') return jsonResponse({success:false,error:'请选择支持图层拆分的模型'},400);
    const officialKey = process.env.ARK_LAYER_API_KEY?.trim();
    const official = Boolean(officialKey);
    const credentials = official
      ? {baseUrl:'https://ark.cn-beijing.volces.com/api/v3',apiKey:officialKey!}
      : resolveCredentials(req, body);
    const model = official ? (process.env.ARK_LAYER_MODEL || 'doubao-seedream-5-0-pro-260628') : (process.env.LAYER_GATEWAY_MODEL?.trim() || 'seedream-v5-pro/layer-decomposition');
    if (!model) return jsonResponse({success:false,error:'请配置平台实际开放的 LAYER_GATEWAY_MODEL，不能使用文档页面标题代替模型 ID'},400);
    const endpoint = `${credentials.baseUrl}${official ? '' : '/v1'}/images/generations`;
    if (!credentials.apiKey) return jsonResponse({success:false,error:'请先配置聚合平台 API 密钥'},400);
    return await guardSubmission(req, 'layer-decomposition', credentials, async () => {
      try {
        const response = await gatewayFetch(endpoint, {
          method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${credentials.apiKey}`},
          body:JSON.stringify({model,image:body.image,prompt:body.prompt,size:body.size || 'auto',layer_decomposition:true,output_format:'png',response_format:'url',watermark:false}),
          signal:AbortSignal.timeout(300_000),
        });
        const raw = await response.text();
        let data;
        try {data = JSON.parse(raw);} catch {throw new Error(`图层接口返回非 JSON（HTTP ${response.status}），请检查平台接口是否开放`);}
        if (!response.ok) throw new Error(data.error?.message || `图层拆分失败（${response.status}）`);
        const layers = parseDecomposedLayers(data);
        const config = extractStorageConfigFromRequest(req);
        let temporaryUrls = false;
        for (const layer of layers) {
          layer.url = await ensurePersistableResultUrl(layer.url, req);
          // Storage is optional: a failed copy must not discard paid upstream results.
          const permanent = await persistMediaUrl(`layer-${crypto.randomUUID()}`,layer.url,'image',config).catch(() => null);
          if (!permanent && /^https?:/.test(layer.url)) temporaryUrls = true;
          layer.url = permanent || layer.url;
        }
        return jsonResponse({success:true,layers,temporaryUrls});
      } catch (error) { return jsonResponse({success:false,error:formatUserError(error,'图层拆分失败；请核对平台任务记录后再重试')},502); }
    });
  } catch (error) {return jsonResponse({success:false,error:formatUserError(error,'图层拆分请求无效')},400);}
}
