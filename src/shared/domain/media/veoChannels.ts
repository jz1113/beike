import { canonicalModelId } from '@shared/domain/models/modelCatalog';

/** A Cloud resource URL is also accepted on explicitly configured reverse proxies. */
export function isVeoNativeBase(baseUrl?: string): boolean {
  try {
    const url=new URL(baseUrl || '');
    return url.hostname.endsWith('.aiplatform.googleapis.com') || url.hostname==='aiplatform.googleapis.com'
      || /\/v1\/projects\/[^/]+\/locations\/[^/]+\/publishers\/google(?:\/models(?:\/[^/]+)?)?$/.test(url.pathname);
  } catch {return false;}
}

export function veoNativeModelUrl(baseUrl: string, model: string): string {
  const url=new URL(baseUrl);
  const match=/^(.*\/v1\/projects\/[\w.-]+\/locations\/[\w-]+\/publishers\/google)(?:\/models(?:\/[^/:]+(?::predictLongRunning|:fetchPredictOperation)?)?)?\/?$/.exec(url.pathname);
  if(!match || url.search || url.hash || url.username || url.password) throw new Error('Veo 官方渠道需要包含项目和区域的 Base URL：…/v1/projects/项目ID/locations/区域/publishers/google');
  const native=canonicalModelId(model).toLowerCase().includes('fast')?'veo-3.1-fast-generate-001':'veo-3.1-generate-001';
  return `${url.origin}${match[1]}/models/${native}`;
}

export function veoExtensionHint(model: string, mode: string, baseUrl?: string): string | undefined {
  if(!/^veo-?3\.1/i.test(canonicalModelId(model)) || mode!=='extend')return;
  return isVeoNativeBase(baseUrl) ? '官方原生延长：新增 7 秒，输入一段 1–30 秒的 Veo 视频。'
    : '视频延长采用末帧续拍：生成 8 秒后自动拼接原片，原片保留原声，续段声音由提示词决定。该渠道不提供原生视频上下文延长。';
}
