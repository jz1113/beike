import { useState, useEffect } from 'react';
import { apiFetch } from '@/shared/api/apiClient';
import { confirmAction } from '@/shared/utils/confirmAction';
import {
  DEFAULT_PRESET_MODELS,
  type WorkflowModel,
} from '../settingsShared';
import type { GatewayModelItem } from '../GatewayModelModal';
import {
  gatewayModelToWorkflowModel,
  inferWorkflowCapabilitiesFromId,
  sortModelsByMultimodalPriority,
} from '@beike/domain/workflowModels';
import { loadCustomModels, persistCustomModels } from '../customModelsStorage';
import { sortMultimodalModelsByPrice, type ComflyPriceMap } from '../multimodalPriceSort';

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
  const [modelSearch, setModelSearch] = useState('');
  const [modelCapabilityFilter, setModelCapabilityFilter] = useState<'all' | 'multimodal' | 'image' | 'video'>('all');
  const [comflyPrices, setComflyPrices] = useState<ComflyPriceMap | null>(null);
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);

  // 网关发现模态窗状态
  const [isGatewayModalOpen, setIsGatewayModalOpen] = useState(false);
  const [isFetchingGateway, setIsFetchingGateway] = useState(false);
  const [allGatewayModels, setAllGatewayModels] = useState<GatewayModelItem[]>([]);
  const [isFetchingLianchi, setIsFetchingLianchi] = useState(false);
  const [lianchiModels, setLianchiModels] = useState<GatewayModelItem[]>([]);
  const [gatewaySource, setGatewaySource] = useState<'comfly' | 'lianchi'>('comfly');

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
      const loaded = loadCustomModels(customModels);
      const lianchiModel = DEFAULT_PRESET_MODELS.find(model => model.id === 'openai/gpt-image-2');
      const needsLianchiMigration = !loaded.invalid && !localStorage.getItem('lianchi_model_added_v1') && Boolean(lianchiModel);
      const models = needsLianchiMigration && !loaded.models.some(model => model.id === lianchiModel?.id)
        ? [...loaded.models, lianchiModel!]
        : loaded.models;
      const needsGpt6Migration = !loaded.invalid && !localStorage.getItem('gpt6_multimodal_models_added_v1');
      const gpt6Models = needsGpt6Migration
        ? DEFAULT_PRESET_MODELS.filter(model => ['gpt-6-luna', 'gpt-6-sol'].includes(model.id) && !models.some(existing => existing.id === model.id))
        : [];
      const needsGrok47Migration = !loaded.invalid && !localStorage.getItem('grok47_multimodal_model_added_v1');
      const grok47Model = needsGrok47Migration
        ? DEFAULT_PRESET_MODELS.find(model => model.id === 'grok-4.7' && ![...models, ...gpt6Models].some(existing => existing.id === model.id))
        : undefined;
      const renamed = [...models, ...gpt6Models, ...(grok47Model ? [grok47Model] : [])].map(model => model.id === 'openai/gpt-image-2' && model.name === 'GPT Image 2（联池）'
        ? { ...model, name: '联池image2', shortName: '联池image2' }
        : model);
      const needsPriceOrderMigration = !loaded.invalid && !localStorage.getItem('multimodal_price_order_v3');
      const ordered = needsPriceOrderMigration
        ? sortMultimodalModelsByPrice(renamed)
        : renamed;
      setCustomModels(ordered);
      if (!loaded.invalid && persistCustomModels(ordered)) {
        if (needsLianchiMigration) localStorage.setItem('lianchi_model_added_v1', 'true');
        if (needsGpt6Migration) localStorage.setItem('gpt6_multimodal_models_added_v1', 'true');
        if (needsGrok47Migration) localStorage.setItem('grok47_multimodal_model_added_v1', 'true');
        if (needsPriceOrderMigration) localStorage.setItem('multimodal_price_order_v3', 'true');
      }
      void fetchComflyPrices().then((prices) => {
        setComflyPrices(prices);
        if (needsPriceOrderMigration) {
          setCustomModels((previous) => {
            const sorted = sortMultimodalModelsByPrice(previous, prices);
            persistCustomModels(sorted);
            return sorted;
          });
          notifyModelsUpdated();
        }
      }).catch(() => {
        // 离线时保留 PDF 报价快照；用户可随时主动刷新价格排序。
      });
      if (loaded.invalid) {
        showToast(loaded.recoveredFromBackup ? '自定义模型配置已损坏，已从备份恢复' : '自定义模型配置已损坏，已保留当前列表并备份原数据');
      }
    }
  }, [isOpen]);

  const handleSortByComflyPrice = async () => {
    setIsFetchingPrices(true);
    try {
      const prices = await fetchComflyPrices();
      setComflyPrices(prices);
      setCustomModels((previous) => {
        const sorted = sortMultimodalModelsByPrice(previous, prices);
        persistCustomModels(sorted);
        return sorted;
      });
      notifyModelsUpdated();
      showToast('已按 Comfly 默认分组最新报价重新排序');
    } catch (error) {
      showToast(`获取 Comfly 报价失败：${error instanceof Error ? error.message : '网络连接异常'}`);
    } finally {
      setIsFetchingPrices(false);
    }
  };

  // 单个模型切换能力标签
  const handleToggleCapability = (
    modelId: string,
    field:
      | 'isMultimodal'
      | 'isImage'
      | 'isVideo'
      | 'isVision'
      | 'isAssistant'
      | 'isDistill'
      | 'isThinking'
  ) => {
    setCustomModels((prev) => {
      const updated = prev.map((m) => {
        if (m.id === modelId) {
          if (
            field === 'isMultimodal' ||
            field === 'isVision' ||
            field === 'isAssistant' ||
            field === 'isDistill' ||
            field === 'isThinking'
          ) {
            const currentMulti = m.isMultimodal ?? m.isVision ?? true;
            const nextVal = !currentMulti;
            return {
              ...m,
              isMultimodal: nextVal,
              isVision: nextVal,
              isAssistant: nextVal,
              isDistill: nextVal,
              isThinking: nextVal,
            };
          }
          return { ...m, [field]: !m[field] };
        }
        return m;
      });
      const sorted = sortModelsByMultimodalPriority(updated);
      persistCustomModels(sorted);
      return sorted;
    });
    notifyModelsUpdated();
  };

  // 单个模型移出/删除
  const handleDeleteModel = (modelId: string) => {
    setCustomModels((prev) => {
      const updated = prev.filter((m) => m.id !== modelId);
      const sorted = sortModelsByMultimodalPriority(updated);
      persistCustomModels(sorted);
      return sorted;
    });
    notifyModelsUpdated();
    showToast(`已移出模型 ${modelId}`);
  };

  // 单个模型调整顺序（置顶 / 上移 / 下移）
  const handleMoveModel = (modelId: string, direction: 'up' | 'down' | 'top') => {
    setCustomModels((prev) => {
      const idx = prev.findIndex((m) => m.id === modelId);
      if (idx === -1) return prev;
      const updated = [...prev];
      if (direction === 'top') {
        if (idx === 0) return prev;
        const [item] = updated.splice(idx, 1);
        updated.unshift(item);
      } else if (direction === 'up') {
        if (idx === 0) return prev;
        const temp = updated[idx];
        updated[idx] = updated[idx - 1];
        updated[idx - 1] = temp;
      } else if (direction === 'down') {
        if (idx === updated.length - 1) return prev;
        const temp = updated[idx];
        updated[idx] = updated[idx + 1];
        updated[idx + 1] = temp;
      }
      const sorted = sortModelsByMultimodalPriority(updated);
      persistCustomModels(sorted);
      return sorted;
    });
    notifyModelsUpdated();
    showToast(`已调整模型 ${modelId} 的优先级顺序`);
  };

  // 拖拽全量重排序
  const handleReorderModels = (newOrder: WorkflowModel[]) => {
    const sorted = sortModelsByMultimodalPriority(newOrder);
    setCustomModels(sorted);
    persistCustomModels(sorted);
    notifyModelsUpdated();
    showToast('已更新模型列表优先级排序');
  };

  // 恢复系统默认预设模型列表
  const handleResetDefaultModels = async () => {
    if (await confirmAction('确定恢复系统默认预设模型列表吗？这将覆盖当前的模型修改。')) {
      const sorted = sortModelsByMultimodalPriority(DEFAULT_PRESET_MODELS);
      setCustomModels(sorted);
      persistCustomModels(sorted);
      notifyModelsUpdated();
      showToast('已恢复系统默认预设模型');
    }
  };

  // 手动添加模型
  const handleAddCustomModel = (modelObj: WorkflowModel) => {
    setCustomModels((prev) => {
      const updated = [modelObj, ...prev.filter((m) => m.id !== modelObj.id)];
      const sorted = sortModelsByMultimodalPriority(updated);
      persistCustomModels(sorted);
      return sorted;
    });
    notifyModelsUpdated();
    showToast(`✨ 成功添加模型【${modelObj.name}】`);
  };

  // 获取网关模型列表
  const handleOpenGatewayDiscovery = async (forceRefresh = false) => {
    setGatewaySource('comfly');
    if (!forceRefresh && allGatewayModels.length > 0) {
      setIsGatewayModalOpen(true);
      return;
    }

    // Web 部署不会、也不应把用户的第三方网关密钥放到服务器环境变量中。
    // 只有当前浏览器已输入的密钥会随本次请求发送，因此先给出明确操作指引，
    // 避免打开一个永远空白的“模型库”弹窗。
    if (!apiKey.trim()) {
      setAllGatewayModels([]);
      showToast('请先填写并保存网关 API Key，再获取模型库');
      return;
    }

    setIsGatewayModalOpen(true);

    setIsFetchingGateway(true);
    try {
      const res = await apiFetch('/api/system/models/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseUrl: baseUrl.trim(),
          apiKey: apiKey.trim(),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || !Array.isArray(data.models)) {
        setAllGatewayModels([]);
        showToast(`获取网关模型失败 (${data.gatewayStatus || res.status}): ${data.error || '网关未返回有效模型列表'}`);
        return;
      }

      if (data.models.length === 0) {
        setAllGatewayModels([]);
        showToast(`网关未返回可用模型${data.warning ? `：${data.warning}` : ''}`);
        return;
      }

      setAllGatewayModels(data.models);
    } catch (err: any) {
      setAllGatewayModels([]);
      showToast(`获取网关模型失败：${err?.message || '网络连接异常'}`);
      console.warn('获取网关模型列表提示:', err);
    } finally {
      setIsFetchingGateway(false);
    }
  };

  const handleOpenLianchiDiscovery = async (lianchiApiKey: string, forceRefresh = false) => {
    setGatewaySource('lianchi');
    if (!forceRefresh && lianchiModels.length > 0) {
      setIsGatewayModalOpen(true);
      return;
    }
    if (!lianchiApiKey.trim()) {
      showToast('请先填写联池 API Key，再获取模型库');
      return;
    }
    setIsGatewayModalOpen(true);
    setIsFetchingLianchi(true);
    try {
      const res = await apiFetch('/api/system/models/fetch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'lianchi', apiKey: lianchiApiKey.trim(), strict: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success || data.provider !== 'lianchi' || !Array.isArray(data.models)) {
        setLianchiModels([]);
        showToast(`获取联池模型失败 (${data.gatewayStatus || res.status})：${data.error || '网关未返回有效模型列表'}`);
        return;
      }
      setLianchiModels(data.models);
      if (data.models.length === 0) showToast('联池当前没有返回可用模型');
    } catch (error) {
      setLianchiModels([]);
      showToast(`获取联池模型失败：${error instanceof Error ? error.message : '网络连接异常'}`);
    } finally {
      setIsFetchingLianchi(false);
    }
  };

  const handleToggleGatewayModel = (model: GatewayModelItem) => {
    if (model.supported === false) return;
    setCustomModels((prev) => {
      const exists = prev.some((m) => m.id === model.id);
      const updated = exists
        ? prev.filter((m) => m.id !== model.id)
        : [...prev, gatewayModelToWorkflowModel(model) as WorkflowModel];
      const sorted = sortModelsByMultimodalPriority(updated);
      persistCustomModels(sorted);
      return sorted;
    });
    notifyModelsUpdated();
  };

  const handleAddAllUsefulGatewayModels = (models: GatewayModelItem[]) => {
    const useful = models.filter((m) => {
      if (m.supported === false) return false;
      const caps = inferWorkflowCapabilitiesFromId(m.id);
      return caps.isImage || caps.isVideo || caps.isMultimodal;
    });
    setCustomModels((prev) => {
      const existingMap = new Map(prev.map((m) => [m.id, m]));
      useful.forEach((m) => {
        if (!existingMap.has(m.id)) {
          existingMap.set(m.id, gatewayModelToWorkflowModel(m) as WorkflowModel);
        }
      });
      const updated = Array.from(existingMap.values());
      const sorted = sortModelsByMultimodalPriority(updated);
      persistCustomModels(sorted);
      return sorted;
    });
    notifyModelsUpdated();
    return useful.length;
  };

  return {
    customModels,
    setCustomModels,
    modelSearch,
    setModelSearch,
    modelCapabilityFilter,
    setModelCapabilityFilter,
    comflyPrices,
    isFetchingPrices,
    handleSortByComflyPrice,
    handleToggleCapability,
    handleDeleteModel,
    handleMoveModel,
    handleReorderModels,
    handleResetDefaultModels,
    handleAddCustomModel,
    isGatewayModalOpen,
    setIsGatewayModalOpen,
    isFetchingGateway,
    allGatewayModels,
    lianchiModels,
    gatewaySource,
    isFetchingLianchi,
    handleOpenGatewayDiscovery,
    handleOpenLianchiDiscovery,
    handleToggleGatewayModel,
    handleAddAllUsefulGatewayModels,
    notifyModelsUpdated,
  };
}
