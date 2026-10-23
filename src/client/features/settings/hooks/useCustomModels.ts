import { deepSeekRouteId } from '@shared/domain/models/deepseek';
import { useState, useEffect, useRef, useCallback, type SetStateAction } from 'react';
import { apiFetch } from '@client/shared/api/apiClient';
import { confirmAction } from '@client/shared/utils/confirmAction';
import { DEFAULT_PRESET_MODELS } from '../model/presetModels';
import type { WorkflowModel } from '../model/workflowModel';
import { mergeGatewayModels, type GatewayModelItem } from '../model/gatewayModelCatalog';
import {
  gatewayModelToWorkflowModel,
  workflowModelRouteId,
  repairWorkflowModelsInStorage,
  repairWorkflowModelsForSettings,
} from '@shared/domain/models/workflowModels';
import { loadCustomModels, persistCustomModels } from '../model/customModelsStorage';
import { type ComflyPriceMap } from '../model/multimodalPriceSort';
import { channelName, reorderVisibleModels, restoreChannelPresets, type ModelChannel } from '../model/modelManagement';
import { createGatewayCatalogActions, cancelGatewayCatalogRequests, type GatewayRequestState } from './gatewayCatalogActions';

async function fetchComflyPrices(signal?: AbortSignal): Promise<ComflyPriceMap> {
  const response = await apiFetch('/api/system/models/pricing', { signal });
  const data = await response.json();
  if (!response.ok || !data?.success || !data.prices || typeof data.prices !== 'object') {
    throw new Error(data?.error || '无法获取 Comfly 默认分组报价');
  }
  return data.prices as ComflyPriceMap;
}

interface UseCustomModelsOptions {
  isOpen: boolean;
  baseUrl: string;
  apiKey: string;
  showToast: (msg: string) => void;
}

export function useCustomModels({
  isOpen,
  baseUrl,
  apiKey,
  showToast,
}: UseCustomModelsOptions) {
  const [customModels, setModelsState] = useState<WorkflowModel[]>([]);
  const modelsRef = useRef(customModels);

  const [areModelsLoaded, setAreModelsLoaded] = useState(false);
  const requestRef = useRef<GatewayRequestState>({ version: 0, controller: null });
  const cacheRef = useRef<Partial<Record<'comfly' | 'lianchi' | 'openai', string>>>({});
  const priceRequestRef = useRef<AbortController | null>(null);
  const [gatewayModelError, setGatewayModelError] = useState('');
  const [lianchiModelError, setLianchiModelError] = useState('');
  const [comflyPrices, setComflyPrices] = useState<ComflyPriceMap | null>(null);
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);

  // 网关发现模态窗状态
  const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false);
  const [isFetchingGateway, setIsFetchingGateway] = useState(false);
  const [allGatewayModels, setAllGatewayModels] = useState<GatewayModelItem[]>([]);
  const [isFetchingLianchi, setIsFetchingLianchi] = useState(false);
  const [lianchiModels, setLianchiModels] = useState<GatewayModelItem[]>([]);
  const [openAIModels, setOpenAIModels] = useState<GatewayModelItem[]>([]);
  const [openAIModelError, setOpenAIModelError] = useState('');
  const [openAIModelSuggestedBaseUrl, setOpenAIModelSuggestedBaseUrl] = useState('');
  const [openAIModelSource, setOpenAIModelSource] = useState<'gateway' | 'codex'>('gateway');
  const [isFetchingOpenAI, setIsFetchingOpenAI] = useState(false);
  const [gatewaySource, setGatewaySource] = useState<'comfly' | 'lianchi' | 'openai'>('comfly');

  // 安全触发模型更新事件通知
  const notifyModelsUpdated = () => {
    if (typeof window !== 'undefined') {
      setTimeout(() => {
        window.dispatchEvent(new Event('models_updated'));
      }, 0);
    }
  };

  // 初始化加载模型：损坏数据备份后保留内存中的旧值，绝不覆盖写成 []
  useEffect(() => {
    if (typeof window !== 'undefined' && isOpen) {
      repairWorkflowModelsInStorage();
      const loaded = loadCustomModels(modelsRef.current);
      const lianchiModel = DEFAULT_PRESET_MODELS.find(model => model.id === 'openai/gpt-image-2');
      const needsLianchiMigration = !loaded.invalid && !localStorage.getItem('lianchi_model_added_v1') && Boolean(lianchiModel);
      const models = needsLianchiMigration && !loaded.models.some(model => model.id === lianchiModel?.id)
        ? [...loaded.models, lianchiModel!]
        : loaded.models;
      const needsGpt6Migration = !loaded.invalid && !localStorage.getItem('gpt6_multimodal_models_added_v1');
      const gpt6Models = needsGpt6Migration
        ? DEFAULT_PRESET_MODELS.filter(model => ['gpt-6-luna', 'gpt-6-sol'].includes(model.id) && !models.some(existing => workflowModelRouteId(existing) === model.id))
        : [];
      const needsGrok47Migration = !loaded.invalid && !localStorage.getItem('grok47_multimodal_model_added_v1');
      const grok47Model = needsGrok47Migration
        ? DEFAULT_PRESET_MODELS.find(model => model.id === 'grok-4.7' && ![...models, ...gpt6Models].some(existing => workflowModelRouteId(existing) === model.id))
        : undefined;
      const renamed = [...models, ...gpt6Models, ...(grok47Model ? [grok47Model] : [])].map(model => model.id === 'openai/gpt-image-2' && model.name === 'GPT Image 2（联池）'
        ? { ...model, name: '联池image2', shortName: '联池image2' }
        : model);
      const migrateDeepSeek = !loaded.invalid && !!localStorage.getItem('deepseek_api_key') && !localStorage.getItem('deepseek_shared_models_v1');
      if (migrateDeepSeek && !renamed.some(model => workflowModelRouteId(model) === deepSeekRouteId('deepseek-flash'))) renamed.push(gatewayModelToWorkflowModel({ id: 'deepseek-flash', name: 'DeepSeek Flash', shortName: 'DeepSeek Flash' }, 'deepseek') as WorkflowModel);
      const normalized = repairWorkflowModelsForSettings(renamed);
      modelsRef.current = normalized;
      setModelsState(normalized);
      setAreModelsLoaded(true);
      if (!loaded.invalid && persistCustomModels(normalized)) {
        if (migrateDeepSeek) { localStorage.setItem('deepseek_shared_models_v1', 'true'); notifyModelsUpdated(); }
        if (needsLianchiMigration) localStorage.setItem('lianchi_model_added_v1', 'true');
        if (needsGpt6Migration) localStorage.setItem('gpt6_multimodal_models_added_v1', 'true');
        if (needsGrok47Migration) localStorage.setItem('grok47_multimodal_model_added_v1', 'true');
      }
      // Prices are presentation metadata, never an automatic routing-order migration.
      const controller = new AbortController();
      priceRequestRef.current?.abort();
      priceRequestRef.current = controller;
      void fetchComflyPrices(controller.signal).then(prices => { if (!controller.signal.aborted) setComflyPrices(prices); }).catch(() => {});
      if (loaded.invalid) {
        showToast(loaded.recoveredFromBackup ? '自定义模型配置已损坏，已从备份恢复' : '自定义模型配置已损坏，已保留当前列表并备份原数据');
      }
    }
    return () => { cancelGatewayCatalogRequests(requestRef); priceRequestRef.current?.abort(); };
  }, [isOpen, showToast]);

  const handleRefreshPrices = async () => {
    const controller = new AbortController();
    priceRequestRef.current?.abort();
    priceRequestRef.current = controller;
    setIsFetchingPrices(true);
    try {
      const prices = await fetchComflyPrices(controller.signal);
      if (controller.signal.aborted) return;
      setComflyPrices(prices);
      showToast('已刷新 Comfly 报价；未修改默认模型或调用顺序');
    } catch (error) {
      if (controller.signal.aborted) return;
      showToast(`获取报价失败：${error instanceof Error ? error.message : '网络连接异常'}`);
    } finally { if (priceRequestRef.current === controller) setIsFetchingPrices(false); }
  };

  const commitModels = (updated: WorkflowModel[]): boolean => {
    const normalized = repairWorkflowModelsForSettings(updated);
    if (JSON.stringify(normalized) === JSON.stringify(modelsRef.current)) return true;
    if (!persistCustomModels(normalized)) {
      showToast('模型配置保存失败，未应用变更；请检查浏览器存储空间后重试');
      return false;
    }
    modelsRef.current = normalized;
    setModelsState(normalized);
    notifyModelsUpdated();
    return true;
  };

  const handleReorderModel = (source: string, target: string, visibleIds: string[]) => {
    const updated = reorderVisibleModels(modelsRef.current, source, target, visibleIds);
    if (updated !== modelsRef.current && commitModels(updated)) showToast('模型顺序已保存');
  };

  const handleToggleEnabled = (routeId: string) => {
    commitModels(modelsRef.current.map(model => workflowModelRouteId(model) === routeId
      ? { ...model, enabled: model.enabled === false } : model));
  };

  const handleDeleteModel = async (modelId: string) => {
    const model = modelsRef.current.find(item => workflowModelRouteId(item) === modelId);
    if (!model || !await confirmAction(`从${channelName(model.channel ?? 'comfly')}移出「${model.name || model.id}」？不会删除渠道凭证。若它是默认模型，将自动选择下一条已启用的受支持线路。`)) return;
    if (commitModels(modelsRef.current.filter(model => workflowModelRouteId(model) !== modelId))) showToast(`已移出模型 ${modelId}`);
  };

  const handleResetDefaultModels = async (channel: ModelChannel) => {
    if (!await confirmAction(`恢复${channelName(channel)}的内置模型？仅重置本渠道内置条目，保留自定义模型、其他渠道及密钥；不可用默认值将自动修复。`)) return;
    if (commitModels(restoreChannelPresets(modelsRef.current, DEFAULT_PRESET_MODELS, channel))) showToast(`已恢复${channelName(channel)}内置模型，其他渠道保持不变`);
  };

  const handleAddCustomModel = (modelObj: WorkflowModel): boolean => {
    const model = repairWorkflowModelsForSettings([modelObj])[0];
    if (!model || modelsRef.current.some(item => workflowModelRouteId(item).toLowerCase() === workflowModelRouteId(model).toLowerCase())) return false;
    if (!commitModels([model, ...modelsRef.current])) return false;
    showToast(`成功添加模型【${modelObj.name}】`);
    return true;
  };

  const {
    handleOpenGatewayDiscovery,
    handleOpenLianchiDiscovery,
    handleOpenOpenAIDiscovery,
    handleImportCodexCatalog,
  } = createGatewayCatalogActions({
    apiKey,
    baseUrl,
    requestRef, cacheRef, setGatewayModelError, setLianchiModelError,
    showToast,
    allGatewayModels,
    lianchiModels,
    openAIModels,
    setGatewaySource,
    setIsGatewayModalOpen,
    setAllGatewayModels,
    setIsFetchingGateway,
    setLianchiModels,
    setIsFetchingLianchi,
    setOpenAIModels,
    setOpenAIModelError,
    setOpenAIModelSuggestedBaseUrl,
    setOpenAIModelSource,
    setIsFetchingOpenAI,
  });

  const handleToggleGatewayModel = (model: GatewayModelItem): boolean => {
    if (model.supported === false) return false;
    const entry = repairWorkflowModelsForSettings([gatewayModelToWorkflowModel(model, gatewaySource)])[0];
    if (!entry) return false;
    const routeId = workflowModelRouteId(entry);
    const exists = modelsRef.current.some(item => workflowModelRouteId(item) === routeId);
    const merged = mergeGatewayModels(modelsRef.current, [model], gatewaySource);
    if (!exists && !merged.addedCount) return false;
    if (!commitModels(exists ? modelsRef.current.filter(item => workflowModelRouteId(item) !== routeId) : merged.models)) return false;
    if (gatewaySource === 'openai') { try { localStorage.setItem('openai_channel_split_v1', 'true'); } catch {} }
    showToast(exists ? `已移出模型 ${model.id}` : `已接入模型 ${model.id}`);
    return true;
  };

  const handleAddAllUsefulGatewayModels = (models: GatewayModelItem[]): number => {
    const merged = mergeGatewayModels(modelsRef.current, models, gatewaySource);
    if (!merged.addedCount) { showToast('没有新的受支持模型需要接入'); return 0; }
    if (!commitModels(merged.models)) return 0;
    if (gatewaySource === 'openai') { try { localStorage.setItem('openai_channel_split_v1', 'true'); } catch {} }
    showToast(`成功接入 ${merged.addedCount} 款模型`);
    return merged.addedCount;
  };

  const closeGatewayDiscovery = useCallback(() => {
    cancelGatewayCatalogRequests(requestRef);
    setIsGatewayModalOpen(false);
    setIsFetchingGateway(false); setIsFetchingLianchi(false); setIsFetchingOpenAI(false);
  }, []);
  const setGatewayModalOpen = (open: boolean) => { if (open) setIsGatewayModalOpen(true); else closeGatewayDiscovery(); };
  const setCustomModels = (action: SetStateAction<WorkflowModel[]>) => {
    commitModels(typeof action === 'function' ? action(modelsRef.current) : action);
  };
  useEffect(() => {
    if (!isOpen) { closeGatewayDiscovery(); setIsFetchingPrices(false); }
  }, [isOpen, closeGatewayDiscovery]);

  return {
    customModels,
    areModelsLoaded,
    closeGatewayDiscovery,
    gatewayModelError, lianchiModelError,
    setCustomModels,
    comflyPrices,
    isFetchingPrices,
    handleRefreshPrices,
    handleToggleEnabled,
    handleReorderModel,
    handleDeleteModel,
    handleResetDefaultModels,
    handleAddCustomModel,
    isGatewayModalOpen,
    setIsGatewayModalOpen: setGatewayModalOpen,
    isFetchingGateway,
    allGatewayModels,
    lianchiModels,
    openAIModels,
    openAIModelError,
    openAIModelSuggestedBaseUrl,
    openAIModelSource,
    gatewaySource,
    isFetchingLianchi,
    isFetchingOpenAI,
    handleOpenGatewayDiscovery,
    handleOpenLianchiDiscovery,
    handleOpenOpenAIDiscovery,
    handleImportCodexCatalog,
    handleToggleGatewayModel,
    handleAddAllUsefulGatewayModels,
    notifyModelsUpdated,
  };
}
