import { apiFetch } from '@client/shared/api/apiClient';
import { parseCodexCatalog } from '../model/codexCatalog';
import { parseGatewayModels, type GatewayModelItem, type GatewayChannel } from '../model/gatewayModelCatalog';

export interface GatewayRequestState { version: number; controller: AbortController | null }
interface GatewayCatalogDeps {
  apiKey: string; baseUrl: string; showToast: (msg: string) => void;
  allGatewayModels: GatewayModelItem[]; lianchiModels: GatewayModelItem[]; openAIModels: GatewayModelItem[];
  requestRef: { current: GatewayRequestState };
  cacheRef: { current: Partial<Record<GatewayChannel, string>> };
  setGatewaySource: (source: GatewayChannel) => void;
  setIsGatewayModalOpen: (open: boolean) => void;
  setAllGatewayModels: (models: GatewayModelItem[]) => void;
  setIsFetchingGateway: (fetching: boolean) => void;
  setGatewayModelError: (message: string) => void;
  setLianchiModels: (models: GatewayModelItem[]) => void;
  setIsFetchingLianchi: (fetching: boolean) => void;
  setLianchiModelError: (message: string) => void;
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
    deps.setIsFetchingGateway(false); deps.setIsFetchingLianchi(false); deps.setIsFetchingOpenAI(false);
    deps.setGatewaySource(channel);
    const controller = new AbortController();
    deps.requestRef.current.controller = controller;
    const version = deps.requestRef.current.version;
    return { signal: controller.signal, current: () => version === deps.requestRef.current.version && !controller.signal.aborted };
  };
  const fetchCatalog = async (channel: GatewayChannel, body: Record<string, unknown>, forceRefresh: boolean) => {
    const request = begin(channel);
    const setModels = channel === 'openai' ? deps.setOpenAIModels : channel === 'lianchi' ? deps.setLianchiModels : deps.setAllGatewayModels;
    const setFetching = channel === 'openai' ? deps.setIsFetchingOpenAI : channel === 'lianchi' ? deps.setIsFetchingLianchi : deps.setIsFetchingGateway;
    const setError = channel === 'openai' ? deps.setOpenAIModelError : channel === 'lianchi' ? deps.setLianchiModelError : deps.setGatewayModelError;
    const models = channel === 'openai' ? deps.openAIModels : channel === 'lianchi' ? deps.lianchiModels : deps.allGatewayModels;
    const name = channel === 'openai' ? 'OpenAI' : channel === 'lianchi' ? '联池' : 'Comfly';
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
        body: JSON.stringify(body), signal: request.signal,
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
  const handleOpenLianchiDiscovery = (apiKey: string, forceRefresh = false) => fetchCatalog('lianchi', { provider: 'lianchi', apiKey: apiKey.trim(), strict: true }, forceRefresh);
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
  return { handleOpenGatewayDiscovery, handleOpenLianchiDiscovery, handleOpenOpenAIDiscovery, handleImportCodexCatalog };
}
