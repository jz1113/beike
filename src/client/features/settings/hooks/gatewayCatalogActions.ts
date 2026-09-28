import { apiFetch } from '@client/shared/api/apiClient';
import type { GatewayModelItem } from '../components/GatewayModelModal';
import { parseCodexCatalog } from '../model/codexCatalog';

interface GatewayCatalogDeps {
  apiKey: string;
  baseUrl: string;
  showToast: (msg: string) => void;
  allGatewayModels: GatewayModelItem[];
  lianchiModels: GatewayModelItem[];
  openAIModels: GatewayModelItem[];
  setGatewaySource: (source: 'comfly' | 'lianchi' | 'openai') => void;
  setIsGatewayModalOpen: (open: boolean) => void;
  setAllGatewayModels: (models: GatewayModelItem[]) => void;
  setIsFetchingGateway: (fetching: boolean) => void;
  setLianchiModels: (models: GatewayModelItem[]) => void;
  setIsFetchingLianchi: (fetching: boolean) => void;
  setOpenAIModels: (models: GatewayModelItem[]) => void;
  setOpenAIModelError: (message: string) => void;
  setOpenAIModelSuggestedBaseUrl: (url: string) => void;
  setOpenAIModelSource: (source: 'gateway' | 'codex') => void;
  setIsFetchingOpenAI: (fetching: boolean) => void;
}

export function createGatewayCatalogActions(deps: GatewayCatalogDeps) {
  const handleOpenGatewayDiscovery = async (forceRefresh = false) => {
    deps.setGatewaySource('comfly');
    if (!forceRefresh && deps.allGatewayModels.length > 0) {
      deps.setIsGatewayModalOpen(true);
      return;
    }
    if (!deps.apiKey.trim()) {
      deps.setAllGatewayModels([]);
      deps.showToast('请先填写并保存网关 API Key，再获取模型库');
      return;
    }
    deps.setIsGatewayModalOpen(true);
    deps.setIsFetchingGateway(true);
    try {
      const res = await apiFetch('/api/system/models/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseUrl: deps.baseUrl.trim(), apiKey: deps.apiKey.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !Array.isArray(data.models)) {
        deps.setAllGatewayModels([]);
        deps.showToast(`获取网关模型失败 (${data.gatewayStatus || res.status}): ${data.error || '网关未返回有效模型列表'}`);
        return;
      }
      if (data.models.length === 0) {
        deps.setAllGatewayModels([]);
        deps.showToast(`网关未返回可用模型${data.warning ? `：${data.warning}` : ''}`);
        return;
      }
      deps.setAllGatewayModels(data.models);
    } catch (err: unknown) {
      deps.setAllGatewayModels([]);
      deps.showToast(`获取网关模型失败：${err instanceof Error ? err.message : '网络连接异常'}`);
    } finally {
      deps.setIsFetchingGateway(false);
    }
  };

  const handleOpenLianchiDiscovery = async (lianchiApiKey: string, forceRefresh = false) => {
    deps.setGatewaySource('lianchi');
    if (!forceRefresh && deps.lianchiModels.length > 0) {
      deps.setIsGatewayModalOpen(true);
      return;
    }
    if (!lianchiApiKey.trim()) {
      deps.showToast('请先填写联池 API Key，再获取模型库');
      return;
    }
    deps.setIsGatewayModalOpen(true);
    deps.setIsFetchingLianchi(true);
    try {
      const res = await apiFetch('/api/system/models/fetch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'lianchi', apiKey: lianchiApiKey.trim(), strict: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || data.provider !== 'lianchi' || !Array.isArray(data.models)) {
        deps.setLianchiModels([]);
        deps.showToast(`获取联池模型失败 (${data.gatewayStatus || res.status})：${data.error || '网关未返回有效模型列表'}`);
        return;
      }
      deps.setLianchiModels(data.models);
      if (data.models.length === 0) deps.showToast('联池当前没有返回可用模型');
    } catch (error) {
      deps.setLianchiModels([]);
      deps.showToast(`获取联池模型失败：${error instanceof Error ? error.message : '网络连接异常'}`);
    } finally {
      deps.setIsFetchingLianchi(false);
    }
  };

  const handleOpenOpenAIDiscovery = async (openAIBaseUrl: string, openAIApiKey: string, allowInsecureHttp = false, forceRefresh = false) => {
    deps.setGatewaySource('openai');
    if (!forceRefresh && deps.openAIModels.length > 0) {
      deps.setIsGatewayModalOpen(true);
      return;
    }
    if (!openAIApiKey.trim()) {
      deps.setOpenAIModelError('请先填写网关 API Key；也可导入本机 CC Switch/Codex 模型目录');
      deps.showToast('请先填写 OpenAI API Key');
      return;
    }
    deps.setOpenAIModelError('');
    deps.setOpenAIModelSuggestedBaseUrl('');
    deps.setOpenAIModelSource('gateway');
    deps.setIsGatewayModalOpen(true);
    deps.setIsFetchingOpenAI(true);
    try {
      const response = await apiFetch('/api/system/models/fetch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openai', baseUrl: openAIBaseUrl.trim(), apiKey: openAIApiKey.trim(), allowInsecureHttp, strict: true }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success || data.provider !== 'openai' || !Array.isArray(data.models)) {
        deps.setOpenAIModels([]);
        const message = `获取模型失败 (${data.gatewayStatus || response.status})：${data.error || '模型目录无效'}`;
        deps.setOpenAIModelError(message);
        if (typeof data.suggestedBaseUrl === 'string') deps.setOpenAIModelSuggestedBaseUrl(data.suggestedBaseUrl);
        deps.showToast(message);
        return;
      }
      deps.setOpenAIModels(data.models);
      if (data.models.length === 0) {
        deps.setOpenAIModelError('当前接口没有返回模型；可导入 CC Switch/Codex 目录，或手动添加模型 ID');
        deps.showToast('当前接口没有返回模型');
      }
    } catch (error) {
      deps.setOpenAIModels([]);
      const message = `获取模型失败：${error instanceof Error ? error.message : '网络错误'}`;
      deps.setOpenAIModelError(message);
      deps.showToast(message);
    } finally {
      deps.setIsFetchingOpenAI(false);
    }
  };

  const handleImportCodexCatalog = async (file: File) => {
    try {
      if (file.size > 5_000_000) throw new Error('模型目录文件不能超过 5 MB');
      const models = parseCodexCatalog(JSON.parse(await file.text()));
      deps.setGatewaySource('openai');
      deps.setOpenAIModelSource('codex');
      deps.setOpenAIModelError('');
      deps.setOpenAIModelSuggestedBaseUrl('');
      deps.setOpenAIModels(models);
      deps.setIsGatewayModalOpen(true);
      deps.showToast(`已从本机目录读取 ${models.length} 款模型`);
    } catch (error) {
      const message = error instanceof SyntaxError ? '模型目录不是有效的 JSON 文件'
        : error instanceof Error ? error.message : '无法读取模型目录';
      deps.setOpenAIModelError(message);
      deps.showToast(message);
    }
  };

  return {
    handleOpenGatewayDiscovery,
    handleOpenLianchiDiscovery,
    handleOpenOpenAIDiscovery,
    handleImportCodexCatalog,
  };
}
