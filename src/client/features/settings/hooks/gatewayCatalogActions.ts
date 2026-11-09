import { apiFetch } from '@client/shared/api/apiClient';
import { catalogRequestProtocol } from '../model/apiProviderTypes';
import { parseGatewayModels, type GatewayModelItem, type GatewayChannel } from '../model/modelManagement';
import { getApprovedModel } from '@shared/domain/models/modelCatalog';
import { inferWorkflowCapabilitiesFromId } from '@shared/domain/models/workflowModels';

/** CC Switch/Codex catalog is a local model list, not an authentication file. */
function parseCodexCatalog(raw: unknown): GatewayModelItem[] {
  const entries = raw && typeof raw === 'object' && 'models' in raw ? (raw as { models: unknown }).models : null;
  if (!Array.isArray(entries)) throw new Error('请选择含 models 数组的 CC Switch/Codex 模型目录 JSON');
  const seen = new Set<string>();
  const models = entries.flatMap((entry): GatewayModelItem[] => {
    const id = typeof entry === 'string' ? entry.trim()
      : entry && typeof entry === 'object'
        ? String((entry as { slug?: unknown; id?: unknown; model?: unknown }).slug
          || (entry as { id?: unknown }).id
          || (entry as { model?: unknown }).model || '').trim()
        : '';
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const item = entry && typeof entry === 'object' ? entry as { display_name?: unknown; displayName?: unknown } : {};
    const approved = getApprovedModel(id);
    const caps = inferWorkflowCapabilitiesFromId(id);
    const name = approved?.name || (typeof item.display_name === 'string' ? item.display_name
      : typeof item.displayName === 'string' ? item.displayName : id);
    return [{
      id, name, shortName: approved?.shortName || name,
      category: caps.isImage ? 'image' : caps.isVideo ? 'video' : caps.isAudio ? 'audio' : caps.isEmbedding ? 'embedding' : 'text',
      isVision: caps.isVision, isThinking: caps.isThinking, isImage: caps.isImage,
      isVideo: caps.isVideo, isAudio: caps.isAudio, isEmbedding: caps.isEmbedding,
      isTool: false, owned_by: 'openai', isCustom: false,
      supported: Boolean(approved?.capability === 'multimodal' && /^gpt-(?:5\.6|6)(?:-|$)/i.test(id)),
    }];
  });
  if (models.length === 0) throw new Error('目录中没有可读取的模型 ID');
  return models;
}

export interface GatewayRequestState { version: number; controller: AbortController | null }
interface GatewayCatalogDeps {
  apiKey: string; baseUrl: string; showToast: (msg: string) => void;
  allGatewayModels: GatewayModelItem[]; openAIModels: GatewayModelItem[];
  requestRef: { current: GatewayRequestState };
  cacheRef: { current: Partial<Record<GatewayChannel, string>> };
  setGatewaySource: (source: GatewayChannel) => void;
  setIsGatewayModalOpen: (open: boolean) => void;
  setAllGatewayModels: (models: GatewayModelItem[]) => void;
  setIsFetchingGateway: (fetching: boolean) => void;
  setGatewayModelError: (message: string) => void;
  setOpenAIModels: (models: GatewayModelItem[]) => void;
  setOpenAIModelError: (message: string) => void;
  setOpenAIModelSuggestedBaseUrl: (url: string) => void;
  setOpenAIModelSource: (source: 'gateway' | 'codex') => void;
  setIsFetchingOpenAI: (fetching: boolean) => void;
}

export function cancelGatewayCatalogRequests(ref: GatewayCatalogDeps['requestRef']) {
  ref.current.controller?.abort();
  ref.current = { version: ref.current.version + 1, controller: null };
}

export function createGatewayCatalogActions(deps: GatewayCatalogDeps) {
  const begin = (channel: GatewayChannel) => {
    cancelGatewayCatalogRequests(deps.requestRef);
    deps.setIsFetchingGateway(false); deps.setIsFetchingOpenAI(false);
    deps.setGatewaySource(channel);
    const controller = new AbortController();
    deps.requestRef.current.controller = controller;
    const version = deps.requestRef.current.version;
    return { signal: controller.signal, current: () => version === deps.requestRef.current.version && !controller.signal.aborted };
  };
  const fetchCatalog = async (channel: GatewayChannel, body: Record<string, unknown>, forceRefresh: boolean) => {
    const request = begin(channel);
    const setModels = channel === 'openai' ? deps.setOpenAIModels : deps.setAllGatewayModels;
    const setFetching = channel === 'openai' ? deps.setIsFetchingOpenAI : deps.setIsFetchingGateway;
    const setError = channel === 'openai' ? deps.setOpenAIModelError : deps.setGatewayModelError;
    const models = channel === 'openai' ? deps.openAIModels : deps.allGatewayModels;
    const name = channel === 'openai' ? 'OpenAI' : 'Comfly';
    const identity = JSON.stringify(body);
    deps.setIsGatewayModalOpen(true);
    if (!forceRefresh && models.length && deps.cacheRef.current[channel] === identity) return;
    setError('');
    if (channel === 'openai') { deps.setOpenAIModelSuggestedBaseUrl(''); deps.setOpenAIModelSource('gateway'); }
    if (typeof body.apiKey !== 'string' || !body.apiKey.trim()) {
      setModels([]);
      const message = `请先填写并保存${name} API Key，再获取模型库`;
      setError(message); deps.showToast(message);
      return;
    }
    setFetching(true);
    try {
      const response = await apiFetch('/api/system/models/fetch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...catalogRequestProtocol(body.providerType, body.catalogProtocol), ...body }), signal: request.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!request.current()) return;
      if (!response.ok || !data?.success || !Array.isArray(data.models) || (channel !== 'comfly' && data.provider !== channel)) {
        if (channel === 'openai' && typeof data?.suggestedBaseUrl === 'string') deps.setOpenAIModelSuggestedBaseUrl(data.suggestedBaseUrl);
        throw new Error(`获取${name}模型失败 (${data?.gatewayStatus || response.status})：${typeof data?.error === 'string' ? data.error : '网关未返回有效模型列表'}`);
      }
      const parsed = parseGatewayModels(data.models, channel);
      setModels(parsed);
      deps.cacheRef.current[channel] = identity;
      if (!parsed.length) {
        const message = `${name}当前没有返回可用模型${typeof data.warning === 'string' ? `：${data.warning}` : ''}`;
        setError(message); deps.showToast(message);
      }
    } catch (error) {
      if (!request.current()) return;
      setModels([]);
      const message = error instanceof Error ? error.message : `获取${name}模型失败：网络连接异常`;
      setError(message); deps.showToast(message);
    } finally {
      if (request.current()) setFetching(false);
    }
  };
  const handleOpenGatewayDiscovery = (forceRefresh = false) => fetchCatalog('comfly', { baseUrl: deps.baseUrl.trim(), apiKey: deps.apiKey.trim() }, forceRefresh);
  const handleOpenOpenAIDiscovery = (baseUrl: string, apiKey: string, allowInsecureHttp = false, forceRefresh = false) => fetchCatalog('openai', { provider: 'openai', baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), allowInsecureHttp, strict: true }, forceRefresh);
  const handleImportCodexCatalog = async (file: File) => {
    const request = begin('openai');
    try {
      if (file.size > 5_000_000) throw new Error('模型目录文件不能超过 5 MB');
      const contents = await file.text();
      if (!request.current()) return;
      const models = parseGatewayModels(parseCodexCatalog(JSON.parse(contents)), 'openai');
      deps.setOpenAIModelSource('codex'); deps.setOpenAIModelError(''); deps.setOpenAIModelSuggestedBaseUrl('');
      deps.setOpenAIModels(models); deps.setIsGatewayModalOpen(true);
      delete deps.cacheRef.current.openai;
      deps.showToast(`已从本机目录读取 ${models.length} 款模型`);
    } catch (error) {
      if (!request.current()) return;
      const message = error instanceof SyntaxError ? '模型目录不是有效的 JSON 文件' : error instanceof Error ? error.message : '无法读取模型目录';
      deps.setOpenAIModelError(message); deps.showToast(message);
    }
  };
  return { handleOpenGatewayDiscovery, handleOpenOpenAIDiscovery, handleImportCodexCatalog };
}
