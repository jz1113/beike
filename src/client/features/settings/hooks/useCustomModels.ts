import { deepSeekRouteId } from '@shared/domain/models/deepseek';
import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@client/shared/api/apiClient';
import { confirmAction } from '@client/shared/utils/confirmAction';
import {
  DEFAULT_PRESET_MODELS,
  type WorkflowModel,
} from '../components/settingsShared';
import type { GatewayModelItem } from '../components/GatewayModelModal';
import {
  gatewayModelToWorkflowModel,
  inferWorkflowCapabilitiesFromId,
  workflowModelRouteId,
  openAIModelRouteId,
  repairWorkflowModelsInStorage,
} from '@shared/domain/models/workflowModels';
import { loadCustomModels, persistCustomModels } from '../model/customModelsStorage';
import { type ComflyPriceMap } from '../model/multimodalPriceSort';
import { channelName, reorderVisibleModels, restoreChannelPresets, type ModelChannel } from '../model/modelManagement';
import { createGatewayCatalogActions } from './gatewayCatalogActions';

async function fetchComflyPrices(): Promise<ComflyPriceMap> {
  const response = await apiFetch('/api/system/models/pricing');
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
  const [customModels, setCustomModels] = useState<WorkflowModel[]>([]);
  const modelsRef = useRef(customModels);
  modelsRef.current = customModels;
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
      setCustomModels(renamed);
      if (!loaded.invalid && persistCustomModels(renamed)) {
        if (migrateDeepSeek) { localStorage.setItem('deepseek_shared_models_v1', 'true'); notifyModelsUpdated(); }
        if (needsLianchiMigration) localStorage.setItem('lianchi_model_added_v1', 'true');
        if (needsGpt6Migration) localStorage.setItem('gpt6_multimodal_models_added_v1', 'true');
        if (needsGrok47Migration) localStorage.setItem('grok47_multimodal_model_added_v1', 'true');
      }
      // Prices are presentation metadata, never an automatic routing-order migration.
      void fetchComflyPrices().then(setComflyPrices).catch(() => {});
      if (loaded.invalid) {
        showToast(loaded.recoveredFromBackup ? '自定义模型配置已损坏，已从备份恢复' : '自定义模型配置已损坏，已保留当前列表并备份原数据');
      }
    }
  }, [isOpen, showToast]);

  const handleRefreshPrices = async () => {
    setIsFetchingPrices(true);
    try {
      setComflyPrices(await fetchComflyPrices());
      showToast('已刷新 Comfly 报价；未修改默认模型或调用顺序');
    } catch (error) {
      showToast(`获取报价失败：${error instanceof Error ? error.message : '网络连接异常'}`);
    } finally { setIsFetchingPrices(false); }
  };

  const commitModels = (updated: WorkflowModel[]): boolean => {
    if (!persistCustomModels(updated)) {
      showToast('模型配置保存失败，未应用变更；请检查浏览器存储空间后重试');
      return false;
    }
    modelsRef.current = updated;
    setCustomModels(updated);
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
    if (!model || !await confirmAction(`从${channelName(model.channel ?? 'comfly')}移出「${model.name || model.id}」？不会删除渠道凭证。若它是默认模型，请到默认模型页重新选择。`)) return;
    if (commitModels(modelsRef.current.filter(model => workflowModelRouteId(model) !== modelId))) showToast(`已移出模型 ${modelId}`);
  };

  const handleResetDefaultModels = async (channel: ModelChannel) => {
    if (!await confirmAction(`恢复${channelName(channel)}的内置模型？仅重置本渠道内置条目，保留自定义模型、其他渠道、密钥及默认选择。`)) return;
    if (commitModels(restoreChannelPresets(modelsRef.current, DEFAULT_PRESET_MODELS, channel))) showToast(`已恢复${channelName(channel)}内置模型，其他渠道保持不变`);
  };

  const handleAddCustomModel = (modelObj: WorkflowModel): boolean => {
    if (modelsRef.current.some(model => workflowModelRouteId(model) === workflowModelRouteId(modelObj))) return false;
    if (!commitModels([modelObj, ...modelsRef.current])) return false;
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

  const handleToggleGatewayModel = (model: GatewayModelItem) => {
    if (model.supported === false) return;
    const routeId = gatewaySource === 'openai' ? openAIModelRouteId(model.id) : model.id;
    const previous = modelsRef.current;
    const exists = previous.some(model => workflowModelRouteId(model) === routeId);
    const updated = exists ? previous.filter(model => workflowModelRouteId(model) !== routeId)
      : [...previous, gatewayModelToWorkflowModel(model, gatewaySource) as WorkflowModel];
    if (commitModels(updated) && gatewaySource === 'openai') localStorage.setItem('openai_channel_split_v1', 'true');
  };

  const handleAddAllUsefulGatewayModels = (models: GatewayModelItem[]) => {
    const existingMap = new Map(modelsRef.current.map(model => [workflowModelRouteId(model), model]));
    let addedCount = 0;
    models.forEach(model => {
      if (model.supported === false) return;
      const caps = inferWorkflowCapabilitiesFromId(model.id);
      if (!caps.isImage && !caps.isVideo && !caps.isMultimodal) return;
      const entry = gatewayModelToWorkflowModel(model, gatewaySource) as WorkflowModel;
      const routeId = workflowModelRouteId(entry);
      if (!existingMap.has(routeId)) { existingMap.set(routeId, entry); addedCount++; }
    });
    if (!commitModels(Array.from(existingMap.values()))) return 0;
    if (gatewaySource === 'openai') localStorage.setItem('openai_channel_split_v1', 'true');
    return addedCount;
  };

  return {
    customModels,
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
    setIsGatewayModalOpen,
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
